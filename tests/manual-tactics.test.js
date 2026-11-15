import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { prepareRound, resolveRound } from '../src/simulation/round.js';
import { startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { setManualRoute, setManualDuration, clearManualRoute, manualPlanFor, settleManualRound } from '../src/simulation/manual-tactics.js';
import { canOccupy } from '../src/simulation/geometry.js';

function sample(side = 'home', match = true) {
  const world = createWorld(createClub('수동 구단').club, 42);
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id), {
    round: true, match, seed: 42, attackTeam: side,
    attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' },
  });
  return { state, world };
}
const route = (state, id = 'home-1', side = 'attack', cells = [{ x: 9, y: 6 }], angle = 0) =>
  setManualRoute(state, RELAY_MAP, id, side, cells, angle);
function finishRound(state, winner) {
  startEconomyRound(state);
  for (const actor of state.actors.filter(actor => actor.team !== winner)) { actor.alive = false; actor.hp = 0; }
  stepPractice(state, RELAY_MAP);
  assert.equal(state.complete, true);
}
function quiet(state) {
  for (const actor of state.actors) { actor.viewRange = 0; if (actor.team !== state.round.attackTeam) actor.speed = 0; }
}

test('경유점은 복사·검증하며 실패한 편집은 점수·자금·난수·설정을 바꾸지 않는다', () => {
  const { state, world } = sample();
  const originalWorld = structuredClone(world);
  const cells = [{ x: 9, y: 6 }, { x: 16, y: 6 }];
  assert.equal(route(state, 'home-1', 'attack', cells, Math.PI / 2).ok, true);
  cells[0].x = 0;
  assert.equal(state.manualPlans.attack.players['home-1'].cells[0].x, 9);
  const before = structuredClone(state);
  for (const points of [[], [{ x: -1, y: 6 }], [{ x: 5, y: 2 }], [{ x: 9.5, y: 6 }],
    Array(13).fill({ x: 9, y: 6 }), [null]]) assert.equal(route(state, 'home-1', 'attack', points).ok, false);
  assert.equal(route(state, 'away-1').ok, false);
  assert.equal(route(state, 'home-1', 'bad').ok, false);
  assert.equal(route(state, 'home-1', 'attack', [{ x: 9, y: 6 }], NaN).ok, false);
  assert.equal(setManualDuration(state, 'attack', 5), false);
  assert.deepEqual(state, before);
  assert.deepEqual(world, originalWorld);
});

test('공격·수비별 4/6/12회는 해당 진영 종료 때만 차감하고 공수·반복 연장에서도 유지된다', () => {
  for (const duration of [4, 6, 12]) {
    const { state } = sample();
    setManualDuration(state, 'attack', duration);
    setManualDuration(state, 'defense', 12);
    assert.equal(route(state).ok, true);
    assert.equal(route(state, 'home-1', 'defense', [{ x: 19, y: 6 }]).ok, true);
    const expected = { attack: duration, defense: 12 };
    for (let round = 0; round < 36; round++) {
      const side = state.round.attackTeam === 'home' ? 'attack' : 'defense';
      assert.equal(Boolean(manualPlanFor(state, state.actors[0])), expected[side] > 0);
      if (!expected[side]) assert.doesNotMatch(state.actors[0].intent, /수동/);
      finishRound(state, round % 2 ? 'away' : 'home');
      expected[side] = Math.max(0, expected[side] - 1);
      const settled = structuredClone(state);
      settleManualRound(state); resolveRound(state);
      assert.deepEqual(state, settled);
      assert.equal(state.manualPlans.attack.remaining, expected.attack);
      assert.equal(state.manualPlans.defense.remaining, expected.defense);
      if (round < 35) assert.equal(nextEconomyRound(state, RELAY_MAP), true);
    }
    assert.equal(state.match.overtime, 2);
    assert.equal(state.manualPlans.attack.remaining, 0);
    assert.equal(state.manualPlans.defense.remaining, 0);
  }
});

test('경로 편집은 횟수를 갱신하지 않고 기간 적용만 선택 진영을 갱신한다', () => {
  const { state } = sample();
  route(state);
  finishRound(state, 'home'); nextEconomyRound(state, RELAY_MAP);
  assert.equal(state.manualPlans.attack.remaining, 3);
  route(state, 'home-1', 'attack', [{ x: 8, y: 6 }]);
  assert.equal(state.manualPlans.attack.remaining, 3);
  setManualDuration(state, 'attack', 6);
  assert.equal(state.manualPlans.attack.remaining, 6);
  assert.equal(state.manualPlans.defense.remaining, 4);
  const before = structuredClone(state.match);
  assert.equal(clearManualRoute(state, 'home-1', 'attack'), true);
  assert.equal(manualPlanFor(state, state.actors[0]), null);
  assert.deepEqual(state.match, before);
  const fresh = sample().state;
  assert.deepEqual(fresh.manualPlans.attack.players, {});
  route(fresh);
  for (let round = 0; round < 4; round++) { finishRound(fresh, 'home'); nextEconomyRound(fresh, RELAY_MAP); }
  assert.equal(route(fresh).ok, false);
  assert.equal(setManualDuration(fresh, 'attack', 12), true);
  assert.equal(route(fresh).ok, true);
});

