import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld as createNewWorld } from '../src/game/create-world.js';
// Existing in-season behavior; fresh-game preseason is covered separately.
const createWorld = (...args) => { const world = createNewWorld(...args); world.seasonCalendar = { mode: 'legacy', phase: 'season' }; return world; };

import { recordPcMatch, pcSeasonStandings, seasonProgress, nextTiebreakFixture, findOfficialFixture } from '../src/game/pc-season.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { beginOfficialMatch, nextOfficialFixture, finishOfficialWeek, advanceAiTiebreaks, officialMatchConfig } from '../src/game/official-match.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { seasonScreen } from '../src/ui/season-screen.js';
import { selectWeeklyActions } from '../src/game/training.js';
import { beginTeamTraining } from '../src/game/team-training.js';

function sample(kind = 'three', mineFirst = true) {
  const world = createWorld(createClub('결정전').club, 42);
  const others = world.pcSeason.clubIds.filter(id => id !== world.playerClubId);
  const order = mineFirst ? [world.playerClubId, ...others] : [...others, world.playerClubId];
  for (const fixture of world.pcSeason.fixtures) {
    const [a, b] = [fixture.homeClubId, fixture.awayClubId].map(id => order.indexOf(id));
    const first = Math.min(a, b), last = Math.max(a, b);
    let winner = first;
    if (kind === 'three' && last < 3) winner = (first + 1) % 3 === last ? last : first;
    if (kind === 'two' && first === 0 && last === 3) winner = last;
    if (kind === 'four' && ((first === 0 && [3, 4].includes(last)) || first === 1 && last === 5)) winner = last;
    assert.equal(recordPcMatch(world.pcSeason, fixture.id, { homeScore: winner === a ? 13 : 6, awayScore: winner === b ? 13 : 6 }).ok, true);
  }
  return { world, order };
}

function decide(season, winnerId) {
  const fixture = nextTiebreakFixture(season);
  const result = { homeScore: fixture.homeClubId === winnerId ? 13 : 3, awayScore: fixture.awayClubId === winnerId ? 13 : 3 };
  assert.equal(recordPcMatch(season, fixture.id, result).ok, true);
  return fixture;
}
const rest = ({ pcSeason, officialRecords, ...world }) => world;

