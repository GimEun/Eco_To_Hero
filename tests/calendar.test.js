import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { renewContract } from '../src/game/contracts.js';
import { recruitPlayer, signingFee } from '../src/game/roster.js';
import { getAffiliations, getClubView } from '../src/game/world-selectors.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { contractsPanel } from '../src/ui/contracts-panel.js';
import { useDailySchema } from './legacy-fixture.js';

function fixture(extra = 0) {
  const world = createWorld(createClub('달력 검증').club, 42);
  const club = world.clubs[0];
  const assigned = getAffiliations(world);
  const free = world.players.filter(p => !assigned.has(p.id)).sort((a, b) => signingFee(a) - signingFee(b));
  for (const player of free.slice(0, extra)) assert.equal(recruitPlayer(world, player.id).ok, true);
  return { world, club, free };
}

test('84일 계약은 83번 진행 후 잔여 1일이며 AI 계약·주전은 보존하고 월급을 정산한다', () => {
  const { world, club } = fixture();
  const before = structuredClone(world);
  for (let i = 0; i < 83; i++) assert.equal(advanceDay(world).ok, true);
  assert.equal(world.day, 84);
  for (const contract of Object.values(club.contracts)) {
    assert.equal(contract.durationDays, 84);
    assert.equal(contract.remainingDays, 1);
  }
  assert.deepEqual(world.clubs.slice(1), before.clubs.slice(1));
  const aiIds = new Set(world.clubs.slice(1).flatMap(club => club.playerIds));
  assert.deepEqual(world.players.filter(p => !aiIds.has(p.id)).map(({ morale, ...p }) => p), before.players.filter(p => !aiIds.has(p.id)).map(({ morale, ...p }) => p));
  const monthly = Object.values(before.clubs[0].contracts).reduce((sum, contract) => sum + contract.monthlySalary, 0);
  assert.equal(club.balance, before.clubs[0].balance + 11 * 1250 - Math.floor(monthly * 11 / 4));
  assert.equal(club.finance.settlements.length, 11);
  assert.deepEqual(club.lineupIds, before.clubs[0].lineupIds);
  const boundary = structuredClone(world);
  assert.equal(advanceDay(world).ok, false);
  assert.deepEqual(world, boundary);
});

test('동시 만료가 5명 미만을 만들면 날짜·남은 계약·명단 전체를 변경하지 않는다', () => {
  const { world, club } = fixture(1);
  for (const id of club.playerIds.slice(0, 2)) club.contracts[id].remainingDays = 1;
  const before = structuredClone(world);
  const result = advanceDay(world);
  assert.equal(result.ok, false);
  assert.match(result.message, /재계약.*영입/);
  assert.deepEqual(world, before);
});

test('주전·후보 3명 동시 만료 시 모두 자유계약으로 이동하고 생존 후보만 주전을 채운다', () => {
  const { world, club } = fixture(3);
  const expiring = [club.playerIds[0], club.playerIds[5], club.playerIds[1]];
  expiring.forEach(id => { club.contracts[id].remainingDays = 1; });
  const before = structuredClone(world);
  const result = advanceDay(world);
  assert.equal(result.ok, true);
  assert.deepEqual(new Set(result.expiredIds), new Set(expiring));
  assert.equal(world.day, 2);
  assert.equal(club.playerIds.length, 5);
  assert.equal(new Set(club.lineupIds).size, 5);
  assert.deepEqual(new Set(club.playerIds), new Set(club.lineupIds));
  for (const id of expiring) {
    assert.equal(getAffiliations(world).has(id), false);
    assert.equal(Object.hasOwn(club.contracts, id), false);
  }
  const aiIds = new Set(world.clubs.slice(1).flatMap(club => club.playerIds));
  assert.deepEqual(world.players.filter(p => !aiIds.has(p.id)).map(({ morale, ...p }) => p), before.players.filter(p => !aiIds.has(p.id)).map(({ morale, ...p }) => p));
  assert.deepEqual(world.clubs.slice(1), before.clubs.slice(1));
  assert.equal(club.balance, before.clubs[0].balance);
  assert.ok(Object.values(club.contracts).every(c => c.remainingDays === 83));
  assert.doesNotThrow(() => createSave(world));
});

