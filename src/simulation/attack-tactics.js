import { ATTACK_TACTICS } from '../data/attack-tactics.js';
import { cellCenter, reachedDestination, findPath, canOccupy } from './geometry.js';
import { selectTarget } from './combat.js';
import { canEditTactics } from './timeout.js';
import { manualPlanFor, bombCarrierNumber } from './manual-tactics.js';
import { defenseContactSite } from './defense-tactics.js';
import { ROUND_RULES } from '../config/round.js';
import { movementSpeed } from '../data/weapons.js';
import { allocatedSite } from './site-allocation.js';

export function setupAttackPlans(state, plans) {
  if (!plans || !Object.hasOwn(ATTACK_TACTICS, plans.home) || !Object.hasOwn(ATTACK_TACTICS, plans.away)) {
    throw new Error('공격 전술이 올바르지 않습니다.');
  }
  state.attackPlans = { home: plans.home, away: plans.away };
}

export function assignAttackTasks(state, map, team = null) {
  const targetSite = state.attackPlans ? map.tactics.attackSites[state.round.siteName] : null;
  if (!state.timeout?.active) state.round.attackCoordination = null;
  for (const actor of state.actors) {
    if (team && actor.team !== team) continue;
    actor.attackTask = null;
    actor.entryWaiting = false;
    actor.tradeSupportKey = null;
    actor.tradeSupportPath = null;
    if (!state.attackPlans || actor.team !== state.round.attackTeam) continue;
    const siteName = allocatedSite(state, actor) ?? state.round.siteName;
    const site = map.tactics.attackSites[siteName];
    const plan = state.attackPlans[actor.team];
    const carrierNumber = bombCarrierNumber(state, actor.team);
    const index = actor.number === carrierNumber ? 2 : actor.number === 3 ? carrierNumber - 1 : actor.number - 1;
    const role = index < 2 ? 'entry' : index === 2 ? 'carrier' : 'support';
    const flank = role === 'support' && plan === 'split';
    const end = role === 'carrier' ? site.plant : role === 'entry' ? site.entry[index]
      : flank ? site.entry[index - 3] : site.support[index - 3];
    actor.attackTask = { plan, role, slot: index, site: siteName, label: role === 'entry' ? '선두 진입' : role === 'carrier' ? '폭탄 담당' : flank ? '우회 지원' : '후방 지원',
      lane: flank ? 'flank' : 'main', stage: 0, deployed: false,
      points: [...(flank ? site.flank : site.main), end].map(([x, y]) => cellCenter(map, { x, y })),
      plant: cellCenter(map, { x: targetSite.plant[0], y: targetSite.plant[1] }),
      guard: cellCenter(map, { x: targetSite.guards[index][0], y: targetSite.guards[index][1] }),
      guardAngle: targetSite.angles[index] };
  }
  if (state.attackPlans && state.round.bomb.status === 'carried' && !state.round.started) {
    const carrier = state.actors.find(actor => actor.team === state.round.attackTeam
      && actor.number === bombCarrierNumber(state, state.round.attackTeam) && actor.alive);
    if (carrier) state.round.bomb.carrierId = carrier.id;
  }
}

export function setAttackPlan(state, map, plan) {
  if (!state.attackPlans || !canEditTactics(state)
    || !Object.hasOwn(ATTACK_TACTICS, plan)) return false;
  state.attackPlans.home = plan;
  assignAttackTasks(state, map, 'home');
  for (const actor of state.actors.filter(actor => actor.team === 'home' && actor.attackTask)) { actor.objectiveKey = null; actor.patrolMode = null; }
  return true;
}

function nearestStage(actor, points) {
  return points.slice(0, -1).map((point, index) => ({ index,
    distance: Math.hypot(point.x - actor.x, point.y - actor.y) }))
    .sort((a, b) => a.distance - b.distance || b.index - a.index)[0]?.index ?? 0;
}

