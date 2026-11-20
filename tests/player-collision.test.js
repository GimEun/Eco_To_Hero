import test from 'node:test';
import assert from 'node:assert/strict';
import { moveActors } from '../src/simulation/actor-movement.js';
import { canOccupy } from '../src/simulation/geometry.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createPractice, stepPractice } from '../src/simulation/practice.js';
import { setManualRoute } from '../src/simulation/manual-tactics.js';

const openMap = { columns: 12, rows: 10, tileSize: 40, walls: [] };
const narrowMap = { columns: 12, rows: 3, tileSize: 40, walls: [
  { x: 0, y: 0, width: 12, height: 1 }, { x: 0, y: 2, width: 12, height: 1 },
  { x: 0, y: 0, width: 1, height: 3 }, { x: 11, y: 0, width: 1, height: 3 },
] };
function actor(id, x, y, goal, extra = {}) {
  return { id, team: id.startsWith('h') ? 'home' : 'away', x, y, radius: 10, speed: 80, alive: true,
    route: [{ x, y }, goal], waypoint: 1, arrived: false, facing: 0, ...extra };
}
function assertClear(map, actors) {
  const alive = actors.filter(item => item.alive);
  for (let index = 0; index < alive.length; index++) {
    const current = alive[index];
    assert.ok(canOccupy(map, current.x, current.y, current.radius), `wall: ${current.id}`);
    for (const other of alive.slice(index + 1)) {
      assert.ok(Math.hypot(current.x - other.x, current.y - other.y) >= current.radius + other.radius - 1e-6,
        `overlap: ${current.id}/${other.id}`);
    }
  }
}
function tick(state, map) {
  const before = new Map(state.actors.map(item => [item.id, { x: item.x, y: item.y }]));
  moveActors(state, map, new Set(), 50);
  state.tick++;
  assertClear(map, state.actors);
  for (const item of state.actors) {
    const old = before.get(item.id);
    assert.ok(Math.hypot(item.x - old.x, item.y - old.y) <= item.speed * 0.05 + 1e-6);
  }
}

test('같은 목적지로 가는 선수들은 몸체 간격을 유지하고 주변에서 도착한다', () => {
  const state = { tick: 0, actors: [80, 120, 160, 200, 240].map((y, index) => actor(`h${index}`, 60, y, { x: 300, y: 160 })) };
  for (let step = 0; step < 400 && !state.actors.every(item => item.arrived); step++) tick(state, openMap);
  assert.ok(state.actors.every(item => item.arrived));
  assert.equal(new Set(state.actors.map(item => `${item.x}:${item.y}`)).size, 5);
});

test('마주 오는 양 팀은 서로 통과하지 않고 우회하며 배열 순서와 무관하게 재현된다', () => {
  const first = { tick: 0, actors: [actor('home-1', 100, 160, { x: 340, y: 160 }),
    actor('away-1', 340, 160, { x: 100, y: 160 })] };
  const second = structuredClone(first); second.actors.reverse();
  for (let step = 0; step < 250; step++) { tick(first, openMap); tick(second, openMap); }
  assert.ok(first.actors.every(item => item.arrived));
  assert.deepEqual([...first.actors].sort((a, b) => a.id.localeCompare(b.id)), [...second.actors].sort((a, b) => a.id.localeCompare(b.id)));
});

test('좁은 길에서 정지 선수를 밀거나 벽을 뚫지 않고 사망 후에는 지나간다', () => {
  const front = actor('home-1', 200, 60, { x: 300, y: 60 }, { speed: 0, action: 'plant' });
  const follower = actor('home-2', 100, 60, { x: 300, y: 60 });
  const state = { tick: 0, actors: [front, follower] };
  for (let step = 0; step < 150; step++) { tick(state, narrowMap); assert.ok(follower.x < front.x); }
  assert.equal(front.x, 200); assert.equal(front.y, 60);
  front.alive = false;
  for (let step = 0; step < 200 && !follower.arrived; step++) tick(state, narrowMap);
  assert.equal(follower.arrived, true);
});

test('양 팀은 좁은 길의 정지 선수 뒤에서 반복 회전 없이 기다리고 길이 열리면 재출발한다', () => {
  for (const team of ['home', 'away']) {
    const front = actor(`${team}-1`, 200, 60, { x: 350, y: 60 }, { speed: 0, arrived: true });
    const follower = actor(`${team}-2`, 100, 60, { x: 350, y: 60 });
    const state = { tick: 0, actors: [front, follower] };
    let lateTravel = 0;
    for (let step = 0; step < 200; step++) {
      const before = { x: follower.x, y: follower.y };
      tick(state, narrowMap);
      if (step >= 100) lateTravel += Math.hypot(follower.x - before.x, follower.y - before.y);
    }
    assert.ok(lateTravel < 1, `${team}: repeated detour distance ${lateTravel}`);
    assert.equal(follower.trafficBlocked, true);
    front.alive = false;
    for (let step = 0; step < 200 && !follower.arrived; step++) tick(state, narrowMap);
    assert.equal(follower.arrived, true);
  }
});

