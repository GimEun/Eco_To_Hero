import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { validateWorld } from '../src/game/validate-world.js';
import { getClubView, getAffiliations } from '../src/game/world-selectors.js';
import { signingFee, recruitPlayer, releasePlayer, replaceStarter } from '../src/game/roster.js';
import { createSave, parseBackup, restoreWorld } from '../src/storage/save-data.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { startEconomyRound } from '../src/simulation/economy.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';

const sample = () => createWorld(createClub('영입 검증').club, 42);
const clubFor = world => world.clubs.find(c => c.id === world.playerClubId);
const candidates = world => { const assigned = getAffiliations(world); return world.players.filter(p => !assigned.has(p.id)).sort((a, b) => signingFee(a) - signingFee(b)); };

test('계약금은 세 능력 평균 제곱×2를 100달러 단위로 반올림한다', () => {
  assert.equal(signingFee({ aim: 45, intelligence: 45, stamina: 45 }), 4100);
  assert.equal(signingFee({ aim: 80, intelligence: 80, stamina: 80 }), 12800);
  assert.equal(signingFee({ aim: 30, intelligence: 45, stamina: 60 }), 4100);
});

test('영입은 구단 자금만 차감하고 후보 등록·단일 소속·선수 600명과 타 구단을 보존한다', () => {
  const world = sample(), club = clubFor(world), player = candidates(world)[0];
  const before = structuredClone(world), lineup = [...club.lineupIds];
  assert.equal(recruitPlayer(world, player.id).ok, true);
  assert.equal(club.balance, before.clubs[0].balance - signingFee(player));
  assert.deepEqual(club.lineupIds, lineup);
  assert.equal(club.playerIds.length, 6);
  assert.deepEqual(world.players, before.players);
  assert.deepEqual(world.clubs.slice(1), before.clubs.slice(1));
  assert.equal(getAffiliations(world).size, 291);
  assert.doesNotThrow(() => validateWorld(world));
  const saved = structuredClone(world);
  assert.equal(recruitPlayer(world, player.id).ok, false);
  assert.equal(recruitPlayer(world, world.clubs[1].playerIds[0]).ok, false);
  assert.equal(recruitPlayer(world, 'missing').ok, false);
  assert.deepEqual(world, saved);
});

test('자금 부족·정원 초과는 상태를 바꾸지 않고 정확한 잔액으로는 영입할 수 있다', () => {
  const world = sample(), club = clubFor(world), player = candidates(world)[0];
  club.balance = signingFee(player) - 1;
  const before = structuredClone(world);
  assert.equal(recruitPlayer(world, player.id).ok, false);
  assert.deepEqual(world, before);
  club.balance++;
  assert.equal(recruitPlayer(world, player.id).ok, true);
  assert.equal(club.balance, 0);
  club.balance = 100000;
  for (const p of candidates(world).slice(0, 2)) assert.equal(recruitPlayer(world, p.id).ok, true);
  const full = structuredClone(world);
  assert.equal(club.playerIds.length, 8);
  assert.equal(recruitPlayer(world, candidates(world)[0].id).ok, false);
  assert.deepEqual(world, full);
});

test('후보는 지정 주전의 자리를 이어받고 8명 명단에서도 경기는 정확히 주전 5명만 사용한다', () => {
  const world = sample(), club = clubFor(world);
  club.balance = 100000;
  const players = candidates(world).slice(0, 3);
  for (const player of players) recruitPlayer(world, player.id);
  const outgoing = club.lineupIds[2];
  assert.equal(replaceStarter(world, players[0].id, outgoing).ok, true);
  assert.equal(club.lineupIds[2], players[0].id);
  assert.ok(club.playerIds.includes(outgoing));
  const home = getClubView(world), away = getClubView(world, world.clubs[1].id);
  assert.equal(home.players.length, 8);
  const state = createPractice(RELAY_MAP, home, away, { match: true, seed: 42 });
  assert.equal(state.actors.length, 10);
  assert.deepEqual(state.actors.filter(a => a.team === 'home').map(a => a.playerId), club.lineupIds);
  assert.equal(state.actors.find(a => a.id === 'home-3').playerId, players[0].id);
  startEconomyRound(state); advancePractice(state, RELAY_MAP, 160000);
  assert.equal(state.complete, true);
  assert.ok(state.match.history.length === 1);
});

