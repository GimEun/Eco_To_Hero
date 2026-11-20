import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { renewContract } from '../src/game/contracts.js';
import { recruitPlayer, releasePlayer, signingFee } from '../src/game/roster.js';
import { getAffiliations, getClubView } from '../src/game/world-selectors.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { financePanel } from '../src/ui/finance-panel.js';
import { useDailySchema } from './legacy-fixture.js';

function fixture() {
  const world = createWorld(createClub('재정 검증').club, 42), club = world.clubs[0];
  club.playerIds.forEach(id => renewContract(world, id, 168));
  const assigned = getAffiliations(world);
  const free = world.players.filter(p => !assigned.has(p.id)).sort((a, b) => signingFee(a) - signingFee(b));
  return { world, club, free };
}
function days(world, count) { for (let i = 0; i < count; i++) assert.equal(advanceDay(world).ok, true); }
const monthly = club => Object.values(club.contracts).reduce((sum, c) => sum + c.monthlySalary, 0);

test('매주 스폰서 1250과 기존 월급 1/4을 정산하고 AI 구단은 유지한다', () => {
  const { world, club } = fixture(), before = structuredClone(world), payroll = monthly(club);
  days(world, 6);
  assert.equal(club.finance.accruedUnits, payroll * 6 * 15);
  assert.equal(club.balance, before.clubs[0].balance);
  assert.equal(club.finance.settlements.length, 0);
  days(world, 1);
  assert.equal(world.day, 8);
  assert.equal(club.finance.accruedUnits, (payroll * 105) % 420);
  assert.equal(club.balance, before.clubs[0].balance + 1250 - Math.floor(payroll / 4));
  assert.equal(club.finance.settlements[0].wagesDue, Math.floor(payroll / 4));
  assert.deepEqual(world.clubs.slice(1), before.clubs.slice(1));
  const restored = restoreWorld(parseBackup(JSON.stringify(createSave(world))));
  days(restored, 1);
  assert.equal(restored.clubs[0].finance.settlements.length, 1);
  assert.equal(restored.clubs[0].balance, club.balance);
});

test('중간 영입·후보 근무·방출은 실제 근무 기간과 분수 급여를 보존한다', () => {
  const { world, club, free } = fixture(), base = monthly(club);
  days(world, 2); recruitPlayer(world, free[0].id);
  const extra = club.contracts[free[0].id].monthlySalary;
  days(world, 3); releasePlayer(world, free[0].id);
  days(world, 2);
  const units = base * 105 + extra * 45;
  assert.equal(club.finance.settlements[0].wagesDue, Math.floor(units / 420));
  assert.equal(club.finance.accruedUnits, units % 420);
  const carry = club.finance.accruedUnits;
  days(world, 7);
  assert.equal(club.finance.settlements[1].wagesDue, Math.floor((carry + base * 105) / 420));
  assert.equal(club.finance.accruedUnits, (carry + base * 105) % 420);
});

test('정산 시 만료되는 선수도 마지막 근무 급여를 계산한다', () => {
  const { world, club, free } = fixture(); recruitPlayer(world, free[0].id);
  const payroll = monthly(club);
  club.contracts[free[0].id].remainingDays = 7;
  days(world, 7);
  assert.equal(getAffiliations(world).has(free[0].id), false);
  assert.equal(club.finance.settlements[0].wagesDue, Math.floor(payroll / 4));
  assert.equal(club.playerIds.length, 5);
});

test('재계약은 발생 급여·자금·주급 조건을 초기화하지 않는다', () => {
  const { world, club } = fixture(); days(world, 3);
  const before = structuredClone(club.finance), payroll = monthly(club), balance = club.balance;
  renewContract(world, club.playerIds[0], 28);
  assert.deepEqual(club.finance, before);
  assert.equal(club.balance, balance);
  assert.equal(monthly(club), payroll);
  days(world, 4);
  assert.equal(club.finance.settlements[0].wagesDue, Math.floor(payroll / 4));
});

