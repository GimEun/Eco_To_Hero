import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { BASIC_PISTOL, TRAINING_RIFLE } from '../src/data/weapons.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { buyRifle, startEconomyRound, nextEconomyRound, updateEconomy } from '../src/simulation/economy.js';
import { updateMatch, matchPlayerStats } from '../src/simulation/match.js';

function sample(attackTeam = 'home', siteName = 'A', seed = 42) {
  const world = createWorld(createClub('경기 구단').club, seed);
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id),
    { match: true, seed, attackTeam, siteName });
  return { world, state };
}

// 경계 검증용: 실제 라운드 전멸 판정으로 지정된 팀의 승리 상태를 만든다.
function finishRound(state, winner) {
  // 일반 라운드·후반전·각 연장에서 현재 진영에 맞는 시야를 검증한다.
  for (const actor of state.actors) {
    const attacking = actor.team === state.round.attackTeam;
    assert.equal(actor.fieldOfView, Math.PI * (attacking ? 100 : 110) / 180);
    assert.equal(actor.viewRange, attacking ? 220 : 240);
  }
  assert.equal(startEconomyRound(state), true);
  for (const actor of state.actors) if (actor.team !== winner) Object.assign(actor, { alive: false, hp: 0 });
  stepPractice(state, RELAY_MAP);
  assert.equal(state.round.winner, winner);
  assert.equal(state.complete, true);
}
function series(state, winners) {
  for (let index = 0; index < winners.length; index++) {
    finishRound(state, winners[index]);
    if (index < winners.length - 1) assert.equal(nextEconomyRound(state, RELAY_MAP), true);
  }
}
function regulationTie(state) {
  series(state, [...Array(12).fill('home'), ...Array(12).fill('away')]);
  assert.deepEqual(state.match.score, { home: 12, away: 12 });
  assert.equal(state.match.complete, false);
}

test('MR12는 0:0·구매 단계에서 시작하고 시작 진영을 보존한다', () => {
  for (const side of ['home', 'away']) {
    const { state } = sample(side);
    assert.deepEqual(state.match.score, { home: 0, away: 0 });
    assert.equal(state.round.attackTeam, side);
    assert.equal(state.economy.phase, 'buy');
    assert.equal(state.match.history.length, 0);
    assert.equal(nextEconomyRound(state, RELAY_MAP), false);
  }
});

test('실제 라운드 점수와 이력은 정산 후 한 번만 반영한다', () => {
  const { state } = sample();
  updateMatch(state);
  assert.deepEqual(state.match.score, { home: 0, away: 0 });
  finishRound(state, 'home');
  const before = structuredClone(state);
  updateMatch(state); updateEconomy(state); stepPractice(state, RELAY_MAP);
  assert.deepEqual(state, before);
  assert.equal(state.match.history.length, 1);
  assert.equal(state.match.history[0].reason, 'defense-eliminated');
  assert.deepEqual(state.match.history[0].score, { home: 1, away: 0 });
  nextEconomyRound(state, RELAY_MAP); finishRound(state, 'away');
  assert.deepEqual(state.match.score, { home: 1, away: 1 });
  assert.deepEqual(state.match.history[0].score, { home: 1, away: 0 });
});

