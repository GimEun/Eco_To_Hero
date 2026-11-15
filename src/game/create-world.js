import { createCounseling } from './counseling.js';
import { createAiGrowth } from './ai-growth.js';
import {createSeasonYears} from './season-year-context.js';
import { GAME } from '../config/game.js';
import { LEAGUES, TOTAL_PLAYERS } from '../config/world.js';
import { ROSTER_RULES } from '../config/roster.js';
import { validateLegacyClub } from './validate-world.js';
import { randomUnit } from './random.js';
import { createContract } from './contracts.js';
import { updatePlayerIdentities } from './player-identities.js';
import { createFinance } from './finance.js';
import { createTraining, createActionRandomState } from './training.js';
import { createMorale } from './happiness.js';
import { createPlayerEvents } from './player-events.js';
import { createDevelopment } from './player-development.js';
import { FATIGUE_RULES } from './player-condition.js';
import { createFacilities } from './facilities.js';
import { createStockMarket } from './stocks.js';
import { assignClubLogos } from './club-logos.js';
import { updateClubNames } from './club-names.js';
import { createPcSeason } from './pc-season.js';
import { createOfficialRecords } from './official-records.js';
import { createSeasonCalendar } from './season-calendar.js';

const prefixes = ['새벽', '푸른', '은빛', '고요한', '노을', '북쪽', '한낮', '별빛'];
const suffixes = ['여우', '파도', '날개', '혜성', '등대', '매', '섬광', '불꽃'];

export function createWorld(initialClub, seed = crypto.getRandomValues(new Uint32Array(1))[0]) {
  const playerClub = validateLegacyClub(initialClub);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('세계 생성 시드가 올바르지 않습니다.');
  const randomState = { randomState: seed };
  const random = () => randomUnit(randomState);
  const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
  const players = playerClub.players;
  const usedIds = new Set(players.map(player => player.id));
  const names = prefixes.flatMap(prefix => suffixes.map(suffix => `${prefix} ${suffix}`));
  for (let index = names.length - 1; index > 0; index--) {
    const target = integer(0, index);
    [names[index], names[target]] = [names[target], names[index]];
  }
  let nextPlayer = 1;
  let nextClub = 1;
  const addPlayer = (min, max) => {
    let id;
    do { id = `player-${String(nextPlayer++).padStart(3, '0')}`; } while (usedIds.has(id));
    usedIds.add(id);
    // 기존 이름 생성의 난수 소비량을 유지해 같은 시드의 능력·배정을 보존한다.
    random(); random(); random();
    const player = {
      id, name: '', nickname: '',
      aim: integer(min, max), intelligence: integer(min, max), stamina: integer(min, max),
      training: createTraining(), morale: createMorale(),
    };
    players.push(player);
    return id;
  };
  const clubs = [{
    id: 'club-player', name: playerClub.name, logoId: playerClub.logoId, balance: playerClub.balance, finance: createFinance(), coach: null, facilities: createFacilities(),
    leagueId: 'pc', discipline: playerClub.discipline, playerIds: playerClub.players.map(player => player.id),
  }];
  for (const league of LEAGUES) {
    const count = league.teams - (league.id === 'pc' ? 1 : 0);
    for (let index = 0; index < count; index++) {
      let name;
      do { name = names.pop(); } while (name === playerClub.name);
      clubs.push({
        id: `club-ai-${String(nextClub++).padStart(2, '0')}`, name, leagueId: league.id,
        discipline: GAME.discipline, balance: GAME.startingBalance,
        playerIds: Array.from({ length: ROSTER_RULES.starters }, () => addPlayer(league.min, league.max)),
      });
    }
  }
  while (players.length < TOTAL_PLAYERS) {
    // 제거한 자유계약 포지션 추첨의 난수 소비량을 남겨 능력 생성 순서를 보존한다.
    random();
    addPlayer(20, 89);
  }
  assignClubLogos(clubs, seed, 'club-player');
  const playersById = new Map(players.map(player => [player.id, player]));
  for (const player of players) {
    player.development = createDevelopment(player, seed);
    player.fatigue = FATIGUE_RULES.initial;
  }
  for (const club of clubs) {
    club.lineupIds = [...club.playerIds];
    club.contracts = Object.fromEntries(club.playerIds.map(id => [id, createContract(playersById.get(id))]));
  }
  return updateClubNames(updatePlayerIdentities({ seed, day: 1, stocks: createStockMarket(seed), weekDaysRemaining: 0, actionRandomState: createActionRandomState(seed), playerEvents: createPlayerEvents(seed), teamTraining: null, playerClubId: 'club-player', clubs, players, pcSeason: createPcSeason(clubs, seed), citySeason: null, provinceSeason: null, nationalSeason: null, worldSeason: null, officialRecords: createOfficialRecords(), seasonCalendar: createSeasonCalendar(), seasonYears:createSeasonYears(), yearAdvance:null, aiGrowth:createAiGrowth(1), matchReports:[], counseling:createCounseling() }, { newGame: true }));
}
