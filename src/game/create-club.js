import { GAME } from '../config/game.js';
import { STARTER_PLAYERS } from '../data/starter-players.js';
import { createTraining } from './training.js';

export function createClub(rawName) {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) return { error: '구단 이름을 입력해 주세요.' };
  if (name.length > GAME.maxClubNameLength) {
    return { error: `구단 이름은 ${GAME.maxClubNameLength}자 이내로 입력해 주세요.` };
  }

  return {
    club: {
      name,
      balance: GAME.startingBalance,
      league: GAME.startingLeague,
      discipline: GAME.discipline,
      players: structuredClone(STARTER_PLAYERS).map(player => ({ ...player, training: createTraining() })),
    },
  };
}
