import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { setDefensePlan, defenseDestination } from '../src/simulation/defense-tactics.js';
import { prepareRound } from '../src/simulation/round.js';
import { buyRifle, startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { canOccupy } from '../src/simulation/geometry.js';

function sample(plan = 'standard', attackTeam = 'away', match = false) {
  const world = createWorld(createClub('전술 구단').club, 42);
  const input = { home: plan, away: 'standard' };
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id),
    { round: true, match, seed: 42, attackTeam, defensePlans: input });
  return { world, state, input };
}
function noContact(state) {
  for (const actor of state.actors) { actor.viewRange = 0; if (actor.team === state.round.attackTeam) actor.speed = 0; }
}

test('기본 수비는 A/B 감시·방어와 지원 5개 임무를 배정하고 좌표·경로가 유효하다', () => {
  for (const plan of ['standard', 'forward']) for (const side of ['home', 'away']) {
    const { state } = sample(plan, side);
    const defenders = state.actors.filter(actor => actor.team !== side);
    assert.deepEqual(defenders.map(actor => actor.defenseTask.role), ['front', 'anchor', 'front', 'anchor', 'support']);
    assert.deepEqual(defenders.map(actor => actor.defenseTask.site), ['A', 'A', 'B', 'B', '중앙']);
    for (const actor of defenders) {
      for (const point of [actor.defenseTask.anchor, actor.defenseTask.fallback, ...actor.route]) {
        assert.ok(canOccupy(RELAY_MAP, point.x, point.y, actor.radius));
      }
    }
    assert.ok(state.actors.filter(actor => actor.team === side).every(actor => actor.defenseTask === null));
  }
});

test('전진 수비는 감시를 앞에 두고 지원 가능한 뒤 배치를 만들며 실제 이동이 달라진다', () => {
  const standard = sample('standard').state;
  const forward = sample('forward').state;
  noContact(standard); noContact(forward);
  for (const index of [0, 2]) {
    assert.ok(forward.actors[index].defenseTask.anchor.x < standard.actors[index].defenseTask.anchor.x);
    assert.notDeepEqual(forward.actors[index].route, standard.actors[index].route);
  }
  for (const [front, anchor] of [[0, 1], [2, 3]]) {
    assert.ok(forward.actors[front].defenseTask.anchor.x < forward.actors[anchor].defenseTask.anchor.x);
    assert.ok(Math.hypot(forward.actors[front].defenseTask.anchor.x - forward.actors[anchor].defenseTask.anchor.x,
      forward.actors[front].defenseTask.anchor.y - forward.actors[anchor].defenseTask.anchor.y) <= 80);
  }
  advancePractice(standard, RELAY_MAP, 6000);
  advancePractice(forward, RELAY_MAP, 6000);
  assert.ok([0, 2].some(index => Math.hypot(forward.actors[index].x - standard.actors[index].x,
    forward.actors[index].y - standard.actors[index].y) > 40));
});

test('기본 수비는 접촉이 생겨도 전원이 같은 위치로 몰리지 않고 지원 선수만 구역 지원한다', () => {
  const { state } = sample(); noContact(state);
  state.round.defenseContact = { id: state.actors[5].id, x: 650, y: 260, tick: 0 };
  prepareRound(state, RELAY_MAP);
  for (const actor of state.actors.slice(0, 4)) assert.ok(actor.intent.includes(actor.defenseTask.label));
  assert.equal(state.actors[4].intent, 'A 접촉 구역 지원');
  assert.ok(new Set(state.actors.slice(0, 5).map(actor => actor.objectiveKey)).size >= 4);
  state.round.defenseContact.y = 400;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.actors[4].intent, 'B 접촉 구역 지원');
});

