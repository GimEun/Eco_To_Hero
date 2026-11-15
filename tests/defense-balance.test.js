import test from 'node:test';
import assert from 'node:assert/strict';
import { createPractice, stepPractice } from '../src/simulation/practice.js';
import { prepareRound } from '../src/simulation/round.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { resolveCombat } from '../src/simulation/combat.js';

const team = name => ({ name, players: Array.from({ length: 5 }, (_, index) => ({
  id: name + index, name: name + index, nickname: name + index, aim: 50, intelligence: 50,
})) });
function sample(plan = 'standard') {
  const state = createPractice(RELAY_MAP, team('home'), team('away'), {
    round: true, defensePlans: { home: plan, away: plan },
  });
  for (const actor of state.actors) actor.viewRange = 0;
  return state;
}

test('수비는 뒤로 이동하면서도 진입로를 경계하고 적 발견 시 교전에 들어간다', () => {
  const state = sample();
  const defender = state.actors[5];
  Object.assign(defender, { x: 740, y: 260, facing: Math.PI, objectiveKey: null });
  stepPractice(state, RELAY_MAP);
  assert.ok(defender.x > 740);
  assert.ok(Math.cos(defender.facing) < -0.9);
  Object.assign(state.actors[0], { x: 600, y: 260 });
  defender.viewRange = 200;
  stepPractice(state, RELAY_MAP);
  assert.equal(defender.targetId, state.actors[0].id);
});

test('전진 감시는 함께 사격 가능한 아군이 있으면 적 2명만으로 후퇴하지 않는다', () => {
  const state = sample('forward');
  const defender = state.actors[5];
  const ally = state.actors[6];
  Object.assign(defender, { x: 660, y: 260, facing: Math.PI, viewRange: 200 });
  Object.assign(ally, { x: 700, y: 260, facing: Math.PI, viewRange: 200 });
  Object.assign(state.actors[0], { x: 540, y: 260 });
  Object.assign(state.actors[1], { x: 540, y: 280 });
  prepareRound(state, RELAY_MAP);
  assert.equal(defender.defenseTask.withdrawn, false);
  ally.alive = false; ally.hp = 0;
  prepareRound(state, RELAY_MAP);
  assert.equal(defender.defenseTask.withdrawn, true);
  assert.deepEqual(defender.defenseTask.fallback, { x: 700, y: 260 });
});

test('기동 지원은 가장 가까운 한 명보다 실제 관측한 적이 많은 구역을 지원한다', () => {
  const state = sample();
  state.round.defenseContact = { id: 'home-3', x: 650, y: 380, tick: 0 };
  state.round.defenseContacts = [
    { id: 'home-1', x: 600, y: 260, tick: 0 },
    { id: 'home-2', x: 620, y: 260, tick: 0 },
    { id: 'home-3', x: 650, y: 380, tick: 0 },
  ];
  prepareRound(state, RELAY_MAP);
  assert.equal(state.actors[9].intent, 'A 접촉 구역 지원');
  state.tick = 101;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.defenseContacts.length, 0);
});

test('A 감시와 방어는 B 접촉 정보만으로 담당 진입로에 등을 돌리지 않는다', () => {
  const state = sample();
  const defender = state.actors[5];
  state.round.defenseContact = { id: 'home-1', x: defender.x + 100, y: 500, tick: 0 };
  prepareRound(state, RELAY_MAP);
  assert.equal(defender.watchAngle, Math.PI);
});

test('여러 아군이 같은 적을 봐도 관측 수를 부풀리지 않고 숨은 현재 위치를 사용하지 않는다', () => {
  const state = sample();
  for (const actor of state.actors.slice(5, 7)) Object.assign(actor, { x: 780, y: 260, facing: Math.PI, viewRange: 200 });
  Object.assign(state.actors[0], { x: 620, y: 260 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.defenseContacts.length, 1);
  Object.assign(state.actors[0], { x: 100, y: 100 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.defenseContacts[0].x, 620);
  assert.equal(state.round.defenseContacts[0].y, 260);
});

function rearShot(victimTeam) {
  const state = sample();
  const victim = state.actors.find(actor => actor.team === victimTeam);
  const shooter = state.actors.find(actor => actor.team !== victimTeam);
  state.actors = [victim, shooter];
  Object.assign(victim, { x: 100, y: 100, facing: Math.PI, viewRange: 200, speed: 0, nextShotTick: 10000 });
  Object.assign(shooter, { x: 140, y: 100, facing: Math.PI, viewRange: 200, speed: 0, aim: 99, targetId: victim.id });
  state.randomState = 0;
  state.tick = 1;
  resolveCombat(state, RELAY_MAP);
  assert.ok(victim.hp < 100);
  return { state, victim, shooter };
}

test('공격·수비 모두 등 뒤에서 실제로 명중한 사격 방향을 확인한다', () => {
  for (const team of ['home', 'away']) {
    const { state, victim, shooter } = rearShot(team);
    stepPractice(state, RELAY_MAP);
    assert.ok(Math.cos(victim.facing) > 0.9);
    assert.equal(victim.targetId, shooter.id);
  }
});

test('피격 방향은 사격 당시 좌표이며 숨은 사수의 이동을 따라가지 않는다', () => {
  const { state, victim, shooter } = rearShot('home');
  Object.assign(shooter, { x: 700, y: 260 });
  stepPractice(state, RELAY_MAP);
  assert.deepEqual(victim.incomingFire, { x: 140, y: 100, tick: 1 });
  assert.ok(Math.abs(victim.watchAngle) < 1e-9);
  assert.equal(victim.targetId, null);
});

test('피격 방향 반응이 만료되면 교전 전용 모드도 정상 이동 시선으로 복귀한다', () => {
  const { state, victim, shooter } = rearShot('home');
  delete state.round;
  Object.assign(victim, { watchAngle: 0, speed: 80, route: [{ x: 100, y: 100 }, { x: 100, y: 180 }], waypoint: 1, arrived: false });
  Object.assign(shooter, { x: 800, y: 600 });
  state.tick = 30;
  stepPractice(state, RELAY_MAP);
  assert.ok(victim.y > 100);
  assert.ok(Math.sin(victim.facing) > 0.9);
});
