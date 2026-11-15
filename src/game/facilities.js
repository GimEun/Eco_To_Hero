import { bankruptcyIssue } from './bankruptcy.js';
import { TRAINING_SKILLS } from '../config/training.js';
import { FINANCE_RULES } from '../config/finance.js';

export const FACILITY_NAMES = Object.freeze({ aim: '에임 훈련실', intelligence: '전술 분석실', stamina: '체력 단련실' });
export const FACILITY_LEVELS = Object.freeze([
  Object.freeze({ fee: 0, bonus: 0, maintenance: 0 }),
  Object.freeze({ fee: 2000, bonus: 10, maintenance: 100 }),
  Object.freeze({ fee: 6000, bonus: 20, maintenance: 200 }),
  Object.freeze({ fee: 15000, bonus: 30, maintenance: 350 }),
]);
export const createFacilities = () => ({ aim: 0, intelligence: 0, stamina: 0 });
export function validateFacilities(facilities) {
  if (!facilities || typeof facilities !== 'object' || Array.isArray(facilities)
    || Object.keys(facilities).length !== TRAINING_SKILLS.length
    || TRAINING_SKILLS.some(skill => !Object.hasOwn(facilities, skill) || !Number.isInteger(facilities[skill]) || facilities[skill] < 0 || facilities[skill] > 3)) {
    throw new Error('훈련 시설 정보가 올바르지 않습니다.');
  }
  return Object.fromEntries(TRAINING_SKILLS.map(skill => [skill, facilities[skill]]));
}
export const facilityBonus = (facilities, skill) => FACILITY_LEVELS[facilities[skill]].bonus;
export const facilityMaintenance = facilities => TRAINING_SKILLS.reduce((sum, skill) => sum + FACILITY_LEVELS[facilities[skill]].maintenance, 0);
export function facilityChangeIssue({ finance, day, weekDaysRemaining, playerEvents, teamTrainingPending }) {
  if ((day - finance.weeklyStartedDay) % FINANCE_RULES.periodDays !== 0 || weekDaysRemaining || playerEvents.week || teamTrainingPending) {
    return '진행 중인 일정·이벤트·팀 훈련을 마친 뒤 새 주 시작에 시설을 구매·강화하세요.';
  }
  return null;
}
export function upgradeFacility(world, skill) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  if (!TRAINING_SKILLS.includes(skill)) return { ok: false, message: '구매·강화할 훈련 시설을 선택하세요.' };
  const club = world.clubs.find(item => item.id === world.playerClubId);
  const issue = facilityChangeIssue({ ...world, ...club, teamTrainingPending: world.teamTraining?.status === 'pending' });
  if (issue) return { ok: false, message: issue };
  const level = club.facilities[skill];
  if (level === 3) return { ok: false, message: '이미 최대 3단계 시설입니다.' };
  const next = FACILITY_LEVELS[level + 1];
  if (club.balance < next.fee) return { ok: false, message: '시설 구매·강화 자금이 부족합니다.' };
  club.balance -= next.fee;
  club.facilities[skill] = level + 1;
  return { ok: true, message: `${FACILITY_NAMES[skill]} ${level + 1}단계 ${level ? '강화' : '구매'} 완료 · 해당 개인 훈련 경험치 +${next.bonus}% · 주 유지비 $${next.maintenance}` };
}
