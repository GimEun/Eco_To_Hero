import { competitionSeed } from './season-year-context.js';
import { tiebreakProgress } from './season-tiebreaks.js';
import { regularDomesticStandings, validateDomesticSeries } from './domestic-season.js';
import { createPcPlayoffs, seriesFor, playoffsComplete, recordPlayoffMap } from './pc-playoffs.js';
import { matchResult } from './pc-season.js';
import { domesticRule } from '../config/domestic-leagues.js';

export const domesticFixtures=season=>season?[...season.fixtures,...(season.tiebreaks??[]).flatMap(round=>round.fixtures),...(season.playoffs?.series??[])]:[];

export function domesticProgress(season) {
  if(season.fixtures.some(match=>!match.result))return {phase:'regular',complete:false,next:null,activeRound:null};
  const rule=domesticRule(season);
  if(!rule.finals)return {phase:'complete',complete:true,next:null,activeRound:null};
  const progress=tiebreakProgress(regularDomesticStandings(season),season.tiebreaks??[],rule.id);
  return {...progress,phase:progress.complete?'complete':'tiebreak'};
}

export function ensureDomesticTiebreakRound(season) {
  const progress=domesticProgress(season);
  if(progress.next)season.tiebreaks.push(progress.next);
}

export function nextDomesticTiebreak(season) {
  const progress=domesticProgress(season);
  return (progress.activeRound??progress.next)?.fixtures.find(match=>!match.result)??null;
}

export function recordDomesticTiebreak(season,id,score) {
  const next=nextDomesticTiebreak(season);
  if(!next || next.id!==id)throw new Error('진행할 리그 결정전을 확인하세요.');
  const result=matchResult(score);
  ensureDomesticTiebreakRound(season);
  season.tiebreaks.flatMap(round=>round.fixtures).find(match=>match.id===id).result=result;
}

const asDomestic=(series,rule)=>({...series,kind:rule.leagueId,week:rule.weeks+1,mapPicks:null});
export function createDomesticPlayoffs(seed,ranks,leagueId='city') {
  const rule=domesticRule(leagueId);
  if(!rule.finals)throw new Error('해당 리그 플레이오프는 후속 단계입니다.');
  const playoffs=createPcPlayoffs(seed,ranks,rule.id);
  playoffs.series=playoffs.series.map(series=>asDomestic(series,rule));
  return playoffs;
}

export function recordDomesticPlayoffMap(season,id,score,options) {
  return recordPlayoffMap(season.playoffs,id,score,{...options,seasonId:domesticRule(season).id});
}

export function validateDomesticFinals(value,expected,world) {
  const rule=domesticRule(expected);
  const fail=()=>{throw new Error(`${rule.name} 결정전·플레이오프 기록이 올바르지 않습니다.`);};
  if(!Array.isArray(value.tiebreaks) || value.tiebreaks.length>10000)fail();
  if(!rule.finals) {
    if(value.tiebreaks.length || value.playoffs!==null)fail();
    expected.tiebreaks=[];expected.playoffs=null;return;
  }
  expected.tiebreaks=[];
  let pending=false;
  for(const actual of value.tiebreaks) {
    const target=domesticProgress(expected).next;
    if(pending || !target || !actual || ['id','rank','clubIds'].some(key=>JSON.stringify(actual[key])!==JSON.stringify(target[key]))
      || !Array.isArray(actual.fixtures) || actual.fixtures.length!==target.fixtures.length)fail();
    target.fixtures=target.fixtures.map((fixture,i)=>{
      const data=actual.fixtures[i];
      if(!data || ['id','kind','week','homeClubId','awayClubId'].some(key=>data[key]!==fixture[key]))fail();
      if(data.result===null)pending=true;
      return {...fixture,result:data.result===null?null:matchResult(data.result)};
    });
    expected.tiebreaks.push(target);
  }
  if(value.playoffs===null){expected.playoffs=null;return;}
  const progress=domesticProgress(expected),actual=value.playoffs;
  if(!progress.complete || world.day<expected.startedDay+rule.weeks*7 || !actual || typeof actual.settled!=='boolean' || !Array.isArray(actual.series)
    || ![2,3].includes(actual.series.length))fail();
  const ranks=progress.groups.flatMap(group=>group.clubIds),target=createDomesticPlayoffs(competitionSeed(world),ranks,rule.leagueId);
  if(JSON.stringify(actual.rankedClubs)!==JSON.stringify(ranks))fail();
  let unfinished=false;
  for(let i=0;i<actual.series.length;i++) {
    const data=actual.series[i],series=target.series[i];
    if(!series || !data || unfinished && (data.lineups!==null || data.mapPicks!==null))fail();
    validateDomesticSeries(data,series,world);
    if(!data.result)unfinished=true;
    if(i===1 && target.series.every(match=>match.result)) {
      const winner=match=>match.result.homeScore>match.result.awayScore?match.homeClubId:match.awayClubId;
      target.series.push(asDomestic(seriesFor(competitionSeed(world),`${rule.id}-p-final`,winner(target.series[0]),winner(target.series[1])),rule));
    }
  }
  if(target.series.length!==actual.series.length || actual.settled && !playoffsComplete(target))fail();
  target.settled=actual.settled;expected.playoffs=target;
}
