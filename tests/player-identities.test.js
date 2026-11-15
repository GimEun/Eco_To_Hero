import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { signingFee } from '../src/game/player-costs.js';
import { PLAYER_NAMES, PLAYER_HANDLES } from '../src/data/player-identities.js';
import { updatePlayerIdentities, PLAYER_IDENTITY_VERSION } from '../src/game/player-identities.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { useDailySchema } from './legacy-fixture.js';
import { recruitPlayer } from '../src/game/roster.js';
import { PLAYER_NICKNAME_GROUPS } from '../src/data/player-nicknames.js';

function gameplay(world) {
  const { playerIdentityVersion, ...rest } = structuredClone(world);
  rest.players = rest.players.map(({ name, nickname, ...player }) => player);
  return rest;
}

test('여러 시드에서 한글 이름·한국/일본/영어권 이름·600개 고유 닉네임·최고 금액 Paker를 생성한다', () => {
  for (const seed of [0, 1, 42, 2026, 0xffffffff]) {
    const world = createWorld(createClub('이름 확인').club, seed);
    assert.equal(world.playerIdentityVersion, PLAYER_IDENTITY_VERSION);
    assert.equal(new Set(world.players.map(p => p.nickname.toLowerCase())).size, 600);
    const paker = world.players.filter(p => p.nickname === 'Paker');
    assert.equal(paker.length, 1);
    assert.equal(paker[0].name, '김상혁');
    assert.equal(signingFee(paker[0]), Math.max(...world.players.map(signingFee)));
    const groups = { western: 0, korean: 0, japanese: 0 };
    for (const [index, player] of world.players.entries()) {
      assert.match(player.name, /^[가-힣 ]+$/u);
      if (player === paker[0]) continue;
      const group = ['western', 'korean', 'western', 'japanese', 'western'][index % 5];
      const pool = PLAYER_NAMES[group];
      assert.ok(pool.first.some(first => player.name.includes(first)));
      assert.ok(pool.last.some(last => player.name.includes(last)));
      groups[group]++;
      assert.match(player.nickname, /^[A-Z][a-z]{1,8}$/);
      assert.ok(PLAYER_NICKNAME_GROUPS.some(group => group.handles.includes(player.nickname)));
    }
    assert.ok(groups.western > 350 && groups.korean > 110 && groups.japanese > 110);
    assert.deepEqual(createWorld(createClub('이름 확인').club, seed), world);
  }
});