test('수동 수비는 실제 경유점을 따라 벽을 피해 이동하고 마지막 방향을 경계한다', () => {
  const { state } = sample('away', false); quiet(state);
  for (const actor of state.actors) actor.speed = 0;
  state.actors[0].speed = 80;
  assert.equal(route(state, 'home-1', 'defense', [{ x: 19, y: 6 }, { x: 15, y: 6 }], 0.7).ok, true);
  for (let tick = 0; tick < 200; tick++) {
    stepPractice(state, RELAY_MAP);
    assert.ok(canOccupy(RELAY_MAP, state.actors[0].x, state.actors[0].y));
  }
  const actor = state.actors[0];
  assert.equal(actor.x, 620); assert.equal(actor.y, 260);
  assert.match(actor.intent, /수동 지점 경계/);
  assert.equal(actor.facing, 0.7);
});

test('적 교전은 수동 이동보다 우선하며 전투·일시정지 상태의 편집은 거부한다', () => {
  const { state } = sample('away');
  assert.equal(route(state, 'home-1', 'defense', [{ x: 15, y: 6 }]).ok, true);
  for (const actor of state.actors) actor.viewRange = 0;
  Object.assign(state.actors[0], { x: 780, y: 260, facing: Math.PI, viewRange: 260 });
  Object.assign(state.actors[5], { x: 660, y: 260, facing: 0, viewRange: 200 });
  startEconomyRound(state);
  advancePractice(state, RELAY_MAP, 600);
  assert.equal(state.actors[0].x, 780);
  assert.ok(state.actors[0].stats.shots > 0);
  const before = structuredClone(state);
  assert.equal(route(state).ok, false);
  assert.equal(clearManualRoute(state, 'home-1', 'defense'), false);
  assert.equal(setManualDuration(state, 'attack', 12), false);
  assert.deepEqual(state, before);
});

test('운반자는 수동 경로를 마친 뒤 되돌아가지 않고 실제로 설치한다', () => {
  const { state } = sample('home', false); quiet(state);
  assert.equal(route(state, 'home-3', 'attack').ok, true);
  advancePractice(state, RELAY_MAP, 50000);
  assert.ok(state.events.some(event => event.type === 'bomb-planted' && event.actorId === 'home-3'));
});

test('폭탄 회수·설치 후 경계·해체는 수동 경로보다 우선한다', () => {
  const { state } = sample('home', false); quiet(state);
  route(state);
  Object.assign(state.round.bomb, { status: 'dropped', carrierId: null, x: 780, y: 260 });
  Object.assign(state.actors[0], { x: 780, y: 260 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.actors[0].intent, '폭탄 회수');
  stepPractice(state, RELAY_MAP);
  assert.equal(state.round.bomb.carrierId, 'home-1');
  Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: 820, y: 140, plantedTick: state.tick });
  prepareRound(state, RELAY_MAP);
  assert.match(state.actors[0].intent, /설치 후/);
  const defense = sample('away', false).state; quiet(defense);
  route(defense, 'home-1', 'defense', [{ x: 15, y: 6 }]);
  Object.assign(defense.actors[0], { x: 820, y: 140 });
  Object.assign(defense.round.bomb, { status: 'planted', carrierId: null, x: 820, y: 140, plantedTick: 0 });
  advancePractice(defense, RELAY_MAP, 8000);
  assert.equal(defense.endReason, 'defused');
});

test('수동 설정을 포함한 실제 경기의 프레임 재현·종료·세계 보존은 유지된다', () => {
  const { state, world } = sample();
  const original = structuredClone(world);
  setManualDuration(state, 'attack', 4); setManualDuration(state, 'defense', 6);
  route(state, 'home-1', 'attack', [{ x: 9, y: 1 }, { x: 19, y: 1 }]);
  route(state, 'home-1', 'defense', [{ x: 19, y: 6 }], Math.PI);
  const replay = structuredClone(state);
  for (let round = 0; round < 80 && !state.match.complete; round++) {
    startEconomyRound(state); startEconomyRound(replay);
    advancePractice(state, RELAY_MAP, 160000);
    for (let frame = 0; frame < 160 && !replay.complete; frame++) advancePractice(replay, RELAY_MAP, 1000);
    assert.equal(state.complete, true); assert.equal(replay.complete, true);
    assert.deepEqual(state, replay);
    if (!state.match.complete) { nextEconomyRound(state, RELAY_MAP); nextEconomyRound(replay, RELAY_MAP); }
  }
  assert.equal(state.match.complete, true);
  assert.deepEqual(world, original);
});
