import { ROSTER_RULES } from '../config/roster.js';
import { releasePlayer } from './roster.js';
import { prepareDayFinance } from './finance.js';
import { trainPlayers, scheduledAction } from './training.js';
import { trainAiClubs } from './ai-growth.js';
import { ACTION_RULES } from '../config/training.js';
import { pendingPlayerEvent, planPlayerEventWeek, triggerPlayerEvent } from './player-events.js';
import { bankruptcyIssue } from './bankruptcy.js';
import { nextStockWeek } from './stocks.js';
import { beginOfficialSchedule, requiresTiebreak } from './weekly-official.js';
import { completeBroadcastWeek, createSponsor, isSeasonSponsor } from './sponsors.js';
import { isPlayoffWeek, playoffsComplete } from './pc-playoffs.js';
import { completePreseason, isPreseason, completeSeason } from './season-calendar.js';
import { preseasonEndDay,yearWeek } from './season-year-context.js';
import { officialSeason } from './pc-season.js';
import { playoffWeekId,DOMESTIC_LEAGUES } from '../config/domestic-leagues.js';
import { settleWorldFinals } from './world-finals.js';

export function advanceDay(world) {
  completeSeason(world);
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, bankrupt: true, message: ended };
  if (!Number.isSafeInteger(world.day) || world.day < 1 || world.day === Number.MAX_SAFE_INTEGER) {
    return { ok: false, message: '게임 날짜를 더 진행할 수 없습니다.' };
  }
  completePreseason(world);
  if (isPreseason(world) && world.day >= preseasonEndDay(world)) return { ok: false, message: '비시즌의 남은 이벤트·팀 훈련·주간 일정을 먼저 마치세요.' };
  if (requiresTiebreak(world)) return { ok: false, tiebreakPending: true, message: '정규 시즌 순위 결정전을 먼저 마치세요.' };
  const season=officialSeason(world),schedule = season.weekSchedule;
  if (season.activeMatchId || schedule?.phase === 'match'
    || schedule?.phase === 'preparing' && world.day >= schedule.endDay - 1) return { ok: false, officialPending: true, message: '이번 주 공식 경기를 먼저 진행하세요.' };
  if (pendingPlayerEvent(world)) return { ok: false, eventPending: true, message: '선수 이벤트에서 수락 또는 거절을 선택하세요.' };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  const expiringIds = club.playerIds.filter(id => club.contracts[id].remainingDays === 1);
  if (club.playerIds.length - expiringIds.length < ROSTER_RULES.starters) {
    return { ok: false, message: `계약 만료 예정 ${expiringIds.length}명으로 명단이 5명 미만이 됩니다. 먼저 재계약하거나 선수를 영입하세요. 날짜와 계약은 유지됩니다.` };
  }
  // 모든 만료를 먼저 확인해 일부 선수만 방출되거나 날짜만 바뀌는 상황을 막는다.
  const broadcasting = world.players.filter(player => club.playerIds.includes(player.id) && scheduledAction(player, world.day) === 'broadcast').length;
  const actionIncome = broadcasting * ACTION_RULES.broadcastIncome;
  const financial = prepareDayFinance(world, club, actionIncome, broadcasting);
  if (!financial.ok) return financial;
  const stocks = nextStockWeek(world.stocks, world.day + 1, club.finance.weeklyStartedDay);
  const growth = trainPlayers(world, club.playerIds);
  trainAiClubs(world);
  for (const id of expiringIds) releasePlayer(world, id);
  for (const id of club.playerIds) club.contracts[id].remainingDays--;
  world.day++;
  club.balance = financial.balance;
  club.finance = financial.finance;
  world.stocks = stocks;
  const bankrupt = Boolean(bankruptcyIssue(world));
  if (bankrupt) {
    settleWorldFinals(world);
    if (schedule?.phase === 'settling' && isPlayoffWeek(world.pcSeason) && playoffsComplete(world.pcSeason.playoffs)) {
      world.pcSeason.playoffs.settled = true;
      if (isSeasonSponsor(club.finance.sponsor)) club.finance.sponsor = createSponsor();
    }
    if(DOMESTIC_LEAGUES[season.leagueId] && schedule?.fixtureId===playoffWeekId(season) && playoffsComplete(season.playoffs)) {
      season.playoffs.settled=true;
      if(isSeasonSponsor(club.finance.sponsor))club.finance.sponsor=createSponsor();
    }
    world.weekDaysRemaining = 0; world.playerEvents.week = null; season.weekSchedule = null;
    completeSeason(world);
  }
  return {
    ok: true, bankrupt, expiredIds: expiringIds, growth, actionIncome,
    message: `${yearWeek(world)}주 차로 진행했습니다.${growth.length ? ` 훈련 능력 상승 ${growth.length}건.` : ''}${expiringIds.length ? ` 계약 만료 ${expiringIds.length}명은 자유계약으로 전환됐습니다.` : ''}${financial.settlement ? ` 스폰서 수입 $${financial.settlement.income.toLocaleString('en-US')} · 급여·유지비·이자 정산 완료 · 운영 자금 ${club.balance.toLocaleString('en-US')}달러` : ''}`,
  };
}

