import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { validateStrategyLibrary } from '../src/game/strategy-library.js';
import { createPractice, stepPractice } from '../src/simulation/practice.js';
import { setManualRoute, setManualSmoke, manualDestination } from '../src/simulation/manual-tactics.js';
import { captureStrategy, applyStrategy } from '../src/simulation/strategy-presets.js';
import { setSiteAllocation } from '../src/simulation/site-allocation.js';
import { prepareRound, setupRound } from '../src/simulation/round.js';
import { nextEconomyRound } from '../src/simulation/economy.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { canOccupy, findPath } from '../src/simulation/geometry.js';

function fixture(map = PRACTICE_MAPS[0], attackTeam = 'home', siteName = 'A') {
  const world = createWorld(createClub('전략 보관').club, 42);
  const state = createPractice(map, getClubView(world), getClubView(world, world.clubs[1].id), { economy: true, attackTeam, siteName,
    attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
  return { world, state, map };
}

test('3개 맵·공수·3개 저장칸의 수동 설정·이름·전술·배분은 v48 백업 왕복으로 보존된다', () => {
  const { world } = fixture();
  for (const map of PRACTICE_MAPS) {
    world.strategyLibrary[map.id] = {};
    for (const side of ['attack', 'defense']) {
      const { state } = fixture(map, side === 'attack' ? 'home' : 'away');
      const cell = map.spawns[side === 'attack' ? 'home' : 'away'][0];
      assert.equal(setManualRoute(state, map, 'home-1', side, [cell], 0.5).ok, true);
      assert.equal(setManualSmoke(state, map, 'home-2', side, { cell }).ok, true);
      assert.equal(setSiteAllocation(state, map, side, 3), true);
      world.strategyLibrary[map.id][side] = Array.from({ length: 3 }, (_, i) => captureStrategy(state, side, `한글 ${side} ${i}`));
    }
  }
  const restored = restoreWorld(parseBackup(JSON.stringify(createSave(world))));
  assert.deepEqual(restored, world);
  restored.strategyLibrary.relay.attack[0].players['home-1'].cells[0].x++;
  assert.notDeepEqual(restored.strategyLibrary, world.strategyLibrary);
});

test('v47 기존 구단은 새 보관함만 비우며 진행·선수·재정·기록을 그대로 보존한다', () => {
  const { world } = fixture();
  const save = createSave(world); save.schemaVersion = 47; delete save.world.strategyLibrary;
  const restored = restoreWorld(save);
  assert.deepEqual(restored, world); assert.deepEqual(restored.strategyLibrary, {});
});

test('손상 저장칸·주전 번호·기간·이름·벽 경로·연막·인원·사이트 조합을 거부한다', () => {
  const { state } = fixture();
  const good = { relay: { attack: [captureStrategy(state, 'attack', '기본'), null, null] } };
  const changes = [p => p.name = '', p => p.duration = 3, p => p.allocationA = 6, p => p.allocationA = 0,
    p => p.players['home-6'] = { cells: [{ x: 2, y: 2 }], angle: 0 },
    p => p.players['home-1'] = { cells: [{ x: 0, y: 0 }], angle: 0 },
    p => p.smokes['home-1'] = { cell: { x: 0, y: 0 } }];
  for (const change of changes) { const bad = structuredClone(good); change(bad.relay.attack[0]); assert.throws(() => validateStrategyLibrary(bad)); }
  assert.throws(() => validateStrategyLibrary({ unknown: {} }));
  assert.throws(() => validateStrategyLibrary({ relay: { attack: [] } }));
  const { world } = fixture(); const save = createSave(world); delete save.world.strategyLibrary;
  assert.throws(() => restoreWorld(save));
});

test('전략 불러오기는 주전 자리 기준으로 전체 설정과 적용 기간을 교체하고 다른 진영은 보존한다', () => {
  const { state, map } = fixture();
  setManualRoute(state, map, 'home-1', 'attack', [map.spawns.home[0]], 0.25);
  setManualSmoke(state, map, 'home-2', 'attack', { cell: map.spawns.home[1] });
  setSiteAllocation(state, map, 'attack', 3);
  const preset = captureStrategy(state, 'attack', '교체 후 재사용');
  preset.duration = 6;
  const other = fixture().state;
  other.actors[0].playerId = 'replacement';
  const defense = structuredClone(other.manualPlans.defense), random = other.randomState;
  assert.equal(applyStrategy(other, map, 'attack', preset).ok, true);
  assert.deepEqual(other.manualPlans.attack.players, preset.players);
  assert.deepEqual(other.manualPlans.attack.smokes, preset.smokes);
  assert.equal(other.manualPlans.attack.remaining, 6);
  assert.deepEqual(other.manualPlans.defense, defense); assert.equal(other.randomState, random);
  assert.equal(other.siteAllocation.home.attack, 3);
  other.attackPlans = null;
  assert.equal(applyStrategy(other, map, 'attack', preset).ok, true);
});

test('전투·타임아웃 중 또는 손상 전략 불러오기는 물리·자금·수동 설정을 변경하지 않는다', () => {
  const { state, map } = fixture();
  const preset = captureStrategy(state, 'attack', '테스트');
  for (const mode of ['bad', 'combat', 'timeout']) {
    const next = structuredClone(state), plan = structuredClone(preset);
    if (mode === 'bad') plan.players['home-1'] = { cells: [{ x: -1, y: -1 }], angle: 0 };
    else { next.round.started = true; next.economy.phase = 'combat'; if (mode === 'timeout') next.timeout.active = true; }
    const before = structuredClone(next);
    assert.equal(applyStrategy(next, map, 'attack', plan).ok, false);
    assert.deepEqual(next, before);
  }
});

test('3맵·양 진영·A/B 인원 0~5는 유효 경로와 정확한 최초 배분·폭탄 담당을 유지한다', () => {
  for (const map of PRACTICE_MAPS) for (const attackTeam of ['home', 'away']) for (const siteName of ['A', 'B']) for (let count = 0; count <= 5; count++) {
    const { state } = fixture(map, attackTeam, siteName), side = attackTeam === 'home' ? 'attack' : 'defense';
    const invalid = side === 'attack' && (siteName === 'A' ? count === 0 : count === 5);
    assert.equal(setSiteAllocation(state, map, side, count), !invalid);
    if (invalid) continue;
    const actors = state.actors.filter(actor => actor.team === 'home');
    const tasks = actors.map(actor => actor[side === 'attack' ? 'attackTask' : 'defenseTask']);
    assert.equal(tasks.filter(task => task.site === 'A').length, count);
    for (let index = 0; index < actors.length; index++) {
      const point = side === 'attack' ? tasks[index].points.at(-1) : tasks[index].anchor;
      assert.ok(canOccupy(map, point.x, point.y, 10));
      assert.ok(findPath(map, map.spawns[side === 'attack' ? 'home' : 'away'][index],
        { x: Math.floor(point.x / map.tileSize), y: Math.floor(point.y / map.tileSize) }).length);
    }
    if (side === 'attack') assert.equal(actors.find(actor => actor.id === state.round.bomb.carrierId).attackTask.site, siteName);
  }
});

test('A/B 배분은 수동 경로를 바꾸지 않고 다음 라운드·공수 교대에도 진영별로 유지된다', () => {
  const { state, map } = fixture();
  setSiteAllocation(state, map, 'attack', 3); setSiteAllocation(state, map, 'defense', 1);
  setManualRoute(state, map, 'home-1', 'attack', [map.spawns.home[0]], 0);
  prepareRound(state, map);
  assert.match(state.actors[0].objectiveKey, /^manual:/);
  assert.ok(manualDestination(state, map, state.actors[0]));
  state.complete = true; state.economy.settled = true;
  assert.equal(nextEconomyRound(state, map), true);
  assert.deepEqual(state.siteAllocation.home, { attack: 3, defense: 1 });
  setupRound(state, map, 'away', 'A');
  assert.equal(state.actors.filter(actor => actor.team === 'home' && actor.defenseTask.site === 'A').length, 1);
  state.economy.phase = 'combat'; state.round.started = true;
  const before = structuredClone(state);
  assert.equal(setSiteAllocation(state, map, 'defense', 5), false); assert.deepEqual(state, before);
});

test('배분을 설정하지 않은 경기와 보관함만 있는 새 경기는 기존 기본 배치를 사용한다', () => {
  const { state, world } = fixture();
  world.strategyLibrary.relay = { attack: [captureStrategy(state, 'attack', '보관만'), null, null] };
  const next = fixture().state;
  assert.equal(next.siteAllocation, undefined);
  assert.equal(Object.keys(next.manualPlans.attack.players).length, 0);
  assert.deepEqual(next.actors.map(actor => actor.attackTask), state.actors.map(actor => actor.attackTask));
  next.economy.phase = 'combat'; stepPractice(next, PRACTICE_MAPS[0]);
  assert.ok(next.tick > 0);
});

test('3맵·양 진영에서 모든 유효 인원 배분의 실제 라운드는 예외 없이 종료된다', () => {
  for (const map of PRACTICE_MAPS) for (const attackTeam of ['home', 'away']) for (let count = 0; count <= 5; count++) {
    const { state } = fixture(map, attackTeam), side = attackTeam === 'home' ? 'attack' : 'defense';
    if (side === 'attack' && count === 0) continue;
    assert.equal(setSiteAllocation(state, map, side, count), true);
    state.economy.phase = 'combat';
    for (let tick = 0; tick < 2400 && !state.complete; tick++) stepPractice(state, map);
    assert.equal(state.complete, true, `${map.id}/${side}/${count}`);
    for (const actor of state.actors) assert.ok(canOccupy(map, actor.x, actor.y, actor.radius));
  }
});
