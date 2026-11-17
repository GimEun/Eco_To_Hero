import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { prepareRound, resolveRound } from '../src/simulation/round.js';
import { startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { setManualRoute, setManualSmoke, manualSmokeFor, setManualDuration, clearManualRoute, manualPlanFor, settleManualRound } from '../src/simulation/manual-tactics.js';
import { canOccupy, cellCenter } from '../src/simulation/geometry.js';
import { autoThrow, updateThrowables } from '../src/simulation/throwables.js';
import { moveActors } from '../src/simulation/actor-movement.js';

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

test('연막 위치만 저장해도 자동 전술을 유지하며 잘못된 위치·상대 선수는 거부한다', () => {
  const { state } = sample(), actor = state.actors[0], smoke = { cell: { x: 3, y: 2 } };
  assert.equal(setManualSmoke(state, RELAY_MAP, actor.id, 'attack', smoke).ok, true);
  smoke.cell.x = 10;
  assert.deepEqual(manualSmokeFor(state, actor), { cell: { x: 3, y: 2 } });
  assert.equal(manualPlanFor(state, actor), null);
  const before = structuredClone(state);
  for (const value of [{ cell: { x: 5, y: 2 } }, { cell: { x: -1, y: 2 } }, { cell: { x: 3.5, y: 2 } }, {}]) {
    assert.equal(setManualSmoke(state, RELAY_MAP, actor.id, 'attack', value).ok, false);
    assert.deepEqual(state, before);
  }
  assert.equal(setManualSmoke(state, RELAY_MAP, 'away-1', 'attack', null).ok, false);
  assert.equal(setManualSmoke(state, RELAY_MAP, actor.id, 'bad', null).ok, false);
  assert.deepEqual(state, before);
});

test('범위 밖·벽 뒤에서는 연막을 보존하고 던질 수 있는 위치에 오면 자동으로 한 번 던진다', () => {
  const { state } = sample(), actor = state.actors[0];
  assert.equal(setManualSmoke(state, RELAY_MAP, actor.id, 'attack', { cell: { x: 9, y: 4 } }).ok, true);
  actor.throwables.smoke = 1; quiet(state); startEconomyRound(state);
  autoThrow(state, RELAY_MAP); assert.equal(actor.throwables.smoke, 1);
  Object.assign(actor, cellCenter(RELAY_MAP, { x: 4, y: 4 }));
  autoThrow(state, RELAY_MAP); assert.equal(actor.throwables.smoke, 1, '벽이 투척을 막는다');
  Object.assign(actor, cellCenter(RELAY_MAP, { x: 8, y: 4 }));
  autoThrow(state, RELAY_MAP); autoThrow(state, RELAY_MAP);
  assert.equal(actor.throwables.smoke, 0); assert.equal(state.projectiles.length, 1);
  assert.deepEqual(state.projectiles[0].to, cellCenter(RELAY_MAP, { x: 9, y: 4 }));
  state.tick = state.projectiles[0].detonateTick; updateThrowables(state, RELAY_MAP);
  assert.equal(state.smokes.length, 1); assert.equal(state.smokes[0].radius, 70);
});

test('위치 지정은 선수 이동을 멈추지 않고 미보유·해제도 기존 경로를 유지한다', () => {
  const { state, world } = sample(), actor = state.actors[0], original = structuredClone(world);
  assert.equal(route(state, actor.id, 'attack', [{ x: 3, y: 4 }, { x: 3, y: 6 }]).ok, true);
  assert.equal(setManualSmoke(state, RELAY_MAP, actor.id, 'attack', { cell: { x: 3, y: 2 } }).ok, true);
  const before = structuredClone(state.manualPlans.attack.players[actor.id]);
  assert.equal(setManualSmoke(state, RELAY_MAP, actor.id, 'attack', null).ok, true);
  assert.equal(manualSmokeFor(state, actor), null);
  assert.deepEqual(state.manualPlans.attack.players[actor.id], before);
  setManualSmoke(state, RELAY_MAP, actor.id, 'attack', { cell: { x: 3, y: 2 } });
  quiet(state); startEconomyRound(state); advancePractice(state, RELAY_MAP, 2000);
  assert.ok(actor.y > 200, '연막이 없어도 경유점을 계속 이동한다');
  assert.deepEqual(world, original);
});

test('사망·폭탄 행동·섬광·타임아웃·구매·종료 상태는 위치 지정 연막도 제한한다', () => {
  for (const blocked of ['dead', 'action', 'flash', 'timeout', 'buy', 'complete']) {
    const { state } = sample(), actor = state.actors[0];
    setManualSmoke(state, RELAY_MAP, actor.id, 'attack', { cell: { x: 3, y: 2 } });
    actor.throwables.smoke = 1; quiet(state); startEconomyRound(state);
    if (blocked === 'dead') actor.alive = false;
    if (blocked === 'action') actor.action = 'plant';
    if (blocked === 'flash') actor.flashUntilTick = 100;
    if (blocked === 'timeout') state.timeout.active = true;
    if (blocked === 'buy') state.economy.phase = 'buy';
    if (blocked === 'complete') state.complete = true;
    autoThrow(state, RELAY_MAP);
    assert.equal(actor.throwables.smoke, 1, blocked);
    assert.equal(state.projectiles.length, 0, blocked);
  }
});

test('위치만 지정한 연막도 진영별 기간·라운드 재시작을 따르고 수비에서 투척한다', () => {
  const { state } = sample('away'), actor = state.actors[0];
  setManualSmoke(state, RELAY_MAP, actor.id, 'defense', { cell: { x: 20, y: 4 } });
  actor.throwables.smoke = 1; quiet(state); startEconomyRound(state); autoThrow(state, RELAY_MAP);
  assert.equal(actor.throwables.smoke, 0); assert.equal(state.round.manualSmokeThrown[actor.id], true);
  for (const other of state.actors.filter(other => other.team === 'away')) other.alive = false;
  stepPractice(state, RELAY_MAP); assert.equal(nextEconomyRound(state, RELAY_MAP), true);
  assert.deepEqual(state.round.manualSmokeThrown, {});
  assert.equal(state.manualPlans.defense.remaining, 3);
  assert.ok(manualSmokeFor(state, actor));
});

test('위치 지정 투척은 프레임 분할에 무관하며 이동·점수 재현을 유지한다', () => {
  const { state } = sample(), actor = state.actors[0];
  setManualSmoke(state, RELAY_MAP, actor.id, 'attack', { cell: { x: 3, y: 2 } });
  actor.throwables.smoke = 1; startEconomyRound(state);
  const split = structuredClone(state);
  advancePractice(state, RELAY_MAP, 3000);
  for (let step = 0; step < 6; step++) advancePractice(split, RELAY_MAP, 500);
  assert.deepEqual(split, state);
});

test('같은 마지막 경유점에 모인 수비 5명은 주변에서 도착하고 이동을 반복하지 않는다', () => {
  const { state, world } = sample('away'), original = structuredClone(world);
  const home = state.actors.filter(actor => actor.team === 'home');
  for (const actor of home) assert.equal(route(state, actor.id, 'defense', [{ x: 9, y: 6 }]).ok, true);
  for (const actor of state.actors) { actor.viewRange = 0; if (actor.team === 'away') actor.speed = 0; }
  startEconomyRound(state);
  for (let tick = 0; tick < 1000; tick++) stepPractice(state, RELAY_MAP);
  assert.ok(home.every(actor => state.round.manualProgress[actor.id]?.arrived), '5명 모두 마지막 지점 주변에 도착해야 한다');
  for (let first = 0; first < home.length; first++) for (let second = first + 1; second < home.length; second++) {
    assert.ok(Math.hypot(home[first].x - home[second].x, home[first].y - home[second].y) >= home[first].radius + home[second].radius - 1e-7);
  }
  const positions = home.map(actor => [actor.x, actor.y]);
  for (let tick = 0; tick < 100; tick++) stepPractice(state, RELAY_MAP);
  assert.deepEqual(home.map(actor => [actor.x, actor.y]), positions);
  assert.deepEqual(world, original);
});

test('수동 경로 앞의 정지한 아군은 우회하지 않고 기다렸다가 길이 열리면 뒤따른다', () => {
  const { state } = sample();
  const [leader, follower] = state.actors;
  for (const actor of state.actors) if (![leader.id, follower.id].includes(actor.id)) actor.alive = false;
  assert.equal(route(state, follower.id, 'attack', [{ x: 3, y: 6 }, { x: 9, y: 6 }]).ok, true);
  Object.assign(leader, { x: 124, y: 260, arrived: true, speed: 0 });
  Object.assign(follower, { x: 100, y: 260, route: [{ x: 100, y: 260 }, { x: 140, y: 260 }, { x: 380, y: 260 }],
    waypoint: 1, arrived: false, objectiveKey: 'manual:home-2:attack:1:0' });
  const originalRoute = structuredClone(follower.route);
  for (let tick = 0; tick < 60; tick++) { state.tick = tick; moveActors(state, RELAY_MAP, new Set(), 50); }
  assert.equal(follower.y, 260);
  assert.equal(follower.trafficBlocked, true);
  assert.ok(follower.x <= 104 + 1e-7);
  assert.deepEqual(follower.route, originalRoute);
  const waitingX = follower.x;
  leader.x = 260;
  for (let tick = 60; tick < 80; tick++) { state.tick = tick; moveActors(state, RELAY_MAP, new Set(), 50); }
  assert.ok(follower.x > waitingX + 40);
  assert.equal(follower.y, 260);
  assert.deepEqual(follower.route, originalRoute);
});

test('같은 방향으로 이동하는 아군은 간격을 지키면서 수동 경로를 벗어나지 않는다', () => {
  const { state } = sample();
  const [leader, follower] = state.actors;
  for (const actor of state.actors) if (![leader.id, follower.id].includes(actor.id)) actor.alive = false;
  assert.equal(route(state, follower.id, 'attack', [{ x: 9, y: 6 }]).ok, true);
  Object.assign(leader, { x: 124, y: 260, route: [{ x: 124, y: 260 }, { x: 380, y: 260 }], waypoint: 1, arrived: false });
  Object.assign(follower, { x: 100, y: 260, route: [{ x: 100, y: 260 }, { x: 380, y: 260 }], waypoint: 1, arrived: false,
    objectiveKey: 'manual:home-2:attack:1:0' });
  for (let tick = 0; tick < 45; tick++) {
    state.tick = tick; moveActors(state, RELAY_MAP, new Set(), 50);
    assert.equal(follower.y, 260);
    assert.ok(leader.x - follower.x >= leader.radius + follower.radius - 1e-7);
  }
  assert.ok(follower.x > 200);
});

test('아군이 점유한 수동 중간 경유점은 건너뛰지 않고 대기 후 같은 경로로 통과한다', () => {
  const { state } = sample('away'), [leader, follower] = state.actors;
  assert.equal(route(state, leader.id, 'defense', [{ x: 20, y: 6 }]).ok, true);
  assert.equal(route(state, follower.id, 'defense', [{ x: 20, y: 6 }, { x: 19, y: 6 }]).ok, true);
  for (const actor of state.actors) { actor.viewRange = 0; if (![leader.id, follower.id].includes(actor.id)) actor.speed = 0; }
  Object.assign(leader, cellCenter(RELAY_MAP, { x: 20, y: 6 }));
  startEconomyRound(state);
  for (let tick = 0; tick < 60; tick++) stepPractice(state, RELAY_MAP);
  assert.equal(state.round.manualProgress[follower.id].index, 0);
  assert.equal(follower.trafficBlocked, true);
  assert.ok(follower.x >= 840); assert.equal(follower.y, 260);
  leader.y = 300;
  for (let tick = 0; tick < 60; tick++) stepPractice(state, RELAY_MAP);
  assert.equal(state.round.manualProgress[follower.id].index, 1);
  assert.equal(state.round.manualProgress[follower.id].arrived, true);
  assert.equal(follower.y, 260);
});

for (const map of PRACTICE_MAPS) test(`${map.name} 벽 근처의 공통 최종 경유점에서도 5명의 충돌·반복 이동 없이 도착한다`, () => {
  const world = createWorld(createClub('공통 목표').club, 42);
  const state = createPractice(map, getClubView(world), getClubView(world, world.clubs[1].id), {
    match: true, seed: 42, attackTeam: 'away', defensePlans: { home: 'standard', away: 'standard' }, attackPlans: { home: 'execute', away: 'execute' },
  });
  const home = state.actors.filter(actor => actor.team === 'home');
  for (const actor of home) assert.equal(setManualRoute(state, map, actor.id, 'defense', [{ x: 3, y: 1 }], Math.PI).ok, true);
  for (const actor of state.actors) { actor.viewRange = 0; if (actor.team === 'away') actor.speed = 0; }
  startEconomyRound(state);
  for (let tick = 0; tick < 1000; tick++) stepPractice(state, map);
  assert.ok(home.every(actor => state.round.manualProgress[actor.id]?.arrived));
  const positions = home.map(actor => [actor.x, actor.y]);
  for (let tick = 0; tick < 100; tick++) stepPractice(state, map);
  assert.deepEqual(home.map(actor => [actor.x, actor.y]), positions);
  assert.ok(home.every(actor => canOccupy(map, actor.x, actor.y, actor.radius)));
  for (const actor of home) for (const other of home.filter(other => other.id !== actor.id)) {
    assert.ok(Math.hypot(actor.x - other.x, actor.y - other.y) >= actor.radius + other.radius - 1e-7);
  }
});

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
  state.actors[1].x = 900; // 벽 경로 검사에서는 정지 아군을 비켜 두고 대기 동작은 별도로 검사한다.
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
