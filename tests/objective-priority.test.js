import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { ROUND_RULES } from '../src/config/round.js';
import { WEAPONS, weaponFor } from '../src/data/weapons.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { startEconomyRound } from '../src/simulation/economy.js';
import { prepareRound, resolveRound } from '../src/simulation/round.js';
import { applyCombatDamage, selectTarget } from '../src/simulation/combat.js';
import { canSee } from '../src/simulation/geometry.js';

const map = { ...RELAY_MAP, walls: [] };
const clubs = (strong = null) => ['home', 'away'].map(team => ({ name: team,
  players: Array.from({ length: 5 }, (_, index) => ({ id: `${team}-${index}`, name: `${team}-${index}`,
    nickname: `${team}-${index}`, aim: strong === team ? 65 : 45,
    intelligence: strong === team ? 65 : 45, stamina: 45 })) }));

function fixture(type, attackTeam = 'home') {
  const state = createPractice(map, ...clubs(), { round: true, attackTeam, siteName: 'A' });
  for (const actor of state.actors) Object.assign(actor, { alive: false, speed: 0, viewRange: 0, nextShotTick: 100000 });
  const actor = state.actors.find(item => type === 'plant' ? item.team === attackTeam : item.team !== attackTeam);
  const enemy = state.actors.find(item => item.team !== actor.team);
  Object.assign(actor, { alive: true, x: 820, y: 140, facing: Math.PI, viewRange: 240,
    fieldOfView: Math.PI * 2, weaponId: 'smg', ammo: 30 });
  Object.assign(enemy, { alive: true, x: 620, y: 140 });
  state.tick = 100;
  if (type === 'defuse') Object.assign(state.round.bomb,
    { status: 'planted', carrierId: null, x: actor.x, y: actor.y, plantedTick: state.tick });
  state.round.action = null;
  return { state, actor, enemy, duration: type === 'plant' ? ROUND_RULES.plantTicks : ROUND_RULES.defuseTicks,
    deadline: type === 'plant' ? ROUND_RULES.limitTicks : state.round.bomb.plantedTick + ROUND_RULES.fuseTicks };
}

function hit(state, enemy, actor) {
  applyCombatDamage(state, enemy, actor, 1, { from: { x: enemy.x, y: enemy.y } });
}

test('양 진영의 설치·해체는 보이지만 사거리 밖인 상대만으로 중단하지 않고 완료한다', () => {
  for (const attackTeam of ['home', 'away']) for (const type of ['plant', 'defuse']) {
    const { state, actor, enemy, duration } = fixture(type, attackTeam);
    assert.equal(canSee(map, actor, enemy, state), true);
    assert.equal(selectTarget(state, map, actor), null);
    const randomState = state.randomState;
    prepareRound(state, map);
    assert.equal(state.round.action?.type, type);
    assert.equal(state.randomState, randomState);
    advancePractice(state, map, duration * 50);
    assert.ok(state.events.some(event => event.type === (type === 'plant' ? 'bomb-planted' : 'bomb-defused')));
    assert.equal(state.events.filter(event => event.type === `${type}-start`).length, 1);
    assert.equal(actor.stats.shots, 0);
  }
});

test('무기별 정확한 사거리 안에서는 교전하고 밖으로 벗어나면 새로 시작하며 진행을 보존한다', () => {
  for (const type of ['plant', 'defuse']) for (const weapon of WEAPONS) {
    const { state, actor, enemy } = fixture(type);
    Object.assign(actor, { weaponId: weapon.id, viewRange: weapon.range + 40 });
    enemy.x = actor.x - weapon.range;
    prepareRound(state, map);
    assert.equal(selectTarget(state, map, actor), enemy);
    assert.equal(state.round.action, null);
    enemy.x -= 0.01;
    prepareRound(state, map);
    assert.equal(state.round.action?.startTick, 100);
    state.tick = 110; prepareRound(state, map);
    assert.equal(state.round.action.startTick, 100);
    enemy.x += 0.01;
    prepareRound(state, map);
    assert.equal(state.round.action, null); assert.equal(actor.action, null);
    state.tick++; enemy.x -= 0.01;
    prepareRound(state, map);
    assert.equal(state.round.action.startTick, 111);
  }
});

test('실제 피격은 진행을 취소하고 마지막 피해 1초 후 다시 시작하며 옛 진행을 복구하지 않는다', () => {
  for (const type of ['plant', 'defuse']) {
    const { state, actor, enemy } = fixture(type);
    actor.viewRange = 0;
    prepareRound(state, map);
    assert.equal(state.round.action.startTick, 100);
    state.tick = 120; hit(state, enemy, actor); prepareRound(state, map);
    assert.equal(state.round.action, null); assert.equal(actor.action, null);
    enemy.x = 100;
    state.tick = 140; prepareRound(state, map);
    assert.equal(state.round.action, null);
    state.tick = 141; prepareRound(state, map);
    assert.equal(state.round.action.startTick, 141);
  }
});

