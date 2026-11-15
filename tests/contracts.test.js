import test from 'node:test';
import assert from 'node:assert/strict';
import { createContract, renewContract } from '../src/game/contracts.js';
import { signingFee, recruitPlayer, releasePlayer, replaceStarter } from '../src/game/roster.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getAffiliations, getClubView } from '../src/game/world-selectors.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { contractsPanel } from '../src/ui/contracts-panel.js';

const sample = () => createWorld(createClub('계약 검증').club, 42);
const freePlayer = world => { const affiliations = getAffiliations(world); return world.players.filter(p => !affiliations.has(p.id)).sort((a, b) => signingFee(a) - signingFee(b))[0]; };

test('기본 84일·28/84/168일과 계약금 10% 월급을 계산한다', () => {
  const player = { aim: 45, intelligence: 45, stamina: 45 };
  assert.deepEqual(createContract(player), { durationDays: 84, remainingDays: 84, monthlySalary: 410, acquiredDay: null });
  assert.deepEqual(createContract({ aim: 80, intelligence: 80, stamina: 80 }, 168), { durationDays: 168, remainingDays: 168, monthlySalary: 1280, acquiredDay: null });
  for (const days of [28, 84, 168]) assert.equal(createContract(player, days).durationDays, days);
  for (const days of [0, 60, '84', NaN]) assert.throws(() => createContract(player, days));
});

test('초기 소속 선수마다 계약이 있고 자유계약 선수에는 없다', () => {
  const world = sample();
  const affiliations = getAffiliations(world);
  for (const club of world.clubs) {
    assert.deepEqual(Object.keys(club.contracts), club.playerIds);
    for (const id of club.playerIds) assert.deepEqual(club.contracts[id], createContract(world.players.find(p => p.id === id)));
  }
  assert.equal(affiliations.size, 290);
  assert.ok(world.clubs.every(club => !Object.hasOwn(club.contracts, freePlayer(world).id)));
});

test('영입·주전 교체·재계약·방출과 재영입은 계약/명단 정합성을 유지한다', () => {
  const world = sample(), club = world.clubs[0], player = freePlayer(world);
  recruitPlayer(world, player.id);
  assert.deepEqual(club.contracts[player.id], createContract(player, undefined, world.day));
  const initial = structuredClone(club.contracts[player.id]);
  replaceStarter(world, player.id, club.lineupIds[0]);
  assert.deepEqual(club.contracts[player.id], initial);
  const original = structuredClone(world);
  assert.equal(renewContract(world, player.id, 168).ok, true);
  assert.equal(club.contracts[player.id].durationDays, 168);
  const expected = structuredClone(original);
  expected.clubs[0].contracts[player.id].durationDays = 168;
  expected.clubs[0].contracts[player.id].remainingDays = 168;
  assert.deepEqual(world, expected);
  // 같은 명령 반복도 비용·월급·기간을 추가로 누적하지 않는다.
  renewContract(world, player.id, 168);
  assert.deepEqual(world, expected);
  releasePlayer(world, player.id);
  assert.equal(Object.hasOwn(club.contracts, player.id), false);
  assert.equal(getAffiliations(world).has(player.id), false);
  recruitPlayer(world, player.id);
  assert.deepEqual(club.contracts[player.id], createContract(player, undefined, world.day));
  assert.doesNotThrow(() => createSave(world));
});

test('타 구단·자유계약·미존재 선수와 잘못된 기간의 재계약은 변경 없이 거절한다', () => {
  const world = sample(), before = structuredClone(world), ownId = world.clubs[0].playerIds[0];
  for (const id of [world.clubs[1].playerIds[0], freePlayer(world).id, 'missing']) assert.equal(renewContract(world, id, 28).ok, false);
  for (const days of [0, -1, 29, 60, 181, '84', null, NaN]) assert.equal(renewContract(world, ownId, days).ok, false);
  assert.deepEqual(world, before);
  world.clubs[0].balance = 0;
  assert.equal(renewContract(world, ownId, 28).ok, true);
  assert.equal(world.clubs[0].balance, 0);
});

