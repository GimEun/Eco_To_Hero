import { THROWABLES } from '../data/throwables.js';
import { canSee, canOccupy, rayDistance, cellCenter } from './geometry.js';
import { applyCombatDamage } from './combat.js';
import { manualSmokeFor } from './manual-tactics.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clearLine = (map, from, to) => distance(from, to) <= rayDistance(map, from, Math.atan2(to.y - from.y, to.x - from.x), distance(from, to)) + 1e-9;

export function avoidFlashes(state, map) {
  if (state.complete || state.timeout?.active || state.economy?.phase === 'buy') return;
  for (const actor of state.actors) {
    if (!actor.alive || actor.action) continue;
    if (actor.flashThreat && state.tick > actor.flashThreat.detonateTick + 1) actor.flashThreat = null;
    if (!actor.flashThreat) {
      const incoming = state.projectiles.find(projectile => {
        if (projectile.kind !== 'flashbang' || distance(actor, projectile.to) >= THROWABLES[0].radius) return false;
        const progress = Math.min(1, (state.tick - projectile.throwTick) / (projectile.detonateTick - projectile.throwTick));
        return canSee(map, actor, { x: projectile.from.x + (projectile.to.x - projectile.from.x) * progress,
          y: projectile.from.y + (projectile.to.y - projectile.from.y) * progress }, state);
      });
      if (incoming) {
        const origin = distance(actor, incoming.to) <= actor.radius ? incoming.from : incoming.to;
        actor.flashThreat = { seenTick: state.tick, detonateTick: incoming.detonateTick,
          angle: Math.atan2(actor.y - origin.y, actor.x - origin.x), dodged: false };
      }
    }
    const threat = actor.flashThreat;
    if (threat && state.tick - threat.seenTick >= Math.max(2, Math.ceil((100 - actor.intelligence) / 20))) {
      actor.facing = threat.angle;
      if (!threat.dodged) { threat.dodged = true; actor.flashDodges = (actor.flashDodges ?? 0) + 1; }
    }
  }
}

export function updateThrowables(state, map) {
  if (state.complete || state.timeout?.active || state.economy?.phase === 'buy') return;
  state.smokes = (state.smokes ?? []).filter(smoke => smoke.expiresTick > state.tick);
  const due = (state.projectiles ?? []).filter(item => item.detonateTick <= state.tick);
  state.projectiles = (state.projectiles ?? []).filter(item => item.detonateTick > state.tick);
  for (const projectile of due) {
    const item = THROWABLES.find(entry => entry.id === projectile.kind);
    const actor = state.actors.find(entry => entry.id === projectile.actorId);
    const center = projectile.to;
    state.events.push({ type: 'utility-detonated', tick: state.tick, actorId: actor.id, kind: item.id, x: center.x, y: center.y, radius: item.radius });
    if (item.id === 'smoke') {
      state.smokes.push({ ...center, radius: item.radius, expiresTick: state.tick + item.durationTicks });
      continue;
    }
    for (const target of state.actors) {
      if (!target.alive) continue;
      const separation = distance(center, target);
      if (separation >= item.radius || !clearLine(map, center, target)) continue;
      if (item.id === 'flashbang') {
        const light = separation <= target.radius ? projectile.from : center;
        const angle = Math.atan2(light.y - target.y, light.x - target.x) - target.facing;
        const facing = 0.25 + 0.75 * Math.max(0, Math.cos(angle));
        const strength = (1 - separation / item.radius) * facing;
        const duration = Math.ceil(item.durationTicks * strength);
        // 여러 섬광이 겹쳐도 약한 섬광이 강한 섬광의 강도/지속을 연장하지 않는다.
        if ((target.flashUntilTick ?? 0) <= state.tick || strength >= (target.flashStrength ?? 1)) {
          target.flashUntilTick = state.tick + duration;
          target.flashStrength = strength;
        }
        state.events.push({ type: 'flashed', tick: state.tick, actorId: target.id, sourceId: actor.id, durationTicks: duration });
      } else {
        const event = { type: 'grenade-hit', tick: state.tick, actorId: actor.id, targetId: target.id, from: { ...center }, damage: 0, friendlyFire: actor.team === target.team };
        state.events.push(event);
        applyCombatDamage(state, actor, target, Math.round(item.damage * (1 - separation / item.radius)), event);
      }
    }
  }
}

