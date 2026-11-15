import { bankruptcyIssue } from './bankruptcy.js';
import { TRAINING_RULES, TRAINING_SKILLS, TRAINING_LABELS, ACTION_RULES } from '../config/training.js';
import { applyActionHappiness } from './happiness.js';
import { trainingLimit, growthExperience } from './player-development.js';
import { applyActionFatigue } from './player-condition.js';
import { coachRule } from './coaches.js';
import { facilityBonus } from './facilities.js';
import { requiresTiebreak } from './weekly-official.js';
import { officialSeason } from './pc-season.js';

export const createActionRandomState = seed => (seed ^ 0x73636864) >>> 0;
export const scheduledAction = (player, day) => player.training.schedule[(day - 1) % ACTION_RULES.weekDays];

export function createTraining() {
  return { focus: 'rest', schedule: Array(ACTION_RULES.weekDays).fill('rest'), experience: { aim: 0, intelligence: 0, stamina: 0 } };
}

export function validateTraining(training, player, { legacySchedule = false } = {}) {
  if (!training || typeof training !== 'object' || Array.isArray(training)
    || typeof training.focus !== 'string' || !Object.hasOwn(TRAINING_LABELS, training.focus)
    || !training.experience || typeof training.experience !== 'object' || Array.isArray(training.experience)
    || TRAINING_SKILLS.some(skill => !Number.isInteger(training.experience[skill]) || training.experience[skill] < 0
      || training.experience[skill] >= TRAINING_RULES.levelExperience
      || (player[skill] === TRAINING_RULES.maximumStat && training.experience[skill] !== 0))) {
    throw new Error('선수 훈련 목표 또는 경험치가 올바르지 않습니다.');
  }
  const schedule = legacySchedule ? Array(ACTION_RULES.weekDays).fill(training.focus) : training.schedule;
  if (!Array.isArray(schedule) || schedule.length !== ACTION_RULES.weekDays
    || Array.from(schedule).some(action => typeof action !== 'string' || !Object.hasOwn(TRAINING_LABELS, action))) throw new Error('선수 주간 행동표가 올바르지 않습니다.');
  return { focus: training.focus, schedule: [...schedule], experience: Object.fromEntries(TRAINING_SKILLS.map(skill => [skill, training.experience[skill]])) };
}

export function selectTraining(world, playerId, focus) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  const player = world.players.find(player => player.id === playerId);
  if (!player || !club.playerIds.includes(playerId)) return { ok: false, message: '내 구단 소속 선수의 훈련만 선택할 수 있습니다.' };
  if (typeof focus !== 'string' || !Object.hasOwn(TRAINING_LABELS, focus)) return { ok: false, message: '개인 훈련·방송하기·팀 훈련·휴식 중 행동을 선택하세요.' };
  player.training.focus = focus;
  player.training.schedule = Array(ACTION_RULES.weekDays).fill(focus);
  return { ok: true, message: `${player.nickname}의 일주일 행동을 ${TRAINING_LABELS[focus]}으로 채웠습니다.` };
}

export function selectWeeklyActions(world, choices) {
  if (world.yearAdvance?.status === 'paused') return { ok: false, message: '연말 진행을 취소한 뒤 행동을 다시 선택하세요.' };
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  if (requiresTiebreak(world)) return { ok: false, message: '정규 시즌 순위 결정전을 먼저 마치세요.' };
  if (officialSeason(world).weekSchedule || world.teamTraining?.status === 'pending'
    || world.weekDaysRemaining || world.playerEvents.week) return { ok: false, message: '진행 중인 주간 일정·팀 훈련·공식 경기를 먼저 마치세요.' };
  if (world.playerEvents.week?.event?.status === 'pending') return { ok: false, message: '선수 이벤트를 선택한 뒤 일정을 이어가세요.' };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  if (!Array.isArray(choices) || choices.length !== club.playerIds.length
    || new Set(choices.map(choice => choice?.playerId)).size !== club.playerIds.length
    || Array.from(choices).some(choice => !choice || !club.playerIds.includes(choice.playerId)
      || typeof choice.action !== 'string' || !Object.hasOwn(TRAINING_LABELS, choice.action))) {
    return { ok: false, message: '내 구단 선수 모두의 주간 행동을 하나씩 선택하세요.' };
  }
  if (choices.some(choice => !club.lineupIds.includes(choice.playerId) && choice.action === 'team')) return { ok: false, message: '팀 훈련에는 주전 5명만 참가합니다. 후보는 다른 행동을 선택하세요.' };
  const teamTraining = choices.some(choice => club.lineupIds.includes(choice.playerId) && choice.action === 'team');
  for (const choice of choices) selectTraining(world, choice.playerId, teamTraining && club.lineupIds.includes(choice.playerId) ? 'team' : choice.action);
  return { ok: true, teamTraining, message: '선수별 주간 행동을 적용했습니다.' };
}

export function gainExperience(player, skill, amount) {
  const limit = trainingLimit(player, skill);
  if (player[skill] >= limit) return 0;
  const available = (limit - player[skill]) * TRAINING_RULES.levelExperience - player.training.experience[skill];
  const applied = Math.min(amount, available);
  player.training.experience[skill] += applied;
  while (player.training.experience[skill] >= TRAINING_RULES.levelExperience) {
    player.training.experience[skill] -= TRAINING_RULES.levelExperience;
    player[skill]++;
  }
  return applied;
}

export function trainPlayers(world, playerIds) {
  if (bankruptcyIssue(world)) return [];
  const selected = new Set(playerIds), growth = [];
  const club = world.clubs.find(item => item.id === world.playerClubId);
  const bonus = coachRule(club.coach)?.bonus ?? 0;
  for (const player of world.players) {
    if (!selected.has(player.id)) continue;
    const action = scheduledAction(player, world.day);
    applyActionFatigue(player, action);
    applyActionHappiness(player, action, world.day);
    if (action === 'rest' || action === 'broadcast' || action === 'team') continue;
    const skill = action;
    if (player[skill] >= trainingLimit(player, skill)) continue;
    const before = player[skill];
    const ownPlayer = club.playerIds.includes(player.id);
    gainExperience(player, skill, growthExperience(player, TRAINING_RULES.dailyExperience, ownPlayer ? bonus : 0, ownPlayer ? facilityBonus(club.facilities, skill) : 0));
    if (player[skill] > before) {
      growth.push({ playerId: player.id, skill, value: player[skill] });
    }
  }
  return growth;
}
