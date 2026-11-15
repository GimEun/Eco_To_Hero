import { competitionSeed } from './season-year-context.js';
import { createPcPlayoffs,seriesFor,recordPlayoffMap,nextPlayoffSeries,playoffsComplete } from './pc-playoffs.js';
import { worldGroupOutcome } from './world-groups.js';
import { validateDomesticSeries } from './domestic-season.js';
import { createSponsor,isSeasonSponsor } from './sponsors.js';

export const WORLD_FINALS_WEEK_ID='world-1-playoffs';
export const isWorldFinalsWeek=season=>season?.weekSchedule?.fixtureId===WORLD_FINALS_WEEK_ID;

export function settleWorldFinals(world) {
  const season=world.worldSeason;
  if(!isWorldFinalsWeek(season) || season.weekSchedule.phase!=='settling' || !playoffsComplete(season.playoffs))return;
  season.playoffs.settled=true;
  const finance=world.clubs.find(club=>club.id===world.playerClubId).finance;
  if(isSeasonSponsor(finance.sponsor))finance.sponsor=createSponsor();
}

export function createWorldFinals(season,seed,startedDay) {
  const outcome=season.ranked?worldGroupOutcome(season.ranked):null;
  if(!outcome)throw new Error('세계 순위별 리그 최종 순위를 먼저 확정하세요.');
  const playoffs=createPcPlayoffs(seed,outcome.qualifiedClubIds,'world-1');
  playoffs.series=playoffs.series.map(series=>({...series,kind:'world-final',week:6,mapPicks:null}));
  return {...playoffs,startedDay};
}
export function recordWorldFinalMap(season,id,score,options) {
  return recordPlayoffMap(season.playoffs,id,score,{...options,seasonId:'world-1',winsNeeded:3});
}
export function worldFinalStandings(season) {
  if(!playoffsComplete(season.playoffs))return null;
  const final=season.playoffs.series[2],won=final.result.homeScore>final.result.awayScore;
  const champion=won?final.homeClubId:final.awayClubId,runnerUp=won?final.awayClubId:final.homeClubId;
  const semis=season.playoffs.rankedClubs.filter(id=>![champion,runnerUp].includes(id)).sort();
  return [{rank:1,clubId:champion},{rank:2,clubId:runnerUp},...semis.map(clubId=>({rank:3,clubId})),
    ...worldGroupOutcome(season.ranked).eliminatedClubIds.map(clubId=>({rank:5,clubId})),
    ...worldGroupOutcome(season).eliminatedClubIds.map(clubId=>({rank:9,clubId}))];
}
export function validateWorldFinals(value,season,world) {
  if(value===null)return null;
  const fail=()=>{throw new Error('세계 BO5 플레이오프 정보가 올바르지 않습니다.');};
  if(!value || !season.ranked || !worldGroupOutcome(season.ranked) || typeof value.settled!=='boolean'
    || !Number.isSafeInteger(value.startedDay) || value.startedDay<season.ranked.startedDay+14 || value.startedDay>world.day || value.startedDay>Number.MAX_SAFE_INTEGER-7)fail();
  const expected=createWorldFinals(season,competitionSeed(world),value.startedDay);
  if(JSON.stringify(value.rankedClubs)!==JSON.stringify(expected.rankedClubs) || !Array.isArray(value.series) || ![2,3].includes(value.series.length))fail();
  let pending=false;
  for(let i=0;i<value.series.length;i++) {
    const actual=value.series[i],target=expected.series[i];if(!target || !actual || pending && (actual.mapPicks || actual.lineups))fail();
    validateDomesticSeries(actual,target,world);if(!target.result)pending=true;
    if((target.lineups || target.mapPicks) && world.day<value.startedDay+6)fail();
    if(i===1 && expected.series.every(series=>series.result)) {
      const winners=expected.series.map(series=>series.result.homeScore>series.result.awayScore?series.homeClubId:series.awayClubId);
      expected.series.push({...seriesFor(competitionSeed(world),'world-1-p-final',...winners),kind:'world-final',week:6,mapPicks:null});
    }
  }
  if(value.series.length!==expected.series.length || value.settled && (!playoffsComplete(expected) || world.day<value.startedDay+7))fail();
  expected.settled=value.settled;return expected;
}

export function validateWorldFinalsSchedule(expected,value,world) {
  const fail=()=>{throw new Error('세계 BO5 주간 일정이 올바르지 않습니다.');};
  const playoffs=expected.playoffs,schedule=value.weekSchedule,active=expected.activeMatchId;
  if(schedule!==null) {
    if(!isWorldFinalsWeek(value) || !['preparing','match','settling'].includes(schedule.phase) || typeof schedule.teamTraining!=='boolean'
      || schedule.startedDay!==playoffs.startedDay || schedule.endDay!==schedule.startedDay+7 || world.day<schedule.startedDay || world.day>=schedule.endDay
      || (schedule.phase==='settling')!==playoffsComplete(playoffs) || schedule.phase==='preparing' && playoffs.series.some(series=>series.mapPicks || series.lineups)
      || playoffs.settled)fail();
    expected.weekSchedule={fixtureId:WORLD_FINALS_WEEK_ID,startedDay:schedule.startedDay,endDay:schedule.endDay,phase:schedule.phase,teamTraining:schedule.teamTraining};
  }else if(!playoffs.settled || active)fail();
  const next=nextPlayoffSeries(playoffs);
  for(const series of playoffs.series)if(series.lineups && !series.result && series.id!==active)fail();
  if(active && (next?.id!==active || schedule?.phase!=='match'))fail();
}
