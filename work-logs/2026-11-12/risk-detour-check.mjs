// Run explicitly; archived diagnostic checks are not part of the game test suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRiskDetours, RISK_RULES } from './risk-detour.mjs';
import { findPath, cellCenter, canOccupy } from '../../src/simulation/geometry.js';

function fixture(team = 'home', attacking = true) {
  const map = { columns: 15, rows: 11, tileSize: 40, walls: [] };
  const start = { x: 1, y: 5 }, goal = { x: 13, y: 5 };
  const actor = { id: 'walker', team, alive: true, radius: 10, ...cellCenter(map, start),
    viewRange: 0, fieldOfView: Math.PI, facing: 0, weaponId: 'training-rifle',
    objectiveKey: 'objective', waypoint: 1, route: findPath(map, start, goal), arrived: false };
  const enemy = { id: 'enemy', team: team === 'home' ? 'away' : 'home', alive: true, x: 500, y: 400 };
  const round = { started: true, attackTeam: attacking ? team : enemy.team,
    bomb: { status: 'carried', carrierId: 'carrier' }, attackContacts: [], defenseContacts: [] };
  round[attacking ? 'attackContacts' : 'defenseContacts'] = [{ id: enemy.id, ...cellCenter(map, { x: 7, y: 7 }), tick: 20 }];
  return { map, actor, enemy, state: { tick: 20, actors: [actor, enemy], round, randomState: 1234 } };
}

test('양 팀·양 진영에서 같은 목적지로 노출이 적은 제한 거리의 유효 우회를 고른다', () => {
  for (const team of ['home', 'away']) for (const attacking of [true, false]) {
    const { state, map, actor } = fixture(team, attacking);
    const goal = { ...actor.route.at(-1) };
    prepareRiskDetours(state, map);
    const diagnostic = state.round.diagnosticRisk;
    assert.equal(diagnostic.applied, 1);
    assert.deepEqual(actor.route.at(-1), goal);
    assert.equal(actor.objectiveKey, 'objective');
    for (const point of actor.route) assert.ok(canOccupy(map, point.x, point.y, actor.radius));
    const decision = diagnostic.decisions[0];
    assert.ok(decision.after < decision.before);
    assert.ok(decision.alternativeLength <= decision.originalLength * RISK_RULES.distanceRatio);
    assert.ok(decision.alternativeLength <= decision.originalLength + map.tileSize * RISK_RULES.extraTiles);
    assert.equal(state.randomState, 1234);
  }
});

test('숨은 적의 현재 좌표·배열 순서를 바꿔도 기록이 같으면 경로와 결정이 같다', () => {
  const a = fixture(), b = fixture();
  Object.assign(b.enemy, { x: 100, y: 20 }); b.state.actors.reverse();
  prepareRiskDetours(a.state, a.map); prepareRiskDetours(b.state, b.map);
  assert.deepEqual(a.actor.route, b.actor.route);
  assert.deepEqual(a.state.round.diagnosticRisk.decisions, b.state.round.diagnosticRisk.decisions);
});

test('관측 없음·미래 관측·2초 초과 기록은 사용하지 않고 경계 2초는 사용한다', () => {
  for (const age of [null, -1, 41, 40]) {
    const { state, actor, map } = fixture();
    if (age === null) state.round.attackContacts = [];
    else state.round.attackContacts[0].tick = state.tick - age;
    const before = structuredClone(actor.route);
    prepareRiskDetours(state, map);
    assert.equal(state.round.diagnosticRisk.applied, age === 40 ? 1 : 0);
    if (age !== 40) assert.deepEqual(actor.route, before);
  }
});

test('수동·교전·피격·행동·대기·후퇴·폭탄·마감 우선순위를 보존한다', () => {
  const cases = [
    f => { f.actor.alive = false; }, f => { f.actor.action = 'plant'; },
    f => { f.actor.entryWaiting = true; }, f => { f.actor.smokeGuarding = true; },
    f => { f.actor.retreating = true; }, f => { f.actor.arrived = true; },
    f => { f.actor.incomingFire = { tick: f.state.tick }; },
    f => { f.state.round.bomb.status = 'planted'; }, f => { f.state.round.bomb.status = 'dropped'; },
    f => { f.state.round.bomb.carrierId = f.actor.id; },
    f => { f.state.round.action = { actorId: f.actor.id }; },
    f => { f.state.tick = 2020; f.state.round.attackContacts[0].tick = 2020; },
    f => { f.state.manualPlans = { attack: { remaining: 4, revision: 1, players: { walker: { cells: [] } } } }; },
    f => { f.actor.viewRange = 500; Object.assign(f.enemy, { x: f.actor.x + 80, y: f.actor.y }); },
  ];
  for (const change of cases) {
    const f = fixture(); change(f); const before = structuredClone(f.actor.route);
    prepareRiskDetours(f.state, f.map);
    assert.deepEqual(f.actor.route, before);
    assert.equal(f.state.round.diagnosticRisk.applied, 0);
  }
});

