import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { WAREHOUSE_MAP as map } from '../src/data/maps/warehouse.js';
import { RESEARCH_MAP } from '../src/data/maps/research.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { startEconomyRound, nextEconomyRound, buyRifle } from '../src/simulation/economy.js';
import { canOccupy, cellCenter, findPath, canSee } from '../src/simulation/geometry.js';
import { defenseDestination } from '../src/simulation/defense-tactics.js';

function sample(options = {}, currentMap = map) {
  const world = createWorld(createClub('창고 검증').club, 42);
  const state = createPractice(currentMap, getClubView(world), getClubView(world, world.clubs[1].id), {
    round: true, seed: 42, attackPlans: { home: 'execute', away: 'execute' },
    defensePlans: { home: 'standard', away: 'standard' }, ...options,
  });
  return { state, world };
}

test('세 맵의 모든 시작점·사이트·경로·경계·수비/지원 목표는 벽 밖에서 연결된다', () => {
  assert.equal(PRACTICE_MAPS.length, 3);
  assert.notDeepEqual(PRACTICE_MAPS[0].walls, map.walls);
  assert.notDeepEqual(RESEARCH_MAP.walls, map.walls);
  assert.notDeepEqual(RESEARCH_MAP.walls, PRACTICE_MAPS[0].walls);
  for (const current of PRACTICE_MAPS) {
    const cells = [...current.spawns.home, ...current.spawns.away, ...current.destinations.home, ...current.destinations.away];
    const add = ([x, y]) => cells.push({ x, y });
    for (const site of current.sites) {
      for (let y = site.y; y < site.y + site.height; y++) for (let x = site.x; x < site.x + site.width; x++) cells.push({ x, y });
      const attack = current.tactics.attackSites[site.name];
      [...attack.main, ...attack.flank, ...attack.entry, ...attack.support, ...attack.guards, attack.plant].forEach(add);
      assert.ok(attack.plant[0] >= site.x && attack.plant[0] < site.x + site.width);
      assert.ok(attack.plant[1] >= site.y && attack.plant[1] < site.y + site.height);
    }
    for (const task of current.tactics.defenseTasks) {
      [task.standard, task.forward, task.fallback, task.forwardFallback].filter(Boolean).forEach(add);
    }
    for (const plan of Object.values(current.tactics.support)) Object.values(plan).forEach(add);
    for (const cell of cells) {
      const point = cellCenter(current, cell);
      assert.ok(canOccupy(current, point.x, point.y, 10), `${current.id} ${cell.x},${cell.y}`);
      assert.ok(findPath(current, current.spawns.home[0], cell, 10).length);
      assert.ok(findPath(current, current.spawns.away[0], cell, 10).length);
    }
  }
});

test('화물 선반은 실제 시야를 막고 중앙 통로는 보이며 지원 목표는 창고 데이터를 사용한다', () => {
  const observer = { ...cellCenter(map, { x: 5, y: 3 }), facing: 0, fieldOfView: Math.PI, viewRange: 900 };
  assert.equal(canSee(map, observer, cellCenter(map, { x: 10, y: 3 })), false);
  observer.y = cellCenter(map, { x: 5, y: 7 }).y;
  assert.equal(canSee(map, observer, cellCenter(map, { x: 18, y: 7 })), true);
  const { state } = sample({ attackTeam: 'away' });
  state.round.defenseContact = { x: 500, y: 200, tick: 0 };
  state.round.defenseContacts = [{ id: 'away-1', x: 500, y: 200, tick: 0 }];
  const supporter = state.actors.find(a => a.id === 'home-5');
  assert.deepEqual(defenseDestination(state, supporter, map).point, cellCenter(map, { x: 19, y: 5 }));
});

for (const currentMap of [map, RESEARCH_MAP]) test(`${currentMap.name} 양 진영·A/B·공격/수비 전술 16조건은 종료하며 매 틱 벽/선수 겹침을 막는다`, () => {
  const map = currentMap;
  for (const attackTeam of ['home', 'away']) for (const siteName of ['A', 'B']) {
    for (const attack of ['execute', 'split']) for (const defense of ['standard', 'forward']) {
      const { state, world } = sample({ attackTeam, siteName,
        attackPlans: { home: attack, away: attack }, defensePlans: { home: defense, away: defense } }, map);
      const before = structuredClone(world);
      for (let tick = 0; tick < 3200 && !state.complete; tick++) {
        stepPractice(state, map);
        const alive = state.actors.filter(a => a.alive);
        for (const actor of alive) assert.ok(canOccupy(map, actor.x, actor.y, actor.radius));
        for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
          assert.ok(Math.hypot(alive[i].x - alive[j].x, alive[i].y - alive[j].y) >= alive[i].radius + alive[j].radius - 1e-6);
        }
      }
      assert.equal(state.complete, true);
      assert.ok(['home', 'away'].includes(state.round.winner));
      assert.deepEqual(world, before);
    }
  }
});