test('후보는 영문 최대 9자·전체 고유이며 새 게임은 종류별 비율을 유지하고 시드마다 다르게 배정한다', () => {
  const all = PLAYER_NICKNAME_GROUPS.flatMap(group => group.handles);
  assert.equal(new Set(all.map(handle => handle.toLowerCase())).size, all.length);
  assert.ok(all.every(handle => /^[A-Z][a-z]{1,8}$/.test(handle)));
  assert.ok(!all.some(handle => handle.toLowerCase() === 'paker'));
  assert.equal(PLAYER_NICKNAME_GROUPS.reduce((sum, group) => sum + group.weight, 0), 100);
  const worlds = [1, 42, 2026].map(seed => createWorld(createClub('닉네임 비율').club, seed));
  for (const world of worlds) {
    for (const group of PLAYER_NICKNAME_GROUPS) {
      const count = world.players.filter(player => group.handles.includes(player.nickname)).length;
      const target = 600 * group.weight / 100;
      assert.ok(count === target || count === target - 1, `${group.id}: ${count}`);
    }
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
  assert.notDeepEqual(worlds[0].players.map(player => player.nickname), worlds[1].players.map(player => player.nickname));
});

test('새 게임 닉네임만 달라지며 기존 방식과 실명·능력·팀·계약·경제·일정·Paker는 같다', () => {
  const world = createWorld(createClub('원본 보존').club, 42);
  const legacy = structuredClone(world);
  delete legacy.playerIdentityVersion;
  updatePlayerIdentities(legacy);
  assert.deepEqual(gameplay(world), gameplay(legacy));
  assert.deepEqual(world.players.map(player => player.name), legacy.players.map(player => player.name));
  assert.deepEqual(world.players.find(player => player.nickname === 'Paker'), legacy.players.find(player => player.nickname === 'Paker'));
  assert.notDeepEqual(world.players.map(player => player.nickname), legacy.players.map(player => player.nickname));
  assert.deepEqual(restoreWorld(createSave(legacy)), legacy, '기존 버전 2 저장은 구 닉네임을 그대로 유지한다');
  assert.ok(legacy.players.some(player => PLAYER_HANDLES.includes(player.nickname)
    || PLAYER_HANDLES.some(handle => handle.length === player.nickname.length
      && [...handle.toLowerCase()].filter((letter, i) => letter !== player.nickname[i].toLowerCase()).length <= 1)));
});

test('숫자 접미사가 있는 이름 버전 1 저장은 실명과 Paker를 보존하고 닉네임만 고친다', () => {
  const world = createWorld(createClub('숫자 제거').club, 42);
  world.playerIdentityVersion = 1;
  const pakerId = world.players.find(p => p.nickname === 'Paker').id;
  world.players.forEach((p, i) => { if (p.id !== pakerId) p.nickname = `ORBIT${i}`; });
  world.players[0].name = '실명 유지';
  const save = createSave(world);
  const before = structuredClone(save);
  const restored = restoreWorld(save);
  assert.deepEqual(save, before);
  assert.deepEqual(gameplay(restored), gameplay(world));
  assert.deepEqual(restored.players.map(p => p.name), world.players.map(p => p.name));
  assert.equal(restored.players.find(p => p.nickname === 'Paker').id, pakerId);
  assert.ok(restored.players.every(p => !/\d$/.test(p.nickname)));
  assert.equal(new Set(restored.players.map(p => p.nickname.toLowerCase())).size, 600);
  assert.deepEqual(restoreWorld(createSave(restored)), restored);
});

test('기존 v2/v3/v4 저장의 이름만 갱신하고 능력·소속·후보·계약·자금·원본을 보존한다', () => {
  const world = createWorld(createClub('기존 구단').club, 42);
  const free = world.players.find(p => !world.clubs.some(c => c.playerIds.includes(p.id)) && Math.max(p.aim, p.intelligence, p.stamina) <= 54);
  assert.equal(recruitPlayer(world, free.id).ok, true);
  for (const version of [2, 3, 4]) {
    const save = createSave(world);
    useDailySchema(save, version);
    delete save.world.playerIdentityVersion;
    save.world.players.forEach((p, i) => { p.name = '기존이름'; p.nickname = `OLD${i}`; });
    if (version === 2) {
      save.world.clubs[0].playerIds.pop();
      save.world.clubs.forEach(c => { delete c.lineupIds; delete c.contracts; });
    } else if (version === 3) save.world.clubs.forEach(c => { delete c.contracts; });
    const before = structuredClone(save);
    const restored = restoreWorld(save);
    assert.deepEqual(save, before);
    assert.deepEqual(restored.players.map(({ name, nickname, ...p }) => p), save.world.players.map(({ name, nickname, ...p }) => p));
    if (version === 4) {
      assert.deepEqual(restored.clubs.map(c => c.playerIds), before.world.clubs.map(c => c.playerIds));
      for (const club of restored.clubs) for (const [id, c] of Object.entries(club.contracts)) {
        const old = before.world.clubs.find(item => item.id === club.id).contracts[id];
        assert.equal(c.monthlySalary, old.monthlySalary);
        assert.equal(c.durationDays, Math.ceil(old.durationDays / 7) * 7);
      }
    }
    assert.equal(restored.clubs[0].balance, before.world.clubs[0].balance);
    assert.equal(restored.players.find(p => p.nickname === 'Paker').name, '김상혁');
    const persisted = createSave(restored);
    assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(persisted))), restored);
  }
});

test('이름 버전이 저장되면 다시 변경하지 않으며 최고 금액 동점도 Paker 한 명만 지정한다', () => {
  const world = createWorld(createClub('동점 확인').club, 9);
  delete world.playerIdentityVersion;
  world.players.forEach(p => { p.aim = 50; p.intelligence = 50; p.stamina = 50; });
  updatePlayerIdentities(world);
  assert.equal(world.players.filter(p => p.nickname === 'Paker').length, 1);
  world.players[1].name = '유지할 이름';
  const before = structuredClone(world);
  assert.deepEqual(updatePlayerIdentities(world), before);
  assert.deepEqual(restoreWorld(createSave(world)), before);
  const bad = createSave(world);
  bad.world.playerIdentityVersion = 99;
  assert.throws(() => restoreWorld(bad), /이름 데이터 버전/);
});
