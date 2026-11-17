import { cellCenter, findPath, canOccupy, canSee, moveWithCollision, rayDistance } from './geometry.js';
import { ROUND_RULES } from '../config/round.js';
import { MATCH_RULES } from '../config/match.js';
import { weaponFor, movementSpeed } from '../data/weapons.js';
import { selectTarget } from './combat.js';
import { defenseDestination, defenseContactSite } from './defense-tactics.js';
import { attackDestination, considerSiteRotation, prepareAttackCoordination } from './attack-tactics.js';
import { manualDestination, manualPlanFor } from './manual-tactics.js';
import { defenseSmokeDestination } from './defense-smoke.js';

function crossesSmoke(from, to, smoke, margin = 0) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  if (!length) return false;
  const t = Math.max(0, Math.min(1, ((smoke.x - from.x) * dx + (smoke.y - from.y) * dy) / length));
  return Math.hypot(from.x + dx * t - smoke.x, from.y + dy * t - smoke.y) < smoke.radius + margin;
}

function updateSmokeRisks(state, map, team, contacts, observers) {
  const active = (state.smokes ?? []).filter(smoke => smoke.expiresTick > state.tick);
  const key = smoke => `${smoke.x}:${smoke.y}:${smoke.expiresTick}`;
  state.round.smokeRisks ??= { home: [], away: [] };
  if (!active.length) { state.round.smokeRisks[team] = []; return; }
  const risks = new Map(state.round.smokeRisks[team]
    .filter(risk => active.some(smoke => key(smoke) === risk.key)).map(risk => [risk.key, risk]));
  for (const contact of contacts) {
    if (state.tick - contact.tick > 100) continue;
    for (const observer of observers) {
      // Test only the recorded position. Never refresh it from a hidden actor.
      if (!canSee(map, observer, contact, { ...state, smokes: [] }) || canSee(map, observer, contact, state)) continue;
      for (const smoke of active.filter(smoke => crossesSmoke(observer, contact, smoke))) {
        if (!risks.has(key(smoke))) risks.set(key(smoke), { key: key(smoke), x: smoke.x, y: smoke.y,
          radius: smoke.radius, expiresTick: smoke.expiresTick, notedTick: state.tick });
      }
    }
  }
  state.round.smokeRisks[team] = [...risks.values()];
}

function prepareSmokeGuards(state, map) {
  const round = state.round, bomb = round.bomb;
  const urgent = bomb.status === 'planted'
    ? bomb.plantedTick + ROUND_RULES.fuseTicks - state.tick <= ROUND_RULES.defuseTicks + 200
    : ROUND_RULES.limitTicks - state.tick <= ROUND_RULES.plantTicks + 200;
  for (const actor of state.actors) {
    actor.smokeGuarding = false;
    const risks = round.smokeRisks[actor.team];
    if (!risks.some(risk => risk.key === actor.smokeGuardKey)) actor.smokeGuardKey = null;
    if (!actor.alive || urgent || actor.retreating || manualPlanFor(state, actor)
      || actor.defenseSmoke || round.action?.actorId === actor.id || actor.arrived || selectTarget(state, map, actor)) continue;
    const next = actor.route[actor.waypoint];
    const risk = risks.find(risk => next && Math.hypot(actor.x - risk.x, actor.y - risk.y) > risk.radius + actor.radius
      && Math.hypot(actor.x - risk.x, actor.y - risk.y) <= risk.radius + 70 && crossesSmoke(actor, next, risk, actor.radius));
    if (!risk) continue;
    if (actor.smokeGuardKey !== risk.key) {
      actor.smokeGuardKey = risk.key;
      actor.smokeGuardUntil = Math.min(state.tick + 40, risk.expiresTick);
      state.events.push({ type: 'smoke-risk-response', tick: state.tick, actorId: actor.id, team: actor.team,
        reason: 'last-contact-behind-smoke' });
    }
    if (state.tick >= actor.smokeGuardUntil) continue;
    actor.smokeGuarding = true;
    actor.watchAngle = Math.atan2(risk.y - actor.y, risk.x - actor.x);
    actor.facing = actor.watchAngle;
    actor.intent = '연막 위험 경계 · 짧게 확인 후 진입';
  }
}