test('정규 28경기 동률이 없으면 바로 1~8위를 확정하고 결정전을 만들지 않는다', () => {
  const { world, order } = sample('none');
  assert.equal(seasonProgress(world.pcSeason).complete, true);
  assert.deepEqual(world.pcSeason.tiebreaks, []);
  assert.deepEqual(pcSeasonStandings(world.pcSeason).map(row => row.clubId), order);
  assert.deepEqual(pcSeasonStandings(world.pcSeason).map(row => row.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(nextOfficialFixture(world), null);
  assert.equal(officialWeekStatus(world).phase, 'playoff-unscheduled');
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('서로 다른 2팀 동률 그룹은 각각 단판으로 나누며 정규 승패에 결정전을 합산하지 않는다', () => {
  const { world, order } = sample('two'), season = world.pcSeason;
  const before = pcSeasonStandings(season).map(({ rank, tied, needsTiebreak, ...row }) => row);
  assert.equal(season.tiebreaks[0].clubIds.length, 2); assert.equal(season.tiebreaks[0].rank, 1);
  const first = decide(season, order[1]);
  const snapshot = structuredClone(season);
  assert.equal(recordPcMatch(season, first.id, first.result).applied, false);
  assert.equal(recordPcMatch(season, first.id, { homeScore: first.result.awayScore, awayScore: first.result.homeScore }).ok, false);
  assert.deepEqual(season, snapshot);
  assert.equal(season.tiebreaks[1].rank, 3);
  decide(season, order[3]);
  assert.equal(seasonProgress(season).complete, true);
  assert.deepEqual(pcSeasonStandings(season).slice(0, 4).map(row => row.clubId), [order[1], order[0], order[3], order[2]]);
  for (const row of pcSeasonStandings(season)) {
    const { rank, tied, needsTiebreak, ...actual } = row;
    assert.deepEqual(actual, before.find(item => item.clubId === row.clubId));
    assert.equal(row.played, 7);
  }
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('3팀 순환 동률은 재경기하고 승자승·득실·구단 ID로 순위를 임의 확정하지 않는다', () => {
  const { world } = sample('three'), season = world.pcSeason;
  const ids = [...season.tiebreaks[0].clubIds];
  const firstSeed = officialMatchConfig(world, nextTiebreakFixture(season)).seed;
  for (let game = 0; game < 3; game++) {
    const fixture = nextTiebreakFixture(season), a = ids.indexOf(fixture.homeClubId), b = ids.indexOf(fixture.awayClubId);
    decide(season, (a + 1) % 3 === b ? ids[a] : ids[b]);
  }
  assert.equal(seasonProgress(season).complete, false);
  assert.deepEqual(season.tiebreaks[1].clubIds, ids);
  assert.equal(pcSeasonStandings(season).slice(0, 3).every(row => row.tied && row.rank === 1), true);
  assert.notEqual(officialMatchConfig(world, nextTiebreakFixture(season)).seed, firstSeed);
  for (let game = 0; game < 3; game++) {
    const fixture = nextTiebreakFixture(season);
    decide(season, ids[Math.min(ids.indexOf(fixture.homeClubId), ids.indexOf(fixture.awayClubId))]);
  }
  assert.equal(seasonProgress(season).complete, true);
  assert.equal(season.tiebreaks.length, 2);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('4팀 결정전에서 2승 2팀·1승 2팀이면 두 하위 동률 그룹만 순서대로 재경기한다', () => {
  const { world } = sample('four'), season = world.pcSeason, ids = season.tiebreaks[0].clubIds;
  assert.equal(ids.length, 4);
  for (let game = 0; game < 6; game++) {
    const fixture = nextTiebreakFixture(season), a = ids.indexOf(fixture.homeClubId), b = ids.indexOf(fixture.awayClubId);
    const low = Math.min(a, b), high = Math.max(a, b);
    decide(season, ids[low === 0 && high === 3 ? 3 : low]);
  }
  assert.deepEqual(season.tiebreaks[1].clubIds, ids.slice(0, 2));
  decide(season, ids[1]);
  assert.deepEqual(season.tiebreaks[2].clubIds, ids.slice(2));
  assert.equal(season.tiebreaks[2].rank, 3);
  decide(season, ids[3]);
  assert.equal(seasonProgress(season).complete, true);
  assert.deepEqual(pcSeasonStandings(season).slice(0, 4).map(row => row.clubId), [ids[1], ids[0], ids[3], ids[2]]);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('완료된 정규 일정의 v27 저장은 다음 결정전만 보충하며 손상된 최신 대진/순서를 거부한다', () => {
  const { world } = sample('three');
  const old = createSave(world); old.schemaVersion = 27; delete old.world.pcSeason.tiebreaks;
  const original = structuredClone(old), loaded = restoreWorld(old);
  assert.deepEqual(old, original);
  assert.deepEqual(rest(loaded), rest(world));
  assert.deepEqual(loaded.pcSeason.fixtures, world.pcSeason.fixtures);
  assert.deepEqual(loaded.pcSeason.tiebreaks, world.pcSeason.tiebreaks);
  for (const change of [
    s => { delete s.tiebreaks; }, s => { s.tiebreaks[0].rank = 3; },
    s => { s.tiebreaks[0].clubIds.reverse(); }, s => { s.tiebreaks[0].fixtures.pop(); },
    s => { s.tiebreaks[0].fixtures[0].awayClubId = s.clubIds.find(id => !s.tiebreaks[0].clubIds.includes(id)); },
    s => { s.tiebreaks[0].fixtures[1].result = { homeScore: 13, awayScore: 0 }; },
    s => { s.tiebreaks.push(structuredClone(s.tiebreaks[0])); },
  ]) { const copy = structuredClone(world); change(copy.pcSeason); assert.throws(() => createSave(copy)); }
});

test('AI 결정전·내 경기 기권·저장 재진입은 날짜/재정을 바꾸지 않고 최종 순위를 확정한다', async () => {
  let { world } = sample('three');
  const before = structuredClone(world);
  assert.equal(officialWeekStatus(world).phase, 'tiebreak-ai');
  assert.equal(advanceWeek(world, { official: true }).tiebreakPending, true);
  assert.equal(advanceDay(world).tiebreakPending, true);
  assert.equal(selectWeeklyActions(world, world.clubs.find(club => club.id === world.playerClubId).playerIds.map(playerId => ({ playerId, action: 'rest' }))).ok, false);
  assert.equal(beginTeamTraining(world, { official: true }).tiebreakPending, true);
  assert.deepEqual(world, before);
  world = await advanceAiTiebreaks(world);
  assert.deepEqual(rest(world), rest(before));
  assert.equal(before.pcSeason.tiebreaks[0].fixtures.every(fixture => fixture.result === null), true);
  assert.equal(world.pcSeason.tiebreaks[0].fixtures[0].result !== null, true);
  assert.equal(officialWeekStatus(world).phase, 'tiebreak');
  for (let game = 0; game < 2; game++) {
    const fixture = nextOfficialFixture(world);
    assert.equal(fixture.week, 0);
    beginOfficialMatch(world, fixture.id);
    world = restoreWorld(createSave(world));
    assert.equal(findOfficialFixture(world.pcSeason, world.pcSeason.activeMatchId).id, fixture.id);
    world = await finishOfficialWeek(world, { forfeit: true });
    const result = findOfficialFixture(world.pcSeason, fixture.id).result;
    assert.equal(result.forfeit, true);
    assert.equal(fixture.homeClubId === world.playerClubId ? result.homeScore : result.awayScore, 0);
    assert.deepEqual(rest(world), rest(before));
  }
  assert.equal(seasonProgress(world.pcSeason).complete, true);
  assert.equal(pcSeasonStandings(world.pcSeason).find(row => row.clubId === world.playerClubId).rank, 3);
  assert.deepEqual(restoreWorld(createSave(world)), world);
  await assert.rejects(finishOfficialWeek(world, { forfeit: true }));
  await assert.rejects(advanceAiTiebreaks(world));
});

test('AI끼리만 동률인 그룹도 실제 엔진으로 처리하며 정규 결과는 그대로 둔다', async () => {
  const { world } = sample('two', false), before = structuredClone(world);
  let current = await advanceAiTiebreaks(world);
  assert.equal(current.pcSeason.tiebreaks[0].fixtures[0].result !== null, true);
  assert.equal(seasonProgress(current.pcSeason).complete, false);
  current = await advanceAiTiebreaks(current);
  assert.equal(seasonProgress(current.pcSeason).complete, true);
  assert.deepEqual(current.pcSeason.fixtures, before.pcSeason.fixtures);
  assert.deepEqual(rest(current), rest(before));
});

test('정규 마지막 하루의 정산이 남으면 먼저 하루만 마치고 결정전을 연다', () => {
  const world = createWorld(createClub('정산 후 결정전').club, 42);
  for (let i = 0; i < 6; i++) advanceDay(world);
  const data = sample('two').world.pcSeason;
  // 같은 세계 시드의 대진/구단 ID이며 현재 날짜·선수/재정은 보존한다.
  world.pcSeason = data;
  const last = world.pcSeason.fixtures.find(fixture => fixture.week === 7 && [fixture.homeClubId, fixture.awayClubId].includes(world.playerClubId));
  world.pcSeason.weekSchedule = { fixtureId: last.id, startedDay: 1, endDay: 8, phase: 'settling', teamTraining: false };
  world.weekDaysRemaining = 1;
  assert.equal(officialWeekStatus(world).phase, 'settling');
  assert.deepEqual(restoreWorld(createSave(world)), world);
  assert.equal(advanceWeek(world).advancedDays, 1);
  assert.equal(world.day, 8);
  assert.equal(officialWeekStatus(world).phase, 'tiebreak');
  assert.equal(advanceWeek(world, { official: true }).tiebreakPending, true);
});

test('시즌 화면은 결정전 대진/기록과 확정 후 상위 4팀을 표시하고 상태를 바꾸지 않는다', t => {
  const old = globalThis.document;
  globalThis.document = { createElement: () => ({}) };
  t.after(() => { globalThis.document = old; });
  const { world } = sample('two'), before = structuredClone(world);
  const pending = seasonScreen(world).innerHTML;
  assert.match(pending, /순위 결정전 기록/); assert.match(pending, /순위 결정전 시작/);
  assert.deepEqual(world, before);
  while (!seasonProgress(world.pcSeason).complete) decide(world.pcSeason, nextTiebreakFixture(world.pcSeason).homeClubId);
  const final = seasonScreen(world).innerHTML;
  assert.match(final, /정규 시즌 순위 확정/); assert.match(final, /플레이오프 진출 4팀/);
  assert.doesNotMatch(final, /data-action="start-official"/);
  assert.doesNotMatch(final, /data-action="advance-tiebreak-ai"/);
  const partial = createWorld(createClub('일부 정규 결과').club, 42);
  const fixture = nextOfficialFixture(partial);
  recordPcMatch(partial.pcSeason, fixture.id, { homeScore: 13, awayScore: 2 });
  assert.equal(officialWeekStatus(partial).phase, 'regular-pending');
  assert.doesNotMatch(seasonScreen(partial).innerHTML, /1~8위 정규 순위를 확정했습니다/);
});
