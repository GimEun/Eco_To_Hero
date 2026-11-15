import { bankruptcyIssue } from './bankruptcy.js';
import { TRANSFER_RULES } from '../config/transfers.js';
import { ROSTER_RULES, aiRosterMaximum } from '../config/roster.js';
import { signingFee } from './player-costs.js';
import { createContract } from './contracts.js';
import { getAffiliations } from './world-selectors.js';
import { releasePlayer, recruitmentIssue } from './roster.js';
import { CONTRACT_RULES } from '../config/contracts.js';
import { recruitmentWindowIssue } from './season-calendar.js';

const totalStats = player => player.aim + player.intelligence + player.stamina;
const transferPrice = player => Math.round(signingFee(player) * TRANSFER_RULES.priceMultiplier / TRANSFER_RULES.priceStep) * TRANSFER_RULES.priceStep;
const strongestLineup = (ids, players) => [...ids].sort((a, b) => totalStats(players.get(b)) - totalStats(players.get(a))).slice(0, ROSTER_RULES.starters);

export function transferQuote(world, playerId, affiliations = getAffiliations(world)) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  const player = world.players.find(player => player.id === playerId);
  const seller = affiliations.get(playerId);
  if (!player || !seller || seller.id === world.playerClubId) return { ok: false, message: '다른 구단 소속 선수만 이적 협상을 할 수 있습니다.' };
  const basePrice = transferPrice(player);
  const windowIssue = recruitmentWindowIssue(world);
  if (windowIssue) return { ok: false, askingPrice: basePrice, message: windowIssue };
  const buyer = world.clubs.find(club => club.id === world.playerClubId);
  const issue = recruitmentIssue(buyer, player);
  if (issue) return { ok: false, askingPrice: basePrice, message: issue };
  const targetStats = totalStats(player);
  const candidates = world.players.filter(candidate => !affiliations.has(candidate.id)
    && !recruitmentIssue(seller, candidate) && Math.abs(totalStats(candidate) - targetStats) <= TRANSFER_RULES.maximumAverageGap * 3);
  candidates.sort((a, b) => Math.abs(totalStats(a) - targetStats) - Math.abs(totalStats(b) - targetStats) || signingFee(a) - signingFee(b));
  const replacement = candidates[0];
  if (!replacement) return { ok: false, askingPrice: basePrice, message: '상대 구단이 영입 기준에 맞는 비슷한 능력의 대체 선수를 구할 수 없어 협상을 거절합니다.' };
  const replacementFee = signingFee(replacement);
  const askingPrice = Math.max(basePrice, replacementFee);
  const offers = TRANSFER_RULES.offerRates.map(rate => ({ rate, amount: askingPrice * rate / 100 }));
  return { ok: true, player, seller, replacement, replacementFee, askingPrice, offers };
}

export function negotiateTransfer(world, playerId, rate) {
  if (!TRANSFER_RULES.offerRates.includes(rate)) return { ok: false, message: '이적 제안은 80%·100%·120% 중 선택하세요.' };
  const quote = transferQuote(world, playerId);
  if (!quote.ok) return quote;
  const { player, seller, replacement, replacementFee, askingPrice } = quote;
  const buyer = world.clubs.find(club => club.id === world.playerClubId);
  if (buyer.playerIds.length >= ROSTER_RULES.maximum) return { ok: false, message: '주전·후보를 합쳐 최대 8명까지 보유할 수 있습니다.' };
  const amount = quote.offers.find(offer => offer.rate === rate).amount;
  if (buyer.balance < amount) return { ok: false, message: '제안한 이적료를 지불할 구단 자금이 부족합니다.' };
  if (amount < askingPrice) return { ok: false, message: `상대 구단이 거절했습니다. 기준 이적료 $${askingPrice.toLocaleString('en-US')} 이상을 제안하세요.` };
  const sellerBalance = BigInt(seller.balance) + BigInt(amount) - BigInt(replacementFee);
  if (sellerBalance > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, message: '상대 구단 자금이 저장 가능한 범위를 넘어 거래할 수 없습니다.' };
  const contract = createContract(player, undefined, world.day), replacementContract = createContract(replacement, undefined, world.day);
  // 제안 시점의 세계에서 조건을 다시 확인한 뒤 양 구단을 함께 갱신한다.
  seller.playerIds = seller.playerIds.map(id => id === playerId ? replacement.id : id);
  seller.lineupIds = seller.lineupIds.map(id => id === playerId ? replacement.id : id);
  delete seller.contracts[playerId];
  seller.contracts = { ...seller.contracts, [replacement.id]: replacementContract };
  if (seller.playerIds.length > ROSTER_RULES.starters) seller.lineupIds = strongestLineup(seller.playerIds, new Map(world.players.map(player => [player.id, player])));
  seller.balance = Number(sellerBalance);
  buyer.balance -= amount;
  buyer.playerIds.push(playerId);
  buyer.contracts = { ...buyer.contracts, [playerId]: contract };
  return { ok: true, message: `${player.nickname} 이적 성사 · 이적료 $${amount.toLocaleString('en-US')} · 별도 계약금 없음 · 후보 등록·12주 계약` };
}

