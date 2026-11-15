import { advanceWeek } from './calendar.js';
import { beginTeamTraining } from './team-training.js';
import { selectWeeklyActions } from './training.js';
import { pendingPlayerEvent } from './player-events.js';
import { isFreeSchedule } from './season-calendar.js';
import { officialSeason } from './pc-season.js';
import { seasonYear, seasonYearStart } from './season-year-context.js';
import { bankruptcyIssue } from './bankruptcy.js';

export const activeYearAdvance = world => world.yearAdvance?.status === 'paused';
const clubOf = world => world.clubs.find(club => club.id === world.playerClubId);

export function yearAdvanceIssue(world) {
  if (bankruptcyIssue(world)) return bankruptcyIssue(world);
  if (!isFreeSchedule(world)) return '올해 공식 도전을 마친 자유 일정에서 진행할 수 있습니다.';
  if (!Number.isSafeInteger(seasonYearStart(world) + 364)) return '게임 날짜를 더 진행할 수 없습니다.';
  if (activeYearAdvance(world)) return '진행 중인 연말 일정을 계속하거나 취소하세요.';
  if (world.day >= seasonYearStart(world) + 364) return '올해 52주를 이미 마쳤습니다. 새해를 직접 시작하세요.';
  const season = officialSeason(world);
  if (season.activeMatchId || season.weekSchedule || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status === 'pending') return '진행 중인 일정·이벤트·팀 훈련을 먼저 마치세요.';
  return null;
}

export function beginYearAdvance(world, choices) {
  const issue = yearAdvanceIssue(world);
  if (issue) return { ok: false, message: issue };
  const selected = selectWeeklyActions(world, choices);
  if (!selected.ok) return selected;
  world.yearAdvance = { year: seasonYear(world), startedDay: world.day, targetDay: seasonYearStart(world) + 364,
    initialBalance: clubOf(world).balance, status: 'paused', reason: 'ready', endedDay: null, message: '선택한 행동을 반복하여 연말까지 진행합니다.' };
  return { ok: true, message: world.yearAdvance.message };
}

function checkpoint(world, reason, message, advancedDays = 0) {
  const session = world.yearAdvance;
  session.status = ['complete', 'cancelled', 'bankrupt'].includes(reason) ? reason : 'paused';
  session.reason = reason;
  session.message = message;
  session.endedDay = session.status === 'paused' ? null : world.day;
  return { ok: reason === 'ready' || reason === 'complete', reason, message, advancedDays };
}

export function cancelYearAdvance(world) {
  if (!activeYearAdvance(world)) return { ok: false, message: '진행 중인 연말 일정이 없습니다.' };
  return checkpoint(world, 'cancelled', '연말 진행을 취소했습니다. 이미 진행한 날짜와 결과는 유지됩니다.');
}

// 한 번에 기존 주간 일정 하나만 계산한다. 호출자는 결과를 저장한 뒤 다음 주를 요청한다.
export function advanceYearWeek(world) {
  if (!activeYearAdvance(world)) return { ok: false, message: '계속할 연말 일정이 없습니다.' };
  if (bankruptcyIssue(world)) return checkpoint(world, 'bankrupt', bankruptcyIssue(world));
  if (pendingPlayerEvent(world)) return checkpoint(world, 'event', '선수 이벤트를 선택한 뒤 계속 진행하세요.');
  if (world.teamTraining?.status === 'pending') return checkpoint(world, 'training', '팀 연습을 마친 뒤 계속 진행하세요.');
  const left = world.yearAdvance.targetDay - world.day;
  if (left < 0 || !isFreeSchedule(world)) throw new Error('연말 진행 날짜·자유 일정이 올바르지 않습니다.');
  if (left === 0 && !world.playerEvents.week && !world.weekDaysRemaining) return checkpoint(world, 'complete', '연말까지 진행했습니다. 새해는 직접 시작하세요.');
  if (!world.playerEvents.week && !world.weekDaysRemaining && left < 7) world.weekDaysRemaining = left;
  const club = clubOf(world);
  const team = world.playerEvents.week?.teamTraining ?? club.lineupIds.some(id => world.players.find(player => player.id === id).training.focus === 'team');
  const result = team ? beginTeamTraining(world, { events: true }) : advanceWeek(world, { events: true });
  const days = result.advancedDays ?? 0;
  if (bankruptcyIssue(world)) return checkpoint(world, 'bankrupt', bankruptcyIssue(world), days);
  if (pendingPlayerEvent(world)) return checkpoint(world, 'event', '선수 이벤트가 발생했습니다. 선택 후 계속 진행하세요.', days);
  if (world.teamTraining?.status === 'pending') return checkpoint(world, 'training', '팀 연습이 준비됐습니다. 연습 종료 후 계속 진행하세요.', days);
  if (!result.ok) return checkpoint(world, 'blocked', result.message, days);
  return world.day === world.yearAdvance.targetDay
    ? checkpoint(world, 'complete', '연말까지 진행했습니다. 새해는 직접 시작하세요.', days)
    : checkpoint(world, 'ready', result.message, days);
}

export function validateYearAdvance(value, world) {
  if (value === null) return null;
  const fail = () => { throw new Error('연말 진행 상태가 올바르지 않습니다.'); };
  if (!value || value.year !== seasonYear(world) || !Number.isSafeInteger(value.startedDay)
    || value.startedDay < seasonYearStart(world) || value.startedDay > world.day
    || !Number.isSafeInteger(value.targetDay) || value.targetDay !== seasonYearStart(world) + 364 || value.startedDay >= value.targetDay
    || !Number.isSafeInteger(value.initialBalance) || typeof value.message !== 'string' || value.message.length > 600
    || !isFreeSchedule(world)) fail();
  const statuses = { ready: 'paused', event: 'paused', training: 'paused', blocked: 'paused', complete: 'complete', cancelled: 'cancelled', bankrupt: 'bankrupt' };
  if (!Object.hasOwn(statuses, value.reason) || value.status !== statuses[value.reason]) fail();
  if (value.status === 'paused') {
    if (value.endedDay !== null || world.day > value.targetDay || world.day + world.weekDaysRemaining > value.targetDay
      || world.playerEvents.week && world.playerEvents.week.endDay > value.targetDay) fail();
  } else if (!Number.isSafeInteger(value.endedDay) || value.endedDay < value.startedDay || value.endedDay > Math.min(world.day, value.targetDay)
    || value.status === 'complete' && value.endedDay !== value.targetDay) fail();
  return { year: value.year, startedDay: value.startedDay, targetDay: value.targetDay, initialBalance: value.initialBalance,
    status: value.status, reason: value.reason, endedDay: value.endedDay, message: value.message };
}
