import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld as createNewWorld } from '../src/game/create-world.js';
// Existing in-season behavior; fresh-game preseason is covered separately.
const createWorld = (...args) => { const world = createNewWorld(...args); world.seasonCalendar = { mode: 'legacy', phase: 'season' }; return world; };

import { nextOfficialFixture, officialMatchConfig, beginOfficialMatch, createOfficialPractice, finishOfficialWeek } from '../src/game/official-match.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { advanceWeek, advanceDay } from '../src/game/calendar.js';
import { pcSeasonStandings } from '../src/game/pc-season.js';

const sample = seed => { const world = createWorld(createClub('공식 경기').club, seed); advanceWeek(world, { official: true }); return world; };

test('대진의 맵·시드·진영은 고정되고 내 팀을 UI home으로 바꿔도 실제 공격팀은 같다', () => {
  const maps = new Set(), sides = new Set();
  for (let seed = 0; seed < 12; seed++) {
    const world = sample(seed), fixture = nextOfficialFixture(world), original = structuredClone(world);
    const config = officialMatchConfig(world, fixture), ui = createOfficialPractice(world, fixture);
    assert.deepEqual(config, officialMatchConfig(restoreWorld(createSave(world)), fixture));
    assert.equal(ui.home.id, world.playerClubId);
    assert.equal(ui.away.id, fixture.homeClubId === world.playerClubId ? fixture.awayClubId : fixture.homeClubId);
    assert.equal(ui.attackTeam === 'home', (fixture.homeClubId === world.playerClubId) === (config.attackTeam === 'home'));
    assert.deepEqual(world, original);
    maps.add(config.map.id); sides.add(config.attackTeam);
  }
  assert.equal(maps.size, 3); assert.equal(sides.size, 2);
});

test('시작은 경기 ID만 저장하며 완료·다른 주·중복 시작과 손상된 진행 정보를 거부한다', () => {
  const world = sample(42), first = nextOfficialFixture(world);
  const later = world.pcSeason.fixtures.find(item => item.week === 2);
  assert.throws(() => beginOfficialMatch(world, later.id));
  beginOfficialMatch(world, first.id);
  assert.deepEqual(restoreWorld(createSave(world)), world);
  assert.equal(world.pcSeason.activeMatchId, first.id);
  assert.equal(world.pcSeason.fixtures.filter(item => item.result).length, 0);
  assert.throws(() => beginOfficialMatch(world, first.id));
  const saved = createSave(world);
  saved.world.pcSeason.activeMatchId = 'missing';
  assert.throws(() => restoreWorld(saved));
  const old = createSave(sample(42)); old.schemaVersion = 24; delete old.world.pcSeason.activeMatchId;
  assert.equal(restoreWorld(old).pcSeason.activeMatchId, null);
  old.schemaVersion = 25;
  assert.throws(() => restoreWorld(old));
});

test('공식 종료·기권은 각각 AI 세 경기와 마지막 하루를 한 번 처리하며 원본 세계를 보존한다', async () => {
  for (const forfeit of [false, true]) {
    const world = sample(forfeit ? 7 : 42), fixture = nextOfficialFixture(world);
    beginOfficialMatch(world, fixture.id);
    const original = structuredClone(world);
    let yields = 0;
    const result = await finishOfficialWeek(world, { forfeit, score: { home: 13, away: 6 }, yieldWork: async () => { yields++; } });
    assert.deepEqual(world, original);
    assert.ok(yields > 0);
    assert.equal(result.pcSeason.activeMatchId, null);
    assert.equal(result.pcSeason.fixtures.filter(item => item.result).length, 4);
    assert.ok(result.pcSeason.fixtures.filter(item => item.week === 1).every(item => item.result));
    assert.ok(result.pcSeason.fixtures.filter(item => item.week > 1).every(item => item.result === null));
    const recorded = result.pcSeason.fixtures.find(item => item.id === fixture.id).result;
    assert.equal(fixture.homeClubId === world.playerClubId ? recorded.homeScore : recorded.awayScore, forfeit ? 0 : 13);
    assert.equal(Boolean(recorded.forfeit), forfeit);
    const row = pcSeasonStandings(result.pcSeason).find(item => item.clubId === world.playerClubId);
    assert.equal(row.wins, forfeit ? 0 : 1); assert.equal(row.losses, forfeit ? 1 : 0);
    const { pcSeason: ignored, officialRecords: ignoredRecords, ...rest } = result;
    const expected = structuredClone(original); expected.pcSeason.weekSchedule = null; expected.pcSeason.activeMatchId = null;
    if (!forfeit) expected.clubs.find(club => club.id === expected.playerClubId).balance += 500;
    assert.equal(advanceDay(expected).ok, true); expected.weekDaysRemaining = 0;
    const { pcSeason: ignoredOriginal, officialRecords: ignoredOriginalRecords, ...before } = expected;
    assert.deepEqual(rest, before);
    assert.deepEqual(restoreWorld(createSave(result)), result);
    await assert.rejects(finishOfficialWeek(result, { forfeit }));
    assert.throws(() => beginOfficialMatch(result, fixture.id));
    assert.equal(nextOfficialFixture(result).week, 2);
  }
});

test('잘못된 종료 결과는 AI 계산 전에 실패하고 저장 원본을 바꾸지 않는다', async () => {
  const world = sample(42); beginOfficialMatch(world, nextOfficialFixture(world).id);
  const before = structuredClone(world);
  await assert.rejects(finishOfficialWeek(world, { score: { home: 12, away: 12 } }));
  assert.deepEqual(world, before);
});