export function considerSiteRotation(state, map) {
  const round = state.round, bomb = round.bomb;
  const attackers = state.actors.filter(actor => actor.alive && actor.team === round.attackTeam);
  const carrier = attackers.find(actor => actor.id === bomb.carrierId);
  const alternate = map.sites.find(site => site.name !== round.siteName);
  // 수동 명령·설치·폭탄 회수 및 설치 후 목표는 자동 전환으로 덮어쓰지 않는다.
  if (!state.attackPlans || !round.started || round.rotated || bomb.status !== 'carried'
    || round.action?.type === 'plant' || !carrier || attackers.length < 3 || !alternate
    || attackers.some(actor => manualPlanFor(state, actor))) {
    round.rotationPressureTick = null;
    return;
  }
  const contacts = round.attackContacts ?? [];
  const currentCount = contacts.filter(contact => defenseContactSite(map, contact) === round.siteName).length;
  const otherCount = contacts.filter(contact => defenseContactSite(map, contact) === alternate.name).length;
  if (currentCount < 3 || otherCount > 1) { round.rotationPressureTick = null; return; }
  round.rotationPressureTick ??= state.tick;
  if (state.tick - round.rotationPressureTick < 40) return;
  if (carrier.speed <= 0) return;
  const target = map.tactics.attackSites[alternate.name];
  const points = [...(carrier.attackTask.lane === 'flank' ? target.flank : target.main), target.plant]
    .map(([x, y]) => cellCenter(map, { x, y }));
  let previous = carrier, length = 0;
  for (const point of points.slice(nearestStage(carrier, points))) {
    const path = findPath(map, { x: Math.floor(previous.x / map.tileSize), y: Math.floor(previous.y / map.tileSize) },
      { x: Math.floor(point.x / map.tileSize), y: Math.floor(point.y / map.tileSize) }, carrier.radius);
    if (!path.length) return;
    length += Math.hypot(previous.x - path[0].x, previous.y - path[0].y);
    for (let index = 1; index < path.length; index++) length += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
    previous = point;
  }
  // 교전/통행을 위한 5초 여유까지 확보할 수 있을 때만 전환한다.
  if (state.tick + Math.ceil(length / (movementSpeed(carrier) * 0.05)) + ROUND_RULES.plantTicks + 100 >= ROUND_RULES.limitTicks) return;
  const from = round.siteName;
  round.siteName = alternate.name;
  round.rotated = true;
  round.rotationPressureTick = null;
  assignAttackTasks(state, map, round.attackTeam);
  for (const actor of attackers) {
    const task = actor.attackTask;
    // 바뀐 사이트 경로의 가까운 중간점으로 합류해 시작 지점으로 되돌아가지 않는다.
    task.stage = nearestStage(actor, task.points);
    actor.objectiveKey = null;
    actor.patrolMode = null;
  }
  state.events.push({ type: 'site-rotation', tick: state.tick, team: round.attackTeam, from, to: alternate.name });
}

export function prepareAttackCoordination(state, map) {
  for (const actor of state.actors) actor.entryWaiting = false;
  const round = state.round;
  if (!round.started || !state.attackPlans || round.bomb.status !== 'carried') return;
  const actors = state.actors.filter(actor => actor.alive && actor.team === round.attackTeam
    && actor.attackTask?.points.length >= 2 && !manualPlanFor(state, actor));
  if (round.attackCoordination?.plan !== state.attackPlans[round.attackTeam]) round.attackCoordination = null;
  const coordination = round.attackCoordination ??= { startedTick: null, committed: false, reason: null,
    plan: state.attackPlans[round.attackTeam] };
  if (coordination.committed) return;
  const ready = actor => {
    const task = actor.attackTask;
    return task.stage >= task.points.length - 1 || task.stage >= task.points.length - 2
      && Math.hypot(actor.x - task.points.at(-2).x, actor.y - task.points.at(-2).y) <= 40;
  };
  if (actors.some(ready)) coordination.startedTick ??= state.tick;
  const threatened = actors.some(actor => actor.attackTask.role !== 'support'
    && (selectTarget(state, map, actor) || actor.incomingFire && state.tick - actor.incomingFire.tick <= 20));
  let reason = actors.length < 2 ? 'few-players'
    : state.tick >= ROUND_RULES.limitTicks - ROUND_RULES.plantTicks - 200 ? 'deadline'
    : threatened ? 'entry-contact'
    : coordination.startedTick !== null && state.tick - coordination.startedTick >= 60 ? 'wait-limit' : null;
  if (!reason && actors.every(ready)) {
    const flashes = (state.projectiles ?? []).filter(projectile => projectile.kind === 'flashbang'
      && state.actors.some(owner => owner.id === projectile.actorId && owner.team === round.attackTeam)
      && actors.some(actor => Math.hypot(projectile.to.x - actor.attackTask.plant.x, projectile.to.y - actor.attackTask.plant.y) <= 240)
      && projectile.detonateTick >= state.tick);
    if (!flashes.length) reason = 'team-ready';
  }
  if (reason) {
    coordination.committed = true;
    coordination.reason = reason;
    coordination.committedTick = state.tick;
    state.events.push({ type: 'attack-entry', tick: state.tick, team: round.attackTeam, reason });
    return;
  }
  for (const actor of actors) actor.entryWaiting = ready(actor);
}

