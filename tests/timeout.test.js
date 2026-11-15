import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP as map } from '../src/data/maps/relay.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { startEconomyRound, nextEconomyRound, buyRifle } from '../src/simulation/economy.js';
import { canEditTactics, requestTimeout, requestPause, resumeTimeout } from '../src/simulation/timeout.js';
import { setAttackPlan } from '../src/simulation/attack-tactics.js';
import { setDefensePlan } from '../src/simulation/defense-tactics.js';
import { setManualRoute, manualRouteStart } from '../src/simulation/manual-tactics.js';

function sample(attackTeam = 'home', match = true) {
  const world = createWorld(createClub('타임아웃').club, 42);
  return createPractice(map, getClubView(world), getClubView(world, world.clubs[1].id), {
    match, economy: true, seed: 42, attackTeam,
    attackPlans: { home: 'execute', away: 'execute' },
    defensePlans: { home: 'standard', away: 'standard' },
  });
}

test('일반 퍼즈는 모든 연습 모드에서 3회이며 감독 편집을 열지 않고 계산을 동결한다', () => {
  const world = createWorld(createClub('퍼즈').club, 42);
  for (const options of [{}, { combat: true }, { round: true }, { economy: true }, { match: true }]) {
    const state = createPractice(map, getClubView(world), getClubView(world, world.clubs[1].id), options);
    if (state.economy) startEconomyRound(state);
    stepPractice(state, map);
    assert.equal(requestPause(state), true);
    assert.equal(canEditTactics(state), false);
    const frozen = structuredClone(state);
    advancePractice(state, map, 1000000);
    assert.deepEqual(state, frozen);
    assert.equal(requestPause(state), false);
    resumeTimeout(state);
    assert.equal(state.timeout.remaining, 2);
    for (let i = 0; i < 2; i++) { assert.equal(requestPause(state), true); resumeTimeout(state); }
    assert.equal(requestPause(state), false);
    assert.equal(requestTimeout(state), false);
  }
});

test('타임아웃은 MR12 전투 중에만 사용하고 중복·소진·구매를 차단한다', () => {
  const state = sample();
  assert.equal(requestTimeout(state), false);
  startEconomyRound(state); state.round.started = true;
  assert.equal(canEditTactics(state), false);
  for (let i = 0; i < 3; i++) {
    assert.equal(requestTimeout(state), true);
    assert.equal(state.timeout.remaining, 2 - i);
    assert.equal(requestTimeout(state), false);
    assert.equal(canEditTactics(state), true);
    assert.equal(buyRifle(state, 'home-1').ok, false);
    assert.equal(resumeTimeout(state), true);
    assert.equal(resumeTimeout(state), false);
    assert.equal(canEditTactics(state), false);
  }
  assert.equal(requestTimeout(state), false);
  const other = sample('home', false);
  startEconomyRound(other); stepPractice(other, map);
  assert.equal(requestTimeout(other), false);
});

test('설치·해체·폭발과 재장전 도중 모든 계산을 정지하고 재개 후 같은 시드 결과를 보존한다', () => {
  for (const bombStatus of ['carried', 'planted']) {
    const state = sample();
    startEconomyRound(state); advancePractice(state, map, 1025);
    state.round.bomb.status = bombStatus;
    if (bombStatus === 'planted') state.round.bomb.plantedTick = state.tick;
    state.round.action = { type: bombStatus === 'planted' ? 'defuse' : 'plant', actorId: 'home-1', startTick: state.tick };
    state.actors[0].reloadUntilTick = state.tick + 50;
    const replay = structuredClone(state);
    assert.equal(requestTimeout(state), true);
    const frozen = structuredClone(state);
    for (let i = 0; i < 4; i++) { stepPractice(state, map); advancePractice(state, map, 3600000); }
    assert.deepEqual(state, frozen);
    resumeTimeout(state);
    replay.timeout.remaining = state.timeout.remaining;
    advancePractice(state, map, 1000); advancePractice(replay, map, 1000);
    assert.deepEqual(state, replay);
  }
});

test('타임아웃 전술·경로 변경은 물리 상태·폭탄 행동·상대 임무를 보존한다', () => {
  for (const side of ['home', 'away']) {
    const state = sample(side);
    startEconomyRound(state); advancePractice(state, map, 1000);
    assert.equal(requestTimeout(state), true);
    const physical = () => state.actors.map(a => [a.x, a.y, a.facing, a.hp, a.ammo, a.cash, a.alive, a.reloadUntilTick, a.stats]);
    const before = structuredClone(physical());
    const enemies = structuredClone(state.actors.filter(a => a.team === 'away'));
    const round = structuredClone(state.round);
    const actor = state.actors[0];
    assert.deepEqual(manualRouteStart(state, map, actor, side === 'home' ? 'attack' : 'defense'),
      { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) });
    assert.equal(setAttackPlan(state, map, 'split'), true);
    assert.equal(setDefensePlan(state, map, 'forward'), true);
    assert.equal(setManualRoute(state, map, actor.id, side === 'home' ? 'attack' : 'defense', [{ x: 9, y: 6 }], 1).ok, true);
    assert.deepEqual(physical(), before);
    assert.deepEqual(state.actors.filter(a => a.team === 'away'), enemies);
    assert.deepEqual(state.round, round);
  }
});

test('일반 퍼즈와 감독 타임아웃은 총 3회를 공유하고 모든 진영 교대·연장에서 충전하지 않는다', () => {
  const state = sample();
  for (let round = 1; round <= 34; round++) {
    if (round > 1) assert.equal(nextEconomyRound(state, map), true);
    if (round === 13) assert.equal(state.timeout.remaining, 0);
    if (round === 25 || round === 31) assert.equal(state.timeout.remaining, 0);
    if (round === 28 || round === 34) assert.equal(state.timeout.remaining, 0);
    startEconomyRound(state); state.round.started = true;
    if ([1, 25, 31].includes(round)) {
      while (state.timeout.remaining) { assert.equal(requestTimeout(state), true); resumeTimeout(state); }
    }
    const winner = round <= 12 || round > 30 ? 'home' : round <= 24 ? 'away' : round <= 27 ? 'home' : 'away';
    for (const actor of state.actors) if (actor.team !== winner) { actor.alive = false; actor.hp = 0; }
    stepPractice(state, map);
    assert.equal(requestTimeout(state), false);
  }
  assert.equal(state.match.complete, true);
  assert.equal(requestTimeout(state), false);
  assert.deepEqual(sample().timeout, { active: false, remaining: 3 });
});