// UI는 events를 켜서 선택에 의한 중단을 허용하고, 일괄 계산 호출은 기존 동작을 유지한다.
export function advanceWeek(world, { events = false, teamTraining = false, official = false } = {}) {
  completeSeason(world);
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, bankrupt: true, advancedDays: 0, message: ended };
  if (!Number.isSafeInteger(world.day) || world.day < 1 || world.day === Number.MAX_SAFE_INTEGER) return { ok: false, advancedDays: 0, message: '게임 날짜를 더 진행할 수 없습니다.' };
  if (requiresTiebreak(world)) return { ok: false, tiebreakPending: true, advancedDays: 0, message: '정규 시즌 순위 결정전을 먼저 마치세요.' };
  if (world.teamTraining?.status === 'pending') return { ok: false, advancedDays: 0, message: '진행 중인 팀 훈련을 먼저 마치세요.' };
  if (pendingPlayerEvent(world)) return { ok: false, advancedDays: 0, eventPending: true, message: '선수 이벤트에서 수락 또는 거절을 선택하세요.' };
  completePreseason(world);
  if (official) beginOfficialSchedule(world, teamTraining);
  const season=officialSeason(world),schedule = season.weekSchedule;
  if (schedule?.phase === 'match' || season.activeMatchId) return { ok: false, officialPending: true, advancedDays: 0, message: '이번 주 공식 경기를 먼저 진행하세요.' };
  const interactive = schedule?.phase === 'settling' ? false : events || world.playerEvents.week !== null;
  const startedDay = world.day;
  const count = schedule ? (schedule.phase === 'preparing' ? schedule.endDay - 1 : schedule.endDay) - world.day
    : world.playerEvents.week ? world.playerEvents.week.endDay - world.day : world.weekDaysRemaining || ACTION_RULES.weekDays;
  if (interactive && world.day > Number.MAX_SAFE_INTEGER - count) return { ok: false, advancedDays: 0, message: '게임 날짜를 더 진행할 수 없습니다.' };
  let advancedDays = 0, actionIncome = 0, growthCount = 0, expiredCount = 0;
  for (let index = 0; index < count; index++) {
    const result = advanceDay(world);
    if (!result.ok) return { ok: false, advancedDays, remainingDays: count - advancedDays, actionIncome, growthCount, expiredCount,
      message: `${advancedDays}일 진행 후 중단했습니다. 남은 일정 ${count - advancedDays}일. ${result.message}` };
    advancedDays++;
    actionIncome += result.actionIncome;
    growthCount += result.growth.length;
    expiredCount += result.expiredIds.length;
    world.weekDaysRemaining = count - advancedDays;
    if (result.bankrupt) {
      world.weekDaysRemaining = 0;
      return { ok: false, bankrupt: true, advancedDays, remainingDays: 0, actionIncome, growthCount, expiredCount, message: bankruptcyIssue(world) };
    }
    if (interactive) {
      planPlayerEventWeek(world, startedDay, count, teamTraining);
      if (triggerPlayerEvent(world)) return { ok: false, eventPending: true, advancedDays, remainingDays: world.weekDaysRemaining, actionIncome, growthCount, expiredCount,
        message: '선수 이벤트가 발생했습니다. 수락 또는 거절 후 남은 일정을 이어갑니다.' };
    }
  }
  if (interactive) world.playerEvents.week = null;
  if (schedule?.phase === 'preparing') {
    schedule.phase = 'match';
    world.weekDaysRemaining = 1;
    completeBroadcastWeek(world);
  } else if (schedule?.phase === 'settling') {
    settleWorldFinals(world);
    if(DOMESTIC_LEAGUES[season.leagueId] && schedule.fixtureId===playoffWeekId(season) && playoffsComplete(season.playoffs)) {
      season.playoffs.settled=true;
      const finance=world.clubs.find(club=>club.id===world.playerClubId).finance;
      if(isSeasonSponsor(finance.sponsor))finance.sponsor=createSponsor();
    }
    if (isPlayoffWeek(world.pcSeason) && playoffsComplete(world.pcSeason.playoffs)) {
      world.pcSeason.playoffs.settled = true;
      const finance = world.clubs.find(club => club.id === world.playerClubId).finance;
      if (isSeasonSponsor(finance.sponsor)) finance.sponsor = createSponsor();
    }
    season.weekSchedule = null;
  }
  if (!teamTraining) completePreseason(world);
  completeSeason(world);
  return { ok: true, advancedDays, remainingDays: world.weekDaysRemaining, officialPending: schedule?.phase === 'match', actionIncome, growthCount, expiredCount,
    message: `주간 일정 완료 · 현재 ${yearWeek(world)}주 차 · 능력 상승 ${growthCount}건 · 방송 수입 $${actionIncome.toLocaleString('en-US')} · 계약 만료 ${expiredCount}명` };
}
