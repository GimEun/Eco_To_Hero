import { moveWithCollision, findPath, canSee } from './geometry.js';
import { THROWABLES } from '../data/throwables.js';
import { ROUND_RULES } from '../config/round.js';

const grenadeRadius = THROWABLES.find(item => item.id === 'grenade').radius;

function incomingGrenade(state, map, actor) {
  return (state.projectiles ?? []).filter(projectile => {
    if (projectile.kind !== 'grenade' || projectile.detonateTick <= state.tick
      || state.tick - projectile.throwTick < Math.max(2, Math.ceil((100 - actor.intelligence) / 10))
      || Math.hypot(actor.x - projectile.to.x, actor.y - projectile.to.y) >= grenadeRadius + actor.radius) return false;
    const progress = Math.min(1, (state.tick - projectile.throwTick) / (projectile.detonateTick - projectile.throwTick));
    return canSee(map, actor, { x: projectile.from.x + (projectile.to.x - projectile.from.x) * progress,
      y: projectile.from.y + (projectile.to.y - projectile.from.y) * progress }, state);
  }).sort((a, b) => a.detonateTick - b.detonateTick || a.actorId.localeCompare(b.actorId))[0];
}

function clearOfPlayers(actor, next, actors) {
  const dx = next.x - actor.x, dy = next.y - actor.y;
  const lengthSquared = dx * dx + dy * dy;
  return actors.every(other => {
    if (other.id === actor.id || !other.alive) return true;
    const radius = actor.radius + other.radius;
    const oldDistance = Math.hypot(actor.x - other.x, actor.y - other.y);
    // 기존 테스트 등의 겹친 입력에서는 더 파고들지 않고 빠져나가는 이동만 허용한다.
    if (oldDistance < radius - 1e-7) return Math.hypot(next.x - other.x, next.y - other.y) > oldDistance + 1e-7
      && (actor.x - other.x) * dx + (actor.y - other.y) * dy >= -1e-7;
    const along = lengthSquared ? Math.max(0, Math.min(1,
      ((other.x - actor.x) * dx + (other.y - actor.y) * dy) / lengthSquared)) : 0;
    return Math.hypot(actor.x + dx * along - other.x, actor.y + dy * along - other.y) >= radius - 1e-7;
  });
}

function moveAroundPlayers(map, actor, target, travel, actors, tick) {
  const angle = Math.atan2(target.y - actor.y, target.x - actor.x);
  if (actor.yieldUntilTick > tick) {
    const yielding = moveWithCollision(map, actor, { x: actor.x + Math.cos(actor.yieldAngle) * travel,
      y: actor.y + Math.sin(actor.yieldAngle) * travel });
    if (Math.hypot(yielding.x - actor.x, yielding.y - actor.y) > 1e-7 && clearOfPlayers(actor, yielding, actors)) return yielding;
    actor.yieldUntilTick = 0;
  }
  // 같은 회전 방향을 우선해 마주 오는 선수들이 서로 다른 쪽으로 비킨다.
  for (const turn of [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2,
    Math.PI * 2 / 3, -Math.PI * 2 / 3, Math.PI * 5 / 6, -Math.PI * 5 / 6, Math.PI]) {
    const next = moveWithCollision(map, actor, { x: actor.x + Math.cos(angle + turn) * travel,
      y: actor.y + Math.sin(angle + turn) * travel });
    if (Math.hypot(next.x - actor.x, next.y - actor.y) > 1e-7 && clearOfPlayers(actor, next, actors)) {
      if (Math.abs(turn) > Math.PI / 2) { actor.yieldUntilTick = tick + 10; actor.yieldAngle = angle + turn; }
      return next;
    }
  }
  return { x: actor.x, y: actor.y };
}

function occupiedArrival(state, map, actor, target) {
  const bomb = state.round?.bomb;
  const last = actor.waypoint === actor.route.length - 1;
  const attackIntermediate = actor.objectiveKey?.startsWith('attack:') && actor.attackTask.stage < actor.attackTask.points.length - 1;
  const critical = last && state.round && (actor.id === state.round.defuserId || actor.id === state.round.recovererId
    || actor.id === bomb.carrierId && !actor.objectiveKey?.startsWith('manual:') && !attackIntermediate);
  if (critical) return false;
  const occupied = state.actors.some(other => other.id !== actor.id && other.alive
    && Math.hypot(other.x - target.x, other.y - target.y) <= other.radius
    && Math.hypot(actor.x - target.x, actor.y - target.y) <= actor.radius + other.radius + 4);
  if (!occupied) return false;
  if (!last) {
    const beyond = actor.route[actor.waypoint + 1];
    const next = moveWithCollision(map, actor, beyond);
    if (Math.hypot(next.x - beyond.x, next.y - beyond.y) > 1e-7) return false;
  }
  if (last) actor.crowdedGoal = { ...target };
  actor.waypoint++;
  actor.arrived = actor.waypoint >= actor.route.length;
  return true;
}

