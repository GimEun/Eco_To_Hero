import { CLUB_NAMES } from '../data/club-names.js';
import { randomUnit } from './random.js';

export const CLUB_IDENTITY_VERSION = 1;

// 세계 생성/복원의 독립 사본에 한 번만 적용한다. 이적 후에도 구단명은 유지한다.
export function updateClubNames(world) {
  if (world.clubIdentityVersion === CLUB_IDENTITY_VERSION) return world;
  const home = world.clubs.find(club => club.id === world.playerClubId);
  const paker = world.players.find(player => player.nickname === 'Paker');
  const pakerClub = paker && world.clubs.find(club => club.playerIds.includes(paker.id));
  const random = { randomState: (world.seed ^ 0x7465616d) >>> 0 };
  const reserved = new Set([home.name.toUpperCase()]);
  const pool = CLUB_NAMES.filter(name => !reserved.has(name.toUpperCase()));
  for (let index = pool.length - 1; index > 0; index--) {
    const target = Math.floor(randomUnit(random) * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  for (const club of world.clubs) {
    if (club.id === home.id) continue;
    // 사용자가 직접 지은 이름을 우선한다. 이미 P1이면 AI 구단은 다른 약어를 쓴다.
    club.name = club === pakerClub && !reserved.has('P1') ? 'P1' : pool.pop();
    if (!club.name) throw new Error('배정할 구단 이름이 부족합니다.');
    reserved.add(club.name.toUpperCase());
  }
  world.clubIdentityVersion = CLUB_IDENTITY_VERSION;
  return world;
}
