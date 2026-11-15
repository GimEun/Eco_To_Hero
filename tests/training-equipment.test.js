import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { BASIC_PISTOL, WEAPONS, weaponFor } from '../src/data/weapons.js';
import { createPractice, stepPractice } from '../src/simulation/practice.js';
import { buyEquipment, startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { resolveCombat, hitProbability, selectTarget } from '../src/simulation/combat.js';
import { economyPanel, renderEconomy } from '../src/ui/economy-panel.js';

const openMap = { columns: 30, rows: 10, tileSize: 40, walls: [] };
function sample(match = false) {
  const world = createWorld(createClub('장비 훈련').club, 42);
  return { world, state: createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id), { economy: true, match, seed: 0 }) };
}
function duel(weaponId, armor = 0, distance = 40) {
  const { state } = sample();
  startEconomyRound(state);
  state.actors = [state.actors[0], state.actors[5]];
  const [actor, target] = state.actors;
  Object.assign(actor, { weaponId, ammo: WEAPONS.find(w => w.id === weaponId).magazineSize,
    x: 100, y: 100, facing: 0, aim: 99, viewRange: 400, targetId: target.id, readyTick: 0 });
  Object.assign(target, { x: 100 + distance, y: 100, facing: Math.PI, armor, nextShotTick: 100000 });
  state.tick = 1;
  return { state, actor, target };
}
function finish(state, winner = 'home') {
  startEconomyRound(state);
  for (const actor of state.actors) if (actor.team !== winner) Object.assign(actor, { alive: false, hp: 0 });
  stepPractice(state, RELAY_MAP);
  assert.equal(state.complete, true);
}

test('여섯 무기를 구매하면 가격·탄창이 적용되고 거부된 구매는 상태를 보존한다', () => {
  for (const weapon of WEAPONS.filter(w => w.price)) {
    const { state, world } = sample();
    const originalWorld = structuredClone(world);
    const actor = state.actors[0];
    actor.cash = weapon.price - 1;
    const before = structuredClone(state);
    assert.equal(buyEquipment(state, actor.id, weapon.id).ok, false);
    assert.deepEqual(state, before);
    actor.cash++;
    assert.equal(buyEquipment(state, actor.id, weapon.id).ok, true);
    assert.equal(actor.cash, 0);
    assert.equal(weaponFor(actor), weapon);
    assert.equal(actor.ammo, weapon.magazineSize);
    assert.equal(buyEquipment(state, actor.id, weapon.id).ok, false);
    assert.deepEqual(world, originalWorld);
  }
});

test('무기 교체·권총 복귀는 이번 구매액만 환불하며 반복해도 자금이 증가하지 않는다', () => {
  const { state } = sample();
  const actor = state.actors[0];
  actor.cash = 5000;
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const weapon of WEAPONS.slice(1)) {
      assert.equal(buyEquipment(state, actor.id, weapon.id).ok, true);
      assert.equal(actor.cash, 5000 - weapon.price);
    }
    assert.equal(buyEquipment(state, actor.id, BASIC_PISTOL.id).ok, true);
    assert.equal(actor.cash, 5000);
  }
  assert.equal(buyEquipment(state, actor.id, 'armor').ok, true);
  assert.equal(actor.cash, 4350);
});

test('이월 무기는 환불하지 않고 새로 산 교체 무기만 환불한다', () => {
  const { state } = sample();
  const actor = state.actors[0];
  actor.cash = 7000;
  buyEquipment(state, actor.id, 'sniper');
  buyEquipment(state, actor.id, 'armor');
  actor.armor = 37;
  finish(state);
  assert.equal(nextEconomyRound(state, RELAY_MAP), true);
  const starting = actor.cash;
  assert.equal(actor.weaponId, 'sniper');
  assert.equal(actor.armor, 37);
  assert.equal(actor.weaponPurchaseCost, 0);
  buyEquipment(state, actor.id, 'smg');
  assert.equal(actor.cash, starting - 1500);
  buyEquipment(state, actor.id, BASIC_PISTOL.id);
  assert.equal(actor.cash, starting);
});

test('상대·없는 선수·알 수 없는 장비·진행 중 구매는 변경 없이 차단한다', () => {
  const { state } = sample();
  for (const [id, equipment] of [['away-1', 'armor'], ['missing', 'smg'], ['home-1', 'missing']]) {
    const before = structuredClone(state);
    assert.equal(buyEquipment(state, id, equipment).ok, false);
    assert.deepEqual(state, before);
  }
  startEconomyRound(state);
  const before = structuredClone(state);
  for (const equipment of ['smg', 'armor', BASIC_PISTOL.id]) assert.equal(buyEquipment(state, 'home-1', equipment).ok, false);
  assert.deepEqual(state, before);
});

