import assert from 'node:assert/strict';
import test from 'node:test';
import { retainTradeDestination, tradeHoldSummary, pruneTradeHolds } from './trade-hold.mjs';
const map = { rows: 12, columns: 12, tileSize: 40, walls: [] };
function fixture() {
  const actor = { id: 'home-4', team: 'home', number: 4, alive: true, x: 60, y: 60, radius: 10,
    attackTask: { role: 'support', plan: 'split' }, targetId: null, weaponId: 'basic-pistol' };
  const state = { tick: 100, round: { attackTeam: 'home', bomb: { status: 'carried', carrierId: 'home-3' } }, actors: [actor], randomState: 42 };
  const fresh = { point: { x: 180, y: 60 }, key: 'trade:home-1:4:1', watch: { id: 'away-1', x: 220, y: 60, tick: 100 }, patrol: false, intent: 'trade' };
  return { state, actor, fresh };
}
test('holds fixed observed point without RNG/state changes, expires exactly at 60 ticks', () => {
  const { state, actor, fresh } = fixture();
  const before = structuredClone(state); assert.equal(retainTradeDestination(state, map, actor, fresh), fresh);
  assert.deepEqual(state, before);
  state.tick = 159; const held = retainTradeDestination(state, map, actor, null); assert.deepEqual(held, fresh);
  held.point.x = -1; assert.equal(retainTradeDestination(state, map, actor, null).point.x, 180);
  state.tick = 160; assert.equal(retainTradeDestination(state, map, actor, null), null);
  assert.equal(state.randomState, 42);
});
test('old observation does not refresh deadline, round/team/plan changes cannot reuse cache', () => {
  for (const change of [f => { f.state.round = structuredClone(f.state.round); }, f => { f.state.round.attackTeam = 'away'; }, f => { f.actor.attackTask.plan = 'execute'; }]) {
    const f = fixture(); retainTradeDestination(f.state, map, f.actor, f.fresh); change(f);
    assert.equal(retainTradeDestination(f.state, map, f.actor, null), null);
  }
  const f = fixture(); f.fresh.watch.tick = 80; retainTradeDestination(f.state, map, f.actor, f.fresh);
  f.state.tick = 140; assert.equal(retainTradeDestination(f.state, map, f.actor, null), null);
  const bomb = fixture(); retainTradeDestination(bomb.state, map, bomb.actor, bomb.fresh);
  bomb.state.round.bomb.status = 'dropped'; pruneTradeHolds(bomb.state);
  bomb.state.round.bomb.status = 'carried'; assert.equal(retainTradeDestination(bomb.state, map, bomb.actor, null), null);
});
test('manual/bomb/action/safety/current-combat/arrival/invalid-path priorities stop stale orders', () => {
  const changes = [f => { f.state.manualPlans = { attack: { remaining: 1, players: { 'home-4': {} } } }; },
    f => { f.state.round.bomb.status = 'dropped'; }, f => { f.state.round.bomb.status = 'planted'; },
    f => { f.state.round.bomb.carrierId = f.actor.id; }, f => { f.actor.action = 'plant'; },
    f => { f.actor.entryWaiting = true; }, f => { f.actor.smokeGuarding = true; }, f => { f.actor.retreating = true; },
    f => { f.actor.x = 180; }, f => { f.state.actors.push({ id: 'away-1', team: 'away', alive: true, x: 100, y: 60, radius: 10 }); f.actor.facing = 0; f.actor.fieldOfView = Math.PI; f.actor.viewRange = 200; }];
  for (const change of changes) {
    const f = fixture(); retainTradeDestination(f.state, map, f.actor, f.fresh); f.state.tick++; change(f);
    assert.equal(retainTradeDestination(f.state, map, f.actor, null), null);
  }
  const f = fixture(); retainTradeDestination(f.state, map, f.actor, f.fresh);
  assert.equal(retainTradeDestination(f.state, { ...map, walls: [{ x: 4, y: 1, width: 1, height: 1 }] }, f.actor, null), null);
  assert.equal(tradeHoldSummary(f.state).counts['invalid-path'], 1);
});
