import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getAffiliations } from '../src/game/world-selectors.js';
import { recruitPlayer, recruitmentIssue } from '../src/game/roster.js';
import { saleQuote, sellPlayer, negotiateTransfer } from '../src/game/transfers.js';
import { createContract } from '../src/game/contracts.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { playersScreen, worldScreen } from '../src/ui/world-screens.js';
import { playerSale } from '../src/ui/roster-management.js';

const total = player => player.aim + player.intelligence + player.stamina;
const fixture = () => createWorld(createClub('구단 시장 검증').club, 42);
function incoming(world, maximum = 99) {
  const affiliations = getAffiliations(world);
  const player = world.players.find(player => !affiliations.has(player.id) && !recruitmentIssue(world.clubs[0], player));
  world.clubs[0].balance = 100000;
  assert.equal(recruitPlayer(world, player.id).ok, true);
  // 기존 보유 선수로 설정해 이 검사에서는 AI 명단 편성/시장을 검증한다.
  world.clubs[0].contracts[player.id].acquiredDay = null;
  player.aim = maximum; player.intelligence = 10; player.stamina = 10;
  player.development.potential.aim = 99; player.training.experience.aim = 0;
  return player;
}
function documentFixture(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ innerHTML: '', querySelector: () => ({ textContent: '' }) }) } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
}

test('평균 능력이 낮아도 상대 선수보다 하나의 능력이 높으면 구단에 판매한다', () => {
  const world = fixture(), player = incoming(world), buyer = world.clubs.find(club => club.leagueId === 'world');
  buyer.balance = 100000;
  assert.ok(buyer.playerIds.every(id => total(world.players.find(player => player.id === id)) > total(player)));
  const quote = saleQuote(world, player.id);
  assert.ok(quote.offers.some(offer => offer.buyer.id === buyer.id));
  assert.ok(quote.offers.every(offer => !Object.hasOwn(offer, 'replacement')));
  const before = structuredClone(buyer), outcome = sellPlayer(world, player.id, buyer.id);
  assert.equal(outcome.ok, true); assert.equal(outcome.releasedPlayerId, null);
  assert.equal(buyer.playerIds.length, 6); assert.ok(buyer.playerIds.includes(player.id));
  assert.ok(!buyer.lineupIds.includes(player.id));
  assert.deepEqual(new Set(buyer.lineupIds), new Set(before.lineupIds));
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('세계 리그는 8명까지 유지하고 초과 시 기존 선수 중 최저 평균을 자동 방출한다', () => {
  const world = fixture(), buyer = world.clubs.find(club => club.leagueId === 'world'); buyer.balance = 100000;
  for (let i = 0; i < 4; i++) {
    const player = incoming(world), before = [...buyer.playerIds];
    const weakest = before.map(id => world.players.find(player => player.id === id)).sort((a,b) => total(a) - total(b))[0];
    const outcome = sellPlayer(world, player.id, buyer.id);
    assert.equal(outcome.ok, true); assert.equal(buyer.playerIds.length, Math.min(6 + i, 8));
    assert.equal(buyer.lineupIds.length, 5);
    assert.equal(Object.keys(buyer.contracts).length, buyer.playerIds.length);
    if (i < 3) { assert.equal(outcome.releasedPlayerId, null); assert.ok(before.every(id => buyer.playerIds.includes(id))); }
    else {
      assert.equal(outcome.releasedPlayerId, weakest.id);
      assert.equal(getAffiliations(world).has(weakest.id), false);
      assert.equal(Object.hasOwn(buyer.contracts, weakest.id), false);
    }
    const best = buyer.playerIds.map(id => world.players.find(player => player.id === id)).sort((a,b) => total(b) - total(a)).slice(0, 5).map(player => player.id);
    assert.deepEqual(buyer.lineupIds, best);
    assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(world)))), world);
  }
});

