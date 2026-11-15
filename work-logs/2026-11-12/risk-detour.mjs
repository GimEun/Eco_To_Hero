import { canOccupy, cellCenter, findPath, rayDistance } from '../../src/simulation/geometry.js';
import { selectTarget } from '../../src/simulation/combat.js';
import { manualPlanFor } from '../../src/simulation/manual-tactics.js';
import { ROUND_RULES } from '../../src/config/round.js';

export const RISK_RULES = Object.freeze({ memoryTicks: 40, radiusTiles: 3, penalty: 4,
  extraTiles: 6, distanceRatio: 1.5, retryTicks: 20 });
const walkableMaps = new WeakMap();
const cellOf = (map, point) => ({ x: Math.floor(point.x / map.tileSize), y: Math.floor(point.y / map.tileSize) });
const keyOf = (map, cell) => cell.y * map.columns + cell.x;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const length = points => points.slice(1).reduce((sum, point, index) => sum + distance(point, points[index]), 0);

function walkable(map, radius) {
  if (!walkableMaps.has(map)) walkableMaps.set(map, new Map());
  const cache = walkableMaps.get(map);
  if (!cache.has(radius)) cache.set(radius, Array.from({ length: map.columns * map.rows }, (_, key) => {
    const point = cellCenter(map, { x: key % map.columns, y: Math.floor(key / map.columns) });
    return canOccupy(map, point.x, point.y, radius);
  }));
  return cache.get(radius);
}

function riskCosts(map, contacts) {
  return Array.from({ length: map.columns * map.rows }, (_, key) => {
    const point = cellCenter(map, { x: key % map.columns, y: Math.floor(key / map.columns) });
    return contacts.reduce((cost, contact) => {
      const d = distance(point, contact);
      return cost + (d <= map.tileSize * RISK_RULES.radiusTiles
        && rayDistance(map, point, Math.atan2(contact.y - point.y, contact.x - point.x), d) >= d - 1e-7 ? RISK_RULES.penalty : 0);
    }, 0);
  });
}

// Diagnostic weighted path search. Static walls and recorded contact cells only.
function weightedPath(map, start, goal, radius, costs) {
  const valid = walkable(map, radius);
  const startKey = keyOf(map, start), goalKey = keyOf(map, goal);
  if (!valid[startKey] || !valid[goalKey]) return [];
  const previous = new Int32Array(valid.length).fill(-1);
  const best = new Float64Array(valid.length).fill(Infinity);
  const closed = new Uint8Array(valid.length);
  const open = [startKey];
  best[startKey] = 0;
  while (open.length) {
    let index = 0;
    for (let i = 1; i < open.length; i++) if (best[open[i]] < best[open[index]]) index = i;
    const current = open.splice(index, 1)[0];
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === goalKey) {
      const path = [];
      for (let key = current; key !== -1; key = previous[key]) path.push(cellCenter(map, { x: key % map.columns, y: Math.floor(key / map.columns) }));
      return path.reverse();
    }
    const x = current % map.columns, y = Math.floor(current / map.columns);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nx = x + dx, ny = y + dy, next = ny * map.columns + nx;
      if (nx < 0 || nx >= map.columns || ny < 0 || ny >= map.rows || !valid[next] || closed[next]) continue;
      const score = best[current] + 1 + costs[next];
      if (score >= best[next]) continue;
      if (!Number.isFinite(best[next])) open.push(next);
      best[next] = score; previous[next] = current;
    }
  }
  return [];
}

function exposure(map, points, costs) {
  let previous = null, total = 0;
  for (const point of points) {
    const key = keyOf(map, cellOf(map, point));
    if (key !== previous) total += costs[key] ?? 0;
    previous = key;
  }
  return total;
}

function setRoute(actor, route) {
  Object.assign(actor, { route, waypoint: 1, arrived: false, blocked: false,
    trafficBlocked: false, crowdedGoal: null, navigationTick: null });
}

function restore(actor, map, record, metrics) {
  const active = record.active;
  if (active && actor.route === active.route && actor.objectiveKey === active.objectiveKey) {
    const route = findPath(map, cellOf(map, actor), cellOf(map, active.goal), actor.radius);
    if (route.length) { setRoute(actor, [{ x: actor.x, y: actor.y }, ...route, active.goal]); metrics.restored++; }
  }
  record.active = null;
}

