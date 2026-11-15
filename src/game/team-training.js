import { bankruptcyIssue } from './bankruptcy.js';
import { TEAM_TRAINING_MODES } from '../config/team-training.js';
import { TRAINING_SKILLS } from '../config/training.js';
import { selectTraining, gainExperience } from './training.js';
import { advanceWeek } from './calendar.js';
import { matchPlayerStats } from '../simulation/match.js';
import { randomUnit } from './random.js';
import { pendingPlayerEvent } from './player-events.js';
import { growthExperience, GROWTH_LABELS } from './player-development.js';
import { coachRule } from './coaches.js';
import { requiresTiebreak } from './weekly-official.js';
import { completePreseason,completeSeason } from './season-calendar.js';
import { officialSeason } from './pc-season.js';

export function beginTeamTraining(world, { events = false, official = false } = {}) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  if (requiresTiebreak(world)) return { ok: false, advancedDays: 0, tiebreakPending: true, message: '정규 시즌 순위 결정전을 먼저 마치세요.' };
  if (world.teamTraining?.status === 'pending') return { ok: true, advancedDays: 0, message: '진행 중인 팀 훈련을 이어갑니다.' };
  if (pendingPlayerEvent(world)) return { ok: false, advancedDays: 0, eventPending: true, message: '선수 이벤트를 먼저 선택하세요.' };
  if (officialSeason(world).weekSchedule && officialSeason(world).weekSchedule.phase !== 'preparing') return { ok: false, advancedDays: 0, officialPending: true, message: '이번 주 공식 경기·남은 정산을 먼저 마치세요.' };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  for (const id of club.lineupIds) selectTraining(world, id, 'team');
  const result = advanceWeek(world, { events, teamTraining: true, official });
  if (!result.ok) return result;
  for (const id of club.lineupIds) selectTraining(world, id, 'team');
  world.teamTraining = { day: world.day, status: 'pending', playerIds: [...club.lineupIds], receipt: null };
  return result;
}

export function kdaMultiplier(stats) {
  const ratio = (stats.kills + stats.assists * 0.5) / Math.max(stats.deaths, 1);
  return ratio < 0.5 ? 0.8 : ratio < 1 ? 0.9 : ratio < 2 ? 1 : ratio < 3 ? 1.1 : 1.2;
}

export function settleTeamTraining(world, state, sessionDay) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  const session = world.teamTraining;
  if (!session || session.status !== 'pending' || session.day !== sessionDay) return { ok: false, message: '이번 주 팀 훈련 보상은 이미 지급됐거나 대상이 아닙니다.' };
  if (!state.complete || state.match && !state.match.complete || state.tick < 1) return { ok: false, message: '연습이 끝난 뒤 경험치를 지급합니다.' };
  const actors = state.actors.filter(actor => actor.team === 'home');
  if (actors.length !== 5 || new Set(actors.map(actor => actor.playerId)).size !== 5 || actors.some(actor => !session.playerIds.includes(actor.playerId))) return { ok: false, message: '팀 훈련 참가 명단이 일치하지 않습니다.' };
  const mode = state.match ? 'match' : state.economy ? 'economy' : state.round ? 'round' : state.combat ? 'combat' : 'movement';
  const winner = state.match?.winner ?? state.round?.winner ?? null;
  if (['match', 'round', 'economy'].includes(mode) && !['home', 'away'].includes(winner)) return { ok: false, message: '경기 승패를 확인할 수 없습니다.' };
  if (actors.some(actor => { const stats = matchPlayerStats(state, actor); return ['kills', 'deaths', 'assists'].some(key => !Number.isSafeInteger(stats[key]) || stats[key] < 0); })) return { ok: false, message: '경기 기록이 올바르지 않습니다.' };
  const resultMultiplier = winner === 'home' ? 1.2 : winner === 'away' ? 0.8 : 1;
  const random = { randomState: world.actionRandomState };
  const club = world.clubs.find(item => item.id === world.playerClubId);
  const coachBonus = coachRule(club.coach)?.bonus ?? 0;
  const rewards = actors.map(actor => {
    const player = world.players.find(player => player.id === actor.playerId);
    const { kills, deaths, assists } = matchPlayerStats(state, actor);
    const performance = mode === 'movement' ? 1 : kdaMultiplier({ kills, deaths, assists });
    const experience = growthExperience(player, TEAM_TRAINING_MODES[mode].experience * resultMultiplier * performance, coachBonus);
    const allocation = { aim: 0, intelligence: 0, stamina: 0 };
    for (let i = 0; i < experience; i++) {
      const skill = TRAINING_SKILLS[Math.floor(randomUnit(random) * TRAINING_SKILLS.length)];
      allocation[skill] += gainExperience(player, skill, 1);
    }
    return { playerId: player.id, kills, deaths, assists, experience, allocation, growthRate: player.development.growthRate };
  });
  world.actionRandomState = random.randomState;
  session.status = 'completed';
  completePreseason(world);
  completeSeason(world);
  session.receipt = { mode, winner, rewards, coachBonus };
  return { ok: true, receipt: session.receipt, message: '주간 팀 훈련 경험치를 지급했습니다. 내 구단에서 확인하고 저장하세요.' };
}

