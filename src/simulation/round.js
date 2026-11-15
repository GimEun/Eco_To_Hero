import { cellCenter } from './geometry.js';
import { selectTarget } from './combat.js';
import { ROUND_RULES, ROUND_VISION } from '../config/round.js';
import { prepareRoundMovement } from './round-movement.js';
import { assignDefenseTasks } from './defense-tactics.js';
import { assignAttackTasks } from './attack-tactics.js';
import { setupManualRound, settleManualRound } from './manual-tactics.js';

export function setupRound(state, map, attackTeam, siteName) {
  const site = map.sites.find(item => item.name === siteName);
  if (!['home', 'away'].includes(attackTeam) || !site) throw new Error('라운드 진영 또는 사이트가 올바르지 않습니다.');
  state.round = { attackTeam, siteName, winner: null, action: null, started: false, attackContact: null, defenseContact: null, defenseContacts: [], defuserId: null, recovererId: null,
    saveReason: null, savePoints: {}, defusePaths: {}, attackContacts: [], smokeRisks: { home: [], away: [] }, initialSiteName: siteName, rotated: false, rotationPressureTick: null,
    bomb: { status: 'carried', carrierId: state.actors.find(actor => actor.team === attackTeam).id,
      x: 0, y: 0, plantedTick: null } };
  for (const actor of state.actors) {
    const attacking = actor.team === attackTeam;
    Object.assign(actor, cellCenter(map, map.spawns[attacking ? 'home' : 'away'][actor.number - 1]),
      ROUND_VISION[attacking ? 'attack' : 'defense'],
      { facing: attacking ? 0 : Math.PI, objectiveKey: null, action: null, patrolMode: null, patrolStep: 0,
        trafficBlocked: false, crowdedGoal: null, navigationTick: null, yieldUntilTick: 0, yieldAngle: 0, keepingDistance: false,
        smokeGuardKey: null, smokeGuardUntil: 0, smokeGuarding: false });
  }
  setupManualRound(state);
  assignDefenseTasks(state, map);
  assignAttackTasks(state, map);
  prepareRound(state, map);
}

function finish(state, winner, reason) {
  state.complete = true;
  state.endReason = reason;
  state.round.winner = winner;
  state.round.action = null;
  settleManualRound(state);
  for (const actor of state.actors) { actor.action = null; actor.moving = false; }
  state.events.push({ type: 'round-end', tick: state.tick, winner, reason });
}

export function prepareRound(state, map) {
  if (state.complete) return;
  const round = state.round;
  const bomb = round.bomb;
  let site = map.sites.find(item => item.name === round.siteName);
  if (bomb.status === 'carried') {
    const carrier = state.actors.find(actor => actor.id === bomb.carrierId);
    bomb.x = carrier.x; bomb.y = carrier.y;
  }
  prepareRoundMovement(state, map, site);
  site = map.sites.find(item => item.name === round.siteName);
  let candidate = null;
  let type = null;
  if (bomb.status === 'carried') {
    type = 'plant';
    candidate = state.actors.find(actor => actor.id === bomb.carrierId && actor.alive
      && actor.x >= site.x * map.tileSize && actor.x < (site.x + site.width) * map.tileSize
      && actor.y >= site.y * map.tileSize && actor.y < (site.y + site.height) * map.tileSize);
  } else if (bomb.status === 'planted') {
    type = 'defuse';
    candidate = state.actors.filter(actor => actor.alive && actor.id === round.defuserId
      && Math.hypot(actor.x - bomb.x, actor.y - bomb.y) <= 12)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
  }
  if (candidate) {
    const duration = type === 'plant' ? ROUND_RULES.plantTicks : ROUND_RULES.defuseTicks;
    const continuing = round.action?.actorId === candidate.id && round.action.type === type;
    const remaining = Math.max(0, duration - (continuing ? state.tick - round.action.startTick : 0));
    const deadline = type === 'plant' ? ROUND_RULES.limitTicks : bomb.plantedTick + ROUND_RULES.fuseTicks;
    const timeLeft = deadline - state.tick;
    // 중단하면 처음부터 다시 해야 한다. 완료는 가능하지만 재시도할 시간이 없으면 목표를 우선한다.
    // 1틱 여유는 마감과 같은 틱의 완료가 패배인 기존 규칙에 맞춘다.
    const lastChance = timeLeft > remaining && timeLeft <= duration + 1;
    const hitAge = candidate.incomingFire ? state.tick - candidate.incomingFire.tick : Infinity;
    const recentlyHit = hitAge >= 0 && hitAge <= 20;
    if (!lastChance && (recentlyHit || selectTarget(state, map, candidate))) candidate = null;
  }
  if (!candidate) round.action = null;
  else {
    if (round.action?.actorId !== candidate.id || round.action?.type !== type) {
      round.action = { actorId: candidate.id, type, startTick: state.tick };
      state.events.push({ type: `${type}-start`, tick: state.tick, actorId: candidate.id });
    }
    candidate.action = type;
  }
}

export function resolveRound(state) {
  if (state.complete) return;
  const round = state.round;
  const bomb = round.bomb;
  const defenders = round.attackTeam === 'home' ? 'away' : 'home';
  const attackAlive = state.actors.some(actor => actor.alive && actor.team === round.attackTeam);
  const defenseAlive = state.actors.some(actor => actor.alive && actor.team === defenders);
  if (bomb.status === 'carried') {
    const carrier = state.actors.find(actor => actor.id === bomb.carrierId);
    bomb.x = carrier.x; bomb.y = carrier.y;
    if (!carrier.alive) {
      bomb.status = 'dropped'; bomb.carrierId = null; round.action = null;
      state.events.push({ type: 'bomb-drop', tick: state.tick, actorId: carrier.id });
    }
  }
  // 마감 틱의 폭발/시간 종료가 같은 틱의 해체/설치 완료보다 우선한다.
  if (bomb.status === 'planted' && state.tick >= bomb.plantedTick + ROUND_RULES.fuseTicks) {
    bomb.status = 'exploded'; finish(state, round.attackTeam, 'explosion'); return;
  }
  if (bomb.status !== 'planted' && !attackAlive) { finish(state, defenders, 'attack-eliminated'); return; }
  if (!defenseAlive && attackAlive) { finish(state, round.attackTeam, 'defense-eliminated'); return; }
  if (bomb.status !== 'planted' && state.tick >= ROUND_RULES.limitTicks) { finish(state, defenders, 'timeout'); return; }
  if (bomb.status === 'dropped') {
    const picker = state.actors.filter(actor => actor.alive && actor.team === round.attackTeam
      && Math.hypot(actor.x - bomb.x, actor.y - bomb.y) <= 12).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (picker) {
      bomb.status = 'carried'; bomb.carrierId = picker.id;
      state.events.push({ type: 'bomb-pickup', tick: state.tick, actorId: picker.id });
    }
  }
  const action = round.action;
  const actor = action && state.actors.find(item => item.id === action.actorId);
  if (!actor?.alive) { round.action = null; return; }
  const duration = action.type === 'plant' ? ROUND_RULES.plantTicks : ROUND_RULES.defuseTicks;
  if (state.tick - action.startTick < duration) return;
  if (action.type === 'plant') {
    Object.assign(bomb, { status: 'planted', carrierId: null, x: actor.x, y: actor.y, plantedTick: state.tick });
    state.events.push({ type: 'bomb-planted', tick: state.tick, actorId: actor.id });
    round.action = null; actor.action = null;
  } else {
    bomb.status = 'defused';
    state.events.push({ type: 'bomb-defused', tick: state.tick, actorId: actor.id });
    finish(state, defenders, 'defused');
  }
}
