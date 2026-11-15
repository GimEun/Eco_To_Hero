import { HAPPINESS_RULES, HAPPINESS_BANDS } from '../config/happiness.js';
import { TRAINING_LABELS, TRAINING_SKILLS, TRAINING_RULES } from '../config/training.js';
import { fatigueModifier } from './player-condition.js';

export const createMorale = () => ({ happiness: HAPPINESS_RULES.initial, lastAction: null, consecutiveDays: 0, lastDay: null });

export function validateMorale(morale, day) {
  const fail = () => { throw new Error('선수 행복도 또는 연속 행동 기록이 올바르지 않습니다.'); };
  if (!morale || typeof morale !== 'object' || Array.isArray(morale)
    || !Number.isInteger(morale.happiness) || morale.happiness < HAPPINESS_RULES.minimum || morale.happiness > HAPPINESS_RULES.maximum
    || !Number.isSafeInteger(morale.consecutiveDays) || morale.consecutiveDays < 0) fail();
  if (morale.consecutiveDays === 0) {
    if (morale.lastAction !== null || morale.lastDay !== null) fail();
  } else if (typeof morale.lastAction !== 'string' || !Object.hasOwn(TRAINING_LABELS, morale.lastAction)
    || !Number.isSafeInteger(morale.lastDay) || morale.lastDay < 1 || morale.lastDay >= day || morale.consecutiveDays > morale.lastDay) fail();
  return { happiness: morale.happiness, lastAction: morale.lastAction, consecutiveDays: morale.consecutiveDays, lastDay: morale.lastDay };
}

export function happinessModifier(player) {
  const happiness = player.morale?.happiness ?? HAPPINESS_RULES.initial;
  return HAPPINESS_BANDS.find(band => happiness >= band.minimum).modifier;
}

export function effectiveStats(player) {
  const modifier = happinessModifier(player);
  return Object.fromEntries(TRAINING_SKILLS.map(skill => [skill, Math.max(1, Math.min(TRAINING_RULES.maximumStat,
    player[skill] + modifier + (skill === 'stamina' ? 0 : fatigueModifier(player))))]));
}

export function applyActionHappiness(player, action, day) {
  const morale = player.morale;
  const same = morale.lastAction === action && morale.lastDay === day - 1;
  morale.consecutiveDays = same ? morale.consecutiveDays + 1 : 1;
  morale.lastAction = action; morale.lastDay = day;
  const count = morale.consecutiveDays;
  let delta;
  if (action === 'rest') {
    delta = count <= 7 ? 2 : count <= 14 ? 1 : 0;
    const loss = count <= 7 ? 0 : count <= 14 ? 2 : 3;
    if (loss) for (const skill of TRAINING_SKILLS) player.training.experience[skill] = Math.max(0, player.training.experience[skill] - loss);
  } else {
    delta = count >= 15 ? -2 : count >= 8 ? -1 : action === 'broadcast' ? 1 : 0;
  }
  morale.happiness = Math.max(HAPPINESS_RULES.minimum, Math.min(HAPPINESS_RULES.maximum, morale.happiness + delta));
}
