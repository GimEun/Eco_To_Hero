import { competitionSeed } from './season-year-context.js';
import { randomUnit } from './random.js';
import { seriesFor,playoffFinalRanks } from './pc-playoffs.js';
import { regularDomesticStandings,pickDomesticMaps,validateDomesticSeries } from './domestic-season.js';
import { tiebreakProgress } from './season-tiebreaks.js';
import { matchResult } from './pc-season.js';
import { bankruptcyIssue } from './bankruptcy.js';
import { validateWorldRanked } from './world-ranked.js';
import { validateWorldFinals,validateWorldFinalsSchedule } from './world-finals.js';
import { nextPlayoffSeries,playoffsComplete } from './pc-playoffs.js';

export function worldQualification(world) {
  const ranks=playoffFinalRanks(world.nationalSeason?.playoffs),index=ranks?.indexOf(world.playerClubId)??-1;
  return index<0?null:{rank:index+1,qualified:index<2,qualifiedClubIds:ranks.slice(0,2)};
}

function shuffled(ids,seed) {
  const values=[...ids],random={randomState:seed>>>0};
  for(let i=values.length-1;i>0;i--){const j=Math.floor(randomUnit(random)*(i+1));[values[i],values[j]]=[values[j],values[i]];}
  return values;
}

export function createWorldGroups(world,startedDay=world.day) {
  const promoted=worldQualification(world)?.qualifiedClubIds;
  if(!promoted)throw new Error('전국 최종 순위를 먼저 확정하세요.');
  const pool=world.clubs.filter(club=>club.leagueId==='world').map(club=>club.id).sort();
  const clubIds=[...promoted,...shuffled(pool,competitionSeed(world)^0x574f524c).slice(0,14)];
  const draw=shuffled(clubIds,competitionSeed(world)^0x47524f55);
  const groups=Array.from({length:4},(_,i)=>({id:String.fromCharCode(65+i),clubIds:draw.slice(i*4,i*4+4)}));
  const fixtures=[];
  for(const group of groups) {
    const ring=[...group.clubIds];
    for(let week=1;week<=3;week++) {
      for(let i=0;i<2;i++) {
        const pair=[ring[i],ring[3-i]];if((week+i)%2===0)pair.reverse();
        fixtures.push({...seriesFor(competitionSeed(world),`world-1-g${group.id}-w${week}-m${i+1}`,...pair),kind:'world',week,groupId:group.id,mapPicks:null});
      }
      ring.splice(1,0,ring.pop());
    }
  }
  fixtures.sort((a,b)=>a.week-b.week || a.id.localeCompare(b.id));
  return {id:'world-1',leagueId:'world',number:1,stage:'groups',startedDay,clubIds,groups,fixtures,tiebreaks:[],ranked:null,playoffs:null,activeMatchId:null,weekSchedule:null};
}

export function worldEntryIssue(world) {
  if(bankruptcyIssue(world))return bankruptcyIssue(world);
  if(world.worldSeason)return '이미 세계 리그에 참가했습니다.';
  if(!world.nationalSeason?.playoffs?.settled || !worldQualification(world)?.qualified)return '전국 최종1·2위와 마지막 정산 완료가 필요합니다.';
  if(world.nationalSeason.activeMatchId || world.nationalSeason.weekSchedule || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status==='pending')return '진행 중인 경기·주간 일정·이벤트·팀 훈련을 먼저 마치세요.';
  if(!Number.isSafeInteger(world.day) || world.day>Number.MAX_SAFE_INTEGER-21)return '게임 날짜를 더 진행할 수 없습니다.';
  return null;
}

export function enterWorldGroups(world) {
  const issue=worldEntryIssue(world);if(issue)throw new Error(issue);
  world.worldSeason=createWorldGroups(world);return world.worldSeason;
}

export const worldFixtures=season=>season?[...season.fixtures,...season.tiebreaks.flatMap(round=>round.fixtures),...(season.ranked?.fixtures??[]),...(season.ranked?.tiebreaks.flatMap(round=>round.fixtures)??[]),...(season.playoffs?.series??[])]:[];
export const worldProgress=season=>season.playoffs?{phase:'playoff',complete:playoffsComplete(season.playoffs)}:worldGroupProgress(season.ranked??season);

