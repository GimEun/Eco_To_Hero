import { randomUnit } from './random.js';
import { PRACTICE_MAPS } from '../data/maps/index.js';
import { matchResult } from './pc-season.js';

export const PLAYOFF_WEEK_ID = 'pc-1-playoffs';
export const isPlayoffWeek = season => season.weekSchedule?.fixtureId === PLAYOFF_WEEK_ID;
export const nextPlayoffSeries = playoffs => playoffs?.series.find(series => !series.result) ?? null;
export const playoffsComplete = playoffs => Boolean(playoffs?.series.length === 3 && playoffs.series[2].result);
const winnerId = series => series.result.homeScore > series.result.awayScore ? series.homeClubId : series.awayClubId;

export function seriesFor(seed, id, homeClubId, awayClubId) {
  let value = seed >>> 0;
  for (const letter of id) value = Math.imul(value ^ letter.codePointAt(0), 16777619) >>> 0;
  const random = { randomState: value }, maps = PRACTICE_MAPS.map(map => map.id);
  for (let i = maps.length - 1; i > 0; i--) { const j = Math.floor(randomUnit(random) * (i + 1)); [maps[i], maps[j]] = [maps[j], maps[i]]; }
  return { id, kind: 'playoff', week: 8, homeClubId, awayClubId,
    maps: maps.map(mapId => ({ mapId, seed: Math.floor(randomUnit(random) * 0x100000000), attackTeam: randomUnit(random) < .5 ? 'home' : 'away' })),
    scores: [], lineups: null, pausesRemaining: 3, awaitingNextMap: false, result: null };
}

export function createPcPlayoffs(seed, rankedClubs, seasonId='pc-1') {
  const random = { randomState: (seed ^ 0x504c4159) >>> 0 }, paired = rankedClubs.slice(0, 4);
  for (let i = paired.length - 1; i > 0; i--) { const j = Math.floor(randomUnit(random) * (i + 1)); [paired[i], paired[j]] = [paired[j], paired[i]]; }
  return { rankedClubs: [...rankedClubs], settled: false, series: [
    seriesFor(seed, `${seasonId}-p-s1`, paired[0], paired[1]), seriesFor(seed, `${seasonId}-p-s2`, paired[2], paired[3]),
  ] };
}

export function recordPlayoffMap(playoffs, seriesId, score, { remaining = 3, forfeitClubId = null, seed, seasonId='pc-1', winsNeeded=2 } = {}) {
  const series = nextPlayoffSeries(playoffs);
  if (!series || series.id !== seriesId || !series.lineups) throw new Error('진행 가능한 BO3 시리즈를 확인하세요.');
  recordBo3Map(series, score, { remaining, forfeitClubId, winsNeeded });
  if (playoffs.series.length === 2 && playoffs.series.every(item => item.result)) {
    const next=seriesFor(seed, `${seasonId}-p-final`, winnerId(playoffs.series[0]), winnerId(playoffs.series[1]));
    playoffs.series.push('mapPicks' in series?{...next,kind:series.kind,week:series.week,mapPicks:null}:next);
  }
  return series;
}

export function recordBo3Map(series, score, { remaining = 3, forfeitClubId = null, winsNeeded = 2 } = {}) {
  if (![2,3].includes(winsNeeded)) throw new Error('시리즈 선승 기준을 확인하세요.');
  if (series.result || !series.lineups) throw new Error('진행 가능한 BO3 시리즈를 확인하세요.');
  if (!Number.isInteger(remaining) || remaining < 0 || remaining > series.pausesRemaining) throw new Error('BO3 퍼즈 잔여 횟수가 올바르지 않습니다.');
  if (forfeitClubId && ![series.homeClubId, series.awayClubId].includes(forfeitClubId)) throw new Error('기권 구단을 확인하세요.');
  const count = () => ({ homeScore: series.scores.filter(item => item.homeScore > item.awayScore).length,
    awayScore: series.scores.filter(item => item.awayScore > item.homeScore).length });
  if (forfeitClubId) {
    const homeForfeit = series.homeClubId === forfeitClubId;
    while (Math.max(count().homeScore, count().awayScore) < winsNeeded) series.scores.push({ homeScore: homeForfeit ? 0 : 13, awayScore: homeForfeit ? 13 : 0, forfeit: true });
  } else series.scores.push(matchResult(score));
  series.pausesRemaining = remaining;
  const result = count();
  series.result = Math.max(result.homeScore, result.awayScore) === winsNeeded ? { ...result, ...(forfeitClubId ? { forfeit: true } : {}) } : null;
  series.awaitingNextMap = !series.result;
  return series;
}

