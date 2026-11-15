import { nextWorldFixture } from './world-groups.js';
import { randomUnit } from './random.js';
import { MATCH_RULES } from '../config/match.js';
import { tiebreakProgress } from './season-tiebreaks.js';
import { nextPlayoffSeries, validatePcPlayoffs, PLAYOFF_WEEK_ID, playoffsComplete } from './pc-playoffs.js';
import { nextDomesticFixture } from './domestic-season.js';

export const officialSeason = world => world.worldSeason ?? world.nationalSeason ?? world.provinceSeason ?? world.citySeason ?? world.pcSeason;

export function createPcSeason(clubs, seed) {
  const clubIds = clubs.filter(club => club.leagueId === 'pc').map(club => club.id).sort();
  if (clubIds.length !== 8 || new Set(clubIds).size !== 8) throw new Error('PC방 시즌에는 서로 다른 8개 구단이 필요합니다.');
  const random = { randomState: (seed ^ 0x53454153) >>> 0 };
  const ring = [...clubIds];
  for (let index = ring.length - 1; index > 0; index--) {
    const other = Math.floor(randomUnit(random) * (index + 1));
    [ring[index], ring[other]] = [ring[other], ring[index]];
  }
  const fixtures = [];
  for (let week = 1; week <= 7; week++) {
    for (let index = 0; index < 4; index++) {
      const pair = [ring[index], ring[7 - index]];
      if ((week + index) % 2 === 0) pair.reverse();
      fixtures.push({ id: `pc-1-w${week}-m${index + 1}`, week, homeClubId: pair[0], awayClubId: pair[1], result: null });
    }
    ring.splice(1, 0, ring.pop());
  }
  return { id: 'pc-1', leagueId: 'pc', number: 1, clubIds, fixtures, activeMatchId: null, weekSchedule: null, tiebreaks: [], playoffs: null };
}

export function nextOfficialFixture(world) {
  if(world.worldSeason)return nextWorldFixture(world);
  if(world.nationalSeason || world.provinceSeason || world.citySeason)return nextDomesticFixture(world);
  if (world.pcSeason.fixtures.every(fixture => fixture.result)) {
    const fixture = nextTiebreakFixture(world.pcSeason) ?? nextPlayoffSeries(world.pcSeason.playoffs);
    return fixture && [fixture.homeClubId, fixture.awayClubId].includes(world.playerClubId) ? fixture : null;
  }
  const weeks = world.pcSeason.fixtures.filter(fixture => !fixture.result).map(fixture => fixture.week);
  const week = Math.min(...weeks);
  return world.pcSeason.fixtures.find(fixture => fixture.week === week && !fixture.result
    && [fixture.homeClubId, fixture.awayClubId].includes(world.playerClubId)) ?? null;
}

export function findOfficialFixture(season, id) {
  return season.fixtures.find(fixture => fixture.id === id)
    ?? season.tiebreaks?.flatMap(round => round.fixtures).find(fixture => fixture.id === id)
    ?? season.ranked?.fixtures.find(fixture => fixture.id === id)
    ?? season.ranked?.tiebreaks.flatMap(round => round.fixtures).find(fixture => fixture.id === id)
    ?? season.playoffs?.series.find(fixture => fixture.id === id);
}

export function seasonProgress(season) {
  if (season.fixtures.some(fixture => !fixture.result)) return { phase: 'regular', complete: false, activeRound: null, next: null };
  const progress = tiebreakProgress(regularPcStandings(season), season.tiebreaks ?? []);
  return { ...progress, phase: progress.complete ? 'complete' : 'tiebreak' };
}

export function ensureTiebreakRound(season) {
  const progress = seasonProgress(season);
  if (progress.next) { season.tiebreaks.push(progress.next); return true; }
  return false;
}

export function nextTiebreakFixture(season) {
  const progress = seasonProgress(season);
  return (progress.activeRound ?? progress.next)?.fixtures.find(fixture => !fixture.result) ?? null;
}

