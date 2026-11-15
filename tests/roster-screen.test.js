import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView, getAffiliations } from '../src/game/world-selectors.js';
import { playersScreen, worldScreen } from '../src/ui/world-screens.js';
import { clubScreen } from '../src/ui/screens.js';
import { escapeHtml } from '../src/ui/html.js';
import { recruitmentCell, recruitmentPrice, rosterActions } from '../src/ui/roster-management.js';
import { recruitPlayer, replaceStarter, releasePlayer, signingFee } from '../src/game/roster.js';

function fixture(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ innerHTML: '', querySelector: () => ({ textContent: '' }), classList: { add() {} }, querySelectorAll: () => [], addEventListener() {} }),
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  const world = createWorld(createClub('명단 화면').club, 42);
  const assigned = getAffiliations(world);
  const free = world.players.filter(p => !assigned.has(p.id)).sort((a, b) => signingFee(a) - signingFee(b));
  return { world, club: world.clubs[0], free };
}

function listedNames(screen) {
  return [...screen.innerHTML.matchAll(/<strong>(.*?)<\/strong>/g)].map(match => match[1]);
}

test('시장 선수만 능력과 실제 영입 금액으로 양방향 정렬한 후 페이지를 나누며 원본을 보존한다', t => {
  const { world } = fixture(t);
  const before = structuredClone(world);
  const affiliations = getAffiliations(world);
  for (const key of ['aim', 'intelligence', 'stamina', 'fee']) {
    const value = key === 'fee' ? player => recruitmentPrice(world, player, affiliations) : player => player[key];
    for (const direction of ['asc', 'desc']) {
      const expected = world.players.filter(player => !affiliations.has(player.id)).sort((a, b) => (value(a) - value(b)) * (direction === 'asc' ? 1 : -1));
      for (const page of [0, 1, 19]) {
        const screen = playersScreen(world, page, key, direction);
        const clamped = Math.min(page, Math.ceil(expected.length / 30) - 1);
        assert.deepEqual(listedNames(screen), expected.slice(clamped * 30, (clamped + 1) * 30).map(p => escapeHtml(p.nickname)));
        assert.match(screen.innerHTML, new RegExp(`value="${key}" selected`));
        assert.match(screen.innerHTML, new RegExp(`data-direction="${direction}"[^>]*aria-pressed="true"`));
      }
    }
  }
  assert.deepEqual(world, before);
});

test('시장에는 소속 필터가 없고 자유계약 정렬 동점과 기본 순서를 유지한다', t => {
  const { world, club } = fixture(t);
  const affiliations = getAffiliations(world);
  {
    const filtered = world.players.filter(p => !affiliations.has(p.id));
    filtered.forEach(p => { p.aim = 50; });
    assert.deepEqual(listedNames(playersScreen(world, 0, 'aim', 'desc')), filtered.slice(0, 30).map(p => escapeHtml(p.nickname)));
    const sorted = [...filtered].sort((a, b) => recruitmentPrice(world, b, affiliations) - recruitmentPrice(world, a, affiliations));
    assert.deepEqual(listedNames(playersScreen(world, 0, 'fee', 'desc')), sorted.slice(0, 30).map(p => escapeHtml(p.nickname)));
  }
  const screen = playersScreen(world, 0);
  assert.deepEqual(listedNames(screen), world.players.filter(p => !affiliations.has(p.id)).slice(0, 30).map(p => escapeHtml(p.nickname)));
  assert.doesNotMatch(screen.innerHTML, /player-scope|data-action="negotiate-transfer"/);
  for (const name of listedNames(screen)) assert.ok(!club.playerIds.some(id => escapeHtml(world.players.find(p => p.id === id).nickname) === name));
  assert.match(screen.innerHTML, /data-direction="asc"[^>]*disabled/);
  assert.match(screen.innerHTML, /data-direction="desc"[^>]*disabled/);
});