function routeTo(actor, map, point, key) {
  if (actor.objectiveKey === key) return;
  const start = { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) };
  const goal = { x: Math.floor(point.x / map.tileSize), y: Math.floor(point.y / map.tileSize) };
  const route = findPath(map, start, goal, actor.radius);
  if (!route.length) throw new Error('라운드 목표에 도달할 경로가 없습니다.');
  actor.route = [{ x: actor.x, y: actor.y }, ...route, { x: point.x, y: point.y }];
  Object.assign(actor, { waypoint: 1, arrived: false, blocked: false, trafficBlocked: false, crowdedGoal: null, navigationTick: null, objectiveKey: key });
}

function patrol(state, actor, map, center, mode, offsets = [[-2, -1], [-1, -2], [1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1]]) {
  const cell = { x: Math.floor(center.x / map.tileSize), y: Math.floor(center.y / map.tileSize) };
  const points = offsets
    .map(([dx, dy]) => cellCenter(map, { x: cell.x + dx, y: cell.y + dy }))
    .filter(point => canOccupy(map, point.x, point.y, actor.radius));
  if (!points.length) throw new Error('사이트 주변에 순찰 가능한 위치가 없습니다.');
  if (actor.patrolMode !== mode) {
    actor.patrolMode = mode;
    actor.patrolStep = actor.number - 1 + (actor.team === 'home' ? 0 : 2);
  } else if (actor.arrived && actor.objectiveKey?.startsWith(`patrol:${mode}:`)) actor.patrolStep++;
  const preferred = actor.patrolStep % points.length;
  const reserved = state.actors.filter(other => other.alive && other.team === actor.team && other.id !== actor.id
    && (other.number < actor.number || other.id === state.round.defuserId || other.id === state.round.bomb.carrierId));
  const index = Array.from({ length: points.length }, (_, step) => (preferred + step) % points.length)
    .find(index => reserved.every(other => {
      const goal = other.route.at(-1);
      return Math.hypot(points[index].x - goal.x, points[index].y - goal.y) >= actor.radius + other.radius + 12;
    })) ?? preferred;
  routeTo(actor, map, points[index], `patrol:${mode}:${index}`);
}

function defuseTravelTicks(state, map, actor) {
  const bomb = state.round.bomb;
  if (Math.hypot(actor.x - bomb.x, actor.y - bomb.y) <= 12) return 0;
  if (actor.speed <= 0) return Infinity;
  const start = { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) };
  const goal = { x: Math.floor(bomb.x / map.tileSize), y: Math.floor(bomb.y / map.tileSize) };
  // 정적 맵 경로만 칸별로 재사용한다. 적의 숨은 위치나 이동 방해를 미리 읽지 않는다.
  const paths = state.round.defusePaths ??= {};
  const key = `${start.x}:${start.y}:${goal.x}:${goal.y}:${actor.radius}`;
  if (paths[actor.id]?.key !== key) paths[actor.id] = { key, path: findPath(map, start, goal, actor.radius) };
  const path = paths[actor.id].path;
  if (!path.length) return Infinity;
  const points = [...path, bomb];
  if (points.length > 1) {
    const direct = moveWithCollision(map, actor, points[1]);
    if (Math.hypot(direct.x - points[1].x, direct.y - points[1].y) < 1e-7) points.shift();
  }
  let distance = 0, previous = actor;
  for (const point of points) {
    distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return Math.ceil(Math.max(0, distance - 12) / (movementSpeed(actor) * 0.05));
}

function equipmentCarriesOver(state) {
  if (!state.match) return true;
  const number = state.economy.roundNumber;
  const rules = MATCH_RULES;
  if (number === rules.regulationHalf || number >= rules.regulationHalf * 2
    && (number - rules.regulationHalf * 2) % rules.overtimeHalf === 0) return false;
  const attacker = state.round.attackTeam;
  return state.match.overtime
    ? state.match.overtimeScore[attacker] < rules.overtimeTarget - 1
    : state.match.score[attacker] < rules.regulationTarget - 1;
}

