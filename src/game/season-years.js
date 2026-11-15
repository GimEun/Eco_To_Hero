import { createPcSeason,validatePcSeason,officialSeason } from './pc-season.js';
import { createOfficialRecords,validateOfficialRecords } from './official-records.js';
import { isFreeSchedule,validateSeasonCalendar } from './season-calendar.js';
import { bankruptcyIssue } from './bankruptcy.js';
import { competitionSeed,seasonYear,seasonYearStart } from './season-year-context.js';
import { validateCitySeason } from './city-season.js';
import { validateDomesticSeason } from './domestic-season.js';
import { validateWorldGroups } from './world-groups.js';

export const SEASON_FIELDS=['pcSeason','citySeason','provinceSeason','nationalSeason','worldSeason','officialRecords'];

export function newYearIssue(world) {
  if(bankruptcyIssue(world))return bankruptcyIssue(world);
  if(world.yearAdvance?.status==='paused')return '연말 진행을 마치거나 취소한 뒤 새해를 시작하세요.';
  if(!isFreeSchedule(world))return '올해 공식 도전을 마친 자유 일정에서 새해를 시작할 수 있습니다.';
  const season=officialSeason(world);
  if(season.activeMatchId || season.weekSchedule || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status==='pending')return '진행 중인 일정·이벤트·팀 훈련을 먼저 마치세요.';
  if(world.day-seasonYearStart(world)<364)return `올해 52주를 마친 뒤 새해를 시작할 수 있습니다. 남은 ${Math.ceil((seasonYearStart(world)+364-world.day)/7)}주`;
  if(!Number.isSafeInteger(seasonYear(world)+1) || world.day>Number.MAX_SAFE_INTEGER-364)return '게임 연도를 더 진행할 수 없습니다.';
  return null;
}

export function startNextYear(world) {
  const issue=newYearIssue(world);if(issue)throw new Error(issue);
  const year=seasonYear(world),archive={year,startedDay:seasonYearStart(world),endedDay:world.day,calendar:{...world.seasonCalendar},
    ...Object.fromEntries(SEASON_FIELDS.map(key=>[key,structuredClone(world[key])]))};
  world.seasonYears={year:year+1,startedDay:world.day,archives:[...world.seasonYears.archives,archive]};
  world.seasonCalendar={mode:'annual',phase:'preseason'};
  world.pcSeason=createPcSeason(world.clubs,competitionSeed(world));
  world.citySeason=null;world.provinceSeason=null;world.nationalSeason=null;world.worldSeason=null;
  world.officialRecords=createOfficialRecords();world.teamTraining=null;world.yearAdvance=null;
  return world;
}

export function validateSeasonArchives(years,world) {
  const fail=()=>{throw new Error('지난 연도 기록이 올바르지 않습니다.');};
  let start=1;
  const archives=years.archives.map((value,i)=>{
    if(!value || value.year!==i+1 || value.startedDay!==start || !Number.isSafeInteger(value.endedDay) || value.endedDay<start+364 || value.endedDay>world.day)fail();
    const context={...world,day:value.endedDay,seasonYears:{year:i+1,startedDay:start,archives:[]},seasonCalendar:value.calendar,
      weekDaysRemaining:0,playerEvents:{week:null},teamTraining:null,officialRecords:value.officialRecords};
    const pcSeason=validatePcSeason(value.pcSeason,world.clubs,{seed:competitionSeed(context)});
    const citySeason=validateCitySeason(value.citySeason,{...context,pcSeason});
    const provinceSeason=validateDomesticSeason(value.provinceSeason,{...context,pcSeason,citySeason},'province');
    const nationalSeason=validateDomesticSeason(value.nationalSeason,{...context,pcSeason,citySeason,provinceSeason},'national');
    const worldSeason=validateWorldGroups(value.worldSeason,{...context,pcSeason,citySeason,provinceSeason,nationalSeason});
    const canonical={...context,pcSeason,citySeason,provinceSeason,nationalSeason,worldSeason};
    const officialRecords=validateOfficialRecords(value.officialRecords,canonical);
    const calendar=validateSeasonCalendar(value.calendar,{...canonical,officialRecords});
    if(calendar.phase!=='offseason' || !isFreeSchedule({...canonical,seasonCalendar:calendar}) || officialRecords.active)fail();
    for(const season of [pcSeason,citySeason,provinceSeason,nationalSeason,worldSeason].filter(Boolean)) {
      if(season.activeMatchId || season.weekSchedule || season.startedDay!==undefined && season.startedDay<start)fail();
    }
    start=value.endedDay;
    return {year:i+1,startedDay:value.startedDay,endedDay:value.endedDay,calendar,pcSeason,citySeason,provinceSeason,nationalSeason,worldSeason,officialRecords};
  });
  if(years.startedDay!==start)fail();
  return {...years,archives};
}
