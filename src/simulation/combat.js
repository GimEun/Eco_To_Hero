import { canSee, rayDistance } from './geometry.js';
import { randomUnit } from '../game/random.js';
import { weaponFor, weaponDamage, BODY_ARMOR, COMBAT_LIMIT_TICKS } from '../data/weapons.js';

export function selectTarget(state, map, actor) {
  if (!actor.alive) return null;
  const eligible = target => target.alive && target.team !== actor.team && canSee(map, actor, target, state)
    && Math.hypot(target.x - actor.x, target.y - actor.y) <= weaponFor(actor).range;
  const locked = state.actors.find(target => target.id === actor.targetId && eligible(target));
  if (locked) return locked;
  return state.actors.filter(eligible)
    .sort((a, b) => Math.hypot(a.x - actor.x, a.y - actor.y) - Math.hypot(b.x - actor.x, b.y - actor.y)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}

export function hitProbability(actor, target, state = null) {
  const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
  const probability = 0.25 + actor.aim * 0.006
    - distance / weaponFor(actor).range * 0.2 - (actor.moving ? weaponFor(actor).movingPenalty ?? 0.15 : 0);
  return Math.max(0.05, Math.min(0.95, probability * (state && actor.flashUntilTick > state.tick ? 1 - 0.6 * (actor.flashStrength ?? 1) : 1)));
}

export function applyCombatDamage(state, actor, target, rawDamage, event) {
  if (!target.alive || rawDamage <= 0) return;
  const friendlyFire = actor.team === target.team;
  const absorbed = Math.min(target.armor ?? 0, Math.round(rawDamage * BODY_ARMOR.reduction));
  target.armor = Math.max(0, (target.armor ?? 0) - absorbed);
  event.absorbed = absorbed;
  const damage = Math.min(target.hp, rawDamage - absorbed);
  target.hp -= damage;
  target.incomingFire = { x: event.from.x, y: event.from.y, tick: state.tick };
  event.damage = damage;
  if (!friendlyFire) {
    actor.stats.damage += damage;
    target.damageBy[actor.id] = (target.damageBy[actor.id] ?? 0) + damage;
  }
  if (target.hp > 0) return;
  target.alive = false;
  target.moving = false;
  target.reloadUntilTick = null;
  target.targetId = null;
  target.stats.deaths++;
  if (!friendlyFire) actor.stats.kills++;
  const assists = friendlyFire ? [] : Object.keys(target.damageBy).filter(id => id !== actor.id);
  for (const id of assists) state.actors.find(item => item.id === id).stats.assists++;
  state.events.push({ type: 'death', tick: state.tick, actorId: target.id, killerId: actor.id,
    assists, ...(friendlyFire ? { friendlyFire: true } : {}), x: target.x, y: target.y });
}

export function resolveCombat(state, map) {
  if (state.complete) return;
  const plans = [];
  // 같은 틱 시작 시 생존한 선수들의 발사를 모두 확정한 뒤 피해를 적용한다.
  const actors = [...state.actors].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const actor of actors) {
    if (!actor.alive) continue;
    if (actor.action) continue;
    const weapon = weaponFor(actor);
    if (actor.reloadUntilTick !== null && state.tick >= actor.reloadUntilTick) {
      actor.ammo = weapon.magazineSize;
      actor.reloadUntilTick = null;
    }
    if (actor.ammo === 0 && actor.reloadUntilTick === null) {
      actor.reloadUntilTick = state.tick + weapon.reloadTicks;
      state.events.push({ type: 'reload', tick: state.tick, actorId: actor.id });
    }
    const target = selectTarget(state, map, actor);
    if (actor.targetId !== (target?.id ?? null)) {
      actor.targetId = target?.id ?? null;
      actor.readyTick = state.tick + Math.max(4, Math.ceil((600 - actor.intelligence * 4) / 50));
    }
    if (!target) continue;
    actor.facing = Math.atan2(target.y - actor.y, target.x - actor.x);
    if (state.tick < actor.readyTick || state.tick < actor.nextShotTick || actor.reloadUntilTick !== null || actor.ammo <= 0) continue;
    const hit = randomUnit(state) < hitProbability(actor, target, state);
    const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
    const missOffset = hit ? 0 : (randomUnit(state) < 0.5 ? -1 : 1)
      * (Math.atan2(target.radius + 3, Math.max(distance, 1)) + 0.05);
    const angle = actor.facing + missOffset;
    const length = hit ? distance : rayDistance(map, actor, angle, weapon.range);
    const event = {
      type: 'shot', tick: state.tick, actorId: actor.id, targetId: target.id, weaponId: weapon.id,
      from: { x: actor.x, y: actor.y }, to: { x: actor.x + Math.cos(angle) * length, y: actor.y + Math.sin(angle) * length },
      hit, damage: 0,
    };
    actor.ammo--;
    actor.nextShotTick = state.tick + weapon.intervalTicks;
    actor.stats.shots++;
    if (hit) actor.stats.hits++;
    state.events.push(event);
    plans.push({ actor, target, event, weapon });
  }

  for (const { actor, target, event, weapon } of plans) {
    if (!event.hit || !target.alive) continue;
    const rawDamage = weaponDamage(weapon, Math.hypot(target.x - actor.x, target.y - actor.y));
    applyCombatDamage(state, actor, target, rawDamage, event);
  }
  for (const actor of actors) {
    if (actor.targetId && !state.actors.find(target => target.id === actor.targetId)?.alive) actor.targetId = null;
  }
  if (state.round) return;
  const homeAlive = state.actors.some(actor => actor.team === 'home' && actor.alive);
  const awayAlive = state.actors.some(actor => actor.team === 'away' && actor.alive);
  if (!homeAlive || !awayAlive) {
    state.complete = true;
    state.endReason = !homeAlive && !awayAlive ? 'mutual-elimination' : 'elimination';
  } else if (state.tick >= COMBAT_LIMIT_TICKS) {
    state.complete = true;
    state.endReason = 'time-limit';
  }
}