export function saleQuote(world, playerId) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  const seller = world.clubs.find(club => club.id === world.playerClubId);
  const player = world.players.find(player => player.id === playerId);
  if (!player || !seller?.playerIds.includes(playerId)) return { ok: false, message: '내 구단 소속 선수만 판매할 수 있습니다.' };
  const amount = transferPrice(player);
  const unavailable = message => ({ ok: false, amount, message });
  if (world.playerEvents.week?.event?.status === 'pending' && world.playerEvents.week.event.playerId === playerId) return unavailable('이벤트를 선택한 뒤 대상 선수를 판매하세요.');
  if (world.teamTraining?.status === 'pending' && world.teamTraining.playerIds.includes(playerId)) return unavailable('팀 훈련을 마친 뒤 참가 선수를 판매하세요.');
  const acquiredDay = seller.contracts[playerId].acquiredDay;
  const remainingDays = acquiredDay === null ? 0 : Math.max(0, CONTRACT_RULES.saleHoldingDays - (world.day - acquiredDay));
  if (remainingDays > 0) return { ...unavailable(`영입 후 8주가 지나야 판매할 수 있습니다. 판매 가능까지 ${Math.ceil(remainingDays / 7)}주`), remainingDays };
  if (seller.playerIds.length <= ROSTER_RULES.starters) return unavailable('판매 후에도 경기에 참가할 선수 5명을 유지해야 합니다.');
  if (BigInt(seller.balance) + BigInt(amount) > BigInt(Number.MAX_SAFE_INTEGER)) return unavailable('판매 수입이 저장 가능한 구단 자금 범위를 넘습니다.');
  const players = new Map(world.players.map(player => [player.id, player]));
  const offers = [];
  let interested = 0;
  for (const buyer of world.clubs) {
    if (buyer.id === seller.id) continue;
    if (recruitmentIssue(buyer, player)) continue;
    const improves = buyer.playerIds.some(id => ['aim', 'intelligence', 'stamina'].some(skill => player[skill] > players.get(id)[skill]));
    if (!improves) continue;
    interested++;
    if (buyer.balance >= amount) offers.push({ buyer });
  }
  if (!offers.length) return unavailable(interested ? '관심 있는 구단이 이적료를 지불할 자금이 부족합니다.' : '상대 선수보다 높은 능력이 있는 구매 구단이 없습니다.');
  return { ok: true, player, seller, amount, offers };
}

export function sellPlayer(world, playerId, buyerId) {
  const quote = saleQuote(world, playerId);
  if (!quote.ok) return quote;
  const offer = buyerId === undefined ? quote.offers[0] : quote.offers.find(offer => offer.buyer.id === buyerId);
  if (!offer) return { ok: false, message: '현재 구매 가능한 구단이 아닙니다. 구단 자금과 선수 조건을 다시 확인해 주세요.' };
  const { player, seller, amount } = quote;
  const { buyer } = offer;
  const players = new Map(world.players.map(player => [player.id, player]));
  const ranked = [...buyer.playerIds].sort((a, b) => totalStats(players.get(a)) - totalStats(players.get(b)));
  const releasedPlayerId = buyer.playerIds.length >= aiRosterMaximum(buyer) ? ranked[0] : null;
  const roster = [...buyer.playerIds.filter(id => id !== releasedPlayerId), playerId];
  const lineup = strongestLineup(roster, players);
  const contract = createContract(player, undefined, world.day);
  const buyerContracts = { ...buyer.contracts, [playerId]: contract };
  if (releasedPlayerId !== null) delete buyerContracts[releasedPlayerId];
  // 최신 조건과 계약을 모두 확인한 뒤 공용 명단 해제를 사용해 한 번에 거래한다.
  const result = releasePlayer(world, playerId);
  if (!result.ok) return result;
  seller.balance += amount;
  buyer.balance -= amount;
  buyer.playerIds = roster;
  buyer.lineupIds = lineup;
  buyer.contracts = buyerContracts;
  return { ok: true, amount, buyerId: buyer.id, releasedPlayerId,
    message: `${player.nickname} 판매 완료 · ${buyer.name} · $${amount.toLocaleString('en-US')} · 12주 계약 · 상대 구단이 주전·후보를 편성했습니다.${releasedPlayerId !== null ? ` ${players.get(releasedPlayerId).nickname} 자유계약 전환` : ''}` };
}