test('양 팀 모두 12승에서는 계속하고 13:0에서 종료하며 후반전 진영·자금·장비를 초기화한다', () => {
  for (const winner of ['home', 'away']) for (const firstSide of ['home', 'away']) {
    const { state } = sample(firstSide);
    series(state, Array(12).fill(winner));
    assert.equal(state.match.complete, false);
    assert.equal(state.round.attackTeam, firstSide);
    for (const actor of state.actors) { actor.cash = 16000; actor.weaponId = TRAINING_RIFLE.id; }
    nextEconomyRound(state, RELAY_MAP);
    assert.equal(state.round.attackTeam, firstSide === 'home' ? 'away' : 'home');
    assert.equal(state.economy.roundNumber, 13);
    for (const actor of state.actors) {
      assert.equal(actor.cash, 800);
      assert.equal(actor.weaponId, BASIC_PISTOL.id);
      assert.equal(actor.ammo, 12);
    }
    const resets = state.economy.ledger.filter(entry => entry.reason === 'halftime-reset');
    assert.equal(resets.length, 10);
    assert.ok(resets.every(entry => entry.roundNumber === 13 && entry.tick === 0 && entry.balance === 800));
    finishRound(state, winner);
    assert.equal(state.match.complete, true);
    assert.equal(state.match.winner, winner);
    assert.equal(state.match.score[winner], 13);
  }
});

test('정규 13:11은 24라운드에서 끝나며 연장을 시작하지 않는다', () => {
  const { state } = sample();
  series(state, [...Array.from({ length: 22 }, (_, index) => index % 2 ? 'away' : 'home'), 'home', 'home']);
  assert.deepEqual(state.match.score, { home: 13, away: 11 });
  assert.equal(state.match.complete, true);
  assert.equal(state.match.overtime, 0);
  assert.equal(nextEconomyRound(state, RELAY_MAP), false);
});

test('12:12 다음 구매에서 진영 교대·연장 1·$10000·권총으로 전환한다', () => {
  const { state } = sample('away', 'B');
  regulationTie(state);
  const side = state.round.attackTeam;
  nextEconomyRound(state, RELAY_MAP);
  assert.equal(state.match.overtime, 1);
  assert.deepEqual(state.match.overtimeScore, { home: 0, away: 0 });
  assert.equal(state.economy.roundNumber, 25);
  assert.equal(state.round.attackTeam, side === 'home' ? 'away' : 'home');
  assert.equal(state.round.siteName, 'B');
  for (const actor of state.actors) {
    assert.equal(actor.cash, 10000); assert.equal(actor.weaponId, BASIC_PISTOL.id);
  }
  assert.equal(state.economy.ledger.filter(entry => entry.reason === 'overtime-reset').length, 10);
});

test('연장에서는 총점 13을 넘어도 계속하고 해당 묶음 4승으로 종료한다', () => {
  for (const winner of ['home', 'away']) for (const losses of [0, 1, 2]) {
    const { state } = sample();
    regulationTie(state); nextEconomyRound(state, RELAY_MAP);
    const loser = winner === 'home' ? 'away' : 'home';
    series(state, Array(3).fill(winner));
    assert.equal(state.match.complete, false);
    assert.equal(state.match.score[winner], 15);
    const side = state.round.attackTeam;
    nextEconomyRound(state, RELAY_MAP);
    assert.notEqual(state.round.attackTeam, side);
    assert.deepEqual(state.match.overtimeScore, { [winner]: 3, [loser]: 0 });
    assert.ok(state.actors.every(actor => actor.cash === 10000 && actor.weaponId === BASIC_PISTOL.id));
    series(state, [...Array(losses).fill(loser), winner]);
    assert.equal(state.match.complete, true);
    assert.equal(state.match.winner, winner);
    assert.equal(state.match.score[winner], 16);
    assert.equal(state.match.score[loser], 12 + losses);
    assert.equal(state.match.history.length, 28 + losses);
  }
});

test('연장 3:3은 누적 점수를 보존하고 새 연장으로 반복한다', () => {
  const { state } = sample();
  regulationTie(state); nextEconomyRound(state, RELAY_MAP);
  for (let overtime = 1; overtime <= 2; overtime++) {
    series(state, [...Array(3).fill('home'), ...Array(3).fill('away')]);
    assert.equal(state.match.complete, false);
    assert.deepEqual(state.match.score, { home: 12 + overtime * 3, away: 12 + overtime * 3 });
    const side = state.round.attackTeam;
    nextEconomyRound(state, RELAY_MAP);
    assert.equal(state.match.overtime, overtime + 1);
    assert.deepEqual(state.match.overtimeScore, { home: 0, away: 0 });
    assert.notEqual(state.round.attackTeam, side);
    assert.ok(state.actors.every(actor => actor.cash === 10000 && actor.weaponId === BASIC_PISTOL.id));
  }
  series(state, Array(4).fill('home'));
  assert.equal(state.match.winner, 'home');
  assert.deepEqual(state.match.score, { home: 22, away: 18 });
  assert.equal(state.match.history.length, 40);
});

