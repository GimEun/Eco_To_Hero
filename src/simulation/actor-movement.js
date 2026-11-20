import { moveWithCollision, findPath, canSee, cellCenter, rayDistance } from './geometry.js';
import { THROWABLES } from '../data/throwables.js';
import { ROUND_RULES } from '../config/round.js';
import { manualPlanFor } from './manual-tactics.js';
import { movementSpeed } from '../data/weapons.js';

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
  const direct = moveWithCollision(map, actor, { x: actor.x + Math.cos(angle) * travel, y: actor.y + Math.sin(angle) * travel });
  const goal = actor.route.at(-1);
  const following = target === actor.route[actor.waypoint] && actors.some(other => {
    const next = other.route?.[other.waypoint], otherGoal = other.route?.at(-1);
    return other.id !== actor.id && other.alive && other.team === actor.team && next && otherGoal && !other.arrived
      && movementSpeed(other) > 0 && Math.hypot(goal.x - otherGoal.x, goal.y - otherGoal.y) < 1e-7
      && (other.x - actor.x) * Math.cos(angle) + (other.y - actor.y) * Math.sin(angle) > 0
      && Math.cos(Math.atan2(next.y - other.y, next.x - other.x) - angle) > 0.8
      && !clearOfPlayers(actor, direct, [other]);
  });
  if (following) { actor.yieldUntilTick = 0; return { x: actor.x, y: actor.y }; }
  // 몸체가 점유한 목표는 국소 회피로 도달할 수 없으므로 주변을 맴돌지 않는다.
  if (target === actor.route.at(-1) && actors.some(other => other.id !== actor.id && other.alive
    && (other.arrived || other.action || other.speed <= 0)
    && Math.hypot(target.x - other.x, target.y - other.y) < actor.radius + other.radius
    && Math.hypot(actor.x - other.x, actor.y - other.y) <= actor.radius + other.radius + travel)) {
    actor.yieldUntilTick = 0;
    return { x: actor.x, y: actor.y };
  }
  const blocker = actors.find(other => {
    const next = other.route?.[other.waypoint];
    return other.id !== actor.id && other.alive && !clearOfPlayers(actor, direct, [other])
      && (other.arrived || other.action || other.speed <= 0 || other.entryWaiting || other.smokeGuarding || other.smokeWatching
        || other.targetId && !other.retreating || next && Math.cos(Math.atan2(next.y - other.y, next.x - other.x) - angle) < -0.8);
  });
  if (blocker) {
    const span = actor.radius + blocker.radius;
    const width = rayDistance(map, actor, angle + Math.PI / 2, span * 2)
      + rayDistance(map, actor, angle - Math.PI / 2, span * 2);
    if (width <= span * 2 + 2) {
      const detour = findPath(map, { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) },
        { x: Math.floor(goal.x / map.tileSize), y: Math.floor(goal.y / map.tileSize) }, actor.radius, [blocker]);
      if (!detour.length) { actor.yieldUntilTick = 0; return { x: actor.x, y: actor.y }; }
    }
  }
  if (actor.yieldUntilTick > tick) {
    const next = moveWithCollision(map, actor, { x: actor.x + Math.cos(actor.yieldAngle) * travel,
      y: actor.y + Math.sin(actor.yieldAngle) * travel });
    if (Math.hypot(next.x - actor.x, next.y - actor.y) > 1e-7 && clearOfPlayers(actor, next, actors)) return next;
    actor.yieldUntilTick = 0;
  }
  if (Math.hypot(direct.x - actor.x, direct.y - actor.y) > 1e-7 && clearOfPlayers(actor, direct, actors)) return direct;
  // 통과할 폭이 있으면 기존 우회로를 사용한다.
  const turns = [Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2,
    Math.PI * 2 / 3, -Math.PI * 2 / 3, Math.PI * 5 / 6, -Math.PI * 5 / 6, Math.PI];
  for (const turn of turns) {
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
  const manual = actor.objectiveKey?.startsWith('manual:') ? manualPlanFor(state, actor) : null;
  const finalPoint = manual ? cellCenter(map, manual.cells.at(-1)) : null;
  // 같은 최종 지점의 아군 뒤에 도착한 선수도 충돌 없이 가까운 자리에서 경계를 시작한다.
  const sharedFinal = finalPoint && Math.hypot(finalPoint.x - actor.route.at(-1).x, finalPoint.y - actor.route.at(-1).y) < 1e-7
    && state.actors.some(other => {
      if (other.id === actor.id || !other.alive || other.team !== actor.team || !other.arrived
        || !state.round.manualProgress[other.id]?.arrived
        || Math.hypot(other.route.at(-1).x - finalPoint.x, other.route.at(-1).y - finalPoint.y) > 1e-7
        || Math.hypot(actor.x - finalPoint.x, actor.y - finalPoint.y)
          > (actor.radius + other.radius + actor.radius / 2) * (state.actors.filter(ally => ally.alive && ally.team === actor.team).length - 1) + 6
        || Math.hypot(actor.x - other.x, actor.y - other.y) > actor.radius + other.radius + actor.radius / 2 + 1e-7) return false;
      const clear = moveWithCollision(map, actor, other);
      return Math.hypot(clear.x - other.x, clear.y - other.y) < 1e-7;
    });
  if (sharedFinal) {
    actor.crowdedGoal = { ...finalPoint };
    actor.waypoint = actor.route.length;
    actor.arrived = true;
    return true;
  }
  if (manual) return false;
  const final = actor.route.at(-1);
  const finalCritical = state.round && (actor.id === state.round.defuserId || actor.id === state.round.recovererId || actor.id === bomb.carrierId);
  // 재탐색의 중간점이 남아도 이미 공통 최종 목표 옆이면 도착한 아군을 돌아가지 않는다.
  if (!last && !finalCritical && state.actors.some(other => other.id !== actor.id && other.alive
    && other.team === actor.team && other.arrived && Math.hypot(other.route.at(-1).x - final.x, other.route.at(-1).y - final.y) < 1e-7
    && Math.hypot(other.x - final.x, other.y - final.y) <= other.radius
    && Math.hypot(actor.x - final.x, actor.y - final.y) <= actor.radius + other.radius + 4)) {
    const clear = moveWithCollision(map, actor, final);
    if (Math.hypot(clear.x - final.x, clear.y - final.y) < 1e-7) {
      actor.crowdedGoal = { ...final }; actor.waypoint = actor.route.length; actor.arrived = true;
      return true;
    }
  }
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
      const next = moveAroundPlayers(map, actor, target, movementSpeed(actor) * stepMs / 1000, state.actors, state.tick);
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
    if (actor.entryWaiting || actor.smokeGuarding || actor.smokeWatching || actor.arrived || engaged.has(actor.id) && !actor.retreating) continue;
    const preserveRoute = actor.objectiveKey?.startsWith('manual:') && Boolean(manualPlanFor(state, actor));
    actor.navigationTick ??= state.tick;
    if (!preserveRoute && state.tick - actor.navigationTick >= 20) {
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
    let remaining = movementSpeed(actor) * stepMs / 1000 * spacing;
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
      if (preserveRoute) {
        const dx = (target.x - actor.x) / distance, dy = (target.y - actor.y) / distance;
        const direct = moveWithCollision(map, actor, { x: actor.x + dx * travel, y: actor.y + dy * travel });
        const waiting = state.actors.some(ally => {
          if (ally.id === actor.id || !ally.alive || ally.team !== actor.team || clearOfPlayers(actor, direct, [ally])) return false;
          const next = ally.route[ally.waypoint];
          if (ally.arrived || ally.action || engaged.has(ally.id) || !next) return true;
          const length = Math.hypot(next.x - ally.x, next.y - ally.y);
          if (length < 1e-7) return false;
          const ax = (next.x - ally.x) / length, ay = (next.y - ally.y) / length;
          if (ax * dx + ay * dy < 0.8) return false;
          // 합류하는 두 선수도 공통 진행 방향으로 앞뒤를 비교해 서로 기다리지 않는다.
          const ahead = (ally.x - actor.x) * (dx + ax) + (ally.y - actor.y) * (dy + ay);
          return ahead > 1e-7 || Math.abs(ahead) <= 1e-7 && ally.id < actor.id;
        });
        if (waiting) {
          actor.trafficBlocked = true;
          actor.blocked = false;
          actor.yieldUntilTick = 0;
          break;
        }
      }
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
