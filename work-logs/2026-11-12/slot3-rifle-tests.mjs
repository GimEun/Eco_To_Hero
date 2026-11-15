import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { transformPreference } from './slot3-rifle-transform.mjs';
import { startEconomyRound } from '../../src/simulation/economy.js';
import { emptyThrowables } from '../../src/data/throwables.js';
test('only third-slot preferred ID changes', () => {
  const original = fs.readFileSync('src/simulation/economy.js', 'utf8');
  const changed = transformPreference(original);
  assert.equal(changed.replace("['training-rifle', 'smg', 'training-rifle', 'machine-gun', 'sniper']", "['training-rifle', 'smg', 'shotgun', 'machine-gun', 'sniper']"), original);
  assert.throws(() => transformPreference(original + original));
});
test('loaded diagnostic selects rifle/fallback identically for both teams and retains survivors', () => {
  for (const [cash, weapon] of [[1500, 'smg'], [1800, 'smg'], [2700, 'training-rifle'], [4000, 'training-rifle']]) {
    const actors = ['home', 'away'].map(team => ({ id: `${team}-3`, team, number: 3, alive: true,
      weaponId: 'basic-pistol', cash, armor: 0, throwables: emptyThrowables(), weaponPurchaseCost: 0 }));
    const state = { tick: 0, complete: false, economy: { phase: 'buy', roundNumber: 1, ledger: [] }, actors, randomState: 42 };
    assert.equal(startEconomyRound(state, { autoHome: true }), true);
    assert.ok(actors.every(actor => actor.weaponId === weapon && actor.cash >= 0));
    assert.equal(actors[0].cash, actors[1].cash); assert.equal(state.randomState, 42);
  }
  const actor = { id: 'home-3', team: 'home', number: 3, alive: true, weaponId: 'shotgun', cash: 5000, armor: 100, throwables: emptyThrowables() };
  const state = { tick: 0, complete: false, economy: { phase: 'buy', roundNumber: 2, ledger: [] }, actors: [actor] };
  startEconomyRound(state, { autoHome: true }); assert.equal(actor.weaponId, 'shotgun');
});