test('타 구단 협상은 접힌 창에 제안 금액을 표시하고 정원·부족 자금을 제한한다', t => {
  const { world, club } = fixture(t);
  const player = world.players.find(p => p.id === world.clubs[1].playerIds[0]);
  let markup = recruitmentCell(world, player, getAffiliations(world));
  assert.match(markup, /<details class="transfer-negotiation">/);
  assert.match(markup, /value="80"/);
  assert.match(markup, /value="100" selected/);
  assert.match(markup, /value="120"/);
  assert.match(markup, /data-action="negotiate-transfer"/);
  assert.doesNotMatch(markup, /data-action="recruit-player"/);
  club.balance = 0;
  markup = recruitmentCell(world, player, getAffiliations(world));
  assert.match(markup, /disabled>자금 부족/);
  player.nickname = '<img src=x onerror=bad>';
  markup = recruitmentCell(world, player, getAffiliations(world));
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /&lt;img/);
});

test('선수 화면은 영입 후 소속/자유계약 인원·가격·잔액을 갱신하고 내 구단에서 주전/후보를 구분한다', t => {
  const { world, club, free } = fixture(t);
  let screen = playersScreen(world, 0);
  assert.match(screen.innerHTML, /자유계약 · 310명/);
  assert.match(screen.innerHTML, /data-action="recruit-player"/);
  assert.equal(recruitPlayer(world, free[0].id).ok, true);
  screen = playersScreen(world, 0);
  assert.match(screen.innerHTML, /자유계약 · 309명/);
  assert.match(screen.innerHTML, /명단 6\/8명/);
  assert.match(worldScreen(world, 'pc', world.playerClubId).innerHTML, /6명 →/);
  const view = clubScreen(getClubView(world), false);
  assert.match(view.innerHTML, /미저장/);
  assert.match(view.innerHTML, /후보 1명/);
  assert.match(view.innerHTML, /data-lineup-target/);
  assert.doesNotMatch(view.innerHTML, /data-action="replace-starter"/);
  assert.match(view.innerHTML, /data-lineup-player=/);
  const outgoing = club.lineupIds[0];
  replaceStarter(world, free[0].id, outgoing);
  assert.match(rosterActions(getClubView(world), free[0]), /value="" selected>주전/);
  releasePlayer(world, outgoing);
  assert.match(playersScreen(world, 0).innerHTML, /자유계약 · 310명/);
  assert.match(clubScreen(getClubView(world)).innerHTML, /후보 0명/);
});

test('소속 선수·부족 자금·정원 초과와 최소 명단의 조작을 화면에서도 제한한다', t => {
  const { world, club, free } = fixture(t);
  assert.match(recruitmentCell(world, world.players[0], getAffiliations(world)), /내 팀 소속/);
  const other = world.players.find(p => p.id === world.clubs[1].playerIds[0]);
  assert.match(recruitmentCell(world, other, getAffiliations(world)), /다른 구단 소속/);
  assert.match(rosterActions(getClubView(world), world.players[0]), /data-action="release-player"[^>]*disabled/);
  club.balance = 0;
  assert.match(recruitmentCell(world, free[0], getAffiliations(world)), /disabled[^>]*>자금 부족/);
  club.balance = 100000;
  for (const player of free.slice(0, 3)) recruitPlayer(world, player.id);
  assert.match(recruitmentCell(world, free[3], getAffiliations(world)), /disabled[^>]*>정원 초과/);
});

test('영입/명단 버튼의 이름·ID·선택 값은 HTML 이스케이프한다', t => {
  const { world, free } = fixture(t);
  const player = free[0];
  player.id = 'free" onclick="bad';
  player.nickname = '<img src=x onerror=bad>';
  let markup = recruitmentCell(world, player, getAffiliations(world));
  assert.match(markup, /data-player-id="free&quot; onclick=&quot;bad"/);
  recruitPlayer(world, player.id);
  markup = clubScreen(getClubView(world)).innerHTML;
  // 구단 로고는 허용하되 선수 이름의 HTML 삽입은 계속 차단한다.
  assert.doesNotMatch(markup.replace(/<img class="team-logo[^"]*"[^>]*>/g, ''), /<img/);
  assert.match(markup, /&lt;img/);
});
