import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_NAMES } from '../src/data/club-names.js';
import { updateClubNames } from '../src/game/club-names.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';

const sample = (seed = 42, name = '내 구단') => createWorld(createClub(name).club, seed);
const withoutNames = world => {
  const { clubIdentityVersion, ...copy } = structuredClone(world);
  copy.clubs = copy.clubs.map(({ name, ...club }) => club);
  return copy;
};

test('타 팀은 중복 없는 변형 약어·Paker 소속은 P1, 내 이름은 유지한다', () => {
  assert.equal(new Set(CLUB_NAMES).size, CLUB_NAMES.length);
  for (const seed of [0, 1, 7, 42, 2026, 0xffffffff]) {
    const world = sample(seed);
    assert.equal(world.clubs[0].name, '내 구단');
    assert.equal(new Set(world.clubs.map(club => club.name.toUpperCase())).size, 58);
    const paker = world.players.find(player => player.nickname === 'Paker');
    const pakerClub = world.clubs.find(club => club.playerIds.includes(paker.id));
    assert.ok(pakerClub);
    assert.equal(pakerClub.name, 'P1');
    assert.ok(world.clubs.slice(1).every(club => club.name === 'P1' || CLUB_NAMES.includes(club.name)));
    assert.deepEqual(world, sample(seed));
  }
  assert.notDeepEqual(sample(1).clubs.map(c => c.name), sample(2).clubs.map(c => c.name));
});

test('기존 저장은 이름만 한 번 변환하고 세계·원본·저장 후 이름을 보존한다', () => {
  const save = createSave(sample());
  delete save.world.clubIdentityVersion;
  save.world.clubs.slice(1).forEach((club, i) => { club.name = `이전 구단 ${i}`; });
  const before = structuredClone(save);
  const world = restoreWorld(save);
  assert.deepEqual(save, before);
  assert.deepEqual(withoutNames(world), withoutNames(save.world));
  assert.deepEqual(world, restoreWorld(save));
  assert.deepEqual(world, restoreWorld(JSON.parse(JSON.stringify(createSave(world)))));
  const snapshot = structuredClone(world);
  world.players.find(player => player.nickname === 'Paker').nickname = '다른닉';
  updateClubNames(world);
  assert.deepEqual(world.clubs, snapshot.clubs);
  const bad = createSave(world);
  bad.world.clubIdentityVersion = 99;
  assert.throws(() => restoreWorld(bad), /구단 이름/);
});

test('사용자가 고른 이름과 충돌하지 않고 Paker가 내 팀/자유계약이어도 명단은 유지한다', () => {
  for (const name of ['P1', 'GEM', 'gem']) {
    const world = sample(42, name);
    assert.equal(world.clubs[0].name, name);
    assert.equal(new Set(world.clubs.map(club => club.name.toUpperCase())).size, 58);
  }
  for (const clubIndex of [0, null]) {
    const world = sample();
    const original = world.players.find(player => player.nickname === 'Paker');
    original.nickname = 'Previous';
    const playerId = clubIndex === null
      ? world.players.find(player => !world.clubs.some(club => club.playerIds.includes(player.id))).id
      : world.clubs[clubIndex].playerIds[0];
    world.players.find(player => player.id === playerId).nickname = 'Paker';
    delete world.clubIdentityVersion;
    const before = structuredClone(world);
    updateClubNames(world);
    assert.deepEqual(withoutNames(world), withoutNames(before));
    assert.equal(world.clubs[0].name, '내 구단');
  }
});
