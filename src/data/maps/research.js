// 방을 나누는 칸막이와 상·중·하 연결 통로. 좌표 단위는 칸이다.
export const RESEARCH_MAP = {
  id: 'research', name: '연구 시설', columns: 24, rows: 16, tileSize: 40,
  walls: [
    { x: 0, y: 0, width: 24, height: 1 }, { x: 0, y: 15, width: 24, height: 1 },
    { x: 0, y: 1, width: 1, height: 14 }, { x: 23, y: 1, width: 1, height: 14 },
    { x: 7, y: 1, width: 1, height: 4 }, { x: 7, y: 8, width: 1, height: 6 },
    { x: 12, y: 2, width: 1, height: 4 }, { x: 12, y: 9, width: 1, height: 6 },
    { x: 17, y: 1, width: 1, height: 6 }, { x: 17, y: 9, width: 1, height: 5 },
    { x: 14, y: 4, width: 3, height: 1 }, { x: 9, y: 11, width: 3, height: 1 },
    { x: 3, y: 7, width: 2, height: 2 }, { x: 19, y: 7, width: 2, height: 2 },
  ],
  sites: [
    { name: 'A', x: 19, y: 2, width: 3, height: 3 },
    { name: 'B', x: 19, y: 11, width: 3, height: 3 },
  ],
  spawns: {
    home: [4, 6, 8, 10, 12].map(y => ({ x: 2, y })),
    away: [4, 6, 8, 10, 12].map(y => ({ x: 21, y })),
  },
  destinations: {
    home: [3, 6, 8, 10, 12].map(y => ({ x: 21, y })),
    away: [3, 6, 9, 10, 12].map(y => ({ x: 2, y })),
  },
  tactics: {
    contactSplitY: 8,
    attackSites: {
      A: { main: [[6, 6], [11, 6], [16, 7], [18, 6]], flank: [[6, 5], [11, 1], [16, 1], [18, 7]],
        entry: [[19, 2], [21, 4]], support: [[18, 5], [18, 7]], plant: [20, 3],
        guards: [[18, 6], [22, 4], [20, 3], [21, 1], [22, 2]],
        angles: [Math.PI, Math.PI, Math.PI, -Math.PI / 2, Math.PI / 2] },
      B: { main: [[6, 7], [11, 8], [16, 8], [18, 9]], flank: [[6, 14], [11, 8], [16, 14], [18, 14]],
        entry: [[19, 13], [21, 11]], support: [[18, 10], [18, 8]], plant: [20, 12],
        guards: [[18, 9], [22, 11], [20, 12], [21, 14], [22, 13]],
        angles: [Math.PI, Math.PI, Math.PI, Math.PI / 2, -Math.PI / 2] },
    },
    defenseTasks: [
      { label: 'A 전방 감시', role: 'front', site: 'A', standard: [18, 6], forward: [16, 7], fallback: [20, 4] },
      { label: 'A 사이트 방어', role: 'anchor', site: 'A', standard: [20, 2], forward: [18, 5], fallback: [22, 3] },
      { label: 'B 전방 감시', role: 'front', site: 'B', standard: [18, 9], forward: [16, 8], fallback: [20, 11] },
      { label: 'B 사이트 방어', role: 'anchor', site: 'B', standard: [20, 13], forward: [18, 10], fallback: [22, 12] },
      { label: '기동 지원', role: 'support', site: '중앙', standard: [21, 8], forward: [18, 8], fallback: [22, 8] },
    ],
    support: { standard: { A: [18, 6], B: [18, 9] }, forward: { A: [16, 7], B: [16, 8] } },
  },
};
