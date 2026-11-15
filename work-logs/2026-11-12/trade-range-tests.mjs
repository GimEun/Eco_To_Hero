import assert from 'node:assert/strict';
import test from 'node:test';
import { fitTradePoint, tradeRangeSummary } from './trade-range-point.mjs';
import { rayDistance } from '../../src/simulation/geometry.js';
const map = { rows: 12, columns: 12, tileSize: 40, walls: [] };
function fixture(team = 'home') {
  return { state: { tick: 100, round: {}, randomState: 42, actors: [{ id: 'hidden', x: 400, y: 400 }] },
    actor: { id: `${team}-4`, team, x: 60, y: 100, radius: 10, weaponId: 'basic-pistol' },
    support: { point: { x: 100, y: 100 }, key: 'trade:test', watch: { tick: 100, id: 'observed', x: 300, y: 100 } } };
}
test('selects within two tiles and weapon range, preserves input/RNG, ignores hidden enemy changes', () => {
  const f = fixture(), before = structuredClone(f);
  const result = fitTradePoint(f.state, map, f.actor, f.support);
  assert.deepEqual(f, before); assert.deepEqual(result.point, { x: 140, y: 100 });
  assert.ok(Math.hypot(result.point.x - 300, result.point.y - 100) <= 160);
  f.state.actors[0].x = -100; assert.deepEqual(fitTradePoint(f.state, map, f.actor, f.support), result);
  const away = fixture('away'); assert.deepEqual(fitTradePoint(away.state, map, away.actor, away.support).point, result.point);
});
test('valid original/future or expired contact/no fresh support remain unchanged', () => {
  const f = fixture(); assert.equal(fitTradePoint(f.state, map, f.actor, null), null);
  for (const tick of [79, 101]) { f.support.watch.tick = tick; assert.equal(fitTradePoint(f.state, map, f.actor, f.support), f.support); }
  f.support.watch.tick = 100; f.support.watch.x = 200;
  assert.equal(fitTradePoint(f.state, map, f.actor, f.support), f.support);
  f.support.watch.x = 450; assert.equal(fitTradePoint(f.state, map, f.actor, f.support), f.support);
});
test('walls cannot be bypassed by a shooting point without clear ray/path', () => {
  const f = fixture(); const blocked = { ...map, walls: [{ x: 5, y: 0, width: 1, height: 12 }] };
  assert.equal(fitTradePoint(f.state, blocked, f.actor, f.support), f.support);
  assert.equal(tradeRangeSummary(f.state).counts['no-fit'], 1);
  const open = fitTradePoint(f.state, map, f.actor, f.support);
  assert.equal(rayDistance(map, open.point, 0, 160), 160);
});
