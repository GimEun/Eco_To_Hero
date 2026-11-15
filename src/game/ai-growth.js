import { TRAINING_SKILLS } from '../config/training.js';
import { trainPlayers } from './training.js';
import { trainingLimit } from './player-development.js';
import { bankruptcyIssue } from './bankruptcy.js';

export const createAiGrowth = day => ({ startedDay: day, lastDay: day - 1, plans: {} });
const weekStart = (growth, day) => growth.startedDay + Math.floor((day - growth.startedDay) / 7) * 7;

function planWeek(player, clubId, startedDay, nextSkill) {
  if (player.fatigue >= 30) return { clubId, startedDay, nextSkill, action: 'rest' };
  for (let offset = 0; offset < TRAINING_SKILLS.length; offset++) {
    const index = (nextSkill + offset) % TRAINING_SKILLS.length, skill = TRAINING_SKILLS[index];
    if (player[skill] < trainingLimit(player, skill)) return { clubId, startedDay, nextSkill: (index + 1) % 3, action: skill };
  }
  return { clubId, startedDay, nextSkill, action: 'rest' };
}

// 실제 날짜 변경 직전에만 호출한다. 같은 날짜의 재호출은 성장·피로를 반복하지 않는다.
export function trainAiClubs(world) {
  if (bankruptcyIssue(world)) return [];
  const growth = world.aiGrowth;
  if (growth.lastDay === world.day) return [];
  if (growth.lastDay !== world.day - 1) throw new Error('AI 성장 날짜가 현재 일정과 일치하지 않습니다.');
  const startedDay = weekStart(growth, world.day), affiliations = new Map();
  for (const club of world.clubs) if (club.id !== world.playerClubId) {
    for (const id of club.playerIds) affiliations.set(id, club.id);
  }
  const plans = {};
  for (const player of world.players) {
    const clubId = affiliations.get(player.id);
    if (!clubId) continue;
    const previous = growth.plans[player.id];
    const plan = previous?.clubId === clubId && previous.startedDay === startedDay ? previous
      : planWeek(player, clubId, startedDay, previous?.nextSkill ?? 0);
    plans[player.id] = plan;
    if (player.training.focus !== plan.action || player.training.schedule.some(action => action !== plan.action)) {
      player.training.focus = plan.action;
      player.training.schedule = Array(7).fill(plan.action);
    }
  }
  const result = trainPlayers(world, [...affiliations.keys()]);
  growth.plans = plans;
  growth.lastDay = world.day;
  return result;
}

export function validateAiGrowth(value, world) {
  const fail = () => { throw new Error('AI 구단 성장 상태가 올바르지 않습니다.'); };
  if (!value || !Number.isSafeInteger(value.startedDay) || value.startedDay < 1 || value.startedDay > world.day
    || value.lastDay !== world.day - 1 || !value.plans || typeof value.plans !== 'object' || Array.isArray(value.plans)) fail();
  const players = new Set(world.players.map(player => player.id));
  const clubs = new Set(world.clubs.filter(club => club.id !== world.playerClubId).map(club => club.id));
  const entries = Object.entries(value.plans);
  if (entries.length > players.size || value.lastDay < value.startedDay && entries.length) fail();
  const plans = Object.fromEntries(entries.map(([id, plan]) => {
    if (!players.has(id) || !plan || !clubs.has(plan.clubId) || plan.startedDay !== weekStart(value, value.lastDay)
      || !Number.isInteger(plan.nextSkill) || plan.nextSkill < 0 || plan.nextSkill >= TRAINING_SKILLS.length
      || ![...TRAINING_SKILLS, 'rest'].includes(plan.action)) fail();
    return [id, {clubId: plan.clubId, startedDay: plan.startedDay, nextSkill: plan.nextSkill, action: plan.action}];
  }));
  return { startedDay: value.startedDay, lastDay: value.lastDay, plans };
}
