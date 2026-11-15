import { cellCenter, canOccupy, findPath, reachedDestination } from './geometry.js';
import { canEditTactics } from './timeout.js';

export const MANUAL_DURATIONS = Object.freeze([4, 6, 12]);

export function setupManualRound(state) {
  state.manualPlans ??= Object.fromEntries(['attack', 'defense'].map(side => [side,
    { duration: 4, remaining: 4, players: {}, revision: 0 }]));
  state.round.manualProgress = {};
  state.round.manualConsumed = false;
}

export function canEditManual(state) {
  return canEditTactics(state);
}

export function manualRouteStart(state, map, actor, side) {
  if (!actor || !['attack', 'defense'].includes(side)) return undefined;
  const currentSide = actor.team === state.round?.attackTeam ? 'attack' : 'defense';
  return state.timeout?.active && currentSide === side
    ? { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) }
    : map.spawns[side === 'attack' ? 'home' : 'away'][actor.number - 1];
}

export function validateManualRoute(map, actor, side, cells, angle, startCell) {
  if (!actor || actor.team !== 'home' || !['attack', 'defense'].includes(side)
    || !Array.isArray(cells) || !cells.length || cells.length > 12 || !Number.isFinite(angle)) {
    return { ok: false, message: '내 팀 선수와 공격/수비 진영, 1~12개 경유점·경계 방향을 지정하세요.' };
  }
  let start = startCell ?? map.spawns[side === 'attack' ? 'home' : 'away'][actor.number - 1];
  for (const cell of cells) {
    if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return { ok: false, message: '올바른 맵 칸을 선택하세요.' };
    const point = cellCenter(map, cell);
    if (!canOccupy(map, point.x, point.y, actor.radius) || !findPath(map, start, cell, actor.radius).length) {
      return { ok: false, message: '벽·지도 밖·도달할 수 없는 경유점은 사용할 수 없습니다.' };
    }
    start = cell;
  }
  return { ok: true, cells: cells.map(({ x, y }) => ({ x, y })), angle: Math.atan2(Math.sin(angle), Math.cos(angle)) };
}

export function setManualRoute(state, map, actorId, side, cells, angle) {
  if (!canEditManual(state)) return { ok: false, message: '구매 단계·감독 타임아웃 또는 단독 라운드 시작 전에 편집하세요.' };
  const actor = state.actors.find(item => item.id === actorId);
  const result = validateManualRoute(map, actor, side, cells, angle, manualRouteStart(state, map, actor, side));
  if (!result.ok) return result;
  const plan = state.manualPlans[side];
  if (plan.remaining === 0) return { ok: false, message: '적용 기간이 끝났습니다. 기간 적용으로 갱신하세요.' };
  plan.players[actorId] = { cells: result.cells, angle: result.angle };
  plan.revision++;
  if (side === (actor.team === state.round.attackTeam ? 'attack' : 'defense')) {
    delete state.round.manualProgress[actorId];
    actor.objectiveKey = null;
  }
  return { ok: true, message: `${side === 'attack' ? '공격' : '수비'} 수동 경로를 적용했습니다.` };
}

export function clearManualRoute(state, actorId, side) {
  if (!canEditManual(state) || !['attack', 'defense'].includes(side)
    || !state.actors.some(actor => actor.id === actorId && actor.team === 'home')) return false;
  delete state.manualPlans[side].players[actorId];
  state.manualPlans[side].revision++;
  if (side === (state.round.attackTeam === 'home' ? 'attack' : 'defense')) {
    delete state.round.manualProgress[actorId];
    state.actors.find(actor => actor.id === actorId).objectiveKey = null;
  }
  return true;
}

export function setManualDuration(state, side, duration) {
  if (!canEditManual(state) || !['attack', 'defense'].includes(side) || !MANUAL_DURATIONS.includes(duration)) return false;
  Object.assign(state.manualPlans[side], { duration, remaining: duration });
  return true;
}

export function manualPlanFor(state, actor) {
  if (!state.round || actor.team !== 'home') return null;
  const side = actor.team === state.round.attackTeam ? 'attack' : 'defense';
  const plan = state.manualPlans?.[side];
  return plan?.remaining > 0 && plan.players[actor.id] ? { ...plan.players[actor.id], side, revision: plan.revision } : null;
}

export function manualDestination(state, map, actor) {
  const plan = manualPlanFor(state, actor);
  if (!plan) return null;
  const progress = state.round.manualProgress[actor.id] ??= { index: 0, arrived: false };
  let index = progress.index;
  let point = cellCenter(map, plan.cells[index]);
  while (index < plan.cells.length - 1 && reachedDestination(actor, point)) {
    index++;
    point = cellCenter(map, plan.cells[index]);
  }
  progress.index = index;
  if (index === plan.cells.length - 1 && reachedDestination(actor, point)) progress.arrived = true;
  return { point, angle: plan.angle, arrived: progress.arrived,
    key: `manual:${actor.id}:${plan.side}:${plan.revision}:${index}` };
}

export function settleManualRound(state) {
  if (!state.round.started || state.round.manualConsumed) return;
  state.round.manualConsumed = true;
  const side = state.round.attackTeam === 'home' ? 'attack' : 'defense';
  const plan = state.manualPlans[side];
  if (plan.remaining > 0 && Object.keys(plan.players).length) plan.remaining--;
}
