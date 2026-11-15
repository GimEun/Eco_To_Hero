import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { prepareRound } from '../src/simulation/round.js';
import { cellCenter } from '../src/simulation/geometry.js';
import { selectTarget } from '../src/simulation/combat.js';
import { setManualRoute } from '../src/simulation/manual-tactics.js';

const club = name => ({ name, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${name}${i}`, name: `${name}${i}`, nickname: `${name}${i}`, aim: 50, intelligence: 50, stamina: 50,
})) });
function fixture(map = PRACTICE_MAPS[0], attackTeam = 'home', plan = 'standard', site = 'A') {
  const state = createPractice(map, club('home'), club('away'), {
    round: true, attackTeam, defensePlans: { home: plan, away: plan },
  });
  for (const actor of state.actors) {
    actor.viewRange = 0;
    if (actor.defenseTask) Object.assign(actor, actor.defenseTask.anchor, { objectiveKey: null });
  }
  state.tick = 20;
  const attackers = state.actors.filter(actor => actor.team === attackTeam);
  const defenders = state.actors.filter(actor => actor.team !== attackTeam);
  state.round.defenseContacts = attackers.slice(0, 2).map((actor, index) => {
    const [x, y] = map.tactics.attackSites[site].entry[index];
    return { id: actor.id, ...cellCenter(map, { x, y }), tick: 19 };
  });
  state.round.defenseContact = { ...state.round.defenseContacts[0] };
  const anchor = defenders.find(actor => actor.defenseTask.role === 'anchor' && actor.defenseTask.site !== site);
  const guard = defenders.find(actor => actor.defenseTask.role === 'front' && actor.defenseTask.site === anchor.defenseTask.site);
  return { state, map, attackers, defenders, anchor, guard };
}
const supporting = actor => actor.intent.includes('앵커 합류');

test('3맵·양 진영·양 전술·양 사이트에서 앵커 한 명만 실제 합류하고 반대 감시는 남는다', () => {
  for (const map of PRACTICE_MAPS) for (const team of ['home', 'away'])
    for (const plan of ['standard', 'forward']) for (const site of ['A', 'B']) {
      const { state, anchor, guard, defenders } = fixture(map, team, plan, site);
      const before = { x: anchor.x, y: anchor.y };
      prepareRound(state, map);
      assert.equal(defenders.filter(supporting).length, 1);
      assert.ok(supporting(anchor));
      assert.ok(!supporting(guard));
      assert.equal(guard.defenseTask.site, anchor.defenseTask.site);
      const goal = guard.route.at(-1);
      assert.ok(Math.hypot(goal.x - guard.defenseTask.anchor.x, goal.y - guard.defenseTask.anchor.y) <= map.tileSize);
      stepPractice(state, map);
      assert.ok(Math.hypot(anchor.x - before.x, anchor.y - before.y) > 0);
    }
});

test('숨은 적의 현재 위치를 바꿔도 합류 경로·시선·난수 상태가 같다', () => {
  const a = fixture(), b = fixture();
  b.attackers.forEach((actor, i) => Object.assign(actor, { x: 100 + i * 40, y: 540 }));
  prepareRound(a.state, a.map); prepareRound(b.state, b.map);
  assert.deepEqual(a.anchor.route, b.anchor.route);
  assert.equal(a.anchor.watchAngle, b.anchor.watchAngle);
  assert.equal(a.state.randomState, b.state.randomState);
  assert.ok(supporting(a.anchor));
});

test('최근 접촉 2초 경계·기억 만료·자기 사이트 접촉에 맞춰 합류를 해제한다', () => {
  for (const mode of ['recent', 'old', 'expired', 'local']) {
    const { state, map, anchor, attackers } = fixture();
    if (mode === 'recent') state.tick = 59;
    if (mode === 'old') state.tick = 60;
    if (mode === 'expired') state.tick = 120;
    if (mode === 'local') state.round.defenseContacts.push({ id: attackers[2].id, x: 820, y: 500, tick: 19 });
    prepareRound(state, map);
    assert.equal(supporting(anchor), mode === 'recent');
  }
  const { state, map, anchor } = fixture();
  prepareRound(state, map);
  assert.ok(supporting(anchor));
  state.tick = 60; prepareRound(state, map);
  assert.ok(!supporting(anchor));
  assert.ok(!anchor.objectiveKey.includes('contact-support:'));
});

test('적 한 명의 단순 관측은 기다리지만 아군의 실제 교전이 있으면 지원한다', () => {
  const { state, map, anchor, attackers, defenders } = fixture();
  state.round.defenseContacts = [{ id: attackers[0].id, x: 620, y: 260, tick: 19 }];
  state.round.defenseContact = { ...state.round.defenseContacts[0] };
  prepareRound(state, map);
  assert.ok(!supporting(anchor));
  const fighter = defenders.find(actor => actor.defenseTask.role === 'front' && actor.defenseTask.site === 'A');
  Object.assign(fighter, { x: 780, y: 260, facing: Math.PI, viewRange: 240 });
  Object.assign(attackers[0], { x: 620, y: 260 });
  assert.equal(selectTarget(state, map, fighter)?.id, attackers[0].id);
  prepareRound(state, map);
  assert.ok(supporting(anchor));
});

test('남겨둘 감시가 죽었거나 다른 구역에 있거나 수동 임무 중이면 앵커가 이탈하지 않는다', () => {
  for (const mode of ['dead', 'elsewhere', 'manual']) {
    const { state, map, anchor, guard } = fixture(PRACTICE_MAPS[0], 'away');
    if (mode === 'dead') { guard.alive = false; guard.hp = 0; }
    if (mode === 'elsewhere') Object.assign(guard, { x: 820, y: 140 });
    if (mode === 'manual') assert.equal(setManualRoute(state, map, guard.id, 'defense', [{ x: 21, y: 12 }], Math.PI).ok, true);
    prepareRound(state, map);
    assert.ok(!supporting(anchor));
  }
});

test('앵커의 수동 명령·현재 교전·저체력·기존 후퇴는 합류보다 우선한다', () => {
  for (const mode of ['manual', 'combat', 'injured', 'withdrawn']) {
    const { state, map, anchor, attackers } = fixture(PRACTICE_MAPS[0], 'away');
    if (mode === 'manual') assert.equal(setManualRoute(state, map, anchor.id, 'defense', [{ x: 21, y: 12 }], Math.PI).ok, true);
    if (mode === 'combat') {
      Object.assign(anchor, { x: 780, y: 380, facing: Math.PI, viewRange: 240 });
      Object.assign(attackers[2], { x: 620, y: 380 });
      assert.equal(selectTarget(state, map, anchor)?.id, attackers[2].id);
    }
    if (mode === 'injured') anchor.hp = 30;
    if (mode === 'withdrawn') anchor.defenseTask.withdrawn = true;
    prepareRound(state, map);
    assert.ok(!supporting(anchor));
    if (mode === 'manual') assert.match(anchor.intent, /수동/);
    if (mode === 'injured' || mode === 'withdrawn') assert.match(anchor.intent, /후퇴/);
  }
});

test('설치 후 해체 판단과 마지막 수비수의 기존 최근 관측 대응을 보존한다', () => {
  for (const mode of ['planted', 'lone']) {
    const { state, map, anchor, defenders } = fixture();
    if (mode === 'planted') Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: 820, y: 140, plantedTick: 20 });
    else for (const defender of defenders.filter(actor => actor.id !== anchor.id)) { defender.alive = false; defender.hp = 0; }
    prepareRound(state, map);
    assert.ok(!supporting(anchor));
    if (mode === 'lone') assert.equal(anchor.intent, '마지막 수비 · 최근 관측 위치 대응');
    else assert.ok(defenders.some(actor => actor.intent === '폭탄 해체를 위해 접근'));
  }
});

test('합류 중에도 프레임 분할과 배우 배열 순서를 바꿔 같은 결과를 재현한다', () => {
  const { state, map } = fixture();
  const split = structuredClone(state), reversed = structuredClone(state);
  reversed.actors.reverse();
  advancePractice(state, map, 1000);
  for (let i = 0; i < 20; i++) advancePractice(split, map, 50);
  advancePractice(reversed, map, 1000);
  reversed.actors.sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(state, split);
  state.actors.sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(state, reversed);
});
