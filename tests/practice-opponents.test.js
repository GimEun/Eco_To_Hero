import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPracticeOpponent } from '../src/ui/practice-opponents.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';

const fixture = () => createWorld(createClub('연습 상대 순환').club, 42);

test('같은 리그의 다른 구단만 한 바퀴씩 중복 없이 만나고 바퀴 경계에도 연속 중복하지 않는다', () => {
  const world = fixture(), before = structuredClone(world);
  const expected = world.pcSeason.clubIds.filter(id => id !== world.playerClubId).sort();
  let previous;
  for (let cycle = 0; cycle < 10; cycle++) {
    const picked = expected.map(() => nextPracticeOpponent(world).id);
    assert.notEqual(picked[0], previous);
    assert.deepEqual([...picked].sort(), expected);
    previous = picked.at(-1);
  }
  assert.deepEqual(world, before);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('전역 경기·성장 난수가 아닌 별도 섞기를 사용한다', t => {
  t.mock.method(Math, 'random', () => 0);
  const a = fixture(), b = fixture();
  const first = a.pcSeason.clubIds.filter(id => id !== a.playerClubId).sort();
  const aPicks = first.map(() => nextPracticeOpponent(a).id);
  t.mock.method(Math, 'random', () => 0.999);
  const bPicks = first.map(() => nextPracticeOpponent(b).id);
  assert.notDeepEqual(aPicks, bPicks);
  assert.equal(a.actionRandomState, b.actionRandomState);
  assert.equal(a.seed, b.seed);
});

test('리그 진출 직후에는 원래 소속 대신 현재 시즌 참가 구단만 상대하며 명단 변경도 반영한다', () => {
  const world = fixture();
  nextPracticeOpponent(world);
  const cityIds = world.clubs.filter(club => club.leagueId === 'city').slice(0, 9).map(club => club.id);
  world.citySeason = { leagueId: 'city', clubIds: [world.playerClubId, ...cityIds] };
  assert.deepEqual(cityIds.map(() => nextPracticeOpponent(world).id).sort(), [...cityIds].sort());
  const replacement = world.clubs.find(club => club.leagueId === 'city' && !cityIds.includes(club.id)).id;
  world.citySeason.clubIds = [world.playerClubId, replacement];
  for (let i = 0; i < 3; i++) assert.equal(nextPracticeOpponent(world).id, replacement);
});

test('단일 상대는 재사용하고 상대가 없으면 명확한 오류를 반환한다', () => {
  const world = fixture();
  const id = world.pcSeason.clubIds.find(id => id !== world.playerClubId);
  world.pcSeason.clubIds = [world.playerClubId, id];
  assert.equal(nextPracticeOpponent(world).id, id);
  assert.equal(nextPracticeOpponent(world).id, id);
  world.pcSeason.clubIds = [world.playerClubId];
  assert.throws(() => nextPracticeOpponent(world), /같은 리그/);
});