export function autoThrow(state, map) {
  if (state.complete || state.timeout?.active || state.economy?.phase !== 'combat') return;
  for (const actor of state.actors.filter(actor => actor.alive && Object.values(actor.throwables ?? {}).some(Boolean)).sort((a, b) => a.id.localeCompare(b.id))) {
    if (actor.action || actor.flashUntilTick > state.tick || actor.nextUtilityTick > state.tick) continue;
    const plannedSmoke = manualSmokeFor(state, actor);
    const smokePoint = plannedSmoke ? cellCenter(map, plannedSmoke.cell) : null;
    const manualReady = actor.throwables?.smoke && smokePoint && !state.round.manualSmokeThrown[actor.id]
      && distance(actor, smokePoint) <= 220 && clearLine(map, actor, smokePoint);
    const visible = state.actors.filter(other => other.alive && other.team !== actor.team && canSee(map, actor, other, state)
      && distance(actor, other) <= 220).sort((a, b) => distance(actor, a) - distance(actor, b) || a.id.localeCompare(b.id));
    const underFire = actor.incomingFire && state.tick - actor.incomingFire.tick <= 40;
    const target = manualReady ? { ...smokePoint, id: 'manual-smoke' }
      : visible[0] ?? (underFire && actor.throwables.smoke ? { ...actor.incomingFire, id: 'incoming-fire' } : null);
    if (!target) { actor.utilityContact = null; continue; }
    if (actor.utilityContact?.targetId !== target.id) actor.utilityContact = { targetId: target.id, tick: state.tick };
    if (!manualReady && distance(actor, target) < 75) continue;
    for (const id of manualReady ? ['smoke'] : ['grenade', 'flashbang', 'smoke']) {
      if (!actor.throwables?.[id]) continue;
      if (!visible.length && id !== 'smoke') continue;
      const item = THROWABLES.find(entry => entry.id === id);
      if (id === 'smoke' && plannedSmoke && !manualReady) continue;
      const utilityReaction = Math.max(6, Math.ceil((600 - actor.intelligence * 4) / 50)) + 4
        + (((state.seed ?? 0) + actor.number * 7 + state.economy.roundNumber) >>> 0) % 7;
      if (id !== 'smoke' && state.tick - actor.utilityContact.tick < utilityReaction) continue;
      if (id === 'smoke' && !manualReady) {
        const coveringObjective = state.round?.bomb.status === 'planted' || state.actors.some(ally => ally.alive && ally.team === actor.team && ally.action);
        const reaction = Math.max(8, 22 - Math.floor(actor.intelligence / 10))
          + (((state.seed ?? 0) + actor.number * 17 + state.economy.roundNumber * 13 + (actor.team === 'home' ? 11 : 23)) >>> 0) % 25;
        const delay = underFire && actor.hp <= 50 ? Math.max(4, Math.floor(reaction / 2)) : reaction;
        if (!(underFire || visible.length >= 2 || actor.hp <= 50 || coveringObjective)
          || state.tick - actor.utilityContact.tick < delay || distance(actor, target) < 100) continue;
      }
      const point = id === 'smoke' && !manualReady ? { x: actor.x + (target.x - actor.x) * 0.75, y: actor.y + (target.y - actor.y) * 0.75 } : { x: target.x, y: target.y };
      if (!canOccupy(map, point.x, point.y, 1) || !clearLine(map, actor, point)) continue;
      if (id === 'grenade' && state.actors.some(ally => ally.alive && ally.team === actor.team && distance(ally, point) < item.radius * 0.6)) continue;
      if (id === 'flashbang' && target.flashUntilTick > state.tick) continue;
      if (id === 'flashbang') {
        const observers = state.actors.filter(ally => ally.alive && ally.team === actor.team);
        // Effect resolution uses real positions; the decision may only count
        // enemies currently observed by this team, plus known friendly positions.
        const exposed = state.actors.filter(other => other.alive
          && (other.team === actor.team || observers.some(ally => canSee(map, ally, other, state)))
          && distance(other, point) < item.radius && clearLine(map, point, other));
        const friendly = exposed.filter(other => other.team === actor.team);
        if (friendly.length > exposed.length - friendly.length) continue;
      }
      if (!manualReady && state.projectiles.some(other => other.kind === id && state.actors.find(owner => owner.id === other.actorId)?.team === actor.team && distance(other.to, point) < item.radius)) continue;
      if (id === 'smoke' && !manualReady && state.smokes.some(other => distance(other, point) < item.radius + other.radius)) continue;
      actor.throwables[id]--;
      if (manualReady) state.round.manualSmokeThrown[actor.id] = true;
      actor.nextUtilityTick = state.tick + 30;
      actor.nextShotTick = Math.max(actor.nextShotTick, state.tick + 10);
      const projectile = { actorId: actor.id, kind: id, from: { x: actor.x, y: actor.y }, to: point, throwTick: state.tick, detonateTick: state.tick + item.delayTicks };
      state.projectiles.push(projectile);
      state.events.push({ type: 'utility-thrown', tick: state.tick, actorId: actor.id, kind: id, from: { ...projectile.from }, to: { ...point } });
      break;
    }
  }
}