function tradeSupport(state, map, actor) {
  if (!map || actor.attackTask.role !== 'support' || !state.round.attackCoordination?.committed) return null;
  const entry = state.actors.find(ally => ally.team === actor.team && ally.attackTask?.slot === actor.attackTask.slot - 3);
  if (!entry) return null;
  const death = state.events.findLast(event => event.type === 'death' && event.actorId === entry.id && state.tick - event.tick <= 40);
  const contact = (state.round.attackContacts ?? []).find(item => state.tick - item.tick <= 20
    && item.id === (death?.killerId ?? entry.targetId));
  if (!contact || !death && (!entry.alive || !selectTarget(state, map, entry))) return null;
  const dx = contact.x - entry.x, dy = contact.y - entry.y, length = Math.hypot(dx, dy) || 1;
  const sign = actor.attackTask.slot === 3 ? 1 : -1;
  const point = { x: entry.x - dx / length * 40 - dy / length * 28 * sign,
    y: entry.y - dy / length * 40 + dx / length * 28 * sign };
  const cell = { x: Math.floor(point.x / map.tileSize), y: Math.floor(point.y / map.tileSize) };
  const key = `trade:${entry.id}:${cell.x}:${cell.y}`;
  const center = cellCenter(map, cell);
  if (!canOccupy(map, center.x, center.y, actor.radius)) return null;
  if (actor.tradeSupportPath?.key !== key) actor.tradeSupportPath = { key,
    valid: Boolean(findPath(map, { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) }, cell, actor.radius).length) };
  if (!actor.tradeSupportPath.valid) return null;
  if (actor.tradeSupportKey !== key) {
    actor.tradeSupportKey = key;
    state.events.push({ type: 'trade-support', tick: state.tick, actorId: actor.id, partnerId: entry.id,
      reason: death ? 'observed-trade-window' : 'entry-engaged' });
  }
  return { point: center, key, patrol: false, watch: contact,
    intent: `${actor.attackTask.label} · 선두 후속 교전 지원` };
}

export function attackDestination(state, actor, map = null) {
  const task = actor.attackTask;
  if (actor.entryWaiting) return { point: task.points.at(-2), key: `assemble:${actor.id}:${task.plan}`,
    patrol: false, intent: `${task.label} · 공동 진입 집결 대기` };
  if (state.round.bomb.carrierId !== actor.id && state.round.bomb.status === 'carried'
    && state.tick < ROUND_RULES.limitTicks - ROUND_RULES.plantTicks - 200) {
    const support = tradeSupport(state, map, actor);
    if (support) return support;
  }
  const carrying = state.round.bomb.carrierId === actor.id;
  const last = task.points.length - 1;
  const pointAt = stage => carrying && stage === last ? task.plant : task.points[stage];
  while (task.stage < last && reachedDestination(actor, pointAt(task.stage))) task.stage++;
  const point = pointAt(task.stage);
  if (task.stage === last && reachedDestination(actor, point)) task.deployed = true;
  return { point, key: `attack:${actor.id}:${task.plan}:${task.stage}:${carrying}`,
    patrol: task.deployed && !carrying, intent: `${task.label} · ${carrying ? '폭탄 운반 · ' : ''}${task.deployed ? '진입로 경계' : task.lane === 'flank' ? '외곽 진입' : '중앙 진입'}` };
}
