import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { saleQuote, sellPlayer } from '../src/game/transfers.js';
import { signingFee, recruitPlayer, recruitmentIssue } from '../src/game/roster.js';
import { createContract } from '../src/game/contracts.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { getAffiliations, getClubView } from '../src/game/world-selectors.js';
import { beginTeamTraining } from '../src/game/team-training.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { playerSale, rosterActions } from '../src/ui/roster-management.js';
import { clubScreen } from '../src/ui/screens.js';

const total = player => player.aim + player.intelligence + player.stamina;
function fixture(seed = 42, extra = true) {
  const world = createWorld(createClub('판매 검증').club, seed), club = world.clubs[0], player = world.players[0];
  const affiliations = getAffiliations(world);
  const reserve = world.players.filter(player => !affiliations.has(player.id) && !recruitmentIssue(club, player)).sort((a, b) => total(b) - total(a))[0];
  if (extra) assert.equal(recruitPlayer(world, reserve.id).ok, true);
  if (extra) club.contracts[reserve.id].acquiredDay = null; // 기존 보유 선수의 거래 규칙 검사
  return { world, club, player, reserve };
}

test('판매 견적은 금액·상대 선수보다 한 능력 우위·예산을 확인하고 세계를 바꾸지 않는다', () => {
  for (const seed of [0, 1, 42, 2026, 0xffffffff]) {
    const { world, club, player } = fixture(seed), before = structuredClone(world);
    const quote = saleQuote(world, player.id);
    assert.equal(quote.ok, true);
    assert.equal(quote.amount, Math.round(signingFee(player) * 1.5 / 100) * 100);
    for (const { buyer } of quote.offers) {
      assert.notEqual(buyer.id, club.id); assert.ok(buyer.balance >= quote.amount);
      assert.ok(buyer.playerIds.some(id => {
        const current = world.players.find(p => p.id === id);
        return ['aim', 'intelligence', 'stamina'].some(skill => player[skill] > current[skill]);
      }));
    }
    assert.deepEqual(world, before);
  }
});

test('주전 판매는 첫 후보로 보충하고 양 팀 금액·계약·자유계약 전환을 함께 보존한다', () => {
  const { world, club, player, reserve } = fixture();
  advanceDay(world);
  player.fatigue = 37; player.morale.happiness = 62; player.training.experience.aim = 27;
  const quote = saleQuote(world, player.id), { buyer } = quote.offers[0];
  const replacement = buyer.playerIds.map(id => world.players.find(p => p.id === id)).sort((a,b) => total(a) - total(b))[0];
  const before = structuredClone(world), slot = club.lineupIds.indexOf(player.id);
  const result = sellPlayer(world, player.id, buyer.id);
  assert.equal(result.ok, true); assert.equal(result.amount, quote.amount);
  assert.equal(club.balance, before.clubs[0].balance + quote.amount);
  assert.equal(buyer.balance, before.clubs.find(c => c.id === buyer.id).balance - quote.amount);
  assert.equal(club.playerIds.length, 5); assert.equal(club.lineupIds[slot], reserve.id);
  assert.equal(Object.hasOwn(club.contracts, player.id), false);
  assert.equal(buyer.playerIds.length, 5); assert.ok(buyer.lineupIds.includes(player.id));
  assert.equal(result.releasedPlayerId, replacement.id);
  assert.deepEqual(buyer.contracts[player.id], createContract(player, undefined, world.day));
  assert.equal(buyer.contracts[player.id].remainingDays, 84);
  assert.equal(Object.hasOwn(buyer.contracts, replacement.id), false);
  assert.equal(getAffiliations(world).has(replacement.id), false);
  assert.equal(getAffiliations(world).get(player.id).id, buyer.id);
  assert.equal(getAffiliations(world).size, getAffiliations(before).size - 1);
  assert.deepEqual(world.players, before.players);
  assert.deepEqual(club.finance, before.clubs[0].finance);
  assert.deepEqual(world.clubs.filter(c => c.id !== club.id && c.id !== buyer.id), before.clubs.filter(c => c.id !== club.id && c.id !== buyer.id));
  assert.equal(world.day, before.day); assert.equal(world.players.length, 600);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(world)))), world);
  const completed = structuredClone(world);
  assert.equal(sellPlayer(world, player.id, buyer.id).ok, false); assert.deepEqual(world, completed);
});

