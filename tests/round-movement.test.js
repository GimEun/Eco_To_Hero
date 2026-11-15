import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createPractice, advancePractice, stepPractice } from '../src/simulation/practice.js';
import { prepareRound } from '../src/simulation/round.js';
import { canOccupy } from '../src/simulation/geometry.js';

function sample(attackTeam = 'home') {
  const world = createWorld(createClub('순찰 구단').club, 42);
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id), { round: true, attackTeam });
  // 경로 행동만 분리해 검사한다. 교전은 기존 통합 테스트에서 검증한다.
  for (const actor of state.actors) actor.viewRange = 0;
  return state;
}

test('양 진영 모두 수비 전원이 시작 위치에서 실제로 이동한다', () => {
  for (const side of ['home', 'away']) {
    const state = sample(side);
    const defenders = state.actors.filter(actor => actor.team !== side);
    const positions = defenders.map(actor => ({ x: actor.x, y: actor.y }));
    advancePractice(state, RELAY_MAP, 1000);
    for (let index = 0; index < defenders.length; index++) {
      const actor = defenders[index];
      assert.ok(Math.hypot(actor.x - positions[index].x, actor.y - positions[index].y) > 20);
      assert.ok(actor.intent.includes('순찰'));
      assert.ok(canOccupy(RELAY_MAP, actor.x, actor.y, actor.radius));
    }
  }
});

test('수비는 한 목적지에 도착한 뒤에도 여러 순찰 구간을 이어간다', () => {
  const state = sample();
  for (const actor of state.actors.filter(actor => actor.team === 'home')) actor.speed = 0;
  const defenders = state.actors.filter(actor => actor.team === 'away');
  const goals = new Map(defenders.map(actor => [actor.id, new Set()]));
  let lastPositions;
  for (let tick = 0; tick < 600; tick++) {
    if (tick === 500) lastPositions = defenders.map(actor => ({ x: actor.x, y: actor.y }));
    stepPractice(state, RELAY_MAP);
    for (const actor of defenders) {
      goals.get(actor.id).add(actor.objectiveKey);
      assert.ok(canOccupy(RELAY_MAP, actor.x, actor.y, actor.radius));
    }
  }
  assert.equal(state.complete, false);
  for (let index = 0; index < defenders.length; index++) {
    const actor = defenders[index];
    assert.ok(goals.get(actor.id).size >= 3);
    assert.ok(Math.hypot(actor.x - lastPositions[index].x, actor.y - lastPositions[index].y) > 10);
  }
});

test('설치 후 양 진영 공격수는 폭탄 위에 멈추지 않고 주변 경계를 이어간다', () => {
  for (const side of ['home', 'away']) {
    const state = sample(side);
    Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: 820, y: 140, plantedTick: 0 });
    const attackers = state.actors.filter(actor => actor.team === side);
    for (const actor of state.actors) {
      if (actor.team === side) Object.assign(actor, { x: 820, y: 140 });
      else Object.assign(actor, { x: 100, speed: 0 });
    }
    const goals = new Map(attackers.map(actor => [actor.id, new Set()]));
    for (let tick = 0; tick < 300; tick++) {
      stepPractice(state, RELAY_MAP);
      for (const actor of attackers) {
        goals.get(actor.id).add(actor.objectiveKey);
        assert.ok(canOccupy(RELAY_MAP, actor.x, actor.y, actor.radius));
      }
    }
    assert.equal(state.complete, false);
    for (const actor of attackers) {
      assert.equal(actor.intent, '설치 후 주변 경계');
      assert.ok(goals.get(actor.id).size >= 3);
      assert.ok(Math.hypot(actor.x - 820, actor.y - 140) > 20);
    }
  }
});

test('수비는 한 명이 해체하고 나머지는 경계하며 담당자 사망 시 재배정한다', () => {
  const state = sample();
  Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: 820, y: 140, plantedTick: 0 });
  const defenders = state.actors.filter(actor => actor.team === 'away');
  Object.assign(defenders[0], { x: 820, y: 140 });
  Object.assign(defenders[1], { x: 860, y: 140 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.defuserId, defenders[0].id);
  assert.equal(defenders[0].action, 'defuse');
  for (const actor of defenders.slice(1)) {
    assert.equal(actor.intent, '해체 지원·주변 경계');
    assert.equal(actor.action, null);
    assert.ok(Math.hypot(actor.route.at(-1).x - 820, actor.route.at(-1).y - 140) > 12);
  }
  defenders[0].alive = false; defenders[0].hp = 0;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.defuserId, defenders[1].id);
  assert.equal(defenders[1].intent, '폭탄 해체를 위해 접근');
});

test('수비 대응은 실제 시야로 얻은 위치만 사용하고 마지막 정보는 5초 후 만료된다', () => {
  const state = sample();
  assert.equal(state.round.defenseContact, null);
  const observer = state.actors[5];
  const enemy = state.actors[0];
  Object.assign(observer, { x: 820, y: 300, facing: Math.PI, viewRange: 200 });
  Object.assign(enemy, { x: 620, y: 300 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.defenseContact.id, enemy.id);
  assert.equal(state.round.defenseContact.x, 620);
  assert.equal(observer.intent, '감지된 적 위치 수색·대응');
  Object.assign(enemy, { x: 100, y: 100 });
  state.tick = 100;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.defenseContact.x, 620);
  state.tick = 101;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.defenseContact, null);
  assert.ok(observer.intent.includes('순찰'));
});