export function validateTeamTraining(session, players, day, lineupIds, { legacyDevelopment = false, legacyCoach = false } = {}) {
  if (session === null) return null;
  const fail = () => { throw new Error('팀 훈련 저장 정보가 올바르지 않습니다.'); };
  const ids = new Set(players.map(player => player.id));
  if (!session || typeof session !== 'object' || !Number.isSafeInteger(session.day) || session.day < 1 || session.day > day
    || !['pending', 'completed'].includes(session.status) || !Array.isArray(session.playerIds) || session.playerIds.length !== 5
    || new Set(session.playerIds).size !== 5 || Array.from(session.playerIds).some(id => !ids.has(id))) fail();
  if (session.status === 'pending') {
    if (session.receipt !== null || session.playerIds.some(id => !lineupIds.includes(id))) fail();
  } else {
    const receipt = session.receipt;
    const coachBonus = legacyCoach ? 0 : receipt?.coachBonus;
    if (![0, 10, 20, 30].includes(coachBonus)) fail();
    if (!receipt || typeof receipt.mode !== 'string' || !Object.hasOwn(TEAM_TRAINING_MODES, receipt.mode) || ![null, 'home', 'away'].includes(receipt.winner)
      || !Array.isArray(receipt.rewards) || receipt.rewards.length !== 5 || new Set(receipt.rewards.map(reward => reward?.playerId)).size !== 5) fail();
    for (const reward of receipt.rewards) {
      if (!reward || !session.playerIds.includes(reward.playerId) || ['kills', 'deaths', 'assists', 'experience'].some(key => !Number.isSafeInteger(reward[key]) || reward[key] < 0)
        || reward.experience > 270 || !reward.allocation || Array.isArray(reward.allocation) || TRAINING_SKILLS.some(key => !Number.isInteger(reward.allocation[key]) || reward.allocation[key] < 0)
        || TRAINING_SKILLS.reduce((sum, key) => sum + reward.allocation[key], 0) > reward.experience) fail();
      const winnerFactor = receipt.winner === 'home' ? 1.2 : receipt.winner === 'away' ? 0.8 : 1;
      const performance = receipt.mode === 'movement' ? 1 : kdaMultiplier(reward);
      const growthRate = legacyDevelopment ? 100 : reward.growthRate;
      if (!Number.isInteger(growthRate) || !Object.hasOwn(GROWTH_LABELS, growthRate)
        || reward.experience !== Math.round(TEAM_TRAINING_MODES[receipt.mode].experience * winnerFactor * performance * growthRate / 100 * (100 + coachBonus) / 100)) fail();
    }
    if (['movement', 'combat'].includes(receipt.mode) ? receipt.winner !== null : receipt.winner === null) fail();
  }
  return { day: session.day, status: session.status, playerIds: [...session.playerIds], receipt: session.receipt === null ? null : {
    mode: session.receipt.mode, winner: session.receipt.winner, coachBonus: legacyCoach ? 0 : session.receipt.coachBonus, rewards: session.receipt.rewards.map(reward => ({
      playerId: reward.playerId, kills: reward.kills, deaths: reward.deaths, assists: reward.assists, experience: reward.experience,
      growthRate: legacyDevelopment ? 100 : reward.growthRate,
      allocation: Object.fromEntries(TRAINING_SKILLS.map(skill => [skill, reward.allocation[skill]])),
    })),
  } };
}
