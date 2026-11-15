import { selectTarget } from '../../src/simulation/combat.js';
import { canOccupy, cellCenter, findPath } from '../../src/simulation/geometry.js';
const traces = new WeakMap();
const enabled = state => state.economy?.roundNumber === 1 && state.round?.attackTeam === 'home';
function get(state) {
  if (!traces.has(state)) traces.set(state, { cursor: 0, commitment: null, events: [], supports: {} });
  return traces.get(state);
}
function actorView(actor) {
  return { id: actor.id, alive: actor.alive, x: actor.x, y: actor.y, targetId: actor.targetId,
    role: actor.attackTask?.role, stage: actor.attackTask?.stage, points: actor.attackTask?.points.length,
    waiting: actor.entryWaiting, objective: actor.objectiveKey, moving: actor.moving };
}
export function observeEntrySupport(state, map) {
  if (!enabled(state)) return;
  const data = get(state), coordination = state.round.attackCoordination;
  if (!data.commitment && coordination?.committed) data.commitment = { observedTick: state.tick,
    ...structuredClone(coordination), actors: state.actors.filter(actor => actor.team === 'home').map(actorView) };
  for (const actor of state.actors.filter(actor => actor.team === 'home' && actor.attackTask?.role === 'support')) {
    const record = data.supports[actor.id] ??= { firstPartnerEligible: null, firstKnownContact: null, firstValidTradePoint: null,
      firstTradeObjective: null, firstOwnEligible: null, statuses: {}, firstStatus: {} };
    if (!actor.alive) continue;
    const entry = state.actors.find(ally => ally.team === actor.team && ally.number === actor.number - 3);
    const target = entry?.alive ? selectTarget(state, map, entry) : null;
    const context = () => ({ tick: state.tick, support: actorView(actor), entry: entry ? actorView(entry) : null,
      distanceToEntry: entry ? Math.hypot(actor.x - entry.x, actor.y - entry.y) : null });
    if (target && !record.firstPartnerEligible) record.firstPartnerEligible = context();
    if (actor.objectiveKey?.startsWith('trade:') && !record.firstTradeObjective) record.firstTradeObjective = context();
    if (selectTarget(state, map, actor) && !record.firstOwnEligible) record.firstOwnEligible = context();
    let status;
    if (!coordination?.committed) status = 'not-committed';
    else if (!entry) status = 'no-partner';
    else {
      const death = state.events.findLast(event => event.type === 'death' && event.actorId === entry.id && state.tick - event.tick <= 40);
      const contact = (state.round.attackContacts ?? []).find(item => state.tick - item.tick <= 20 && item.id === (death?.killerId ?? entry.targetId));
      if (!contact) status = 'no-recent-matching-contact';
      else if (!death && (!entry.alive || !target)) status = 'partner-not-engaged';
      else {
        if (!record.firstKnownContact) record.firstKnownContact = { ...context(), contact: { ...contact } };
        const dx = contact.x - entry.x, dy = contact.y - entry.y, length = Math.hypot(dx, dy) || 1;
        const sign = actor.number === 4 ? 1 : -1;
        const point = { x: entry.x - dx / length * 40 - dy / length * 28 * sign,
          y: entry.y - dy / length * 40 + dx / length * 28 * sign };
        const cell = { x: Math.floor(point.x / map.tileSize), y: Math.floor(point.y / map.tileSize) };
        const center = cellCenter(map, cell);
        if (!canOccupy(map, center.x, center.y, actor.radius)) status = 'trade-cell-blocked';
        else {
          const path = findPath(map, { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) }, cell, actor.radius);
          if (!path.length) status = 'trade-path-unreachable';
          else {
            status = 'valid-trade-point';
            if (!record.firstValidTradePoint) record.firstValidTradePoint = { ...context(), point: center, pathWaypoints: path.length };
          }
        }
      }
    }
    record.statuses[status] = (record.statuses[status] ?? 0) + 1;
    record.firstStatus[status] ??= context();
  }
}
export function captureEntrySupport(state) {
  if (!enabled(state)) return;
  const data = get(state);
  for (const event of state.events.slice(data.cursor)) if (['attack-entry', 'trade-support', 'death'].includes(event.type)) data.events.push(structuredClone(event));
  data.cursor = state.events.length;
}
export function entrySupportSummary(state) {
  if (!enabled(state)) return null;
  return structuredClone(get(state));
}