test('일반 라운드 전환은 초기화 없이 잔액과 생존 장비를 유지한다', () => {
  const { state } = sample();
  finishRound(state, 'home');
  const actor = state.actors[0];
  actor.weaponId = TRAINING_RIFLE.id;
  const cash = actor.cash;
  const side = state.round.attackTeam;
  nextEconomyRound(state, RELAY_MAP);
  assert.equal(actor.cash, cash); assert.equal(actor.weaponId, TRAINING_RIFLE.id);
  assert.equal(state.round.attackTeam, side);
  assert.equal(state.match.transition, null);
  assert.equal(state.economy.ledger.some(entry => entry.reason.endsWith('-reset')), false);
});

test('경기 종료 후 구매·시작·다음 라운드·시간 진행과 중복 집계를 막는다', () => {
  const { state } = sample();
  series(state, Array(13).fill('away'));
  const before = structuredClone(state);
  assert.equal(buyRifle(state, 'home-1').ok, false);
  assert.equal(startEconomyRound(state), false);
  assert.equal(nextEconomyRound(state, RELAY_MAP), false);
  advancePractice(state, RELAY_MAP, 100000); stepPractice(state, RELAY_MAP);
  updateMatch(state); updateEconomy(state);
  assert.deepEqual(state, before);
});

test('새 경기 생성은 이전 점수·이력·진영 교대·연장 상태를 가져오지 않는다', () => {
  const first = sample().state;
  regulationTie(first); nextEconomyRound(first, RELAY_MAP);
  const fresh = sample().state;
  assert.equal(fresh.match.overtime, 0);
  assert.deepEqual(fresh.match.score, { home: 0, away: 0 });
  assert.equal(fresh.match.history.length, 0);
  assert.equal(fresh.round.attackTeam, 'home');
  assert.ok(fresh.actors.every(actor => actor.cash === 800));
  for (const actor of fresh.actors) assert.ok(Object.values(matchPlayerStats(fresh, actor)).every(value => value === 0));
});

test('경기 누적 기록은 진행 중 반영·정산 중복 방지·후반전과 반복 연장·최종 종료를 보존한다', () => {
  const { state } = sample();
  const actor = state.actors[0];
  const perRound = { kills: 2, deaths: 1, assists: 3, damage: 70, shots: 5, hits: 3 };
  const winners = [...Array(12).fill('home'), ...Array(12).fill('away'),
    ...Array(3).fill('home'), ...Array(3).fill('away'), ...Array(4).fill('home')];
  for (let index = 0; index < winners.length; index++) {
    if (index) {
      nextEconomyRound(state, RELAY_MAP);
      assert.ok(Object.values(actor.stats).every(value => value === 0));
    }
    // 집계 경계를 위한 통제된 라운드 기록. 실제 이벤트 대조는 아래 통합 검사에서 수행한다.
    actor.stats = { ...perRound };
    const expected = Object.fromEntries(Object.entries(perRound).map(([key, value]) => [key, value * (index + 1)]));
    assert.deepEqual(matchPlayerStats(state, actor), expected);
    finishRound(state, winners[index]);
    assert.deepEqual(matchPlayerStats(state, actor), expected);
    updateMatch(state); updateMatch(state);
    assert.deepEqual(matchPlayerStats(state, actor), expected);
  }
  assert.equal(state.match.complete, true);
  assert.equal(state.match.overtime, 2);
  const final = structuredClone(state);
  assert.equal(nextEconomyRound(state, RELAY_MAP), false);
  advancePractice(state, RELAY_MAP, 1000);
  assert.deepEqual(state, final);
});