for (const currentMap of [map, RESEARCH_MAP]) test(`${currentMap.name} A/B에서 실제 설치·해체·폭발 시간 규칙이 작동한다`, () => {
  const map = currentMap;
  for (const siteName of ['A', 'B']) for (const defuse of [false, true]) {
    const { state } = sample({ siteName }, map);
    for (const actor of state.actors) { actor.speed = 0; actor.viewRange = 0; }
    const carrier = state.actors.find(a => a.id === state.round.bomb.carrierId);
    const [x, y] = map.tactics.attackSites[siteName].plant;
    Object.assign(carrier, cellCenter(map, { x, y }));
    advancePractice(state, map, 4100);
    assert.equal(state.round.bomb.status, 'planted');
    assert.ok(state.events.some(e => e.type === 'bomb-planted'));
    Object.assign(carrier, cellCenter(map, map.spawns.home[carrier.number - 1]));
    if (defuse) {
      const defender = state.actors.find(a => a.id === 'away-1');
      Object.assign(defender, { x: state.round.bomb.x, y: state.round.bomb.y });
      state.round.defuserId = defender.id;
      advancePractice(state, map, 7100);
      assert.equal(state.endReason, 'defused');
    } else {
      advancePractice(state, map, 40100);
      assert.equal(state.endReason, 'explosion');
    }
    assert.equal(state.complete, true);
  }
});

for (const currentMap of [map, RESEARCH_MAP]) test(`${currentMap.name} MR12는 구매·교대·최종 기록을 유지하고 일반 관전과 스킵의 계산이 같다`, () => {
  const map = currentMap;
  const { state, world } = sample({ match: true }, map);
  const replay = structuredClone(state);
  const original = structuredClone(world);
  for (let round = 0; round < 80 && !state.match.complete; round++) {
    for (const current of [state, replay]) {
      for (const actor of current.actors.filter(a => a.team === 'home')) buyRifle(current, actor.id);
      startEconomyRound(current);
    }
    advancePractice(state, map, 160000);
    while (!replay.complete) advancePractice(replay, map, 2000);
    assert.deepEqual(state, replay);
    assert.equal(state.complete, true);
    if (!state.match.complete) { nextEconomyRound(state, map); nextEconomyRound(replay, map); }
    if (round === 11) assert.equal(state.round.attackTeam, 'away');
  }
  assert.equal(state.match.complete, true);
  assert.ok(state.match.history.length >= 13);
  assert.ok(state.match.history.every(round => round.highlights.some(e => e.type === 'round-end')));
  assert.deepEqual(world, original);
});

for (const currentMap of [map, RESEARCH_MAP]) test(`${currentMap.name} 이동·시야와 교전 전용 모드도 기존 종료 규칙으로 작동한다`, () => {
  const map = currentMap;
  for (const combat of [false, true]) {
    const { state } = sample({ round: false, combat, attackPlans: null, defensePlans: null }, map);
    advancePractice(state, map, 160000);
    assert.equal(state.complete, true);
    assert.equal(state.round, undefined);
    if (!combat) assert.ok(state.actors.every(a => a.arrived));
  }
});

test('연구 시설 칸막이는 시야를 막고 연결 통로는 관통되며 수비 지원 위치가 맞는다', () => {
  const map = RESEARCH_MAP;
  const observer = { ...cellCenter(map, { x: 6, y: 3 }), facing: 0, fieldOfView: Math.PI, viewRange: 900 };
  assert.equal(canSee(map, observer, cellCenter(map, { x: 8, y: 3 })), false);
  observer.y = cellCenter(map, { x: 6, y: 6 }).y;
  assert.equal(canSee(map, observer, cellCenter(map, { x: 8, y: 6 })), true);
  const { state } = sample({ attackTeam: 'away' }, map);
  state.round.defenseContact = { x: 500, y: 200, tick: 0 };
  state.round.defenseContacts = [{ id: 'away-1', x: 500, y: 200, tick: 0 }];
  const supporter = state.actors.find(a => a.id === 'home-5');
  assert.deepEqual(defenseDestination(state, supporter, map).point, cellCenter(map, { x: 18, y: 6 }));
});
