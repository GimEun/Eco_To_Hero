import { preseasonEndDay,yearWeek,seasonYear } from './season-year-context.js';
import { officialSeason } from './pc-season.js';
import { playoffFinalRanks } from './pc-playoffs.js';
import { worldGroupOutcome } from './world-groups.js';
import { createSponsor,isSeasonSponsor } from './sponsors.js';

export const createSeasonCalendar = (legacy = false) => ({ mode: legacy ? 'legacy' : 'annual', phase: legacy ? 'season' : 'preseason' });
export const isPreseason = world => world.seasonCalendar?.phase === 'preseason';
export const recruitmentWindowIssue = world => isPreseason(world) || isFreeSchedule(world) ? null : '시즌 중에는 선수를 영입할 수 없습니다. 비시즌에 영입하세요.';

function endedChallenge(world) {
  const season=officialSeason(world);if(!season)return false;
  if(world.worldSeason) {
    if(season.playoffs)return Boolean(season.playoffs.settled);
    const current=season.ranked??season,outcome=worldGroupOutcome(current);
    return Boolean(outcome && !outcome.qualifiedClubIds.includes(world.playerClubId)
      && world.day>=current.startedDay+(season.ranked?14:21));
  }
  const ranks=playoffFinalRanks(season.playoffs),index=ranks?.indexOf(world.playerClubId)??-1;
  return Boolean(season.playoffs?.settled && index>=2);
}
function pendingSchedule(world) {
  const season=officialSeason(world);
  return Boolean(season?.activeMatchId || season?.weekSchedule || world.weekDaysRemaining || world.playerEvents?.week || world.teamTraining?.status==='pending');
}
export function isFreeSchedule(world) {
  return world.seasonCalendar?.phase==='offseason' || !isPreseason(world) && endedChallenge(world) && !pendingSchedule(world);
}
export function completeSeason(world) {
  if(isPreseason(world) || !endedChallenge(world) || world.seasonCalendar?.phase!=='offseason' && pendingSchedule(world))return false;
  world.seasonCalendar.phase='offseason';
  const finance=world.clubs.find(club=>club.id===world.playerClubId).finance;
  if(isSeasonSponsor(finance.sponsor))finance.sponsor=createSponsor();
  return true;
}

export function completePreseason(world) {
  if (!isPreseason(world) || world.day < preseasonEndDay(world) || world.weekDaysRemaining
    || world.playerEvents.week || world.teamTraining?.status === 'pending') return false;
  world.seasonCalendar.phase = 'season';
  return true;
}

export function seasonCalendarLabel(world) {
  const prefix=`${seasonYear(world)}년 차 · `;
  if(isFreeSchedule(world))return `${prefix}자유 일정 · 올해 공식 도전 종료 · 선수 영입 가능`;
  if (world.seasonCalendar?.mode === 'legacy') return `${prefix}시즌 중 · 기존 일정 유지 · 선수 영입 불가`;
  if (isPreseason(world)) return prefix+(world.day >= preseasonEndDay(world) ? '비시즌 마무리 · 남은 이벤트·팀 훈련 완료 후 시즌 시작' : `비시즌 ${yearWeek(world)}/4주 · 선수 영입 가능 · 5주 차 시즌 시작`);
  return `${prefix}시즌 중 · 선수 영입 불가`;
}

export function validateSeasonCalendar(value, world, legacy = false, legacyFreeSchedule = false) {
  if (legacy && value === undefined) return createSeasonCalendar(true);
  const fail = () => { throw new Error('시즌·비시즌 일정 정보가 올바르지 않습니다.'); };
  if (!value || !['annual', 'legacy'].includes(value.mode) || !['preseason', 'season','offseason'].includes(value.phase)
    || value.mode === 'legacy' && value.phase === 'preseason') fail();
  if(value.phase==='offseason' && (!endedChallenge(world) || officialSeason(world).activeMatchId || officialSeason(world).weekSchedule))fail();
  if (value.mode === 'annual') {
    if (value.phase === 'season' && world.day < preseasonEndDay(world)) fail();
    if (value.phase === 'preseason' && (world.day > preseasonEndDay(world) || world.pcSeason.activeMatchId
      || world.pcSeason.weekSchedule || world.pcSeason.fixtures.some(fixture => fixture.result)
      || world.pcSeason.tiebreaks.length || world.officialRecords.receipts.length)) fail();
  }
  return { mode: value.mode, phase:legacyFreeSchedule && value.phase==='season' && endedChallenge(world) && !pendingSchedule(world)?'offseason':value.phase };
}
