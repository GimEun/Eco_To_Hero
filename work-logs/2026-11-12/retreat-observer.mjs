import { canSee } from '../../src/simulation/geometry.js';
import { selectTarget, hitProbability } from '../../src/simulation/combat.js';
import { weaponFor } from '../../src/data/weapons.js';
const traces = new WeakMap();
const enabled = state => state.economy?.roundNumber === 1 && state.round?.attackTeam === 'away';
function dataFor(state) {
  if (!traces.has(state)) traces.set(state, { pre: {}, cursor: 0, last: {}, transitions: [], shots: [], deaths: [] });
  return traces.get(state);
}
function basic(actor) {
  return { id: actor.id, team: actor.team, hp: actor.hp, alive: actor.alive, x: actor.x, y: actor.y,
    moving: actor.moving, retreating: Boolean(actor.retreating), withdrawn: Boolean(actor.defenseTask?.withdrawn),
    role: actor.defenseTask?.role ?? null, objective: actor.objectiveKey ?? null,
    destination: actor.route?.length ? { ...actor.route.at(-1) } : null,
    action: actor.action ?? null, ammo: actor.ammo, reloadUntilTick: actor.reloadUntilTick, readyTick: actor.readyTick };
}
function transitions(state, data, phase) {
  for (const actor of state.actors) {
    const snapshot = basic(actor);
    const signature = [snapshot.alive, snapshot.hp <= 45, snapshot.withdrawn, snapshot.retreating].join(':');
    if (signature !== data.last[actor.id]) data.transitions.push({ tick: state.tick, phase, ...snapshot });
    data.last[actor.id] = signature;
  }
}
export function observeRetreat(state, map) {
  if (!enabled(state)) return;
  const data = dataFor(state);
  data.pre = Object.fromEntries(state.actors.map(actor => {
    const target = actor.alive ? selectTarget(state, map, actor) : null;
    const eligibleIds = actor.alive ? state.actors.filter(other => other.alive && other.team !== actor.team
      && canSee(map, actor, other, state) && Math.hypot(actor.x - other.x, actor.y - other.y) <= weaponFor(actor).range).map(other => other.id) : [];
    return [actor.id, { ...basic(actor), targetId: target?.id ?? null, eligibleIds,
      probability: target ? hitProbability(actor, target, state) : null,
      stationaryProbability: target ? hitProbability({ ...actor, moving: false }, target, state) : null }];
  }));
  transitions(state, data, 'before-combat');
}
export function captureRetreat(state) {
  if (!enabled(state)) return;
  const data = dataFor(state);
  for (const event of state.events.slice(data.cursor)) {
    if (event.type === 'shot') {
      const actor = data.pre[event.actorId], target = data.pre[event.targetId];
      const allies = Object.values(data.pre).filter(ally => ally.id !== actor.id && ally.team === actor.team && ally.alive);
      data.shots.push({ event: structuredClone(event), actor: structuredClone(actor), target: structuredClone(target),
        sameTargetAllies: allies.filter(ally => ally.eligibleIds.includes(event.targetId)).map(ally => ally.id),
        nearbyAllies: allies.filter(ally => Math.hypot(ally.x - actor.x, ally.y - actor.y) <= 160).map(ally => ally.id) });
    }
    if (event.type === 'death') data.deaths.push({ event: structuredClone(event), actorBefore: structuredClone(data.pre[event.actorId]) });
  }
  data.cursor = state.events.length;
  transitions(state, data, 'after-combat');
}
export function retreatSummary(state) {
  if (!enabled(state)) return null;
  const { transitions, shots, deaths } = dataFor(state);
  return structuredClone({ transitions, shots, deaths });
}
