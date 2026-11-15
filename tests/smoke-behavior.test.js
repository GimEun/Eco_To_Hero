import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createPractice } from '../src/simulation/practice.js';
import { startEconomyRound } from '../src/simulation/economy.js';
import { autoThrow } from '../src/simulation/throwables.js';
import { canSee } from '../src/simulation/geometry.js';
import { resolveCombat, selectTarget } from '../src/simulation/combat.js';
import { moveActors } from '../src/simulation/actor-movement.js';

const map = { columns: 30, rows: 20, tileSize: 40, walls: [] };
function sample(number = 1) {
  const world = createWorld(createClub('연막 행동').club, 42);
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id), { match: true, seed: 0 });
  startEconomyRound(state);
  state.actors = [state.actors[0], state.actors[5]];
  const [actor, target] = state.actors;
  Object.assign(actor, { x: 100, y: 100, number, facing: 0, throwables: { flashbang: 0, grenade: 0, smoke: 1 } });
  Object.assign(target, { x: 240, y: 100, facing: Math.PI, throwables: { flashbang: 0, grenade: 0, smoke: 0 }, nextShotTick: 100000 });
  return { state, actor, target };
}

test('평범한 첫 접촉에는 연막을 쓰지 않고 피격 압박이 생기면 엄호에 사용한다', () => {
  const { state, actor } = sample();
  for (let tick = 0; tick <= 60; tick++) { state.tick = tick; autoThrow(state, map); }
  assert.equal(state.projectiles.length, 0);
  assert.equal(actor.throwables.smoke, 1);
  actor.incomingFire = { x: 240, y: 100, tick: state.tick };
  autoThrow(state, map);
  assert.equal(state.projectiles.length, 1);
  assert.equal(actor.throwables.smoke, 0);
  assert.ok(Math.hypot(state.projectiles[0].to.x - actor.x, state.projectiles[0].to.y - actor.y) > 70);
});

test('압박 상황에서도 선수별 반응 시간이 다르고 같은 설정은 재현되며 사격 난수는 소모하지 않는다', () => {
  const timings = [];
  for (let number = 1; number <= 5; number++) {
    const { state, actor } = sample(number);
    actor.hp = 50;
    const replay = structuredClone(state);
    const randomState = state.randomState;
    for (let tick = 0; tick < 60 && !state.projectiles.length; tick++) {
      state.tick = replay.tick = tick;
      autoThrow(state, map); autoThrow(replay, map);
    }
    assert.equal(state.projectiles.length, 1);
    assert.ok(state.projectiles[0].throwTick > 0);
    assert.deepEqual(state, replay);
    assert.equal(state.randomState, randomState);
    timings.push(state.projectiles[0].throwTick);
  }
  assert.ok(new Set(timings).size >= 4);
});

test('연막 내부에서 가까운 상대를 탐지·사격하며 먼 상대와 벽 너머는 계속 차단한다', () => {
  const { state, actor, target } = sample();
  state.smokes = [{ x: 100, y: 100, radius: 70, expiresTick: 240 }];
  Object.assign(actor, { aim: 99, targetId: target.id, readyTick: 0, nextShotTick: 0 });
  Object.assign(target, { x: 124, armor: 0 });
  assert.equal(canSee(map, actor, target, state), true);
  assert.equal(selectTarget(state, map, actor), target);
  resolveCombat(state, map);
  assert.ok(actor.stats.shots > 0);
  assert.ok(target.hp < 100);
  target.x = 160;
  assert.equal(canSee(map, actor, target, state), false);
  target.x = 124;
  assert.equal(canSee({ ...map, walls: [{ x: 2.8, y: 0, width: 0.1, height: 10 }] }, actor, target, state), false);
});

test('연막 속에서도 기존 목적지 이동을 계속한다', () => {
  const { state, actor, target } = sample();
  target.x = 400;
  state.smokes = [{ x: 140, y: 100, radius: 70, expiresTick: 240 }];
  Object.assign(actor, { route: [{ x: 100, y: 100 }, { x: 180, y: 100 }], waypoint: 1, arrived: false, action: null, watchAngle: null });
  for (let tick = 0; tick < 20; tick++) { state.tick = tick; moveActors(state, map, new Set(), 50); }
  assert.equal(actor.arrived, true);
  assert.equal(actor.x, 180);
  assert.equal(actor.y, 100);
});

test('시야 밖에서 피격돼도 확인된 사격 방향에 연막을 쓰며 보이지 않는 상대에게 수류탄은 던지지 않는다', () => {
  const { state, actor, target } = sample();
  target.x = 340;
  actor.hp = 25;
  actor.incomingFire = { x: 340, y: 100, tick: 0 };
  actor.throwables = { smoke: 1, grenade: 1, flashbang: 1 };
  assert.equal(canSee(map, actor, target, state), false);
  for (let tick = 0; tick < 35 && !state.projectiles.length; tick++) { state.tick = tick; autoThrow(state, map); }
  assert.equal(state.projectiles.length, 1);
  assert.equal(state.projectiles[0].kind, 'smoke');
  assert.equal(actor.throwables.grenade, 1);
  assert.equal(actor.throwables.flashbang, 1);
});