test('방탄복 구매는 비용·최대 내구도·손상 후 재구매를 처리한다', () => {
  const { state } = sample();
  const actor = state.actors[0];
  actor.cash = 649;
  assert.equal(buyEquipment(state, actor.id, 'armor').ok, false);
  actor.cash = 1300;
  assert.equal(buyEquipment(state, actor.id, 'armor').ok, true);
  assert.equal(actor.armor, 100);
  assert.equal(actor.cash, 650);
  assert.equal(buyEquipment(state, actor.id, 'armor').ok, false);
  actor.armor = 25;
  assert.equal(buyEquipment(state, actor.id, 'armor').ok, true);
  assert.equal(actor.cash, 0);
  assert.equal(actor.armor, 100);
});

test('모든 무기의 실제 명중 피해·사격 간격·탄창·재장전이 적용된다', () => {
  for (const weapon of WEAPONS) {
    const { state, actor, target } = duel(weapon.id);
    resolveCombat(state, openMap);
    assert.equal(target.hp, 100 - weapon.damage);
    assert.equal(actor.ammo, weapon.magazineSize - 1);
    assert.equal(actor.nextShotTick, 1 + weapon.intervalTicks);
    assert.equal(actor.stats.damage, weapon.damage);
    assert.equal(state.events[0].weaponId, weapon.id);
    if (!target.alive) {
      assert.equal(actor.stats.kills, 1);
      assert.equal(target.stats.deaths, 1);
    }
    const reload = duel(weapon.id);
    reload.actor.ammo = 0;
    resolveCombat(reload.state, openMap);
    assert.equal(reload.actor.reloadUntilTick, 1 + weapon.reloadTicks);
    reload.state.tick = weapon.reloadTicks;
    resolveCombat(reload.state, openMap);
    assert.equal(reload.actor.ammo, 0);
    reload.state.tick++;
    resolveCombat(reload.state, openMap);
    assert.equal(reload.actor.reloadUntilTick, null);
    assert.equal(reload.actor.ammo, weapon.magazineSize - 1);
  }
});

test('방탄복은 총탄의 25%를 정수로 막고 내구도 부족 시 남은 만큼만 막는다', () => {
  for (const [armor, hp, remaining] of [[100, 25, 75], [7, 7, 0], [0, 0, 0]]) {
    const { state, actor, target } = duel('sniper', armor);
    resolveCombat(state, openMap);
    assert.equal(target.hp, hp);
    assert.equal(target.armor, remaining);
    assert.equal(actor.stats.damage, 100 - hp);
    assert.equal(actor.stats.kills, hp === 0 ? 1 : 0);
    assert.equal(state.events[0].damage, 100 - hp);
    assert.equal(state.events[0].absorbed, armor - remaining);
  }
});

test('산탄총은 거리별 피해가 줄고 사거리 밖에서는 발사하지 않는다', () => {
  for (const [distance, damage] of [[40, 80], [80, 48], [120, 16], [121, 0]]) {
    const { state, actor, target } = duel('shotgun', 0, distance);
    resolveCombat(state, openMap);
    assert.equal(target.hp, 100 - damage);
    assert.equal(actor.stats.shots, damage ? 1 : 0);
  }
});

test('무기별 사거리·시야·벽 및 이동 명중률을 지킨다', () => {
  const { state, actor, target } = duel('sniper', 0, 250);
  assert.equal(selectTarget(state, openMap, actor), target);
  actor.viewRange = 200;
  assert.equal(selectTarget(state, openMap, actor), null);
  actor.viewRange = 400;
  assert.equal(selectTarget(state, { ...openMap, walls: [{ x: 5, y: 0, width: 1, height: 10 }] }, actor), null);
  target.x = 180;
  const penalties = {};
  for (const id of ['smg', 'training-rifle', 'machine-gun', 'sniper']) {
    actor.weaponId = id;
    actor.moving = false;
    const standing = hitProbability(actor, target);
    actor.moving = true;
    penalties[id] = standing - hitProbability(actor, target);
  }
  assert.ok(penalties.smg < penalties['training-rifle']);
  assert.ok(penalties['machine-gun'] > penalties['training-rifle']);
  assert.ok(penalties.sniper > penalties['machine-gun']);
});