export function matchResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('정규 시즌 경기 결과가 올바르지 않습니다.');
  const { homeScore, awayScore } = value;
  if (![homeScore, awayScore].every(score => Number.isSafeInteger(score) && score >= 0)) throw new Error('정규 시즌 라운드 점수가 올바르지 않습니다.');
  const won = Math.max(homeScore, awayScore), lost = Math.min(homeScore, awayScore);
  const rules = MATCH_RULES;
  const regulation = won === rules.regulationTarget && lost < rules.regulationHalf;
  const firstOvertimeWin = rules.regulationHalf + rules.overtimeTarget;
  const overtime = won >= firstOvertimeWin && (won - firstOvertimeWin) % rules.overtimeHalf === 0
    && lost >= won - rules.overtimeTarget && lost <= won - 2;
  if (!regulation && !overtime) throw new Error('MR12·연장 규칙으로 종료된 경기 결과가 필요합니다.');
  if (value.forfeit !== undefined && (value.forfeit !== true || won !== 13 || lost !== 0)) throw new Error('기권 점수는 0:13이어야 합니다.');
  return { homeScore, awayScore, ...(value.forfeit ? { forfeit: true } : {}) };
}

export function validatePcSeason(value, clubs, { legacyActive = false, legacyWeekSchedule = false, legacyTiebreaks = false, legacyPlayoffs = false, seed = 0 } = {}) {
  const clubIds = clubs.filter(club => club.leagueId === 'pc').map(club => club.id).sort();
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.id !== 'pc-1'
    || value.leagueId !== 'pc' || value.number !== 1 || !Array.isArray(value.clubIds)
    || value.clubIds.length !== 8 || new Set(value.clubIds).size !== 8
    || value.clubIds.some(id => !clubIds.includes(id)) || !Array.isArray(value.fixtures)
    || value.fixtures.length !== 28) throw new Error('PC방 정규 시즌 정보가 올바르지 않습니다.');
  const ids = new Set(), pairs = new Set(), weeklyTeams = new Set();
  const fixtures = value.fixtures.map(fixture => {
    if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)
      || !Number.isInteger(fixture.week) || fixture.week < 1 || fixture.week > 7
      || !new RegExp(`^pc-1-w${fixture.week}-m[1-4]$`).test(fixture.id)
      || ids.has(fixture.id) || !clubIds.includes(fixture.homeClubId) || !clubIds.includes(fixture.awayClubId)
      || fixture.homeClubId === fixture.awayClubId) throw new Error('정규 시즌 대진이 올바르지 않습니다.');
    ids.add(fixture.id);
    const pair = JSON.stringify([fixture.homeClubId, fixture.awayClubId].sort());
    const weeklyKeys = [fixture.homeClubId, fixture.awayClubId].map(id => `${fixture.week}:${id}`);
    if (pairs.has(pair) || weeklyKeys.some(key => weeklyTeams.has(key))) throw new Error('정규 시즌에 중복 대진 또는 같은 주 중복 출전이 있습니다.');
    pairs.add(pair);
    for (const key of weeklyKeys) weeklyTeams.add(key);
    return { id: fixture.id, week: fixture.week, homeClubId: fixture.homeClubId, awayClubId: fixture.awayClubId,
      result: fixture.result === null ? null : matchResult(fixture.result) };
  });
  const activeMatchId = legacyActive && value.activeMatchId === undefined ? null : value.activeMatchId;
  let weekSchedule = legacyWeekSchedule && value.weekSchedule === undefined ? null : value.weekSchedule;
  if (weekSchedule !== null && weekSchedule?.fixtureId !== PLAYOFF_WEEK_ID) {
    const s = weekSchedule;
    const fixture = fixtures.find(item => item.id === s?.fixtureId);
    if (!s || typeof s !== 'object' || Array.isArray(s) || !fixture
      || !Number.isSafeInteger(s.startedDay) || s.startedDay < 1 || !Number.isSafeInteger(s.endDay)
      || s.endDay - s.startedDay !== 7 || typeof s.teamTraining !== 'boolean'
      || !['preparing', 'match', 'settling'].includes(s.phase)
      || Boolean(fixture.result) !== (s.phase === 'settling')
      || s.phase === 'settling' && fixtures.some(item => item.week === fixture.week && !item.result)
      || activeMatchId && (activeMatchId !== s.fixtureId || s.phase !== 'match')) throw new Error('주간 공식 경기 일정이 올바르지 않습니다.');
    weekSchedule = { fixtureId: s.fixtureId, startedDay: s.startedDay, endDay: s.endDay, phase: s.phase, teamTraining: s.teamTraining };
  }
  const season = { id: 'pc-1', leagueId: 'pc', number: 1, clubIds: [...value.clubIds], fixtures, activeMatchId, weekSchedule, tiebreaks: [], playoffs: null };
  const rounds = legacyTiebreaks && value.tiebreaks === undefined ? [] : value.tiebreaks;
  if (!Array.isArray(rounds)) throw new Error('순위 결정전 기록이 올바르지 않습니다.');
  for (const round of rounds) {
    const expected = seasonProgress(season).next;
    if (!expected || !round || round.id !== expected.id || round.rank !== expected.rank
      || JSON.stringify(round.clubIds) !== JSON.stringify(expected.clubIds)
      || !Array.isArray(round.fixtures) || round.fixtures.length !== expected.fixtures.length) throw new Error('동률 그룹과 순위 결정전 대진이 일치하지 않습니다.');
    let pending = false;
    const matches = expected.fixtures.map((fixture, index) => {
      const actual = round.fixtures[index];
      if (!actual || ['id', 'week', 'homeClubId', 'awayClubId'].some(key => actual[key] !== fixture[key])
        || pending && actual.result !== null) throw new Error('순위 결정전 경기 순서 또는 참가 구단이 올바르지 않습니다.');
      if (actual.result === null) pending = true;
      return { ...fixture, result: actual.result === null ? null : matchResult(actual.result) };
    });
    season.tiebreaks.push({ ...expected, fixtures: matches });
  }
  ensureTiebreakRound(season);
  const playoffValue = legacyPlayoffs && value.playoffs === undefined ? null : value.playoffs;
  if (playoffValue !== null) {
    if (!seasonProgress(season).complete) throw new Error('정규 순위 확정 후 플레이오프를 진행하세요.');
    season.playoffs = validatePcPlayoffs(playoffValue, seed, pcSeasonStandings(season).map(row => row.clubId));
  }
  if (weekSchedule?.fixtureId === PLAYOFF_WEEK_ID) {
    const s = weekSchedule;
    if (!season.playoffs || season.playoffs.settled || !Number.isSafeInteger(s.startedDay) || s.startedDay < 1
      || !Number.isSafeInteger(s.endDay) || s.endDay - s.startedDay !== 7 || typeof s.teamTraining !== 'boolean'
      || !['preparing', 'match', 'settling'].includes(s.phase)
      || playoffsComplete(season.playoffs) !== (s.phase === 'settling')
      || s.phase === 'preparing' && season.playoffs.series.some(series => series.lineups !== null)
      || activeMatchId && (nextPlayoffSeries(season.playoffs)?.id !== activeMatchId || s.phase !== 'match')) throw new Error('플레이오프 주간 일정이 올바르지 않습니다.');
    season.weekSchedule = { fixtureId: PLAYOFF_WEEK_ID, startedDay: s.startedDay, endDay: s.endDay, phase: s.phase, teamTraining: s.teamTraining };
  } else if (season.playoffs?.series.some(series => series.lineups !== null) && !season.playoffs.settled) {
    throw new Error('플레이오프 진행 주간이 없습니다.');
  }
  if (activeMatchId !== null) {
    const active = findOfficialFixture(season, activeMatchId);
    if (!active || active.result || active.week === 0 && active.id !== nextTiebreakFixture(season)?.id
      || active.kind === 'playoff' && (!active.lineups || nextPlayoffSeries(season.playoffs)?.id !== active.id)) throw new Error('진행 중인 공식 경기 정보가 올바르지 않습니다.');
  }
  const pendingSeries = nextPlayoffSeries(season.playoffs);
  if (pendingSeries?.lineups && activeMatchId !== pendingSeries.id) throw new Error('진행 중인 BO3의 경기 ID가 없습니다.');
  pcSeasonStandings(season);
  return season;
}

