import { competitionSeed } from './season-year-context.js';
import { appendMatchReport } from './match-reports.js';
import { evaluateCounseling } from './counseling.js';
import {completeSeason} from './season-calendar.js';
import { randomUnit } from './random.js';
import { getClubView } from './world-selectors.js';
import { recordPcMatch, nextOfficialFixture, findOfficialFixture, ensureTiebreakRound, nextTiebreakFixture, seasonProgress, officialSeason } from './pc-season.js';
import { officialWeekStatus } from './weekly-official.js';
import { advanceWeek } from './calendar.js';
import { PRACTICE_MAPS } from '../data/maps/index.js';
import { createPractice, advancePractice } from '../simulation/practice.js';
import { startEconomyRound, nextEconomyRound } from '../simulation/economy.js';
import { officialLineups, applyOfficialReceipt } from './official-records.js';
import { recordPlayoffMap, nextPlayoffSeries, playoffsComplete, recordBo3Map } from './pc-playoffs.js';
import { pickDomesticMaps } from './domestic-season.js';
import { domesticProgress,nextDomesticTiebreak,ensureDomesticTiebreakRound,recordDomesticTiebreak,recordDomesticPlayoffMap } from './domestic-finals.js';
import { domesticSeason,domesticRule } from '../config/domestic-leagues.js';
import { worldProgress,nextWorldTiebreak,ensureWorldTiebreakRound,recordWorldTiebreak } from './world-groups.js';
import { recordWorldFinalMap } from './world-finals.js';

export { nextOfficialFixture } from './pc-season.js';

export function officialMatchConfig(world, fixture) {
  if (['playoff','city','province','national','world','world-final'].includes(fixture.kind)) {
    if(['city','province','national','world','world-final'].includes(fixture.kind) && !fixture.mapPicks)throw new Error('BO3 맵 선택을 먼저 마치세요.');
    const item = fixture.maps[fixture.scores.length];
    if (fixture.result || !item) throw new Error('완료된 BO3 시리즈는 다시 실행할 수 없습니다.');
    return { seed: item.seed, map: PRACTICE_MAPS.find(map => map.id === item.mapId), attackTeam: item.attackTeam };
  }
  let seed = competitionSeed(world) >>> 0;
  for (const character of fixture.id) seed = Math.imul(seed ^ character.codePointAt(0), 16777619) >>> 0;
  const random = { randomState: seed };
  return { seed, map: PRACTICE_MAPS[Math.floor(randomUnit(random) * PRACTICE_MAPS.length)],
    attackTeam: randomUnit(random) < 0.5 ? 'home' : 'away' };
}

export function beginOfficialMatch(world, fixtureId) {
  let fixture = nextOfficialFixture(world);
  if (!officialWeekStatus(world).canPlay || !fixture || fixture.id !== fixtureId) throw new Error('주간 행동·팀 훈련을 먼저 마친 뒤 공식 경기를 시작하세요.');
  if(world.worldSeason && fixture.week===0)ensureWorldTiebreakRound(world.worldSeason);
  else if(domesticSeason(world) && fixture.week===0)ensureDomesticTiebreakRound(domesticSeason(world));
  fixture=nextOfficialFixture(world);
  // 선수 상태의 오류도 저장 전에 확인한다. 중간 경기 상태는 world에 넣지 않는다.
  const config = createOfficialPractice(world, fixture);
  createPractice(config.map, config.home, config.away, { match: true, seed: config.seed, attackTeam: config.attackTeam, aiTeams: config.aiTeams });
  officialSeason(world).activeMatchId = fixture.id;
  if (['playoff','city','province','national','world','world-final'].includes(fixture.kind)) {
    fixture.lineups ??= officialLineups(world, fixture);
    fixture.awaitingNextMap = false;
  }
  world.officialRecords.active = { fixtureId: fixture.id, lineups: ['playoff','city','province','national','world','world-final'].includes(fixture.kind) ? structuredClone(fixture.lineups) : officialLineups(world, fixture) };
  return fixture;
}

