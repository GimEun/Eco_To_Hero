import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getAffiliations, getClubView } from '../src/game/world-selectors.js';
import { recruitPlayer, releasePlayer, replaceStarter, recruitmentIssue } from '../src/game/roster.js';
import { saleQuote, sellPlayer, negotiateTransfer } from '../src/game/transfers.js';
import { renewContract } from '../src/game/contracts.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { playerSale } from '../src/ui/roster-management.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';

function fixture() {
  const world = createWorld(createClub('보유 기간 검증').club, 42), club = world.clubs[0];
  const affiliations = getAffiliations(world);
  const player = world.players.filter(player => !affiliations.has(player.id) && !recruitmentIssue(club, player)).sort((a, b) => b.aim + b.intelligence + b.stamina - a.aim - a.intelligence - a.stamina)[0];
  assert.equal(recruitPlayer(world, player.id).ok, true);
  return { world, club, player };
}

test('자유계약 영입 즉시 8주를 표시하고 자동 판매도 상태 변경 없이 막는다', () => {
  const { world, club, player } = fixture(), before = structuredClone(world);
  assert.equal(club.contracts[player.id].acquiredDay, world.day);
  assert.equal(saleQuote(world, player.id).remainingDays, 56);
  assert.match(playerSale(world, player), /판매까지 8주/);
  assert.match(playerSale(world, player), /disabled>판매 불가/);
  assert.equal(sellPlayer(world, player.id).ok, false);
  assert.deepEqual(world, before);
});

test('실제 7주+6일까지 막고 8주가 되는 정확한 날 자동 판매를 허용한다', () => {
  const { world, club, player } = fixture();
  for (let i = 0; i < 7; i++) assert.equal(advanceWeek(world).ok, true);
  assert.equal(saleQuote(world, player.id).remainingDays, 7);
  assert.match(playerSale(world, player), /판매까지 1주/);
  for (let i = 0; i < 6; i++) assert.equal(advanceDay(world).ok, true);
  assert.equal(saleQuote(world, player.id).remainingDays, 1);
  const blocked = structuredClone(world);
  assert.equal(sellPlayer(world, player.id).ok, false); assert.deepEqual(world, blocked);
  assert.equal(advanceDay(world).ok, true); assert.equal(world.day, 57);
  assert.equal(saleQuote(world, player.id).ok, true);
  const amount = saleQuote(world, player.id).amount, balance = club.balance;
  assert.equal(sellPlayer(world, player.id).ok, true); assert.equal(club.balance, balance + amount);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('타 구단 구매도 실제 구매일 기준으로 8주를 적용하고 계약금·주급 규칙은 유지한다', () => {
  const { world, club } = fixture(); advanceWeek(world); club.balance = 100000;
  const id = world.clubs[1].playerIds[0];
  assert.equal(negotiateTransfer(world, id, 100).ok, true);
  assert.equal(club.contracts[id].acquiredDay, 8);
  assert.equal(saleQuote(world, id).remainingDays, 56);
  advanceWeek(world); assert.equal(saleQuote(world, id).remainingDays, 49);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('재계약·주전 교체는 최초 영입일을 바꾸지 않고 방출 후 재영입은 새 8주를 시작한다', () => {
  const { world, club, player } = fixture(); advanceWeek(world);
  const first = club.lineupIds[0];
  assert.equal(replaceStarter(world, player.id, first).ok, true);
  assert.equal(renewContract(world, player.id, 168).ok, true);
  assert.equal(club.contracts[player.id].acquiredDay, 1);
  assert.equal(saleQuote(world, player.id).remainingDays, 49);
  assert.equal(releasePlayer(world, player.id).ok, true);
  const balance = club.balance;
  assert.equal(recruitPlayer(world, player.id).ok, true);
  assert.ok(club.balance < balance);
  assert.equal(club.contracts[player.id].acquiredDay, 8);
  assert.equal(saleQuote(world, player.id).remainingDays, 56);
});

test('관전·현실 시간·저장 복원은 날짜를 넘기지 않아 판매 대기를 소비하지 않는다', () => {
  const { world, player } = fixture(); advanceWeek(world);
  const practice = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id), { combat: true });
  advancePractice(practice, RELAY_MAP, 20000);
  const restored = restoreWorld(parseBackup(JSON.stringify(createSave(world))));
  assert.equal(world.day, 8); assert.deepEqual(restored, world);
  assert.equal(saleQuote(restored, player.id).remainingDays, 49);
});

test('계약으로 날짜 진행이 막히면 판매 제한도 그대로 유지한다', () => {
  const { world, club, player } = fixture();
  for (const contract of Object.values(club.contracts)) contract.remainingDays = 1;
  const before = structuredClone(world);
  assert.equal(advanceWeek(world).advancedDays, 0); assert.deepEqual(world, before);
  assert.equal(saleQuote(world, player.id).remainingDays, 56);
});

test('v15 소속 선수는 제한 없이 이행하고 새로운 영입부터 8주를 적용한다', () => {
  const { world, player } = fixture(); advanceWeek(world);
  const legacy = createSave(world); legacy.schemaVersion = 15;
  for (const club of legacy.world.clubs) for (const contract of Object.values(club.contracts)) delete contract.acquiredDay;
  const before = structuredClone(legacy), restored = restoreWorld(legacy);
  assert.deepEqual(legacy, before); assert.deepEqual(restored.players, legacy.world.players);
  assert.equal(restored.clubs[0].balance, legacy.world.clubs[0].balance);
  assert.equal(restored.clubs[0].contracts[player.id].acquiredDay, null);
  assert.equal(saleQuote(restored, player.id).ok, true);
  assert.deepEqual(restoreWorld(createSave(restored)), restored);
  const affiliations = getAffiliations(restored), free = restored.players.find(player => !affiliations.has(player.id) && !recruitmentIssue(restored.clubs[0], player));
  assert.equal(recruitPlayer(restored, free.id).ok, true);
  assert.equal(saleQuote(restored, free.id).remainingDays, 56);
});

test('현재 저장은 누락·문자·소수·미래·범위 밖 영입일을 거절한다', () => {
  for (const value of [undefined, '1', .5, 0, -1, 2, Number.MAX_SAFE_INTEGER]) {
    const { world, club, player } = fixture(); club.contracts[player.id].acquiredDay = value;
    assert.throws(() => createSave(world), /영입 날짜/);
  }
});
