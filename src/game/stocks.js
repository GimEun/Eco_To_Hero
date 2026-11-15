import { randomUnit } from './random.js';
import { bankruptcyIssue } from './bankruptcy.js';
import { FINANCE_RULES } from '../config/finance.js';
import { STOCK_NEWS_ODDS, STOCK_NEWS, createStockSignals } from './stock-news.js';

export const STOCKS = Object.freeze([
  Object.freeze({ id: 'corechip', name: '코어칩', sector: '반도체', initial: 100, range: 5 }),
  Object.freeze({ id: 'nextgear', name: '넥스트기어', sector: '게이밍 장비', initial: 50, range: 8 }),
  Object.freeze({ id: 'streamwave', name: '스트림웨이브', sector: '방송 플랫폼', initial: 80, range: 10 }),
  Object.freeze({ id: 'arenaworks', name: '아레나웍스', sector: '게임 개발', initial: 40, range: 15 }),
  Object.freeze({ id: 'novalabs', name: '노바랩스', sector: '신생 기술 기업', initial: 20, range: 25 }),
]);
export const STOCK_RULES = Object.freeze({ historyLimit: 12, tradeLimit: 20 });
const safe = value => Number.isSafeInteger(value);
const unsigned = value => safe(value) && value >= 0;
const max = BigInt(Number.MAX_SAFE_INTEGER);
const feeFor = gross => (gross + 99n) / 100n;
const allocatedBasis = (basis, quantity, held) => (BigInt(basis) * BigInt(quantity) + BigInt(Math.floor(held / 2))) / BigInt(held);
export const stockPrice = (market, id) => market.history.at(-1).prices[id];
export function createStockExtras(seed, market) {
  const random = { randomState: (seed ^ market.startedDay ^ 0x67726170) >>> 0 };
  let prices = market.history[0].prices;
  const prehistory = [];
  for (let i = 0; i < 3; i++) {
    prices = Object.fromEntries(STOCKS.map(stock => {
      const change = Math.floor(randomUnit(random) * (stock.range * 2 + 1)) - stock.range;
      const divisor = BigInt(100 + change);
      const price = (BigInt(prices[stock.id]) * 100n + divisor / 2n) / divisor;
      return [stock.id, Number(price < 1n ? 1n : price > max ? max : price)];
    }));
    prehistory.unshift(prices);
  }
  const newsRandom = { randomState: (seed ^ market.lastUpdatedDay ^ 0x6e657773) >>> 0 };
  const signals = createStockSignals(newsRandom);
  return { prehistory, signals, newsRandomState: newsRandom.randomState };
}
export function stockHistoryRows(market) {
  const rows = [...market.prehistory.map(prices => ({ prices, reference: true })), ...market.history.map(entry => ({ ...entry, reference: false }))].slice(-12);
  return rows.map((row, index) => ({ ...row, label: index === rows.length - 1 ? '현재' : `${rows.length - 1 - index}주 전` }));
}
export function createStockMarket(seed, day = 1) {
  const market = { startedDay: day, lastUpdatedDay: day, randomState: (seed ^ 0x73746f63) >>> 0,
    history: [{ day, prices: Object.fromEntries(STOCKS.map(stock => [stock.id, stock.initial])) }],
    positions: Object.fromEntries(STOCKS.map(stock => [stock.id, { quantity: 0, costBasisCents: 0 }])),
    realizedProfitCents: 0, trades: [] };
  return { ...market, ...createStockExtras(seed, market) };
}
export function nextStockWeek(market, day, weeklyStartedDay) {
  if ((day - weeklyStartedDay) % FINANCE_RULES.periodDays !== 0 || day <= market.lastUpdatedDay) return market;
  const random = { randomState: market.randomState };
  const prices = Object.fromEntries(STOCKS.map(stock => {
    const odds = STOCK_NEWS_ODDS[market.signals[stock.id].tone];
    const roll = Math.floor(randomUnit(random) * 100);
    const direction = roll < odds.up ? 1 : roll < odds.up + odds.flat ? 0 : -1;
    const change = direction * (1 + Math.floor(randomUnit(random) * stock.range));
    const price = (BigInt(stockPrice(market, stock.id)) * BigInt(100 + change) + 50n) / 100n;
    return [stock.id, Number(price < 1n ? 1n : price > max ? max : price)];
  }));
  const newsRandom = { randomState: market.newsRandomState }, signals = createStockSignals(newsRandom);
  return { ...market, signals, newsRandomState: newsRandom.randomState, lastUpdatedDay: day, randomState: random.randomState,
    history: [...market.history, { day, prices }].slice(-STOCK_RULES.historyLimit) };
}
export function stockTradingIssue({ finance, day, weekDaysRemaining, playerEvents, teamTrainingPending }) {
  if ((day - finance.weeklyStartedDay) % FINANCE_RULES.periodDays !== 0 || weekDaysRemaining || playerEvents.week || teamTrainingPending) {
    return '진행 중인 일정·이벤트·팀 훈련을 마친 뒤 새 주 시작에 주식을 거래하세요.';
  }
  return null;
}
export function tradeStock(world, stockId, kind, quantity) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  const stock = STOCKS.find(stock => stock.id === stockId);
  if (!stock || !['buy', 'sell'].includes(kind) || !safe(quantity) || quantity < 1) return { ok: false, message: '종목과 거래할 정수 수량(1주 이상)을 확인하세요.' };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  const issue = stockTradingIssue({ ...world, ...club, teamTrainingPending: world.teamTraining?.status === 'pending' });
  if (issue) return { ok: false, message: issue };
  const market = world.stocks, held = market.positions[stockId], price = stockPrice(market, stockId);
  const gross = BigInt(price) * BigInt(quantity), fee = feeFor(gross);
  if (kind === 'buy' && BigInt(club.balance) < gross + fee) return { ok: false, message: '매수 금액과 수수료를 지불할 자금이 부족합니다.' };
  if (kind === 'sell' && held.quantity < quantity) return { ok: false, message: '보유 수량 안에서 매도하세요.' };
  const basisRemoved = kind === 'sell' ? allocatedBasis(held.costBasisCents, quantity, held.quantity) : 0n;
  const profit = kind === 'sell' ? (gross - fee) * 100n - basisRemoved : 0n;
  const balance = BigInt(club.balance) + (kind === 'buy' ? -(gross + fee) : gross - fee);
  const costBasis = BigInt(held.costBasisCents) + (kind === 'buy' ? (gross + fee) * 100n : -basisRemoved);
  const positionQuantity = BigInt(held.quantity) + BigInt(kind === 'buy' ? quantity : -quantity);
  const realized = BigInt(market.realizedProfitCents) + profit;
  if ([gross, fee, costBasis, positionQuantity].some(value => value < 0n || value > max)
    || [balance, realized, profit].some(value => value < -max || value > max)) return { ok: false, message: '거래 금액·수량·손익이 저장 가능한 범위를 넘습니다.' };
  const receipt = { day: world.day, stockId, kind, quantity, price, fee: Number(fee), balance: Number(balance),
    positionQuantity: Number(positionQuantity), costBasisCents: Number(costBasis), basisRemovedCents: Number(basisRemoved),
    profitCents: Number(profit), realizedProfitCents: Number(realized) };
  club.balance = receipt.balance;
  world.stocks = { ...market, positions: { ...market.positions, [stockId]: { quantity: receipt.positionQuantity, costBasisCents: receipt.costBasisCents } },
    realizedProfitCents: receipt.realizedProfitCents, trades: [...market.trades, receipt].slice(-STOCK_RULES.tradeLimit) };
  return { ok: true, message: `${stock.name} ${quantity.toLocaleString('en-US')}주 ${kind === 'buy' ? '매수' : '매도'} 완료 · 수수료 $${receipt.fee.toLocaleString('en-US')}` };
}

