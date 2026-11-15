import { createCounseling } from '../src/game/counseling.js';
import test from 'node:test';
import { createAiGrowth } from '../src/game/ai-growth.js';
import assert from 'node:assert/strict';
import { finishedCity, trip } from './city-fixture.js';
import { completedGroups } from './world-fixture.js';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { activeYearAdvance, beginYearAdvance, advanceYearWeek, cancelYearAdvance, yearAdvanceIssue } from '../src/game/year-advance.js';
import { runYearAdvance } from '../src/game/run-year-advance.js';
import { advanceWeek, advanceDay } from '../src/game/calendar.js';
import { selectWeeklyActions } from '../src/game/training.js';
import { resolvePlayerEvent, pendingPlayerEvent } from '../src/game/player-events.js';
import { renewContract } from '../src/game/contracts.js';
import { settleTeamTraining } from '../src/game/team-training.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { startNextYear, newYearIssue } from '../src/game/season-years.js';
import { yearAdvancePanel } from '../src/ui/year-advance-panel.js';
import { changeLoan } from '../src/game/loans.js';
import { upgradeFacility } from '../src/game/facilities.js';
import { changeCoach } from '../src/game/coaches.js';
import { tradeStock } from '../src/game/stocks.js';

const parent = completedGroups({last:true});
function fixture() {
  const world = structuredClone(parent);
  for (const id of world.clubs[0].playerIds) renewContract(world, id, 168);
  return world;
}
const choices = (world, action = 'aim') => world.clubs[0].playerIds.map(playerId => ({playerId, action}));
function resolve(world) { assert.equal(resolvePlayerEvent(world, 'decline').ok, true); }
function untilStop(world) {
  for (let i = 0; i < 100; i++) {
    const result = advanceYearWeek(world);
    if (result.reason === 'event') { trip(world); resolve(world); continue; }
    if (result.reason !== 'ready') return result;
  }
  assert.fail('did not stop');
}

test('시즌·이미 완료된 연도·진행 중 일정은 새 연말 진행을 막고 행동을 바꾸지 않는다', () => {
  const world = createWorld(createClub('YearAdvance').club, 42), before = structuredClone(world);
  assert.equal(beginYearAdvance(world, choices(world)).ok, false); assert.deepEqual(world, before);
  const free = fixture(); free.weekDaysRemaining = 2;
  assert.ok(yearAdvanceIssue(free)); assert.equal(beginYearAdvance(free, choices(free)).ok, false);
  free.weekDaysRemaining = 0; assert.equal(beginYearAdvance(free, []).ok, false);
  assert.equal(beginYearAdvance(free, choices(free)).ok, true); trip(free);
  assert.equal(selectWeeklyActions(free, choices(free, 'rest')).ok, false);
});

test('동일 행동의 일반 주간 계산과 훈련·반복 불이익·재정·주식·이벤트 결과가 같다', () => {
  const world = fixture();
  assert.equal(changeLoan(world, 'borrow', 1000).ok, true);
  assert.equal(upgradeFacility(world, 'aim').ok, true);
  assert.equal(changeCoach(world, 'beginner').ok, true);
  assert.equal(tradeStock(world, 'corechip', 'buy', 1).ok, true);
  const reference = structuredClone(world), actions = choices(world).map((choice, index) => ({...choice, action:['aim','intelligence','stamina','broadcast','rest'][index % 5]}));
  assert.equal(beginYearAdvance(world, actions).ok, true);
  assert.equal(selectWeeklyActions(reference, actions).ok, true);
  while (activeYearAdvance(world)) {
    const result = advanceYearWeek(world);
    if (reference.day < 365 || reference.playerEvents.week) {
      if (!reference.weekDaysRemaining && !reference.playerEvents.week && 365 - reference.day < 7) reference.weekDaysRemaining = 365 - reference.day;
      advanceWeek(reference, {events:true});
    }
    trip(world);
    if (result.reason === 'event') { resolve(world); resolve(reference); }
    const comparable = structuredClone(world); comparable.yearAdvance = null;
    assert.deepEqual(comparable, reference);
  }
  assert.equal(world.day, 365); assert.equal(world.yearAdvance.status, 'complete');
  assert.equal(beginYearAdvance(world, choices(world)).ok, false);
  const end = structuredClone(world); assert.equal(advanceYearWeek(world).ok, false); assert.deepEqual(world, end);
  assert.equal(newYearIssue(world), null); startNextYear(world); assert.equal(world.yearAdvance, null); trip(world);
});

