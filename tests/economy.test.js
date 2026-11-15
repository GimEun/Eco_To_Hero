import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { BASIC_PISTOL, TRAINING_RIFLE, weaponFor } from '../src/data/weapons.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { resolveCombat } from '../src/simulation/combat.js';
import { prepareRound } from '../src/simulation/round.js';
import { buyRifle, startEconomyRound, updateEconomy, nextEconomyRound } from '../src/simulation/economy.js';

function sample(seed = 42, attackTeam = 'home', siteName = 'A') {
  const world = createWorld(createClub('구매 구단').club, seed);
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id),
    { economy: true, seed, attackTeam, siteName });
  return { world, state };
}

test('구매 단계는 선수마다 $800·무료 권총으로 시작하고 시간·행동이 진행되지 않는다', () => {
  const { state } = sample();
  const before = structuredClone(state);
  stepPractice(state, RELAY_MAP);
  advancePractice(state, RELAY_MAP, 160000);
  assert.deepEqual(state, before);
  for (const actor of state.actors) {
    assert.equal(actor.cash, 800);
    assert.equal(actor.weaponId, BASIC_PISTOL.id);
    assert.equal(actor.ammo, 12);
  }
  assert.equal(nextEconomyRound(state, RELAY_MAP), false);
});

test('부족 자금·상대 선수·없는 선수 구매는 상태를 바꾸지 않는다', () => {
  const { state } = sample();
  const before = structuredClone(state);
  for (const id of ['home-1', 'away-1', 'missing']) assert.equal(buyRifle(state, id).ok, false);
  assert.deepEqual(state, before);
});

test('정확히 $2700이면 소총을 구매하고 중복 구매·전투 중 구매를 거부한다', () => {
  const { state } = sample();
  const actor = state.actors[0];
  actor.cash = 2699;
  assert.equal(buyRifle(state, actor.id).ok, false);
  actor.cash = 2700;
  assert.equal(buyRifle(state, actor.id).ok, true);
  assert.equal(actor.cash, 0);
  assert.equal(actor.ammo, 30);
  const bought = structuredClone(state);
  assert.equal(buyRifle(state, actor.id).ok, false);
  assert.deepEqual(state, bought);
  startEconomyRound(state);
  state.actors[1].cash = 16000;
  assert.equal(buyRifle(state, state.actors[1].id).ok, false);
});

test('상대 자동 구매도 같은 가격·예산·보유 조건을 따르고 시작을 중복 처리하지 않는다', () => {
  const { state } = sample();
  const [rich, poor, owner] = state.actors.slice(5);
  rich.cash = 2700; poor.cash = 2699;
  owner.cash = 5000; owner.weaponId = TRAINING_RIFLE.id;
  assert.equal(startEconomyRound(state), true);
  assert.equal(rich.cash, 0); assert.equal(rich.weaponId, TRAINING_RIFLE.id);
  assert.equal(poor.cash, 49); assert.equal(poor.weaponId, 'smg'); assert.equal(poor.armor, 100);
  assert.deepEqual(poor.throwables, { flashbang: 1, grenade: 0, smoke: 1 });
  assert.equal(owner.cash, 3550); assert.equal(owner.weaponId, TRAINING_RIFLE.id); assert.equal(owner.armor, 100);
  const before = structuredClone(state);
  assert.equal(startEconomyRound(state), false);
  assert.deepEqual(state, before);
});

function duel(weaponId) {
  const { state } = sample(0);
  startEconomyRound(state);
  state.actors = [state.actors[0], state.actors[5]];
  const [actor, target] = state.actors;
  Object.assign(actor, { weaponId, x: 100, y: 100, facing: 0, aim: 99, targetId: target.id, readyTick: 0,
    ammo: weaponId === BASIC_PISTOL.id ? 12 : 30 });
  Object.assign(target, { x: 140, y: 100, facing: Math.PI, nextShotTick: 100000, armor: 0 });
  state.tick = 1;
  return { state, actor, target };
}
const openMap = { columns: 20, rows: 10, tileSize: 40, walls: [] };

test('구매한 무기는 실제 피해·사격 간격·탄약과 이벤트에 반영된다', () => {
  for (const weapon of [BASIC_PISTOL, TRAINING_RIFLE]) {
    const { state, actor, target } = duel(weapon.id);
    resolveCombat(state, openMap);
    assert.equal(target.hp, 100 - weapon.damage);
    assert.equal(actor.ammo, weapon.magazineSize - 1);
    assert.equal(actor.nextShotTick, 1 + weapon.intervalTicks);
    assert.equal(state.events[0].weaponId, weapon.id);
    state.tick = actor.nextShotTick - 1;
    resolveCombat(state, openMap);
    assert.equal(actor.stats.shots, 1);
    state.tick++;
    resolveCombat(state, openMap);
    assert.equal(actor.stats.shots, 2);
  }
});

