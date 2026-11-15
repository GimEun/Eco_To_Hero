import { DEFENSE_TACTICS } from '../data/defense-tactics.js';
import { cellCenter, canSee } from './geometry.js';
import { weaponFor } from '../data/weapons.js';
import { canEditTactics } from './timeout.js';
import { selectTarget } from './combat.js';
import { manualPlanFor } from './manual-tactics.js';

export function setupDefensePlans(state, plans) {
  if (!plans || !Object.hasOwn(DEFENSE_TACTICS, plans.home) || !Object.hasOwn(DEFENSE_TACTICS, plans.away)) {
    throw new Error('수비 전술이 올바르지 않습니다.');
  }
  state.defensePlans = { home: plans.home, away: plans.away };
}

export function assignDefenseTasks(state, map, team = null) {
  for (const actor of state.actors) {
    if (team && actor.team !== team) continue;
    const withdrawn = state.round.started && actor.defenseTask?.withdrawn;
    const retreating = state.round.started && actor.retreating;
    actor.defenseTask = null; actor.retreating = false;
    if (!state.defensePlans || actor.team === state.round.attackTeam) continue;
    const plan = state.defensePlans[actor.team];
    const task = map.tactics.defenseTasks[actor.number - 1];
    const [x, y] = plan === 'forward' && task.forward ? task.forward : task.standard;
    const [fx, fy] = plan === 'forward' && task.forwardFallback ? task.forwardFallback : task.fallback;
    actor.defenseTask = { label: task.label, role: task.role, site: task.site, plan,
      anchor: cellCenter(map, { x, y }), fallback: cellCenter(map, { x: fx, y: fy }), withdrawn: Boolean(withdrawn) };
    actor.retreating = Boolean(retreating);
  }
}

export function setDefensePlan(state, map, plan) {
  if (!state.defensePlans || !canEditTactics(state)
    || !Object.hasOwn(DEFENSE_TACTICS, plan)) return false;
  state.defensePlans.home = plan;
  assignDefenseTasks(state, map, 'home');
  for (const actor of state.actors.filter(actor => actor.team === 'home' && actor.defenseTask)) { actor.objectiveKey = null; actor.patrolMode = null; }
  return true;
}

export function defenseContactSite(map, contact) {
  return contact.y < (map.tactics?.contactSplitY ?? map.rows / 2) * map.tileSize ? 'A' : 'B';
}

export function defenseDestination(state, actor, map) {
  const task = actor.defenseTask;
  // 열세 비교의 적과 지원 아군 모두 실제 사격 가능한 거리로 맞춘다.
  // 멀리 보이기만 하는 적 때문에 전방 선수가 교전 전에 물러나지 않게 한다.
  const enemies = state.actors.filter(target => target.alive && target.team !== actor.team && canSee(map, actor, target, state)
    && Math.hypot(actor.x - target.x, actor.y - target.y) <= weaponFor(actor).range);
  const support = state.actors.filter(ally => ally.alive && ally.team === actor.team && !ally.defenseTask?.withdrawn
    && enemies.some(enemy => canSee(map, ally, enemy, state) && Math.hypot(ally.x - enemy.x, ally.y - enemy.y) <= weaponFor(ally).range)).length;
  if (actor.hp <= 45 || task.role === 'front' && task.plan === 'forward' && enemies.length >= 2 && enemies.length > support) task.withdrawn = true;
  if (task.withdrawn) {
    actor.retreating = Math.hypot(actor.x - task.fallback.x, actor.y - task.fallback.y) > 1;
    return { point: task.fallback, key: `withdraw:${actor.id}`, hold: true,
      intent: actor.retreating ? `${task.label} · 후퇴` : `${task.label} · 후퇴 후 경계` };
  }
  if (task.role === 'support' && state.round.defenseContact) {
    const contacts = state.round.defenseContacts ?? [];
    const upper = contacts.filter(contact => defenseContactSite(map, contact) === 'A').length;
    const lower = contacts.length - upper;
    const site = upper === lower ? defenseContactSite(map, state.round.defenseContact) : upper > lower ? 'A' : 'B';
    const [x, y] = map.tactics.support[task.plan][site];
    return { point: cellCenter(map, { x, y }), key: `support:${y}`, intent: `${site} 접촉 구역 지원` };
  }
  if (task.role === 'anchor' && state.round.defenseContact) {
    const contacts = (state.round.defenseContacts ?? []).filter(contact => state.tick >= contact.tick && state.tick - contact.tick <= 100);
    const recent = contacts.filter(contact => state.tick - contact.tick <= 40 && defenseContactSite(map, contact) !== task.site);
    const allies = state.actors.filter(ally => ally.alive && ally.team === actor.team);
    const guarded = allies.some(ally => ally.defenseTask?.role === 'front' && ally.defenseTask.site === task.site
      && !manualPlanFor(state, ally) && Math.hypot(
      ally.x - (ally.defenseTask.withdrawn ? ally.defenseTask.fallback : ally.defenseTask.anchor).x,
      ally.y - (ally.defenseTask.withdrawn ? ally.defenseTask.fallback : ally.defenseTask.anchor).y) <= map.tileSize * 2);
    // A lone sighting is insufficient unless a teammate is actually fighting it.
    // The destination and facing below use recorded observations, not hidden positions.
    if (state.round.bomb.status !== 'planted' && guarded && recent.length
      && !contacts.some(contact => defenseContactSite(map, contact) === task.site)) {
      const pressure = recent.length >= 2 || recent.some(contact => allies.some(ally => selectTarget(state, map, ally)?.id === contact.id));
      if (pressure) {
        const candidates = allies.filter(ally => ally.defenseTask?.role === 'anchor' && ally.defenseTask.site === task.site
          && ally.hp > 45 && !ally.defenseTask.withdrawn && !manualPlanFor(state, ally) && !selectTarget(state, map, ally))
          .sort((a, b) => a.id.localeCompare(b.id));
        if (candidates[0]?.id === actor.id) {
          const contact = [...recent].sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id))[0];
          const site = defenseContactSite(map, contact);
          const [x, y] = map.tactics.support[task.plan][site];
          return { point: cellCenter(map, { x, y }), key: `contact-support:${actor.id}:${site}`,
            watch: contact, intent: `${site} 교전 지원 · ${task.site} 앵커 합류` };
        }
      }
    }
    const [x, y] = map.tactics.support[task.plan][task.site];
    return { point: cellCenter(map, { x, y }), key: `crossfire:${actor.id}`, intent: `${task.label} · 진입로 교차 지원` };
  }
  return { point: task.anchor, key: `task:${actor.id}:${task.plan}`, intent: `${task.label}${task.plan === 'forward' && task.role === 'front' ? ' · 전진' : ''}` };
}
