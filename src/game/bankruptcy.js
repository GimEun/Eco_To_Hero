export const BANKRUPTCY_LIMIT = -10000;
export const isClubBankrupt = club => Boolean(club && club.balance <= BANKRUPTCY_LIMIT);
export function bankruptcyIssue(world) {
  return isClubBankrupt(world.clubs.find(club => club.id === world.playerClubId))
    ? '운영 자금이 -$10,000 이하가 되어 구단이 해체됐습니다. 새 게임을 시작하세요.' : null;
}
