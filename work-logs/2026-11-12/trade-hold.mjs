import { canOccupy, findPath, reachedDestination } from '../../src/simulation/geometry.js';
import { selectTarget } from '../../src/simulation/combat.js';
import { manualPlanFor } from '../../src/simulation/manual-tactics.js';
import { ROUND_RULES } from '../../src/config/round.js';
const caches = new WeakMap(), audits = new WeakMap();
function audit(state, actor, type, extra = {}) {
  if (!audits.has(state.round)) audits.set(state.round, { counts: {}, samples: [] });
  const value = audits.get(state.round); value.counts[type] = (value.counts[type] ?? 0) + 1;
  if (value.samples.length < 40 && type === 'held') value.samples.push({ tick: state.tick, actorId: actor.id, type, ...extra });
}
export function retainTradeDestination(state, map, actor, fresh) {
  const round = state.round;
  if (!round || !map) return fresh;
  if (!caches.has(round)) caches.set(round, new Map());
  const cache = caches.get(round), task = actor.attackTask;
  const partnerId = `${actor.team}-${actor.number - 3}`;
  const identity = `${round.attackTeam}:${partnerId}:${task?.plan}`;
  const blocked = !actor.alive || actor.team !== round.attackTeam || task?.role !== 'support'
    || manualPlanFor(state, actor) || actor.entryWaiting || actor.retreating || actor.smokeGuarding || actor.flashThreat
    || round.bomb.status !== 'carried' || round.bomb.carrierId === actor.id || round.recovererId === actor.id || actor.action
    || state.tick >= ROUND_RULES.limitTicks - ROUND_RULES.plantTicks - 200;
  if (blocked) { cache.delete(actor.id); audit(state, actor, 'priority'); return fresh; }
  if (fresh) {
    const tick = fresh.watch?.tick;
    if (Number.isFinite(tick) && tick <= state.tick && state.tick - tick < 60 && !reachedDestination(actor, fresh.point)) {
      cache.set(actor.id, { identity, observedTick: tick, result: structuredClone(fresh) }); audit(state, actor, 'fresh');
    } else cache.delete(actor.id);
    return fresh;
  }
  const remembered = cache.get(actor.id);
  if (!remembered) return null;
  const age = state.tick - remembered.observedTick;
  if (remembered.identity !== identity || age < 0 || age >= 60 || reachedDestination(actor, remembered.result.point)) {
    cache.delete(actor.id); audit(state, actor, 'expired-or-arrived'); return null;
  }
  // Current combat keeps its ordinary facing/position logic; no stale watch override.
  if (selectTarget(state, map, actor)) { cache.delete(actor.id); audit(state, actor, 'own-combat'); return null; }
  const point = remembered.result.point;
  const goal = { x: Math.floor(point.x / map.tileSize), y: Math.floor(point.y / map.tileSize) };
  if (!canOccupy(map, point.x, point.y, actor.radius) || !findPath(map,
    { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) }, goal, actor.radius).length) {
    cache.delete(actor.id); audit(state, actor, 'invalid-path'); return null;
  }
  audit(state, actor, 'held', { observedTick: remembered.observedTick, age, point: { ...point }, key: remembered.result.key });
  return structuredClone(remembered.result);
}
export function tradeHoldSummary(state) {
  return structuredClone(audits.get(state.round) ?? { counts: {}, samples: [] });
}
export function pruneTradeHolds(state) {
  const cache = caches.get(state.round);
  if (!cache) return;
  for (const actor of state.actors) {
    if (state.round.bomb.status !== 'carried' || state.round.attackTeam !== actor.team || !actor.alive
      || state.round.bomb.carrierId === actor.id || state.round.recovererId === actor.id || actor.action || manualPlanFor(state, actor)) cache.delete(actor.id);
  }
}