// PC방과 시 리그가 같은 완료 맵·퍼즈·기권 검증을 사용한다.
export function validateBo3Series(actual, target, {winsNeeded=2}={}) {
  const fail = () => { throw new Error('BO3 경기 기록이 올바르지 않습니다.'); };
  if (!actual || ['id','kind','week','homeClubId','awayClubId','maps'].some(key => JSON.stringify(actual[key]) !== JSON.stringify(target[key]))
    || !Array.isArray(actual.scores) || actual.scores.length > winsNeeded*2-1 || !Number.isInteger(actual.pausesRemaining)
    || actual.pausesRemaining < 0 || actual.pausesRemaining > 3 || typeof actual.awaitingNextMap !== 'boolean') fail();
  if (actual.lineups !== null) {
    if (!actual.lineups || !['home','away'].every(side => Array.isArray(actual.lineups[side]) && actual.lineups[side].length === 5
      && actual.lineups[side].every(id => typeof id === 'string')) || new Set([...actual.lineups.home,...actual.lineups.away]).size !== 10) fail();
    target.lineups=structuredClone(actual.lineups);
  } else if (actual.scores.length || actual.pausesRemaining!==3 || actual.awaitingNextMap || actual.result!==null) fail();
  let forfeit=false;
  for (const score of actual.scores) {
    if (target.result) fail();
    const checked=matchResult(score);
    if (score.forfeit) forfeit=true; else if(forfeit) fail();
    target.scores.push(checked);
    const homeScore=target.scores.filter(item=>item.homeScore>item.awayScore).length,awayScore=target.scores.length-homeScore;
    if(Math.max(homeScore,awayScore)===winsNeeded) target.result={homeScore,awayScore,...(forfeit?{forfeit:true}:{})};
  }
  if(forfeit && (!target.result || actual.scores.filter(score=>score.forfeit).some(score=>(score.homeScore>score.awayScore)!==(target.result.homeScore>target.result.awayScore)))) fail();
  if(JSON.stringify(actual.result)!==JSON.stringify(target.result) || actual.awaitingNextMap && (actual.result || !actual.scores.length)) fail();
  target.pausesRemaining=actual.pausesRemaining;target.awaitingNextMap=actual.awaitingNextMap;
  return target;
}

export function playoffFinalRanks(playoffs) {
  if (!playoffsComplete(playoffs)) return null;
  const final = playoffs.series[2], champion = winnerId(final);
  const runnerUp = final.homeClubId === champion ? final.awayClubId : final.homeClubId;
  const semifinalLosers = playoffs.series.slice(0, 2).map(series => series.homeClubId === winnerId(series) ? series.awayClubId : series.homeClubId)
    .sort((a, b) => playoffs.rankedClubs.indexOf(a) - playoffs.rankedClubs.indexOf(b));
  return [champion, runnerUp, ...semifinalLosers, ...playoffs.rankedClubs.slice(4)];
}

// 저장된 최종 순위가 유일한 판정 근거다. 정규 순위·진행 중 대진으로 확정하지 않는다.
export function pcQualification(playoffs, clubId) {
  const ranks = playoffFinalRanks(playoffs);
  const index = ranks?.indexOf(clubId) ?? -1;
  if (index < 0) return null;
  return { rank: index + 1, qualified: index < 2, nextLeagueId: index < 2 ? 'city' : null,
    qualifiedClubIds: ranks.slice(0, 2), eliminatedClubIds: ranks.slice(2) };
}

export function validatePcPlayoffs(value, seed, rankedClubs) {
  const fail = () => { throw new Error('PC방 플레이오프 기록이 올바르지 않습니다.'); };
  if (!value || JSON.stringify(value.rankedClubs) !== JSON.stringify(rankedClubs)
    || typeof value.settled !== 'boolean' || !Array.isArray(value.series) || ![2, 3].includes(value.series.length)) fail();
  const expected = createPcPlayoffs(seed, rankedClubs);
  let unfinished = false;
  for (let i = 0; i < value.series.length; i++) {
    const actual = value.series[i], target = expected.series[i];
    if (!target || !actual || unfinished && actual.lineups !== null) fail();
    validateBo3Series(actual,target);
    if (!actual.result) unfinished = true;
    if (i === 1 && expected.series.every(series => series.result)) expected.series.push(seriesFor(seed, 'pc-1-p-final', winnerId(expected.series[0]), winnerId(expected.series[1])));
  }
  if (expected.series.length !== value.series.length || value.settled && !playoffsComplete(expected)) fail();
  expected.settled = value.settled;
  return expected;
}