export function validateStockMarket(market, day, weeklyStartedDay, { legacySignals = false, seed = 0 } = {}) {
  const fail = () => { throw new Error('주식 가격·보유·거래 정보가 올바르지 않습니다.'); };
  const exact = value => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === STOCKS.length && STOCKS.every(stock => Object.hasOwn(value, stock.id));
  if (!market || !safe(market.startedDay) || market.startedDay < weeklyStartedDay || market.startedDay > day
    || !Number.isInteger(market.randomState) || market.randomState < 0 || market.randomState > 0xffffffff
    || !safe(market.realizedProfitCents) || !Array.isArray(market.history) || !exact(market.positions)
    || !Array.isArray(market.trades) || market.trades.length > STOCK_RULES.tradeLimit) fail();
  const firstCycle = Math.floor((market.startedDay - weeklyStartedDay) / 7);
  const updates = Math.floor((day - weeklyStartedDay) / 7) - firstCycle;
  if (market.history.length !== Math.min(updates + 1, STOCK_RULES.historyLimit)) fail();
  const history = market.history.map((entry, index) => {
    const cycle = updates + 1 - market.history.length + index;
    const expectedDay = cycle === 0 ? market.startedDay : weeklyStartedDay + (firstCycle + cycle) * 7;
    if (!entry || entry.day !== expectedDay || !exact(entry.prices) || STOCKS.some(stock => !safe(entry.prices[stock.id]) || entry.prices[stock.id] < 1)) fail();
    if (cycle === 0 && STOCKS.some(stock => entry.prices[stock.id] !== stock.initial)) fail();
    if (index > 0 && STOCKS.some(stock => {
      const before = BigInt(market.history[index - 1].prices[stock.id]), after = BigInt(entry.prices[stock.id]);
      const low = (before * BigInt(100 - stock.range) + 50n) / 100n, high = (before * BigInt(100 + stock.range) + 50n) / 100n;
      return after < (low < 1n ? 1n : low) || after > high;
    })) fail();
    return { day: entry.day, prices: Object.fromEntries(STOCKS.map(stock => [stock.id, entry.prices[stock.id]])) };
  });
  if (market.lastUpdatedDay !== history.at(-1).day) fail();
  const positions = Object.fromEntries(STOCKS.map(stock => {
    const position = market.positions[stock.id];
    if (!position || typeof position !== 'object' || Array.isArray(position) || !unsigned(position.quantity) || !unsigned(position.costBasisCents)
      || (position.quantity === 0 ? position.costBasisCents !== 0 : BigInt(position.costBasisCents) < BigInt(position.quantity) * 100n)) fail();
    return [stock.id, { quantity: position.quantity, costBasisCents: position.costBasisCents }];
  }));
  let previous = null;
  const lastPositions = new Map();
  const tradeKeys = ['day', 'stockId', 'kind', 'quantity', 'price', 'fee', 'balance', 'positionQuantity', 'costBasisCents', 'basisRemovedCents', 'profitCents', 'realizedProfitCents'];
  const trades = market.trades.map(entry => {
    if (!entry || !STOCKS.some(stock => stock.id === entry.stockId) || !['buy', 'sell'].includes(entry.kind)
      || !safe(entry.day) || entry.day < market.startedDay || entry.day > day || (entry.day - weeklyStartedDay) % 7 !== 0 || previous && entry.day < previous.day
      || ['quantity','price'].some(key => !safe(entry[key]) || entry[key] < 1)
      || ['fee','positionQuantity','costBasisCents','basisRemovedCents'].some(key => !unsigned(entry[key]))
      || ['balance','profitCents','realizedProfitCents'].some(key => !safe(entry[key])) || entry.balance <= -10000 || entry.kind === 'buy' && entry.balance < 0) fail();
    const gross = BigInt(entry.quantity) * BigInt(entry.price), fee = feeFor(gross);
    const beforeQuantity = BigInt(entry.positionQuantity) + BigInt(entry.kind === 'buy' ? -entry.quantity : entry.quantity);
    const beforeBasis = BigInt(entry.costBasisCents) + (entry.kind === 'buy' ? -(gross + fee) * 100n : BigInt(entry.basisRemovedCents));
    if (gross > max || BigInt(entry.fee) !== fee || beforeQuantity < 0n || beforeQuantity > max || beforeBasis < 0n || beforeBasis > max
      || (beforeQuantity === 0n ? beforeBasis !== 0n : beforeBasis < beforeQuantity * 100n)
      || (entry.positionQuantity === 0 ? entry.costBasisCents !== 0 : BigInt(entry.costBasisCents) < BigInt(entry.positionQuantity) * 100n)) fail();
    const removed = entry.kind === 'sell' ? allocatedBasis(Number(beforeBasis), entry.quantity, Number(beforeQuantity)) : 0n;
    const profit = entry.kind === 'sell' ? (gross - fee) * 100n - removed : 0n;
    if (BigInt(entry.basisRemovedCents) !== removed || BigInt(entry.profitCents) !== profit) fail();
    const prior = lastPositions.get(entry.stockId);
    if (prior && (BigInt(prior.positionQuantity) !== beforeQuantity || BigInt(prior.costBasisCents) !== beforeBasis)) fail();
    if (!prior && market.trades.length < STOCK_RULES.tradeLimit && (beforeQuantity !== 0n || beforeBasis !== 0n)) fail();
    if (previous ? BigInt(entry.realizedProfitCents) !== BigInt(previous.realizedProfitCents) + profit
      : market.trades.length < STOCK_RULES.tradeLimit && BigInt(entry.realizedProfitCents) !== profit) fail();
    const priceAtTrade = history.find(snapshot => snapshot.day === entry.day)?.prices[entry.stockId];
    if (priceAtTrade !== undefined && entry.price !== priceAtTrade) fail();
    previous = entry; lastPositions.set(entry.stockId, entry);
    return Object.fromEntries(tradeKeys.map(key => [key, entry[key]]));
  });
  if (market.realizedProfitCents !== (previous?.realizedProfitCents ?? 0)) fail();
  for (const stock of STOCKS) {
    const last = lastPositions.get(stock.id), position = positions[stock.id];
    if (last ? last.positionQuantity !== position.quantity || last.costBasisCents !== position.costBasisCents : trades.length < STOCK_RULES.tradeLimit && position.quantity !== 0) fail();
  }
  const result = { startedDay: market.startedDay, lastUpdatedDay: market.lastUpdatedDay, randomState: market.randomState, history, positions, realizedProfitCents: market.realizedProfitCents, trades };
  if (legacySignals) return { ...result, ...createStockExtras(seed, result) };
  if (!Number.isInteger(market.newsRandomState) || market.newsRandomState < 0 || market.newsRandomState > 0xffffffff
    || !Array.isArray(market.prehistory) || market.prehistory.length !== 3
    || market.prehistory.some(prices => !exact(prices) || STOCKS.some(stock => !safe(prices[stock.id]) || prices[stock.id] < 1)) || !exact(market.signals)) fail();
  const signals = Object.fromEntries(STOCKS.map(stock => {
    const signal = market.signals[stock.id];
    if (!signal || typeof signal !== 'object' || Array.isArray(signal) || !Object.hasOwn(STOCK_NEWS_ODDS, signal.tone)
      || !Number.isInteger(signal.variant) || signal.variant < 0 || signal.variant >= STOCK_NEWS[stock.id][signal.tone].length) fail();
    return [stock.id, { tone: signal.tone, variant: signal.variant }];
  }));
  return { ...result, prehistory: market.prehistory.map(prices => Object.fromEntries(STOCKS.map(stock => [stock.id, prices[stock.id]]))), signals, newsRandomState: market.newsRandomState };
}
