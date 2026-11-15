import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { canOccupy, cellCenter, findPath, moveWithCollision, rayDistance, canSee, visionPolygon } from '../src/simulation/geometry.js';
import { createPractice, stepPractice, advancePractice, visibleOpponents, STEP_MS } from '../src/simulation/practice.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';

const corridor = {
  columns: 8, rows: 6, tileSize: 40,
  walls: [
    { x: 0, y: 0, width: 8, height: 1 }, { x: 0, y: 5, width: 8, height: 1 },
    { x: 0, y: 1, width: 1, height: 4 }, { x: 7, y: 1, width: 1, height: 4 },
    { x: 3, y: 1, width: 1, height: 3 },
  ],
};
const observer = { x: 100, y: 100, facing: 0, fieldOfView: Math.PI / 2, viewRange: 200 };

test('경로·시야의 벽 좌표 재사용은 다음 호출의 맵 변경과 잘못된 입력을 가리지 않는다', () => {
  const map = structuredClone(corridor), start = { x: 1, y: 1 }, goal = { x: 6, y: 4 };
  assert.ok(findPath(map, start, goal).length > 0);
  assert.ok(visionPolygon(map, observer).some(point => point.x !== observer.x || point.y !== observer.y));
  map.walls.push({ x: 1, y: 1, width: 6, height: 4 });
  assert.deepEqual(findPath(map, start, goal), []);
  assert.ok(visionPolygon(map, observer).every(point => point.x === observer.x && point.y === observer.y));
  assert.equal(canOccupy(null, NaN, NaN), false);
  assert.deepEqual(findPath(map, { x: -1, y: 1 }, goal), []);
});

function sample() {
  const world = createWorld(createClub('연습 구단').club, 42);
  const home = getClubView(world);
  const away = getClubView(world, world.clubs.find(club => club.id !== home.id && club.leagueId === 'pc').id);
  return { world, home, away, state: createPractice(RELAY_MAP, home, away) };
}

test('선수 몸체의 벽 접촉·지도 밖·잘못된 위치를 거부하고 큰 이동의 벽 관통을 막는다', () => {
  assert.equal(canOccupy(corridor, 60, 100, 10), true);
  assert.equal(canOccupy(corridor, 120, 100, 10), false);
  assert.equal(canOccupy(corridor, 111, 100, 10), false);
  assert.equal(canOccupy(corridor, -1, 100), false);
  assert.equal(canOccupy(corridor, NaN, 100), false);
  const result = moveWithCollision(corridor, { x: 60, y: 100, radius: 10 }, { x: 260, y: 100 });
  assert.ok(result.x > 60 && result.x < 110);
  assert.equal(canOccupy(corridor, result.x, result.y, 10), true);
});

test('경로는 벽을 우회하며 도달 불가능한 시작점·목적지와 지도 밖을 거부한다', () => {
  const path = findPath(corridor, { x: 1, y: 2 }, { x: 6, y: 2 });
  assert.ok(path.some(point => point.y === 180));
  assert.deepEqual(path[0], { x: 60, y: 100 });
  assert.deepEqual(path.at(-1), { x: 260, y: 100 });
  for (let index = 1; index < path.length; index++) {
    assert.equal(Math.abs(path[index].x - path[index - 1].x) + Math.abs(path[index].y - path[index - 1].y), 40);
    assert.equal(canOccupy(corridor, (path[index].x + path[index - 1].x) / 2, (path[index].y + path[index - 1].y) / 2, 10), true);
  }
  assert.deepEqual(findPath(corridor, { x: 1, y: 2 }, { x: 3, y: 2 }), []);
  assert.deepEqual(findPath(corridor, { x: -1, y: 2 }, { x: 6, y: 2 }), []);
  assert.equal(findPath(corridor, { x: 1, y: 2 }, { x: 1, y: 2 }).length, 1);
});

