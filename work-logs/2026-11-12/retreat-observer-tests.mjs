import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorld } from '../../src/game/create-world.js';
import { createClub } from '../../src/game/create-club.js';
import { getClubView } from '../../src/game/world-selectors.js';
import { createPractice } from '../../src/simulation/practice.js';
import { PRACTICE_MAPS } from '../../src/data/maps/index.js';
import { observeRetreat, captureRetreat, retreatSummary } from './retreat-observer.mjs';
function fixture() {
  const world = createWorld(createClub('Trace').club, 12203), home = getClubView(world);
  const away = getClubView(world, world.clubs.find(club => club.leagueId === 'pc' && club.id !== world.playerClubId).id);
  const map = PRACTICE_MAPS.find(map => map.id === 'warehouse');
  return { map, state: createPractice(map, home, away, { match: true, seed: 12203, attackTeam: 'away' }) };
}
test('retreat observation preserves state/RNG, handles thresholds without duplicate transitions', () => {
  const { map, state } = fixture(); const before = structuredClone(state);
  observeRetreat(state, map); captureRetreat(state); observeRetreat(state, map); captureRetreat(state);
  assert.deepEqual(state, before); assert.equal(retreatSummary(state).transitions.length, 10);
  state.actors[0].hp = 40; observeRetreat(state, map);
  assert.equal(retreatSummary(state).transitions.length, 11);
});
test('events copied once; external snapshot mutation cannot change state or observation', () => {
  const { map, state } = fixture(); observeRetreat(state, map);
  state.events.push({ type: 'shot', tick: 1, actorId: 'home-1', targetId: 'away-1', hit: false });
  captureRetreat(state); captureRetreat(state);
  const observation = retreatSummary(state); assert.equal(observation.shots.length, 1);
  observation.shots[0].actor.hp = -1;
  assert.equal(state.actors[0].hp, 100); assert.equal(retreatSummary(state).shots[0].actor.hp, 100);
});
test('later rounds and attacking openings remain unobserved', () => {
  const { map, state } = fixture(); state.economy.roundNumber = 2;
  const before = structuredClone(state); observeRetreat(state, map); captureRetreat(state);
  assert.equal(retreatSummary(state), null); assert.deepEqual(state, before);
  state.economy.roundNumber = 1; state.round.attackTeam = 'home';
  observeRetreat(state, map); assert.equal(retreatSummary(state), null);
});
