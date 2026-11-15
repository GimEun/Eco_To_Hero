import { OPPONENT_STRATEGY } from '../config/opponent-strategy.js';

// 공식 관전/AI 경기에서 같은 선택 규칙을 사용한다. 상대 명령·숨은 위치는 읽지 않는다.
export function setupOpponentStrategy(state, map, teams) {
  if (!Array.isArray(teams) || new Set(teams).size !== teams.length
    || teams.some(team => !['home', 'away'].includes(team))) throw new Error('AI 전략 대상 팀이 올바르지 않습니다.');
  if (!teams.length) return;
  const initial = OPPONENT_STRATEGY.maps[map.id] ?? { attack: 'execute', defense: 'standard' };
  state.opponentStrategy = { processedRound: 0, teams: {}, changes: [] };
  for (const team of teams) {
    const leagueId = state.teams[team === 'home' ? 0 : 1].leagueId;
    const switchAfterLosses = OPPONENT_STRATEGY.switchAfterLosses[leagueId] ?? OPPONENT_STRATEGY.switchAfterLosses.pc;
    state.opponentStrategy.teams[team] = { attackLosses: 0, defenseLosses: 0, switchAfterLosses };
    state.attackPlans[team] = initial.attack;
    state.defensePlans[team] = initial.defense;
  }
}

export function advanceOpponentStrategy(state, nextAttackTeam) {
  const strategy = state.opponentStrategy;
  if (!strategy || strategy.processedRound === state.economy.roundNumber) return;
  strategy.processedRound = state.economy.roundNumber;
  for (const [team, memory] of Object.entries(strategy.teams)) {
    const previousRole = state.round.attackTeam === team ? 'attack' : 'defense';
    const lossKey = `${previousRole}Losses`;
    memory[lossKey] = state.round.winner === team ? 0 : memory[lossKey] + 1;
    const nextRole = nextAttackTeam === team ? 'attack' : 'defense';
    if (memory[`${nextRole}Losses`] < memory.switchAfterLosses) continue;
    const plans = nextRole === 'attack' ? state.attackPlans : state.defensePlans;
    const alternatives = nextRole === 'attack' ? ['execute', 'split'] : ['standard', 'forward'];
    const from = plans[team];
    plans[team] = alternatives.find(plan => plan !== from);
    memory[`${nextRole}Losses`] = 0;
    strategy.changes.push({ roundNumber: state.economy.roundNumber + 1, team, role: nextRole, from, to: plans[team] });
  }
}
