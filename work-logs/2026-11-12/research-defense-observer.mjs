const traces = new WeakMap();
export function observeDefenseObjectives(state) {
  if (state.economy?.roundNumber !== 1 || state.round?.attackTeam !== 'away') return;
  if (!traces.has(state)) traces.set(state, {});
  const data = traces.get(state);
  for (const actor of state.actors.filter(actor => actor.team === 'home' && actor.alive)) {
    const record = data[actor.id] ??= {};
    const prefix = actor.objectiveKey?.split(':')[0];
    if (['support', 'contact-support', 'crossfire', 'withdraw'].includes(prefix) && !record[prefix]) {
      record[prefix] = { tick: state.tick, x: actor.x, y: actor.y, hp: actor.hp, objective: actor.objectiveKey,
        role: actor.defenseTask?.role, destination: actor.route?.length ? { ...actor.route.at(-1) } : null,
        contacts: structuredClone(state.round.defenseContacts ?? []) };
    }
  }
}
export function defenseObjectiveSummary(state) {
  return state.economy?.roundNumber === 1 ? structuredClone(traces.get(state) ?? {}) : null;
}
