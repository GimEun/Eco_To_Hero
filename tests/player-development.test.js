import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { createDevelopment } from '../src/game/player-development.js';
import { selectTraining, gainExperience } from '../src/game/training.js';
import { advanceWeek } from '../src/game/calendar.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { experiencePanel } from '../src/ui/training-panel.js';
import { rosterTable } from '../src/ui/screens.js';

const fixture = () => createWorld(createClub('성장 검증').club, 42);
const skills = ['aim', 'intelligence', 'stamina'];
const totalExperience = player => skills.reduce((sum, skill) => sum + player[skill] * 100 + player.training.experience[skill], 0);
function oldSave(world) {
  const save = createSave(world); save.schemaVersion = 12;
  save.world.players.forEach(player => { delete player.development; });
  save.world.playerEvents.history.forEach(receipt => { delete receipt.statLimit; });
  save.world.teamTraining?.receipt?.rewards.forEach(reward => { delete reward.growthRate; });
  return save;
}
function ending(world, mode, winner) {
  const actors = world.teamTraining.playerIds.map((playerId, index) => ({ id: `home-${index}`, playerId, team: 'home', stats: { kills: 3, deaths: 0, assists: 0 } }));
  return { complete: true, tick: 1, actors, combat: mode !== 'movement',
    ...(['round', 'economy', 'match'].includes(mode) ? { round: { winner } } : {}),
    ...(['economy', 'match'].includes(mode) ? { economy: {} } : {}),
    ...(mode === 'match' ? { match: { complete: true, winner, history: [{}], playerStats: Object.fromEntries(actors.map(actor => [actor.id, actor.stats])) } } : {}) };
}

test('배정은 선수 ID·시드에 고정되고 분포와 현재 능력 하한을 지킨다', () => {
  const buckets = [0, 0, 0], growth = { 80: 0, 100: 0, 120: 0 };
  for (let seed = 0; seed < 5000; seed++) {
    const player = { id: 'distribution', aim: 1, intelligence: 1, stamina: 1 };
    const value = createDevelopment(player, seed);
    assert.deepEqual(value, createDevelopment(player, seed));
    growth[value.growthRate]++;
    for (const skill of skills) buckets[Math.floor((value.potential[skill] - 70) / 10)]++;
    const high = createDevelopment({ ...player, aim: 99, intelligence: 95 }, seed);
    assert.equal(high.potential.aim, 99); assert.ok(high.potential.intelligence >= 95);
  }
  [0.5, 0.35, 0.15].forEach((fraction, i) => assert.ok(Math.abs(buckets[i] / 15000 - fraction) < 0.02));
  for (const [rate, fraction] of [[80, .25], [100, .5], [120, .25]]) assert.ok(Math.abs(growth[rate] / 5000 - fraction) < .025);
  assert.equal(new Set(fixture().players.map(player => player.development.growthRate)).size, 3);
});