test('권총·소총의 실제 사거리와 재장전 시간이 다르게 적용된다', () => {
  for (const weapon of [BASIC_PISTOL, TRAINING_RIFLE]) {
    const fixture = duel(weapon.id);
    fixture.target.x = 280;
    resolveCombat(fixture.state, openMap);
    assert.equal(fixture.actor.stats.shots, weapon === BASIC_PISTOL ? 0 : 1);
    fixture.target.x = 140;
    fixture.actor.ammo = 0;
    fixture.state.tick = 20;
    resolveCombat(fixture.state, openMap);
    assert.equal(fixture.actor.reloadUntilTick, 20 + weapon.reloadTicks);
    fixture.state.tick = 20 + weapon.reloadTicks - 1;
    resolveCombat(fixture.state, openMap);
    assert.equal(fixture.actor.ammo, 0);
    fixture.state.tick++;
    resolveCombat(fixture.state, openMap);
    assert.equal(fixture.actor.ammo, weapon.magazineSize - 1);
  }
});

test('실제 처치·설치 이벤트는 사망자도 포함해 한 번씩 보상을 지급한다', () => {
  const { state } = sample(42, 'away');
  startEconomyRound(state);
  const startingCash = state.actors[5].cash;
  const startingLedger = state.economy.ledger.length;
  state.actors[5].alive = false;
  state.events.push({ type: 'death', killerId: 'away-1', actorId: 'home-1' });
  updateEconomy(state);
  assert.equal(state.actors[5].cash, startingCash + 300);
  state.events.push({ type: 'bomb-planted', actorId: 'away-2' });
  updateEconomy(state);
  assert.equal(state.actors[5].cash, startingCash + 1100);
  assert.equal(state.actors[6].cash, 150 + 800);
  assert.equal(state.actors[0].cash, 800);
  assert.equal(state.economy.ledger.length, startingLedger + 6);
  const before = structuredClone(state);
  updateEconomy(state);
  assert.deepEqual(state, before);
});

test('최종 틱의 보상·승패 정산을 중복 지급하지 않고 $16000 상한을 적용한다', () => {
  const { state } = sample();
  startEconomyRound(state);
  state.actors[0].cash = 15900;
  state.events.push({ type: 'death', killerId: 'home-1', actorId: 'away-1' }, { type: 'bomb-planted', actorId: 'home-1' });
  state.complete = true; state.round.winner = 'home';
  updateEconomy(state);
  assert.equal(state.actors[0].cash, 16000);
  assert.equal(state.actors[1].cash, 800 + 800 + 3250);
  assert.equal(state.actors[5].cash, 800 - 650 + 1400);
  assert.equal(state.economy.ledger.find(entry => entry.reason === 'kill').amount, 100);
  const before = structuredClone(state);
  updateEconomy(state); stepPractice(state, RELAY_MAP); advancePractice(state, RELAY_MAP, 160000);
  assert.deepEqual(state, before);
  assert.equal(buyRifle(state, 'home-1').ok, false);
});

test('다음 라운드는 생존 장비·잔액·난수 상태를 유지하고 사망 장비·HP·탄약·행동을 초기화한다', () => {
  const { state } = sample(42, 'away', 'B');
  startEconomyRound(state);
  const [survivor, dead] = state.actors;
  survivor.weaponId = TRAINING_RIFLE.id; survivor.hp = 10; survivor.ammo = 1;
  dead.weaponId = TRAINING_RIFLE.id; dead.alive = false; dead.hp = 0;
  dead.reloadUntilTick = 100; dead.targetId = 'away-1'; dead.stats.kills = 1;
  dead.incomingFire = { x: 100, y: 100, tick: 10 };
  state.complete = true; state.round.winner = 'away'; state.tick = 100;
  state.randomState = 12345;
  updateEconomy(state);
  const balances = state.actors.map(actor => actor.cash);
  const ledger = structuredClone(state.economy.ledger);
  assert.equal(nextEconomyRound(state, RELAY_MAP), true);
  assert.deepEqual(state.actors.map(actor => actor.cash), balances);
  assert.deepEqual(state.economy.ledger, ledger);
  assert.equal(state.randomState, 12345);
  assert.equal(state.economy.roundNumber, 2);
  assert.equal(state.economy.phase, 'buy');
  assert.equal(state.round.attackTeam, 'away'); assert.equal(state.round.siteName, 'B');
  assert.equal(survivor.weaponId, TRAINING_RIFLE.id); assert.equal(survivor.ammo, 30);
  assert.equal(dead.weaponId, BASIC_PISTOL.id); assert.equal(dead.ammo, 12);
  for (const actor of state.actors) {
    assert.equal(actor.hp, 100); assert.equal(actor.alive, true);
    assert.equal(actor.reloadUntilTick, null); assert.equal(actor.targetId, null);
    assert.equal(actor.incomingFire, null);
    assert.equal(actor.stats.kills, 0);
  }
  assert.equal(state.events.length, 0); assert.equal(state.tick, 0);
  const before = structuredClone(state);
  assert.equal(nextEconomyRound(state, RELAY_MAP), false);
  assert.deepEqual(state, before);
});