export function createOfficialPractice(world, fixture, playerView = true) {
  const config = officialMatchConfig(world, fixture);
  const homeId = playerView ? world.playerClubId : fixture.homeClubId;
  const awayId = homeId === fixture.homeClubId ? fixture.awayClubId : fixture.homeClubId;
  const attackTeam = homeId === fixture.homeClubId ? config.attackTeam : config.attackTeam === 'home' ? 'away' : 'home';
  const home = getClubView(world, homeId), away = getClubView(world, awayId);
  if (['playoff','city','province','national','world','world-final'].includes(fixture.kind) && fixture.lineups) {
    home.lineupIds = [...fixture.lineups[homeId === fixture.homeClubId ? 'home' : 'away']];
    away.lineupIds = [...fixture.lineups[awayId === fixture.homeClubId ? 'home' : 'away']];
  }
  return { map: config.map, seed: config.seed, attackTeam, tiebreak: fixture.week === 0, home, away,
    ...(fixture.kind==='world-tiebreak'?{leagueLabel:'세계 리그'}:{}),
    ...(['city-tiebreak','province-tiebreak','national-tiebreak'].includes(fixture.kind)?{leagueLabel:domesticRule(fixture.id.split('-')[0]).name}:{}),
    ...(['playoff','city','province','national','world','world-final'].includes(fixture.kind) ? { series: true, playoff: fixture.kind==='playoff', leagueLabel: ['city','province','national'].includes(fixture.kind)?domesticRule(fixture.kind).name:'플레이오프', ...(['city','province','national'].includes(fixture.kind) && fixture.week>domesticRule(fixture.kind).weeks?{stageLabel:'플레이오프'}:{}), seriesId: fixture.id, mapNumber: fixture.scores.length + 1,
      seriesScore: { home: fixture.scores.filter(score => (homeId === fixture.homeClubId) === (score.homeScore > score.awayScore)).length,
        away: fixture.scores.filter(score => (homeId === fixture.homeClubId) !== (score.homeScore > score.awayScore)).length }, pausesRemaining: fixture.pausesRemaining } : {}),
    ...(fixture.kind==='world'?{leagueLabel:'세계 리그',stageLabel:fixture.groupId.startsWith('R')?`조 ${fixture.groupId.slice(1)}위 순위별 리그`:`${fixture.groupId}조 조별리그`}:{}),
    ...(fixture.kind==='world-final'?{leagueLabel:'세계 리그',stageLabel:fixture.id.endsWith('-final')?'결승':'준결승',seriesLength:5}:{}),
    aiTeams: playerView ? ['away'] : ['home', 'away'] };
}

async function simulateFixture(world, fixture, yieldWork) {
  const config = createOfficialPractice(world, fixture, false);
  const state = createPractice(config.map, config.home, config.away, { match: true, seed: config.seed,
    attackTeam: config.attackTeam, aiTeams: config.aiTeams, defensePlans: { home: 'standard', away: 'standard' },
    attackPlans: { home: 'execute', away: 'execute' } });
  while (!state.match.complete) {
    startEconomyRound(state, { autoHome: true });
    while (!state.complete) {
      advancePractice(state, config.map, 5000);
      await yieldWork();
    }
    if (!state.match.complete && !nextEconomyRound(state, config.map)) throw new Error('AI 공식 경기의 다음 라운드로 이동하지 못했습니다.');
  }
  return { homeScore: state.match.score.home, awayScore: state.match.score.away };
}

