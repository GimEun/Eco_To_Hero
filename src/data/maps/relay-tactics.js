export const RELAY_ATTACK_SITES = {
  A: { main: [[9, 6], [16, 6], [19, 6]], flank: [[9, 1], [19, 1]],
    entry: [[20, 2], [21, 4]], support: [[19, 5], [19, 7]], plant: [20, 3],
    guards: [[19, 6], [21, 5], [20, 3], [21, 2], [22, 4]],
    angles: [Math.PI, Math.PI, Math.PI, -Math.PI / 2, Math.PI / 2] },
  B: { main: [[9, 9], [16, 9], [19, 9]], flank: [[9, 14], [19, 14]],
    entry: [[20, 13], [21, 11]], support: [[19, 10], [19, 8]], plant: [20, 12],
    guards: [[19, 9], [21, 10], [20, 12], [21, 13], [22, 11]],
    angles: [Math.PI, Math.PI, Math.PI, Math.PI / 2, -Math.PI / 2] },
};

export const RELAY_DEFENSE_TASKS = [
  { label: 'A 전방 감시', role: 'front', site: 'A', standard: [19, 6], forward: [16, 6], fallback: [19, 5], forwardFallback: [17, 6] },
  { label: 'A 사이트 방어', role: 'anchor', site: 'A', standard: [19, 5], forward: [17, 6], fallback: [20, 3] },
  { label: 'B 전방 감시', role: 'front', site: 'B', standard: [19, 9], forward: [16, 9], fallback: [19, 10], forwardFallback: [17, 9] },
  { label: 'B 사이트 방어', role: 'anchor', site: 'B', standard: [19, 10], forward: [17, 9], fallback: [20, 12] },
  { label: '기동 지원', role: 'support', site: '중앙', standard: [19, 8], forward: [18, 8], fallback: [21, 8] },
];

export const RELAY_TACTICS = {
  attackSites: RELAY_ATTACK_SITES, defenseTasks: RELAY_DEFENSE_TASKS, contactSplitY: 8,
  support: { standard: { A: [19, 6], B: [19, 9] }, forward: { A: [17, 6], B: [17, 9] } },
};
