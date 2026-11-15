import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld as createNewWorld } from '../src/game/create-world.js';
// Existing in-season behavior; fresh-game preseason is covered separately.
const createWorld = (...args) => { const world = createNewWorld(...args); world.seasonCalendar = { mode: 'legacy', phase: 'season' }; return world; };

import { getClubView } from '../src/game/world-selectors.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createPractice } from '../src/simulation/practice.js';
import { updateEconomy, nextEconomyRound } from '../src/simulation/economy.js';
import { updateMatch } from '../src/simulation/match.js';
import { advanceOpponentStrategy } from '../src/simulation/opponent-strategy.js';
import { createOfficialPractice, nextOfficialFixture } from '../src/game/official-match.js';

function fixture(map = PRACTICE_MAPS[0], aiTeams = ['away'], leagues = {}) {
  const world = createWorld(createClub('전략 검사').club, 42);
  const home = getClubView(world), away = getClubView(world, world.clubs[1].id);
  home.leagueId = leagues.home ?? home.leagueId;
  away.leagueId = leagues.away ?? away.leagueId;
  return { map, world, state: createPractice(map, home, away, { match: true, seed: 42, attackTeam: 'home', aiTeams,
    attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } }) };
}
function finishRound(state, map, winner) {
  // 승패 입력을 구성해 경기 경계/경제/전략 전환만 검증한다. 실제 사격 결과 검사는 별도다.
  state.complete = true;
  state.tick = 100;
  state.endReason = 'attack-eliminated';
  state.round.winner = winner;
  updateEconomy(state);
  updateMatch(state);
  assert.equal(nextEconomyRound(state, map), true);
}

test('공식 경기만 AI 대상 팀을 지정하며 관전/AI 양 팀 계산은 같은 맵별 전략을 사용한다', () => {
  const { world } = fixture();
  const fixtureInfo = nextOfficialFixture(world);
  assert.deepEqual(createOfficialPractice(world, fixtureInfo).aiTeams, ['away']);
  assert.deepEqual(createOfficialPractice(world, fixtureInfo, false).aiTeams, ['home', 'away']);
  for (const map of PRACTICE_MAPS) {
    const { state } = fixture(map);
    assert.equal(state.attackPlans.home, 'execute');
    assert.equal(state.defensePlans.home, 'standard');
    assert.equal(state.attackPlans.away, map.id === 'relay' ? 'split' : 'execute');
    assert.equal(state.defensePlans.away, map.id === 'relay' ? 'forward' : 'standard');
    const both = fixture(map, ['home', 'away']).state;
    assert.equal(both.attackPlans.home, state.attackPlans.away);
    assert.equal(both.defensePlans.home, state.defensePlans.away);
  }
  const normal = fixture(PRACTICE_MAPS[0], []).state;
  assert.equal(normal.opponentStrategy, undefined);
  assert.equal(normal.defensePlans.away, 'standard');
});

test('전국 리그 동일 진영 2연패 후 다음 구매에만 전술을 바꾸며 승리는 연패를 끊고 내 팀 명령을 보존한다', () => {
  const { state, map } = fixture(PRACTICE_MAPS[0], ['away'], { away: 'national' });
  const randomState = state.randomState;
  const initial = state.defensePlans.away;
  finishRound(state, map, 'home');
  assert.equal(state.defensePlans.away, initial);
  finishRound(state, map, 'away');
  assert.equal(state.opponentStrategy.teams.away.defenseLosses, 0);
  finishRound(state, map, 'home');
  assert.equal(state.defensePlans.away, initial);
  finishRound(state, map, 'home');
  assert.notEqual(state.defensePlans.away, initial);
  assert.equal(state.economy.phase, 'buy');
  assert.deepEqual(state.opponentStrategy.changes, [{ roundNumber: 5, team: 'away', role: 'defense', from: initial, to: 'standard' }]);
  assert.equal(state.attackPlans.home, 'execute');
  assert.equal(state.defensePlans.home, 'standard');
  assert.equal(state.randomState, randomState);
});