function prepareRetake(state, map, defenders, attackers) {
  const round = state.round, bomb = round.bomb;
  const timeLeft = bomb.plantedTick + ROUND_RULES.fuseTicks - state.tick;
  const attempts = defenders.map(actor => {
    const continuing = round.action?.type === 'defuse' && round.action.actorId === actor.id
      && Math.hypot(actor.x - bomb.x, actor.y - bomb.y) <= 12;
    const remaining = continuing ? Math.max(0, ROUND_RULES.defuseTicks - (state.tick - round.action.startTick)) : ROUND_RULES.defuseTicks;
    return { actor, continuing, ticks: defuseTravelTicks(state, map, actor) + remaining };
  }).sort((a, b) => a.ticks - b.ticks || a.actor.id.localeCompare(b.actor.id));
  const current = attempts.find(item => item.actor.id === round.defuserId);
  // 진행 중인 해체는 보존한다. 기존 담당이 늦고 다른 선수가 가능할 때만 교대한다.
  if (!current || current.ticks >= timeLeft && attempts[0]?.ticks < timeLeft) round.defuserId = attempts[0]?.actor.id ?? null;
  let reason = null;
  if (defenders.length && attempts.every(item => item.ticks >= timeLeft)) reason = 'time';
  const lone = defenders.length === 1 ? defenders[0] : null;
  const guarded = round.defenseContacts.filter(contact => Math.hypot(contact.x - bomb.x, contact.y - bomb.y) <= 240).length;
  const gear = lone && (weaponFor(lone).price > 0 || lone.armor > 0 || Object.values(lone.throwables).some(Boolean));
  if (!reason && lone && gear && equipmentCarriesOver(state) && attackers.length >= 3 && guarded >= 2
    && lone.hp <= 45 && timeLeft <= ROUND_RULES.defuseTicks + 200
    && !current?.continuing && Math.hypot(lone.x - bomb.x, lone.y - bomb.y) > 12) reason = 'odds';
  if (reason !== round.saveReason) {
    round.savePoints = {};
    if (reason) state.events.push({ type: 'equipment-save', tick: state.tick, team: defenders[0].team, reason });
  }
  round.saveReason = reason;
  if (reason) round.defuserId = null;
}

function savingPoint(state, map, actor) {
  const round = state.round;
  if (round.savePoints[actor.id]) return round.savePoints[actor.id];
  const candidates = Object.values(map.spawns).flat().map(cell => cellCenter(map, cell));
  const ranked = candidates.map(point => {
    const separation = round.defenseContacts.length ? Math.min(...round.defenseContacts.map(contact => {
      const distance = Math.hypot(point.x - contact.x, point.y - contact.y);
      const cover = rayDistance(map, point, Math.atan2(contact.y - point.y, contact.x - point.x), distance) < distance;
      return Math.min(300, distance) + (cover ? 120 : 0);
    })) : 0;
    return { point, score: separation + Math.hypot(point.x - round.bomb.x, point.y - round.bomb.y) * 0.3
      - Math.hypot(point.x - actor.x, point.y - actor.y) * 0.1 };
  }).sort((a, b) => b.score - a.score || a.point.y - b.point.y || a.point.x - b.point.x);
  const start = { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) };
  const destination = ranked.find(({ point }) => findPath(map, start,
    { x: Math.floor(point.x / map.tileSize), y: Math.floor(point.y / map.tileSize) }, actor.radius).length)?.point ?? { x: actor.x, y: actor.y };
  round.savePoints[actor.id] = destination;
  return destination;
}