// 복제본에서 한 주 전체를 처리한다. 저장 성공 전 원본에는 일부 결과를 적용하지 않는다.
async function finishOfficialWeekResult(world, { score = null, forfeit = false, yieldWork = async () => {} } = {}) {
  const season=officialSeason(world),fixture = findOfficialFixture(season, season.activeMatchId);
  if (!fixture || fixture.result || ![fixture.homeClubId, fixture.awayClubId].includes(world.playerClubId)) throw new Error('진행 중인 공식 경기를 찾을 수 없습니다.');
  const candidate = structuredClone(world);
  if(fixture.kind==='world-tiebreak') {
    const season=candidate.worldSeason,home=fixture.homeClubId===candidate.playerClubId;
    recordWorldTiebreak(season,fixture.id,forfeit?{homeScore:home?0:13,awayScore:home?13:0,forfeit:true}:{homeScore:home?score?.home:score?.away,awayScore:home?score?.away:score?.home});
    applyOfficialReceipt(candidate,findOfficialFixture(season,fixture.id),candidate.officialRecords.active?.lineups);
    season.activeMatchId=null;candidate.officialRecords.active=null;
    await processAiWorldTiebreaks(candidate,yieldWork);return candidate;
  }
  if(['world','world-final'].includes(fixture.kind))return finishLeagueMap(candidate,fixture.id,score,forfeit,yieldWork);
  if(['city-tiebreak','province-tiebreak','national-tiebreak'].includes(fixture.kind)) {
    const home=fixture.homeClubId===candidate.playerClubId;
    const result=forfeit?{homeScore:home?0:13,awayScore:home?13:0,forfeit:true}:{homeScore:home?score?.home:score?.away,awayScore:home?score?.away:score?.home};
    recordDomesticTiebreak(domesticSeason(candidate),fixture.id,result);
    applyOfficialReceipt(candidate,findOfficialFixture(domesticSeason(candidate),fixture.id),candidate.officialRecords.active?.lineups);
    domesticSeason(candidate).activeMatchId=null;candidate.officialRecords.active=null;
    await processAiDomesticTiebreaks(candidate,yieldWork);
    return candidate;
  }
  if(['city','province','national'].includes(fixture.kind))return finishLeagueMap(candidate,fixture.id,score,forfeit,yieldWork);
  if (fixture.kind === 'playoff') return finishPlayoffMap(candidate, fixture.id, score, forfeit, yieldWork);
  const playerIsHome = fixture.homeClubId === world.playerClubId;
  const playerScore = forfeit ? { home: 0, away: 13 } : score;
  const result = { homeScore: playerIsHome ? playerScore?.home : playerScore?.away,
    awayScore: playerIsHome ? playerScore?.away : playerScore?.home, ...(forfeit ? { forfeit: true } : {}) };
  const recorded = recordPcMatch(candidate.pcSeason, fixture.id, result);
  if (!recorded.ok) throw new Error(recorded.message);
  applyOfficialReceipt(candidate, findOfficialFixture(candidate.pcSeason, fixture.id), candidate.officialRecords.active?.lineups);
  candidate.officialRecords.active = null;
  candidate.pcSeason.activeMatchId = null;
  if (fixture.week === 0) {
    await processAiTiebreakRound(candidate, fixture.id.slice(0, fixture.id.lastIndexOf('-m')), yieldWork);
    return candidate;
  }
  for (const other of candidate.pcSeason.fixtures.filter(item => item.week === fixture.week && !item.result)) {
    const lineups = officialLineups(candidate, other);
    const recordedAi = recordPcMatch(candidate.pcSeason, other.id, await simulateFixture(candidate, other, yieldWork));
    if (!recordedAi.ok) throw new Error(recordedAi.message);
    applyOfficialReceipt(candidate, other, lineups);
  }
  if (candidate.pcSeason.weekSchedule) {
    candidate.pcSeason.weekSchedule.phase = 'settling';
    // 계약 만료 등으로 마지막 하루가 막혀도 경기 결과를 다시 실행하지 않는다.
    advanceWeek(candidate);
  }
  return candidate;
}

