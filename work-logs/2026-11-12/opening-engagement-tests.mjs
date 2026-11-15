import assert from 'node:assert/strict';
import test from 'node:test';
import { createClub } from '../../src/game/create-club.js';
import { createWorld } from '../../src/game/create-world.js';
import { getClubView } from '../../src/game/world-selectors.js';
import { createPractice } from '../../src/simulation/practice.js';
import { PRACTICE_MAPS } from '../../src/data/maps/index.js';
import { observeOpening, captureOpeningEvents, openingSummary } from './opening-engagement.mjs';
function fixture() {
  const world = createWorld(createClub('Trace').club, 12203);
  const home = getClubView(world), away = getClubView(world, world.clubs.find(club => club.leagueId === 'pc' && club.id !== world.playerClubId).id);
  return { map: PRACTICE_MAPS.find(map => map.id === 'warehouse'), home, away };
}
test('observation leaves the real simulation state and RNG unchanged', () => {
  const { map, home, away } = fixture();
  const state = createPractice(map, home, away, { match: true, seed: 12203, attackTeam: 'away' });
  const before = structuredClone(state);
  observeOpening(state, map); captureOpeningEvents(state); const record = openingSummary(state);
  assert.deepEqual(state, before); assert.equal(Object.keys(record.actors).length, 10);
  assert.equal(state.randomState, before.randomState);
});
test('event cursor does not duplicate records and snapshots cannot mutate source events', () => {
  const { map, home, away } = fixture();
  const state = createPractice(map, home, away, { match: true, seed: 12203, attackTeam: 'away' });
  state.events.push({ type: 'shot', tick: 1, actorId: 'away-1', targetId: 'home-1', from: { x: 1, y: 2 } });
  captureOpeningEvents(state); captureOpeningEvents(state);
  const first = openingSummary(state); assert.equal(first.events.length, 1);
  first.events[0].from.x = 9;
  assert.equal(state.events[0].from.x, 1); assert.equal(openingSummary(state).events[0].from.x, 1);
});
test('only opening defensive round is observed', () => {
  const { map, home, away } = fixture();
  const state = createPractice(map, home, away, { match: true, seed: 12203, attackTeam: 'home' });
  const before = structuredClone(state); observeOpening(state, map); captureOpeningEvents(state);
  assert.equal(openingSummary(state), null); assert.deepEqual(state, before);
  state.round.attackTeam = 'away'; state.economy.roundNumber = 2;
  observeOpening(state, map); assert.equal(openingSummary(state), null);
});
