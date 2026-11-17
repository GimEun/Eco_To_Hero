import { canEditTactics } from './timeout.js';
import { assignAttackTasks } from './attack-tactics.js';
import { assignDefenseTasks } from './defense-tactics.js';
import { bombCarrierNumber } from './manual-tactics.js';

export function allocatedSite(state, actor) {
  const attacking = actor.team === state.round.attackTeam;
  const count = state.siteAllocation?.[actor.team]?.[attacking ? 'attack' : 'defense'];
  if (!Number.isInteger(count) || attacking && state.round.rotated) return null;
  if (!attacking) return actor.number <= count ? 'A' : 'B';
  const site = state.round.siteName;
  const targetCount = site === 'A' ? count : 5 - count;
  const carrier = bombCarrierNumber(state, actor.team);
  const order = [carrier, ...[1, 2, 3, 4, 5].filter(number => number !== carrier)];
  return order.indexOf(actor.number) < targetCount ? site : site === 'A' ? 'B' : 'A';
}

export function setSiteAllocation(state, map, side, count) {
  if (!['attack', 'defense'].includes(side) || count !== null && (!Number.isInteger(count) || count < 0 || count > 5)
    || !canEditTactics(state) || state.round.started && state.economy?.phase !== 'buy') return false;
  if (side === 'attack' && count !== null && (state.round.siteName === 'A' ? count === 0 : count === 5)) return false;
  state.siteAllocation ??= {};
  state.siteAllocation.home ??= { attack: null, defense: null };
  state.siteAllocation.home[side] = count;
  if (side === 'attack') assignAttackTasks(state, map, 'home');
  else assignDefenseTasks(state, map, 'home');
  for (const actor of state.actors.filter(actor => actor.team === 'home')) {
    actor.objectiveKey = null; actor.patrolMode = null;
  }
  return true;
}