export function prepareRoundMovement(state, map, site, manualPlantCarrierId = null) {
  const round = state.round;
  const bomb = round.bomb;
  const defenders = state.actors.filter(actor => actor.alive && actor.team !== round.attackTeam);
  const attackers = state.actors.filter(actor => actor.alive && actor.team === round.attackTeam);
  const observations = defenders.flatMap(observer => attackers.filter(target => canSee(map, observer, target, state))
    .map(target => ({ target, distance: Math.hypot(target.x - observer.x, target.y - observer.y) })))
    .sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id));
  const observed = observations[0]?.target;
  const contacts = new Map((round.defenseContacts ?? []).map(contact => [contact.id, contact]));
  for (const { target } of observations) contacts.set(target.id, { id: target.id, x: target.x, y: target.y, tick: state.tick });
  updateSmokeRisks(state, map, round.attackTeam === 'home' ? 'away' : 'home', [...contacts.values()], defenders);
  round.defenseContacts = [...contacts.values()].filter(contact => state.tick - contact.tick <= 100 && attackers.some(actor => actor.id === contact.id));
  if (observed) round.defenseContact = { id: observed.id, x: observed.x, y: observed.y, tick: state.tick };
  if (round.defenseContact && (state.tick - round.defenseContact.tick > 100
    || !attackers.some(actor => actor.id === round.defenseContact.id))) round.defenseContact = null;
  const attackObservations = attackers.flatMap(observer => defenders.filter(target => canSee(map, observer, target, state))
    .map(target => ({ target, distance: Math.hypot(target.x - observer.x, target.y - observer.y) })))
    .sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id));
  const attackObserved = attackObservations[0]?.target;
  const attackContacts = new Map((round.attackContacts ?? []).map(contact => [contact.id, contact]));
  for (const { target } of attackObservations) attackContacts.set(target.id, { id: target.id, x: target.x, y: target.y, tick: state.tick });
  updateSmokeRisks(state, map, round.attackTeam, [...attackContacts.values()], attackers);
  round.attackContacts = [...attackContacts.values()].filter(contact => state.tick - contact.tick <= 100 && defenders.some(actor => actor.id === contact.id));
  if (attackObserved) round.attackContact = { id: attackObserved.id, x: attackObserved.x, y: attackObserved.y, tick: state.tick };
  if (round.attackContact && (state.tick - round.attackContact.tick > 100
    || !defenders.some(actor => actor.id === round.attackContact.id))) round.attackContact = null;
  considerSiteRotation(state, map);
  prepareAttackCoordination(state, map);
  site = map.sites.find(item => item.name === round.siteName);
  if (bomb.status === 'planted') {
    if (!defenders.some(actor => actor.id === round.defuserId)) {
      round.defuserId = [...defenders].sort((a, b) => Math.hypot(a.x - bomb.x, a.y - bomb.y)
        - Math.hypot(b.x - bomb.x, b.y - bomb.y) || a.id.localeCompare(b.id))[0]?.id ?? null;
    }
    if (state.economy) prepareRetake(state, map, defenders, attackers);
  }
  if (state.attackPlans && bomb.status === 'dropped' && !attackers.some(actor => actor.id === round.recovererId)) {
    round.recovererId = [...attackers].sort((a, b) => Math.hypot(a.x - bomb.x, a.y - bomb.y)
      - Math.hypot(b.x - bomb.x, b.y - bomb.y) || a.id.localeCompare(b.id))[0]?.id ?? null;
  } else if (bomb.status !== 'dropped') round.recovererId = null;
  const pairContact = bomb.status !== 'planted' && defenders.length === 2 && round.defenseContact
    && !defenders.some(actor => manualPlanFor(state, actor)) ? round.defenseContact : null;
  const pairPoint = pairContact && cellCenter(map, {
    x: Math.floor(pairContact.x / map.tileSize), y: Math.floor(pairContact.y / map.tileSize),
  });
  const pairKey = pairPoint && `pair-contact:${pairPoint.x}:${pairPoint.y}`;
  // 같은 관측 지점에서는 기존 담당을 유지해 이동 중 거리 변화로 역할이 뒤집히지 않게 한다.
  const pairScout = pairPoint && (defenders.find(actor => actor.patrolMode === `${pairKey}:check`)
    ?? [...defenders].sort((a, b) => Math.hypot(a.x - pairPoint.x, a.y - pairPoint.y)
      - Math.hypot(b.x - pairPoint.x, b.y - pairPoint.y) || a.id.localeCompare(b.id))[0]);
  for (const actor of [...state.actors].sort((a, b) => a.id.localeCompare(b.id))) {
    actor.action = null;
    actor.retreating = false;
    actor.watchAngle = null;
    actor.smokeWatching = false;
    if (!actor.alive) { actor.defenseSmoke = null; continue; }
    const attacking = actor.team === round.attackTeam;
    const manual = manualDestination(state, map, actor);
    const carrying = bomb.carrierId === actor.id;
    if (carrying && actor.id === manualPlantCarrierId) {
      const target = selectTarget(state, map, actor);
      const look = target ?? round.attackContact;
      actor.watchAngle = look ? Math.atan2(look.y - actor.y, look.x - actor.x) : manual?.angle ?? actor.facing;
      actor.facing = actor.watchAngle;
      actor.intent = target ? '사이트 내 교전 · 교전 종료 후 설치' : '사이트 도착 · 폭탄 설치 준비';
      routeTo(actor, map, actor, `manual-site:${actor.id}:${site.name}`);
      actor.arrived = true;
      actor.waypoint = actor.route.length;
      continue;
    }
    if (manual && bomb.status !== 'planted' && !(attacking && (bomb.status === 'dropped' || carrying && manual.arrived))) {
      actor.defenseSmoke = null;
      actor.intent = manual.arrived ? '수동 지점 경계' : '수동 경유점 이동';
      if (manual.arrived) {
        const enemies = attacking ? defenders : attackers;
        const locked = enemies.find(target => target.id === actor.targetId && canSee(map, actor, target, state));
        actor.watchAngle = locked ? Math.atan2(locked.y - actor.y, locked.x - actor.x) : manual.angle;
        actor.facing = actor.watchAngle;
      }
      routeTo(actor, map, manual.point, manual.key);
      continue;
    }
    const smokeDestination = defenseSmokeDestination(state, map, actor);
    if (smokeDestination) {
      actor.intent = smokeDestination.intent;
      actor.watchAngle = smokeDestination.watchAngle;
      actor.facing = actor.watchAngle;
      routeTo(actor, map, smokeDestination.point, smokeDestination.key);
      continue;
    }
    const sound = actor.heardSound;
    const visual = (attacking ? round.attackContact : round.defenseContact)
      || state.actors.some(target => target.alive && target.team !== actor.team && canSee(map, actor, target, state));
    if (sound && !visual && !manual && bomb.status === 'carried' && !carrying
      && ROUND_RULES.limitTicks - state.tick > ROUND_RULES.plantTicks + 200) {
      const key = `sound:${sound.x}:${sound.y}`;
      const reachable = actor.objectiveKey === key || findPath(map,
        { x: Math.floor(actor.x / map.tileSize), y: Math.floor(actor.y / map.tileSize) },
        { x: Math.floor(sound.x / map.tileSize), y: Math.floor(sound.y / map.tileSize) }, actor.radius).length;
      if (reachable) {
        actor.watchAngle = Math.atan2(sound.y - actor.y, sound.x - actor.x);
        actor.facing = actor.watchAngle;
        actor.intent = `${sound.kind === 'shot' ? '총성' : '발소리'} 위치 확인`;
        routeTo(actor, map, sound, key);
        continue;
      }
    }
    if (bomb.status === 'planted') {
      if (!attacking && round.saveReason) {
        const point = savingPoint(state, map, actor);
        actor.intent = round.saveReason === 'time' ? '장비 보존 · 해체 시간 부족' : '장비 보존 · 불리한 재탈환';
        actor.retreating = true;
        const contact = round.defenseContact;
        if (contact) actor.watchAngle = Math.atan2(contact.y - actor.y, contact.x - actor.x);
        routeTo(actor, map, point, `save:${point.x}:${point.y}`);
      } else if (actor.id === round.defuserId) {
        actor.intent = '폭탄 해체를 위해 접근';
        routeTo(actor, map, bomb, `defuse:${bomb.x}:${bomb.y}`);
      } else if (attacking && actor.attackTask) {
        const task = actor.attackTask;
        const locked = defenders.find(target => target.id === actor.targetId && canSee(map, actor, target, state));
        const look = locked ?? round.attackContact;
        actor.watchAngle = look ? Math.atan2(look.y - actor.y, look.x - actor.x) : task.guardAngle;
        actor.facing = actor.watchAngle;
        actor.intent = `${task.label} · 설치 후 담당 진입로 경계`;
        patrol(state, actor, map, task.guard, `attack-guard:${actor.id}`, [[0, 0], [0, -1], [0, 1]]);
      } else {
        actor.intent = attacking ? '설치 후 주변 경계' : '해체 지원·주변 경계';
        patrol(state, actor, map, bomb, attacking ? 'post-plant' : 'retake-cover');
      }
    } else if (attacking) {
      const locked = defenders.find(target => target.id === actor.targetId && canSee(map, actor, target, state));
      const contact = locked ?? round.attackContact;
      if (contact) {
        actor.watchAngle = Math.atan2(contact.y - actor.y, contact.x - actor.x);
        actor.facing = actor.watchAngle;
      }
      const recovering = bomb.status === 'dropped';
      if (manual?.arrived && carrying) {
        actor.intent = '수동 경로 완료 · 폭탄 설치 지점으로 이동';
        routeTo(actor, map, cellCenter(map, { x: site.x, y: site.y + Math.floor(site.height / 2) }), `manual-plant:${actor.id}`);
        continue;
      }
      if (actor.attackTask && (!recovering || actor.id !== round.recovererId)) {
        const destination = attackDestination(state, actor, map);
        actor.intent = destination.intent;
        if (destination.watch) {
          actor.watchAngle = Math.atan2(destination.watch.y - actor.y, destination.watch.x - actor.x);
          actor.facing = actor.watchAngle;
        }
        if (destination.patrol) {
          const locked = defenders.find(target => target.id === actor.targetId && canSee(map, actor, target, state));
          const look = locked ?? round.attackContact ?? actor.attackTask.plant;
          actor.watchAngle = Math.atan2(look.y - actor.y, look.x - actor.x);
          actor.facing = actor.watchAngle;
        }
        if (destination.patrol) patrol(state, actor, map, destination.point, destination.key, [[0, 0], [0, -1], [0, 1]]);
        else routeTo(actor, map, destination.point, destination.key);
        continue;
      }
      const point = recovering ? bomb : cellCenter(map, { x: site.x, y: site.y + Math.floor(site.height / 2) });
      actor.intent = recovering ? '폭탄 회수' : '설치 사이트로 이동';
      routeTo(actor, map, point, `${bomb.status}:${point.x}:${point.y}`);
    } else if (defenders.length === 1 && round.defenseContact) {
      // A lone defender has no teammate covering the reported contact. Reconsider
      // the old assignment using only its unexpired observation, never bomb/carrier coordinates.
      const contact = round.defenseContact;
      const point = cellCenter(map, { x: Math.floor(contact.x / map.tileSize), y: Math.floor(contact.y / map.tileSize) });
      actor.watchAngle = Math.atan2(contact.y - actor.y, contact.x - actor.x);
      actor.facing = actor.watchAngle;
      actor.intent = '마지막 수비 · 최근 관측 위치 대응';
      patrol(state, actor, map, point, `lone-contact:${point.x}:${point.y}`);
    } else if (pairContact) {
      const checking = actor.id === pairScout.id;
      const siteName = defenseContactSite(map, pairContact);
      const support = map.tactics?.support?.[actor.defenseTask?.plan ?? 'standard']?.[siteName];
      const point = !checking && support ? cellCenter(map, { x: support[0], y: support[1] }) : pairPoint;
      actor.watchAngle = Math.atan2(pairContact.y - actor.y, pairContact.x - actor.x);
      actor.facing = actor.watchAngle;
      actor.intent = checking ? '2인 수비 · 최근 관측 위치 확인' : '2인 수비 · 접촉 구역 지원·엄호';
      patrol(state, actor, map, point, `${pairKey}:${checking ? 'check' : 'cover'}`, [[0, 0], [0, -1], [0, 1]]);
    } else if (actor.defenseTask) {
      const shared = round.defenseContact;
      const contact = shared && (actor.defenseTask.role === 'support'
        || actor.defenseTask.site === defenseContactSite(map, shared)) ? shared : null;
      const locked = attackers.find(target => target.id === actor.targetId && canSee(map, actor, target, state));
      const look = locked ?? contact;
      actor.watchAngle = look ? Math.atan2(look.y - actor.y, look.x - actor.x) : Math.PI;
      actor.facing = actor.watchAngle;
      const destination = defenseDestination(state, actor, map);
      actor.intent = destination.intent;
      if (destination.watch) {
        actor.watchAngle = Math.atan2(destination.watch.y - actor.y, destination.watch.x - actor.x);
        actor.facing = actor.watchAngle;
      }
      if (destination.hold) {
        routeTo(actor, map, destination.point, destination.key);
        if (!actor.retreating && !look) actor.facing = Math.PI + Math.sin(state.tick / 30) * 0.4;
      } else patrol(state, actor, map, destination.point, destination.key, [[0, 0], [0, -1], [0, 1]]);
    } else if (round.defenseContact) {
      const contact = round.defenseContact;
      const point = cellCenter(map, { x: Math.floor(contact.x / map.tileSize), y: Math.floor(contact.y / map.tileSize) });
      actor.intent = '감지된 적 위치 수색·대응';
      patrol(state, actor, map, point, `contact:${point.x}:${point.y}`);
    } else {
      const guardSite = map.sites[(actor.number - 1) % map.sites.length];
      actor.intent = `${guardSite.name} 구역 순찰`;
      patrol(state, actor, map, cellCenter(map, { x: guardSite.x, y: guardSite.y + Math.floor(guardSite.height / 2) }), `defense:${guardSite.name}`);
    }
  }
  prepareSmokeGuards(state, map);
}
