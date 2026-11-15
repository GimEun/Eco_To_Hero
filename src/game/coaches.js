import { bankruptcyIssue } from './bankruptcy.js';
import { FINANCE_RULES } from '../config/finance.js';

export const COACHES = Object.freeze({
  beginner: Object.freeze({ name: '초급 코치', fee: 500, weeklySalary: 150, bonus: 10 }),
  intermediate: Object.freeze({ name: '중급 코치', fee: 1500, weeklySalary: 350, bonus: 20 }),
  advanced: Object.freeze({ name: '고급 코치', fee: 4000, weeklySalary: 700, bonus: 30 }),
});
export const coachRule = coach => typeof coach === 'string' && Object.hasOwn(COACHES, coach) ? COACHES[coach] : null;
export function validateCoach(coach) {
  if (coach !== null && !coachRule(coach)) throw new Error('코치 정보가 올바르지 않습니다.');
  return coach;
}
export function coachChangeIssue({ finance, day, weekDaysRemaining, playerEvents, teamTrainingPending }) {
  if ((day - finance.weeklyStartedDay) % FINANCE_RULES.periodDays !== 0 || weekDaysRemaining || playerEvents.week || teamTrainingPending) {
    return '진행 중인 일정·이벤트·팀 훈련을 마친 뒤 새 주 시작에 코치를 변경하세요.';
  }
  return null;
}
export function changeCoach(world, nextCoach) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  const club = world.clubs.find(item => item.id === world.playerClubId);
  const rule = coachRule(nextCoach);
  if (nextCoach !== null && !rule) return { ok: false, message: '고용할 코치를 선택하세요.' };
  if (club.coach === nextCoach) return { ok: false, message: '현재 코치와 같은 선택입니다.' };
  const issue = coachChangeIssue({ ...world, ...club, teamTrainingPending: world.teamTraining?.status === 'pending' });
  if (issue) return { ok: false, message: issue };
  if (rule && club.balance < rule.fee) return { ok: false, message: '코치 고용비가 부족합니다.' };
  club.balance -= rule?.fee ?? 0;
  club.coach = nextCoach;
  return { ok: true, message: rule ? `${rule.name} 고용 완료 · 훈련 경험치 +${rule.bonus}% · 주급 $${rule.weeklySalary}` : '코치를 해고했습니다. 해고 비용과 환급은 없습니다.' };
}
