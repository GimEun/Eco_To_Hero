import { competitionSeed } from './season-year-context.js';
import { seriesFor } from './pc-playoffs.js';
import { validateDomesticSeries } from './domestic-season.js';
import { worldGroupOutcome,worldGroupProgress } from './world-groups.js';
import { matchResult } from './pc-season.js';
import { bankruptcyIssue } from './bankruptcy.js';

export function createWorldRanked(season,seed,startedDay) {
  const outcome=worldGroupOutcome(season);if(!outcome)throw new Error('세계 조별 순위를 먼저 확정하세요.');
  const groups=[{id:'R1',clubIds:outcome.firstClubIds},{id:'R2',clubIds:outcome.secondClubIds}];
  // 기존 4팀 조별 대진의 자리 배치를 재사용하고 새 참가자·경기 ID로 맵을 추첨한다.
  const layout=season.fixtures.filter(match=>match.groupId==='A'),slots=season.groups[0].clubIds;
  const fixtures=groups.flatMap(group=>layout.map(match=>({
    ...seriesFor(seed,`world-1-${group.id.toLowerCase()}-w${match.week}-${match.id.split('-').at(-1)}`,
      group.clubIds[slots.indexOf(match.homeClubId)],group.clubIds[slots.indexOf(match.awayClubId)]),
    kind:'world',week:match.week<3?4:5,round:match.week,groupId:group.id,mapPicks:null,
  }))).sort((a,b)=>a.round-b.round || a.id.localeCompare(b.id));
  return {startedDay,groups,fixtures,tiebreaks:[]};
}

export function worldRankedEntryIssue(world) {
  if(bankruptcyIssue(world))return bankruptcyIssue(world);
  const season=world.worldSeason,outcome=season?worldGroupOutcome(season):null;
  if(!outcome?.qualifiedClubIds.includes(world.playerClubId))return '조별 상위 2팀과 최종 순위 확정이 필요합니다.';
  if(season.ranked)return '이미 세계 순위별 리그에 참가했습니다.';
  if(season.activeMatchId || season.weekSchedule || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status==='pending')return '진행 중인 경기·일정·팀 훈련을 먼저 마치세요.';
  if(world.day<season.startedDay+21 || world.day>Number.MAX_SAFE_INTEGER-14)return '세계 조별 정산과 게임 날짜를 확인하세요.';
  return null;
}
export function enterWorldRanked(world) {
  const issue=worldRankedEntryIssue(world);if(issue)throw new Error(issue);
  world.worldSeason.ranked=createWorldRanked(world.worldSeason,competitionSeed(world),world.day);world.worldSeason.stage='ranked';
}

export { worldGroupProgress as worldRankedProgress,worldGroupStandings as worldRankedStandings,worldGroupOutcome as worldRankedOutcome } from './world-groups.js';

export function validateWorldRanked(value,season,world) {
  if(value===null)return null;
  const fail=()=>{throw new Error('세계 순위별 리그 정보가 올바르지 않습니다.');};
  const outcome=worldGroupOutcome(season);
  if(!value || !outcome?.qualifiedClubIds.includes(world.playerClubId) || !Number.isSafeInteger(value.startedDay)
    || value.startedDay<season.startedDay+21 || value.startedDay>world.day || value.startedDay>Number.MAX_SAFE_INTEGER-14)fail();
  const expected=createWorldRanked(season,competitionSeed(world),value.startedDay);
  if(JSON.stringify(value.groups)!==JSON.stringify(expected.groups) || !Array.isArray(value.fixtures) || value.fixtures.length!==12)fail();
  let pendingRound=null;
  expected.fixtures=expected.fixtures.map((target,i)=>{
    const actual=value.fixtures[i];if(!actual || actual.groupId!==target.groupId || actual.round!==target.round)fail();
    validateDomesticSeries(actual,target,world);
    if(!target.result && pendingRound===null)pendingRound=target.round;
    if(pendingRound!==null && target.round>pendingRound && (target.lineups || target.mapPicks))fail();
    if((target.lineups || target.mapPicks) && world.day<value.startedDay+(target.week-4)*7+6)fail();
    return target;
  });
  if(!Array.isArray(value.tiebreaks) || value.tiebreaks.length>10000)fail();
  let pending=false;
  for(const actual of value.tiebreaks) {
    const target=worldGroupProgress(expected).next;
    if(pending || !target || !actual || ['id','rank','clubIds'].some(key=>JSON.stringify(actual[key])!==JSON.stringify(target[key])) || !Array.isArray(actual.fixtures) || actual.fixtures.length!==target.fixtures.length)fail();
    target.fixtures=target.fixtures.map((fixture,i)=>{
      const data=actual.fixtures[i];if(!data || ['id','kind','week','homeClubId','awayClubId'].some(key=>data[key]!==fixture[key]))fail();
      if(data.result===null)pending=true;return {...fixture,result:data.result===null?null:matchResult(data.result)};
    });expected.tiebreaks.push(target);
  }
  if(expected.tiebreaks.length && world.day<value.startedDay+14)fail();return expected;
}
