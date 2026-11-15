import { getClubView } from '../game/world-selectors.js';
import { officialSeason } from '../game/pc-season.js';

// 불러온 게임별 연습 순서만 보관한다. 저장 데이터와 경기·성장 난수는 변경하지 않는다.
const rotations = new WeakMap();

export function nextPracticeOpponent(world) {
  const home = getClubView(world), season = officialSeason(world);
  const ids = (season?.leagueId === home.leagueId && season.clubIds.includes(home.id)
    ? season.clubIds : world.clubs.filter(club => club.leagueId === home.leagueId).map(club => club.id))
    .filter(id => id !== home.id).sort();
  if (!ids.length) throw new Error('같은 리그의 연습 상대가 없습니다.');
  const key = JSON.stringify([home.id, home.leagueId, ids]);
  let rotation = rotations.get(world);
  if (rotation?.key !== key) {
    rotation = { key, remaining: [], lastId: null };
    rotations.set(world, rotation);
  }
  if (!rotation.remaining.length) {
    rotation.remaining = [...ids];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rotation.remaining[i], rotation.remaining[j]] = [rotation.remaining[j], rotation.remaining[i]];
    }
    const last = ids.length - 1;
    if (last > 0 && rotation.remaining[last] === rotation.lastId) {
      [rotation.remaining[0], rotation.remaining[last]] = [rotation.remaining[last], rotation.remaining[0]];
    }
  }
  rotation.lastId = rotation.remaining.pop();
  return getClubView(world, rotation.lastId);
}