async function finishLeagueMap(candidate,fixtureId,score,forfeit,yieldWork) {
  const season=officialSeason(candidate),series=findOfficialFixture(season,fixtureId);
  const playoff=season.leagueId!=='world' && series.week>domesticRule(season).weeks;
  if(series.awaitingNextMap && !forfeit)throw new Error('다음 맵을 시작한 뒤 결과를 저장하세요.');
  const home=series.homeClubId===candidate.playerClubId;
  const result={homeScore:home?score?.home:score?.away,awayScore:home?score?.away:score?.home};
  const options={remaining:score?.pausesRemaining??series.pausesRemaining,forfeitClubId:forfeit?candidate.playerClubId:null};
  if(series.kind==='world-final')recordWorldFinalMap(season,series.id,result,{...options,seed:competitionSeed(candidate)});
  else if(playoff)recordDomesticPlayoffMap(season,series.id,result,{...options,seed:competitionSeed(candidate)});
  else recordBo3Map(series,result,options);
  if(!series.result)return candidate;
  applyOfficialReceipt(candidate,series,series.lineups);
  season.activeMatchId=null;candidate.officialRecords.active=null;
  if(series.kind==='world-final'){await processAiLeaguePlayoffs(candidate,candidate.worldSeason,recordWorldFinalMap,yieldWork);return candidate;}
  if(playoff){await processAiLeaguePlayoffs(candidate,domesticSeason(candidate),recordDomesticPlayoffMap,yieldWork);return candidate;}
  const fixtures=(season.ranked??season).fixtures;
  for(const other of fixtures.filter(item=>item.week===series.week && item.round===series.round && !item.result)) {
    if(!other.mapPicks)pickDomesticMaps(other,'home',other.maps[0].mapId);
    other.lineups=officialLineups(candidate,other);
    while(!other.result)recordBo3Map(other,await simulateFixture(candidate,other,yieldWork),{remaining:other.pausesRemaining});
    applyOfficialReceipt(candidate,other,other.lineups);
  }
  if(season.ranked) {
    const next=nextOfficialFixture(candidate);
    if(next?.week===series.week){season.weekSchedule.fixtureId=next.id;return candidate;}
  }
  season.weekSchedule.phase='settling';advanceWeek(candidate);
  return candidate;
}

async function finishPlayoffMap(candidate, fixtureId, score, forfeit, yieldWork) {
  const series = findOfficialFixture(candidate.pcSeason, fixtureId);
  if (series.awaitingNextMap && !forfeit) throw new Error('다음 맵을 시작한 뒤 결과를 저장하세요.');
  const playerIsHome = series.homeClubId === candidate.playerClubId;
  const oriented = { homeScore: playerIsHome ? score?.home : score?.away, awayScore: playerIsHome ? score?.away : score?.home };
  recordPlayoffMap(candidate.pcSeason.playoffs, series.id, oriented, { seed: competitionSeed(candidate),
    remaining: score?.pausesRemaining ?? series.pausesRemaining, forfeitClubId: forfeit ? candidate.playerClubId : null });
  if (!series.result) return candidate;
  applyOfficialReceipt(candidate, series, series.lineups);
  candidate.pcSeason.activeMatchId = null; candidate.officialRecords.active = null;
  await processAiPlayoffs(candidate, yieldWork);
  return candidate;
}

async function processAiPlayoffs(world, yieldWork) {
  while (!playoffsComplete(world.pcSeason.playoffs)) {
    const series = nextPlayoffSeries(world.pcSeason.playoffs);
    if ([series.homeClubId, series.awayClubId].includes(world.playerClubId)) return;
    series.lineups ??= officialLineups(world, series);
    while (!series.result) {
      const score = await simulateFixture(world, series, yieldWork);
      recordPlayoffMap(world.pcSeason.playoffs, series.id, score, { seed: competitionSeed(world), remaining: series.pausesRemaining });
    }
    applyOfficialReceipt(world, series, series.lineups);
  }
  world.pcSeason.weekSchedule.phase = 'settling';
  advanceWeek(world);
}

export async function advanceAiPlayoffs(world, { yieldWork = async () => {} } = {}) {
  if (officialWeekStatus(world).phase !== 'playoff-ai' || officialSeason(world).activeMatchId) throw new Error('지금 진행할 AI 플레이오프가 없습니다.');
  const candidate = structuredClone(world);
  if(candidate.worldSeason){await processAiLeaguePlayoffs(candidate,candidate.worldSeason,recordWorldFinalMap,yieldWork);return candidate;}
  if(domesticSeason(candidate)){await processAiLeaguePlayoffs(candidate,domesticSeason(candidate),recordDomesticPlayoffMap,yieldWork);return candidate;}
  await processAiPlayoffs(candidate, yieldWork);
  return candidate;
}

