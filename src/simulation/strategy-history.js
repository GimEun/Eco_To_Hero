// 사용된 설정의 변화만 남긴다. 경로 좌표나 매 틱의 이동 상태는 보관하지 않는다.
export function recordStrategy(state) {
  if (!state.reportStrategies || !state.round) return;
  const manual = side => {
    if (side !== (state.round.attackTeam === 'home' ? 'attack' : 'defense')) return false;
    const plan = state.manualPlans?.[side];
    return Boolean(plan?.remaining > 0 && Object.keys(plan.players).length);
  };
  const value = { site: state.round.siteName,
    attack: {home: state.attackPlans?.home ?? null, away: state.attackPlans?.away ?? null},
    defense: {home: state.defensePlans?.home ?? null, away: state.defensePlans?.away ?? null},
    manual: {attack: manual('attack'), defense: manual('defense')} };
  const key = JSON.stringify(value);
  const round = state.economy.roundNumber;
  if (state.reportStrategies.round !== round) state.reportStrategies = {round, key: null, changes: []};
  if (state.reportStrategies.key === key) return;
  state.reportStrategies.key = key;
  state.reportStrategies.changes.push({tick: state.tick, ...value});
}
