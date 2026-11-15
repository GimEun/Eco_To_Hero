import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld as createNewWorld } from '../src/game/create-world.js';
// Existing in-season behavior; fresh-game preseason is covered separately.
const createWorld = (...args) => { const world = createNewWorld(...args); world.seasonCalendar = { mode: 'legacy', phase: 'season' }; return world; };

import { advanceWeek, advanceDay } from '../src/game/calendar.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { nextOfficialFixture, beginOfficialMatch, finishOfficialWeek } from '../src/game/official-match.js';
import { selectWeeklyActions } from '../src/game/training.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';
import { randomUnit } from '../src/game/random.js';
import { recordPcMatch } from '../src/game/pc-season.js';
import { renewContract } from '../src/game/contracts.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { getClubView } from '../src/game/world-selectors.js';

const sample = () => createWorld(createClub('주간 일정').club, 42);
const choices = (world, action) => getClubView(world).playerIds.map(playerId => ({ playerId, action }));
const roundTrip = world => assert.deepEqual(restoreWorld(createSave(world)), world);

function eventSeed(offset) {
  for (let seed = 0; seed < 10000; seed++) {
    const state = { randomState: seed };
    if (randomUnit(state) < 0.6 && 1 + Math.floor(randomUnit(state) * 6) === offset) return seed;
  }
  throw new Error('seed');
}

test('주간 준비는 6일이며 경기 전 다음 주·행동 재선택·단독 경기 시작을 막는다', () => {
  const world = sample();
  assert.equal(officialWeekStatus(world).canPlay, false);
  assert.throws(() => beginOfficialMatch(world, nextOfficialFixture(world).id));
  assert.equal(selectWeeklyActions(world, choices(world, 'aim')).ok, true);
  const baseline = structuredClone(world);
  for (let i = 0; i < 6; i++) assert.equal(advanceDay(baseline).ok, true);
  const result = advanceWeek(world, { official: true });
  assert.equal(result.ok, true); assert.equal(result.advancedDays, 6); assert.equal(world.day, 7);
  assert.deepEqual(world.players, baseline.players); assert.deepEqual(world.clubs, baseline.clubs);
  assert.equal(world.weekDaysRemaining, 1); assert.equal(officialWeekStatus(world).canPlay, true);
  roundTrip(world);
  const original = structuredClone(world);
  assert.equal(advanceWeek(world, { official: true }).officialPending, true);
  assert.equal(advanceDay(world).officialPending, true);
  assert.equal(selectWeeklyActions(world, choices(world, 'rest')).ok, false);
  assert.equal(beginTeamTraining(world, { official: true }).ok, false);
  assert.deepEqual(world, original);
});

test('준비 마지막 날 이벤트·팀 훈련·공식 경기 대기는 저장 후 이어지고 날짜를 중복 진행하지 않는다', () => {
  let world = sample(); world.playerEvents.randomState = eventSeed(6);
  assert.equal(selectWeeklyActions(world, choices(world, 'team')).ok, true);
  const prepared = beginTeamTraining(world, { official: true, events: true });
  assert.equal(prepared.eventPending, true); assert.equal(world.day, 7);
  assert.equal(world.playerEvents.week.event.status, 'pending');
  assert.equal(officialWeekStatus(world).canPlay, false);
  world = restoreWorld(createSave(world));
  assert.equal(resolvePlayerEvent(world, 'decline').ok, true);
  const resumed = beginTeamTraining(world, { official: true, events: true });
  assert.equal(resumed.ok, true); assert.equal(resumed.advancedDays, 0);
  assert.equal(world.day, 7); assert.equal(officialWeekStatus(world).phase, 'training');
  roundTrip(world);
  assert.throws(() => beginOfficialMatch(world, nextOfficialFixture(world).id));
  const home = getClubView(world), away = getClubView(world, world.clubs.find(club => club.id !== home.id).id);
  const state = createPractice(RELAY_MAP, home, away);
  advancePractice(state, RELAY_MAP, 120000);
  assert.equal(settleTeamTraining(world, state, world.teamTraining.day).ok, true);
  assert.equal(world.day, 7); assert.equal(officialWeekStatus(world).phase, 'ready');
  roundTrip(world);
});