export function supportKind(actor) {
  return actor.objectiveKey?.startsWith('trade:') ? 'trade'
    : actor.objectiveKey?.includes('contact-support:') || actor.intent?.includes('앵커 합류') ? 'anchor'
    : actor.objectiveKey?.startsWith('support:') || actor.objectiveKey?.includes('patrol:support:') ? 'support' : null;
}

export function prepareRiskDetours(state, map, { protectSupport = false, stable = false } = {}) {
  const round = state.round;
  if (!round?.started) return;
  const diagnostic = round.diagnosticRisk ??= { attempts: 0, applied: 0, restored: 0, decisions: [], teams: {}, actors: {} };
  const urgent = ROUND_RULES.limitTicks - state.tick <= ROUND_RULES.plantTicks + 200;
  for (const actor of [...state.actors].sort((a, b) => a.id.localeCompare(b.id))) {
    const record = diagnostic.actors[actor.id] ??= { lastAttempt: -Infinity, active: null };
    // Existing combat/objective/manual movement owns the route in these cases.
    if (!actor.alive || actor.arrived || actor.retreating || actor.action || actor.entryWaiting || actor.smokeGuarding
      || manualPlanFor(state, actor) || selectTarget(state, map, actor)
      || actor.incomingFire && state.tick - actor.incomingFire.tick <= 20) continue;
    if (protectSupport && supportKind(actor)) { restore(actor, map, record, diagnostic); continue; }
    if (urgent || round.bomb.status !== 'carried' || round.bomb.carrierId === actor.id
      || round.action?.actorId === actor.id) { restore(actor, map, record, diagnostic); continue; }
    const attacking = actor.team === round.attackTeam;
    const contacts = (attacking ? round.attackContacts : round.defenseContacts) ?? [];
    const recent = contacts.filter(contact => state.tick >= contact.tick && state.tick - contact.tick <= RISK_RULES.memoryTicks)
      .map(contact => ({ id: contact.id, ...cellOf(map, contact) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!recent.length) { restore(actor, map, record, diagnostic); continue; }
    const signature = recent.map(contact => `${contact.id}:${contact.x}:${contact.y}`).join('|');
    if (diagnostic.teams[actor.team]?.signature !== signature) diagnostic.teams[actor.team] = {
      signature, costs: riskCosts(map, recent.map(contact => cellCenter(map, contact))),
    };
    const costs = diagnostic.teams[actor.team].costs;
    const goal = actor.route.at(-1);
    if (!goal || actor.waypoint >= actor.route.length) continue;
    const routeKey = `${actor.objectiveKey}:${goal.x}:${goal.y}:${signature}`;
    if (record.active?.key === routeKey && actor.route === record.active.route) continue;
    if (stable && record.active && actor.route === record.active.route && actor.objectiveKey === record.active.objectiveKey
      && goal.x === record.active.goal.x && goal.y === record.active.goal.y
      && state.tick - record.active.since < RISK_RULES.retryTicks) continue;
    if (record.active) restore(actor, map, record, diagnostic);
    if ((record.lastKey === routeKey || stable) && state.tick - record.lastAttempt < RISK_RULES.retryTicks) continue;
    record.lastKey = routeKey; record.lastAttempt = state.tick;
    const original = [{ x: actor.x, y: actor.y }, ...actor.route.slice(actor.waypoint)];
    const before = exposure(map, original, costs);
    if (!before) continue;
    diagnostic.attempts++;
    const path = weightedPath(map, cellOf(map, actor), cellOf(map, goal), actor.radius, costs);
    if (!path.length) continue;
    const alternative = [{ x: actor.x, y: actor.y }, ...path, { ...goal }];
    const originalLength = length(original), alternativeLength = length(alternative);
    const after = exposure(map, alternative, costs);
    if (after >= before || alternativeLength > originalLength * RISK_RULES.distanceRatio + 1e-7
      || alternativeLength > originalLength + map.tileSize * RISK_RULES.extraTiles + 1e-7) continue;
    setRoute(actor, alternative);
    record.active = { key: routeKey, route: actor.route, goal: { ...goal }, objectiveKey: actor.objectiveKey,
      ...(stable ? { since: state.tick } : {}) };
    diagnostic.applied++;
    if (diagnostic.decisions.length < 10) diagnostic.decisions.push({ tick: state.tick, actorId: actor.id, team: actor.team,
      goal: { ...goal }, originalLength, alternativeLength, before, after });
  }
}
