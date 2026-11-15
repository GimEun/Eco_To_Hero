import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { transferQuote, negotiateTransfer } from '../src/game/transfers.js';
import { signingFee, recruitPlayer, recruitmentIssue } from '../src/game/roster.js';
import { createContract } from '../src/game/contracts.js';
import { advanceDay } from '../src/game/calendar.js';
import { getAffiliations } from '../src/game/world-selectors.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';

const stats = player => player.aim + player.intelligence + player.stamina;
function fixture(seed = 42) {
  const world = createWorld(createClub('이적 검증').club, seed);
  const buyer = world.clubs[0], seller = world.clubs[1];
  const player = world.players.find(p => p.id === seller.playerIds[0]);
  return { world, buyer, seller, player };
}

test('견적은 평균 차이 10·가장 가까운 대체 선수와 기준 이적료를 결정하며 원본을 보존한다', () => {
  for (const seed of [0, 1, 42, 2026, 0xffffffff]) {
    const { world, player } = fixture(seed), before = structuredClone(world);
    const quote = transferQuote(world, player.id);
    assert.equal(quote.ok, true);
    assert.ok(Math.abs(stats(quote.replacement) - stats(player)) <= 30);
    const affiliations = getAffiliations(world);
    const seller = affiliations.get(player.id);
    const eligible = world.players.filter(p => !affiliations.has(p.id) && !recruitmentIssue(seller, p) && Math.abs(stats(p) - stats(player)) <= 30);
    const closest = Math.min(...eligible.map(p => Math.abs(stats(p) - stats(player))));
    assert.equal(Math.abs(stats(quote.replacement) - stats(player)), closest);
    assert.equal(quote.replacementFee, signingFee(quote.replacement));
    assert.equal(quote.askingPrice, Math.max(Math.round(signingFee(player) * 1.5 / 100) * 100, quote.replacementFee));
    assert.deepEqual(quote.offers.map(o => o.amount), [quote.askingPrice * 0.8, quote.askingPrice, quote.askingPrice * 1.2]);
    assert.equal(transferQuote(world, player.id).replacement.id, quote.replacement.id);
    assert.deepEqual(world, before);
  }
});

test('80% 제안은 거절하고 자금·명단·계약·급여·선수 능력을 변경하지 않는다', () => {
  const { world, player } = fixture(), before = structuredClone(world);
  assert.equal(negotiateTransfer(world, player.id, 80).ok, false);
  assert.deepEqual(world, before);
});

test('100% 수락은 추가 계약금 없이 후보·90일 계약으로 영입하고 원 구단 주전/계약을 대체한다', () => {
  const { world, buyer, seller, player } = fixture();
  advanceDay(world);
  const quote = transferQuote(world, player.id), before = structuredClone(world);
  const index = seller.lineupIds.indexOf(player.id);
  assert.equal(negotiateTransfer(world, player.id, 100).ok, true);
  assert.equal(buyer.balance, before.clubs[0].balance - quote.askingPrice);
  assert.equal(seller.balance, before.clubs[1].balance + quote.askingPrice - quote.replacementFee);
  assert.equal(buyer.playerIds.length, 6);
  assert.ok(buyer.playerIds.includes(player.id));
  assert.deepEqual(buyer.lineupIds, before.clubs[0].lineupIds);
  assert.deepEqual(buyer.contracts[player.id], createContract(player, undefined, world.day));
  assert.equal(seller.playerIds.length, 5);
  assert.equal(seller.lineupIds[index], quote.replacement.id);
  assert.deepEqual(seller.contracts[quote.replacement.id], createContract(quote.replacement, undefined, world.day));
  assert.equal(Object.hasOwn(seller.contracts, player.id), false);
  assert.equal(getAffiliations(world).get(player.id).id, buyer.id);
  assert.equal(getAffiliations(world).get(quote.replacement.id).id, seller.id);
  assert.deepEqual(buyer.finance, before.clubs[0].finance);
  assert.deepEqual(world.players, before.players);
  assert.deepEqual(world.clubs.slice(2), before.clubs.slice(2));
  assert.equal(world.day, before.day);
  assert.equal(world.players.length, 600);
  assert.equal(getAffiliations(world).size, 291);
  const accrued = buyer.finance.accruedUnits;
  advanceDay(world);
  const payroll = Object.values(buyer.contracts).reduce((sum, c) => sum + c.monthlySalary, 0);
  assert.equal(buyer.finance.accruedUnits, accrued + payroll * 15);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(world)))), world);
});

test('120%는 실제 제안 금액을 지불하고 같은 선수 반복 구매는 거절한다', () => {
  const { world, buyer, seller, player } = fixture();
  const quote = transferQuote(world, player.id), oldBuyer = buyer.balance, oldSeller = seller.balance;
  const offer = quote.offers.find(o => o.rate === 120).amount;
  assert.equal(negotiateTransfer(world, player.id, 120).ok, true);
  assert.equal(buyer.balance, oldBuyer - offer);
  assert.equal(seller.balance, oldSeller + offer - quote.replacementFee);
  const after = structuredClone(world);
  assert.equal(negotiateTransfer(world, player.id, 120).ok, false);
  assert.deepEqual(world, after);
});

