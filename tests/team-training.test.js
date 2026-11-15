import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { selectWeeklyActions } from '../src/game/training.js';
import { beginTeamTraining, settleTeamTraining, kdaMultiplier } from '../src/game/team-training.js';
import { advanceWeek } from '../src/game/calendar.js';
import { getAffiliations } from '../src/game/world-selectors.js';
import { recruitPlayer, releasePlayer, replaceStarter, signingFee } from '../src/game/roster.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { useDailySchema } from './legacy-fixture.js';
import { TEAM_TRAINING_MODES } from '../src/config/team-training.js';

function fixture() {
  const world = createWorld(createClub('팀 훈련 검증').club, 42), club = world.clubs[0];
  const assigned = getAffiliations(world);
  const reserve = world.players.filter(p => !assigned.has(p.id)).sort((a, b) => signingFee(a) - signingFee(b))[0];
  recruitPlayer(world, reserve.id);
  const choices = club.playerIds.map((id, index) => ({ playerId: id, action: index === 0 ? 'team' : id === reserve.id ? 'broadcast' : 'rest' }));
  return { world, club, reserve, choices };
}

function ending(world, mode, winner = 'home', stats = { kills: 2, deaths: 1, assists: 1 }) {
  const actors = world.teamTraining.playerIds.map((playerId, index) => ({ id: `home-${index + 1}`, playerId, team: 'home', stats: { ...stats } }));
  const state = { complete: true, tick: 10, combat: mode !== 'movement', actors };
  if (['round', 'economy', 'match'].includes(mode)) state.round = { winner };
  if (['economy', 'match'].includes(mode)) state.economy = { roundNumber: 1 };
  if (mode === 'match') state.match = { complete: true, winner, history: [{}], playerStats: Object.fromEntries(actors.map(actor => [actor.id, { ...stats }])) };
  return state;
}

test('주전 한 명의 팀 훈련 선택을 주전 5명에 적용하고 후보 행동/수입은 유지한다', () => {
  const { world, club, reserve, choices } = fixture();
  assert.equal(selectWeeklyActions(world, choices).teamTraining, true);
  for (const id of club.lineupIds) assert.equal(world.players.find(p => p.id === id).training.focus, 'team');
  assert.equal(reserve.training.focus, 'broadcast');
  const before = structuredClone(world), cash = club.balance;
  assert.equal(beginTeamTraining(world).ok, true);
  assert.equal(world.day, 8);
  const weeklyPay = Math.floor(Object.values(club.contracts).reduce((sum, c) => sum + c.monthlySalary, 0) / 4);
  assert.equal(club.balance, cash + 210 + 1250 - weeklyPay);
  assert.deepEqual(world.teamTraining.playerIds, club.lineupIds);
  for (const id of club.lineupIds) assert.deepEqual(world.players.find(p => p.id === id).training.experience, before.players.find(p => p.id === id).training.experience);
  assert.equal(world.teamTraining.status, 'pending');
  const pending = structuredClone(world);
  assert.equal(beginTeamTraining(world).advancedDays, 0);
  assert.equal(advanceWeek(world).ok, false);
  assert.deepEqual(world, pending);
});

test('후보 팀 훈련은 거절하고 진행 중 참가자의 방출/주전 변경은 막는다', () => {
  const { world, club, reserve, choices } = fixture();
  const before = structuredClone(world);
  assert.equal(selectWeeklyActions(world, choices.map(c => c.playerId === reserve.id ? { ...c, action: 'team' } : c)).ok, false);
  assert.deepEqual(world, before);
  selectWeeklyActions(world, choices); beginTeamTraining(world);
  const pending = structuredClone(world);
  assert.equal(releasePlayer(world, club.lineupIds[0]).ok, false);
  assert.equal(replaceStarter(world, reserve.id, club.lineupIds[0]).ok, false);
  assert.deepEqual(world, pending);
});

test('KDA 구간별 0.8~1.2 배수와 데스 0 처리를 적용한다', () => {
  for (const [kills, deaths, assists, factor] of [[0, 0, 0, .8], [0, 1, 1, .9], [1, 1, 0, 1], [2, 1, 0, 1.1], [3, 0, 0, 1.2]]) assert.equal(kdaMultiplier({ kills, deaths, assists }), factor);
});

