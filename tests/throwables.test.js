import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { THROWABLES, emptyThrowables } from '../src/data/throwables.js';
import { createPractice, advancePractice, stepPractice, visibleOpponents } from '../src/simulation/practice.js';
import { buyEquipment, startEconomyRound, nextEconomyRound, updateEconomy } from '../src/simulation/economy.js';
import { autoThrow, updateThrowables } from '../src/simulation/throwables.js';
import { canSee, sightRange, visionPolygon } from '../src/simulation/geometry.js';
import { hitProbability, selectTarget } from '../src/simulation/combat.js';
import { summarizeRound } from '../src/simulation/highlights.js';

const openMap = { columns: 30, rows: 20, tileSize: 40, walls: [] };
function sample() {
  const world = createWorld(createClub('투척물 훈련').club, 42);
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id), { match: true, seed: 0 });
  return { world, state };
}
function encounter(kind) {
  const { state, world } = sample();
  assert.equal(buyEquipment(state, 'home-1', kind).ok, true);
  startEconomyRound(state);
  for (const actor of state.actors) Object.assign(actor, { x: 1000, y: 600, nextShotTick: 100000, throwables: emptyThrowables() });
  const [actor, target] = [state.actors[0], state.actors[5]];
  Object.assign(actor, { x: 100, y: 100, facing: 0, throwables: { ...emptyThrowables(), [kind]: 1 } });
  Object.assign(target, { x: 240, y: 100, facing: Math.PI, armor: 0 });
  if (kind === 'smoke') {
    actor.hp = 50;
  }
  for (let tick = 0; tick < 60 && !state.projectiles.length; tick++) { state.tick = tick; autoThrow(state, openMap); }
  assert.equal(state.projectiles.length, 1);
  assert.equal(actor.throwables[kind], 0);
  const projectile = state.projectiles[0];
  return { state, world, actor, target, projectile };
}
function detonate(state, map = openMap) {
  state.tick = state.projectiles[0].detonateTick;
  updateThrowables(state, map);
}

test('투척물 종류별 한 개·정확한 비용·자금 부족·진행 중 구매 제한을 적용한다', () => {
  for (const item of THROWABLES) {
    const { state, world } = sample();
    const originalWorld = structuredClone(world);
    const actor = state.actors[0];
    actor.cash = item.price - 1;
    const before = structuredClone(state);
    assert.equal(buyEquipment(state, actor.id, item.id).ok, false);
    assert.deepEqual(state, before);
    actor.cash++;
    assert.equal(buyEquipment(state, actor.id, item.id).ok, true);
    assert.equal(actor.cash, 0);
    assert.equal(actor.throwables[item.id], 1);
    actor.cash = 800;
    assert.equal(buyEquipment(state, actor.id, item.id).ok, false);
    assert.equal(buyEquipment(state, 'away-1', item.id).ok, false);
    startEconomyRound(state);
    assert.equal(buyEquipment(state, actor.id, item.id).ok, false);
    assert.deepEqual(world, originalWorld);
  }
});

test('자동 투척은 보유량을 한 번 차감하고 지연 후 폭발하며 사망한 투척자의 장비도 폭발한다', () => {
  const { state, actor, target, projectile } = encounter('grenade');
  autoThrow(state, openMap);
  assert.equal(state.projectiles.length, 1);
  state.tick = projectile.detonateTick - 1;
  updateThrowables(state, openMap);
  assert.equal(target.hp, 100);
  actor.alive = false;
  detonate(state);
  assert.equal(target.hp, 50);
  assert.equal(state.projectiles.length, 0);
  assert.equal(actor.stats.damage, 50);
  const before = structuredClone(state);
  updateThrowables(state, openMap);
  assert.deepEqual(state, before);
});

test('수류탄은 거리별 피해와 방탄복 감소량을 실제 HP·피해·도움·처치 보상에 반영한다', () => {
  for (const [offset, armor, hp, remaining] of [[0, 0, 50, 0], [35, 0, 75, 0], [0, 100, 63, 87], [70, 0, 100, 0]]) {
    const { state, actor, target } = encounter('grenade');
    target.x += offset; target.armor = armor;
    detonate(state);
    assert.equal(target.hp, hp);
    assert.equal(target.armor, remaining);
    assert.equal(actor.stats.damage, 100 - hp);
    assert.equal(actor.stats.shots, 0);
  }
  const { state, actor, target } = encounter('grenade');
  target.hp = 30;
  target.damageBy['home-2'] = 10;
  const cash = actor.cash;
  detonate(state);
  assert.equal(actor.stats.kills, 1);
  assert.equal(actor.stats.damage, 30);
  assert.equal(target.stats.deaths, 1);
  assert.equal(state.actors[1].stats.assists, 1);
  updateEconomy(state);
  assert.equal(actor.cash, cash + 300);
  assert.equal(summarizeRound(state.events)[0].type, 'first-kill');
});

