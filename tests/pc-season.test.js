import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld as createNewWorld } from '../src/game/create-world.js';
// Existing in-season behavior; fresh-game preseason is covered separately.
const createWorld = (...args) => { const world = createNewWorld(...args); world.seasonCalendar = { mode: 'legacy', phase: 'season' }; return world; };

import { createPcSeason, validatePcSeason, recordPcMatch, pcSeasonStandings } from '../src/game/pc-season.js';
import { createSave, restoreWorld, MAX_BACKUP_BYTES } from '../src/storage/save-data.js';
import { seasonScreen } from '../src/ui/season-screen.js';

const sample = (seed = 42) => createWorld(createClub('PC방 검증').club, seed);

test('여러 시드의 8팀 1회전은 7주·28경기·주당 팀 1경기·팀당 7경기를 보장한다', () => {
  for (const seed of [0, 1, 2, 42, 2026, 0xffffffff]) {
    const world = sample(seed), season = world.pcSeason, original = structuredClone(world);
    assert.equal(season.clubIds.length, 8);
    assert.equal(season.fixtures.length, 28);
    const pairs = new Set();
    for (let week = 1; week <= 7; week++) {
      const fixtures = season.fixtures.filter(fixture => fixture.week === week);
      assert.equal(fixtures.length, 4);
      assert.equal(new Set(fixtures.flatMap(fixture => [fixture.homeClubId, fixture.awayClubId])).size, 8);
      for (const fixture of fixtures) {
        pairs.add([fixture.homeClubId, fixture.awayClubId].sort().join(':'));
        assert.notEqual(fixture.homeClubId, fixture.awayClubId);
        assert.equal(fixture.result, null);
      }
    }
    assert.equal(pairs.size, 28);
    for (const id of season.clubIds) assert.equal(season.fixtures.filter(fixture => [fixture.homeClubId, fixture.awayClubId].includes(id)).length, 7);
    assert.deepEqual(validatePcSeason(season, world.clubs), season);
    assert.deepEqual(createPcSeason(world.clubs, seed), season);
    assert.deepEqual(world, original);
  }
  assert.notDeepEqual(sample(42).pcSeason.fixtures, sample(43).pcSeason.fixtures);
});

test('미진행 시즌은 가짜 승패·확정 순위·결정전을 만들지 않는다', () => {
  const rows = pcSeasonStandings(sample().pcSeason);
  assert.equal(rows.length, 8);
  for (const row of rows) {
    assert.equal(row.played, 0); assert.equal(row.wins, 0); assert.equal(row.losses, 0);
    assert.equal(row.rank, null); assert.equal(row.needsTiebreak, false);
  }
});

