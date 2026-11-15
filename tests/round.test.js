import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { ROUND_RULES } from '../src/config/round.js';
import { createPractice, advancePractice, stepPractice } from '../src/simulation/practice.js';
import { prepareRound, resolveRound } from '../src/simulation/round.js';
import { canOccupy, canSee } from '../src/simulation/geometry.js';
import { selectTarget } from '../src/simulation/combat.js';

function sample(attackTeam = 'home', siteName = 'A', seed = 42) {
  const world = createWorld(createClub('라운드 구단').club, seed);
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id),
    { round: true, attackTeam, siteName, seed });
  return { world, state };
}
function quiet(state) {
  for (const actor of state.actors) Object.assign(actor, { speed: 0, viewRange: 0, nextShotTick: 100000 });
}

test('현재 수비팀만 더 넓고 멀리 감지하며 무기 사거리와 벽 가림은 유지한다', () => {
  const openMap = { ...RELAY_MAP, walls: [] };
  for (const attackTeam of ['home', 'away']) {
    const { state } = sample(attackTeam);
    const attacker = state.actors.find(actor => actor.team === attackTeam);
    const defender = state.actors.find(actor => actor.team !== attackTeam);
    for (const actor of state.actors) actor.alive = false;
    for (const actor of [attacker, defender]) Object.assign(actor, { alive: true, x: 400, y: 300, facing: 0 });
    const distant = { x: 640, y: 300 };
    assert.equal(canSee(openMap, defender, distant), true);
    assert.equal(canSee(openMap, attacker, distant), false);
    Object.assign(attacker, distant);
    assert.equal(selectTarget(state, openMap, defender), null);
    const wide = { x: 400 + Math.cos(Math.PI * 55 / 180) * 150,
      y: 300 + Math.sin(Math.PI * 55 / 180) * 150 };
    Object.assign(attacker, { x: 400, y: 300 });
    assert.equal(canSee(openMap, defender, wide), true);
    assert.equal(canSee(openMap, attacker, wide), false);
    assert.equal(canSee({ ...openMap, walls: [{ x: 12, y: 6, width: 1, height: 3 }] }, defender, distant), false);
    Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: 820, y: 140, plantedTick: 0 });
    prepareRound(state, RELAY_MAP);
    assert.equal(defender.fieldOfView, Math.PI * 110 / 180);
    assert.equal(defender.viewRange, 240);
    assert.equal(attacker.fieldOfView, Math.PI * 100 / 180);
    assert.equal(attacker.viewRange, 220);
  }
});
function plantFixture() {
  const { state } = sample(); quiet(state);
  const carrier = state.actors[0];
  Object.assign(carrier, { x: 820, y: 140 });
  prepareRound(state, RELAY_MAP);
  return { state, carrier };
}
function plantedFixture() {
  const { state } = sample(); quiet(state);
  Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: 820, y: 140, plantedTick: 100 });
  state.tick = 100;
  Object.assign(state.actors[5], { x: 820, y: 140 });
  prepareRound(state, RELAY_MAP);
  return state;
}
function killTeam(state, team) {
  for (const actor of state.actors.filter(actor => actor.team === team)) Object.assign(actor, { alive: false, hp: 0 });
}

test('양 진영·A/B 사이트는 유효 경로를 만들고 공격은 왼쪽에서 시작한다', () => {
  for (const side of ['home', 'away']) for (const site of ['A', 'B']) {
    const { state } = sample(side, site);
    assert.equal(state.combat, true);
    assert.equal(state.round.attackTeam, side);
    assert.equal(state.round.siteName, site);
    for (const actor of state.actors) {
      assert.equal(actor.x, actor.team === side ? 100 : 860);
      assert.ok(actor.route.length > 1);
      assert.ok(actor.route.every(point => canOccupy(RELAY_MAP, point.x, point.y, actor.radius)));
    }
  }
  assert.throws(() => sample('invalid'));
  assert.throws(() => sample('home', 'invalid'));
});