test('공수 교대 때 수비 연패로 공격 전술을 바꾸지 않고 같은 진영의 연패만 사용한다', () => {
  const { state } = fixture(PRACTICE_MAPS[0], ['away'], { away: 'national' });
  state.economy.roundNumber = 12;
  state.round.attackTeam = 'home'; state.round.winner = 'home';
  state.opponentStrategy.teams.away.defenseLosses = 1;
  advanceOpponentStrategy(state, 'away');
  assert.equal(state.opponentStrategy.teams.away.defenseLosses, 2);
  assert.equal(state.opponentStrategy.teams.away.attackLosses, 0);
  assert.equal(state.attackPlans.away, 'split');
  assert.equal(state.opponentStrategy.changes.length, 0);
  advanceOpponentStrategy(state, 'away');
  assert.equal(state.opponentStrategy.teams.away.defenseLosses, 2, '동일 종료 라운드 중복 집계를 막는다');
  state.economy.roundNumber = 13; state.round.attackTeam = 'away';
  advanceOpponentStrategy(state, 'away');
  assert.equal(state.attackPlans.away, 'split');
  state.economy.roundNumber = 14;
  advanceOpponentStrategy(state, 'away');
  assert.equal(state.attackPlans.away, 'execute');
  assert.equal(state.opponentStrategy.teams.away.defenseLosses, 2);
});

test('리그별 6/4/3/2/1연패 경계에서 다음 구매 전술이 바뀐다', () => {
  for (const [leagueId, threshold] of Object.entries({ pc: 6, city: 4, province: 3, national: 2, world: 1 })) {
    const { state, map } = fixture(PRACTICE_MAPS[0], ['away'], { away: leagueId });
    const initial = state.defensePlans.away;
    for (let loss = 1; loss <= threshold; loss++) {
      finishRound(state, map, 'home');
      assert.equal(state.defensePlans.away === initial, loss < threshold, `${leagueId} ${loss}연패`);
    }
    assert.equal(state.opponentStrategy.changes.length, 1);
    assert.equal(state.opponentStrategy.changes[0].roundNumber, threshold + 1);
    assert.equal(state.opponentStrategy.teams.away.defenseLosses, 0);
    assert.equal(state.economy.phase, 'buy');
  }
});

test('AI 양 팀은 각 구단 리그 기준을 쓰고 PC방은 2연패에 바꾸지 않는다', () => {
  const { state, map } = fixture(PRACTICE_MAPS[0], ['home', 'away'], { home: 'world', away: 'pc' });
  assert.equal(state.opponentStrategy.teams.home.switchAfterLosses, 1);
  assert.equal(state.opponentStrategy.teams.away.switchAfterLosses, 6);
  const initialDefense = state.defensePlans.away;
  const initialAttack = state.attackPlans.home;
  finishRound(state, map, 'home');
  finishRound(state, map, 'home');
  assert.equal(state.defensePlans.away, initialDefense);
  finishRound(state, map, 'away');
  assert.notEqual(state.attackPlans.home, initialAttack);
  assert.equal(state.defensePlans.away, initialDefense);
  assert.equal(state.opponentStrategy.teams.away.defenseLosses, 0);
});

test('AI 팀 중복·잘못된 진영을 거부한다', () => {
  assert.throws(() => fixture(PRACTICE_MAPS[0], ['away', 'away']), /AI 전략/);
  assert.throws(() => fixture(PRACTICE_MAPS[0], ['enemy']), /AI 전략/);
});

test('내 팀 능력 향상은 상대 능력이나 리그별 전환 기준을 숨게 바꾸지 않는다', () => {
  const { world, map, state } = fixture(PRACTICE_MAPS[0], ['away'], { away: 'world' });
  const home = structuredClone(getClubView(world));
  const away = structuredClone(getClubView(world, world.clubs[1].id));
  away.leagueId = 'world';
  for (const player of home.players) for (const key of ['aim', 'intelligence', 'stamina']) player[key] = Math.min(99, player[key] + 20);
  const improved = createPractice(map, home, away, { match: true, seed: 42, aiTeams: ['away'],
    attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
  const stats = current => current.actors.filter(actor => actor.team === 'away').map(actor => [actor.aim, actor.intelligence, actor.stamina]);
  assert.deepEqual(stats(improved), stats(state));
  assert.equal(improved.opponentStrategy.teams.away.switchAfterLosses, 1);
  assert.ok(improved.actors[0].aim > state.actors[0].aim);
});
