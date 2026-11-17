import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createPractice, stepPractice } from '../src/simulation/practice.js';
import { setManualCarrier, setManualRoute } from '../src/simulation/manual-tactics.js';
import { assignAttackTasks, setAttackPlan } from '../src/simulation/attack-tactics.js';
import { setSiteAllocation } from '../src/simulation/site-allocation.js';
import { setupRound, resolveRound, prepareRound } from '../src/simulation/round.js';
import { captureStrategy, applyStrategy } from '../src/simulation/strategy-presets.js';
import { validateStrategyLibrary } from '../src/game/strategy-library.js';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';

const club = name => ({ name, players: Array.from({ length: 5 }, (_, index) => ({
  id: `${name}${index}`, name, nickname: `${name}${index}`, aim: 50, intelligence: 50, stamina: 50,
})) });
function fixture(map = PRACTICE_MAPS[0], siteName = 'A') {
  return createPractice(map, club('home'), club('away'), { round: true, siteName,
    attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
}

test('3맵·A/B·주전 1~5 모두 수동 경로 완료 후 담당 선수 본인이 실제 설치한다', () => {
  for (const map of PRACTICE_MAPS) for (const site of ['A', 'B']) for (let number = 1; number <= 5; number++) {
    const state = fixture(map, site), id = `home-${number}`;
    for (const actor of state.actors) Object.assign(actor, { viewRange: 0, speed: actor.id === id ? 80 : 0 });
    assert.equal(setManualCarrier(state, id).ok, true);
    assert.equal(setSiteAllocation(state, map, 'attack', site === 'A' ? 1 : 4), true);
    assert.equal(state.actors.find(actor => actor.id === id).attackTask.site, site);
    const [x, y] = map.tactics.attackSites[site].main.at(-1);
    assert.equal(setManualRoute(state, map, id, 'attack', [{ x, y }], 0).ok, true);
    for (let tick = 0; tick < 2301 && !state.complete && state.round.bomb.status !== 'planted'; tick++) stepPractice(state, map);
    const planted = state.events.find(event => event.type === 'bomb-planted');
    assert.equal(planted?.actorId, id, `${map.id}/${site}/${number}`);
    assert.equal(state.round.manualProgress[id].arrived, true);
  }
});

test('수동 담당을 바꾸면 역할은 맞교환하고 자동 전술·배분 변경이 담당을 3번으로 되돌리지 않는다', () => {
  const map = PRACTICE_MAPS[0];
  for (let number = 1; number <= 5; number++) {
    const state = fixture();
    assert.equal(setManualCarrier(state, `home-${number}`).ok, true);
    assignAttackTasks(state, map, 'home');
    assert.equal(setAttackPlan(state, map, 'split'), true);
    assert.equal(setSiteAllocation(state, map, 'attack', 1), true);
    const actors = state.actors.filter(actor => actor.team === 'home');
    assert.equal(state.round.bomb.carrierId, `home-${number}`);
    assert.equal(actors.find(actor => actor.attackTask.role === 'carrier').number, number);
    assert.deepEqual(actors.map(actor => actor.attackTask.slot).sort(), [0, 1, 2, 3, 4]);
    setupRound(state, map, 'away', 'A'); setupRound(state, map, 'home', 'A');
    assert.equal(state.round.bomb.carrierId, `home-${number}`);
  }
});

test('다섯 수동 선수가 같은 마지막 지점을 공유해도 후미 담당이 대열을 마친 뒤 설치한다', () => {
  for (const map of PRACTICE_MAPS) for (const site of ['A', 'B']) {
    const state = fixture(map, site);
    for (const actor of state.actors) { actor.viewRange = 0; if (actor.team !== 'home') actor.speed = 0; }
    setManualCarrier(state, 'home-5'); assignAttackTasks(state, map, 'home');
    const [x, y] = map.tactics.attackSites[site].main.at(-1);
    for (let number = 1; number <= 5; number++) assert.equal(setManualRoute(state, map, `home-${number}`, 'attack', [{ x, y }], 0).ok, true);
    for (let tick = 0; tick < 2301 && !state.complete && state.round.bomb.status !== 'planted'; tick++) stepPractice(state, map);
    assert.equal(state.events.find(event => event.type === 'bomb-planted')?.actorId, 'home-5', `${map.id}/${site}`);
  }
});

test('시작 후·타임아웃·상대·사망자·없는 선수 지정은 상태를 변경하지 않는다', () => {
  for (const mode of ['started', 'timeout', 'enemy', 'dead', 'missing']) {
    const state = fixture();
    if (mode === 'started' || mode === 'timeout') state.round.started = true;
    if (mode === 'timeout') state.timeout.active = true;
    if (mode === 'dead') state.actors[0].alive = false;
    const before = structuredClone(state);
    assert.equal(setManualCarrier(state, mode === 'enemy' ? 'away-1' : mode === 'missing' ? 'missing' : 'home-1').ok, false);
    assert.deepEqual(state, before);
  }
});

test('담당 사망 시 기존 낙하·회수가 작동하고 지정 담당에게 폭탄을 되돌리지 않는다', () => {
  const state = fixture(), map = PRACTICE_MAPS[0];
  setManualCarrier(state, 'home-5'); assignAttackTasks(state, map, 'home');
  const actor = state.actors[4], picker = state.actors[0];
  Object.assign(actor, { alive: false, hp: 0 });
  state.round.started = true;
  resolveRound(state);
  assert.equal(state.round.bomb.status, 'dropped');
  picker.x = actor.x; picker.y = actor.y;
  resolveRound(state);
  assert.equal(state.round.bomb.carrierId, picker.id);
  assignAttackTasks(state, map, 'home');
  assert.equal(state.round.bomb.carrierId, picker.id);
});

test('보관함·백업은 지정 주전 자리를 보존하고 기존 v48 전략은 3번 기본값으로 읽는다', () => {
  const state = fixture(), map = PRACTICE_MAPS[0];
  setManualCarrier(state, 'home-2'); assignAttackTasks(state, map, 'home');
  const preset = captureStrategy(state, 'attack', '2번 담당');
  const world = createWorld(createClub('담당 보관').club, 42);
  world.strategyLibrary.relay = { attack: [preset, null, null] };
  const restored = restoreWorld(createSave(world));
  const next = fixture();
  assert.equal(applyStrategy(next, map, 'attack', restored.strategyLibrary.relay.attack[0]).ok, true);
  assert.equal(next.round.bomb.carrierId, 'home-2');
  assert.equal(next.manualPlans.attack.carrierNumber, 2);
  next.actors[1].alive = false;
  const before = structuredClone(next);
  assert.equal(applyStrategy(next, map, 'attack', restored.strategyLibrary.relay.attack[0]).ok, false);
  assert.deepEqual(next, before);
  delete preset.carrierNumber;
  const checked = validateStrategyLibrary({ relay: { attack: [preset, null, null] } });
  assert.equal(checked.relay.attack[0].carrierNumber, 3);
  for (const value of [0, 6, '2', null]) {
    preset.carrierNumber = value;
    assert.throws(() => validateStrategyLibrary({ relay: { attack: [preset, null, null] } }));
  }
});

function enteredSite(map = PRACTICE_MAPS[0], siteName = 'A') {
  const state = fixture(map, 'A');
  setManualCarrier(state, 'home-5'); assignAttackTasks(state, map, 'home');
  setManualRoute(state, map, 'home-5', 'attack', [map.spawns.home[0]], 0);
  for (const actor of state.actors) Object.assign(actor, { viewRange: 0, speed: 0, nextShotTick: 100000 });
  const actor = state.actors[4], site = map.sites.find(site => site.name === siteName);
  Object.assign(actor, { x: (site.x + 0.5) * map.tileSize, y: (site.y + 0.5) * map.tileSize, speed: 80, facing: 0 });
  state.round.started = true;
  return { state, actor, enemy: state.actors[5] };
}

test('3맵·A/B 진입 즉시 남은 수동 경로를 멈추고 해당 사이트에서 4초 설치한다', () => {
  for (const map of PRACTICE_MAPS) for (const siteName of ['A', 'B']) {
    const { state, actor } = enteredSite(map, siteName);
    const before = { x: actor.x, y: actor.y };
    prepareRound(state, map);
    assert.equal(state.round.siteName, siteName);
    assert.equal(state.round.initialSiteName, 'A');
    assert.equal(actor.action, 'plant');
    assert.equal(state.round.manualProgress[actor.id].arrived, false);
    for (let tick = 0; tick < 80; tick++) {
      stepPractice(state, map);
      assert.deepEqual({ x: actor.x, y: actor.y }, before);
    }
    assert.equal(state.round.bomb.status, 'planted');
    assert.equal(state.events.find(event => event.type === 'bomb-planted').actorId, actor.id);
    const [x, y] = map.tactics.attackSites[siteName].plant;
    assert.deepEqual(actor.attackTask.plant, { x: (x + 0.5) * map.tileSize, y: (y + 0.5) * map.tileSize });
  }
});

test('사이트 내 사격 가능한 적과 실제 교전한 뒤 적이 사라지면 즉시 설치한다', () => {
  const map = { ...PRACTICE_MAPS[0], walls: [] };
  const { state, actor, enemy } = enteredSite(map);
  const before = { x: actor.x, y: actor.y };
  Object.assign(actor, { viewRange: 240, aim: 99, nextShotTick: 0 });
  Object.assign(enemy, { x: actor.x + 40, y: actor.y, hp: 1 });
  prepareRound(state, map);
  assert.equal(actor.action, null); assert.equal(state.round.action, null);
  for (let tick = 0; tick < 100 && enemy.alive; tick++) {
    stepPractice(state, map);
    assert.deepEqual({ x: actor.x, y: actor.y }, before);
  }
  assert.equal(enemy.alive, false);
  assert.ok(state.events.some(event => event.type === 'shot' && event.actorId === actor.id && event.targetId === enemy.id));
  stepPractice(state, map);
  assert.equal(actor.action, 'plant');
  for (let tick = 0; tick < 80; tick++) stepPractice(state, map);
  assert.equal(state.round.bomb.status, 'planted');
});

test('설치 도중 교전이 생기면 중단하고, 시야 밖·사거리 밖 적만으로 설치를 막지 않는다', () => {
  const map = { ...PRACTICE_MAPS[0], walls: [] };
  const { state, actor, enemy } = enteredSite(map);
  actor.viewRange = 240; actor.weaponId = 'basic-pistol';
  prepareRound(state, map); assert.equal(actor.action, 'plant');
  state.tick = 20;
  Object.assign(enemy, { x: actor.x + 40, y: actor.y });
  prepareRound(state, map); assert.equal(actor.action, null); assert.equal(state.round.action, null);
  enemy.x = actor.x - 40;
  prepareRound(state, map); assert.equal(actor.action, 'plant');
  enemy.x = actor.x + 200;
  prepareRound(state, map); assert.equal(actor.action, 'plant');
});

test('최근 피격은 방향 확인 후 설치하며 수동 담당은 마감 임박에도 보이는 적과 교전한다', () => {
  const map = { ...PRACTICE_MAPS[0], walls: [] };
  const { state, actor, enemy } = enteredSite(map);
  actor.incomingFire = { x: actor.x + 40, y: actor.y, tick: 0 };
  prepareRound(state, map); assert.equal(actor.action, null);
  state.tick = 21; prepareRound(state, map); assert.equal(actor.action, 'plant');
  Object.assign(actor, { viewRange: 240 });
  Object.assign(enemy, { x: actor.x + 40, y: actor.y });
  state.tick = 2219;
  prepareRound(state, map); assert.equal(actor.action, null);
});