test('아군 피해·자해도 사망을 일으키지만 처치·피해 통계와 보상을 부풀리지 않는다', () => {
  for (const self of [false, true]) {
    const { state, actor, target, projectile } = encounter('grenade');
    target.x = 600;
    const victim = self ? actor : state.actors[1];
    Object.assign(victim, { x: projectile.to.x, y: projectile.to.y, hp: 20, armor: 0 });
    const cash = actor.cash;
    detonate(state);
    assert.equal(victim.alive, false);
    assert.equal(victim.stats.deaths, 1);
    assert.equal(actor.stats.kills, 0);
    assert.equal(actor.stats.damage, 0);
    updateEconomy(state);
    assert.equal(actor.cash, cash);
    assert.equal(state.events.find(event => event.type === 'death').friendlyFire, true);
    assert.deepEqual(summarizeRound(state.events), []);
  }
});

test('섬광탄·수류탄은 폭발 위치와 피해자 사이 벽을 통과하지 않는다', () => {
  for (const kind of ['grenade', 'flashbang']) {
    const { state } = encounter(kind);
    const behindWall = state.actors[6];
    Object.assign(behindWall, { x: 300, y: 100, armor: 0 });
    const exposed = structuredClone(state);
    detonate(exposed);
    assert.ok(kind === 'grenade' ? exposed.actors[6].hp < 100 : exposed.actors[6].flashUntilTick > exposed.tick);
    detonate(state, { ...openMap, walls: [{ x: 6.5, y: 0, width: 0.5, height: 10 }] });
    assert.equal(behindWall.hp, 100);
    assert.equal(behindWall.flashUntilTick, 0);
  }
});

test('섬광은 아군에도 적용하고 최대 2초 동안 시야·명중률을 낮춘 후 원상 복구한다', () => {
  const { state, actor, target, projectile } = encounter('flashbang');
  const ally = state.actors[1];
  Object.assign(ally, { x: projectile.to.x + 10, y: projectile.to.y });
  const range = target.viewRange;
  const accuracy = hitProbability(target, actor, state);
  detonate(state);
  assert.equal(target.flashUntilTick, state.tick + 40);
  assert.ok(ally.flashUntilTick > state.tick);
  assert.ok(ally.flashUntilTick < target.flashUntilTick);
  assert.equal(sightRange(target, state), range * 0.35);
  assert.ok(hitProbability(target, actor, state) < accuracy);
  assert.equal(canSee(openMap, target, actor, state), false);
  state.tick += 40;
  assert.equal(sightRange(target, state), range);
  assert.equal(hitProbability(target, actor, state), accuracy);
  assert.equal(canSee(openMap, target, actor, state), true);
});

test('연막은 양 팀·내부·가로지르는 시야/표적을 차단하고 12초 후 사라진다', () => {
  const { state, actor, target } = encounter('smoke');
  assert.equal(canSee(openMap, actor, target, state), true);
  detonate(state);
  assert.equal(state.smokes[0].expiresTick, state.tick + 240);
  assert.equal(canSee(openMap, actor, target, state), false);
  assert.equal(canSee(openMap, target, actor, state), false);
  assert.deepEqual(visibleOpponents(state, openMap, actor.id), []);
  assert.equal(selectTarget(state, openMap, actor), null);
  target.x = 300;
  assert.equal(canSee(openMap, actor, target, state), false);
  assert.equal(canSee(openMap, { ...actor, y: 300 }, { ...target, y: 300 }, state), true);
  assert.equal(canSee(openMap, { ...actor, x: 400 }, { ...target, x: 500 }, state), true);
  target.x = 240;
  actor.x = state.smokes[0].x;
  assert.equal(canSee(openMap, actor, target, state), false);
  assert.ok(visionPolygon(openMap, actor, state).every(point => Math.hypot(point.x - actor.x, point.y - actor.y) <= 32 + 1e-7));
  actor.x = 100;
  state.tick += 240;
  updateThrowables(state, openMap);
  assert.equal(state.smokes.length, 0);
  assert.equal(canSee(openMap, actor, target, state), true);
});

