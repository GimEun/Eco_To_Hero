import { TRAINING_SKILLS } from '../config/training.js';
import { randomUnit } from './random.js';

export const GROWTH_LABELS = Object.freeze({ 80: '느림', 100: '보통', 120: '빠름' });

// 별도 난수로 배정해 기존 세계 생성·경기·주간 이벤트의 추첨 순서를 보존한다.
export function createDevelopment(player, seed) {
  let hash = (seed ^ 0x67726f77) >>> 0;
  for (const character of player.id) hash = Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0;
  const random = { randomState: hash };
  const potential = Object.fromEntries(TRAINING_SKILLS.map(skill => {
    const roll = randomUnit(random);
    const minimum = roll < 0.5 ? 70 : roll < 0.85 ? 80 : 90;
    return [skill, Math.max(player[skill], minimum + Math.floor(randomUnit(random) * 10))];
  }));
  const roll = randomUnit(random);
  return { potential, growthRate: roll < 0.25 ? 80 : roll < 0.75 ? 100 : 120 };
}

export function validateDevelopment(value, player) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Object.hasOwn(GROWTH_LABELS, value.growthRate) || !Number.isInteger(value.growthRate)
    || !value.potential || typeof value.potential !== 'object' || Array.isArray(value.potential)
    || TRAINING_SKILLS.some(skill => !Number.isInteger(value.potential[skill])
      || value.potential[skill] < Math.max(70, player[skill]) || value.potential[skill] > 99)) {
    throw new Error('선수 잠재력 또는 성장 속도가 올바르지 않습니다.');
  }
  return { potential: Object.fromEntries(TRAINING_SKILLS.map(skill => [skill, value.potential[skill]])), growthRate: value.growthRate };
}

export const trainingLimit = (player, skill) => player.development.potential[skill];
export function growthExperience(player, amount, coachBonus = 0, facilityBonus = 0) {
  const scaled = amount * player.development.growthRate / 100 * (100 + coachBonus) / 100;
  return Math.round(facilityBonus ? scaled * (100 + facilityBonus) / 100 : scaled);
}