test('급여는 전액 차감해 음수로 내려가며 다음 수입으로 회복한다', () => {
  const { world, club } = fixture(); club.balance = 0;
  Object.values(club.contracts).forEach(c => { c.monthlySalary = 2000; });
  days(world, 7);
  assert.equal(club.balance, -1250);
  assert.equal(club.finance.arrears, 0);
  Object.values(club.contracts).forEach(c => { c.monthlySalary = 200; });
  days(world, 7);
  assert.equal(club.finance.settlements[1].paidArrears, 0);
  assert.equal(club.finance.settlements[1].paidWages, 250);
  assert.equal(club.balance, -250);
  days(world, 7);
  assert.equal(club.finance.settlements[2].paidArrears, 0);
  assert.equal(club.finance.settlements[2].paidWages, 250);
  assert.equal(club.finance.arrears, 0);
  assert.equal(club.balance, 750);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('정산 경계에서 계약으로 중단하면 수입·급여도 변경하지 않는다', () => {
  const { world, club } = fixture(); days(world, 6);
  club.contracts[club.playerIds[0]].remainingDays = 1;
  const before = structuredClone(world);
  assert.equal(advanceDay(world).ok, false); assert.deepEqual(world, before);
  renewContract(world, club.playerIds[0], 168); days(world, 1);
  assert.equal(club.finance.settlements.length, 1);
});

test('재정 없는 v5는 적용일부터 1주 뒤 첫 정산하며 과거 급여를 청구하지 않는다', () => {
  const { world, club } = fixture(); days(world, 10);
  const old = useDailySchema(createSave(world), 5); delete old.world.clubs[0].finance;
  const before = structuredClone(old), restored = restoreWorld(parseBackup(JSON.stringify(old)));
  assert.deepEqual(old, before); assert.equal(restored.day, 11);
  assert.equal(restored.clubs[0].balance, club.balance);
  assert.deepEqual(restored.clubs[0].finance, { startedDay: 11, weeklyStartedDay: 11, cashStartedDay: 11, accruedUnits: 0, facilityAccruedUnits: 0, arrears: 0, settlements: [], sponsor: { kind: 'basic', remainingWeeks: 0, broadcastDays: 0 }, loan: { principal: 0, history: [] } });
  const ignored = structuredClone(old); ignored.world.clubs[0].finance = { arrears: 'not-validated' };
  assert.deepEqual(restoreWorld(ignored), restored);
  days(restored, 6); assert.equal(restored.clubs[0].balance, club.balance);
  days(restored, 1); assert.equal(restored.clubs[0].finance.settlements[0].day, 18);
});

test('최근 12회 주간 정산·장기 진행·저장 왕복을 보존한다', () => {
  const { world, club } = fixture();
  for (let i = 0; i < 91; i++) days(world, 1);
  assert.equal(club.finance.settlements.length, 12);
  assert.equal(club.finance.settlements[0].day, 15);
  assert.equal(club.finance.settlements.at(-1).day, 92);
  const saved = createSave(world); assert.equal(saved.schemaVersion, 48);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(saved))), world);
  assert.equal(advanceWeek(world).ok, true);
  assert.equal(club.finance.settlements.length, 12);
  assert.equal(club.finance.settlements.at(-1).day, 99);
});

test('재정 금액·주간 경계·내역 순서·중복·미지급 불일치를 거부한다', () => {
  const { world } = fixture(); days(world, 14);
  for (const change of [
    f => { f.startedDay = 0; }, f => { f.weeklyStartedDay = 99; }, f => { delete f.weeklyStartedDay; },
    f => { f.accruedUnits = -1; }, f => { f.accruedUnits = 0.5; }, f => { f.accruedUnits = Number.MAX_SAFE_INTEGER + 1; },
    f => { f.arrears = 10; }, f => { f.settlements = []; }, f => f.settlements.reverse(),
    f => { f.settlements[1] = f.settlements[0]; }, f => { f.settlements[0].day++; }, f => { f.settlements[0].income = 5000; },
    f => { f.settlements[1].paidWages++; }, f => { f.settlements[1].paidArrears = 1; }, f => { f.settlements[1].balance = Number.MIN_SAFE_INTEGER - 1; },
  ]) { const broken = structuredClone(world); change(broken.clubs[0].finance); assert.throws(() => createSave(broken), /재정/); }
});

test('누적 금액 상한 초과 시 날짜·계약·경험치를 변경하지 않는다', () => {
  const { world, club } = fixture(); club.finance.accruedUnits = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(world); assert.equal(advanceDay(world).ok, false); assert.deepEqual(world, before);
});

test('재정 화면은 정산 주차·주급·수입·실제 지급 내역을 주 단위로 표시한다', () => {
  const { world } = fixture();
  const empty = financePanel(getClubView(world)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  assert.match(empty, /다음 정산 2주 차/); assert.match(empty, /아직 정산 내역이 없습니다/);
  days(world, 7); const before = structuredClone(world), markup = financePanel(getClubView(world)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  assert.match(markup, /다음 정산 3주 차/); assert.match(markup, /스폰서 수입 현재 실적 기준 \$1,250/);
  assert.match(markup, /이미 누적된 비용/); assert.match(markup, /앞으로 7일 비용/);
  assert.match(markup, /정산 후 예상 잔액/); assert.match(markup, /미지급분 지급/); assert.match(markup, /정산 후 자금/);
  assert.doesNotMatch(markup, /30일|월급/); assert.deepEqual(world, before);
});