test('후보 판매는 내 주전 5명을 바꾸지 않고 발생 급여는 보존한다', () => {
  const { world, club, reserve } = fixture(); advanceDay(world);
  const before = structuredClone(world), quote = saleQuote(world, reserve.id);
  assert.equal(quote.ok, true); assert.equal(sellPlayer(world, reserve.id, quote.offers[0].buyer.id).ok, true);
  assert.deepEqual(club.lineupIds, before.clubs[0].lineupIds);
  const accrued = club.finance.accruedUnits;
  assert.equal(accrued, before.clubs[0].finance.accruedUnits);
  advanceDay(world);
  const payroll = Object.values(club.contracts).reduce((sum, contract) => sum + contract.monthlySalary, 0);
  assert.equal(club.finance.accruedUnits, accrued + payroll * 15);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('판매 수입은 미지급 급여·누적 급여·과거 정산을 지우지 않는다', () => {
  const { world, club, player } = fixture();
  Object.values(club.contracts).forEach(contract => { contract.monthlySalary = 4000; });
  club.balance = 0; advanceWeek(world);
  assert.ok(club.balance < 0); assert.equal(club.finance.arrears,0);
  const before = structuredClone(club.finance), quote = saleQuote(world, player.id);
  assert.equal(sellPlayer(world, player.id, quote.offers[0].buyer.id).ok, true);
  assert.deepEqual(club.finance, before);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('5명 이하·외부/자유계약/없는 선수·내 구단/없는 구매 구단은 변경 없이 거절한다', () => {
  const first = fixture(42, false), snapshot = structuredClone(first.world);
  assert.equal(sellPlayer(first.world, first.player.id, first.world.clubs[1].id).ok, false);
  assert.deepEqual(first.world, snapshot);
  const { world, club, player } = fixture(), affiliations = getAffiliations(world), before = structuredClone(world);
  for (const id of ['missing', world.clubs[1].playerIds[0], world.players.find(p => !affiliations.has(p.id)).id]) {
    assert.equal(saleQuote(world, id).ok, false); assert.equal(sellPlayer(world, id, world.clubs[1].id).ok, false);
  }
  for (const id of [club.id, 'missing', null, 0]) assert.equal(sellPlayer(world, player.id, id).ok, false);
  assert.deepEqual(world, before);
});

test('구매 예산 경계·우위 없는 선수는 거절하며 한 능력이 우위이면 구매한다', () => {
  const { world, player } = fixture(), quote = saleQuote(world, player.id), { buyer } = quote.offers[0];
  for (const club of world.clubs.slice(1)) club.balance = 0;
  assert.equal(saleQuote(world, player.id).ok, false);
  buyer.balance = quote.amount - 1; let before = structuredClone(world);
  assert.equal(sellPlayer(world, player.id, buyer.id).ok, false); assert.deepEqual(world, before);
  buyer.balance = quote.amount;
  assert.equal(saleQuote(world, player.id).offers.length, 1);
  for (const id of buyer.playerIds) {
    const current = world.players.find(p => p.id === id);
    current.aim = Math.max(current.aim, player.aim); current.intelligence = Math.max(current.intelligence, player.intelligence); current.stamina = Math.max(current.stamina, player.stamina);
  }
  before = structuredClone(world);
  assert.equal(saleQuote(world, player.id).ok, false); assert.equal(sellPlayer(world, player.id, buyer.id).ok, false); assert.deepEqual(world, before);
  const current = world.players.find(p => p.id === buyer.playerIds[0]);
  current.aim = 1;
  assert.equal(sellPlayer(world, player.id, buyer.id).ok, true);
});

test('견적 후 자금/소속 변경·판매자 금액 상한은 최신 조건으로 재확인한다', () => {
  const { world, club, player } = fixture(), quote = saleQuote(world, player.id), buyer = quote.offers[0].buyer;
  buyer.balance = quote.amount - 1; let before = structuredClone(world);
  assert.equal(sellPlayer(world, player.id, buyer.id).ok, false); assert.deepEqual(world, before);
  buyer.balance = quote.amount;
  club.balance = Number.MAX_SAFE_INTEGER - quote.amount + 1; before = structuredClone(world);
  assert.equal(sellPlayer(world, player.id, buyer.id).ok, false); assert.deepEqual(world, before);
  club.balance--;
  assert.equal(sellPlayer(world, player.id, buyer.id).ok, true); assert.equal(club.balance, Number.MAX_SAFE_INTEGER);
  assert.doesNotThrow(() => createSave(world));
});

test('진행 중 팀 훈련 참가자와 미해결 이벤트 대상은 보호하고 대상 아닌 후보는 판매할 수 있다', () => {
  const { world, player, reserve } = fixture();
  beginTeamTraining(world);
  const before = structuredClone(world);
  assert.equal(sellPlayer(world, player.id, world.clubs[1].id).ok, false); assert.deepEqual(world, before);
  const reserveQuote = saleQuote(world, reserve.id); assert.equal(reserveQuote.ok, true);
  assert.equal(sellPlayer(world, reserve.id, reserveQuote.offers[0].buyer.id).ok, true);
  assert.deepEqual(restoreWorld(createSave(world)), world);
  const other = fixture();
  other.world.playerEvents.week = { startedDay: 1, endDay: 8, teamTraining: false, event: { eventId: 'dating', day: 4, status: 'scheduled', playerId: null, roll: null } };
  assert.equal(advanceWeek(other.world, { events: true }).eventPending, true);
  other.world.playerEvents.week.event.playerId = other.player.id;
  const pending = structuredClone(other.world);
  assert.doesNotThrow(() => createSave(other.world));
  assert.equal(sellPlayer(other.world, other.player.id, other.world.clubs[1].id).ok, false); assert.deepEqual(other.world, pending);
  assert.equal(saleQuote(other.world, other.reserve.id).ok, true);
});

test('후보가 3명인 주전 판매는 명단 순서의 첫 후보만 올린다', () => {
  const { world, club, player, reserve } = fixture(), affiliations = getAffiliations(world);
  const candidates = world.players.filter(player => !affiliations.has(player.id)).sort((a,b) => signingFee(a) - signingFee(b));
  for (const candidate of candidates.slice(0, 2)) assert.equal(recruitPlayer(world, candidate.id).ok, true);
  const slot = club.lineupIds.indexOf(player.id), quote = saleQuote(world, player.id);
  assert.equal(sellPlayer(world, player.id, quote.offers[0].buyer.id).ok, true);
  assert.equal(club.lineupIds[slot], reserve.id); assert.equal(club.playerIds.length, 7);
  assert.doesNotThrow(() => createSave(world));
});

test('판매 화면은 구단 선택 없이 금액·불가 사유를 표시하고 선수 이름을 이스케이프한다', t => {
  const { world, player, reserve } = fixture(), quote = saleQuote(world, player.id);
  player.nickname = '<img src=x>'; quote.offers[0].buyer.name = '<script>bad</script>';
  const markup = playerSale(world, player);
  assert.doesNotMatch(markup, /data-sale-buyer|<select/); assert.match(markup, /data-action="sell-player"/);
  assert.ok(markup.includes(`$${quote.amount.toLocaleString('en-US')}`));
  assert.doesNotMatch(markup, /<img|<script|&lt;script&gt;/); assert.match(markup, /&lt;img/);
  assert.match(rosterActions(getClubView(world), reserve, world), /선수 판매/);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ innerHTML: '', querySelector: () => ({ textContent: '' }), classList: { add() {} }, querySelectorAll: () => [], addEventListener() {} }) } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  assert.doesNotMatch(clubScreen(getClubView(world), false, world).innerHTML, /data-sale-buyer/);
  const blocked = fixture(42, false);
  assert.match(playerSale(blocked.world, blocked.player), /판매 불가/);
  assert.match(playerSale(blocked.world, blocked.player), /5명/);
});

test('구단 지정 없이 현재 가능한 첫 구매 구단에 자동 판매하고 결과에 소속을 알린다', () => {
  const { world, player } = fixture(), quote = saleQuote(world, player.id), buyer = quote.offers[0].buyer;
  const result = sellPlayer(world, player.id);
  assert.equal(result.ok, true); assert.equal(result.buyerId, buyer.id);
  assert.ok(result.message.includes(buyer.name));
  assert.equal(getAffiliations(world).get(player.id).id, buyer.id);
  assert.deepEqual(restoreWorld(createSave(world)), world);
  const snapshot = structuredClone(world);
  assert.equal(sellPlayer(world, player.id).ok, false); assert.deepEqual(world, snapshot);
});

test('자동 판매는 현재 예산으로 다시 구단을 찾고 구매 구단이 없으면 변경하지 않는다', () => {
  const { world, player } = fixture(), quote = saleQuote(world, player.id);
  assert.ok(quote.offers.length > 1);
  quote.offers[0].buyer.balance = 0;
  const next = saleQuote(world, player.id).offers[0].buyer;
  assert.equal(sellPlayer(world, player.id).buyerId, next.id);
  const other = fixture(); other.world.clubs.slice(1).forEach(club => { club.balance = 0; });
  const snapshot = structuredClone(other.world);
  assert.equal(sellPlayer(other.world, other.player.id).ok, false);
  assert.deepEqual(other.world, snapshot);
});