test('목표일까지 20일인 경우 7·7·6일만 계산하고 마지막 부분 주도 저장한다', () => {
  const world = fixture(); advanceDay(world); assert.equal(world.day, 345);
  beginYearAdvance(world, choices(world));
  assert.equal(untilStop(world).reason, 'complete');
  assert.equal(world.day, 365); assert.equal(world.yearAdvance.endedDay, 365); trip(world);
});

test('계약으로 명단 5명 유지가 불가능하면 해당 날짜 직전 중단·수동 재계약 후 재개한다', () => {
  const world = fixture(), club = world.clubs[0];
  for (const contract of Object.values(club.contracts)) contract.remainingDays = 1;
  beginYearAdvance(world, choices(world));
  assert.equal(advanceYearWeek(world).reason, 'blocked'); assert.equal(world.day, 344); trip(world);
  assert.equal(Object.values(club.contracts).every(contract => contract.remainingDays === 1), true);
  for (const id of club.playerIds) renewContract(world, id, 168);
  assert.equal(untilStop(world).reason, 'complete'); trip(world);
});

test('연습이 필요한 주는 자동 보상 없이 중단하고 수동 보상·계속을 기다린다', () => {
  const world = fixture(); beginYearAdvance(world, choices(world, 'team'));
  assert.equal(untilStop(world).reason, 'training'); trip(world);
  const before = structuredClone(world);
  assert.equal(advanceYearWeek(world).reason, 'training'); assert.equal(world.day, before.day);
  assert.deepEqual(world.players, before.players);
  const actors = world.teamTraining.playerIds.map((playerId,i) => ({id:`home-${i}`,playerId,team:'home',stats:{kills:0,deaths:0,assists:0}}));
  const result = settleTeamTraining(world, {complete:true,tick:10,combat:false,actors}, world.teamTraining.day);
  assert.equal(result.ok, true); trip(world);
  assert.equal(untilStop(world).reason, 'training'); assert.ok(world.day > before.day); trip(world);
});

test('취소는 반영된 날짜·계약·재정을 보존하며 일반 일정은 이후에도 진행할 수 있다', () => {
  const world = fixture(); beginYearAdvance(world, choices(world)); advanceYearWeek(world);
  const before = structuredClone(world); cancelYearAdvance(world);
  assert.equal(world.day, before.day); assert.deepEqual(world.clubs, before.clubs); assert.deepEqual(world.players, before.players);
  if (pendingPlayerEvent(world)) resolve(world);
  advanceWeek(world, {events:true});
  if (pendingPlayerEvent(world)) resolve(world);
  trip(world); assert.equal(activeYearAdvance(world), false);
});

test('주간 자동 저장이 끝나기 전 다음 주를 계산하지 않고 취소·실패 시 마지막 기록을 보존한다', async () => {
  const world = fixture(); beginYearAdvance(world, choices(world)); const before = structuredClone(world);
  let saved, cancel = false, count = 0;
  const result = await runYearAdvance(world, { commit: async candidate => { count++; trip(candidate); saved = structuredClone(candidate); },
    onCheckpoint: async () => { cancel = true; }, cancelled: () => cancel });
  assert.equal(count, 2); assert.equal(result.yearAdvance.status, 'cancelled'); assert.deepEqual(saved, result); assert.deepEqual(world, before);
  await assert.rejects(runYearAdvance(world, {commit: async () => {throw new Error('storage failed');}}), /storage failed/);
  assert.deepEqual(world, before);
});

