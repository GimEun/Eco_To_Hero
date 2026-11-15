export const FATIGUE_RULES = Object.freeze({ minimum: 0, maximum: 100, initial: 0,
  personal: 2, team: 3, broadcast: 1, rest: -5, staminaThreshold: 80 });

export function validateFatigue(value) {
  if (!Number.isInteger(value) || value < FATIGUE_RULES.minimum || value > FATIGUE_RULES.maximum) {
    throw new Error('선수 피로는 0~100 사이의 정수여야 합니다.');
  }
  return value;
}

export const playerCondition = player => FATIGUE_RULES.maximum - (player.fatigue ?? FATIGUE_RULES.initial);
export function fatigueModifier(player) {
  const fatigue = player.fatigue ?? FATIGUE_RULES.initial;
  return fatigue >= 75 ? -5 : fatigue >= 50 ? -3 : fatigue >= 25 ? -1 : 0;
}

export function applyActionFatigue(player, action) {
  const personal = ['aim', 'intelligence', 'stamina'].includes(action);
  let delta = personal ? FATIGUE_RULES.personal : FATIGUE_RULES[action];
  if ((personal || action === 'team') && player.stamina >= FATIGUE_RULES.staminaThreshold) delta--;
  player.fatigue = Math.max(FATIGUE_RULES.minimum, Math.min(FATIGUE_RULES.maximum, player.fatigue + delta));
}