async function processAiLeaguePlayoffs(world,season,recordMap,yieldWork) {
  while(!playoffsComplete(season.playoffs)) {
    const series=nextPlayoffSeries(season.playoffs);
    if([series.homeClubId,series.awayClubId].includes(world.playerClubId))return;
    if(!series.mapPicks)pickDomesticMaps(series,'home',series.maps[0].mapId);
    series.lineups??=officialLineups(world,series);
    while(!series.result)recordMap(season,series.id,await simulateFixture(world,series,yieldWork),{seed:competitionSeed(world),remaining:series.pausesRemaining});
    applyOfficialReceipt(world,series,series.lineups);
  }
  season.weekSchedule.phase='settling';advanceWeek(world);
}

async function processAiTiebreakRound(world, roundId, yieldWork) {
  while (true) {
    ensureTiebreakRound(world.pcSeason);
    const fixture = nextTiebreakFixture(world.pcSeason);
    if (!fixture || !fixture.id.startsWith(`${roundId}-m`) || [fixture.homeClubId, fixture.awayClubId].includes(world.playerClubId)) return;
    const lineups = officialLineups(world, fixture);
    const recorded = recordPcMatch(world.pcSeason, fixture.id, await simulateFixture(world, fixture, yieldWork));
    if (!recorded.ok) throw new Error(recorded.message);
    applyOfficialReceipt(world, fixture, lineups);
  }
}

async function advanceAiTiebreaksResult(world, { yieldWork = async () => {} } = {}) {
  if (officialWeekStatus(world).phase !== 'tiebreak-ai' || officialSeason(world).activeMatchId) throw new Error('지금 진행할 AI 순위 결정전이 없습니다.');
  const candidate = structuredClone(world);
  if(candidate.worldSeason){await processAiWorldTiebreaks(candidate,yieldWork);return candidate;}
  if(domesticSeason(candidate)){await processAiDomesticTiebreaks(candidate,yieldWork);return candidate;}
  ensureTiebreakRound(candidate.pcSeason);
  await processAiTiebreakRound(candidate, seasonProgress(candidate.pcSeason).activeRound.id, yieldWork);
  return candidate;
}

async function processAiWorldTiebreaks(world,yieldWork) {
  const season=world.worldSeason;
  ensureWorldTiebreakRound(season);const round=worldProgress(season).activeRound;
  if(!round)return;
  while(true) {
    const fixture=nextWorldTiebreak(season);
    if(!fixture || !round.fixtures.some(match=>match.id===fixture.id) || [fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId))return;
    const lineups=officialLineups(world,fixture);
    recordWorldTiebreak(season,fixture.id,await simulateFixture(world,fixture,yieldWork));
    applyOfficialReceipt(world,findOfficialFixture(season,fixture.id),lineups);
  }
}

async function processAiDomesticTiebreaks(world,yieldWork) {
  const season=domesticSeason(world);
  ensureDomesticTiebreakRound(season);
  const round=domesticProgress(season).activeRound;
  if(!round)return;
  while(true) {
    const fixture=nextDomesticTiebreak(season);
    if(!fixture || !round.fixtures.some(match=>match.id===fixture.id) || [fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId))return;
    const lineups=officialLineups(world,fixture);
    recordDomesticTiebreak(season,fixture.id,await simulateFixture(world,fixture,yieldWork));
    applyOfficialReceipt(world,findOfficialFixture(season,fixture.id),lineups);
  }
}

export async function finishOfficialWeek(world,options={}) {
  const active=findOfficialFixture(officialSeason(world),officialSeason(world).activeMatchId);
  const mapNumber=(active?.scores?.length??0)+1, day=world.day;
  const result=await finishOfficialWeekResult(world,options);
  if(active && !options.forfeit && options.score?.report) appendMatchReport(result,active.id,mapNumber,day,options.score.report);
  if(active && !options.forfeit && options.score?.report && findOfficialFixture(officialSeason(result),active.id)?.result) evaluateCounseling(result,active.id);
  completeSeason(result);return result;
}
export async function advanceAiTiebreaks(world,options) {const result=await advanceAiTiebreaksResult(world,options);completeSeason(result);return result;}
