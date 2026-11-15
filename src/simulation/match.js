import { MATCH_RULES } from '../config/match.js';
import { ECONOMY_RULES } from '../config/economy.js';
import { TIMEOUT_RULES } from './timeout.js';
import { summarizeRound } from './highlights.js';

const opposite = team => team === 'home' ? 'away' : 'home';

export function setupMatch(state) {
  state.timeout = { active: false, remaining: TIMEOUT_RULES.regulation };
  state.match = { score: { home: 0, away: 0 }, overtime: 0, overtimeScore: { home: 0, away: 0 },
    complete: false, winner: null, history: [], transition: '정규 전반전',
    playerStats: Object.fromEntries(state.actors.map(actor => [actor.id, { ...actor.stats }])) };
}

// 정산 전에는 현재 라운드를 더하고 정산 후에는 저장된 합계만 사용한다.
export function matchPlayerStats(state, actor) {
  if (!state.match) return actor.stats;
  const total = state.match.playerStats[actor.id];
  const live = state.match.history.length < state.economy.roundNumber;
  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, value + (live ? actor.stats[key] : 0)]));
}

export function matchPlayerMetrics(state, actor) {
  const stats = matchPlayerStats(state, actor);
  return { ...stats, accuracy: stats.shots ? stats.hits / stats.shots * 100 : null,
    adr: state.match?.history.length ? state.match.playerStats[actor.id].damage / state.match.history.length : null };
}

export function updateMatch(state) {
  const match = state.match;
  if (!match || match.complete || !state.complete || !state.economy.settled
    || match.history.length !== state.economy.roundNumber - 1) return;
  const winner = state.round.winner;
  if (!['home', 'away'].includes(winner)) throw new Error('라운드 승자가 없어 점수를 반영할 수 없습니다.');
  for (const actor of state.actors) {
    const total = match.playerStats[actor.id];
    for (const key of Object.keys(total)) total[key] += actor.stats[key];
  }
  match.score[winner]++;
  if (match.overtime) match.overtimeScore[winner]++;
  match.history.push({ roundNumber: state.economy.roundNumber, attackTeam: state.round.attackTeam,
    winner, reason: state.endReason, ticks: state.tick, overtime: match.overtime, score: { ...match.score },
    highlights: summarizeRound(state.events), ...(state.reportStrategies ? {strategies: structuredClone(state.reportStrategies.changes)} : {}) });
  const won = match.overtime ? match.overtimeScore[winner] >= MATCH_RULES.overtimeTarget
    : match.score[winner] >= MATCH_RULES.regulationTarget;
  if (won) { match.complete = true; match.winner = winner; }
}

// 다음 라운드 구매 단계에 진입할 때만 진영과 경제 초기화를 전환한다.
export function advanceMatch(state) {
  const match = state.match;
  const next = state.economy.roundNumber + 1;
  const regulationRounds = MATCH_RULES.regulationHalf * 2;
  let attackTeam = state.round.attackTeam;
  let resetCash = null;
  let reason = null;
  match.transition = null;
  if (next === MATCH_RULES.regulationHalf + 1) {
    attackTeam = opposite(attackTeam);
    resetCash = ECONOMY_RULES.startingCash;
    reason = 'halftime-reset';
    match.transition = '정규 후반전 · 진영 교대 · 자금/장비 초기화';
  } else if (next > regulationRounds && (next - regulationRounds - 1) % MATCH_RULES.overtimeHalf === 0) {
    attackTeam = opposite(attackTeam);
    resetCash = MATCH_RULES.overtimeCash;
    reason = 'overtime-reset';
    const overtime = Math.floor((next - regulationRounds - 1) / (MATCH_RULES.overtimeHalf * 2)) + 1;
    if (match.overtime !== overtime) {
      match.overtimeScore = { home: 0, away: 0 };
    }
    match.overtime = overtime;
    const half = (next - regulationRounds - 1) % (MATCH_RULES.overtimeHalf * 2) === 0 ? '전반전' : '후반전';
    match.transition = `연장 ${overtime} ${half} · 진영 교대 · 자금/장비 초기화`;
  }
  return { attackTeam, resetCash, reason };
}
