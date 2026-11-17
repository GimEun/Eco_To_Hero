import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { advanceWeek } from '../src/game/calendar.js';
import { renewContract } from '../src/game/contracts.js';
import { createSave, parseBackup, restoreWorld, validateSave } from '../src/storage/save-data.js';
import { contractsPanel } from '../src/ui/contracts-panel.js';
import { financePanel } from '../src/ui/finance-panel.js';
import { getClubView } from '../src/game/world-selectors.js';

function legacy() {
  const save = createSave(createWorld(createClub('이전 저장').club, 42));
  save.schemaVersion = 9;
  delete save.world.seasonCalendar;
  save.world.day = 65;
  for (const club of save.world.clubs) for (const c of Object.values(club.contracts)) {
    c.durationDays = 90; c.remainingDays = club === save.world.clubs[0] ? 26 : 90;
  }
  const club = save.world.clubs[0];
  club.balance = 0;
  club.finance = { startedDay: 1, accruedUnits: 12345, arrears: 500, settlements: [
    { day: 31, income: 5000, wagesDue: 20000, paidArrears: 0, paidWages: 20000, arrears: 0, balance: 0 },
    { day: 61, income: 5000, wagesDue: 5500, paidArrears: 0, paidWages: 5000, arrears: 500, balance: 0 },
  ] };
  return save;
}

test('기존 계약·현금·분수 급여·미지급·과거 정산은 보존하고 다음 주에 새 규칙으로 정산한다', () => {
  const old = legacy(), before = structuredClone(old);
  const normalized = parseBackup(JSON.stringify(old));
  assert.equal(normalized.schemaVersion, 48);
  const world = restoreWorld(validateSave(normalized)), club = world.clubs[0];
  assert.deepEqual(old, before);
  assert.equal(world.day, 65);
  assert.equal(club.balance, -500);
  assert.equal(club.finance.arrears, 0);
  assert.equal(club.finance.accruedUnits / 420, 12345 / 30);
  assert.equal(club.finance.weeklyStartedDay, 65);
  assert.deepEqual(club.finance.settlements.map(({ sponsorKind, broadcastDays, ...entry }) => entry), old.world.clubs[0].finance.settlements);
  for (const c of Object.values(club.contracts)) { assert.equal(c.durationDays, 91); assert.equal(c.remainingDays, 28); }
  assert.deepEqual(restoreWorld(createSave(world)), world);
  const salary = Object.values(club.contracts).reduce((sum, c) => sum + c.monthlySalary, 0);
  assert.equal(advanceWeek(world).ok, true);
  const receipt = club.finance.settlements.at(-1), due = Math.floor(12345 / 30 + salary / 4);
  assert.equal(receipt.day, 72); assert.equal(receipt.income, 1250);
  assert.equal(receipt.wagesDue, due);
  assert.equal(receipt.paidArrears, 0); assert.equal(receipt.paidWages, due);
  assert.equal(club.finance.arrears, 0); assert.equal(club.balance,750-due);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(world)))), world);
  for (let i = 0; i < 14; i++) {
    for (const id of club.playerIds) renewContract(world, id, 168);
    assert.equal(advanceWeek(world).ok, true);
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
  assert.equal(club.finance.settlements.length, 12);
  assert.ok(club.finance.settlements.every(entry => entry.income === 1250));
});

test('계약 잔여일 1·7·8·30·90일을 올림하며 변환 후 반복 복원해도 늘어나지 않는다', () => {
  const old = legacy(), club = old.world.clubs[0], cases = [1, 7, 8, 30, 90];
  club.playerIds.forEach((id, index) => { club.contracts[id].remainingDays = cases[index]; });
  const world = restoreWorld(old);
  club.playerIds.forEach((id, index) => assert.equal(world.clubs[0].contracts[id].remainingDays / 7, [1, 1, 2, 5, 13][index]));
  let current = world;
  for (let i = 0; i < 3; i++) current = restoreWorld(parseBackup(JSON.stringify(createSave(current))));
  assert.deepEqual(current, world);
  assert.doesNotMatch(contractsPanel(getClubView(world)), /\d+일|월급|잔여일/);
  assert.match(financePanel(getClubView(world)), /이전 정산/);
});

test('기존 재정 도입일·30일 경계·미지급 불일치가 손상된 저장은 변환 전에 거절한다', () => {
  for (const mutate of [
    f => { f.startedDay = 0; }, f => { f.accruedUnits = 0.5; },
    f => { f.settlements[0].day = 30; }, f => { f.settlements[1].income = 1250; },
    f => { f.arrears = 0; }, f => { f.settlements.reverse(); },
  ]) { const old = legacy(); mutate(old.world.clubs[0].finance); assert.throws(() => restoreWorld(old), /재정/); }
});

test('주간 진행 중 만료로 중단 후 재개해도 스폰서·주급은 한 번 정산한다', () => {
  const world = createWorld(createClub('중단 재개').club, 42), club = world.clubs[0], id = club.playerIds[0];
  club.contracts[id].remainingDays = 3;
  assert.equal(advanceWeek(world).advancedDays, 2);
  assert.equal(club.finance.settlements.length, 0);
  const restored = restoreWorld(createSave(world));
  renewContract(restored, id, 84);
  assert.equal(advanceWeek(restored).advancedDays, 5);
  assert.equal(restored.clubs[0].finance.settlements.length, 1);
  assert.equal(restored.clubs[0].finance.settlements[0].income, 1250);
  assert.equal(restored.day, 8);
});
