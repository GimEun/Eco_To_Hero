import { selectTarget } from '../../src/simulation/combat.js';
import { supportKind } from './risk-detour.mjs';
const category = actor => supportKind(actor) ?? 'other';
const metric = () => ({ episodes: 0, reached: 0, changed: 0, died: 0, pending: 0, travel: 0,
  ticks: 0, engagedTicks: 0, blockedTicks: 0, arrivalTicks: 0, arrivalTravel: 0,
  riskPlans: 0, riskTicks: 0, nativeRepaths: 0 });
const bucket = (trace, actor, type) => trace.groups[`${actor.team}:${type}`] ??= metric();

export function beginTrace(state, map) {
  const trace = state.round.movementTrace ??= { groups: {}, actors: {} };
  for (const actor of state.actors) {
    const record = trace.actors[actor.id] ??= {};
    const goal = actor.route.at(-1);
    const type = category(actor);
    const key = `${actor.objectiveKey}:${goal?.x}:${goal?.y}`;
    if (record.episode?.key !== key && record.episode && !record.episode.done) {
      bucket(trace, actor, record.episode.type).changed++;
    }
    if (actor.alive && record.episode?.key !== key) {
      record.episode = { key, type, started: state.tick, travel: 0, done: false, goal: { ...goal } };
      bucket(trace, actor, type).episodes++;
    }
    record.beforeRiskRoute = actor.route;
    record.x = actor.x; record.y = actor.y;
    record.alive = actor.alive;
    record.engaged = actor.alive && Boolean(selectTarget(state, map, actor));
  }
}

export function markRisk(state) {
  const trace = state.round.movementTrace;
  for (const actor of state.actors) {
    const record = trace.actors[actor.id];
    const active = state.round.diagnosticRisk?.actors[actor.id]?.active;
    record.active = Boolean(active && active.route === actor.route);
    record.movementRoute = actor.route;
    if (record.alive && record.active && record.beforeRiskRoute !== actor.route) bucket(trace, actor, record.episode.type).riskPlans++;
  }
}

export function traceMovement(state, movement = false) {
  const trace = state.round.movementTrace;
  for (const actor of state.actors) {
    const record = trace.actors[actor.id];
    if (!record.alive) continue;
    const travelled = Math.hypot(actor.x - record.x, actor.y - record.y);
    const group = bucket(trace, actor, record.episode.type);
    group.travel += travelled; record.episode.travel += travelled;
    record.x = actor.x; record.y = actor.y;
    if (movement && record.active && actor.route !== record.movementRoute) group.nativeRepaths++;
  }
}

export function finishTrace(state) {
  const trace = state.round.movementTrace;
  for (const actor of state.actors) {
    const record = trace.actors[actor.id];
    if (!record.alive) continue;
    const episode = record.episode, group = bucket(trace, actor, episode.type);
    group.ticks++; group.engagedTicks += Number(record.engaged);
    group.blockedTicks += Number(Boolean(actor.blocked || actor.trafficBlocked));
    group.riskTicks += Number(record.active);
    if (episode.done) continue;
    if (actor.alive && (actor.arrived || Math.hypot(actor.x - episode.goal.x, actor.y - episode.goal.y) <= 6)) {
      group.reached++; group.arrivalTicks += state.tick - episode.started;
      group.arrivalTravel += episode.travel; episode.done = true;
    } else if (!actor.alive) { group.died++; episode.done = true; }
  }
}

export function traceSummary(state) {
  const trace = state.round.movementTrace;
  const groups = structuredClone(trace?.groups ?? {});
  if (trace) for (const actor of state.actors) {
    const episode = trace.actors[actor.id]?.episode;
    if (episode && !episode.done) groups[`${actor.team}:${episode.type}`].pending++;
  }
  return groups;
}

export function combineMovement(rows) {
  const groups = {};
  for (const row of rows) for (const round of row.detail) for (const [key, group] of Object.entries(round.movementTrace)) {
    const total = groups[key] ??= {};
    for (const [field, value] of Object.entries(group)) total[field] = (total[field] ?? 0) + value;
  }
  for (const group of Object.values(groups)) Object.assign(group, {
    reachedRate: group.reached / group.episodes,
    meanArrivalSeconds: group.reached ? group.arrivalTicks * .05 / group.reached : null,
    meanArrivalTravel: group.reached ? group.arrivalTravel / group.reached : null,
    travelPerAliveSecond: group.travel / (group.ticks * .05),
  });
  return groups;
}