test('잘못된 비율·자유계약·내 선수·존재하지 않는 선수 제안은 원본을 보존한다', () => {
  const { world, player } = fixture(), before = structuredClone(world);
  for (const rate of [0, 99, 101, 200, '100', null, NaN]) assert.equal(negotiateTransfer(world, player.id, rate).ok, false);
  const affiliations = getAffiliations(world);
  for (const id of ['missing', world.clubs[0].playerIds[0], world.players.find(p => !affiliations.has(p.id)).id]) assert.equal(negotiateTransfer(world, id, 100).ok, false);
  assert.deepEqual(world, before);
});

test('자금 부족·명단 8명·상대 자금 상한은 거래 전체를 거절한다', () => {
  const { world, buyer, player } = fixture();
  const quote = transferQuote(world, player.id);
  buyer.balance = quote.askingPrice - 1;
  let before = structuredClone(world);
  assert.equal(negotiateTransfer(world, player.id, 100).ok, false);
  assert.deepEqual(world, before);
  buyer.balance = 100000;
  const affiliations = getAffiliations(world);
  const free = world.players.filter(p => !affiliations.has(p.id)).sort((a, b) => signingFee(a) - signingFee(b));
  for (const p of free.slice(0, 3)) recruitPlayer(world, p.id);
  before = structuredClone(world);
  assert.equal(negotiateTransfer(world, player.id, 100).ok, false);
  assert.deepEqual(world, before);
  const other = fixture();
  other.seller.balance = Number.MAX_SAFE_INTEGER;
  before = structuredClone(other.world);
  assert.equal(negotiateTransfer(other.world, other.player.id, 100).ok, false);
  assert.deepEqual(other.world, before);
});

test('대체 선수가 없으면 거절하며 평균 차이 10의 경계는 허용한다', () => {
  const { world, player } = fixture();
  const affiliations = getAffiliations(world);
  const free = world.players.filter(p => !affiliations.has(p.id));
  free.forEach(p => { p.aim = p.intelligence = p.stamina = 99; });
  let before = structuredClone(world);
  assert.equal(transferQuote(world, player.id).ok, false);
  assert.equal(negotiateTransfer(world, player.id, 100).ok, false);
  assert.deepEqual(world, before);
  player.aim = player.intelligence = player.stamina = 40;
  const replacement = free[0];
  replacement.aim = replacement.intelligence = replacement.stamina = 50;
  assert.equal(transferQuote(world, player.id).ok, true);
  replacement.stamina = 51;
  before = structuredClone(world);
  assert.equal(negotiateTransfer(world, player.id, 100).ok, false);
  assert.deepEqual(world, before);
});

test('대체 영입비가 기본 이적료보다 높으면 그 비용까지 기준을 올려 원 구단 5명을 유지한다', () => {
  const { world, player, seller } = fixture();
  const affiliations = getAffiliations(world);
  const free = world.players.filter(p => !affiliations.has(p.id));
  free.forEach(p => { p.aim = p.intelligence = p.stamina = 99; });
  player.aim = player.intelligence = player.stamina = 20;
  const replacement = free[0];
  replacement.aim = replacement.intelligence = replacement.stamina = 30;
  const quote = transferQuote(world, player.id);
  assert.equal(quote.askingPrice, 1800);
  const balance = seller.balance;
  assert.equal(negotiateTransfer(world, player.id, 100).ok, true);
  assert.equal(seller.balance, balance);
  assert.equal(seller.playerIds.length, 5);
});

test('견적 이후 대체 선수가 먼저 영입되면 제안 시 현재 자유계약 명단으로 다시 계산한다', () => {
  const { world, player, seller } = fixture();
  const original = transferQuote(world, player.id);
  assert.equal(recruitPlayer(world, original.replacement.id).ok, true);
  const fresh = transferQuote(world, player.id);
  assert.equal(fresh.ok, true);
  assert.notEqual(fresh.replacement.id, original.replacement.id);
  assert.equal(negotiateTransfer(world, player.id, 100).ok, true);
  assert.ok(seller.playerIds.includes(fresh.replacement.id));
  assert.equal(new Set(world.clubs.flatMap(c => c.playerIds)).size, 292);
});

test('대체 선수 ID가 특수 객체 키여도 계약과 저장을 안전하게 유지한다', () => {
  const { world, player, seller } = fixture();
  transferQuote(world, player.id).replacement.id = '__proto__';
  assert.equal(negotiateTransfer(world, player.id, 100).ok, true);
  assert.ok(Object.hasOwn(seller.contracts, '__proto__'));
  assert.equal({}.durationDays, undefined);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});
