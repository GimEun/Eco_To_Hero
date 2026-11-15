// 벽·엄폐 사각형은 칸 좌표다. 화면·경로·충돌·시야가 같은 데이터를 사용한다.
import { RELAY_TACTICS } from './relay-tactics.js';

export const RELAY_MAP = {
  id: 'relay', name: '중계소', columns: 24, rows: 16, tileSize: 40,
  tactics: RELAY_TACTICS,
  walls: [
    { x: 0, y: 0, width: 24, height: 1 },
    { x: 0, y: 15, width: 24, height: 1 },
    { x: 0, y: 1, width: 1, height: 14 },
    { x: 23, y: 1, width: 1, height: 14 },
    { x: 5, y: 2, width: 2, height: 4 },
    { x: 5, y: 10, width: 2, height: 4 },
    { x: 10, y: 4, width: 4, height: 2 },
    { x: 10, y: 10, width: 4, height: 2 },
    { x: 17, y: 2, width: 2, height: 4 },
    { x: 17, y: 10, width: 2, height: 4 },
    { x: 11, y: 7, width: 2, height: 2 },
  ],
  sites: [
    { name: 'A', x: 20, y: 2, width: 2, height: 3 },
    { name: 'B', x: 20, y: 11, width: 2, height: 3 },
  ],
  spawns: {
    home: [4, 6, 8, 10, 12].map(y => ({ x: 2, y })),
    away: [4, 6, 8, 10, 12].map(y => ({ x: 21, y })),
  },
  destinations: {
    home: [3, 6, 8, 10, 12].map(y => ({ x: 20, y })),
    away: [3, 6, 8, 10, 12].map(y => ({ x: 3, y })),
  },
};