test('사이트 안의 운반자가 4초 동안 정지해 설치하고 사격하지 않는다', () => {
  const { state, carrier } = plantFixture();
  assert.equal(state.round.action.type, 'plant');
  advancePractice(state, RELAY_MAP, 3950);
  assert.equal(state.round.bomb.status, 'carried');
  assert.equal(carrier.stats.shots, 0);
  assert.equal(carrier.x, 820);
  advancePractice(state, RELAY_MAP, 50);
  assert.equal(state.round.bomb.status, 'planted');
  assert.equal(state.round.bomb.plantedTick, 80);
  assert.equal(state.complete, false);
  assert.equal(state.events.filter(event => event.type === 'bomb-planted').length, 1);
});

test('사이트 밖에서는 설치하지 않고 감지·사망으로 설치 진행이 취소된다', () => {
  const { state, carrier } = plantFixture();
  carrier.x = 780;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.action, null);
  carrier.x = 820; prepareRound(state, RELAY_MAP);
  state.tick = 40;
  const enemy = state.actors[5];
  Object.assign(enemy, { x: 860, y: 140 });
  Object.assign(carrier, { viewRange: 200, facing: 0 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.action, null);
  enemy.x = 100; carrier.viewRange = 0;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.action.startTick, 40);
  carrier.alive = false; carrier.hp = 0;
  state.tick = 120; resolveRound(state);
  assert.equal(state.round.bomb.status, 'dropped');
  assert.equal(state.round.action, null);
});

test('운반자 사망 위치에 폭탄을 떨어뜨리고 가까운 생존 공격수가 회수한다', () => {
  const { state } = sample();
  const carrier = state.actors[0];
  carrier.alive = false; carrier.hp = 0;
  resolveRound(state);
  assert.equal(state.round.bomb.status, 'dropped');
  assert.equal(state.round.bomb.x, carrier.x);
  assert.equal(state.round.bomb.y, carrier.y);
  const teammate = state.actors[1];
  prepareRound(state, RELAY_MAP);
  assert.deepEqual(teammate.route.at(-1), { x: carrier.x, y: carrier.y });
  Object.assign(teammate, { x: carrier.x, y: carrier.y });
  resolveRound(state);
  assert.equal(state.round.bomb.status, 'carried');
  assert.equal(state.round.bomb.carrierId, teammate.id);
  assert.equal(state.events.filter(event => event.type === 'bomb-pickup').length, 1);
});

test('설치 전 공격 전멸·수비 전멸·양 팀 전멸·115초 만료를 판정한다', () => {
  for (const side of ['home', 'away']) {
    const other = side === 'home' ? 'away' : 'home';
    for (const [dead, winner, reason] of [[side, other, 'attack-eliminated'], [other, side, 'defense-eliminated'], ['both', other, 'attack-eliminated']]) {
      const { state } = sample(side);
      if (dead === 'both') { killTeam(state, side); killTeam(state, other); } else killTeam(state, dead);
      resolveRound(state);
      assert.equal(state.round.winner, winner);
      assert.equal(state.endReason, reason);
    }
  }
  const { state } = sample();
  state.tick = ROUND_RULES.limitTicks - 1; resolveRound(state);
  assert.equal(state.complete, false);
  state.tick++; resolveRound(state);
  assert.equal(state.endReason, 'timeout');
  assert.equal(state.round.winner, 'away');
});

test('설치 전 제한 시간 만료 틱에는 설치를 완료할 수 없다', () => {
  const { state } = plantFixture();
  state.round.action.startTick = ROUND_RULES.limitTicks - ROUND_RULES.plantTicks;
  state.tick = ROUND_RULES.limitTicks;
  resolveRound(state);
  assert.equal(state.endReason, 'timeout');
  assert.equal(state.round.bomb.status, 'carried');
});

test('설치 후 공격팀 전멸은 즉시 종료되지 않고 수비가 7초 해체할 수 있다', () => {
  const state = plantedFixture();
  killTeam(state, 'home');
  resolveRound(state);
  assert.equal(state.complete, false);
  advancePractice(state, RELAY_MAP, 6950);
  assert.equal(state.complete, false);
  advancePractice(state, RELAY_MAP, 50);
  assert.equal(state.round.bomb.status, 'defused');
  assert.equal(state.round.winner, 'away');
  assert.equal(state.endReason, 'defused');
});