test('이전 저장의 완료 경기·중단 이벤트를 보존하고 남은 일정을 마친 다음 새 주부터 연결한다', () => {
  let world = sample();
  for (const fixture of world.pcSeason.fixtures.filter(item => item.week === 1)) recordPcMatch(world.pcSeason, fixture.id, { homeScore: 13, awayScore: 5 });
  world.playerEvents.randomState = eventSeed(3);
  // 기존 주간 처리의 이벤트는 길이 7이므로 실제 중단 여부를 확인한다.
  let seed = 0;
  for (; seed < 10000; seed++) { const state = { randomState: seed }; if (randomUnit(state) < 0.6 && 1 + Math.floor(randomUnit(state) * 7) === 3) break; }
  world.playerEvents.randomState = seed;
  assert.equal(advanceWeek(world, { events: true }).eventPending, true);
  const backup = createSave(world); backup.schemaVersion = 25; delete backup.world.pcSeason.weekSchedule;
  const before = structuredClone(world);
  world = restoreWorld(backup);
  assert.deepEqual(world, {...before,aiGrowth:createAiGrowth(before.day)});
  assert.equal(resolvePlayerEvent(world, 'decline').ok, true);
  assert.equal(advanceWeek(world, { events: true, official: true }).ok, true);
  assert.equal(world.day, 8); assert.equal(world.pcSeason.weekSchedule, null);
  assert.equal(world.pcSeason.fixtures.filter(item => item.result).length, 4);
  assert.equal(advanceWeek(world, { official: true }).ok, true);
  assert.equal(world.day, 14); assert.equal(world.pcSeason.weekSchedule.startedDay, 8);
  assert.equal(world.pcSeason.weekSchedule.fixtureId, nextOfficialFixture(world).id);
  assert.equal(nextOfficialFixture(world).week, 2);
  roundTrip(world);
});

test('경기 후 마지막 하루의 계약 만료가 막히면 결과를 보존하고 재계약 후 1일만 정산한다', async () => {
  const world = sample(); advanceWeek(world, { official: true });
  const fixture = nextOfficialFixture(world); beginOfficialMatch(world, fixture.id);
  for (const contract of Object.values(getClubView(world).contracts)) contract.remainingDays = 1;
  let result = await finishOfficialWeek(world, { forfeit: true });
  assert.equal(result.day, 7); assert.equal(officialWeekStatus(result).phase, 'settling');
  assert.equal(result.pcSeason.fixtures.filter(item => item.result).length, 4);
  roundTrip(result);
  assert.throws(() => beginOfficialMatch(result, nextOfficialFixture(result).id));
  result = restoreWorld(createSave(result));
  for (const id of getClubView(result).playerIds) assert.equal(renewContract(result, id, 28).ok, true);
  assert.equal(advanceWeek(result, { official: true }).advancedDays, 1);
  assert.equal(result.day, 8); assert.equal(result.pcSeason.weekSchedule, null);
  assert.equal(result.pcSeason.fixtures.filter(item => item.result).length, 4);
  assert.equal(advanceWeek(result, { official: true }).advancedDays, 6);
  assert.equal(result.day, 14); assert.equal(nextOfficialFixture(result).week, 2);
  roundTrip(result);
});

test('주간 일정의 잘못된 날짜·단계·완료 여부·타 팀 연결과 최신 필드 누락을 거부한다', () => {
  const world = sample(); advanceWeek(world, { official: true });
  for (const change of [
    w => { w.pcSeason.weekSchedule.endDay++; },
    w => { w.pcSeason.weekSchedule.phase = 'settling'; },
    w => { w.day++; },
    w => { w.weekDaysRemaining = 0; },
    w => { w.pcSeason.weekSchedule.fixtureId = w.pcSeason.fixtures.find(f => ![f.homeClubId, f.awayClubId].includes(w.playerClubId)).id; },
    w => { delete w.pcSeason.weekSchedule; },
  ]) { const copy = structuredClone(world); change(copy); assert.throws(() => createSave(copy)); }
});