test('v8은 재계약 조건·월급·명단·자금을 왕복하며 잘못된 계약을 거절한다', () => {
  const world = sample(), id = world.clubs[0].playerIds[0];
  renewContract(world, id, 28);
  const saved = createSave(world);
  assert.equal(saved.schemaVersion, 47);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(saved))), world);
  for (const change of [
    w => delete w.clubs[0].contracts,
    w => delete w.clubs[0].contracts[id],
    w => { w.clubs[0].contracts[freePlayer(w).id] = createContract(w.players[0]); },
    w => { w.clubs[0].contracts[id].durationDays = 31; },
    w => { w.clubs[0].contracts[id].monthlySalary = -10; },
    w => { w.clubs[0].contracts[id].monthlySalary = '410'; },
    w => { w.clubs[0].contracts[id].monthlySalary = 411; },
    w => { w.clubs[0].contracts[id].monthlySalary = Number.MAX_SAFE_INTEGER + 1; },
  ]) {
    const broken = structuredClone(world); change(broken);
    const before = structuredClone(broken);
    assert.throws(() => createSave(broken));
    assert.deepEqual(broken, before);
  }
});

test('v2/v3 복원은 계약만 추가하고 선수·구단 자금·주전·후보·순서를 보존한다', () => {
  for (const version of [2, 3]) {
    const source = sample();
    if (version === 3) {
      const player = freePlayer(source); recruitPlayer(source, player.id); replaceStarter(source, player.id, source.clubs[0].lineupIds[2]);
    }
    for (const club of source.clubs) { delete club.contracts; if (version === 2) delete club.lineupIds; }
    const legacy = { format: 'eco-to-hero', schemaVersion: version, savedAt: '2026-11-08T00:00:00Z', world: source };
    const before = structuredClone(legacy);
    const restored = restoreWorld(parseBackup(JSON.stringify(legacy)));
    assert.deepEqual(legacy, before);
    assert.deepEqual(restored.players, source.players);
    assert.equal(restored.seed, source.seed);
    for (let i = 0; i < source.clubs.length; i++) {
      const { contracts, ...club } = restored.clubs[i];
      const expected = { ...source.clubs[i], lineupIds: source.clubs[i].lineupIds ?? source.clubs[i].playerIds };
      assert.deepEqual(club, expected);
      assert.deepEqual(Object.keys(contracts), club.playerIds);
      assert.ok(Object.values(contracts).every(c => c.durationDays === 84));
    }
    assert.equal(createSave(restored).schemaVersion, 47);
  }
});

test('계약 ID가 특수 객체 키여도 원래 객체 구조를 바꾸지 않고 저장한다', () => {
  const world = sample(), player = freePlayer(world);
  player.id = '__proto__';
  recruitPlayer(world, player.id);
  assert.equal(Object.hasOwn(world.clubs[0].contracts, player.id), true);
  assert.equal(renewContract(world, player.id, 28).ok, true);
  const restored = restoreWorld(parseBackup(JSON.stringify(createSave(world))));
  assert.equal(restored.clubs[0].contracts[player.id].durationDays, 28);
  assert.equal({}.durationDays, undefined);
});

test('계약 표는 실제 저장 조건·선택 기간·비차감 안내를 표시하고 이름과 ID를 이스케이프한다', () => {
  const world = sample(), id = world.clubs[0].playerIds[0];
  renewContract(world, id, 168);
  world.players.find(p => p.id === id).nickname = '<img src=x onerror=bad>';
  const candidate = freePlayer(world);
  candidate.id = 'contract" onclick="bad';
  recruitPlayer(world, candidate.id);
  const markup = contractsPanel(getClubView(world));
  assert.match(markup, /24주/);
  assert.match(markup, /value="168" selected/);
  assert.match(markup, /내 팀 급여는 구단 재정에서 매주 정산합니다/);
  assert.match(markup, /data-action="renew-contract"/);
  assert.match(markup, /&lt;img/);
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /data-player-id="contract&quot; onclick=&quot;bad"/);
});
