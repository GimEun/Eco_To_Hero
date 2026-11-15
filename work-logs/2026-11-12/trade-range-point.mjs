import { canOccupy, cellCenter, findPath, rayDistance } from '../../src/simulation/geometry.js';
import { weaponFor } from '../../src/data/weapons.js';
const audits = new WeakMap();
function record(state, type, sample) {
  if (!audits.has(state.round)) audits.set(state.round, { counts: {}, samples: [] });
  const audit = audits.get(state.round); audit.counts[type] = (audit.counts[type] ?? 0) + 1;
  if (sample && audit.samples.length < 60) audit.samples.push(sample);
}
export function fitTradePoint(state, map, actor, support) {
  if (!support || !map) return support;
  const contact = support.watch;
  if (!contact || !Number.isFinite(contact.tick) || contact.tick > state.tick || state.tick - contact.tick > 20) return support;
  const range = weaponFor(actor).range;
  const fits = point => {
    const distance = Math.hypot(point.x - contact.x, point.y - contact.y);
    return distance <= range + 1e-7 && rayDistance(map, point, Math.atan2(contact.y - point.y, contact.x - point.x), distance) >= distance - 1e-7;
  };
  if (fits(support.point)) { record(state, 'already-fit'); return support; }
  const origin = support.point, base = { x: Math.floor(origin.x / map.tileSize), y: Math.floor(origin.y / map.tileSize) };
  const candidates = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
    const cell = { x: base.x + dx, y: base.y + dy }, point = cellCenter(map, cell);
    const shift = Math.hypot(point.x - origin.x, point.y - origin.y);
    if (shift > 2 * map.tileSize + 1e-7 || !canOccupy(map, point.x, point.y, actor.radius) || !fits(point)) continue;
    const path = findPath(map, { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) }, cell, actor.radius);
    if (!path.length) continue;
    let length = 0, last = actor;
    for (const step of path) { length += Math.hypot(last.x - step.x, last.y - step.y); last = step; }
    candidates.push({ cell, point, shift, length });
  }
  candidates.sort((a, b) => a.shift - b.shift || a.length - b.length || a.cell.x - b.cell.x || a.cell.y - b.cell.y);
  const best = candidates[0];
  if (!best) { record(state, 'no-fit'); return support; }
  record(state, 'adjusted', { tick: state.tick, actorId: actor.id, original: { ...origin }, point: { ...best.point },
    contact: { ...contact }, range, shift: best.shift, pathLength: best.length });
  return { ...support, point: best.point, key: `${support.key}:range:${best.cell.x}:${best.cell.y}` };
}
export function tradeRangeSummary(state) { return structuredClone(audits.get(state.round) ?? { counts: {}, samples: [] }); }