test('벽·연막 뒤의 실제 위치를 이용해 폭탄 행동을 중단하지 않는다', () => {
  for (const type of ['plant', 'defuse']) for (const cover of ['wall', 'smoke']) {
    const { state, actor, enemy } = fixture(type);
    enemy.x = 700;
    const covered = cover === 'wall' ? { ...map, walls: [{ x: 18, y: 3, width: 1, height: 1 }] } : map;
    if (cover === 'smoke') state.smokes = [{ x: 760, y: 140, radius: 40, expiresTick: 500 }];
    assert.ok(Math.hypot(actor.x - enemy.x, actor.y - enemy.y) < weaponFor(actor).range);
    assert.equal(canSee(covered, actor, enemy, state), false);
    prepareRound(state, covered);
    assert.equal(state.round.action?.type, type);
    enemy.x = 660;
    state.tick++; prepareRound(state, covered);
    assert.equal(state.round.action.startTick, 100);
  }
});

test('재시도 여유가 없으면 완료 가능한 마지막 틱부터 교전·피격보다 설치·해체를 우선한다', () => {
  for (const attackTeam of ['home', 'away']) for (const type of ['plant', 'defuse']) {
    const { state, actor, enemy, duration, deadline } = fixture(type, attackTeam);
    enemy.x = actor.x - 100;
    state.tick = deadline - duration - 2;
    prepareRound(state, map);
    assert.equal(state.round.action, null);
    state.tick++;
    prepareRound(state, map);
    const started = state.round.action?.startTick;
    assert.equal(started, deadline - duration - 1);
    hit(state, enemy, actor);
    prepareRound(state, map);
    assert.equal(state.round.action?.startTick, started);
    advancePractice(state, map, duration * 50);
    const completed = state.events.find(event => event.type === (type === 'plant' ? 'bomb-planted' : 'bomb-defused'));
    assert.equal(completed?.tick, deadline - 1);
    assert.equal(actor.stats.shots, 0);
  }
});

test('끝까지 계속해도 마감과 같은 틱에 완료되면 기존 시간 종료·폭발 규칙이 우선한다', () => {
  for (const type of ['plant', 'defuse']) {
    const { state, actor, duration, deadline } = fixture(type);
    actor.viewRange = 0;
    state.tick = deadline - duration;
    prepareRound(state, map);
    assert.equal(state.round.action?.type, type);
    advancePractice(state, map, duration * 50);
    assert.equal(state.endReason, type === 'plant' ? 'timeout' : 'explosion');
    assert.equal(state.events.filter(event => event.type === (type === 'plant' ? 'bomb-planted' : 'bomb-defused')).length, 0);
  }
});

test('마감 직전에도 사망한 선수의 폭탄 행동은 완료되지 않는다', () => {
  for (const type of ['plant', 'defuse']) {
    const { state, actor, enemy, duration, deadline } = fixture(type);
    enemy.x = actor.x - 100;
    state.tick = deadline - duration - 1; prepareRound(state, map);
    assert.equal(state.round.action?.type, type);
    actor.alive = false; actor.hp = 0;
    resolveRound(state);
    assert.equal(state.round.action, null);
    assert.notEqual(state.round.bomb.status, type === 'plant' ? 'planted' : 'defused');
  }
});

test('중계소 B·시드 0 혼합 장비의 설치 반복 중단 재현을 해결하고 시간 분할을 보존한다', () => {
  const state = createPractice(RELAY_MAP, ...clubs('away'), { seed: 0, economy: true, attackTeam: 'away', siteName: 'B',
    attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
  startEconomyRound(state);
  for (const actor of state.actors) {
    const weapon = WEAPONS.find(item => item.id === ['training-rifle', 'smg', 'shotgun', 'machine-gun', 'sniper'][actor.number - 1]);
    Object.assign(actor, { weaponId: weapon.id, ammo: weapon.magazineSize, armor: 100,
      throwables: { flashbang: 1, grenade: 1, smoke: 1 } });
  }
  const divided = structuredClone(state);
  advancePractice(state, RELAY_MAP, 160000);
  for (let index = 0; index < 9600 && !divided.complete; index++) advancePractice(divided, RELAY_MAP, 1000 / 60);
  assert.equal(state.complete, true);
  // Equipment and tactics can end this natural fight by either team's elimination.
  // Plant/defuse completion itself is covered by the controlled cases above.
  if (!state.events.some(event => event.type === 'bomb-planted')) {
    assert.ok(['attack-eliminated', 'defense-eliminated'].includes(state.endReason));
  }
  assert.notEqual(state.endReason, 'timeout');
  assert.deepEqual(state, divided);
});
