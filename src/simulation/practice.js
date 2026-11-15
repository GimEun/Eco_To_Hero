import { cellCenter, findPath, canSee } from './geometry.js';
import { moveActors } from './actor-movement.js';
import { selectTarget, resolveCombat } from './combat.js';
import { TRAINING_RIFLE } from '../data/weapons.js';
import { emptyThrowables } from '../data/throwables.js';
import { autoThrow, updateThrowables, avoidFlashes } from './throwables.js';
import { setupRound, prepareRound, resolveRound } from './round.js';
import { setupEconomy, updateEconomy } from './economy.js';
import { setupMatch, updateMatch } from './match.js';
import { setupDefensePlans } from './defense-tactics.js';
import { setupAttackPlans } from './attack-tactics.js';
import { effectiveStats } from '../game/happiness.js';
import { setupOpponentStrategy } from './opponent-strategy.js';
import { recordStrategy } from './strategy-history.js';

export const STEP_MS = 50;

export function createPractice(map, home, away, { combat = false, seed = 1, round = false, economy = false, match = false, defensePlans = null, attackPlans = null, attackTeam = 'home', siteName = 'A', aiTeams = [], report = false } = {}) {
  economy = economy || match;
  round = round || economy;
  combat = combat || round;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('연습 시드가 올바르지 않습니다.');
  const actors = [home, away].flatMap((club, teamIndex) => {
    const team = teamIndex === 0 ? 'home' : 'away';
    const lineup = club.lineupIds ? club.lineupIds.map(id => club.players.find(player => player.id === id)) : club.players;
    if (lineup.length !== 5 || lineup.some(player => !player) || new Set(lineup.map(player => player.id)).size !== 5) throw new Error('경기에는 서로 다른 주전 5명이 필요합니다.');
    return lineup.map((player, index) => {
      const start = map.spawns[team][index];
      const route = findPath(map, start, map.destinations[team][index]);
      if (!route.length) throw new Error('시작점에서 테스트 목적지까지 이동할 수 없습니다.');
      return {
        id: `${team}-${index + 1}`, playerId: player.id, name: player.name, nickname: player.nickname,
        number: index + 1, team, ...cellCenter(map, start), radius: 10, speed: 80,
        facing: teamIndex === 0 ? 0 : Math.PI, fieldOfView: Math.PI / 2, viewRange: 200,
        route, waypoint: 1, arrived: route.length === 1, blocked: false, trafficBlocked: false, crowdedGoal: null,
        navigationTick: null, yieldUntilTick: 0, yieldAngle: 0,
        ...effectiveStats(player), alive: true, hp: 100, armor: 0, moving: false,
        incomingFire: null, watchAngle: null, throwables: emptyThrowables(), flashUntilTick: 0, flashStrength: 0, nextUtilityTick: 0, utilityContact: null,
        grenadeEvades: 0, evadedGrenadeId: null, flashThreat: null, flashDodges: 0,
        ammo: TRAINING_RIFLE.magazineSize, reloadUntilTick: null, targetId: null, readyTick: 0, nextShotTick: 0,
        damageBy: {}, stats: { kills: 0, deaths: 0, assists: 0, damage: 0, shots: 0, hits: 0 },
      };
    });
  });
  const state = { tick: 0, remainderMs: 0, complete: false, combat, randomState: seed, seed, endReason: null,
    events: [], projectiles: [], smokes: [], timeout: { active: false, remaining: 3 }, teams: [{ name: home.name, logoId: home.logoId, leagueId: home.leagueId }, { name: away.name, logoId: away.logoId, leagueId: away.leagueId }], actors };
  if (defensePlans || aiTeams.length) setupDefensePlans(state, defensePlans ?? { home: 'standard', away: 'standard' });
  if (attackPlans || aiTeams.length) setupAttackPlans(state, attackPlans ?? { home: 'execute', away: 'execute' });
  setupOpponentStrategy(state, map, aiTeams);
  if (round) setupRound(state, map, attackTeam, siteName);
  if (economy) setupEconomy(state);
  if (match) setupMatch(state);
  if (report && match) state.reportStrategies = {round: 0, key: null, changes: []};
  return state;
}

export function stepPractice(state, map) {
  if (state.complete || state.match?.complete || state.timeout?.active || state.economy?.phase === 'buy') return;
  if (state.round) state.round.started = true;
  if (state.round) prepareRound(state, map);
  else for (const actor of state.actors) actor.watchAngle = null;
  recordStrategy(state);
  // 피격 방향은 실제 사격 위치의 스냅샷이다. 이미 교전 중이면 현재 표적을 유지한다.
  for (const actor of state.actors) {
    if (!actor.alive || !actor.incomingFire || state.tick - actor.incomingFire.tick > 20 || selectTarget(state, map, actor)) continue;
    actor.watchAngle = Math.atan2(actor.incomingFire.y - actor.y, actor.incomingFire.x - actor.x);
    actor.facing = actor.watchAngle;
  }
  // 이동 전 같은 위치·시야에서 정지 여부를 결정한다.
  const engaged = state.combat ? new Set(state.actors.filter(actor => selectTarget(state, map, actor)).map(actor => actor.id)) : new Set();
  moveActors(state, map, engaged, STEP_MS);
  if (state.combat) avoidFlashes(state, map);
  state.tick++;
  if (state.combat) { updateThrowables(state, map); autoThrow(state, map); resolveCombat(state, map); }
  else state.complete = state.actors.every(actor => actor.arrived);
  if (state.round) resolveRound(state);
  if (state.economy) updateEconomy(state);
  if (state.match) updateMatch(state);
}

export function advancePractice(state, map, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('경과 시간이 올바르지 않습니다.');
  if (state.complete || state.match?.complete || state.timeout?.active || state.economy?.phase === 'buy') return;
  state.remainderMs += elapsedMs;
  while (state.remainderMs + 1e-9 >= STEP_MS && !state.complete) {
    stepPractice(state, map);
    state.remainderMs = Math.max(0, state.remainderMs - STEP_MS);
  }
  if (state.remainderMs < 1e-9) state.remainderMs = 0;
  if (state.complete) state.remainderMs = 0;
}

export function visibleOpponents(state, map, observerId) {
  const observer = state.actors.find(actor => actor.id === observerId);
  return observer && observer.alive !== false
    ? state.actors.filter(target => target.alive !== false && target.team !== observer.team && canSee(map, observer, target, state)) : [];
}
