import { validateStrategyLibrary } from '../game/strategy-library.js';
import { canEditManual, manualRouteStart, validateManualRoute, validateManualSmoke } from './manual-tactics.js';
import { assignAttackTasks } from './attack-tactics.js';
import { assignDefenseTasks } from './defense-tactics.js';

export function captureStrategy(state, side, name) {
  const plan = state.manualPlans[side];
  return { name, duration: plan.duration, players: structuredClone(plan.players), smokes: structuredClone(plan.smokes ?? {}),
    plan: (side === 'attack' ? state.attackPlans : state.defensePlans)?.home ?? (side === 'attack' ? 'execute' : 'standard'),
    siteName: state.round.initialSiteName ?? state.round.siteName, allocationA: state.siteAllocation?.home?.[side] ?? null,
    carrierNumber: side === 'attack' ? plan.carrierNumber ?? 3 : 3 };
}

export function applyStrategy(state, map, side, preset) {
  if (!canEditManual(state) || state.round.started && state.economy?.phase !== 'buy') return { ok: false, message: '구매 단계 또는 단독 라운드 시작 전에 불러오세요.' };
  let checked;
  try { checked = validateStrategyLibrary({ [map.id]: { [side]: [preset, null, null] } })[map.id][side][0]; }
  catch (error) { return { ok: false, message: error.message }; }
  if (!checked) return { ok: false, message: '비어 있는 저장칸입니다.' };
  if (side === 'attack' && !state.actors.find(actor => actor.id === `home-${checked.carrierNumber}`)?.alive) {
    return { ok: false, message: '생존한 내 팀 선수를 폭탄 담당으로 지정하세요.' };
  }
  for (const [id, player] of Object.entries(checked.players)) {
    const actor = state.actors.find(actor => actor.id === id);
    const result = validateManualRoute(map, actor, side, player.cells, player.angle, manualRouteStart(state, map, actor, side));
    if (!result.ok) return result;
  }
  for (const smoke of Object.values(checked.smokes)) {
    const result = validateManualSmoke(map, smoke);
    if (!result.ok) return result;
  }
  const plan = state.manualPlans[side];
  Object.assign(plan, { duration: checked.duration, remaining: checked.duration, players: checked.players, smokes: checked.smokes, revision: plan.revision + 1 });
  state.siteAllocation ??= {};
  state.siteAllocation.home ??= { attack: null, defense: null };
  state.siteAllocation.home[side] = checked.allocationA;
  if (side === 'attack') {
    plan.carrierNumber = checked.carrierNumber;
    state.attackPlans ??= { home: 'execute', away: 'execute' };
    state.attackPlans.home = checked.plan;
    if (state.round.attackTeam === 'home') state.round.siteName = state.round.initialSiteName = checked.siteName;
    assignAttackTasks(state, map, 'home');
  } else {
    state.defensePlans ??= { home: 'standard', away: 'standard' };
    state.defensePlans.home = checked.plan;
    assignDefenseTasks(state, map, 'home');
  }
  state.round.manualProgress = {};
  for (const actor of state.actors.filter(actor => actor.team === 'home')) { actor.objectiveKey = null; actor.patrolMode = null; }
  return { ok: true, message: `${checked.name} 불러오기 완료 · ${side === 'attack' ? '공격' : '수비'} ${checked.duration}라운드` };
}
