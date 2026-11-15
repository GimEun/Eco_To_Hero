import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { transformSharedBuy } from './shared-autobuy-transform.mjs';
import { createClub } from '../../src/game/create-club.js';
import { createWorld } from '../../src/game/create-world.js';
import { getClubView } from '../../src/game/world-selectors.js';
import { createPractice } from '../../src/simulation/practice.js';
import { startEconomyRound } from '../../src/simulation/economy.js';
import { PRACTICE_MAPS } from '../../src/data/maps/index.js';
test('diagnostic changes only home purchase dispatch and truthful output label', () => {
  const original = fs.readFileSync('scripts/calibrate-opponent-strategy.js', 'utf8').replace(/\r\n/g, '\n');
  const restored = transformSharedBuy(original).replace('for (const actor of []) {', "for (const actor of state.actors.filter(a => a.team === 'home')) {")
    .replace('startEconomyRound(state, { autoHome: true });', 'startEconomyRound(state);')
    .replace("homePurchasePolicy: 'shared-auto', homeManagement, homeChanges,", 'homePurchasePolicy, homeManagement, homeChanges,');
  assert.equal(restored, original); assert.throws(() => transformSharedBuy(original + original));
});
test('real auto-buy gives equal slot/cash pairs equal gear and uses cheap fallback', () => {
  const world = createWorld(createClub('Buy').club, 12203), home = getClubView(world);
  const map = PRACTICE_MAPS.find(map => map.id === 'warehouse');
  const state = createPractice(map, home, structuredClone(home), { match: true, seed: 12203, attackTeam: 'away' });
  const budgets = [1500, 2000, 3350, 4500, 6000];
  for (const actor of state.actors) actor.cash = budgets[actor.number - 1];
  const rngBefore = state.randomState;
  assert.equal(startEconomyRound(state, { autoHome: true }), true);
  const project = actor => ({ weapon: actor.weaponId, armor: actor.armor, cash: actor.cash, utility: actor.throwables });
  for (let i = 1; i <= 5; i++) assert.deepEqual(project(state.actors.find(actor => actor.id === `home-${i}`)), project(state.actors.find(actor => actor.id === `away-${i}`)));
  assert.equal(state.actors.find(actor => actor.id === 'home-1').weaponId, 'smg');
  assert.ok(state.actors.every(actor => actor.cash >= 0)); assert.equal(state.randomState, rngBefore);
});
