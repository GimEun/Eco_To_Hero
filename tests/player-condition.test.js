import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { applyActionFatigue, playerCondition, fatigueModifier } from '../src/game/player-condition.js';
import { effectiveStats } from '../src/game/happiness.js';
import { selectTraining, selectWeeklyActions } from '../src/game/training.js';
import { advanceWeek } from '../src/game/calendar.js';
import { renewContract } from '../src/game/contracts.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';
import { getAffiliations, getClubView } from '../src/game/world-selectors.js';
import { recruitPlayer, releasePlayer, signingFee } from '../src/game/roster.js';
import { negotiateTransfer } from '../src/game/transfers.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { experiencePanel, trainingPanel } from '../src/ui/training-panel.js';

function fixture() {
  const world = createWorld(createClub('컨디션 검증').club, 42);
  return { world, player: world.players[0], club: world.clubs[0] };
}

test('신규 600명은 피로 0·컨디션 100이고 기본 능력·계약·성장 경험치를 유지한다', () => {
  const { world } = fixture();
  assert.ok(world.players.every(player => player.fatigue === 0 && playerCondition(player) === 100));
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('실제 주간 행동은 개인 훈련 +14·팀 +21·방송 +7·휴식 -35를 적용한다', () => {
  for (const [action, delta] of [['aim', 14], ['intelligence', 14], ['stamina', 14], ['team', 21], ['broadcast', 7], ['rest', -35]]) {
    const { world, player } = fixture(); player.fatigue = 40;
    selectTraining(world, player.id, action);
    assert.equal(advanceWeek(world).ok, true);
    assert.equal(player.fatigue, 40 + delta); assert.equal(playerCondition(player), 60 - delta);
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
  const player = { fatigue: 99, stamina: 50 };
  applyActionFatigue(player, 'team'); assert.equal(player.fatigue, 100);
  for (let i = 0; i < 30; i++) applyActionFatigue(player, 'rest');
  assert.equal(player.fatigue, 0);
});

test('체력 80부터 개인·팀 훈련의 누적만 줄이고 행복도 경기 체력 보정은 사용하지 않는다', () => {
  for (const stamina of [79, 80, 99]) for (const [action, normal] of [['aim', 2], ['intelligence', 2], ['stamina', 2], ['team', 3], ['broadcast', 1], ['rest', -5]]) {
    const player = { fatigue: 40, stamina, morale: { happiness: 100 } };
    applyActionFatigue(player, action);
    const reduction = stamina >= 80 && ['aim', 'intelligence', 'stamina', 'team'].includes(action) ? 1 : 0;
    assert.equal(player.fatigue, 40 + normal - reduction);
  }
  const { world, player } = fixture();
  player.stamina = 79; player.development.potential.stamina = 90; player.training.experience.stamina = 99;
  selectTraining(world, player.id, 'stamina'); advanceWeek(world);
  assert.equal(player.stamina, 80); assert.equal(player.fatigue, 8);
});

test('피로 구간 경계는 에임·지능에만 반영하고 행복도와 합산해 1~99를 지킨다', () => {
  for (const [fatigue, penalty] of [[0, 0], [24, 0], [25, -1], [49, -1], [50, -3], [74, -3], [75, -5], [100, -5]]) {
    const player = { aim: 50, intelligence: 60, stamina: 70, fatigue, morale: { happiness: 90 } }, snapshot = structuredClone(player);
    assert.equal(fatigueModifier(player), penalty);
    assert.deepEqual(effectiveStats(player), { aim: 53 + penalty, intelligence: 63 + penalty, stamina: 73 });
    assert.deepEqual(player, snapshot);
  }
  assert.deepEqual(effectiveStats({ aim: 1, intelligence: 2, stamina: 1, fatigue: 100, morale: { happiness: 0 } }), { aim: 1, intelligence: 1, stamina: 1 });
  assert.deepEqual(effectiveStats({ aim: 99, intelligence: 99, stamina: 99, fatigue: 0, morale: { happiness: 100 } }), { aim: 99, intelligence: 99, stamina: 99 });
});

test('계약으로 일부 일정이 멈추면 실제 진행일만 누적하고 복원 후 남은 날만 재개한다', () => {
  const { world, player, club } = fixture(); selectTraining(world, player.id, 'aim');
  club.contracts[player.id].remainingDays = 3;
  const first = advanceWeek(world); assert.equal(first.advancedDays, 2); assert.equal(player.fatigue, 4);
  const restored = restoreWorld(createSave(world)), snapshot = structuredClone(restored);
  assert.equal(advanceWeek(restored).advancedDays, 0); assert.deepEqual(restored, snapshot);
  renewContract(restored, player.id, 84);
  assert.equal(advanceWeek(restored).advancedDays, 5); assert.equal(restored.players[0].fatigue, 14);
});

test('선수 이벤트 중단·저장·선택·재개는 피로를 중복 처리하지 않는다', () => {
  const { world, player } = fixture(); selectTraining(world, player.id, 'aim');
  world.playerEvents.week = { startedDay: 1, endDay: 8, teamTraining: false,
    event: { eventId: 'dating', day: 4, status: 'scheduled', playerId: null, roll: null } };
  assert.equal(advanceWeek(world, { events: true }).advancedDays, 3); assert.equal(player.fatigue, 6);
  const restored = restoreWorld(createSave(world)), snapshot = structuredClone(restored);
  assert.equal(advanceWeek(restored).eventPending, true); assert.deepEqual(restored, snapshot);
  resolvePlayerEvent(restored, 'decline');
  assert.equal(advanceWeek(restored, { events: true }).advancedDays, 4); assert.equal(restored.players[0].fatigue, 14);
});

test('주전 팀 훈련만 팀 피로를 받고 후보 행동·정산·관전 반복은 추가 피로를 만들지 않는다', () => {
  const { world, club } = fixture(), affiliations = getAffiliations(world);
  const reserve = world.players.filter(player => !affiliations.has(player.id)).sort((a, b) => signingFee(a) - signingFee(b))[0];
  recruitPlayer(world, reserve.id);
  selectWeeklyActions(world, club.playerIds.map((playerId, i) => ({ playerId, action: i === 0 ? 'team' : playerId === reserve.id ? 'broadcast' : 'rest' })));
  beginTeamTraining(world);
  for (const id of club.lineupIds) assert.equal(world.players.find(player => player.id === id).fatigue, 21);
  assert.equal(reserve.fatigue, 7);
  const pending = structuredClone(world); beginTeamTraining(world); assert.deepEqual(world, pending);
  const actors = club.lineupIds.map(playerId => ({ playerId, team: 'home', stats: { kills: 0, deaths: 0, assists: 0 } }));
  settleTeamTraining(world, { complete: true, tick: 1, combat: false, actors }, world.teamTraining.day);
  assert.deepEqual(world.players.map(player => player.fatigue), pending.players.map(player => player.fatigue));
  const before = structuredClone(world);
  for (const options of [{}, { combat: true }, { round: true }, { economy: true }, { match: true }]) {
    const practice = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id), options);
    advancePractice(practice, RELAY_MAP, 10000);
  }
  assert.deepEqual(world, before);
});

test('후보·방출·재영입은 피로를 유지하고 자유계약은 멈추며 AI는 주간 행동을 수행한다', () => {
  const { world } = fixture(), affiliations = getAffiliations(world);
  const free = world.players.filter(player => !affiliations.has(player.id)).sort((a, b) => signingFee(a) - signingFee(b))[0];
  free.fatigue = 30; recruitPlayer(world, free.id); selectTraining(world, free.id, 'broadcast'); advanceWeek(world);
  assert.equal(free.fatigue, 37); releasePlayer(world, free.id);
  const snapshot = structuredClone(free), ai = structuredClone(world.players.find(player => player.id === world.clubs[1].playerIds[0]));
  advanceWeek(world); assert.deepEqual(free, snapshot);
  assert.notDeepEqual(world.players.find(player => player.id === ai.id).training, ai.training);
  recruitPlayer(world, free.id); assert.equal(free.fatigue, 37);
  const target = world.players.find(player => player.id === ai.id); target.fatigue = 52;
  assert.equal(negotiateTransfer(world, target.id, 100).ok, true); assert.equal(target.fatigue, 52);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('기존 연습은 시작 시 능력을 유지하고 새 연습부터 컨디션과 행복도를 반영한다', () => {
  const { world, player } = fixture();
  const make = () => createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id), { combat: true });
  const previous = make(); player.fatigue = 75; player.morale.happiness = 90;
  const fresh = make(); assert.equal(previous.actors[0].aim, player.aim);
  assert.equal(fresh.actors[0].aim, player.aim - 2);
  assert.equal(fresh.actors[0].intelligence, player.intelligence - 2);
  assert.equal(fresh.actors[0].stamina, player.stamina + 3);
  assert.equal(player.fatigue, 75);
});

test('v13 변환은 피로 0만 추가하며 기존 데이터·대기 일정·난수·원본을 보존한다', () => {
  const { world, player } = fixture(); selectTraining(world, player.id, 'aim');
  world.playerEvents.week = { startedDay: 1, endDay: 8, teamTraining: false,
    event: { eventId: 'dating', day: 4, status: 'scheduled', playerId: null, roll: null } };
  assert.equal(advanceWeek(world, { events: true }).eventPending, true);
  const save = createSave(world); save.schemaVersion = 13; save.world.players.forEach(player => { delete player.fatigue; });
  save.world.clubs[0].finance.cashStartedDay=save.world.day;
  const snapshot = structuredClone(save), restored = restoreWorld(parseBackup(JSON.stringify(save)));
  assert.deepEqual(save, snapshot); assert.ok(restored.players.every(player => player.fatigue === 0));
  assert.deepEqual(restored.players.map(({ fatigue, ...player }) => player), save.world.players);
  for (const key of ['clubs', 'day', 'weekDaysRemaining', 'actionRandomState', 'teamTraining', 'playerEvents']) assert.deepEqual(restored[key], save.world[key]);
  restored.players[0].fatigue = 64;
  assert.deepEqual(restoreWorld(createSave(restored)), restored);
  resolvePlayerEvent(restored, 'decline');
  assert.equal(advanceWeek(restored, { events: true }).advancedDays, 4);
  assert.equal(restored.players[0].fatigue, 72);
});

test('현재 저장은 피로 누락·음수·소수·초과·문자열과 null을 거부한다', () => {
  for (const value of [undefined, -1, .5, 101, '25', null, NaN]) {
    const { world } = fixture(); world.players[0].fatigue = value;
    assert.throws(() => createSave(world), /피로/);
  }
});

test('능력·경험치와 행동 선택 창은 피로·컨디션·경기 보정과 회복 규칙을 표시한다', () => {
  const { world, player } = fixture(); player.fatigue = 50;
  const club = getClubView(world);
  for (const markup of [experiencePanel(club), trainingPanel(club)]) {
    assert.match(markup, /피로 50 \/ 100/); assert.match(markup, /컨디션 50 \/ 100/);
    assert.match(markup, /에임·지능 -3/);
  }
  assert.match(trainingPanel(club), /휴식 -5/);
});