test('세계 외의 AI 리그는 5명을 유지하고 기존 최저 평균을 방출한다', () => {
  for (const league of ['pc', 'city', 'province', 'national']) {
    const world = fixture(), buyer = world.clubs.find(club => club.id !== world.playerClubId && club.leagueId === league), player = incoming(world, { pc: 54, city: 64, province: 74, national: 84 }[league]);
    const weakest = buyer.playerIds.map(id => world.players.find(player => player.id === id)).sort((a,b) => total(a) - total(b))[0];
    const before = structuredClone(weakest), result = sellPlayer(world, player.id, buyer.id);
    assert.equal(result.ok, true); assert.equal(result.releasedPlayerId, weakest.id);
    assert.equal(buyer.playerIds.length, 5); assert.equal(buyer.lineupIds.length, 5);
    assert.deepEqual(new Set(buyer.playerIds), new Set(buyer.lineupIds));
    assert.deepEqual(weakest, before); assert.equal(getAffiliations(world).has(weakest.id), false);
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
});

test('자동 방출 평균 동률은 기존 명단 순서로 결정하고 방금 영입한 선수는 유지한다', () => {
  const world = fixture(), player = incoming(world, 54), buyer = world.clubs[1];
  for (const id of buyer.playerIds) {
    const current = world.players.find(player => player.id === id);
    current.aim = current.intelligence = current.stamina = 40;
  }
  const first = buyer.playerIds[0], result = sellPlayer(world, player.id, buyer.id);
  assert.equal(result.ok, true); assert.equal(result.releasedPlayerId, first);
  assert.ok(buyer.playerIds.includes(player.id));
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('후보가 있는 세계 팀의 주전/후보를 구매해도 상대 명단·최상위 주전·계약을 보존한다', () => {
  for (const starter of [true, false]) {
    const world = fixture(), seller = world.clubs.find(club => club.leagueId === 'world'); seller.balance = 100000;
    for (let i = 0; i < 3; i++) {
      const player = incoming(world); assert.equal(sellPlayer(world, player.id, seller.id).ok, true);
    }
    const playerId = starter ? seller.lineupIds[0] : seller.playerIds.find(id => !seller.lineupIds.includes(id));
    // 상위 리그 선수는 먼저 차단됨을 확인하고, 명단 교체 검사는 영입 가능한 능력으로 진행한다.
    assert.equal(negotiateTransfer(world, playerId, 100).ok, false);
    const target = world.players.find(player => player.id === playerId);
    target.aim = target.intelligence = target.stamina = 50;
    world.clubs[0].balance = 100000;
    assert.equal(negotiateTransfer(world, playerId, 100).ok, true);
    assert.equal(seller.playerIds.length, 8); assert.equal(Object.keys(seller.contracts).length, 8);
    const best = seller.playerIds.map(id => world.players.find(player => player.id === id)).sort((a,b) => total(b) - total(a)).slice(0, 5).map(player => player.id);
    assert.deepEqual(seller.lineupIds, best);
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
});

test('저장은 세계 AI만 후보 3명을 허용하고 기존 v14 세계는 변경 없이 복원한다', () => {
  const world = fixture(), old = createSave(world); old.schemaVersion = 14;
  const snapshot = structuredClone(old); assert.deepEqual(restoreWorld(old),{...world,aiGrowth:createAiGrowth(world.day),counseling:createCounseling(world)}); assert.deepEqual(old, snapshot);
  const attach = (world, club, count) => {
    const affiliations = getAffiliations(world), free = world.players.filter(player => !affiliations.has(player.id)).slice(0, count);
    free.forEach(player => { club.playerIds.push(player.id); club.contracts[player.id] = createContract(player); });
  };
  for (const league of ['pc', 'city', 'province', 'national']) {
    const invalid = fixture(), club = invalid.clubs.find(club => club.id !== invalid.playerClubId && club.leagueId === league);
    attach(invalid, club, 1); assert.throws(() => createSave(invalid), /정원/);
  }
  const club = world.clubs.find(club => club.leagueId === 'world'); attach(world, club, 3);
  const save = createSave(world); assert.equal(save.schemaVersion, 48); assert.deepEqual(restoreWorld(save), world);
  const wrongVersion = structuredClone(save); wrongVersion.schemaVersion = 14;
  assert.throws(() => restoreWorld(wrongVersion), /정원/);
  attach(world, club, 1); assert.throws(() => createSave(world), /정원/);
});

test('선수 영입은 전체 페이지/정렬에서 자유계약만 보이고 영입/AI 방출 결과를 갱신한다', t => {
  documentFixture(t);
  const world = fixture(), player = incoming(world, 54), buyer = world.clubs[1];
  const outcome = sellPlayer(world, player.id, buyer.id); assert.equal(outcome.ok, true);
  const affiliations = getAffiliations(world), seen = new Set();
  for (let page = 0; page < Math.ceil((600 - affiliations.size) / 30); page++) {
    const markup = playersScreen(world, page).innerHTML;
    assert.match(markup, /<h1 tabindex="-1">선수 영입/);
    assert.doesNotMatch(markup, /player-scope|data-action="negotiate-transfer"/);
    for (const [, id] of markup.matchAll(/data-action="recruit-player" data-player-id="([^"]+)"/g)) { assert.equal(affiliations.has(id), false); seen.add(id); }
  }
  assert.equal(seen.size, 600 - affiliations.size);
  assert.ok(seen.has(outcome.releasedPlayerId)); assert.equal(seen.has(player.id), false);
  assert.equal(seen.has(world.clubs[0].playerIds[0]), false);
  const markup = playerSale(world, world.players[0]);
  assert.doesNotMatch(markup, / 대체<\/option>/);
});

test('세계 리그 구단 조회는 후보 표시를 제공하고 빈 시장은 영입 버튼 없이 안내한다', t => {
  documentFixture(t);
  const world = fixture(), buyer = world.clubs.find(club => club.leagueId === 'world'), player = incoming(world); buyer.balance = 100000;
  sellPlayer(world, player.id, buyer.id);
  assert.match(worldScreen(world, 'world', buyer.id).innerHTML, />후보<\/span>/);
  const affiliations = getAffiliations(world), free = world.players.filter(player => !affiliations.has(player.id));
  // 시장 필터의 빈 결과 검사용 화면 상태이며 저장하지 않는다.
  world.clubs[0].playerIds.push(...free.map(player => player.id));
  const empty = playersScreen(world, 99, 'aim', 'desc').innerHTML;
  assert.match(empty, /현재 시장에 나온 선수가 없습니다/); assert.doesNotMatch(empty, /data-action="recruit-player"/);
  assert.match(empty, />1 \/ 1</);
});
