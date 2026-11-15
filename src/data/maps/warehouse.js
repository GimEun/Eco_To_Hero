// 화물 선반 사이 중앙 통로와 위/아래 외곽 우회로. 좌표 단위는 칸이다.
export const WAREHOUSE_MAP = {
  id: 'warehouse', name: '화물 창고', columns: 24, rows: 16, tileSize: 40,
  walls: [
    { x: 0, y: 0, width: 24, height: 1 }, { x: 0, y: 15, width: 24, height: 1 },
    { x: 0, y: 1, width: 1, height: 14 }, { x: 23, y: 1, width: 1, height: 14 },
    { x: 6, y: 2, width: 3, height: 3 }, { x: 6, y: 11, width: 3, height: 3 },
    { x: 12, y: 3, width: 2, height: 3 }, { x: 12, y: 10, width: 2, height: 3 },
    { x: 16, y: 2, width: 2, height: 3 }, { x: 16, y: 11, width: 2, height: 3 },
    { x: 9, y: 5, width: 2, height: 1 }, { x: 9, y: 10, width: 2, height: 1 },
  ],
  sites: [
    { name: 'A', x: 20, y: 3, width: 2, height: 2 },
    { name: 'B', x: 20, y: 11, width: 2, height: 2 },
  ],
  spawns: {
    home: [4, 6, 8, 10, 12].map(y => ({ x: 2, y })),
    away: [4, 6, 8, 10, 12].map(y => ({ x: 21, y })),
  },
  destinations: {
    home: [3, 6, 8, 10, 12].map(y => ({ x: 20, y })),
    away: [3, 6, 8, 10, 12].map(y => ({ x: 3, y })),
  },
  tactics: {
    contactSplitY: 8,
    attackSites: {
      A: { main: [[5, 7], [11, 7], [18, 6]], flank: [[4, 1], [15, 1], [20, 1]],
        entry: [[20, 3], [21, 4]], support: [[19, 6], [19, 7]], plant: [20, 4],
        guards: [[19, 5], [22, 5], [20, 4], [21, 2], [22, 3]],
        angles: [Math.PI, Math.PI, Math.PI, -Math.PI / 2, Math.PI / 2] },
      B: { main: [[5, 8], [11, 8], [18, 9]], flank: [[4, 14], [15, 14], [20, 14]],
        entry: [[20, 12], [21, 11]], support: [[19, 9], [19, 8]], plant: [20, 11],
        guards: [[19, 10], [22, 10], [20, 11], [21, 13], [22, 12]],
        angles: [Math.PI, Math.PI, Math.PI, Math.PI / 2, -Math.PI / 2] },
    },
    defenseTasks: [
      { label: 'A 전방 감시', role: 'front', site: 'A', standard: [19, 5], forward: [17, 6], fallback: [20, 4] },
      { label: 'A 사이트 방어', role: 'anchor', site: 'A', standard: [21, 3], forward: [19, 5], fallback: [22, 3] },
      { label: 'B 전방 감시', role: 'front', site: 'B', standard: [19, 10], forward: [17, 9], fallback: [20, 11] },
      { label: 'B 사이트 방어', role: 'anchor', site: 'B', standard: [21, 12], forward: [19, 10], fallback: [22, 12] },
      { label: '기동 지원', role: 'support', site: '중앙', standard: [20, 8], forward: [18, 8], fallback: [21, 8] },
    ],
    support: { standard: { A: [19, 5], B: [19, 10] }, forward: { A: [17, 6], B: [17, 9] } },
  },
};
