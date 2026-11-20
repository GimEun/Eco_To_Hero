import { ANNUAL_CALENDAR } from '../config/annual-calendar.js';
import { TRAINING_LABELS, WEEKDAYS } from '../config/training.js';
import { seasonYearStart, yearWeek, seasonYear } from './season-year-context.js';
import { officialSeason } from './pc-season.js';
import { scheduledAction } from './training.js';
import { findPlayerEvent } from '../data/player-events.js';
import { FINANCE_RULES } from '../config/finance.js';

export function calendarWeek(world, week = yearWeek(world)) {
  const maxWeek = Math.max(53, yearWeek(world) + 5);
  week = Math.max(1, Math.min(maxWeek, Number.isInteger(week) ? week : yearWeek(world)));
  const start = seasonYearStart(world) + (week - 1) * 7;
  const club = world.clubs.find(item => item.id === world.playerClubId);
  const players = world.players.filter(player => club.playerIds.includes(player.id));
  const active = officialSeason(world), schedule = active.weekSchedule;
  const entries = [];
  const add = (day, text, kind) => { if (day >= start && day < start + 7) entries.push({ day, text, kind }); };
  const names = new Map(world.clubs.map(item => [item.id, item.name]));
  for (const season of [world.pcSeason, world.citySeason, world.provinceSeason, world.nationalSeason, world.worldSeason].filter(Boolean)) {
    const stages = [season, season.ranked].filter(Boolean);
    const fixtures = [...stages.flatMap(stage => [...stage.fixtures, ...(stage.tiebreaks ?? []).flatMap(round => round.fixtures)]), ...(season.playoffs?.series ?? [])];
    for (const fixture of fixtures) {
      if (![fixture.homeClubId, fixture.awayClubId].includes(club.id)) continue;
      const receipt = world.officialRecords.receipts.find(item => item.fixtureId === fixture.id);
      const selected = season.weekSchedule?.fixtureId === fixture.id;
      const playoff = season.playoffs?.series.includes(fixture);
      const stage = season.ranked?.fixtures.includes(fixture) ? season.ranked : season;
      const regular = stage.fixtures.includes(fixture);
      const base = stage.startedDay ?? (world.seasonCalendar.mode === 'annual' ? seasonYearStart(world) + 28 : null);
      let day = receipt?.day ?? (selected ? season.weekSchedule.endDay - 1 : null);
      if (day === null && fixture.week === 0 && !fixture.result) day = world.day;
      if (day === null && regular && base !== null) day = base + (fixture.week - (stage === season.ranked ? 4 : 1)) * 7 + 6;
      if (day === null && playoff && schedule && season === active) day = schedule.endDay - 1;
      if (day === null && playoff && season.playoffs.startedDay) day = season.playoffs.startedDay + 6;
      if (day === null || !Number.isSafeInteger(day)) continue;
      const opponent = names.get(fixture.homeClubId === club.id ? fixture.awayClubId : fixture.homeClubId);
      const status = receipt ? '완료' : fixture.result ? '완료' : day < world.day ? '일정 확인 필요' : '예정';
      add(day, `${playoff ? '플레이오프' : fixture.week === 0 ? '순위 결정전' : '공식 경기'} · ${opponent ?? '상대 미정'} · ${status}`, 'match');
    }
  }
  const actionEnd = schedule?.endDay ?? world.playerEvents.week?.endDay
    ?? (world.weekDaysRemaining ? world.day + world.weekDaysRemaining : world.yearAdvance?.status === 'paused' ? world.yearAdvance.targetDay : world.day);
  for (let offset = 0; offset < 7 && Number.isSafeInteger(start + offset); offset++) {
    const day = start + offset;
    if (day >= world.day && day < actionEnd) {
      const counts = new Map();
      for (const player of players) {
        const label = TRAINING_LABELS[scheduledAction(player, day)];
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      for (const [label, count] of counts) add(day, `${label} · ${count}명`, 'action');
    }
    if (day >= world.day && day > club.finance.weeklyStartedDay
      && (day - club.finance.weeklyStartedDay) % FINANCE_RULES.periodDays === 0) add(day, '주간 재정 정산 · 예정', 'finance');
  }
  for (const settlement of club.finance.settlements) add(settlement.day, '주간 재정 정산 · 완료', 'finance');
  if (world.teamTraining) add(world.teamTraining.day, `팀 훈련 · ${world.teamTraining.status === 'pending' ? '진행 대기' : '완료'}`, 'training');
  const trainingDay = schedule?.teamTraining ? schedule.endDay - 1 : world.playerEvents.week?.teamTraining ? world.playerEvents.week.endDay : null;
  if (trainingDay !== null && trainingDay !== world.teamTraining?.day) add(trainingDay, '팀 훈련 · 예정', 'training');
  const event = world.playerEvents.week?.event;
  // 추첨만 끝난 미래 이벤트는 발생하기 전까지 공개하지 않는다.
  if (event?.status === 'pending') add(event.day, `${findPlayerEvent(event.eventId).title} · 선택 대기`, 'event');
  for (const receipt of world.playerEvents.history) add(receipt.day, `${findPlayerEvent(receipt.eventId).title} · 처리 완료`, 'event');
  const stage = ANNUAL_CALENDAR.find(item => week >= item.startWeek && week <= item.endWeek);
  return { week, maxWeek, year: seasonYear(world), plan: stage?.name ?? '자유 일정', days: Array.from({ length: 7 }, (_, offset) => {
    const day = start + offset;
    return { day, weekday: WEEKDAYS[(day - 1) % 7], valid: Number.isSafeInteger(day), today: day === world.day,
      past: day < world.day, entries: entries.filter(entry => entry.day === day) };
  }) };
}

// 월은 조회용이다. 실제 날짜·시즌 전환·52주 규칙은 변경하지 않는다.
export function calendarMonth(world, selectedWeek, selectedMonth, selectedDay) {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const yearStart = seasonYearStart(world);
  const week = Math.max(1, Math.min(Math.max(53, yearWeek(world) + 5), Number.isInteger(selectedWeek) ? selectedWeek : yearWeek(world)));
  const anchor = selectedWeek === undefined ? world.day : yearStart + (week - 1) * 7;
  const reference = Number.isSafeInteger(selectedDay) && selectedDay >= yearStart ? selectedDay : anchor;
  const cycle = Math.floor((reference - yearStart) / 365);
  let month = 1, before = 0;
  while (month < 12 && before + lengths[month - 1] <= reference - yearStart - cycle * 365) {
    before += lengths[month - 1];
    month++;
  }
  if (Number.isInteger(selectedMonth)) month = Math.max(1, Math.min(12, selectedMonth));
  const start = yearStart + cycle * 365 + lengths.slice(0, month - 1).reduce((sum, length) => sum + length, 0);
  const length = lengths[month - 1];
  const firstWeek = Math.floor((start - yearStart) / 7) + 1;
  const cache = new Map();
  const days = Array.from({ length }, (_, index) => {
    const day = start + index, dayWeek = Math.floor((day - yearStart) / 7) + 1;
    if (!cache.has(dayWeek)) cache.set(dayWeek, calendarWeek(world, dayWeek));
    const data = cache.get(dayWeek).days.find(item => item.day === day);
    return { ...data, day, date: index + 1, week: dayWeek, valid: Number.isSafeInteger(day), entries: data?.entries ?? [] };
  });
  const activeDay = days.find(day => day.day === selectedDay)
    ?? days.find(day => selectedWeek !== undefined && selectedMonth === undefined ? day.day === anchor : day.today) ?? days[0];
  return { year: seasonYear(world), month, cycle, week: selectedDay !== undefined ? activeDay.week : selectedMonth === undefined ? week : firstWeek,
    maxWeek: Math.max(53, yearWeek(world) + 5), activeDay, days,
    offset: (start - 1) % 7, weekdays: WEEKDAYS };
}