test('v42 기존 저장은 연말 진행을 만들지 않고 복원하며 잘못된 진행 날짜는 거부한다', () => {
  const world = fixture(), save = createSave(world); save.schemaVersion = 42; delete save.world.yearAdvance;
  assert.deepEqual(restoreWorld(save), {...world, aiGrowth:createAiGrowth(world.day),counseling:createCounseling(world)});
  beginYearAdvance(world, choices(world));
  for (const mutate of [w=>w.yearAdvance.targetDay++,w=>w.yearAdvance.year++,w=>w.yearAdvance.status='running',w=>w.yearAdvance.endedDay=w.day]) {
    const bad = structuredClone(world); mutate(bad); assert.throws(()=>createSave(bad), /연말/);
  }
  assert.match(yearAdvancePanel(world), /계속 진행/); assert.match(yearAdvancePanel(world), /진행 취소/);
});

test('파산하면 연말 진행은 종료되고 추가 날짜나 연습 보상을 만들지 않는다', () => {
  const world = fixture(); world.clubs[0].balance = -9999;
  for (const contract of Object.values(world.clubs[0].contracts)) contract.monthlySalary = 200000;
  beginYearAdvance(world, choices(world));
  assert.equal(untilStop(world).reason, 'bankrupt'); assert.ok(world.day < 365); trip(world);
  const before = structuredClone(world); advanceYearWeek(world); assert.deepEqual(world, before);
});

test('이른 탈락 후 장기간 진행도 계약 중단에서 자동 재계약 없이 멈춘다', () => {
  const world = finishedCity(10);
  for (const id of world.clubs[0].playerIds) renewContract(world, id, 168);
  beginYearAdvance(world, choices(world, 'rest'));
  const result = untilStop(world); assert.equal(result.reason, 'blocked');
  assert.ok(world.day > 155 && world.day < 365); trip(world);
});

for (const team of [false, true]) test(`목표일의 이벤트${team ? '·팀 연습' : ''}도 수동 해결 후 날짜 추가 없이 마무리한다`, () => {
  const world = fixture();
  while (world.day < 364) assert.equal(advanceDay(world).ok, true);
  world.playerEvents.randomState = 0;
  beginYearAdvance(world, choices(world, team ? 'team' : 'aim'));
  assert.equal(advanceYearWeek(world).reason, 'event'); assert.equal(world.day, 365); trip(world);
  const pending = restoreWorld(createSave(world)); resolve(pending); trip(pending);
  if (team) {
    assert.equal(advanceYearWeek(pending).reason, 'training'); assert.equal(pending.day, 365); trip(pending);
    const actors = pending.teamTraining.playerIds.map((playerId,i) => ({id:`home-${i}`,playerId,team:'home',stats:{kills:0,deaths:0,assists:0}}));
    assert.equal(settleTeamTraining(pending, {complete:true,tick:10,combat:false,actors}, 365).ok, true);
  }
  assert.equal(advanceYearWeek(pending).reason, 'complete'); assert.equal(pending.day, 365); trip(pending);
});

test('저장 실패 후에는 마지막 주간 저장을 복원해 중복 계산 없이 같은 결과로 재개한다', async () => {
  const world = fixture(); beginYearAdvance(world, choices(world, 'rest'));
  // 첫 저장까지 유지하고 두 번째 저장을 실패시켜 재시작 지점을 확인한다.
  world.playerEvents.randomState = 1;
  let checkpoint = createSave(world), writes = 0;
  await assert.rejects(runYearAdvance(world, {commit: async candidate => {
    if (++writes === 2) throw new Error('disk full');
    checkpoint = createSave(candidate);
  }}), /disk full/);
  const restored = restoreWorld(checkpoint); trip(restored);
  assert.equal(activeYearAdvance(restored), true);
  if (pendingPlayerEvent(restored)) resolve(restored);
  assert.equal(untilStop(restored).reason, 'complete'); assert.equal(restored.day, 365); trip(restored);
});
