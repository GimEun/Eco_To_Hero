import { canSee } from '../../src/simulation/geometry.js';
import { selectTarget } from '../../src/simulation/combat.js';
import { weaponFor } from '../../src/data/weapons.js';
const traces = new WeakMap();
const enabled = state => state.economy?.roundNumber === 1 && state.round?.attackTeam === 'away';
function trace(state) {
  if (!traces.has(state)) traces.set(state, { actors: Object.fromEntries(state.actors.map(actor => [actor.id,
    { team: actor.team, aim: actor.aim, intelligence: actor.intelligence, weapon: actor.weaponId,
      firstVisible: null, firstEligible: null, eligibleTicks: 0, actionTicks: 0, reloadTicks: 0, reacquireTicks: 0 }])), cursor: 0, events: [] });
  return traces.get(state);
}
function snapshot(state, actor, target) {
  return { tick: state.tick, actorId: actor.id, targetId: target.id,
    from: { x: actor.x, y: actor.y }, to: { x: target.x, y: target.y },
    distance: Math.hypot(actor.x - target.x, actor.y - target.y), facing: actor.facing,
    targetIdBeforeCombat: actor.targetId, readyTickBeforeCombat: actor.readyTick,
    action: actor.action ?? null, range: weaponFor(actor).range };
}
export function observeOpening(state, map) {
  if (!enabled(state)) return;
  const data = trace(state);
  for (const actor of state.actors.filter(actor => actor.alive)) {
    const record = data.actors[actor.id];
    const visible = state.actors.find(other => other.alive && other.team !== actor.team && canSee(map, actor, other, state));
    if (visible && !record.firstVisible) record.firstVisible = snapshot(state, actor, visible);
    const target = selectTarget(state, map, actor);
    if (target) {
      if (!record.firstEligible) record.firstEligible = snapshot(state, actor, target);
      record.eligibleTicks++;
      if (actor.targetId !== target.id) record.reacquireTicks++;
      if (actor.action) record.actionTicks++;
      if (actor.reloadUntilTick !== null) record.reloadTicks++;
    }
  }
}
export function captureOpeningEvents(state) {
  if (!enabled(state)) return;
  const data = trace(state);
  for (const event of state.events.slice(data.cursor)) {
    if (['shot', 'death', 'reload'].includes(event.type)) data.events.push(structuredClone(event));
  }
  data.cursor = state.events.length;
}
export function openingSummary(state) {
  if (!enabled(state)) return null;
  const data = trace(state);
  return { actors: structuredClone(data.actors), events: structuredClone(data.events) };
}
