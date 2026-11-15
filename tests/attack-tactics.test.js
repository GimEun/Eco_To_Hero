import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createPractice, advancePractice, stepPractice } from '../src/simulation/practice.js';
import { prepareRound } from '../src/simulation/round.js';
import { setAttackPlan } from '../src/simulation/attack-tactics.js';
import { canOccupy, findPath } from '../src/simulation/geometry.js';
import { startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { matchPlayerStats } from '../src/simulation/match.js';

function sample(plan = 'execute', side = 'home', siteName = 'A', match = false, seed = 42) {
  const world = createWorld(createClub('공격 구단').club, seed);
  const input = { home: plan, away: 'execute' };
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id),
    { round: true, match, seed, attackTeam: side, siteName, attackPlans: input,
      defensePlans: { home: 'standard', away: 'standard' } });
  return { state, world, input };
}
function quiet(state) {
  for (const actor of state.actors) {
    actor.viewRange = 0;
    if (actor.team !== state.round.attackTeam) actor.speed = 0;
  }
}

test('두 공격 전술·양 진영·A/B의 역할·폭탄 담당·중간점과 경계점은 유효하다', () => {
  for (const plan of ['execute', 'split']) for (const side of ['home', 'away']) for (const site of ['A', 'B']) {
    const { state, input } = sample(plan, side, site);
    assert.notEqual(state.attackPlans, input);
    input.home = 'invalid';
    assert.equal(state.attackPlans.home, plan);
    const attackers = state.actors.filter(actor => actor.team === side);
    assert.deepEqual(attackers.map(actor => actor.attackTask.role), ['entry', 'entry', 'carrier', 'support', 'support']);
    assert.equal(state.round.bomb.carrierId, attackers[2].id);
    assert.ok(state.actors.filter(actor => actor.team !== side).every(actor => actor.attackTask === null));
    for (const actor of attackers) {
      for (const point of [...actor.attackTask.points, actor.attackTask.guard, actor.attackTask.plant]) {
        assert.ok(canOccupy(RELAY_MAP, point.x, point.y));
        assert.ok(findPath(RELAY_MAP, { x: Math.floor(actor.x / 40), y: Math.floor(actor.y / 40) },
          { x: Math.floor(point.x / 40), y: Math.floor(point.y / 40) }).length);
      }
    }
  }
  const { state } = sample();
  assert.equal(setAttackPlan(state, RELAY_MAP, 'invalid'), false);
});

test('분산 진입은 지원 2명을 실제 외곽으로 이동시키며 집중 진입과 다른 위치에 도달한다', () => {
  for (const site of ['A', 'B']) {
    const central = sample('execute', 'home', site).state;
    const split = sample('split', 'home', site).state;
    for (const state of [central, split]) {
      quiet(state);
      for (let tick = 0; tick < 200; tick++) {
        stepPractice(state, RELAY_MAP);
        for (const actor of state.actors) assert.ok(canOccupy(RELAY_MAP, actor.x, actor.y));
      }
    }
    for (const index of [3, 4]) {
      const actor = split.actors[index];
      assert.equal(actor.attackTask.lane, 'flank');
      assert.ok(actor.attackTask.stage >= 1);
      assert.ok(Math.abs(actor.y - central.actors[index].y) >= 40);
      assert.equal(Math.floor(actor.y / 40), site === 'A' ? 1 : 14);
    }
  }
});

test('구매 전술 변경은 점수·자금·난수·기록을 보존하고 전투 시작 후 거부한다', () => {
  const { state } = sample('execute', 'home', 'A', true);
  const preserved = { match: structuredClone(state.match), economy: structuredClone(state.economy), randomState: state.randomState };
  assert.equal(setAttackPlan(state, RELAY_MAP, 'split'), true);
  prepareRound(state, RELAY_MAP);
  assert.deepEqual(state.match, preserved.match);
  assert.deepEqual(state.economy, preserved.economy);
  assert.equal(state.randomState, preserved.randomState);
  assert.equal(state.actors[3].attackTask.lane, 'flank');
  startEconomyRound(state);
  const before = structuredClone(state);
  assert.equal(setAttackPlan(state, RELAY_MAP, 'execute'), false);
  assert.deepEqual(state, before);
  const standalone = sample().state;
  stepPractice(standalone, RELAY_MAP);
  assert.equal(setAttackPlan(standalone, RELAY_MAP, 'split'), false);
});