test('해체 담당자가 사망하면 다른 수비수가 처음부터 해체한다', () => {
  const state = plantedFixture();
  state.tick = 150;
  state.actors[5].alive = false;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.action, null);
  Object.assign(state.actors[6], { x: 820, y: 140 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.action.actorId, state.actors[6].id);
  assert.equal(state.round.action.startTick, 150);
  state.tick = 289; resolveRound(state);
  assert.equal(state.complete, false);
  state.tick = 290; resolveRound(state);
  assert.equal(state.endReason, 'defused');
});

test('설치 후 양 팀 전멸은 폭발까지 계속되며 40초에 공격 승리한다', () => {
  const state = plantedFixture();
  killTeam(state, 'home'); killTeam(state, 'away');
  state.tick = 899; resolveRound(state);
  assert.equal(state.complete, false);
  state.tick = 900; resolveRound(state);
  assert.equal(state.endReason, 'explosion');
  assert.equal(state.round.winner, 'home');
});

test('폭발과 해체 완료가 같은 틱이면 폭발이 우선하고 종료는 한 번만 기록한다', () => {
  const state = plantedFixture();
  state.round.action.startTick = 900 - ROUND_RULES.defuseTicks;
  state.tick = 900; resolveRound(state);
  assert.equal(state.endReason, 'explosion');
  const before = structuredClone(state);
  advancePractice(state, RELAY_MAP, 50000); stepPractice(state, RELAY_MAP);
  resolveRound(state);
  assert.deepEqual(state, before);
  assert.equal(state.events.filter(event => event.type === 'round-end').length, 1);
});

test('설치 후에는 원래 115초를 지나도 폭탄 타이머가 라운드를 결정한다', () => {
  const state = plantedFixture();
  state.round.bomb.plantedTick = 2200;
  state.round.action = null;
  state.tick = 2400; resolveRound(state);
  assert.equal(state.complete, false);
  state.tick = 3000; resolveRound(state);
  assert.equal(state.endReason, 'explosion');
});

test('해체는 폭탄 근처에서만 시작하며 적을 감지하면 진행이 초기화된다', () => {
  const state = plantedFixture();
  const defender = state.actors[5];
  defender.x = 860;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.action, null);
  defender.x = 820;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.action.type, 'defuse');
  Object.assign(state.actors[0], { x: 780, y: 140 });
  Object.assign(defender, { viewRange: 200, facing: Math.PI });
  state.tick = 150;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.action, null);
  defender.viewRange = 0;
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.action.startTick, 150);
});

test('설치 후 수비 전멸은 생존 공격팀의 승리로 끝난다', () => {
  const state = plantedFixture();
  killTeam(state, 'away');
  resolveRound(state);
  assert.equal(state.complete, true);
  assert.equal(state.endReason, 'defense-eliminated');
  assert.equal(state.round.winner, 'home');
});

test('양 진영·사이트·여러 시드의 실제 라운드는 종료되고 원본과 시간 분할 재현을 보존한다', () => {
  for (const side of ['home', 'away']) for (const site of ['A', 'B']) for (const seed of [0, 42]) {
    const { world, state } = sample(side, site, seed);
    const before = structuredClone(world);
    const divided = structuredClone(state);
    advancePractice(state, RELAY_MAP, 160000);
    for (let index = 0; index < 9600 && !divided.complete; index++) advancePractice(divided, RELAY_MAP, 1000 / 60);
    assert.equal(state.complete, true);
    assert.ok(['home', 'away'].includes(state.round.winner));
    assert.equal(state.events.filter(event => event.type === 'round-end').length, 1);
    // 특정 시드의 승리 방식은 고정하지 않는다. 설치/해체 경계는 위의 통제된 테스트에서 검증한다.
    assert.ok(['attack-eliminated', 'defense-eliminated', 'timeout', 'explosion', 'defused'].includes(state.endReason));
    assert.deepEqual(state, divided);
    assert.deepEqual(world, before);
    for (const actor of state.actors) assert.ok(canOccupy(RELAY_MAP, actor.x, actor.y, actor.radius));
  }
});