test('28개 종료 점수는 정확히 한 번 집계되고 승·패 수 순서와 라운드 총계가 일치한다', () => {
  const world = sample(), season = world.pcSeason, order = season.clubIds;
  for (const fixture of season.fixtures) {
    const homeWon = order.indexOf(fixture.homeClubId) < order.indexOf(fixture.awayClubId);
    const scores = { homeScore: homeWon ? 13 : 3, awayScore: homeWon ? 3 : 13 };
    assert.equal(recordPcMatch(season, fixture.id, scores).applied, true);
    const before = structuredClone(season);
    assert.deepEqual(recordPcMatch(season, fixture.id, scores), { ok: true, applied: false, message: '이미 반영한 경기 결과입니다.' });
    assert.equal(recordPcMatch(season, fixture.id, { homeScore: scores.awayScore, awayScore: scores.homeScore }).ok, false);
    assert.deepEqual(season, before);
  }
  const rows = pcSeasonStandings(season);
  assert.deepEqual(rows.map(row => row.wins), [7, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(rows.map(row => row.losses), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(rows.map(row => row.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(rows.reduce((sum, row) => sum + row.wins, 0), 28);
  assert.equal(rows.reduce((sum, row) => sum + row.losses, 0), 28);
  assert.equal(rows.reduce((sum, row) => sum + row.roundDifference, 0), 0);
  assert.ok(rows.every(row => row.played === 7 && !row.needsTiebreak));
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('동률은 라운드 득실이나 구단 ID로 순위를 가르지 않고 시즌 종료 후 단판 결정전을 요구한다', () => {
  const { pcSeason: season } = sample();
  for (const fixture of season.fixtures) {
    const a = season.clubIds.indexOf(fixture.homeClubId), b = season.clubIds.indexOf(fixture.awayClubId);
    const winner = a < 3 && b < 3 ? (a + 1) % 3 === b ? a : b : Math.min(a, b);
    const lost = winner === 0 ? 0 : 11;
    recordPcMatch(season, fixture.id, { homeScore: winner === a ? 13 : lost, awayScore: winner === b ? 13 : lost });
  }
  const rows = pcSeasonStandings(season), top = rows.slice(0, 3);
  assert.ok(top.every(row => row.wins === 6 && row.losses === 1 && row.rank === 1 && row.tied && row.needsTiebreak));
  assert.ok(new Set(top.map(row => row.roundDifference)).size > 1);
  assert.equal(rows[3].rank, 4);
  const remaining = season.fixtures.at(-1);
  remaining.result = null;
  assert.ok(pcSeasonStandings(season).every(row => !row.needsTiebreak));
});

test('정규·반복 연장의 종료 점수만 받으며 잘못된 점수와 없는 경기에는 상태를 바꾸지 않는다', () => {
  const { pcSeason: season } = sample(), fixture = season.fixtures[0];
  for (const [homeScore, awayScore] of [[13, 0], [0, 13], [13, 11], [16, 12], [14, 16], [19, 15], [17, 19], [22, 20]]) {
    const copy = structuredClone(season);
    assert.equal(recordPcMatch(copy, fixture.id, { homeScore, awayScore }).ok, true);
  }
  for (const scores of [null, {}, { homeScore: '13', awayScore: 0 }, { homeScore: 13.1, awayScore: 0 },
    ...[[13, 12], [12, 12], [14, 10], [15, 13], [16, 15], [19, 14], [13, -1], [Infinity, 0]].map(([homeScore, awayScore]) => ({ homeScore, awayScore }))]) {
    const before = structuredClone(season);
    assert.equal(recordPcMatch(season, fixture.id, scores).ok, false);
    assert.deepEqual(season, before);
  }
  assert.equal(recordPcMatch(season, 'missing', { homeScore: 13, awayScore: 1 }).ok, false);
});

test('v24는 일정·결과를 저장하고 v23 이전은 원본 세계를 보존해 빈 시즌만 보충한다', () => {
  const world = sample();
  const saved = createSave(world);
  assert.equal(saved.schemaVersion, 48);
  assert.ok(new TextEncoder().encode(JSON.stringify(saved, null, 2)).byteLength < MAX_BACKUP_BYTES);
  recordPcMatch(world.pcSeason, world.pcSeason.fixtures[0].id, { homeScore: 13, awayScore: 11 });
  assert.deepEqual(restoreWorld(createSave(world)), world);
  const old = structuredClone(saved); old.schemaVersion = 23; delete old.world.pcSeason;
  const original = structuredClone(old);
  const loaded = restoreWorld(old);
  assert.deepEqual(loaded, restoreWorld(old));
  assert.deepEqual(loaded.pcSeason, saved.world.pcSeason);
  const { pcSeason, ...rest } = loaded;
  assert.deepEqual(rest, old.world);
  assert.deepEqual(old, original);
  assert.deepEqual(restoreWorld(createSave(loaded)), loaded);
});

test('결과 누적이 안전 정수 범위를 넘으면 저장 불가능한 결과를 남기지 않는다', () => {
  const { pcSeason: season } = sample(), first = season.fixtures[0];
  const won = 16 + Math.floor((Number.MAX_SAFE_INTEGER - 16) / 3) * 3;
  assert.equal(recordPcMatch(season, first.id, { homeScore: won, awayScore: won - 2 }).ok, true);
  const second = season.fixtures.find(fixture => fixture.id !== first.id && [fixture.homeClubId, fixture.awayClubId].includes(first.homeClubId));
  const before = structuredClone(season);
  assert.equal(recordPcMatch(season, second.id, { homeScore: won, awayScore: won - 2 }).ok, false);
  assert.deepEqual(season, before);
});

test('저장 손상의 누락·중복 대진·중복 출전·다른 리그·잘못된 결과를 거부한다', () => {
  const saved = createSave(sample());
  const changes = [
    world => { delete world.pcSeason; },
    world => { world.pcSeason.fixtures.pop(); },
    world => { world.pcSeason.clubIds[0] = world.clubs.find(club => club.leagueId === 'city').id; },
    world => { world.pcSeason.fixtures[1].id = world.pcSeason.fixtures[0].id; },
    world => { world.pcSeason.fixtures[1].homeClubId = world.pcSeason.fixtures[0].homeClubId; },
    world => { world.pcSeason.fixtures[0].awayClubId = world.pcSeason.fixtures[0].homeClubId; },
    world => { world.pcSeason.fixtures[0].week = 8; },
    world => { world.pcSeason.fixtures[0].result = { homeScore: 13, awayScore: 12 }; },
    world => { delete world.pcSeason.fixtures[0].result; },
  ];
  for (const change of changes) {
    const bad = structuredClone(saved); change(bad.world);
    const original = structuredClone(bad);
    assert.throws(() => restoreWorld(bad), /시즌|대진|중복|결과|MR12/);
    assert.deepEqual(bad, original);
  }
});

test('조회 화면은 승패·7주 대진·내 구단을 표시하고 세계/날짜를 바꾸거나 에셋을 조기 연결하지 않는다', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement() { return {}; } };
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'document', descriptor) : delete globalThis.document);
  const world = sample(), original = structuredClone(world);
  const markup = seasonScreen(world).innerHTML;
  assert.equal((markup.match(/class="season-week"/g) ?? []).length, 7);
  assert.equal((markup.match(/>예정<\/span>/g) ?? []).length, 28);
  assert.match(markup, /대진 확정 · 경기 미시작/);
  assert.match(markup, /내 구단/);
  assert.doesNotMatch(markup, /승점|경기장\.png|트로피/);
  assert.deepEqual(world, original);
  world.clubs[0].name = '<img src=x onerror=bad>';
  const escaped = seasonScreen(world).innerHTML;
  assert.match(escaped, /&lt;img src=x onerror=bad&gt;/);
  assert.doesNotMatch(escaped, /<img src=x/);
});