test('수비 중 고른 공격 전술은 후반전 내 팀에 적용되고 진행 단계는 초기화한다', () => {
  const { state } = sample('split', 'away', 'B', true);
  assert.ok(state.actors.filter(actor => actor.team === 'away').every(actor => actor.attackTask.plan === 'execute'));
  for (let round = 0; round < 12; round++) {
    startEconomyRound(state);
    for (const actor of state.actors.filter(actor => actor.team === 'away')) { actor.alive = false; actor.hp = 0; }
    stepPractice(state, RELAY_MAP);
    assert.equal(state.complete, true);
    nextEconomyRound(state, RELAY_MAP);
  }
  assert.equal(state.round.attackTeam, 'home');
  assert.deepEqual(state.match.score, { home: 12, away: 0 });
  assert.ok(state.actors.filter(actor => actor.team === 'home').every(actor => actor.attackTask.plan === 'split' && actor.attackTask.stage === 0));
  assert.ok(state.actors.filter(actor => actor.team === 'away').every(actor => actor.attackTask === null));
});

test('운반자 사망 후 한 명이 회수하고 지원 역할도 새 운반자로 설치할 수 있다', () => {
  const { state } = sample('split'); quiet(state);
  state.actors[2].alive = false;
  Object.assign(state.round.bomb, { status: 'dropped', carrierId: null, x: 780, y: 260 });
  Object.assign(state.actors[3], { x: 780, y: 260 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.recovererId, state.actors[3].id);
  assert.equal(state.actors.filter(actor => actor.intent === '폭탄 회수').length, 1);
  stepPractice(state, RELAY_MAP);
  assert.equal(state.round.bomb.carrierId, state.actors[3].id);
  advancePractice(state, RELAY_MAP, 60000);
  assert.ok(state.events.some(event => event.type === 'bomb-planted' && event.actorId === state.actors[3].id));
});

test('회수 담당 사망 시 다른 생존 공격수에게 재배정한다', () => {
  const { state } = sample(); quiet(state);
  Object.assign(state.round.bomb, { status: 'dropped', carrierId: null, x: 780, y: 260 });
  prepareRound(state, RELAY_MAP);
  const first = state.round.recovererId;
  state.actors.find(actor => actor.id === first).alive = false;
  prepareRound(state, RELAY_MAP);
  assert.notEqual(state.round.recovererId, first);
  assert.ok(state.actors.find(actor => actor.id === state.round.recovererId)?.alive);
});

test('설치 후 5명은 서로 다른 담당 위치로 경계하며 수비 해체 역할도 유지한다', () => {
  for (const side of ['home', 'away']) for (const site of ['A', 'B']) {
    const { state } = sample('split', side, site); quiet(state);
    Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: 820, y: site === 'A' ? 140 : 500, plantedTick: 0 });
    prepareRound(state, RELAY_MAP);
    const attackers = state.actors.filter(actor => actor.team === side);
    assert.equal(new Set(attackers.map(actor => `${actor.attackTask.guard.x}:${actor.attackTask.guard.y}`)).size, 5);
    const starts = attackers.map(actor => [actor.x, actor.y]);
    advancePractice(state, RELAY_MAP, 2000);
    attackers.forEach((actor, index) => {
      assert.match(actor.intent, /설치 후 담당 진입로 경계/);
      assert.ok(Math.hypot(actor.x - starts[index][0], actor.y - starts[index][1]) > 0);
      assert.equal(actor.facing, actor.attackTask.guardAngle);
    });
    assert.ok(state.round.defuserId);
    assert.match(state.actors.find(actor => actor.id === state.round.defuserId).intent, /해체/);
  }
});

test('공격·수비 전술을 사용하는 실제 경기의 종료·재현·누적 기록·세계 보존이 유지된다', () => {
  for (const plan of ['execute', 'split']) for (const side of ['home', 'away']) {
    const { state, world } = sample(plan, side, plan === 'execute' ? 'A' : 'B', true);
    const original = structuredClone(world);
    const replay = structuredClone(state);
    let deaths = 0;
    for (let round = 0; round < 80 && !state.match.complete; round++) {
      startEconomyRound(state); startEconomyRound(replay);
      advancePractice(state, RELAY_MAP, 160000);
      while (!replay.complete) advancePractice(replay, RELAY_MAP, 1000);
      assert.deepEqual(state, replay);
      assert.equal(state.complete, true);
      deaths += state.events.filter(event => event.type === 'death').length;
      assert.equal(state.actors.reduce((sum, actor) => sum + matchPlayerStats(state, actor).deaths, 0), deaths);
      if (!state.match.complete) { nextEconomyRound(state, RELAY_MAP); nextEconomyRound(replay, RELAY_MAP); }
    }
    assert.equal(state.match.complete, true);
    assert.deepEqual(world, original);
  }
});