test('새 연습 생성은 이전 자금·장비·라운드 번호를 가져오지 않는다', () => {
  const first = sample().state;
  first.actors[0].cash = 16000;
  buyRifle(first, 'home-1');
  const fresh = sample().state;
  assert.equal(fresh.actors[0].cash, 800);
  assert.equal(fresh.actors[0].weaponId, BASIC_PISTOL.id);
  assert.equal(fresh.economy.roundNumber, 1);
  assert.equal(fresh.economy.ledger.length, 0);
});

test('권총 사거리 밖의 감지만으로 설치를 중단하지 않고 사거리 안에서 교전으로 전환한다', () => {
  const { state } = sample();
  startEconomyRound(state);
  const carrier = state.actors[0];
  Object.assign(carrier, { x: 820, y: 140, facing: Math.PI });
  const map = { ...RELAY_MAP, walls: [] };
  prepareRound(state, map);
  assert.equal(state.round.action?.type, 'plant');
  Object.assign(state.actors[5], { x: 640, y: 140 });
  prepareRound(state, map);
  assert.equal(state.round.action?.type, 'plant');
  resolveCombat(state, map);
  assert.equal(carrier.stats.shots, 0);
  Object.assign(state.actors[5], { x: 700, y: 140 });
  prepareRound(state, map);
  assert.equal(state.round.action, null);
});

test('여러 라운드의 실제 보상·구매 내역과 잔액이 일치하고 세계를 보존한다', () => {
  for (const side of ['home', 'away']) for (const site of ['A', 'B']) {
    const { world, state } = sample(42, side, site);
    const original = structuredClone(world);
    const replay = structuredClone(state);
    for (let round = 1; round <= 4; round++) {
      for (const current of [state, replay]) {
        for (const actor of current.actors.filter(actor => actor.team === 'home')) buyRifle(current, actor.id);
        startEconomyRound(current);
      }
      advancePractice(state, RELAY_MAP, 160000);
      for (let frame = 0; frame < 9600 && !replay.complete; frame++) advancePractice(replay, RELAY_MAP, 1000 / 60);
      assert.equal(state.complete, true);
      assert.equal(state.economy.settled, true);
      assert.deepEqual(state, replay);
      const deaths = state.events.filter(event => event.type === 'death' && !event.friendlyFire);
      const plants = state.events.filter(event => event.type === 'bomb-planted');
      const records = state.economy.ledger.filter(entry => entry.roundNumber === round);
      assert.equal(records.filter(entry => entry.reason === 'kill').length, deaths.length);
      assert.equal(records.filter(entry => entry.reason === 'plant').length, plants.length * 5);
      assert.equal(records.filter(entry => ['win', 'loss'].includes(entry.reason)).length, 10);
      for (const actor of state.actors) {
        const entries = state.economy.ledger.filter(entry => entry.actorId === actor.id);
        assert.equal(actor.cash, 800 + entries.reduce((sum, entry) => sum + entry.amount, 0));
        assert.ok(Number.isInteger(actor.cash) && actor.cash >= 0 && actor.cash <= 16000);
        assert.ok(actor.ammo >= 0 && actor.ammo <= weaponFor(actor).magazineSize);
      }
      if (round < 4) {
        nextEconomyRound(state, RELAY_MAP);
        nextEconomyRound(replay, RELAY_MAP);
      }
    }
    assert.ok(state.economy.ledger.some(entry => entry.reason === 'purchase'));
    assert.deepEqual(world, original);
  }
});