function formationScale(state, actor, engaged) {
  const round = state.round;
  if (!round || round.bomb.status !== 'carried' || state.tick >= ROUND_RULES.limitTicks - 200
    || actor.team !== round.attackTeam || !actor.attackTask || actor.retreating
    || actor.id === round.bomb.carrierId || !actor.objectiveKey?.startsWith('attack:')
    || actor.attackTask.stage === actor.attackTask.points.length - 1) return 1;
  const target = actor.route[actor.waypoint];
  const length = Math.hypot(target.x - actor.x, target.y - actor.y);
  if (length < 1e-7) return 1;
  const dx = (target.x - actor.x) / length, dy = (target.y - actor.y) / length;
  const close = state.actors.some(ally => {
    if (!ally.alive || ally.id === actor.id || ally.team !== actor.team || ally.arrived || ally.action
      || engaged.has(ally.id) || !ally.objectiveKey?.startsWith('attack:') || ally.speed <= 0) return false;
    const ax = ally.x - actor.x, ay = ally.y - actor.y;
    const ahead = ax * dx + ay * dy;
    const goal = ally.route[ally.waypoint];
    return ahead > 0 && ahead < actor.radius + ally.radius + 24
      && Math.abs(ax * dy - ay * dx) < actor.radius + ally.radius + 8
      && (goal.x - ally.x) * dx + (goal.y - ally.y) * dy > 0;
  });
  return close ? 0.6 : 1;
}

export function moveActors(state, map, engaged, stepMs) {
  const ordered = [...state.actors].sort((a, b) => a.id.localeCompare(b.id));
  const offset = state.tick % ordered.length;
  for (let index = 0; index < ordered.length; index++) {
    const actor = ordered[(index + offset) % ordered.length];
    actor.moving = false;
    actor.trafficBlocked = false;
    actor.keepingDistance = false;
    if (!actor.alive || actor.action) continue;
    const grenade = incomingGrenade(state, map, actor);
    if (grenade) {
      const separation = Math.hypot(actor.x - grenade.to.x, actor.y - grenade.to.y);
      const angle = separation < 1e-7 ? Math.atan2(grenade.from.y - actor.y, grenade.from.x - actor.x) + Math.PI / 2
        : Math.atan2(actor.y - grenade.to.y, actor.x - grenade.to.x);
      const target = { x: actor.x + Math.cos(angle) * (grenadeRadius + actor.radius + 12),
        y: actor.y + Math.sin(angle) * (grenadeRadius + actor.radius + 12) };
      const next = moveAroundPlayers(map, actor, target, actor.speed * stepMs / 1000, state.actors, state.tick);
      if (Math.hypot(next.x - grenade.to.x, next.y - grenade.to.y) > separation + 1e-7) {
        actor.x = next.x; actor.y = next.y; actor.moving = true;
        actor.crowdedGoal = null;
        if (actor.arrived) {
          actor.arrived = false;
          actor.waypoint = Math.max(0, actor.route.length - 1);
          actor.objectiveKey = null;
          actor.navigationTick = null;
        }
      }
      actor.intent = '수류탄 회피';
      const grenadeId = `${grenade.actorId}:${grenade.throwTick}`;
      if (actor.evadedGrenadeId !== grenadeId) { actor.evadedGrenadeId = grenadeId; actor.grenadeEvades = (actor.grenadeEvades ?? 0) + 1; }
      continue;
    }
    if (actor.entryWaiting || actor.smokeGuarding || actor.arrived || engaged.has(actor.id) && !actor.retreating) continue;
    actor.navigationTick ??= state.tick;
    if (state.tick - actor.navigationTick >= 20) {
      const goal = actor.route.at(-1);
      const path = findPath(map, { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) },
        { x: Math.floor(goal.x / map.tileSize), y: Math.floor(goal.y / map.tileSize) }, actor.radius,
        state.actors.filter(other => other.alive && other.id !== actor.id
          && (other.team === actor.team || Math.hypot(other.x - actor.x, other.y - actor.y) <= actor.radius + other.radius + 4
            || Number.isFinite(actor.viewRange) && canSee(map, actor, other, state))));
      if (path.length > 1) {
        actor.route = [{ x: actor.x, y: actor.y }, ...path, { ...goal }];
        actor.waypoint = 1;
        actor.crowdedGoal = null;
      }
      actor.navigationTick = state.tick;
    }
    const spacing = formationScale(state, actor, engaged);
    actor.keepingDistance = spacing < 1;
    let remaining = actor.speed * stepMs / 1000 * spacing;
    while (remaining > 1e-7 && !actor.arrived) {
      const target = actor.route[actor.waypoint];
      const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
      if (actor.waypoint < actor.route.length - 1 && distance <= 6) {
        const beyond = actor.route[actor.waypoint + 1];
        const clear = moveWithCollision(map, actor, beyond);
        if (Math.hypot(clear.x - beyond.x, clear.y - beyond.y) < 1e-7) {
          actor.waypoint++;
          actor.navigationTick = state.tick;
          continue;
        }
      }
      if (distance < 1e-7 || occupiedArrival(state, map, actor, target)) {
        if (distance < 1e-7) { actor.waypoint++; actor.arrived = actor.waypoint >= actor.route.length; }
        actor.navigationTick = state.tick;
        continue;
      }
      const travel = Math.min(remaining, distance, actor.radius / 2);
      const next = moveAroundPlayers(map, actor, target, travel, state.actors, state.tick);
      const moved = Math.hypot(next.x - actor.x, next.y - actor.y);
      if (moved < 1e-7) {
        actor.trafficBlocked = state.actors.some(other => other.id !== actor.id && other.alive
          && Math.hypot(other.x - actor.x, other.y - actor.y) <= actor.radius + other.radius + travel + 1e-7);
        actor.blocked = !actor.trafficBlocked;
        break;
      }
      actor.facing = actor.watchAngle ?? Math.atan2(next.y - actor.y, next.x - actor.x);
      actor.x = next.x; actor.y = next.y;
      actor.moving = true;
      actor.blocked = false;
      remaining -= moved;
      if (Math.hypot(target.x - actor.x, target.y - actor.y) < 1e-7) {
        actor.waypoint++;
        actor.arrived = actor.waypoint >= actor.route.length;
        actor.navigationTick = state.tick;
      }
    }
  }
}