test('피해를 입은 선수는 실제 적을 보고 있어도 멈춰 싸우지 않고 후퇴한다', () => {
  const { state } = sample('forward'); noContact(state);
  const defender = state.actors[0];
  const enemy = state.actors[5];
  Object.assign(defender, { x: 660, y: 260, facing: Math.PI, hp: 45, viewRange: 200 });
  Object.assign(enemy, { x: 540, y: 260, speed: 0 });
  const before = defender.x;
  stepPractice(state, RELAY_MAP);
  assert.equal(defender.defenseTask.withdrawn, true);
  assert.equal(defender.retreating, true);
  assert.ok(defender.x > before);
  assert.ok(defender.intent.includes('후퇴'));
  advancePractice(state, RELAY_MAP, 3000);
  assert.ok(Math.hypot(defender.x - defender.defenseTask.fallback.x, defender.y - defender.defenseTask.fallback.y) < 1);
  assert.equal(defender.defenseTask.withdrawn, true);
});

test('전진 감시의 다수 적 접촉은 실제 시야 안 2명일 때만 후퇴한다', () => {
  for (const visibleCount of [1, 2]) {
    const { state } = sample('forward'); noContact(state);
    const defender = state.actors[0];
    Object.assign(defender, { x: 660, y: 260, facing: Math.PI, viewRange: 200 });
    for (let index = 0; index < visibleCount; index++) Object.assign(state.actors[5 + index], { x: 540, y: 260 + index * 20 });
    prepareRound(state, RELAY_MAP);
    assert.equal(defender.defenseTask.withdrawn, visibleCount === 2);
  }
});

function pressureFixture(team = 'home', weaponId = 'basic-pistol', distance = 200) {
  const map = { columns: 30, rows: 20, tileSize: 40, walls: [] };
  const actor = { id: `${team}-1`, team, alive: true, hp: 100, x: 400, y: 200, radius: 10,
    weaponId, facing: 0, fieldOfView: Math.PI, viewRange: 240,
    defenseTask: { role: 'front', plan: 'forward', anchor: { x: 400, y: 200 }, fallback: { x: 300, y: 200 }, withdrawn: false } };
  const otherTeam = team === 'home' ? 'away' : 'home';
  const enemies = [0, 10].map(dy => ({ id: `${otherTeam}-${dy + 1}`, team: otherTeam, alive: true, x: actor.x + distance, y: actor.y + dy }));
  return { map, actor, state: { tick: 1, actors: [actor, ...enemies], round: { bomb: { status: 'carried' } } } };
}

test('권총 전진 수비는 멀리 보이기만 하는 두 적 때문에 체력 100에서 후퇴하지 않는다', () => {
  for (const team of ['home', 'away']) {
    const { map, actor, state } = pressureFixture(team);
    defenseDestination(state, actor, map);
    assert.equal(actor.defenseTask.withdrawn, false);
  }
});

test('무기 사거리 안의 수적 열세는 후퇴하고 같은 사거리의 아군 지원은 열세를 해소한다', () => {
  for (const weapon of ['basic-pistol', 'training-rifle']) {
    const { map, actor, state } = pressureFixture('home', weapon, weapon === 'basic-pistol' ? 100 : 185);
    defenseDestination(state, actor, map);
    assert.equal(actor.defenseTask.withdrawn, true);
    actor.defenseTask.withdrawn = false;
    state.actors.push({ ...actor, id: 'home-2', x: 420, y: 210, defenseTask: { withdrawn: false } });
    defenseDestination(state, actor, map);
    assert.equal(actor.defenseTask.withdrawn, false);
  }
});

test('사거리 밖의 적뿐이어도 저체력 후퇴와 이미 시작한 후퇴는 유지한다', () => {
  const { map, actor, state } = pressureFixture();
  actor.hp = 40;
  assert.equal(defenseDestination(state, actor, map).key, 'withdraw:home-1');
  actor.hp = 100;
  assert.equal(defenseDestination(state, actor, map).key, 'withdraw:home-1');
});