test('몸체가 점유한 필수 목표 주변에서는 돌지 않고 기다린 뒤 목표가 비면 도착한다', () => {
  for (const team of ['home', 'away']) {
    const blocker = actor(`${team}-1`, 260, 160, { x: 260, y: 160 }, { speed: 0, arrived: true });
    const mover = actor(`${team}-2`, 100, 160, { x: 260, y: 160 });
    const state = { tick: 0, actors: [blocker, mover], round: { bomb: { status: 'planted' }, defuserId: mover.id } };
    let lateTravel = 0;
    for (let step = 0; step < 200; step++) {
      const before = { x: mover.x, y: mover.y };
      tick(state, openMap);
      if (step >= 100) lateTravel += Math.hypot(mover.x - before.x, mover.y - before.y);
    }
    assert.ok(lateTravel < 1, `${team}: target orbit distance ${lateTravel}`);
    assert.equal(mover.arrived, false);
    blocker.alive = false;
    for (let step = 0; step < 100 && !mover.arrived; step++) tick(state, openMap);
    assert.equal(mover.arrived, true);
  }
});

test('서로 비켜설 폭이 없는 통로에서 마주친 양 팀은 회전하지 않고 통로 개방을 기다린다', () => {
  const state = { tick: 0, actors: [actor('home-1', 100, 60, { x: 340, y: 60 }), actor('away-1', 340, 60, { x: 100, y: 60 })] };
  let lateTravel = 0;
  for (let step = 0; step < 200; step++) {
    const old = state.actors.map(actor => ({ x: actor.x, y: actor.y }));
    tick(state, narrowMap);
    if (step >= 100) lateTravel += state.actors.reduce((sum, actor, index) => sum + Math.hypot(actor.x - old[index].x, actor.y - old[index].y), 0);
  }
  assert.ok(lateTravel < 1, `head-on orbit distance ${lateTravel}`);
  state.actors[1].alive = false;
  for (let step = 0; step < 150 && !state.actors[0].arrived; step++) tick(state, narrowMap);
  assert.equal(state.actors[0].arrived, true);
});

test('양 팀의 같은 동선에서는 빠른 후속 선수가 느린 선수를 따라가며 좌우로 돌지 않는다', () => {
  for (const team of ['home', 'away']) {
    const goal = { x: 420, y: 60 };
    const front = actor(`${team}-1`, 180, 60, goal, { speed: 40 });
    const follower = actor(`${team}-2`, 100, 60, goal, { speed: 92 });
    const state = { tick: 0, actors: [front, follower] };
    for (let step = 0; step < 90; step++) {
      tick(state, narrowMap);
      assert.equal(follower.y, 60);
      assert.ok(follower.x < front.x);
    }
    assert.ok(follower.x > 200);
    for (let step = 0; step < 180 && !state.actors.every(actor => actor.arrived); step++) tick(state, narrowMap);
    assert.ok(state.actors.every(actor => actor.arrived));
  }
});

test('앞선 아군과 목표가 같아도 수류탄 회피를 뒤따르기 대기로 막지 않는다', () => {
  const goal = { x: 400, y: 160 };
  const mover = actor('home-1', 100, 160, goal, { intelligence: 50, viewRange: 300, fieldOfView: Math.PI * 2 });
  const front = actor('home-2', 122, 160, goal, { viewRange: 0 });
  const state = { tick: 6, actors: [mover, front], projectiles: [{ kind: 'grenade', actorId: 'away-1',
    from: { x: 90, y: 160 }, to: { x: 90, y: 160 }, throwTick: 0, detonateTick: 20 }] };
  moveActors(state, openMap, new Set([front.id]), 50);
  assert.ok(Math.hypot(mover.x - 90, mover.y - 160) > 10);
  assert.equal(mover.grenadeEvades, 1);
  assertClear(openMap, state.actors);
});

test('큰 이동량도 이동 구간 전체에서 몸체 충돌을 검사해 선수를 관통하지 않는다', () => {
  const state = { tick: 0, actors: [actor('home-1', 100, 60, { x: 350, y: 60 }, { speed: 4000 }),
    actor('away-1', 200, 60, { x: 200, y: 60 }, { speed: 0, arrived: true })] };
  for (let step = 0; step < 10; step++) { tick(state, narrowMap); assert.ok(state.actors[0].x < 200); }
});

const team = name => ({ name, players: Array.from({ length: 5 }, (_, index) => ({
  id: `${name}-${index}`, name: `${name}-${index}`, nickname: `${name}-${index}`, aim: 50, intelligence: 50,
})) });

test('실제 집중/분산 공격은 양 시작 진영·A/B에서 매 틱 모든 생존 선수의 간격을 유지한다', () => {
  for (const plan of ['execute', 'split']) for (const side of ['home', 'away']) for (const siteName of ['A', 'B']) {
    const state = createPractice(RELAY_MAP, team('home'), team('away'), { round: true, seed: 12, attackTeam: side, siteName,
      attackPlans: { home: plan, away: plan }, defensePlans: { home: 'standard', away: 'standard' } });
    for (let step = 0; step < 3200 && !state.complete; step++) { stepPractice(state, RELAY_MAP); assertClear(RELAY_MAP, state.actors); }
    assert.equal(state.complete, true);
  }
});

test('같은 수동 경유점을 지정해도 한 점에 겹치지 않고 경계한다', () => {
  const state = createPractice(RELAY_MAP, team('home'), team('away'), { round: true,
    attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
  for (const item of state.actors) { item.viewRange = 0; if (item.team === 'away') item.speed = 0; }
  for (const id of ['home-1', 'home-2', 'home-4']) assert.equal(setManualRoute(state, RELAY_MAP, id, 'attack', [{ x: 9, y: 6 }], 0).ok, true);
  for (let step = 0; step < 250 && !state.complete; step++) { stepPractice(state, RELAY_MAP); assertClear(RELAY_MAP, state.actors); }
  assert.ok(state.actors.filter(item => ['home-1', 'home-2', 'home-4'].includes(item.id)).every(item => item.intent === '수동 지점 경계'));
});