test('만료 전 재계약이나 추가 영입으로 진행을 다시 열고 재계약 잔여일을 초기화한다', () => {
  const { world, club, free } = fixture();
  const id = club.playerIds[0];
  club.contracts[id].remainingDays = 1;
  assert.equal(advanceDay(world).ok, false);
  const salary = club.contracts[id].monthlySalary, balance = club.balance;
  assert.equal(renewContract(world, id, 28).ok, true);
  assert.equal(club.contracts[id].remainingDays, 28);
  assert.equal(club.contracts[id].monthlySalary, salary);
  assert.equal(club.balance, balance);
  assert.equal(advanceDay(world).ok, true);
  assert.equal(club.contracts[id].remainingDays, 27);
  club.contracts[id].remainingDays = 1;
  assert.equal(recruitPlayer(world, free[0].id).ok, true);
  assert.equal(club.contracts[free[0].id].remainingDays, 84);
  assert.equal(advanceDay(world).ok, true);
  assert.equal(getAffiliations(world).has(id), false);
  assert.equal(club.contracts[free[0].id].remainingDays, 83);
});

test('v8 저장·JSON 복원은 날짜·잔여일을 보존하고 v4는 기존 조건으로 1일 차부터 시작한다', () => {
  const { world, club } = fixture();
  renewContract(world, club.playerIds[0], 168);
  for (let i = 0; i < 7; i++) advanceDay(world);
  const saved = createSave(world);
  assert.equal(saved.schemaVersion, 48);
  assert.equal(world.day, 8);
  assert.equal(club.contracts[club.playerIds[0]].remainingDays, 161);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(saved))), world);
  const legacy = useDailySchema(structuredClone(saved), 4);
  delete legacy.world.day;
  legacy.world.clubs.forEach(c => Object.values(c.contracts).forEach(contract => { delete contract.remainingDays; }));
  const before = structuredClone(legacy);
  const restored = restoreWorld(parseBackup(JSON.stringify(legacy)));
  assert.deepEqual(legacy, before);
  assert.equal(restored.day, 1);
  assert.deepEqual(restored.players.map(({ morale, training, fatigue, ...p }) => p), world.players.map(({ morale, training, fatigue, ...p }) => p));
  assert.equal(restored.clubs[0].balance, club.balance);
  assert.deepEqual(restored.clubs[0].playerIds, club.playerIds);
  assert.deepEqual(restored.clubs[0].lineupIds, club.lineupIds);
  for (const c of restored.clubs) for (const contract of Object.values(c.contracts)) assert.equal(contract.remainingDays, contract.durationDays);
  assert.equal(restored.clubs[0].contracts[club.playerIds[0]].monthlySalary, club.contracts[club.playerIds[0]].monthlySalary);
});

test('v8은 누락·범위·타입이 잘못된 날짜/잔여일을 거부하고 날짜 상한 진행은 원본을 보존한다', () => {
  const { world, club } = fixture();
  const id = club.playerIds[0];
  for (const day of [undefined, 0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    const broken = structuredClone(world); broken.day = day;
    assert.throws(() => createSave(broken), /날짜/);
  }
  for (const remainingDays of [undefined, 0, -1, 91, 1.5, '1', null]) {
    const broken = structuredClone(world); broken.clubs[0].contracts[id].remainingDays = remainingDays;
    assert.throws(() => createSave(broken), /잔여 기간/);
  }
  world.day = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(world);
  assert.equal(advanceDay(world).ok, false);
  assert.deepEqual(world, before);
  assert.equal(advanceWeek(world).ok, false);
  assert.deepEqual(world, before);
});

test('계약 표는 날짜·잔여일·하루 진행·다음 날 만료 안내와 실제 미차감 범위를 표시한다', () => {
  const { world, club } = fixture();
  club.contracts[club.playerIds[0]].remainingDays = 1;
  const markup = contractsPanel(getClubView(world));
  assert.doesNotMatch(markup, /data-action="advance-day"/);
  assert.match(markup, /구단명 옆 1주 진행/);
  assert.match(markup, /남은 계약/);
  assert.match(markup, /1명 계약 만료 예정/);
  assert.match(markup, /1주 · 만료 예정/);
  assert.match(markup, /팀 연습·현실 시간에는 날짜가 흐르지 않습니다/);
  assert.match(markup, /AI 구단 계약 감소·급여 정산은 아직 적용하지 않습니다/);
});
