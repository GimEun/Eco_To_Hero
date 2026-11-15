import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateBuyCash } from './analyze-round-equipment.mjs';
const empty = { smoke: 0, grenade: 0, flashbang: 0 };
test('new/dead player armor and utility costs reconstruct starting cash', () => {
  const gear = { id: 'home-1', weapon: 'basic-pistol', armor: 100, cash: 50, utility: { smoke: 1, grenade: 1, flashbang: 0 } };
  const value = estimateBuyCash(gear, null, null, [], true);
  assert.equal(value.min, 1300); assert.equal(value.max, 1300);
});
test('surviving equipment is retained; unknown armor repair remains a bound', () => {
  const gear = { id: 'home-1', weapon: 'training-rifle', armor: 100, cash: 100, utility: { ...empty, smoke: 1 } };
  const previous = structuredClone(gear);
  const value = estimateBuyCash(gear, previous, { alive: true }, [], false);
  assert.equal(value.weaponCost, 0); assert.equal(value.utilityCost, 0);
  assert.equal(value.min, 100); assert.equal(value.max, 750);
});
test('used throwable is counted as repurchased; reset removes all carried gear', () => {
  const gear = { id: 'home-1', weapon: 'training-rifle', armor: 100, cash: 0, utility: { ...empty, smoke: 1 } };
  const previous = structuredClone(gear);
  assert.equal(estimateBuyCash(gear, previous, { alive: true }, [{ actorId: gear.id, kind: 'smoke' }], false).utilityCost, 300);
  const reset = estimateBuyCash(gear, previous, { alive: true }, [], true);
  assert.equal(reset.weaponCost, 2700); assert.equal(reset.min, 3650); assert.equal(reset.max, 3650);
});
test('uncertain surviving armor repair cannot exceed the configured cash cap', () => {
  const gear = { id: 'home-1', weapon: 'training-rifle', armor: 100, cash: 15900, utility: empty };
  const value = estimateBuyCash(gear, gear, { alive: true }, [], false);
  assert.equal(value.min, 15900); assert.equal(value.max, 16000);
});
