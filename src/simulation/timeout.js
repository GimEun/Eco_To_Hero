export const TIMEOUT_RULES = Object.freeze({ regulation: 3, overtime: 3 });

export function requestPause(state) {
  if (!state.timeout || state.timeout.active || state.timeout.remaining <= 0 || state.complete || state.match?.complete || state.economy?.phase === 'buy') return false;
  state.timeout.remaining--;
  state.timeout.active = true;
  state.timeout.kind = 'normal';
  return true;
}

export function canRequestTimeout(state) {
  return Boolean(state.match && !state.match.complete && !state.complete
    && state.round?.started && state.economy?.phase === 'combat'
    && !state.timeout.active && state.timeout.remaining > 0);
}

export function requestTimeout(state) {
  if (!canRequestTimeout(state)) return false;
  state.timeout.remaining--;
  state.timeout.active = true;
  state.timeout.kind = 'coach';
  return true;
}

export function resumeTimeout(state) {
  if (!state.timeout?.active) return false;
  state.timeout.active = false;
  delete state.timeout.kind;
  return true;
}

export function canEditTactics(state) {
  return Boolean(state.round && !state.complete && !state.match?.complete
    && (state.timeout?.active && state.timeout.kind !== 'normal' || (state.economy ? state.economy.phase === 'buy' : !state.round.started)));
}
