import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { createSave, parseBackup, restoreWorld } from '../src/storage/save-data.js';
import { getAffiliations } from '../src/game/world-selectors.js';
import { transferQuote } from '../src/game/transfers.js';
import { rosterTable } from '../src/ui/screens.js';

test('새 구단·세계의 선수와 저장·명단 표에 고정 포지션이 없다', () => {
  const club = createClub('No positions').club;
  assert.ok(club.players.every(player => !Object.hasOwn(player, 'role')));
  const world = createWorld(club, 42);
  assert.ok(world.players.every(player => !Object.hasOwn(player, 'role')));
  assert.deepEqual(restoreWorld(createSave(world)), world);
  const table = rosterTable(world.players.slice(0, 5));
  assert.doesNotMatch(table, /포지션|roster-role|role-label|undefined/);
});

test('기존 저장의 포지션만 제외하고 600명 선수·Paker·명단·재정·일정을 보존한다', () => {
  const world = createWorld(createClub('Old world').club, 42);
  const old = createSave(world);
  old.world.players.forEach((player, index) => { player.role = ['엔트리', '스나이퍼', 'IGL', '서포트', '러커'][index % 5]; });
  const before = structuredClone(old);
  const restored = restoreWorld(parseBackup(JSON.stringify(old)));
  assert.deepEqual(restored, world);
  assert.deepEqual(old, before);
  assert.ok(createSave(restored).world.players.every(player => !Object.hasOwn(player, 'role')));
});

test('v1 구단 저장도 기존 포지션을 요구하지 않고 보유 선수 능력과 자금을 보존한다', () => {
  const club = createClub('Old club').club;
  club.players.forEach(player => { player.role = '엔트리'; });
  const old = { format: 'eco-to-hero', schemaVersion: 1, savedAt: '2026-11-10T00:00:00Z', club };
  const before = structuredClone(old);
  const restored = restoreWorld(old);
  assert.deepEqual(old, before);
  assert.equal(restored.clubs[0].balance, club.balance);
  for (const player of club.players) {
    const actual = restored.players.find(item => item.id === player.id);
    for (const key of ['aim', 'intelligence', 'stamina']) assert.equal(actual[key], player[key]);
    assert.equal(Object.hasOwn(actual, 'role'), false);
  }
});

test('이적 대체 선수는 과거 포지션이 달라도 영입 기준·능력 조건을 충족하면 가능하다', () => {
  const world = createWorld(createClub('Transfer').club, 42);
  const target = world.players.find(player => player.id === world.clubs[1].playerIds[0]);
  target.aim = target.intelligence = target.stamina = 40;
  target.role = '엔트리';
  const assigned = getAffiliations(world);
  const free = world.players.filter(player => !assigned.has(player.id));
  free.forEach(player => { player.aim = player.intelligence = player.stamina = 99; });
  const replacement = free[0];
  replacement.aim = replacement.intelligence = replacement.stamina = 40;
  replacement.role = '서포트';
  assert.equal(transferQuote(world, target.id).replacement.id, replacement.id);
});