// 공식 경기 연결 단계에서 종료된 경기 점수만 넘긴다. 이 함수는 경기를 실행하지 않는다.
export function recordPcMatch(season, fixtureId, scores) {
  const fixture = findOfficialFixture(season, fixtureId);
  if (!fixture) return { ok: false, applied: false, message: '정규 시즌 경기 일정을 찾을 수 없습니다.' };
  if (fixture.kind === 'playoff') return { ok: false, applied: false, message: 'BO3 시리즈는 완료 맵 결과로 처리하세요.' };
  let result;
  try { result = matchResult(scores); }
  catch (error) { return { ok: false, applied: false, message: error.message }; }
  if (fixture.result) {
    const same = fixture.result.homeScore === result.homeScore && fixture.result.awayScore === result.awayScore && Boolean(fixture.result.forfeit) === Boolean(result.forfeit);
    return { ok: same, applied: false, message: same ? '이미 반영한 경기 결과입니다.' : '확정된 경기 결과를 변경할 수 없습니다.' };
  }
  if (fixture.week === 0 && nextTiebreakFixture(season)?.id !== fixture.id) return { ok: false, applied: false, message: '앞선 순위 결정전을 먼저 마치세요.' };
  try {
    pcSeasonStandings({ ...season, fixtures: season.fixtures.map(item => item === fixture ? { ...item, result } : item) });
  } catch (error) { return { ok: false, applied: false, message: error.message }; }
  fixture.result = result;
  ensureTiebreakRound(season);
  return { ok: true, applied: true, message: '정규 시즌 경기 결과를 반영했습니다.' };
}

