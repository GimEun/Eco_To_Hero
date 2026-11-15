import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { CLUB_LOGOS, clubLogo } from '../src/data/club-logos.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createPractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { renderMatch } from '../src/ui/match-panel.js';
import { logoPicker } from '../src/ui/club-logo.js';

test('60개 로고 파일이 존재하고 종류별 6색 및 ID가 유일하다', () => {
  assert.equal(CLUB_LOGOS.length, 60);
  assert.equal(new Set(CLUB_LOGOS.map(logo => logo.id)).size, 60);
  for (const logo of CLUB_LOGOS) assert.ok(statSync(new URL(logo.url)).isFile(), logo.id);
  for (const kind of new Set(CLUB_LOGOS.map(logo => logo.kind))) assert.equal(CLUB_LOGOS.filter(logo => logo.kind === kind).length, 6);
  const picker = logoPicker('D_B');
  assert.equal((picker.match(/type="radio"/g) ?? []).length, 60);
  assert.equal((picker.match(/ checked/g) ?? []).length, 1);
  assert.match(picker, /value="D_B" checked/);
  assert.equal((picker.match(/form="club-form"/g) ?? []).length, 60);
  assert.doesNotMatch(picker, /<h3>|title="(?:Be|D|E|H|Ho|L|P|Wo|S|C)\b/);
  assert.match(picker, /value="S_B"/);
  assert.match(picker, /value="C_B"/);
});

test('선택 로고 보존·타 구단 무작위 배정·기존 생성 결과와 원본 보존', () => {
  const initial = createClub('로고 구단').club;
  const before = structuredClone(initial);
  const plain = createWorld(initial, 42);
  const world = createWorld({ ...initial, logoId: 'D_B' }, 42);
  assert.deepEqual(initial, before);
  assert.equal(getClubView(world).logoId, 'D_B');
  assert.ok(world.clubs.slice(1).every(club => clubLogo(club.logoId) && club.logoId !== 'D_B'));
  assert.equal(new Set(world.clubs.slice(1).map(club => club.logoId)).size, 57);
  assert.deepEqual(world.players, plain.players);
  assert.deepEqual(world.stocks, plain.stocks);
  assert.deepEqual(world, createWorld({ ...initial, logoId: 'D_B' }, 42));
  assert.notDeepEqual(world.clubs.map(club => club.logoId), createWorld({ ...initial, logoId: 'D_B' }, 43).clubs.map(club => club.logoId));
});

test('저장·백업 왕복 및 구형 저장의 로고만 고정 보충, 잘못된 ID 차단', () => {
  const world = createWorld({ ...createClub('로고 저장').club, logoId: 'Wo_R' }, 7);
  const save = createSave(world);
  assert.deepEqual(restoreWorld(JSON.parse(JSON.stringify(save))), world);
  const old = structuredClone(save);
  for (const club of old.world.clubs) delete club.logoId;
  const before = structuredClone(old);
  const restored = restoreWorld(old);
  assert.deepEqual(old, before);
  assert.deepEqual(restored, restoreWorld(old));
  assert.deepEqual(restored.players, world.players);
  assert.deepEqual(restored.stocks, world.stocks);
  assert.ok(restored.clubs.every(club => clubLogo(club.logoId)));
  for (const invalid of [null, '', '../../file.png', '<svg>', 123]) {
    const bad = structuredClone(save);
    bad.world.clubs[0].logoId = invalid;
    assert.throws(() => restoreWorld(bad), /로고/);
  }
});

test('팀 연습 점수판은 소속 로고·점수를 표시하고 이름을 이스케이프한다', () => {
  const world = createWorld({ ...createClub('로고 경기').club, logoId: 'E_W' }, 42);
  const home = getClubView(world), away = getClubView(world, world.clubs[1].id);
  const state = createPractice(RELAY_MAP, home, away, { match: true });
  assert.equal(state.teams[0].logoId, home.logoId);
  assert.equal(state.teams[1].logoId, away.logoId);
  state.teams[0].name = '<unsafe>';
  const nodes = new Map();
  const panel = { querySelector(key) { if (!nodes.has(key)) nodes.set(key, {}); return nodes.get(key); } };
  renderMatch(panel, state);
  const markup = nodes.get('.match-score').innerHTML;
  assert.equal((markup.match(/<img /g) ?? []).length, 2);
  assert.ok(markup.includes(clubLogo(home.logoId).url));
  assert.ok(markup.includes(clubLogo(away.logoId).url));
  assert.match(markup, /&lt;unsafe&gt; 0 : 0 /);
  assert.doesNotMatch(markup, /<unsafe>/);
});