export function worldGroupStandings(season,groupId) {
  const group=season.groups.find(item=>item.id===groupId);if(!group)throw new Error('세계 리그 조를 확인하세요.');
  const fixtures=season.fixtures.filter(item=>item.groupId===groupId),rows=regularDomesticStandings({clubIds:group.clubIds,fixtures});
  if(fixtures.some(match=>!match.result))return rows;
  const progress=groupProgress(season,group,rows);
  const ranks=new Map(progress.groups.flatMap(part=>part.clubIds.map(id=>[id,{rank:part.rank,tied:part.clubIds.length>1}])));
  return rows.map(row=>({...row,...ranks.get(row.clubId)})).sort((a,b)=>a.rank-b.rank || a.clubId.localeCompare(b.clubId));
}

function groupProgress(season,group,rows=null) {
  const prefix=group.id.startsWith('R')?`world-1-${group.id.toLowerCase()}`:`world-1-g${group.id}`;
  const regular=rows??regularDomesticStandings({clubIds:group.clubIds,fixtures:season.fixtures.filter(item=>item.groupId===group.id)});
  return tiebreakProgress(regular,season.tiebreaks.filter(round=>round.id.startsWith(`${prefix}-t`)),prefix);
}

export function worldGroupProgress(season) {
  if(season.fixtures.some(match=>!match.result))return {phase:'groups',complete:false,next:null,activeRound:null};
  for(const group of season.groups) {
    const progress=groupProgress(season,group);
    if(!progress.complete)return {...progress,phase:'tiebreak',groupId:group.id};
  }
  return {phase:'complete',complete:true,next:null,activeRound:null};
}

export function ensureWorldTiebreakRound(season) {
  season=season.ranked??season;
  const progress=worldGroupProgress(season);if(progress.next)season.tiebreaks.push(progress.next);
}
export function nextWorldTiebreak(season) {
  season=season.ranked??season;
  const progress=worldGroupProgress(season);return (progress.activeRound??progress.next)?.fixtures.find(match=>!match.result)??null;
}
export function recordWorldTiebreak(season,id,score) {
  season=season.ranked??season;
  const next=nextWorldTiebreak(season);if(!next || next.id!==id)throw new Error('진행할 세계 조별 결정전을 확인하세요.');
  const result=matchResult(score);ensureWorldTiebreakRound(season);
  season.tiebreaks.flatMap(round=>round.fixtures).find(match=>match.id===id).result=result;
}

export function nextWorldFixture(world) {
  const season=world.worldSeason;if(!season)return null;
  if(season.playoffs){const next=nextPlayoffSeries(season.playoffs);return next && [next.homeClubId,next.awayClubId].includes(world.playerClubId)?next:null;}
  const fixtures=(season.ranked??season).fixtures;
  const next=fixtures.find(match=>!match.result);
  const fixture=!next?nextWorldTiebreak(season):fixtures.find(match=>match.week===next.week && match.round===next.round && !match.result && [match.homeClubId,match.awayClubId].includes(world.playerClubId));
  return fixture && [fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId)?fixture:null;
}

export function selectWorldMap(world,fixtureId,mapId) {
  const season=world.worldSeason,series=nextWorldFixture(world);
  if(!series || !['world','world-final'].includes(series.kind) || series.id!==fixtureId || season.weekSchedule?.phase!=='match' || season.activeMatchId || world.teamTraining?.status==='pending')throw new Error('주간 준비·팀 훈련 후 세계 경기 맵을 선택하세요.');
  pickDomesticMaps(series,series.homeClubId===world.playerClubId?'home':'away',mapId);
}

export function worldGroupOutcome(season) {
  if(!worldGroupProgress(season).complete)return null;
  const placements=season.groups.map(group=>({groupId:group.id,clubIds:worldGroupStandings(season,group.id).map(row=>row.clubId)}));
  return {placements,firstClubIds:placements.map(group=>group.clubIds[0]),secondClubIds:placements.map(group=>group.clubIds[1]),
    qualifiedClubIds:placements.flatMap(group=>group.clubIds.slice(0,2)),eliminatedClubIds:placements.flatMap(group=>group.clubIds.slice(2))};
}

