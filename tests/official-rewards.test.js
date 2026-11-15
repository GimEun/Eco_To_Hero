import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld as createNewWorld } from '../src/game/create-world.js';
// Existing in-season behavior; fresh-game preseason is covered separately.
const createWorld = (...args) => { const world = createNewWorld(...args); world.seasonCalendar = { mode: 'legacy', phase: 'season' }; return world; };

import { createClub } from '../src/game/create-club.js';
import { officialLineups, applyOfficialReceipt, officialTotals } from '../src/game/official-records.js';
import { recordPcMatch, nextOfficialFixture, nextTiebreakFixture } from '../src/game/pc-season.js';
import { signSponsor, sponsorIncome } from '../src/game/sponsors.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
const sample = () => createWorld(createClub('Rewards').club, 42);
function result(world, fixture, won = true, forfeit = false) {
  const homeWon = (fixture.homeClubId === world.playerClubId) === won;
  assert.equal(recordPcMatch(world.pcSeason, fixture.id, { homeScore: homeWon ? 13 : forfeit ? 0 : 6,
    awayScore: homeWon ? forfeit ? 0 : 6 : 13, ...(forfeit ? { forfeit: true } : {}) }).ok, true);
}
test('승리 상금·계약 후 승리 실적은 한 번만 반영하며 저장 후에도 중복을 막는다', () => {
  const world = sample(), club = world.clubs[0], fixture = nextOfficialFixture(world);
  assert.equal(signSponsor(world, 'wins', 1).ok, true);
  const lineups = officialLineups(world, fixture), cash = club.balance;
  result(world, fixture);
  assert.equal(applyOfficialReceipt(world, fixture, lineups), true);
  assert.equal(club.balance, cash + 500); assert.equal(club.finance.sponsor.progress, 1);
  const restored = restoreWorld(createSave(world)), before = structuredClone(restored);
  assert.equal(applyOfficialReceipt(restored, fixture, lineups), false); assert.deepEqual(restored, before);
  const totals = officialTotals(restored, club.id);
  assert.deepEqual([totals.matches, totals.wins, totals.losses, totals.rewards], [1, 1, 0, 500]);
  assert.equal(Object.keys(totals.players).length, 5);
});
test('패배는 $200·출전 집계, 기권은 상금/선수/계약 실적 없이 구단 패배만 기록한다', () => {
  for (const forfeit of [false, true]) {
    const world = sample(), club = world.clubs[0], fixture = nextOfficialFixture(world), cash = club.balance;
    assert.equal(signSponsor(world, 'appearances', 1).ok, true);
    result(world, fixture, false, forfeit);
    applyOfficialReceipt(world, fixture, officialLineups(world, fixture));
    assert.equal(club.balance, cash + (forfeit ? 0 : 200));
    assert.equal(club.finance.sponsor.progress, forfeit ? 0 : 1);
    const totals = officialTotals(world, club.id);
    assert.equal(totals.losses, 1); assert.equal(Object.keys(totals.players).length, forfeit ? 0 : 5);
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
});
test('시작 명단은 이후 주전 변경으로 바뀌지 않고 계약 목표 경계의 수입을 유지한다', () => {
  const world = sample(), fixture = nextOfficialFixture(world), club = world.clubs[0];
  assert.equal(signSponsor(world, 'appearances', 1).ok, true);
  const lineups = officialLineups(world, fixture), selected = club.finance.sponsor.playerId;
  club.lineupIds.reverse(); result(world, fixture); applyOfficialReceipt(world, fixture, lineups);
  const receipt = world.officialRecords.receipts[0]; assert.deepEqual(receipt.lineups, lineups);
  assert.equal(officialTotals(world, club.id).players[selected].appearances, 1);
  club.finance.sponsor.progress = 2; assert.equal(sponsorIncome(club.finance.sponsor), 1250);
  club.finance.sponsor.progress = 3; assert.equal(sponsorIncome(club.finance.sponsor), 1750);
});
test('v28 과거 결과는 유지하고 출전·상금·실적을 소급 생성하지 않는다', () => {
  const world = sample(), fixture = nextOfficialFixture(world); result(world, fixture);
  const old = createSave(world); old.schemaVersion = 28; delete old.world.officialRecords;
  const original = structuredClone(old), restored = restoreWorld(old);
  assert.deepEqual(old, original); assert.deepEqual(restored.officialRecords, { active: null, receipts: [] });
  assert.deepEqual(restored.pcSeason.fixtures, world.pcSeason.fixtures);
  assert.equal(restored.clubs[0].balance, world.clubs[0].balance);
});
test('결정전 승리는 상금 없이 계약 실적과 시작 주전 출전을 반영한다', () => {
  const world = sample(), club = world.clubs[0];
  assert.equal(signSponsor(world, 'wins').ok, true);
  const order = [club.id, ...world.pcSeason.clubIds.filter(id => id !== club.id)];
  for (const fixture of world.pcSeason.fixtures) {
    const [a, b] = [fixture.homeClubId, fixture.awayClubId].map(id => order.indexOf(id));
    const first = Math.min(a, b), last = Math.max(a, b);
    const winner = last < 3 && (first + 1) % 3 === last ? last : first;
    assert.equal(recordPcMatch(world.pcSeason, fixture.id, { homeScore: winner === a ? 13 : 6, awayScore: winner === b ? 13 : 6 }).ok, true);
  }
  let fixture;
  for (let i = 0; i < 3; i++) {
    fixture = nextTiebreakFixture(world.pcSeason);
    if ([fixture.homeClubId, fixture.awayClubId].includes(club.id)) break;
    assert.equal(recordPcMatch(world.pcSeason, fixture.id, { homeScore: 13, awayScore: 6 }).ok, true);
  }
  assert.equal(fixture.week, 0); assert.ok([fixture.homeClubId, fixture.awayClubId].includes(club.id));
  const cash = club.balance; result(world, fixture); applyOfficialReceipt(world, fixture, officialLineups(world, fixture));
  assert.equal(club.balance, cash); assert.equal(club.finance.sponsor.progress, 1);
  assert.equal(officialTotals(world, club.id).matches, 1);
  assert.equal(Object.keys(officialTotals(world, club.id).players).length, 5);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});
test('중복 경기·잘못된 출전·상금 조작·미완료 경기 영수증을 저장에서 거부한다', () => {
  const world = sample(), fixture = nextOfficialFixture(world); result(world, fixture);
  applyOfficialReceipt(world, fixture, officialLineups(world, fixture));
  for (const mutate of [
    value => value.receipts.push(structuredClone(value.receipts[0])),
    value => { value.receipts[0].reward = 999; },
    value => { value.receipts[0].lineups.home[0] = value.receipts[0].lineups.home[1]; },
    value => { value.receipts[0].fixtureId = world.pcSeason.fixtures.find(item => !item.result).id; },
    value => { value.active = { fixtureId: 'missing', lineups: officialLineups(world, fixture) }; },
    value => { value.active = { fixtureId: null, lineups: officialLineups(world, fixture) }; },
  ]) {
    const copy = structuredClone(world); mutate(copy.officialRecords); assert.throws(() => createSave(copy));
  }
});
