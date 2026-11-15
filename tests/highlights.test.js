import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRound } from '../src/simulation/highlights.js';
import { matchPlayerMetrics, updateMatch } from '../src/simulation/match.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createPractice, advancePractice, stepPractice } from '../src/simulation/practice.js';
import { startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { RELAY_MAP as map } from '../src/data/maps/relay.js';
import { renderHighlights } from '../src/ui/match-highlights.js';

function sample() {
  const world = createWorld(createClub('요약 검증').club, 42);
  return createPractice(map, getClubView(world), getClubView(world, world.clubs[1].id), { match: true, seed: 42 });
}

test('실제 형식 이벤트에서 첫 처치·최종 멀티킬·설치/해체·승패만 복사하고 같은 틱 순서를 보존한다', () => {
  const events = [
    { type: 'shot', tick: 1, actorId: 'home-1' },
    { type: 'death', tick: 2, killerId: 'home-2', actorId: 'away-1' },
    { type: 'death', tick: 2, killerId: 'away-2', actorId: 'home-3' },
    { type: 'death', tick: 3, killerId: 'home-2', actorId: 'away-3' },
    { type: 'bomb-planted', tick: 4, actorId: 'home-1' },
    { type: 'death', tick: 5, killerId: 'home-2', actorId: 'away-4' },
    { type: 'death', tick: 6, killerId: 'home-2', actorId: 'away-5' },
    { type: 'bomb-defused', tick: 7, actorId: 'away-2' },
    { type: 'round-end', tick: 7, winner: 'away', reason: 'defused' },
  ];
  const original = structuredClone(events);
  const summary = summarizeRound(events);
  assert.deepEqual(summary, [
    { type: 'first-kill', tick: 2, actorId: 'home-2', targetId: 'away-1' },
    { type: 'bomb-planted', tick: 4, actorId: 'home-1' },
    { type: 'multi-kill', tick: 6, actorId: 'home-2', kills: 4 },
    { type: 'bomb-defused', tick: 7, actorId: 'away-2' },
    { type: 'round-end', tick: 7, winner: 'away', reason: 'defused' },
  ]);
  assert.deepEqual(events, original);
  events[4].actorId = 'changed';
  assert.equal(summary[1].actorId, 'home-1');
});

test('처치가 없거나 2킬일 때 첫 처치나 멀티킬을 꾸며내지 않으며 종료 이유를 유지한다', () => {
  const ending = { type: 'round-end', tick: 2300, winner: 'away', reason: 'timeout' };
  assert.deepEqual(summarizeRound([ending]), [ending]);
  assert.deepEqual(summarizeRound([]), []);
  const summary = summarizeRound([
    { type: 'death', tick: 10, actorId: 'away-1', killerId: 'home-1' },
    { type: 'death', tick: 20, actorId: 'away-2', killerId: 'home-1' }, ending,
  ]);
  assert.equal(summary.filter(e => e.type === 'first-kill').length, 1);
  assert.equal(summary.some(e => e.type === 'multi-kill'), false);
});

test('명중률은 진행 중 누적하고 ADR은 완료 라운드만 사용하며 후반·반복 연장·최종 기록을 보존한다', () => {
  const state = sample();
  const actor = state.actors[0];
  assert.equal(matchPlayerMetrics(state, actor).accuracy, null);
  assert.equal(matchPlayerMetrics(state, actor).adr, null);
  const winners = [...Array(12).fill('home'), ...Array(12).fill('away'),
    ...Array(3).fill('home'), ...Array(3).fill('away'), ...Array(4).fill('home')];
  let damage = 0;
  let previousHighlights;
  for (let i = 0; i < winners.length; i++) {
    if (i) nextEconomyRound(state, map);
    startEconomyRound(state);
    actor.stats.damage = 100 + i;
    actor.stats.shots = 10; actor.stats.hits = 4;
    assert.equal(matchPlayerMetrics(state, actor).accuracy, 40);
    assert.equal(matchPlayerMetrics(state, actor).adr, i ? damage / i : null);
    for (const player of state.actors) if (player.team !== winners[i]) { player.alive = false; player.hp = 0; }
    stepPractice(state, map);
    damage += 100 + i;
    assert.equal(matchPlayerMetrics(state, actor).adr, damage / (i + 1));
    assert.equal(matchPlayerMetrics(state, actor).shots, (i + 1) * 10);
    const round = state.match.history.at(-1);
    assert.deepEqual(round.highlights, [{ type: 'round-end', tick: 1, winner: winners[i], reason: state.endReason }]);
    updateMatch(state); updateMatch(state);
    assert.equal(state.match.history.length, i + 1);
    if (previousHighlights) assert.deepEqual(state.match.history[0].highlights, previousHighlights);
    else previousHighlights = structuredClone(round.highlights);
  }
  assert.equal(state.match.complete, true);
  const before = structuredClone(state);
  advancePractice(state, map, 160000); updateMatch(state);
  assert.deepEqual(state, before);
});

test('실제 경기 요약과 수치는 발사·사망·폭탄 이벤트와 일치하고 이름을 HTML로 해석하지 않는다', () => {
  const state = sample();
  startEconomyRound(state); advancePractice(state, map, 160000);
  assert.equal(state.complete, true);
  const round = state.match.history[0];
  const deaths = state.events.filter(e => e.type === 'death' && !e.friendlyFire);
  const first = round.highlights.find(e => e.type === 'first-kill');
  assert.equal(first.actorId, deaths[0].killerId);
  for (const actor of state.actors) {
    const metrics = matchPlayerMetrics(state, actor);
    const shots = state.events.filter(e => e.type === 'shot' && e.actorId === actor.id);
    assert.equal(metrics.shots, shots.length);
    assert.equal(metrics.hits, shots.filter(e => e.hit).length);
    const grenadeDamage = state.events.filter(e => e.type === 'grenade-hit' && e.actorId === actor.id && !e.friendlyFire).reduce((sum, e) => sum + e.damage, 0);
    assert.equal(metrics.adr, shots.reduce((sum, e) => sum + e.damage, 0) + grenadeDamage);
    const kills = deaths.filter(e => e.killerId === actor.id).length;
    const multi = round.highlights.find(e => e.type === 'multi-kill' && e.actorId === actor.id);
    assert.equal(multi?.kills ?? 0, kills >= 3 ? kills : 0);
  }
  const objectiveEvents = state.events.filter(e => ['bomb-planted', 'bomb-defused'].includes(e.type));
  assert.deepEqual(round.highlights.filter(e => ['bomb-planted', 'bomb-defused'].includes(e.type)),
    objectiveEvents.map(({ type, tick, actorId }) => ({ type, tick, actorId })));
  state.actors.find(a => a.id === first.actorId).nickname = '<img src=x onerror=bad>';
  const list = { innerHTML: '' };
  renderHighlights({ querySelector: () => list }, state);
  assert.match(list.innerHTML, /&lt;img/);
  assert.doesNotMatch(list.innerHTML, /<img/);
});
