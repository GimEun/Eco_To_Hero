import { CLUB_LOGOS, clubLogo } from '../data/club-logos.js';
import { randomUnit } from './random.js';

export function validateLogoId(id) {
  if (!clubLogo(id)) throw new Error('구단 로고가 올바르지 않습니다.');
  return id;
}

// 로고 전용 난수로 기존 선수 능력·이름·시장 생성 순서를 유지한다.
export function assignClubLogos(clubs, seed, playerClubId) {
  const random = { randomState: (seed ^ 0x4c4f474f) >>> 0 };
  const home = clubs.find(club => club.id === playerClubId);
  for (const club of clubs) if (club.logoId !== undefined) validateLogoId(club.logoId);
  if (home && home.logoId === undefined) home.logoId = CLUB_LOGOS[Math.floor(randomUnit(random) * CLUB_LOGOS.length)].id;
  const available = CLUB_LOGOS.filter(logo => logo.id !== home?.logoId).map(logo => logo.id);
  let pool = [];
  for (const club of clubs) {
    if (club.logoId !== undefined) continue;
    if (!pool.length) {
      pool = [...available];
      for (let index = pool.length - 1; index > 0; index--) {
        const target = Math.floor(randomUnit(random) * (index + 1));
        [pool[index], pool[target]] = [pool[target], pool[index]];
      }
    }
    club.logoId = pool.pop();
  }
  return clubs;
}
