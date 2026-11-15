import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { prepareRound } from '../src/simulation/round.js';
import { moveActors } from '../src/simulation/actor-movement.js';
import { startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { selectTarget } from '../src/simulation/combat.js';
import { canOccupy } from '../src/simulation/geometry.js';

const map = { ...RELAY_MAP, walls: [] };
const clubs = ['home', 'away'].map(team => ({ name: team, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${team}-${i}`, name: `${team}-${i}`, nickname: `${team}-${i}`, aim: 45, intelligence: 45, stamina: 45,
})) }));

function fixture({ attackTeam = 'home', left = 300, defenders = 1, attackers = 3, match = false } = {}) {
  const state = createPractice(map, ...clubs, { economy: true, match, attackTeam });
  startEconomyRound(state);
  for (const actor of state.actors) Object.assign(actor, { alive: false, hp: 0, viewRange: 0,
    nextShotTick: 100000, nextUtilityTick: 100000, throwables: { smoke: 0, grenade: 0, flashbang: 0 } });
  const defense = state.actors.filter(actor => actor.team !== attackTeam).slice(0, defenders);
  const attack = state.actors.filter(actor => actor.team === attackTeam).slice(0, attackers);
  for (const [i, actor] of defense.entries()) Object.assign(actor, { alive: true, hp: 100,
    x: 620, y: 140 + i * 40, speed: 80, weaponId: 'training-rifle', ammo: 30, armor: 70, fieldOfView: Math.PI * 2 });
  for (const [i, actor] of attack.entries()) Object.assign(actor, { alive: true, hp: 100, x: 780 + i * 40,
    y: 180, speed: 0, weaponId: 'basic-pistol' });
  state.tick = 800 - left;
  Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: 820, y: 140, plantedTick: 0 });
  state.round.defuserId = null;
  state.round.action = null;
  return { state, defense, attack, actor: defense[0] };
}

test('양 진영에서 마감 전 완료 가능한 해체는 유지하고 마감과 같은 틱이면 보존한다', () => {
  for (const attackTeam of ['home', 'away']) {
    const { state, actor } = fixture({ attackTeam, left: 141 });
    Object.assign(actor, { x: 820, y: 140 });
    prepareRound(state, map);
    assert.equal(state.round.saveReason, null);
    assert.equal(actor.action, 'defuse');
    state.round.action = null;
    state.tick++;
    prepareRound(state, map);
    assert.equal(state.round.saveReason, 'time');
    assert.equal(state.round.defuserId, null);
    assert.equal(actor.action, null);
    assert.match(actor.intent, /장비 보존/);
    assert.ok(actor.retreating);
  }
});

test('이미 진행한 해체는 새 해체 시간 대신 남은 시간을 사용해 실제로 완료한다', () => {
  const { state, actor } = fixture({ left: 41 });
  Object.assign(actor, { x: 820, y: 140, hp: 30 });
  state.round.defuserId = actor.id;
  state.round.action = { type: 'defuse', actorId: actor.id, startTick: state.tick - 100 };
  prepareRound(state, map);
  assert.equal(state.round.saveReason, null);
  assert.equal(actor.action, 'defuse');
  advancePractice(state, map, 2000);
  assert.equal(state.endReason, 'defused');
  assert.equal(state.tick, 799);
});

test('직선 거리가 아닌 벽 우회 경로와 이동 속도로 해체 가능 시간을 판단한다', () => {
  const { state, actor } = fixture({ left: 200 });
  actor.x = 740;
  prepareRound(state, map);
  assert.equal(state.round.saveReason, null);
  const blocked = structuredClone(state);
  blocked.round.defusePaths = {};
  const wallMap = { ...map, walls: [{ x: 19, y: 0, width: 1, height: 6 }] };
  prepareRound(blocked, wallMap);
  assert.equal(blocked.round.saveReason, 'time');
  actor.speed = 1;
  prepareRound(state, map);
  assert.equal(state.round.saveReason, 'time');
});

test('기존 해체 담당이 늦어도 다른 선수가 가능하면 담당을 교대하고 팀 전체 보존을 막는다', () => {
  const { state, defense } = fixture({ left: 200, defenders: 2 });
  Object.assign(defense[0], { x: 780, y: 140, speed: 1 });
  Object.assign(defense[1], { x: 700, y: 140 });
  state.round.defuserId = defense[0].id;
  prepareRound(state, map);
  assert.equal(state.round.saveReason, null);
  assert.equal(state.round.defuserId, defense[1].id);
});

test('저체력 마지막 수비수도 적 경계를 실제로 관측해야 불리한 재탈환을 포기한다', () => {
  const { state, actor, attack } = fixture();
  actor.hp = 40;
  prepareRound(state, map);
  assert.equal(state.round.saveReason, null);
  // 보이지 않는 적의 체력·장비는 판단에 영향을 주지 않는다.
  for (const enemy of attack) Object.assign(enemy, { hp: 1, weaponId: 'sniper' });
  prepareRound(state, map);
  assert.equal(state.round.saveReason, null);
  actor.viewRange = 300;
  prepareRound(state, map);
  assert.equal(state.round.saveReason, 'odds');
  assert.ok(state.round.defenseContacts.length >= 2);
  actor.viewRange = 0;
  state.tick += 101;
  prepareRound(state, map);
  assert.equal(state.round.defenseContacts.length, 0);
  assert.equal(state.round.saveReason, null);
  assert.equal(state.round.defuserId, actor.id);
});

test('체력·인원·장비·폭탄 근접·남은 시간에 여유가 있으면 재탈환을 유지한다', () => {
  for (const condition of ['hp', 'allies', 'gear', 'near', 'time']) {
    const { state, actor } = fixture({ defenders: condition === 'allies' ? 2 : 1, left: condition === 'time' ? 341 : 300 });
    Object.assign(actor, { hp: condition === 'hp' ? 46 : 40, viewRange: 300 });
    if (condition === 'gear') Object.assign(actor, { weaponId: 'basic-pistol', armor: 0 });
    if (condition === 'near') actor.x = 820;
    prepareRound(state, map);
    assert.equal(state.round.saveReason, null, condition);
  }
});

test('장비 초기화 직전과 상대 매치 포인트에서는 승산이 낮아도 가능한 해체를 시도한다', () => {
  for (const situation of ['half', 'overtime-half', 'match-point', 'overtime-point']) {
    const { state, actor } = fixture({ match: true });
    Object.assign(actor, { hp: 40, viewRange: 300 });
    if (situation === 'half') state.economy.roundNumber = 12;
    if (situation === 'overtime-half') state.economy.roundNumber = 27;
    if (situation === 'match-point') state.match.score.home = 12;
    if (situation === 'overtime-point') {
      state.match.overtime = 1; state.economy.roundNumber = 26; state.match.overtimeScore.home = 3;
    }
    prepareRound(state, map);
    assert.equal(state.round.saveReason, null, situation);
    assert.equal(state.round.defuserId, actor.id);
  }
});

test('관측된 교전 중에도 보존 이동이 계속되고 목적지와 실제 몸체가 벽을 침범하지 않는다', () => {
  const { state, actor } = fixture({ left: 100 });
  Object.assign(actor, { x: 780, y: 260, viewRange: 300 });
  prepareRound(state, RELAY_MAP);
  assert.equal(state.round.saveReason, 'time');
  const target = selectTarget(state, RELAY_MAP, actor);
  assert.ok(target);
  const before = actor.x;
  for (let i = 0; i < 100; i++) {
    moveActors(state, RELAY_MAP, new Set([actor.id]), 50);
    assert.ok(canOccupy(RELAY_MAP, actor.x, actor.y, actor.radius));
    state.tick++;
  }
  assert.ok(actor.x < before - 100);
  assert.ok(canOccupy(RELAY_MAP, actor.route.at(-1).x, actor.route.at(-1).y, actor.radius));
});

test('실제 폭발 종료·장비 계승·다음 라운드 보존 상태 초기화와 시간 분할을 검증한다', () => {
  const { state, actor } = fixture({ left: 100 });
  actor.throwables.smoke = 1;
  const divided = structuredClone(state);
  advancePractice(state, map, 5000);
  for (let i = 0; i < 500; i++) advancePractice(divided, map, 10);
  assert.deepEqual(state, divided);
  assert.equal(state.endReason, 'explosion');
  assert.ok(actor.alive);
  assert.equal(state.events.filter(event => event.type === 'equipment-save').length, 1);
  assert.ok(nextEconomyRound(state, map));
  assert.equal(actor.weaponId, 'training-rifle');
  assert.equal(actor.armor, 70);
  assert.equal(actor.throwables.smoke, 1);
  assert.equal(state.round.saveReason, null);
  assert.deepEqual(state.round.savePoints, {});
  assert.deepEqual(state.round.defusePaths, {});
  assert.doesNotMatch(actor.intent, /장비 보존/);
});

test('경제가 없는 단일 라운드에는 장비 계승 판단을 적용하지 않는다', () => {
  const { state } = fixture({ left: 100 });
  delete state.economy;
  prepareRound(state, map);
  assert.equal(state.round.saveReason, null);
  assert.ok(state.round.defuserId);
});
