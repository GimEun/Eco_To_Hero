import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createPractice, stepPractice } from '../src/simulation/practice.js';
import { prepareRound } from '../src/simulation/round.js';

const club = name => ({ name, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${name}${i}`, name: `${name}${i}`, aim: 50, intelligence: 50,
})) });

function fixture(attackTeam = 'home', injured = false) {
  const state = createPractice(RELAY_MAP, club('home'), club('away'), {
    round: true, attackTeam, siteName: 'A', defensePlans: { home: 'standard', away: 'standard' },
  });
  for (const actor of state.actors) Object.assign(actor, { alive: false, hp: 0, viewRange: 0 });
  const planter = state.actors.find(actor => actor.team === attackTeam);
  const defender = state.actors.find(actor => actor.team !== attackTeam && actor.number === 3);
  Object.assign(planter, { alive: true, hp: 100, x: 820, y: 140 });
  Object.assign(defender, { alive: true, hp: injured ? 30 : 100,
    ...defender.defenseTask.fallback, objectiveKey: null });
  defender.defenseTask.withdrawn = injured;
  state.tick = 20;
  state.round.defenseContact = { id: planter.id, x: 820, y: 140, tick: 19 };
  state.round.defenseContacts = [{ ...state.round.defenseContact }];
  return { state, defender, planter };
}

test('마지막 수비수는 양 진영·저체력에서도 설치 완료 전에 최근 관측 위치로 실제 이동한다', () => {
  for (const attackTeam of ['home', 'away']) for (const injured of [false, true]) {
    const { state, defender } = fixture(attackTeam, injured);
    const before = { x: defender.x, y: defender.y };
    prepareRound(state, RELAY_MAP);
    assert.equal(state.round.action?.type, 'plant');
    assert.equal(defender.intent, '마지막 수비 · 최근 관측 위치 대응');
    assert.ok(defender.objectiveKey.includes('lone-contact:820:140'));
    stepPractice(state, RELAY_MAP);
    assert.ok(Math.hypot(defender.x - before.x, defender.y - before.y) > 0);
    assert.equal(state.round.bomb.status, 'carried');
    assert.equal(defender.retreating, false);
  }
});

test('설치 행동과 숨은 적의 현재 좌표를 바꿔도 최근 관측 위치에 대한 경로는 같다', () => {
  const a = fixture(), b = fixture();
  Object.assign(b.planter, { x: 100, y: 100 });
  prepareRound(a.state, RELAY_MAP); prepareRound(b.state, RELAY_MAP);
  assert.equal(a.state.round.action?.type, 'plant');
  assert.equal(b.state.round.action, null);
  assert.deepEqual(a.defender.route, b.defender.route);
  assert.equal(a.defender.watchAngle, b.defender.watchAngle);
});

test('아군 생존 시 담당 구역을 유지하고 관측이 없거나 5초가 지나면 숨은 설치에 반응하지 않는다', () => {
  for (const mode of ['ally', 'none', 'expired']) {
    const { state, defender } = fixture();
    if (mode === 'ally') {
      const ally = state.actors.find(actor => actor.team === defender.team && actor.id !== defender.id);
      Object.assign(ally, { alive: true, hp: 100 });
    }
    if (mode === 'none') { state.round.defenseContact = null; state.round.defenseContacts = []; }
    if (mode === 'expired') state.tick = 120;
    prepareRound(state, RELAY_MAP);
    assert.equal(state.round.action?.type, 'plant');
    assert.ok(!defender.objectiveKey.includes('lone-contact:'));
  }
});

test('설치 완료 후에는 최근 관측 위치보다 실제 폭탄 해체 목표를 우선한다', () => {
  const { state, defender, planter } = fixture();
  Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: planter.x, y: planter.y, plantedTick: 20 });
  prepareRound(state, RELAY_MAP);
  assert.equal(defender.intent, '폭탄 해체를 위해 접근');
  assert.ok(defender.objectiveKey.startsWith('defuse:'));
});