test('개인 훈련은 7일에 56/70/84 경험치이며 상한과 임금·행복도 규칙을 유지한다', () => {
  for (const rate of [80, 100, 120]) {
    const world = fixture(), player = world.players[0], before = totalExperience(player);
    player.development.growthRate = rate;
    selectTraining(world, player.id, 'aim');
    advanceWeek(world);
    assert.equal(totalExperience(player) - before, 7 * rate / 10);
    assert.equal(player.morale.happiness, 70);
    assert.equal(world.clubs[0].finance.settlements.length, 1);
    player.aim = 74; player.development.potential.aim = 75; player.training.experience.aim = 99;
    assert.equal(gainExperience(player, 'aim', 500), 1);
    assert.equal(player.aim, 75); assert.equal(player.training.experience.aim, 0);
    assert.equal(gainExperience(player, 'aim', 10), 0);
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
});

test('팀 훈련은 모드·승패·KDA에 성장 배율을 한 번 적용하고 배분·재접속·중복 지급을 보존한다', () => {
  for (const [mode, base] of [['movement', 10], ['combat', 25], ['round', 40], ['economy', 50], ['match', 120]]) {
    for (const rate of [80, 100, 120]) for (const winner of ['home', 'away']) {
      const world = fixture(); world.players.forEach(player => { player.development.growthRate = rate; });
      beginTeamTraining(world);
      const state = ending(world, mode, winner), before = world.players.slice(0, 5).map(totalExperience);
      const restored = restoreWorld(createSave(world));
      const result = settleTeamTraining(world, state, world.teamTraining.day);
      settleTeamTraining(restored, state, restored.teamTraining.day);
      assert.deepEqual(restored, world);
      const expected = Math.round(base * (mode === 'movement' || mode === 'combat' ? 1 : winner === 'home' ? 1.2 : .8) * (mode === 'movement' ? 1 : 1.2) * rate / 100);
      result.receipt.rewards.forEach((reward, i) => {
        assert.equal(reward.experience, expected); assert.equal(reward.growthRate, rate);
        assert.equal(Object.values(reward.allocation).reduce((a, b) => a + b, 0), expected);
        assert.equal(totalExperience(world.players[i]) - before[i], expected);
      });
      assert.deepEqual(restoreWorld(createSave(world)), world);
      const snapshot = structuredClone(world);
      assert.equal(settleTeamTraining(world, state, world.teamTraining.day).ok, false);
      assert.deepEqual(world, snapshot);
    }
  }
});

test('이벤트 능력 상승도 잠재력에서 멈추고 하락 후 재훈련하며 기록을 왕복한다', () => {
  const world = fixture(), player = world.players[0];
  player.aim = player.development.potential.aim; player.training.experience.aim = 23;
  world.day = 2; world.weekDaysRemaining = 6;
  world.aiGrowth = {startedDay:2,lastDay:1,plans:{}};
  world.playerEvents.week = { startedDay: 1, endDay: 8, teamTraining: false, event: { eventId: 'equipment', day: 2, status: 'pending', playerId: player.id, roll: 0 } };
  const before = player.aim;
  const outcome = resolvePlayerEvent(world, 'accept');
  assert.equal(outcome.ok, true); assert.equal(player.aim, before);
  assert.equal(player.training.experience.aim, 23);
  assert.equal(outcome.receipt.statLimit, before);
  assert.deepEqual(restoreWorld(createSave(world)), world);
  player.aim--;
  gainExperience(player, 'aim', 100);
  assert.equal(player.aim, before); assert.equal(player.training.experience.aim, 0);
});

test('v12는 기존 능력·경험치·계약·재정·난수와 과거 팀 훈련 보상을 보존해 v13으로 고정한다', () => {
  const world = fixture(); world.players.forEach(player => { player.development.growthRate = 100; });
  beginTeamTraining(world); settleTeamTraining(world, ending(world, 'match', 'home'), world.teamTraining.day);
  const player = world.players[0];
  player.aim = createDevelopment(player, world.seed).potential.aim; player.training.experience.aim = 37;
  const legacy = oldSave(world); legacy.world.clubs[0].finance.cashStartedDay=legacy.world.day;
  const snapshot = structuredClone(legacy), restored = restoreWorld(legacy);
  assert.deepEqual(legacy, snapshot);
  assert.deepEqual(restored.players.map(({ development, ...p }) => p), legacy.world.players.map(p => ({ ...p, fatigue: 0 })));
  for (const key of ['clubs', 'actionRandomState', 'day']) assert.deepEqual(restored[key], legacy.world[key]);
  assert.equal(restored.players[0].training.experience.aim, 37);
  assert.ok(restored.teamTraining.receipt.rewards.every(reward => reward.growthRate === 100));
  assert.deepEqual(restoreWorld(legacy), restored);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(restored)))), restored);
});

test('구형 이벤트 이력은 당시 99 상한의 결과를 보존하고 현재 잠재력으로 다시 계산하지 않는다', () => {
  const world = fixture(), player = world.players[0];
  advanceWeek(world);
  world.playerEvents.history = [{ eventId: 'dating', day: 2, playerId: player.id, choice: 'accept', roll: 0,
    balanceDelta: 0, happinessBefore: 70, happinessAfter: 80, statBefore: 99, statAfter: 98, statLimit: 99 }];
  player.intelligence = 98; player.development.potential.intelligence = 99;
  const legacy = oldSave(world), restored = restoreWorld(legacy);
  assert.equal(restored.playerEvents.history[0].statLimit, 99);
  assert.equal(restored.playerEvents.history[0].statBefore, 99);
  assert.equal(restored.players[0].intelligence, 98);
  assert.deepEqual(restoreWorld(createSave(restored)), restored);
});

test('현재 저장은 잠재력·성장 속도·팀 보상·이벤트 상한 손상을 거부한다', () => {
  for (const change of [p => { delete p.development; }, p => { p.development.potential.aim = p.aim - 1; },
    p => { p.development.potential.stamina = 100; }, p => { p.development.growthRate = '100'; }, p => { p.development.growthRate = 110; }]) {
    const world = fixture(); change(world.players[0]); assert.throws(() => createSave(world), /잠재력|성장/);
  }
  const world = fixture(); beginTeamTraining(world); settleTeamTraining(world, ending(world, 'match', 'home'), world.teamTraining.day);
  world.teamTraining.receipt.rewards[0].growthRate = 110;
  assert.throws(() => createSave(world), /팀 훈련/);
});

test('내 구단과 전체 선수 명단에서 성장 정보와 능력별 잠재력을 공개한다', () => {
  const world = fixture(), club = getClubView(world), player = club.players[0];
  const experience = experiencePanel(club), roster = rosterTable(world.players.slice(0, 5));
  assert.match(experience, /성장 속도/); assert.ok(experience.includes(`잠재력 ${player.development.potential.aim}`));
  assert.match(roster, /성장 정보/); assert.ok(roster.includes(`잠재력 에임 ${player.development.potential.aim}`));
});