test('투척 판단은 벽·현재 시야·아군 근접·설치/해체 행동과 같은 장소 중복 투척을 피한다', () => {
  for (const blocked of ['wall', 'ally', 'action', 'dead']) {
    const { state, actor, target } = encounter('grenade');
    state.projectiles = []; actor.throwables.grenade = 1; actor.nextUtilityTick = 0;
    if (blocked === 'ally') Object.assign(state.actors[1], { x: target.x, y: target.y });
    if (blocked === 'action') actor.action = 'plant';
    if (blocked === 'dead') actor.alive = false;
    autoThrow(state, blocked === 'wall' ? { ...openMap, walls: [{ x: 4, y: 0, width: 1, height: 10 }] } : openMap);
    assert.equal(state.projectiles.length, 0);
    assert.equal(actor.throwables.grenade, 1);
  }
  const { state, target } = encounter('grenade');
  const ally = state.actors[1];
  Object.assign(ally, { x: 100, y: 110, facing: 0, throwables: { ...emptyThrowables(), grenade: 1 } });
  for (let tick = 0; tick < 30; tick++) { state.tick++; autoThrow(state, openMap); }
  assert.equal(state.projectiles.length, 1);
  assert.equal(ally.throwables.grenade, 1);
  assert.equal(target.hp, 100);
});

test('타임아웃·구매 단계·종료 상태에서는 투척과 효과 시간이 진행되지 않는다', () => {
  const { state } = encounter('grenade');
  state.timeout.active = true;
  const before = structuredClone(state);
  advancePractice(state, RELAY_MAP, 100000);
  stepPractice(state, RELAY_MAP);
  updateThrowables(state, RELAY_MAP);
  autoThrow(state, RELAY_MAP);
  assert.deepEqual(state, before);
});

test('미사용 장비는 생존 시 유지하고 사망·후반전·연장에서 제거되며 효과는 라운드마다 초기화한다', () => {
  const { state } = sample();
  for (let round = 0; round < 25; round++) {
    for (const actor of state.actors) actor.throwables = { flashbang: 1, grenade: 1, smoke: 1 };
    startEconomyRound(state);
    for (const actor of state.actors) if (actor.team !== (round < 12 ? 'home' : 'away')) Object.assign(actor, { alive: false, hp: 0 });
    stepPractice(state, RELAY_MAP);
    assert.equal(state.complete, true);
    const dead = state.actors.find(actor => !actor.alive);
    state.smokes.push({ x: 100, y: 100, radius: 70, expiresTick: 1000 });
    state.projectiles.push({ kind: 'grenade' });
    assert.equal(nextEconomyRound(state, RELAY_MAP), true);
    assert.deepEqual(state.smokes, []);
    assert.deepEqual(state.projectiles, []);
    assert.deepEqual(dead.throwables, emptyThrowables());
    for (const actor of state.actors) assert.equal(actor.flashUntilTick, 0);
    if ([11, 23].includes(round)) for (const actor of state.actors) assert.deepEqual(actor.throwables, emptyThrowables());
    else assert.deepEqual(state.actors.find(actor => actor.team === (round < 12 ? 'home' : 'away')).throwables, { flashbang: 1, grenade: 1, smoke: 1 });
  }
});

test('투척물이 있는 실제 라운드는 프레임 분할·배속/스킵과 무관하게 같고 구단 저장 상태를 보존한다', () => {
  const { state, world } = sample();
  const originalWorld = structuredClone(world);
  for (const actor of state.actors) actor.cash = 8000;
  for (const actor of state.actors.filter(actor => actor.team === 'home')) {
    for (const id of ['training-rifle', 'armor', 'grenade', 'flashbang', 'smoke']) assert.equal(buyEquipment(state, actor.id, id).ok, true);
  }
  startEconomyRound(state);
  const split = structuredClone(state);
  advancePractice(state, RELAY_MAP, 160000);
  for (let frame = 0; frame < 1280 && !split.complete; frame++) advancePractice(split, RELAY_MAP, 125);
  assert.equal(state.complete, true);
  assert.deepEqual(split, state);
  assert.ok(state.events.some(event => event.type === 'utility-thrown'));
  assert.ok(state.events.some(event => event.type === 'utility-detonated'));
  assert.deepEqual(world, originalWorld);
  for (const actor of state.actors) {
    assert.ok(actor.hp >= 0 && actor.hp <= 100);
    assert.ok(actor.armor >= 0 && actor.armor <= 100);
    assert.ok(Object.values(actor.throwables).every(count => count === 0 || count === 1));
  }
});