test('상대도 같은 비용으로 다양한 무기를 구매하고 시작 중복은 차단한다', () => {
  const { state } = sample();
  for (const actor of state.actors.slice(5)) actor.cash = 8000;
  assert.equal(startEconomyRound(state), true);
  assert.equal(new Set(state.actors.slice(5).map(actor => actor.weaponId)).size, 5);
  for (const actor of state.actors.slice(5)) {
    assert.equal(actor.cash, 8000 - weaponFor(actor).price - 650 - 800);
    assert.deepEqual(actor.throwables, { flashbang: 1, grenade: 1, smoke: 1 });
    assert.equal(actor.armor, 100);
    assert.equal(actor.weaponPurchaseCost, 0);
  }
  const before = structuredClone(state);
  assert.equal(startEconomyRound(state), false);
  assert.deepEqual(state, before);
});

test('사망·후반전·연장에서 방탄복과 무기가 함께 초기화된다', () => {
  const { state } = sample(true);
  for (let round = 0; round < 25; round++) {
    const actor = state.actors[0];
    Object.assign(actor, { armor: 88, weaponId: 'sniper' });
    finish(state, round < 12 ? 'home' : 'away');
    const dead = state.actors.find(item => !item.alive);
    dead.armor = 33;
    assert.equal(nextEconomyRound(state, RELAY_MAP), true);
    assert.equal(dead.armor, 0);
    assert.equal(dead.weaponId, BASIC_PISTOL.id);
    if ([11, 23].includes(round)) for (const item of state.actors) {
      assert.equal(item.armor, 0);
      assert.equal(item.weaponId, BASIC_PISTOL.id);
      assert.equal(item.cash, round === 11 ? 800 : 10000);
    }
  }
});

test('장비 구매 화면은 총기 6종·가격·방탄복과 환불 규칙을 표시한다', () => {
  const { state } = sample();
  const entries = new Map();
  const panel = { querySelector(key) { if (!entries.has(key)) entries.set(key, {}); return entries.get(key); } };
  renderEconomy(panel, state);
  const players = entries.get('.equipment-players').innerHTML;
  const shop = entries.get('.equipment-shop').innerHTML;
  assert.equal((players.match(/data-equipment-actor=/g) ?? []).length, 5);
  assert.equal((shop.match(/data-equipment="armor"/g) ?? []).length, 1);
  for (const weapon of WEAPONS) assert.ok(shop.includes(`data-equipment="${weapon.id}"`));
  assert.match(shop, /is-owned[\s\S]*기본 권총/);
  assert.match(shop, /자금 부족/);
  assert.doesNotMatch(players + shop, /away-/);
  assert.match(economyPanel(), /이전 라운드에서 가져온 무기는 환불하지 않습니다/);
  startEconomyRound(state);
  renderEconomy(panel, state);
  assert.match(entries.get('.equipment-shop').innerHTML, /data-buy="home-1" data-equipment="armor" disabled/);
});

test('선택 선수만 구매창에 표시하고 적팀 자금 내역은 제외하며 경기 상태를 보존한다', () => {
  const { state } = sample();
  state.actors[1].cash = 5000;
  state.economy.ledger.push(...['home-2', 'away-1'].map(actorId => ({ actorId, roundNumber: 1, reason: 'kill', amount: 300, requested: 300, balance: 5000 })));
  const before = structuredClone(state);
  const entries = new Map();
  const panel = { querySelector(key) { if (!entries.has(key)) entries.set(key, {}); return entries.get(key); } };
  renderEconomy(panel, state, 'home-2');
  assert.match(entries.get('.equipment-players').innerHTML, /data-equipment-actor="home-2" aria-pressed="true"/);
  assert.match(entries.get('.equipment-shop').innerHTML, /data-buy="home-2"/);
  assert.doesNotMatch(entries.get('.equipment-shop').innerHTML, /data-buy="home-1"/);
  assert.ok(entries.get('.economy-ledger ol').innerHTML.includes(state.actors[1].nickname));
  assert.ok(!entries.get('.economy-ledger ol').innerHTML.includes(state.actors[5].nickname));
  assert.deepEqual(state, before);
  renderEconomy(panel, state, 'away-1');
  assert.match(entries.get('.equipment-shop').innerHTML, /data-buy="home-1"/);
});
