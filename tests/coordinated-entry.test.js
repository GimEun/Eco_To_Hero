import test from 'node:test';
import assert from 'node:assert/strict';
import { createPractice, advancePractice, stepPractice } from '../src/simulation/practice.js';
import { prepareAttackCoordination, attackDestination, setAttackPlan } from '../src/simulation/attack-tactics.js';
import { prepareRound, setupRound } from '../src/simulation/round.js';
import { moveActors } from '../src/simulation/actor-movement.js';
import { startEconomyRound } from '../src/simulation/economy.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { ROUND_RULES } from '../src/config/round.js';

const clubs = ['home', 'away'].map(team => ({ name: team, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${team}${i}`, name: team, nickname: team, aim: 45, intelligence: 45, stamina: 45,
})) }));

function fixture(map = PRACTICE_MAPS[0], team = 'home', plan = 'execute') {
  const state = createPractice(map, ...clubs, { economy: true, attackTeam: team,
    attackPlans: { home: plan, away: plan }, defensePlans: { home: 'standard', away: 'standard' } });
  state.tick = 100;
  state.round.started = true;
  for (const actor of state.actors) actor.viewRange = 0;
  const attackers = state.actors.filter(a => a.team === team);
  for (const actor of attackers) actor.attackTask.stage = actor.attackTask.points.length - 2;
  const first = attackers[0];
  Object.assign(first, first.attackTask.points.at(-2));
  return { state, map, attackers, first };
}

function gather(f) {
  for (const actor of f.attackers) Object.assign(actor, actor.attackTask.points.at(-2));
}

test('3맵·양 진영·두 전술에서 먼저 도착한 선수는 실제 대기하고 전원 준비 후 한 틱에 해제한다', () => {
  for (const map of PRACTICE_MAPS) for (const team of ['home', 'away']) for (const plan of ['execute', 'split']) {
    const f = fixture(map, team, plan);
    const random = f.state.randomState;
    prepareAttackCoordination(f.state, map);
    assert.equal(f.first.entryWaiting, true);
    const position = { x: f.first.x, y: f.first.y };
    moveActors(f.state, map, new Set(), 50);
    assert.deepEqual({ x: f.first.x, y: f.first.y }, position);
    gather(f);
    prepareAttackCoordination(f.state, map);
    assert.equal(f.state.round.attackCoordination.committed, true);
    assert.ok(f.attackers.every(a => !a.entryWaiting));
    assert.equal(f.state.randomState, random);
    assert.equal(f.state.events.filter(e => e.type === 'attack-entry').length, 1);
    prepareAttackCoordination(f.state, map);
    assert.equal(f.state.events.filter(e => e.type === 'attack-entry').length, 1);
  }
});

test('동료가 오지 않아도 최대 3초 후 진입하며 원거리/사망 선수 때문에 무한 대기하지 않는다', () => {
  const f = fixture();
  prepareAttackCoordination(f.state, f.map);
  f.state.tick = 159; prepareAttackCoordination(f.state, f.map);
  assert.equal(f.first.entryWaiting, true);
  f.state.tick = 160; prepareAttackCoordination(f.state, f.map);
  assert.equal(f.first.entryWaiting, false);
  assert.equal(f.state.round.attackCoordination.reason, 'wait-limit');
  const solo = fixture();
  for (const actor of solo.attackers.slice(1)) actor.alive = false;
  prepareAttackCoordination(solo.state, solo.map);
  assert.equal(solo.state.round.attackCoordination.reason, 'few-players');
});

test('아군 섬광 비행 중에는 집결을 유지하고 폭발 후 해제하며 적 섬광/먼 섬광은 대기 근거로 쓰지 않는다', () => {
  for (const kind of ['friendly', 'enemy', 'far']) {
    const f = fixture(); gather(f);
    f.state.projectiles = [{ kind: 'flashbang', actorId: kind === 'enemy' ? 'away-1' : 'home-4',
      to: kind === 'far' ? { x: 0, y: 0 } : f.first.attackTask.plant, detonateTick: 112 }];
    prepareAttackCoordination(f.state, f.map);
    assert.equal(f.state.round.attackCoordination.committed, kind !== 'friendly');
    if (kind === 'friendly') {
      assert.ok(f.attackers.every(a => a.entryWaiting));
      f.state.tick = 112; prepareAttackCoordination(f.state, f.map);
      assert.equal(f.state.round.attackCoordination.committed, false);
      f.state.tick = 113; prepareAttackCoordination(f.state, f.map);
      assert.equal(f.state.round.attackCoordination.committed, true);
    }
  }
});

test('선두의 실제 피격·목표 마감은 집결보다 우선하고 폭탄 낙하/설치 후에는 대기를 취소한다', () => {
  for (const reason of ['hit', 'deadline', 'dropped', 'planted']) {
    const f = fixture();
    prepareAttackCoordination(f.state, f.map);
    if (reason === 'hit') f.first.incomingFire = { x: 800, y: 260, tick: f.state.tick };
    if (reason === 'deadline') f.state.tick = ROUND_RULES.limitTicks - ROUND_RULES.plantTicks - 200;
    if (reason === 'dropped' || reason === 'planted') f.state.round.bomb.status = reason;
    prepareAttackCoordination(f.state, f.map);
    assert.equal(f.first.entryWaiting, false);
    if (reason === 'hit') assert.equal(f.state.round.attackCoordination.reason, 'entry-contact');
    if (reason === 'deadline') assert.equal(f.state.round.attackCoordination.reason, 'deadline');
  }
});

test('수동 경로 선수는 집결 대상에서 제외하고 처리 순서를 바꿔도 같은 팀 판단을 한다', () => {
  const a = fixture(), b = fixture();
  for (const f of [a, b]) {
    f.state.manualPlans.attack.players[f.first.id] = { cells: [{ x: 12, y: 6 }], angle: 0 };
    prepareAttackCoordination(f.state, f.map);
    assert.equal(f.first.entryWaiting, false);
    delete f.state.manualPlans.attack.players[f.first.id];
    f.state.round.attackCoordination = null;
  }
  b.state.actors.reverse();
  prepareAttackCoordination(a.state, a.map); prepareAttackCoordination(b.state, b.map);
  assert.deepEqual(a.state.round.attackCoordination, b.state.round.attackCoordination);
  assert.deepEqual(a.attackers.map(x => x.entryWaiting), b.attackers.map(x => x.entryWaiting));
});

function tradeFixture(team = 'home') {
  const f = fixture({ ...PRACTICE_MAPS[0], walls: [] }, team);
  const enemy = f.state.actors.find(a => a.team !== team);
  const support = f.attackers[3];
  Object.assign(f.first, { x: 500, y: 260, alive: false });
  Object.assign(support, { x: 300, y: 300 });
  f.state.round.attackCoordination = { committed: true, plan: f.state.attackPlans[team] };
  f.state.round.attackContacts = [{ id: enemy.id, x: 700, y: 260, tick: 100 }];
  f.state.events.push({ type: 'death', actorId: f.first.id, killerId: enemy.id, tick: 100 });
  return { ...f, enemy, support };
}

test('양 팀 지원은 선두 사망 직후 최근 관측 좌표로 실제 접근하고 숨은 적의 새 위치를 추적하지 않는다', () => {
  for (const team of ['home', 'away']) {
    const f = tradeFixture(team);
    Object.assign(f.enemy, { x: 900, y: 500 });
    const first = attackDestination(f.state, f.support, f.map);
    Object.assign(f.enemy, { x: 1000, y: 500 });
    const second = attackDestination(f.state, f.support, f.map);
    assert.deepEqual(second, first);
    assert.ok(first.key.startsWith('trade:'));
    prepareRound(f.state, f.map);
    assert.ok(f.support.objectiveKey.startsWith('trade:'));
    const before = Math.hypot(f.support.x - first.point.x, f.support.y - first.point.y);
    moveActors(f.state, f.map, new Set(), 50);
    assert.ok(Math.hypot(f.support.x - first.point.x, f.support.y - first.point.y) < before);
    assert.equal(f.state.events.filter(e => e.type === 'trade-support').length, 1);
  }
});

test('관측이 없거나 1초를 넘긴 적 정보·2초를 넘긴 사망에는 추적 지원하지 않으며 운반자는 목표를 유지한다', () => {
  for (const reason of ['unknown', 'stale', 'late-death', 'carrier']) {
    const f = tradeFixture();
    if (reason === 'unknown') f.state.round.attackContacts = [];
    if (reason === 'stale') f.state.tick = 121;
    if (reason === 'late-death') {
      f.state.tick = 141; f.state.round.attackContacts[0].tick = 141;
      Object.assign(f.first, { viewRange: 500, fieldOfView: Math.PI * 2 });
      Object.assign(f.enemy, { x: 700, y: 260 });
    }
    if (reason === 'carrier') f.state.round.bomb.carrierId = f.support.id;
    const destination = attackDestination(f.state, f.support, f.map);
    assert.ok(!destination.key.startsWith('trade:'), reason);
  }
});

test('전술 변경·새 라운드는 공동 진입/지원 기억을 초기화하고 설치 후 배치를 보존한다', () => {
  const f = fixture(); gather(f);
  prepareAttackCoordination(f.state, f.map);
  f.state.round.started = false;
  assert.equal(setAttackPlan(f.state, f.map, 'split'), true);
  assert.equal(f.state.round.attackCoordination, null);
  setupRound(f.state, f.map, 'away', 'B');
  assert.equal(f.state.round.attackCoordination, null);
  assert.ok(f.state.actors.every(a => !a.entryWaiting && a.tradeSupportKey === null));
});

test('실제 이동·집결 계산은 프레임 분할/배속과 무관하며 양 팀 모두 같은 규칙을 사용한다', () => {
  for (const side of ['home', 'away']) {
    const state = createPractice(PRACTICE_MAPS[0], ...clubs, { economy: true, attackTeam: side,
      attackPlans: { home: 'split', away: 'split' }, defensePlans: { home: 'standard', away: 'standard' } });
    startEconomyRound(state, { autoHome: true });
    const other = structuredClone(state);
    advancePractice(state, PRACTICE_MAPS[0], 15000);
    for (let i = 0; i < 300; i++) stepPractice(other, PRACTICE_MAPS[0]);
    assert.deepEqual(state, other);
  }
});