test('30:30까지 여섯 연장이 비겨도 다음 연장에서 4승을 얻으면 승자를 확정한다', () => {
  const { state } = sample();
  regulationTie(state);
  for (let overtime = 1; overtime <= 6; overtime++) {
    assert.equal(nextEconomyRound(state, RELAY_MAP), true);
    series(state, [...Array(3).fill('home'), ...Array(3).fill('away')]);
    assert.equal(state.match.complete, false);
    assert.deepEqual(state.match.score, { home: 12 + overtime * 3, away: 12 + overtime * 3 });
  }
  assert.deepEqual(state.match.score, { home: 30, away: 30 });
  nextEconomyRound(state, RELAY_MAP);
  series(state, Array(4).fill('home'));
  assert.equal(state.match.complete, true);
  assert.equal(state.match.winner, 'home');
  assert.deepEqual(state.match.score, { home: 34, away: 30 });
  assert.equal(nextEconomyRound(state, RELAY_MAP), false);
});

test('실제 교전·폭탄·구매를 연결한 경기는 프레임 분할과 무관하고 원본 세계를 보존한다', () => {
  for (const attackTeam of ['home', 'away']) for (const site of ['A', 'B']) {
    const { world, state } = sample(attackTeam, site);
    const original = structuredClone(world);
    const replay = structuredClone(state);
    const expectedStats = Object.fromEntries(state.actors.map(actor => [actor.id, { ...actor.stats }]));
    // 반복 연장은 제한하지 않는다. 이 시드의 실제 경기는 80라운드 안에 종료해야 한다.
    for (let round = 0; round < 80 && !state.match.complete; round++) {
      for (const current of [state, replay]) {
        for (const actor of current.actors.filter(actor => actor.team === 'home')) buyRifle(current, actor.id);
        startEconomyRound(current);
      }
      advancePractice(state, RELAY_MAP, 160000);
      for (let frame = 0; frame < 9600 && !replay.complete; frame++) advancePractice(replay, RELAY_MAP, 1000 / 60);
      assert.deepEqual(state, replay);
      assert.equal(state.complete, true);
      assert.equal(state.match.history.length, state.economy.roundNumber);
      assert.equal(state.match.score.home + state.match.score.away, state.match.history.length);
      // 현재 경기의 모든 실제 이벤트에서 독립적으로 누적해 표시용 합계와 대조한다.
      for (const event of state.events) {
        if (event.type === 'shot') {
          const stats = expectedStats[event.actorId];
          stats.shots++;
          stats.hits += Number(event.hit);
          stats.damage += event.damage;
        } else if (event.type === 'grenade-hit' && !event.friendlyFire) {
          expectedStats[event.actorId].damage += event.damage;
        } else if (event.type === 'death') {
          expectedStats[event.actorId].deaths++;
          if (!event.friendlyFire) expectedStats[event.killerId].kills++;
          for (const id of event.assists) expectedStats[id].assists++;
        }
      }
      for (const actor of state.actors) {
        assert.deepEqual(matchPlayerStats(state, actor), expectedStats[actor.id]);
        const amount = state.economy.ledger.filter(entry => entry.actorId === actor.id).reduce((sum, entry) => sum + entry.amount, 0);
        assert.equal(actor.cash, 800 + amount);
        assert.ok(actor.cash >= 0 && actor.cash <= 16000);
      }
      if (!state.match.complete) {
        nextEconomyRound(state, RELAY_MAP); nextEconomyRound(replay, RELAY_MAP);
      }
    }
    assert.equal(state.match.complete, true);
    assert.ok(state.match.history.every(entry => entry.score[entry.winner] > 0));
    assert.deepEqual(world, original);
  }
});