test('구매 단계의 선택은 자금·점수·난수·입력 객체를 보존하고 전투 중 변경을 거부한다', () => {
  const { state, input } = sample('standard', 'away', true);
  const balances = state.actors.map(actor => actor.cash);
  const random = state.randomState;
  assert.equal(setDefensePlan(state, RELAY_MAP, 'forward'), true);
  prepareRound(state, RELAY_MAP);
  assert.deepEqual(state.actors.map(actor => actor.cash), balances);
  assert.equal(state.randomState, random);
  assert.deepEqual(state.match.score, { home: 0, away: 0 });
  assert.equal(input.home, 'standard');
  assert.equal(state.actors[0].defenseTask.plan, 'forward');
  assert.equal(setDefensePlan(state, RELAY_MAP, 'invalid'), false);
  startEconomyRound(state);
  const before = structuredClone(state);
  assert.equal(setDefensePlan(state, RELAY_MAP, 'standard'), false);
  assert.deepEqual(state, before);
  assert.throws(() => sample('invalid'));
});

test('단독 라운드도 시작 후에는 일시정지와 무관하게 전술 변경이 닫힌다', () => {
  const { state } = sample();
  assert.equal(setDefensePlan(state, RELAY_MAP, 'forward'), true);
  stepPractice(state, RELAY_MAP);
  assert.equal(setDefensePlan(state, RELAY_MAP, 'standard'), false);
});

test('공격 중 선택한 내 팀 전술은 후반전 수비에 적용하고 새 라운드 후퇴 상태를 초기화한다', () => {
  const { state } = sample('forward', 'home', true);
  for (let round = 1; round <= 12; round++) {
    startEconomyRound(state);
    for (const actor of state.actors.filter(actor => actor.team === 'away')) Object.assign(actor, { alive: false, hp: 0 });
    stepPractice(state, RELAY_MAP);
    nextEconomyRound(state, RELAY_MAP);
  }
  assert.equal(state.economy.roundNumber, 13);
  assert.equal(state.round.attackTeam, 'away');
  assert.ok(state.actors.slice(0, 5).every(actor => actor.defenseTask.plan === 'forward' && !actor.defenseTask.withdrawn));
  assert.equal(state.defensePlans.away, 'standard');
});

test('설치 후에는 기존 해체·지원 경계로 전환하고 후퇴 상태가 해체 접근을 막지 않는다', () => {
  const { state } = sample('forward'); noContact(state);
  state.actors[0].defenseTask.withdrawn = true;
  Object.assign(state.actors[0], { x: 820, y: 140 });
  Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: 820, y: 140, plantedTick: 0 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.actors[0].action, 'defuse');
  assert.equal(state.actors[0].retreating, false);
  assert.ok(state.actors.slice(1, 5).every(actor => actor.intent === '해체 지원·주변 경계'));
});

test('전술을 켠 실제 경기의 프레임 재현·경제·세계 보존과 라운드 종료가 유지된다', () => {
  for (const plan of ['standard', 'forward']) for (const side of ['home', 'away']) {
    const { world, state } = sample(plan, side, true);
    const original = structuredClone(world);
    const replay = structuredClone(state);
    for (let round = 0; round < 4 && !state.match.complete; round++) {
      for (const current of [state, replay]) {
        for (const actor of current.actors.filter(actor => actor.team === 'home')) buyRifle(current, actor.id);
        startEconomyRound(current);
      }
      advancePractice(state, RELAY_MAP, 160000);
      for (let frame = 0; frame < 9600 && !replay.complete; frame++) advancePractice(replay, RELAY_MAP, 1000 / 60);
      assert.equal(state.complete, true);
      assert.deepEqual(state, replay);
      assert.equal(state.match.history.length, state.economy.roundNumber);
      for (const actor of state.actors) {
        assert.ok(canOccupy(RELAY_MAP, actor.x, actor.y, actor.radius));
        assert.equal(actor.cash, 800 + state.economy.ledger.filter(entry => entry.actorId === actor.id).reduce((sum, entry) => sum + entry.amount, 0));
      }
      if (!state.match.complete) { nextEconomyRound(state, RELAY_MAP); nextEconomyRound(replay, RELAY_MAP); }
    }
    assert.deepEqual(world, original);
  }
});