test('정보 만료 후 현재 위치에서 원래 목적지로 복귀하며 시작점으로 되돌리지 않는다', () => {
  const { state, actor, map } = fixture();
  const goal = { ...actor.route.at(-1) };
  prepareRiskDetours(state, map);
  Object.assign(actor, actor.route[3], { waypoint: 4 });
  const current = { x: actor.x, y: actor.y };
  state.tick += 41;
  prepareRiskDetours(state, map);
  assert.equal(state.round.diagnosticRisk.restored, 1);
  assert.deepEqual(actor.route[0], current);
  assert.deepEqual(actor.route.at(-1), goal);
});

test('이미 선택한 경로를 매 틱 재계산하지 않고 새 목표 경로를 덮어쓰지 않는다', () => {
  const { state, actor, map } = fixture();
  prepareRiskDetours(state, map);
  const route = actor.route;
  for (let i = 0; i < 10; i++) { state.tick++; prepareRiskDetours(state, map); }
  assert.equal(actor.route, route);
  assert.equal(state.round.diagnosticRisk.attempts, 1);
  actor.objectiveKey = 'new-objective';
  actor.route = findPath(map, { x: 1, y: 5 }, { x: 1, y: 2 }); actor.waypoint = 1;
  const next = actor.route;
  state.tick += 41; prepareRiskDetours(state, map);
  assert.equal(actor.route, next);
});

test('통로에 대안이 없으면 원래 경로를 유지하고 벽 뒤 관측을 위험으로 가산하지 않는다', () => {
  for (const behindWall of [false, true]) {
    const { state, actor, map } = fixture();
    map.walls = [{ x: 0, y: 0, width: 15, height: 5 }, { x: 0, y: 6, width: 15, height: 5 }];
    state.round.attackContacts[0] = { id: 'enemy', ...cellCenter(map, { x: 7, y: behindWall ? 7 : 5 }), tick: 20 };
    const before = structuredClone(actor.route);
    prepareRiskDetours(state, map);
    assert.deepEqual(actor.route, before);
    assert.equal(state.round.diagnosticRisk.applied, 0);
    if (behindWall) assert.equal(state.round.diagnosticRisk.attempts, 0);
  }
});

test('지원 우선 후보는 기존 교전 지원·앵커 합류·지원 임무 경로를 그대로 보존한다', () => {
  for (const team of ['home', 'away']) for (const key of ['trade:partner:7:5', 'patrol:contact-support:walker:A:0', 'patrol:support:A:0']) {
    const original = fixture(team), protectedCase = fixture(team);
    original.actor.objectiveKey = key; protectedCase.actor.objectiveKey = key;
    const before = structuredClone(protectedCase.actor.route);
    prepareRiskDetours(original.state, original.map);
    prepareRiskDetours(protectedCase.state, protectedCase.map, { protectSupport: true });
    assert.equal(original.state.round.diagnosticRisk.applied, 1);
    assert.deepEqual(protectedCase.actor.route, before);
    assert.equal(protectedCase.state.round.diagnosticRisk.applied, 0);
  }
});

test('안정화 후보는 바뀌는 관측 칸에도 1초 동안 경로를 보존하되 만료·새 목표를 우선한다', () => {
  const { state, actor, map } = fixture();
  prepareRiskDetours(state, map, { stable: true }); const route = actor.route;
  state.tick++; state.round.attackContacts[0].x += map.tileSize;
  prepareRiskDetours(state, map, { stable: true }); assert.equal(actor.route, route);
  state.tick += 41;
  prepareRiskDetours(state, map, { stable: true });
  assert.notEqual(actor.route, route); assert.equal(state.round.diagnosticRisk.restored, 1);
});
