import { competitionSeed } from './season-year-context.js';
import { randomUnit } from './random.js';
import { seriesFor, validateBo3Series,playoffFinalRanks } from './pc-playoffs.js';
import { bankruptcyIssue } from './bankruptcy.js';
import { domesticProgress,nextDomesticTiebreak,domesticFixtures,validateDomesticFinals } from './domestic-finals.js';
import { nextPlayoffSeries,playoffsComplete } from './pc-playoffs.js';
import { domesticRule,domesticSeason,playoffWeekId } from '../config/domestic-leagues.js';

export function domesticQualification(world,leagueId) {
  const rule=domesticRule(leagueId),ranks=playoffFinalRanks(world[rule.previousKey]?.playoffs);
  const index=ranks?.indexOf(world.playerClubId)??-1;
  return index<0?null:{rank:index+1,qualified:index<2,qualifiedClubIds:ranks.slice(0,2)};
}

function domesticClubs(world,rule) {
  const promoted=domesticQualification(world,rule.leagueId)?.qualifiedClubIds;
  if(!promoted) throw new Error('이전 리그 최종 순위를 먼저 확정하세요.');
  const pool=world.clubs.filter(club=>club.leagueId===rule.leagueId).map(club=>club.id).sort();
  const random={randomState:(competitionSeed(world)^rule.shuffleSalt)>>>0};
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(randomUnit(random)*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  return [...promoted,...pool.slice(0,rule.teams-2)];
}

export function createDomesticSeason(world,leagueId,startedDay=world.day) {
  const rule=domesticRule(leagueId),clubIds=domesticClubs(world,rule),ring=[...clubIds],fixtures=[];
  for(let week=1;week<=rule.weeks;week++) {
    for(let i=0;i<rule.teams/2;i++) {
      const pair=[ring[i],ring[rule.teams-1-i]];if((week+i)%2===0)pair.reverse();
      fixtures.push({...seriesFor(competitionSeed(world),`${rule.id}-w${week}-m${i+1}`,...pair),kind:leagueId,week,mapPicks:null});
    }
    ring.splice(1,0,ring.pop());
  }
  return {id:rule.id,leagueId,number:1,startedDay,clubIds,fixtures,activeMatchId:null,weekSchedule:null,tiebreaks:[],playoffs:null};
}

export function domesticEntryIssue(world,leagueId) {
  const rule=domesticRule(leagueId),previous=world[rule.previousKey];
  if(bankruptcyIssue(world))return bankruptcyIssue(world);
  if(world[rule.key])return `이미 ${rule.name}에 참가했습니다.`;
  if(!previous?.playoffs?.settled || !domesticQualification(world,leagueId)?.qualified)return `${rule.previousName} 최종 1·2위와 마지막 주 정산 완료가 필요합니다.`;
  if(previous.activeMatchId || previous.weekSchedule || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status==='pending')return '진행 중인 경기·주간 일정·이벤트·팀 훈련을 먼저 마치세요.';
  if(world.day>Number.MAX_SAFE_INTEGER-rule.weeks*7)return '게임 날짜를 더 진행할 수 없습니다.';
  return null;
}

export function enterDomesticSeason(world,leagueId) {
  const issue=domesticEntryIssue(world,leagueId);if(issue)throw new Error(issue);
  const rule=domesticRule(leagueId);
  world[rule.key]=createDomesticSeason(world,leagueId);
  return world[rule.key];
}

export function nextDomesticFixture(world) {
  const season=domesticSeason(world);if(!season)return null;
  if(season.fixtures.every(item=>item.result)) {
    const fixture=nextDomesticTiebreak(season)??nextPlayoffSeries(season.playoffs);
    return fixture && [fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId)?fixture:null;
  }
  const week=season.fixtures.find(item=>!item.result)?.week;
  return season.fixtures.find(item=>item.week===week && !item.result && [item.homeClubId,item.awayClubId].includes(world.playerClubId))??null;
}

export function pickDomesticMaps(series, side, mapId) {
  if(series.lineups || series.result)throw new Error('시리즈 시작 후에는 맵 순서를 바꿀 수 없습니다.');
  if(!['home','away'].includes(side) || !series.maps.some(map=>map.mapId===mapId))throw new Error('선택할 맵을 확인하세요.');
  // 홈의 선택 맵 → 원정의 선택 맵 → 남은 맵. AI는 시드로 고정된 순서에서 선택한다.
  const other=side==='home'?'away':'home';
  const available=(series.kind==='world-final'?series.maps.slice(0,3):[...series.maps]).sort((a,b)=>a.seed-b.seed || a.mapId.localeCompare(b.mapId));
  series.mapPicks={[side]:mapId,[other]:available.find(map=>map.mapId!==mapId).mapId};
  const order=[series.mapPicks.home,series.mapPicks.away];
  order.push(available.find(map=>!order.includes(map.mapId)).mapId);
  series.maps=order.map(id=>series.maps.find(map=>map.mapId===id));
  if(series.kind==='world-final')series.maps.push(...series.maps.slice(0,2).map(map=>({...map,seed:(map.seed^0x424f354d)>>>0,attackTeam:map.attackTeam==='home'?'away':'home'})));
}

export function selectDomesticMap(world,fixtureId,mapId) {
  const series=nextDomesticFixture(world);
  const season=domesticSeason(world);
  if(!series || series.kind!==season.leagueId || series.id!==fixtureId || season.weekSchedule?.phase!=='match'
    || season.activeMatchId || world.teamTraining?.status==='pending')throw new Error('주간 준비·팀 훈련을 마친 뒤 맵을 선택하세요.');
  pickDomesticMaps(series,series.homeClubId===world.playerClubId?'home':'away',mapId);
}

export function regularDomesticStandings(season) {
  const rows=season.clubIds.map(clubId=>({clubId,played:0,wins:0,losses:0}));
  for(const match of season.fixtures)if(match.result)for(const row of rows) {
    if(![match.homeClubId,match.awayClubId].includes(row.clubId))continue;
    row.played++;const won=(row.clubId===match.homeClubId)===(match.result.homeScore>match.result.awayScore);
    row[won?'wins':'losses']++;
  }
  rows.sort((a,b)=>b.wins-a.wins || a.losses-b.losses || a.clubId.localeCompare(b.clubId));
  return rows.map((row,i)=>({...row,rank:rows.findIndex(other=>other.wins===row.wins && other.losses===row.losses)+1,
    tied:rows.some((other,j)=>i!==j && other.wins===row.wins && other.losses===row.losses)}));
}

export function domesticStandings(season) {
  const rows=regularDomesticStandings(season),progress=domesticProgress(season);
  if(progress.phase==='regular' || !domesticRule(season).finals)return rows;
  const ranks=new Map(progress.groups.flatMap(group=>group.clubIds.map(id=>[id,{rank:group.rank,tied:group.clubIds.length>1}])));
  return rows.map(row=>({...row,...ranks.get(row.clubId)})).sort((a,b)=>a.rank-b.rank || a.clubId.localeCompare(b.clubId));
}

export function validateDomesticSeries(actual,target,world) {
  const fail=()=>{throw new Error('시 리그 BO3 맵 선택이 올바르지 않습니다.');};
  if(actual.mapPicks!==null) {
    const picks=actual.mapPicks;
    if(!picks || typeof picks.home!=='string' || typeof picks.away!=='string' || picks.home===picks.away
      || ![picks.home,picks.away].every(id=>target.maps.some(map=>map.mapId===id)))fail();
    const mine=[target.homeClubId,target.awayClubId].includes(world.playerClubId),side=target.awayClubId===world.playerClubId?'away':'home';
    pickDomesticMaps(target,side,mine?picks[side]:target.maps[0].mapId);
    if(JSON.stringify({home:picks.home,away:picks.away})!==JSON.stringify({home:target.mapPicks.home,away:target.mapPicks.away}))fail();
  }else if(actual.lineups!==null)fail();
  return validateBo3Series(actual,target,{winsNeeded:target.kind==='world-final'?3:2});
}

export function validateDomesticSeason(value,world,leagueId,{legacyFinals=false}={}) {
  if(value===null)return null;
  const rule=domesticRule(leagueId),previous=world[rule.previousKey],days=rule.weeks*7;
  const fail=()=>{throw new Error(`${rule.name} 시즌 정보가 올바르지 않습니다.`);};
  if(!value || !previous?.playoffs?.settled || !domesticQualification(world,leagueId)?.qualified
    || previous.activeMatchId || previous.weekSchedule
    || !Number.isSafeInteger(value.startedDay) || value.startedDay<1 || value.startedDay>world.day
    || value.startedDay>Number.MAX_SAFE_INTEGER-days)fail();
  const expected=createDomesticSeason(world,leagueId,value.startedDay);
  if(['id','leagueId','number','clubIds'].some(key=>JSON.stringify(value[key])!==JSON.stringify(expected[key])) || !Array.isArray(value.fixtures) || value.fixtures.length!==rule.teams*rule.weeks/2)fail();
  let pendingWeek=null;
  expected.fixtures=expected.fixtures.map((target,i)=>{
    const actual=value.fixtures[i];if(!actual)fail();
    validateDomesticSeries(actual,target,world);
    if(!target.result && pendingWeek===null)pendingWeek=target.week;
    if(pendingWeek!==null && target.week>pendingWeek && (target.lineups!==null || target.mapPicks!==null))fail();
    return target;
  });
  validateDomesticFinals({...value,tiebreaks:value.tiebreaks===undefined && legacyFinals?[]:value.tiebreaks,playoffs:value.playoffs===undefined && legacyFinals?null:value.playoffs},expected,world);
  if(!Object.hasOwn(value,'activeMatchId') || !Object.hasOwn(value,'weekSchedule'))fail();
  expected.activeMatchId=value.activeMatchId;expected.weekSchedule=null;
  const active=value.activeMatchId===null?null:domesticFixtures(expected).find(item=>item.id===value.activeMatchId);
  if(value.activeMatchId!==null && (!active || active.result || active.kind===leagueId && !active.lineups || ![active.homeClubId,active.awayClubId].includes(world.playerClubId)))fail();
  const schedule=value.weekSchedule;
  if(schedule!==null) {
    const playoff=schedule?.fixtureId===playoffWeekId(expected);
    const fixture=playoff?null:expected.fixtures.find(item=>item.id===schedule?.fixtureId);
    if(playoff) {
      if(!expected.playoffs || expected.playoffs.settled || !domesticProgress(expected).complete
        || !Number.isSafeInteger(schedule.startedDay) || schedule.startedDay<value.startedDay+days
        || schedule.endDay-schedule.startedDay!==7 || !Number.isSafeInteger(schedule.endDay)
        || typeof schedule.teamTraining!=='boolean' || !['preparing','match','settling'].includes(schedule.phase)
        || world.day<schedule.startedDay || world.day>=schedule.endDay
        || playoffsComplete(expected.playoffs)!==(schedule.phase==='settling')
        || schedule.phase==='preparing' && expected.playoffs.series.some(series=>series.lineups!==null || series.mapPicks!==null)
        || active && (schedule.phase!=='match' || nextPlayoffSeries(expected.playoffs)?.id!==active.id))fail();
    }else {
    if(!fixture || ![fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId)
      || !['preparing','match','settling'].includes(schedule.phase) || typeof schedule.teamTraining!=='boolean'
      || !Number.isSafeInteger(schedule.startedDay) || schedule.startedDay<value.startedDay
      || !Number.isSafeInteger(schedule.endDay) || schedule.endDay-schedule.startedDay!==7
      || schedule.startedDay!==value.startedDay+(fixture.week-1)*7
      || world.day<schedule.startedDay || world.day>=schedule.endDay
      || (schedule.phase==='settling')!==expected.fixtures.filter(item=>item.week===fixture.week).every(item=>item.result)
      || schedule.phase==='preparing' && expected.fixtures.some(item=>item.week===fixture.week && (item.lineups!==null || item.mapPicks!==null))
      || active && (active.id!==fixture.id || schedule.phase!=='match'))fail();
    }
    expected.weekSchedule={fixtureId:schedule.fixtureId,startedDay:schedule.startedDay,endDay:schedule.endDay,phase:schedule.phase,teamTraining:schedule.teamTraining};
  }else if(active && active.week!==0)fail();
  if(active?.week===0 && (schedule!==null || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status==='pending'
    || nextDomesticTiebreak(expected)?.id!==active.id))fail();
  const unsettledWeek=expected.fixtures.find(series=>!series.result)?.week;
  for(const series of expected.fixtures) {
    if(series.lineups && !series.result && series.id!==expected.activeMatchId)fail();
    if((series.lineups || series.mapPicks) && world.day<value.startedDay+(series.week-1)*7+6)fail();
    if(series.result && world.day<value.startedDay+(series.week-1)*7+6)fail();
    if((series.lineups || series.mapPicks) && series.week===unsettledWeek && schedule===null)fail();
  }
  if(expected.tiebreaks.length && world.day<value.startedDay+days)fail();
  if(expected.playoffs) {
    if(!expected.playoffs.settled && expected.playoffs.series.some(series=>series.lineups || series.mapPicks) && schedule?.fixtureId!==playoffWeekId(expected))fail();
    for(const series of expected.playoffs.series) {
      if(series.lineups && !series.result && series.id!==expected.activeMatchId)fail();
      if((series.lineups || series.mapPicks) && world.day<(schedule?.startedDay??value.startedDay+days)+6)fail();
    }
  }
  if(active && (!world.officialRecords?.active || world.officialRecords.active.fixtureId!==active.id))fail();
  return expected;
}
