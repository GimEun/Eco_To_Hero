import { canSee, canOccupy, moveWithCollision, rayDistance, sightDistance, findPath } from './geometry.js';
import { manualPlanFor } from './manual-tactics.js';
import { ROUND_RULES } from '../config/round.js';

export function defenseSmokeDestination(state, map, actor) {
  const round = state.round;
  actor.smokeWatching = false;
  const hitAge = state.tick - (actor.incomingFire?.tick ?? -Infinity);
  if (!actor.alive || actor.team === round.attackTeam || actor.viewRange <= 0
    || round.bomb.status === 'planted' || actor.hp <= 45 || actor.defenseTask?.withdrawn
    || manualPlanFor(state, actor) || round.action?.actorId === actor.id
    || hitAge >= 0 && hitAge <= 20 || state.tick >= ROUND_RULES.limitTicks - ROUND_RULES.plantTicks - 200
    || state.actors.some(target => target.alive && target.team !== actor.team && canSee(map, actor, target, state))) {
    actor.defenseSmoke = null;
    return null;
  }
  const smokes = (state.smokes ?? []).filter(smoke => smoke.expiresTick > state.tick);
  // 가까이 있어도 벽 너머의 연막에는 반응하지 않는다.
  const nearby = smokes.filter(smoke => {
    const distance = Math.hypot(actor.x - smoke.x, actor.y - smoke.y);
    return distance <= smoke.radius + 70 && distance - smoke.radius <= rayDistance(map, actor,
      Math.atan2(smoke.y - actor.y, smoke.x - actor.x), Math.max(0, distance - smoke.radius));
  }).sort((a, b) => Math.hypot(actor.x - a.x, actor.y - a.y) - Math.hypot(actor.x - b.x, actor.y - b.y)
    || a.x - b.x || a.y - b.y);
  const remembered = actor.defenseSmoke;
  const smoke = nearby.find(smoke => remembered?.key === `${smoke.x}:${smoke.y}:${smoke.expiresTick}`) ?? nearby[0];
  if (!smoke || !nearby.length) { actor.defenseSmoke = null; return null; }
  const key = `${smoke.x}:${smoke.y}:${smoke.expiresTick}`;
  const occupied = remembered && state.actors.some(ally => ally.alive && ally.team === actor.team && ally.id !== actor.id
    && Math.hypot(remembered.x - ally.x, remembered.y - ally.y) < actor.radius + ally.radius + 8);
  const newlyCovered = remembered && !remembered.covered && smokes.some(item =>
    Math.hypot(remembered.x - item.x, remembered.y - item.y) < item.radius + actor.radius + 4);
  if (!remembered || remembered.key !== key || (state.tick >= remembered.untilTick
    && Math.hypot(actor.x - remembered.x, actor.y - remembered.y) <= 6) || occupied || newlyCovered) {
    const allies = state.actors.filter(ally => ally.alive && ally.team === actor.team && ally.id !== actor.id);
    const points = [{ x: actor.x, y: actor.y }];
    for (const distance of [map.tileSize, map.tileSize * 2, map.tileSize * 3]) {
      for (let index = 0; index < 8; index++) points.push({
        x: actor.x + Math.cos(index * Math.PI / 4) * distance,
        y: actor.y + Math.sin(index * Math.PI / 4) * distance,
      });
    }
    const choices = [];
    for (const point of points) {
      if (!canOccupy(map, point.x, point.y, actor.radius)
        || Math.hypot(point.x - smoke.x, point.y - smoke.y) > smoke.radius + 70
        || smokes.some(item => Math.hypot(point.x - item.x, point.y - item.y) < item.radius + actor.radius + 4)
        || allies.some(ally => Math.hypot(point.x - ally.x, point.y - ally.y) < actor.radius + ally.radius + 8)) continue;
      const clear = moveWithCollision(map, actor, point);
      if (Math.hypot(clear.x - point.x, clear.y - point.y) > 1e-7) continue;
      const base = Math.atan2(smoke.y - point.y, smoke.x - point.x);
      for (const offset of [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]) {
        const angle = base + offset;
        const observer = { ...actor, ...point };
        const openness = [-0.3, 0, 0.3].reduce((sum, spread) => sum + sightDistance(map, observer, angle + spread, state), 0) / 3;
        if (openness < Math.min(60, actor.viewRange * 0.4)) continue;
        const overlap = allies.filter(ally => Math.hypot(point.x - ally.x, point.y - ally.y) < 160
          && Math.cos(angle - (ally.watchAngle ?? ally.facing)) > 0.8).length;
        const travel = Math.hypot(point.x - actor.x, point.y - actor.y);
        choices.push({ ...point, angle, score: openness - travel * 0.8 - overlap * 45 });
      }
    }
    choices.sort((a, b) => b.score - a.score || a.x - b.x || a.y - b.y || a.angle - b.angle);
    // 근처에 안전한 출구가 없으면 연막 속을 맴돌지 않고 현재 자리에서 확인한다.
    if (!choices.length) choices.push({ x: actor.x, y: actor.y,
      angle: Math.atan2(smoke.y - actor.y, smoke.x - actor.x) + Math.PI / 2, score: 0, covered: true });
    let holding = choices.filter(choice => Math.hypot(choice.x - actor.x, choice.y - actor.y) < 1);
    const otherDirections = holding.filter(choice => Math.cos(choice.angle - (remembered?.angle ?? choice.angle)) < 0.8);
    if (remembered?.key === key && otherDirections.length) holding = otherDirections;
    const candidates = remembered?.key === key && holding.length ? holding : choices;
    // 모두 이동 가능한 선택이다. 지능이 낮으면 최상위 대신 차선의 위치·방향을 고른다.
    const rank = Math.min(candidates.length - 1, Math.floor((100 - Math.max(0, Math.min(100, actor.intelligence))) / 25));
    const selected = candidates.slice(rank).concat(candidates.slice(0, rank)).find(choice =>
      Math.hypot(choice.x - actor.x, choice.y - actor.y) <= 6 || findPath(map,
        { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) },
        { x: Math.floor(choice.x / map.tileSize), y: Math.floor(choice.y / map.tileSize) }, actor.radius).length);
    if (!selected) { actor.defenseSmoke = null; return null; }
    actor.defenseSmoke = { ...selected, key, untilTick: state.tick + 40 };
  }
  const choice = actor.defenseSmoke;
  actor.smokeWatching = Math.hypot(actor.x - choice.x, actor.y - choice.y) <= 6;
  return { point: choice, key: `defense-smoke:${key}:${choice.x}:${choice.y}`, watchAngle: choice.angle,
    intent: actor.smokeWatching ? '연막 주변 · 다른 진입로 경계' : '연막 주변 · 시야 확보 위치로 재배치' };
}
