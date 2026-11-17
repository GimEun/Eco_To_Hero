import test from 'node:test';
import assert from 'node:assert/strict';
import { autoThrow } from '../src/simulation/throwables.js';
import { canSee } from '../src/simulation/geometry.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { prepareRound, setupRound } from '../src/simulation/round.js';
import { moveActors } from '../src/simulation/actor-movement.js';
import { startEconomyRound } from '../src/simulation/economy.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { ROUND_RULES } from '../src/config/round.js';

const clubs = ['home', 'away'].map(team => ({ name: team, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${team}-${i}`, name: team, nickname: team, aim: 45, intelligence: 45, stamina: 45,
})) }));

function flashFixture(team, near, shared = false) {
  const enemy = team === 'home' ? 'away' : 'home';
  const map = { columns: 20, rows: 20, tileSize: 40, walls: [] };
  const actor = (id, side, x, y, facing = 0) => ({ id, team: side, x, y, facing, alive: true,
    radius: 10, viewRange: 500, fieldOfView: Math.PI / 8, intelligence: 50, number: 1, hp: 100,
    flashUntilTick: 0, action: null, nextUtilityTick: 0, throwables: {} });
  const thrower = actor('thrower', team, 100, 100);
  thrower.throwables.flashbang = 1;
  thrower.utilityContact = { targetId: 'visible', tick: 0 };
  const actors = [thrower, actor('friend1', team, 220, 110, Math.PI), actor('friend2', team, 220, 90, Math.PI),
    actor('visible', enemy, 220, 100), actor('hidden1', enemy, near ? 260 : 400, near ? 170 : 350),
    actor('hidden2', enemy, near ? 260 : 400, near ? 30 : 300)];
  if (shared) Object.assign(actors[1], { fieldOfView: Math.PI * 2 });
  const state = { tick: 100, seed: 1, actors, events: [], projectiles: [], smokes: [], economy: { phase: 'combat', roundNumber: 1 } };
  const seen = actors.filter(a => a.team === team).map(a => actors.filter(b => b.team !== team && canSee(map, a, b, state)).map(b => b.id));
  autoThrow(state, map);
  return { seen, thrown: state.events.filter(e => e.type === 'utility-thrown').length };
}

test('양 팀 섬광 판단은 관측이 같을 때 미관측 적의 현재 위치 변경에 영향받지 않는다', () => {
  for (const team of ['home', 'away']) {
    const near = flashFixture(team, true), far = flashFixture(team, false);
    assert.deepEqual(near.seen, far.seen);
    assert.equal(near.thrown, 0);
    assert.equal(far.thrown, 0);
  }
});

test('동료가 실제 관측한 적은 섬광 판단에 공유되며 투척 전체를 금지하지 않는다', () => {
  for (const team of ['home', 'away']) assert.equal(flashFixture(team, true, true).thrown, 1);
});

function smokeFixture(original = PRACTICE_MAPS[0], team = 'home', observe = true) {
  const map = { ...original, walls: [] };
  const state = createPractice(map, ...clubs, { economy: true, attackTeam: team,
    attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
  startEconomyRound(state);
  for (const a of state.actors) Object.assign(a, { viewRange: 0, nextShotTick: 100000, nextUtilityTick: 100000 });
  const observer = state.actors.find(a => a.team === team && a.number === 1);
  const enemy = state.actors.find(a => a.team !== team);
  Object.assign(observer, { x: 300, y: 260, viewRange: 500, fieldOfView: Math.PI * 2, facing: 0 });
  Object.assign(enemy, { x: 500, y: 260 });
  state.round.attackContacts = [];
  if (observe) prepareRound(state, map);
  state.smokes = [{ x: 400, y: 260, radius: 35, expiresTick: 240 }];
  state.tick = 1;
  if (!observe) observer.viewRange = 0;
  prepareRound(state, map);
  return { state, map, observer, enemy };
}

function approach(fixture, tick = 101) {
  const { state, map, observer } = fixture;
  state.tick = tick;
  Object.assign(observer, { x: 340, y: 260, arrived: false });
  observer.attackTask.points = [{ x: 500, y: 260 }];
  observer.attackTask.stage = 0;
  observer.attackTask.deployed = false;
  prepareRound(state, map);
  observer.route = [{ x: observer.x, y: observer.y }, { x: 500, y: 260 }];
  observer.waypoint = 1;
  prepareRound(state, map);
}

test('3맵·양 공격 진영에서 5초 좌표 기억이 사라져도 연막 위험 구역은 남고 숨은 적을 추적하지 않는다', () => {
  for (const map of PRACTICE_MAPS) for (const team of ['home', 'away']) {
    const f = smokeFixture(map, team);
    const risk = structuredClone(f.state.round.smokeRisks[team]);
    assert.equal(risk.length, 1);
    Object.assign(f.enemy, { x: 900, y: 500 });
    f.state.tick = 101;
    prepareRound(f.state, f.map);
    assert.equal(f.state.round.attackContacts.length, 0);
    assert.deepEqual(f.state.round.smokeRisks[team], risk);
    assert.equal('id' in risk[0], false);
  }
});

test('관측 이력이 없는 연막에 숨은 적이 존재한다는 이유만으로 위험을 생성하지 않는다', () => {
  const { state } = smokeFixture(PRACTICE_MAPS[0], 'home', false);
  assert.deepEqual(state.round.smokeRisks, { home: [], away: [] });
});

test('연막 만료 경계와 새 라운드에서 위험/개별 경계 상태를 제거한다', () => {
  const f = smokeFixture();
  approach(f);
  assert.equal(f.observer.smokeGuarding, true);
  f.state.tick = 240;
  prepareRound(f.state, f.map);
  assert.equal(f.state.round.smokeRisks.home.length, 0);
  assert.equal(f.observer.smokeGuarding, false);
  setupRound(f.state, f.map, 'home', 'A');
  assert.deepEqual(f.state.round.smokeRisks, { home: [], away: [] });
  assert.equal(f.observer.smokeGuardKey, null);
});

test('양 공격 진영은 위험 연막 앞에서 실제 경계한 뒤 2초 이내 진입을 재개하고 반복 정지하지 않는다', () => {
  for (const team of ['home', 'away']) {
    const f = smokeFixture(PRACTICE_MAPS[0], team);
    approach(f);
    const { state, map, observer } = f;
    const x = observer.x;
    assert.equal(observer.smokeGuarding, true);
    moveActors(state, map, new Set(), 50);
    assert.equal(observer.x, x);
    state.tick = 140; prepareRound(state, map);
    assert.equal(observer.smokeGuarding, true);
    state.tick = 141; prepareRound(state, map);
    assert.equal(observer.smokeGuarding, false);
    moveActors(state, map, new Set(), 50);
    assert.ok(observer.x > x);
    state.tick = 142; prepareRound(state, map);
    assert.equal(observer.smokeGuarding, false);
    assert.equal(state.events.filter(e => e.type === 'smoke-risk-response' && e.actorId === observer.id).length, 1);
  }
});

test('설치/해체 마감 임박·수동 명령·진행 중 폭탄 행동은 연막 경계로 지연시키지 않는다', () => {
  for (const reason of ['plant-deadline', 'defuse-deadline', 'manual', 'action']) {
    const f = smokeFixture();
    approach(f);
    if (reason === 'plant-deadline') {
      f.state.tick = ROUND_RULES.limitTicks - ROUND_RULES.plantTicks - 100;
      f.state.smokes[0].expiresTick = f.state.tick + 200;
      f.state.round.smokeRisks.home[0].expiresTick = f.state.smokes[0].expiresTick;
      f.state.round.smokeRisks.home[0].key = `400:260:${f.state.smokes[0].expiresTick}`;
    } else if (reason === 'defuse-deadline') {
      Object.assign(f.state.round.bomb, { status: 'planted', carrierId: null, x: 500, y: 260,
        plantedTick: f.state.tick - ROUND_RULES.fuseTicks + ROUND_RULES.defuseTicks + 100 });
    } else if (reason === 'manual') {
      f.state.manualPlans.attack.players[f.observer.id] = { cells: [{ x: 12, y: 6 }], angle: 0 };
    } else {
      // A continuing bomb action is prioritized before the next movement tick.
      f.state.round.action = { actorId: f.observer.id, type: 'plant', startTick: f.state.tick };
    }
    prepareRound(f.state, f.map);
    assert.equal(f.observer.smokeGuarding, false, reason);
  }
});

test('연막 경계가 있는 실제 고정 틱 계산은 프레임 분할과 무관하게 재현된다', () => {
  const a = smokeFixture(), b = smokeFixture();
  approach(a); approach(b);
  advancePractice(a.state, a.map, 2500);
  for (let i = 0; i < 50; i++) stepPractice(b.state, b.map);
  assert.deepEqual(a.state, b.state);
});

test('양 팀 수비는 연막 주변 시야를 확보하며 실제 시야의 교전 표적은 주변 확인보다 우선한다', () => {
  for (const team of ['home', 'away']) {
    const f = smokeFixture(PRACTICE_MAPS[0], team);
    const { state, map, observer } = f;
    state.round.attackTeam = team === 'home' ? 'away' : 'home';
    state.round.defenseContacts = state.round.attackContacts;
    state.round.defenseContact = state.round.attackContact;
    state.round.attackContacts = [];
    state.round.attackContact = null;
    observer.attackTask = null;
    observer.defenseTask = { role: 'front', plan: 'standard', label: '경계', site: 'A',
      anchor: { x: 500, y: 260 }, fallback: { x: 500, y: 260 } };
    state.tick = 101;
    Object.assign(observer, { x: 340, y: 260, arrived: false });
    prepareRound(state, map);
    observer.route = [{ x: 340, y: 260 }, { x: 500, y: 260 }];
    observer.waypoint = 1;
    prepareRound(state, map);
    assert.ok(observer.defenseSmoke);
    Object.assign(f.enemy, { x: 350, y: 270 });
    prepareRound(state, map);
    assert.equal(observer.smokeGuarding, false);
    assert.equal(observer.defenseSmoke, null);
  }
});