test('벽 앞은 보이고 벽 뒤·시야각 밖·거리 밖은 보이지 않는다', () => {
  assert.equal(rayDistance(corridor, observer, 0, 200), 20);
  assert.equal(canSee(corridor, observer, { x: 110, y: 100 }), true);
  assert.equal(canSee(corridor, observer, { x: 200, y: 100 }), false);
  assert.equal(canSee(corridor, observer, { x: 60, y: 100 }), false);
  assert.equal(canSee(corridor, observer, { x: 301, y: 100 }), false);
  const open = { columns: 10, rows: 10, tileSize: 40, walls: [] };
  assert.equal(canSee(open, { ...observer, x: 220, facing: -Math.PI + 0.01 }, { x: 100, y: 100 }), true);
  assert.equal(canSee(open, { ...observer, facing: Math.PI }, observer), true);
});

test('시야 표시용 다각형도 같은 벽 표면에서 멈춘다', () => {
  const points = visionPolygon(corridor, observer);
  assert.ok(points.length >= 33);
  for (const point of points) {
    assert.ok(point.x <= 120 + 1e-6);
    assert.ok(Math.hypot(point.x - observer.x, point.y - observer.y) <= 200 + 1e-6);
  }
});

test('중계소의 모든 시작점·목적지는 유효하고 실제 10명은 벽을 통과하지 않고 도착한다', () => {
  const { state } = sample();
  for (const team of ['home', 'away']) {
    for (const cell of [...RELAY_MAP.spawns[team], ...RELAY_MAP.destinations[team]]) {
      const point = cellCenter(RELAY_MAP, cell);
      assert.equal(canOccupy(RELAY_MAP, point.x, point.y, 10), true);
    }
  }
  assert.equal(state.actors.length, 10);
  while (!state.complete && state.tick < 500) {
    stepPractice(state, RELAY_MAP);
    for (const actor of state.actors) {
      assert.equal(canOccupy(RELAY_MAP, actor.x, actor.y, actor.radius), true);
      assert.equal(actor.blocked, false);
    }
  }
  assert.equal(state.complete, true);
  for (const actor of state.actors) assert.deepEqual({ x: actor.x, y: actor.y }, actor.route.at(-1));
  const before = structuredClone(state);
  stepPractice(state, RELAY_MAP);
  assert.deepEqual(state, before);
});

test('렌더링 시간 묶음을 달리해도 같은 경과 시간은 같은 경기 상태가 된다', () => {
  const first = sample().state;
  const second = structuredClone(first);
  const third = structuredClone(first);
  advancePractice(first, RELAY_MAP, 5000);
  for (let index = 0; index < 100; index++) for (const ms of [7, 13, 16, 14]) advancePractice(second, RELAY_MAP, ms);
  for (let index = 0; index < 100; index++) stepPractice(third, RELAY_MAP);
  assert.equal(first.tick, 5000 / STEP_MS);
  assert.deepEqual(first, second);
  assert.deepEqual(first, third);
  assert.throws(() => advancePractice(first, RELAY_MAP, -1));
  assert.throws(() => advancePractice(first, RELAY_MAP, Infinity));
});

test('연습 생성·진행은 세계·구단·선수 원본을 변경하지 않는다', () => {
  const { world, home, away } = sample();
  const before = structuredClone(world);
  const state = createPractice(RELAY_MAP, home, away);
  advancePractice(state, RELAY_MAP, 25000);
  assert.deepEqual(world, before);
  assert.equal(state.complete, true);
});

test('60Hz·120Hz 소수 프레임 시간도 고정 단계 경계에서 같은 상태가 된다', () => {
  const base = sample().state;
  const expected = structuredClone(base);
  advancePractice(expected, RELAY_MAP, 5000);
  for (const hz of [60, 120]) {
    const state = structuredClone(base);
    for (let frame = 0; frame < hz * 5; frame++) advancePractice(state, RELAY_MAP, 1000 / hz);
    assert.deepEqual(state, expected);
  }
});

test('선택 선수의 감지 목록에는 벽·방향·팀 검사를 통과한 상대만 포함한다', () => {
  const state = { actors: [
    { ...observer, id: 'selected', team: 'home' },
    { id: 'friend', team: 'home', x: 110, y: 100 },
    { id: 'visible', team: 'away', x: 110, y: 100 },
    { id: 'hidden', team: 'away', x: 200, y: 100 },
    { id: 'behind', team: 'away', x: 60, y: 100 },
  ] };
  assert.deepEqual(visibleOpponents(state, corridor, 'selected').map(actor => actor.id), ['visible']);
  assert.deepEqual(visibleOpponents(state, corridor, 'missing'), []);
});
