import { canSee } from './geometry.js';
import { reactionTicks } from './combat.js';

export const HEARING_RANGE = 300;

export function updateHearing(state) {
  for (const actor of state.actors) {
    if (!actor.alive) { actor.pendingSound = null; actor.heardSound = null; continue; }
    if (actor.heardSound && state.tick - actor.heardSound.tick > 100) actor.heardSound = null;
    if (!actor.pendingSound || state.tick < actor.pendingSound.readyTick) continue;
    actor.heardSound = actor.pendingSound;
    actor.pendingSound = null;
  }
}

export function captureSounds(state, map, eventStart) {
  const shots = state.events.slice(eventStart).filter(event => event.type === 'shot');
  const sources = state.actors.flatMap(actor => {
    const shot = shots.find(event => event.actorId === actor.id);
    if (shot) return [{ ...shot.from, team: actor.team, kind: 'shot', tick: state.tick }];
    return actor.alive && actor.moving ? [{ x: actor.x, y: actor.y, team: actor.team, kind: 'footstep', tick: state.tick }] : [];
  });
  for (const actor of state.actors) {
    if (!actor.alive || actor.pendingSound) continue;
    const source = sources.filter(source => source.team !== actor.team
      && Math.hypot(source.x - actor.x, source.y - actor.y) <= HEARING_RANGE
      && !canSee(map, actor, source, state))
      .sort((a, b) => Math.hypot(a.x - actor.x, a.y - actor.y) - Math.hypot(b.x - actor.x, b.y - actor.y))[0];
    // 발생 위치를 복사한다. 감춰진 선수의 이후 위치로 기억을 갱신하지 않는다.
    if (source) actor.pendingSound = { ...source, readyTick: state.tick + reactionTicks(actor) * 2 };
  }
}