test('무효 주전 교체와 방출은 거절하고 주전 방출 시 첫 후보로 채우며 환급하지 않는다', () => {
  const world = sample(), club = clubFor(world);
  const initial = structuredClone(world);
  assert.equal(releasePlayer(world, club.playerIds[0]).ok, false);
  assert.equal(releasePlayer(world, world.clubs[1].playerIds[0]).ok, false);
  assert.equal(replaceStarter(world, candidates(world)[0].id, club.lineupIds[0]).ok, false);
  assert.deepEqual(world, initial);
  const player = candidates(world)[0]; recruitPlayer(world, player.id);
  const balance = club.balance, outgoing = club.lineupIds[0];
  assert.equal(replaceStarter(world, club.lineupIds[1], outgoing).ok, false);
  assert.equal(releasePlayer(world, outgoing).ok, true);
  assert.equal(club.lineupIds[0], player.id);
  assert.equal(club.balance, balance);
  assert.equal(getAffiliations(world).has(outgoing), false);
  assert.equal(releasePlayer(world, outgoing).ok, false);
  assert.doesNotThrow(() => validateWorld(world));
  const bench = candidates(world)[0]; recruitPlayer(world, bench.id);
  const lineup = [...club.lineupIds];
  assert.equal(releasePlayer(world, bench.id).ok, true);
  assert.deepEqual(club.lineupIds, lineup);
});

test('저장 v8은 영입·주전 교체·자금·방출 결과를 왕복 복원한다', () => {
  const world = sample(), club = clubFor(world), player = candidates(world)[0];
  recruitPlayer(world, player.id); replaceStarter(world, player.id, club.lineupIds[1]);
  const saved = createSave(world);
  assert.equal(saved.schemaVersion, 48);
  const restored = restoreWorld(parseBackup(JSON.stringify(saved)));
  assert.deepEqual(restored, world);
  releasePlayer(restored, clubFor(restored).playerIds[0]);
  assert.notDeepEqual(restored, world);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(restored)))), restored);
});

test('v2의 기존 명단·능력·자금·순서를 보존해 주전 5명으로 복원하고 원본을 바꾸지 않는다', () => {
  const world = sample();
  for (const club of world.clubs) delete club.lineupIds;
  const old = { format: 'eco-to-hero', schemaVersion: 2, savedAt: '2026-11-08T00:00:00Z', world };
  const before = structuredClone(old);
  const restored = restoreWorld(parseBackup(JSON.stringify(old)));
  for (let i = 0; i < world.clubs.length; i++) {
    assert.deepEqual(restored.clubs[i].lineupIds, world.clubs[i].playerIds);
    const { lineupIds, ...club } = restored.clubs[i];
    assert.deepEqual(club, world.clubs[i]);
  }
  assert.deepEqual(restored.players, world.players);
  assert.deepEqual(old, before);
  assert.equal(createSave(restored).schemaVersion, 48);
  old.world.clubs[0].playerIds.push(candidates(restored)[0].id);
  assert.throws(() => parseBackup(JSON.stringify(old)));
});

test('v8은 잘못된 주전 참조·중복·누락·정원과 중복 소속을 거절한다', () => {
  for (const change of [
    w => delete w.clubs[0].lineupIds,
    w => { w.clubs[0].lineupIds[0] = w.clubs[0].lineupIds[1]; },
    w => { w.clubs[0].lineupIds[0] = candidates(w)[0].id; },
    w => { w.clubs[0].lineupIds.pop(); },
    w => { w.clubs[0].playerIds.push(...candidates(w).slice(0, 4).map(p => p.id)); },
    w => { w.clubs[0].playerIds.push(w.clubs[1].playerIds[0]); },
  ]) {
    const world = sample(); change(world);
    const before = structuredClone(world);
    assert.throws(() => createSave(world));
    assert.deepEqual(world, before);
  }
});