export function validateWorldGroups(value,world,{legacyRanked=false,legacyFinals=false}={}) {
  if(value===null)return null;
  const fail=()=>{throw new Error('세계 조별리그 정보가 올바르지 않습니다.');};
  if(!value || !world.nationalSeason?.playoffs?.settled || !worldQualification(world)?.qualified
    || world.nationalSeason.activeMatchId || world.nationalSeason.weekSchedule
    || !Number.isSafeInteger(value.startedDay) || value.startedDay<1 || value.startedDay>world.day || value.startedDay>Number.MAX_SAFE_INTEGER-21)fail();
  const expected=createWorldGroups(world,value.startedDay);
  if(['id','leagueId','number','clubIds','groups'].some(key=>JSON.stringify(value[key])!==JSON.stringify(expected[key])) || !Array.isArray(value.fixtures) || value.fixtures.length!==24)fail();
  let pendingWeek=null;
  expected.fixtures=expected.fixtures.map((target,i)=>{
    const actual=value.fixtures[i];if(!actual || actual.groupId!==target.groupId)fail();
    validateDomesticSeries(actual,target,world);
    if(!target.result && pendingWeek===null)pendingWeek=target.week;
    if(pendingWeek!==null && target.week>pendingWeek && (target.lineups || target.mapPicks))fail();return target;
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
  if(expected.tiebreaks.length && world.day<value.startedDay+21)fail();
  expected.ranked=validateWorldRanked(value.ranked===undefined && legacyRanked?null:value.ranked,expected,world);
  expected.playoffs=validateWorldFinals(value.playoffs===undefined && legacyFinals?null:value.playoffs,expected,world);
  expected.stage=expected.playoffs?'finals':expected.ranked?'ranked':'groups';if(value.stage!==expected.stage)fail();
  if(!Object.hasOwn(value,'activeMatchId') || !Object.hasOwn(value,'weekSchedule'))fail();
  expected.activeMatchId=value.activeMatchId;
  const active=value.activeMatchId===null?null:worldFixtures(expected).find(match=>match.id===value.activeMatchId);
  if(value.activeMatchId!==null && (!active || active.result || ['world','world-final'].includes(active.kind) && !active.lineups || ![active.homeClubId,active.awayClubId].includes(world.playerClubId)))fail();
  if(expected.playoffs){validateWorldFinalsSchedule(expected,value,world);if(active && world.officialRecords?.active?.fixtureId!==active.id)fail();return expected;}
  const schedule=value.weekSchedule;
  const current=expected.ranked??expected,currentWeek=current.fixtures.find(match=>!match.result)?.week;
  if(schedule!==null) {
    const fixture=current.fixtures.find(match=>match.id===schedule?.fixtureId);
    if(!fixture || ![fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId) || !['preparing','match','settling'].includes(schedule.phase)
      || typeof schedule.teamTraining!=='boolean' || schedule.startedDay!==current.startedDay+(fixture.week-(expected.ranked?4:1))*7 || schedule.endDay-schedule.startedDay!==7
      || !Number.isSafeInteger(schedule.startedDay) || !Number.isSafeInteger(schedule.endDay) || world.day<schedule.startedDay || world.day>=schedule.endDay
      || (schedule.phase==='settling')!==current.fixtures.filter(match=>match.week===fixture.week).every(match=>match.result)
      || schedule.phase==='preparing' && current.fixtures.some(match=>match.week===fixture.week && (match.lineups || match.mapPicks))
      || active && (active.id!==fixture.id || schedule.phase!=='match'))fail();
    expected.weekSchedule={fixtureId:fixture.id,startedDay:schedule.startedDay,endDay:schedule.endDay,phase:schedule.phase,teamTraining:schedule.teamTraining};
  }else if(active && active.week!==0)fail();
  if(active?.week===0 && (schedule!==null || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status==='pending' || nextWorldTiebreak(expected)?.id!==active.id))fail();
  for(const series of current.fixtures) {
    if(series.lineups && !series.result && series.id!==expected.activeMatchId)fail();
    if((series.lineups || series.mapPicks) && world.day<current.startedDay+(series.week-(expected.ranked?4:1))*7+6)fail();
    if((series.lineups || series.mapPicks) && series.week===currentWeek && schedule===null)fail();
  }
  if(active && world.officialRecords?.active?.fixtureId!==active.id)fail();
  return expected;
}
