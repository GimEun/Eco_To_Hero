import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { transformDefenseRange, recordRangeGuard, rangeGuardSummary } from './defense-range-transform.mjs';
const original = fs.readFileSync('src/simulation/defense-tactics.js', 'utf8').replace(/\r\n/g, '\n');
test('only enemy range filter and external observation added; HP/retreat rules retained', () => {
  const transformed = transformDefenseRange(original, 'file:///diagnostic.mjs');
  const restored = transformed.replace('import { recordRangeGuard } from "file:///diagnostic.mjs";\n', '')
    .replace('\n    && Math.hypot(actor.x - target.x, actor.y - target.y) <= weaponFor(actor).range', '')
    .replace('  recordRangeGuard(state, actor, enemies, support);\n', '');
  assert.equal(restored, original);
  assert.throws(() => transformDefenseRange(original + original, 'file:///diagnostic.mjs'));
});
test('audit includes low HP even with zero threats and never changes gameplay state', () => {
  const actor = { id: 'home-1', team: 'home', hp: 40, x: 0, y: 0, weaponId: 'basic-pistol', defenseTask: { withdrawn: false, role: 'front', plan: 'forward' } };
  const state = { tick: 10, economy: { roundNumber: 1 }, actors: [actor], randomState: 123 };
  const before = structuredClone(state); recordRangeGuard(state, actor, [], 0);
  assert.deepEqual(state, before); assert.equal(rangeGuardSummary(state)[0].reason, 'low-hp');
  rangeGuardSummary(state)[0].hp = -1; assert.equal(rangeGuardSummary(state)[0].hp, 40);
});
test('pressure audit activates at the same count threshold, not merely seeing one opponent', () => {
  const actor = { id: 'home-1', team: 'home', hp: 100, x: 0, y: 0, weaponId: 'basic-pistol', defenseTask: { withdrawn: false, role: 'front', plan: 'forward' } };
  const state = { tick: 11, economy: { roundNumber: 1 } };
  const enemies = [{ id: 'away-1', x: 100, y: 0 }, { id: 'away-2', x: 110, y: 0 }];
  recordRangeGuard(state, actor, enemies.slice(0, 1), 0); assert.equal(rangeGuardSummary(state).length, 0);
  recordRangeGuard(state, actor, enemies, 2); assert.equal(rangeGuardSummary(state).length, 0);
  recordRangeGuard(state, actor, enemies, 1); assert.equal(rangeGuardSummary(state)[0].reason, 'outnumbered');
});
