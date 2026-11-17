import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView, getAffiliations } from '../src/game/world-selectors.js';
import { validateWorld } from '../src/game/validate-world.js';
import { createSave, restoreWorld, parseBackup, MAX_BACKUP_BYTES } from '../src/storage/save-data.js';
import { LEAGUES } from '../src/config/world.js';
import { createMorale } from '../src/game/happiness.js';

test('기존 저장에 남은 선수 이미지 선택 필드는 무시하고 명단과 게임 상태를 보존한다', () => {
  const world = createWorld(createClub('기존 저장').club, 42);
  const save = createSave(world);
  save.world.players[0].appearance = { faceId: 'A_1', hairId: 'Ha_7', uniformId: 'Un_R' };
  const original = structuredClone(save);
  const restored = restoreWorld(save);
  assert.deepEqual(save, original);
  assert.deepEqual(restored, world);
  assert.ok(restored.players.every(player => !Object.hasOwn(player, 'appearance')));
});

const initialClub = () => createClub('보존할 구단').club;
const withoutIdentity = players => players.map(({ name, nickname, development, appearance, ...player }) => ({ ...player, morale: player.morale ?? createMorale(), fatigue: player.fatigue ?? 0 }));

test('여러 시드에서 58팀·600명·리그별 정원·단일 소속·자유계약 310명을 보장한다', () => {
  for (const seed of [0, 1, 2, 42, 2026, 0xffffffff]) {
    const world = validateWorld(createWorld(initialClub(), seed));
    assert.equal(world.clubs.length, 58);
    assert.equal(world.players.length, 600);
    assert.equal(new Set(world.players.map(p => p.id)).size, 600);
    assert.equal(new Set(world.clubs.map(c => c.id)).size, 58);
    assert.equal(new Set(world.clubs.map(c => c.name)).size, 58);
    const affiliations = getAffiliations(world);
    assert.equal(affiliations.size, 290);
    assert.equal(world.players.filter(p => !affiliations.has(p.id)).length, 310);
    for (const league of LEAGUES) assert.equal(world.clubs.filter(c => c.leagueId === league.id).length, league.teams);
    for (const club of world.clubs) assert.equal(getClubView(world, club.id).players.length, 5);
  }
});

test('동일 시드·기존 구단은 같은 세계를 만들고 원본 구단을 변경하지 않는다', () => {
  const club = initialClub();
  const before = structuredClone(club);
  const first = createWorld(club, 42);
  assert.deepEqual(first, createWorld(club, 42));
  assert.notDeepEqual(first, createWorld(club, 43));
  assert.deepEqual(club, before);
  const { name, balance, league, discipline, players } = getClubView(first);
  assert.deepEqual({ name, balance, league, discipline }, { name: before.name, balance: before.balance, league: before.league, discipline: before.discipline });
  assert.deepEqual(withoutIdentity(players), withoutIdentity(before.players));
});

test('생성 선수의 능력은 승인된 리그별·자유계약 분포를 따른다', () => {
  const world = createWorld(initialClub(), 99);
  const affiliations = getAffiliations(world);
  const initialIds = new Set(getClubView(world).playerIds);
  for (const player of world.players) {
    if (initialIds.has(player.id)) continue;
    const club = affiliations.get(player.id);
    const range = club ? LEAGUES.find(l => l.id === club.leagueId) : { min: 20, max: 89 };
    for (const key of ['aim', 'intelligence', 'stamina']) {
      assert.ok(player[key] >= range.min && player[key] <= range.max);
    }
  }
});

test('기존 선수 ID가 생성 ID와 겹쳐도 기존 ID를 보존하고 충돌을 피한다', () => {
  const club = initialClub();
  club.players[0].id = 'player-001';
  const world = validateWorld(createWorld(club, 1));
  assert.equal(getClubView(world).players[0].id, 'player-001');
  assert.equal(new Set(world.players.map(p => p.id)).size, 600);
});

test('세계 v8 전체 데이터가 1MB 이내에서 JSON 왕복 후 동일하다', () => {
  const world = createWorld(initialClub(), 5);
  const save = createSave(world);
  const json = JSON.stringify(save, null, 2);
  assert.ok(new TextEncoder().encode(json).byteLength < MAX_BACKUP_BYTES);
  assert.equal(save.schemaVersion, 48);
  const restored = restoreWorld(parseBackup(json));
  assert.deepEqual(restored, world);
  restored.players[0].aim = 1;
  assert.notEqual(world.players[0].aim, 1);
});

test('v1 저장은 구단명·자금·능력·ID를 보존해 결정적으로 변환하고 원본을 변경하지 않는다', () => {
  const club = initialClub();
  club.balance = 12345;
  club.players[0].aim = 99;
  const legacy = { format: 'eco-to-hero', schemaVersion: 1, savedAt: '2026-11-07T00:00:00Z', club };
  const before = structuredClone(legacy);
  const first = restoreWorld(legacy);
  assert.deepEqual(first, restoreWorld(legacy));
  assert.deepEqual(legacy, before);
  const view = getClubView(first);
  for (const key of ['name', 'balance', 'league', 'discipline']) assert.deepEqual(view[key], club[key]);
  assert.deepEqual(withoutIdentity(view.players), withoutIdentity(club.players));
  assert.doesNotThrow(() => validateWorld(first));
  assert.equal(createSave(first).schemaVersion, 48);
});

test('누락 참조·중복 소속·중복 ID·잘못된 정원·시드·플레이어 구단을 거부한다', () => {
  const changes = [
    w => { w.clubs[0].playerIds[0] = 'missing'; },
    w => { w.clubs[1].playerIds[0] = w.clubs[0].playerIds[0]; },
    w => { w.players[1].id = w.players[0].id; },
    w => { w.clubs[1].id = w.clubs[0].id; },
    w => { w.clubs[1].leagueId = 'city'; },
    w => { w.clubs[0].playerIds.pop(); },
    w => { w.clubs.pop(); },
    w => { w.players.pop(); },
    w => { w.seed = -1; },
    w => { w.seed = 0x100000000; },
    w => { w.playerClubId = 'missing'; },
    w => { w.playerClubId = w.clubs.find(c => c.leagueId === 'world').id; },
    w => { w.players[5].aim = 100; },
  ];
  for (const change of changes) {
    const world = createWorld(initialClub(), 8);
    change(world);
    const before = structuredClone(world);
    assert.throws(() => validateWorld(world));
    assert.deepEqual(world, before);
  }
});