function regularPcStandings(season) {
  const rows = new Map(season.clubIds.map(clubId => [clubId, { clubId, played: 0, wins: 0, losses: 0, roundsFor: 0, roundsAgainst: 0 }]));
  for (const fixture of season.fixtures) {
    if (!fixture.result) continue;
    const { homeScore, awayScore } = fixture.result;
    for (const [id, score, against] of [[fixture.homeClubId, homeScore, awayScore], [fixture.awayClubId, awayScore, homeScore]]) {
      const row = rows.get(id);
      row.played++;
      row.wins += Number(score > against);
      row.losses += Number(score < against);
      row.roundsFor += score;
      row.roundsAgainst += against;
      if (!Number.isSafeInteger(row.roundsFor) || !Number.isSafeInteger(row.roundsAgainst)) throw new Error('정규 시즌 라운드 합계가 저장 가능한 범위를 넘습니다.');
    }
  }
  const ordered = [...rows.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.clubId.localeCompare(b.clubId));
  const started = season.fixtures.some(fixture => fixture.result);
  const finished = season.fixtures.every(fixture => fixture.result);
  return ordered.map(row => {
    const first = ordered.findIndex(other => other.wins === row.wins && other.losses === row.losses);
    const tied = ordered.filter(other => other.wins === row.wins && other.losses === row.losses).length > 1;
    return { ...row, roundDifference: row.roundsFor - row.roundsAgainst,
      rank: started ? first + 1 : null, tied: started && tied, needsTiebreak: finished && tied };
  });
}

export function pcSeasonStandings(season) {
  const rows = regularPcStandings(season);
  if (season.fixtures.some(fixture => !fixture.result)) return rows;
  const { groups } = tiebreakProgress(rows, season.tiebreaks ?? []);
  return rows.map(row => {
    const group = groups.find(group => group.clubIds.includes(row.clubId));
    return { ...row, rank: group.rank, tied: group.clubIds.length > 1, needsTiebreak: group.clubIds.length > 1 };
  }).sort((a, b) => a.rank - b.rank || a.clubId.localeCompare(b.clubId));
}