test('5개 모드 기본값·승패·KDA로 보상하며 MR12 최저도 다른 모드 최고보다 많다', () => {
  for (const mode of Object.keys(TEAM_TRAINING_MODES)) {
    for (const winner of ['home', 'away']) {
      const { world, choices } = fixture(); selectWeeklyActions(world, choices); beginTeamTraining(world);
      const state = ending(world, mode, winner);
      const result = settleTeamTraining(world, state, world.teamTraining.day);
      assert.equal(result.ok, true);
      const victory = ['movement', 'combat'].includes(mode) ? 1 : winner === 'home' ? 1.2 : .8;
      for (const reward of result.receipt.rewards) {
        const player = world.players.find(p => p.id === reward.playerId);
        const scaled = Math.round(TEAM_TRAINING_MODES[mode].experience * victory * (mode === 'movement' ? 1 : 1.1) * player.development.growthRate / 100);
        assert.equal(reward.experience, scaled);
        assert.equal(Object.values(reward.allocation).reduce((a, b) => a + b, 0), scaled);
      }
      assert.doesNotThrow(() => createSave(world));
    }
  }
  assert.ok(Math.round(120 * .8 * .8) > Math.round(50 * 1.2 * 1.2));
});

test('완료 전에는 보상이 없고 후보는 지급하지 않으며 지급 후 저장/복원/반복 호출도 중복되지 않는다', () => {
  const { world, reserve, choices } = fixture(); selectWeeklyActions(world, choices); beginTeamTraining(world);
  const state = ending(world, 'match'), before = structuredClone(world), reserveBefore = structuredClone(reserve);
  state.match.complete = false;
  assert.equal(settleTeamTraining(world, state, world.teamTraining.day).ok, false);
  assert.deepEqual(world, before);
  state.match.complete = true;
  assert.equal(settleTeamTraining(world, state, world.teamTraining.day).ok, true);
  assert.deepEqual(reserve, reserveBefore);
  const saved = restoreWorld(parseBackup(JSON.stringify(createSave(world)))), after = structuredClone(saved);
  assert.equal(settleTeamTraining(saved, state, saved.teamTraining.day).ok, false);
  assert.deepEqual(saved, after);
});

test('진행 중 저장을 복원해 보상을 재현하고 잘못된 참가자/세션/경기 기록은 거절한다', () => {
  const { world, choices } = fixture(); selectWeeklyActions(world, choices); beginTeamTraining(world);
  const restored = restoreWorld(createSave(world)), before = structuredClone(world);
  const state = ending(world, 'combat');
  assert.equal(settleTeamTraining(world, state, world.teamTraining.day - 1).ok, false);
  const invalid = structuredClone(state); invalid.actors[0].playerId = 'missing';
  assert.equal(settleTeamTraining(world, invalid, world.teamTraining.day).ok, false);
  const invalidStats = structuredClone(state); invalidStats.actors[0].stats.kills = -1;
  assert.equal(settleTeamTraining(world, invalidStats, world.teamTraining.day).ok, false);
  assert.deepEqual(world, before);
  settleTeamTraining(world, state, world.teamTraining.day); settleTeamTraining(restored, state, restored.teamTraining.day);
  assert.deepEqual(world, restored);
});

test('능력 상한의 경험치는 버리며 v8 변환은 기존 세계를 보존하고 훈련 세션만 비운다', () => {
  const { world, club, choices } = fixture(); selectWeeklyActions(world, choices);
  for (const id of club.lineupIds) { const p = world.players.find(p => p.id === id); p.aim = p.intelligence = p.stamina = 99; p.development.potential = { aim: 99, intelligence: 99, stamina: 99 }; }
  beginTeamTraining(world);
  const reward = settleTeamTraining(world, ending(world, 'round'), world.teamTraining.day);
  assert.ok(reward.receipt.rewards.every(r => Object.values(r.allocation).every(v => v === 0)));
  const old = useDailySchema(createSave(world), 8); delete old.world.teamTraining;
  const before = structuredClone(old), restored = restoreWorld(old);
  assert.deepEqual(old, before);
  const { teamTraining, ...rest } = restored;
  assert.equal(teamTraining, null);
  assert.deepEqual(rest.players.map(({ morale, ...p }) => p), old.world.players.map(({ morale, ...p }) => ({ ...p, fatigue: 0 })));
  assert.deepEqual(rest.clubs.map(c => [c.balance, c.playerIds, c.lineupIds]), old.world.clubs.map(c => [c.balance, c.playerIds, c.lineupIds]));
});

test('v9는 세션 명단·완료 기록·보상 금액과 배분 합계를 검증한다', () => {
  const { world, choices } = fixture(); selectWeeklyActions(world, choices); beginTeamTraining(world);
  const badPending = structuredClone(world); badPending.teamTraining.playerIds[0] = 'missing';
  assert.throws(() => createSave(badPending), /팀 훈련/);
  settleTeamTraining(world, ending(world, 'match'), world.teamTraining.day);
  const changes = [s => { s.day = 0; }, s => { s.status = 'bad'; }, s => { s.receipt.mode = 'bad'; },
    s => { s.receipt.rewards.pop(); }, s => { s.receipt.rewards[0].experience++; },
    s => { s.receipt.rewards[0].allocation.aim = 1000; }, s => { s.receipt.rewards[0].deaths = -1; }];
  for (const change of changes) { const broken = structuredClone(world); change(broken.teamTraining); assert.throws(() => createSave(broken), /팀 훈련/); }
});
