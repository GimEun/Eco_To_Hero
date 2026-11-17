import test from 'node:test';
import assert from 'node:assert/strict';
import { defenseSmokeDestination } from '../src/simulation/defense-smoke.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { prepareRound, setupRound } from '../src/simulation/round.js';
import { canOccupy } from '../src/simulation/geometry.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';

const club = name => ({ name, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${name}${i}`, name, nickname: name, aim: 50, intelligence: 50, stamina: 50,
})) });
function fixture(inside = false, attackTeam = 'home') {
  const map = { ...RELAY_MAP, walls: [] };
  const state = createPractice(map, club('home'), club('away'), { round: true, attackTeam,
    defensePlans: { home: 'standard', away: 'standard' } });
  for (const actor of state.actors) Object.assign(actor, { x: actor.team === attackTeam ? 100 : 850,
    y: 500, viewRange: 0, speed: 0, nextShotTick: 100000, nextUtilityTick: 100000 });
  const actor = state.actors.find(actor => actor.team !== attackTeam);
  Object.assign(actor, { x: inside ? 400 : 500, y: 260, facing: Math.PI, viewRange: 240, intelligence: 100, speed: 80 });
  state.smokes = [{ x: 400, y: 260, radius: 70, expiresTick: 240 }];
  return { state, map, actor };
}

test('연막 밖 시야가 열린 수비는 자리를 유지하며 확인 방향을 2초 동안 유지한다', () => {
  for (const team of ['home', 'away']) {
    const { state, map, actor } = fixture(false, team);
    const before = { x: actor.x, y: actor.y };
    const choice = defenseSmokeDestination(state, map, actor);
    assert.equal(actor.smokeWatching, true); assert.deepEqual({ x: choice.point.x, y: choice.point.y }, before);
    const angle = choice.watchAngle;
    for (let tick = 0; tick < 40; tick++) {
      stepPractice(state, map);
      assert.deepEqual({ x: actor.x, y: actor.y }, before);
      assert.equal(actor.facing, angle);
    }
  }
});

test('연막 안 수비는 가까운 연막 밖으로 이동한 뒤 순환 이동 없이 경계한다', () => {
  const { state, map, actor } = fixture(true);
  const destination = defenseSmokeDestination(state, map, actor);
  assert.ok(destination); assert.equal(actor.smokeWatching, false);
  assert.ok(Math.hypot(destination.point.x - 400, destination.point.y - 260) >= 84);
  assert.ok(Math.hypot(destination.point.x - actor.x, destination.point.y - actor.y) <= 120 + 1e-7);
  for (let tick = 0; tick < 160; tick++) {
    stepPractice(state, map);
    assert.ok(canOccupy(map, actor.x, actor.y, actor.radius));
  }
  const settled = { x: actor.x, y: actor.y };
  for (let tick = 0; tick < 40; tick++) stepPractice(state, map);
  assert.deepEqual({ x: actor.x, y: actor.y }, settled);
  assert.equal(actor.smokeWatching, true);
});

test('같은 연막 지형에서 고지능은 더 높은 시야·중복 경계 평가의 선택을 한다', () => {
  const high = fixture(), low = fixture();
  low.actor.intelligence = 1;
  const best = defenseSmokeDestination(high.state, high.map, high.actor);
  const other = defenseSmokeDestination(low.state, low.map, low.actor);
  assert.ok(best.point.score > other.point.score);
  assert.equal(best.point.untilTick, other.point.untilTick);
  assert.equal(high.state.randomState, low.state.randomState);
});

test('수동 경로·피격·직접 관측·해체·후퇴·마감은 주변 연막 판단보다 우선한다', () => {
  for (const reason of ['manual', 'hit', 'visible', 'defuse', 'withdraw', 'deadline']) {
    const { state, map, actor } = fixture(false, reason === 'manual' ? 'away' : 'home');
    if (reason === 'manual') {
      state.manualPlans.defense.players[actor.id] = { cells: [{ x: 10, y: 6 }], angle: 0 };
    }
    if (reason === 'hit') actor.incomingFire = { x: 600, y: 260, tick: state.tick };
    if (reason === 'visible') Object.assign(state.actors[0], { x: 470, y: 280 });
    if (reason === 'defuse') state.round.bomb.status = 'planted';
    if (reason === 'withdraw') actor.defenseTask.withdrawn = true;
    if (reason === 'deadline') state.tick = 2200;
    assert.equal(defenseSmokeDestination(state, map, actor), null, reason);
  }
});

test('벽 너머·먼 연막은 무시하고 만료·다음 라운드에는 선택을 해제한다', () => {
  const { state, map, actor } = fixture();
  const wallMap = { ...map, walls: [{ x: 12, y: 0, width: 0.1, height: 16 }] };
  assert.equal(defenseSmokeDestination(state, wallMap, actor), null);
  actor.x = 700; assert.equal(defenseSmokeDestination(state, map, actor), null);
  actor.x = 500; assert.ok(defenseSmokeDestination(state, map, actor));
  state.tick = 240; assert.equal(defenseSmokeDestination(state, map, actor), null);
  setupRound(state, map, 'home', 'A');
  assert.equal(actor.defenseSmoke, null); assert.equal(actor.smokeWatching, false);
});

test('소리 기억은 연막 주변에서 유지 중인 시선을 매 틱 덮어쓰지 않는다', () => {
  const { state, map, actor } = fixture();
  actor.heardSound = { x: 400, y: 260, kind: 'footstep', tick: 0 };
  prepareRound(state, map);
  const angle = actor.facing;
  stepPractice(state, map);
  assert.equal(actor.facing, angle);
});

test('연막 재배치·경계는 프레임 분할에도 동일하게 재현된다', () => {
  const a = fixture(true), b = fixture(true);
  advancePractice(a.state, a.map, 4000);
  for (let i = 0; i < 80; i++) stepPractice(b.state, b.map);
  assert.deepEqual(a.state, b.state);
});

test('겹친 연막으로 가까운 출구가 없어도 자리에서 기다리고 매 틱 회전하지 않는다', () => {
  const { state, map, actor } = fixture(true);
  state.smokes[0].radius = 200;
  const before = { x: actor.x, y: actor.y };
  let angle;
  for (let tick = 0; tick < 80; tick++) {
    stepPractice(state, map);
    angle ??= actor.facing;
    assert.equal(actor.facing, angle);
    assert.deepEqual({ x: actor.x, y: actor.y }, before);
  }
});

test('숨은 적의 실제 위치가 바뀌어도 같은 연막·아군 정보로 같은 결정을 한다', () => {
  const a = fixture(), b = fixture();
  Object.assign(b.state.actors[0], { x: 100, y: 100 });
  assert.deepEqual(defenseSmokeDestination(a.state, a.map, a.actor), defenseSmokeDestination(b.state, b.map, b.actor));
});

test('3개 실제 맵·양 진영의 수비는 근접 연막에서도 벽 안으로 이동하지 않는다', () => {
  for (const map of PRACTICE_MAPS) for (const attackTeam of ['home', 'away']) {
    const state = createPractice(map, club('home'), club('away'), { round: true, attackTeam,
      defensePlans: { home: 'standard', away: 'standard' } });
    for (const actor of state.actors) Object.assign(actor, { viewRange: 0, speed: 0, nextShotTick: 100000, nextUtilityTick: 100000 });
    const actor = state.actors.find(actor => actor.team !== attackTeam);
    Object.assign(actor, actor.defenseTask.anchor, { viewRange: 240, speed: 80, intelligence: 100 });
    const start = { x: actor.x, y: actor.y };
    state.smokes = [{ ...start, radius: 70, expiresTick: 240 }];
    for (let tick = 0; tick < 120; tick++) {
      stepPractice(state, map);
      assert.ok(canOccupy(map, actor.x, actor.y, actor.radius), `${map.id}/${attackTeam}/${tick}`);
    }
    assert.ok(Math.hypot(actor.x - start.x, actor.y - start.y) <= 120 + 1e-7);
  }
});

test('주변 방향은 매 틱 바꾸지 않고 2초 뒤 다른 열린 방향으로 확인한다', () => {
  const { state, map, actor } = fixture();
  const first = defenseSmokeDestination(state, map, actor);
  state.tick = 39;
  assert.equal(defenseSmokeDestination(state, map, actor).watchAngle, first.watchAngle);
  state.tick = 40;
  const next = defenseSmokeDestination(state, map, actor);
  assert.ok(Math.cos(next.watchAngle - first.watchAngle) < 0.8);
  assert.equal(next.point.x, first.point.x); assert.equal(next.point.y, first.point.y);
});
