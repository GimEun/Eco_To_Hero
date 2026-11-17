import { validateStrategyLibrary } from './strategy-library.js';
import { createCounseling,addCounselContent } from './counseling.js';
import { validateCounseling } from './validate-counseling.js';
import { validateYearAdvance } from './year-advance.js';
import { validateMatchReports } from './match-reports.js';
import { createAiGrowth, validateAiGrowth } from './ai-growth.js';
import {isWorldFinalsWeek} from './world-finals.js';
import {validateYearHeader,competitionSeed} from './season-year-context.js';
import {validateSeasonArchives} from './season-years.js';
import { validateWorldGroups } from './world-groups.js';
import { isPlayoffWeek } from './pc-playoffs.js';
import { validateSeasonCalendar,completeSeason } from './season-calendar.js';
import { createOfficialRecords, validateOfficialRecords } from './official-records.js';
import { createStockMarket, validateStockMarket } from './stocks.js';
import { completeBroadcastWeek } from './sponsors.js';
import { GAME } from '../config/game.js';
import { LEAGUES, TOTAL_PLAYERS } from '../config/world.js';
import { ROSTER_RULES, aiRosterMaximum } from '../config/roster.js';
import { createContract, validateContract } from './contracts.js';
import { PLAYER_IDENTITY_VERSION } from './player-identities.js';
import { createFinance, validateFinance } from './finance.js';
import { createTraining, validateTraining, createActionRandomState } from './training.js';
import { validateTeamTraining } from './team-training.js';
import { createMorale, validateMorale } from './happiness.js';
import { createPlayerEvents, validatePlayerEvents } from './player-events.js';
import { createDevelopment, validateDevelopment } from './player-development.js';
import { createFacilities, validateFacilities } from './facilities.js';
import { validateCoach } from './coaches.js';
import { FATIGUE_RULES, validateFatigue } from './player-condition.js';
import { assignClubLogos, validateLogoId } from './club-logos.js';
import { CLUB_IDENTITY_VERSION } from './club-names.js';
import { createPcSeason, validatePcSeason, nextOfficialFixture, findOfficialFixture } from './pc-season.js';
import { validateCitySeason } from './city-season.js';
import { playoffWeekId,DOMESTIC_LEAGUES } from '../config/domestic-leagues.js';
import { validateDomesticSeason } from './domestic-season.js';

export function validatedText(value, maxLength, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\u0000-\u001f]/u.test(value)) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
  return value.trim();
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function balance(value, allowNegative = false) {
  if (!Number.isSafeInteger(value) || !allowNegative && value < 0) throw new Error('구단 자금이 올바르지 않습니다.');
  return value;
}

export function validatePlayer(player, { legacyTraining = false, legacySchedule = false, legacyHappiness = false, legacyDevelopment = false, legacyCondition = false, seed = 0, day = 1 } = {}) {
  if (!isObject(player)) throw new Error('선수 정보가 올바르지 않습니다.');
  for (const key of ['aim', 'intelligence', 'stamina']) {
    if (!Number.isInteger(player[key]) || player[key] < 1 || player[key] > 99) {
      throw new Error('선수 능력치는 1~99 사이의 정수여야 합니다.');
    }
  }
  return {
    id: validatedText(player.id, 64, '선수 ID'), name: validatedText(player.name, 40, '선수 이름'),
    nickname: validatedText(player.nickname, 24, '선수 별명'),
    aim: player.aim, intelligence: player.intelligence, stamina: player.stamina,
    training: legacyTraining ? createTraining() : validateTraining(player.training, player, { legacySchedule }),
    morale: legacyHappiness ? createMorale() : validateMorale(player.morale, day),
    development: legacyDevelopment ? createDevelopment(player, seed) : validateDevelopment(player.development, player),
    fatigue: legacyCondition ? FATIGUE_RULES.initial : validateFatigue(player.fatigue),
  };
}

export function validateLegacyClub(club) {
  if (!isObject(club)) throw new Error('구단 정보가 없습니다.');
  if (club.league !== GAME.startingLeague || club.discipline !== GAME.discipline) {
    throw new Error('현재 버전에서 지원하지 않는 리그 또는 종목입니다.');
  }
  if (!Array.isArray(club.players) || club.players.length !== 5) throw new Error('선수 5명의 명단이 필요합니다.');
  const players = club.players.map(player => validatePlayer(player, { legacyTraining: true, legacyHappiness: true, legacyDevelopment: true, legacyCondition: true }));
  if (new Set(players.map(p => p.id)).size !== 5) throw new Error('선수 ID가 중복되었습니다.');
  return {
    name: validatedText(club.name, GAME.maxClubNameLength, '구단 이름'), balance: balance(club.balance),
    league: club.league, discipline: club.discipline, players,
    ...(club.logoId === undefined ? {} : { logoId: validateLogoId(club.logoId) }),
  };
}

export function validateWorld(world, { legacyRoster = false, legacyContracts = false, legacyTime = false, legacyFinance = false, legacyTraining = false, legacySchedule = false, legacyTeamTraining = false, legacyWeekly = false, legacyHappiness = false, legacyEvents = false, legacyDevelopment = false, legacyCondition = false, legacyAiRoster = false, legacyHolding = false, legacySponsor = false, legacyCoach = false, legacyFacilities = false, legacyCash = false, legacyStocks = false, legacyStockSignals = false, legacySeason = false, legacyActive = false, legacyWeekSchedule = false, legacyBroadcastGoal = false, legacyTiebreaks = false, legacyOfficialRecords = false, legacySeasonCalendar = false, legacyPlayoffs = false, legacyCitySeason = false, legacyCityFinals = false, legacyProvince = false, legacyNational = false, legacyWorldGroups = false, legacyWorldRanked = false, legacyWorldFinals = false, legacyFreeSchedule = false, legacyYears = false, legacyYearAdvance = false, legacyAiGrowth = false, legacyMatchReports = false, legacyCounseling = false, legacyCounselContent = false, legacyStrategyLibrary = false } = {}) {
  if (!isObject(world) || !Number.isInteger(world.seed) || world.seed < 0 || world.seed > 0xffffffff) {
    throw new Error('세계 생성 시드가 올바르지 않습니다.');
  }
  if (!Array.isArray(world.players) || world.players.length !== TOTAL_PLAYERS) throw new Error('선수는 총 600명이어야 합니다.');
  const day = legacyTime ? 1 : world.day;
  if (!Number.isSafeInteger(day) || day < 1) throw new Error('게임 날짜가 올바르지 않습니다.');
  const weekDaysRemaining = legacySchedule ? 0 : world.weekDaysRemaining;
  const actionRandomState = legacySchedule ? createActionRandomState(world.seed) : world.actionRandomState;
  if (!Number.isInteger(weekDaysRemaining) || weekDaysRemaining < 0 || weekDaysRemaining > 6
    || !Number.isInteger(actionRandomState) || actionRandomState < 0 || actionRandomState > 0xffffffff) throw new Error('주간 진행 상태 또는 행동 난수가 올바르지 않습니다.');
  if (world.playerIdentityVersion !== undefined && ![1, PLAYER_IDENTITY_VERSION].includes(world.playerIdentityVersion)) throw new Error('지원하지 않는 선수 이름 데이터 버전입니다.');
  if (world.clubIdentityVersion !== undefined && world.clubIdentityVersion !== CLUB_IDENTITY_VERSION) throw new Error('지원하지 않는 구단 이름 데이터 버전입니다.');
  if (!Array.isArray(world.clubs) || world.clubs.length !== 58) throw new Error('구단은 총 58팀이어야 합니다.');
  const players = world.players.map(player => validatePlayer(player, { legacyTraining, legacySchedule, legacyHappiness, legacyDevelopment, legacyCondition, seed: world.seed, day }));
  // 외형이 없는 기존 저장에도 같은 시드로 고정된 외형을 보충한다.
  const playerIds = new Set(players.map(p => p.id));
  const playersById = new Map(players.map(player => [player.id, player]));
  if (playerIds.size !== TOTAL_PLAYERS) throw new Error('선수 ID가 중복되었습니다.');
  const clubIds = new Set();
  const assigned = new Set();
  const counts = new Map(LEAGUES.map(league => [league.id, 0]));
  const clubs = world.clubs.map(club => {
    if (!isObject(club)) throw new Error('구단 정보가 올바르지 않습니다.');
    const id = validatedText(club.id, 64, '구단 ID');
    if (clubIds.has(id)) throw new Error('구단 ID가 중복되었습니다.');
    clubIds.add(id);
    if (!counts.has(club.leagueId) || club.discipline !== GAME.discipline) throw new Error('구단 리그 또는 종목이 올바르지 않습니다.');
    counts.set(club.leagueId, counts.get(club.leagueId) + 1);
    const maximum = legacyRoster ? ROSTER_RULES.starters : club.id === world.playerClubId ? ROSTER_RULES.maximum : legacyAiRoster ? ROSTER_RULES.starters : aiRosterMaximum(club);
    if (!Array.isArray(club.playerIds) || club.playerIds.length < ROSTER_RULES.starters || club.playerIds.length > maximum) throw new Error('구단 명단은 주전 5명과 허용된 후보 정원을 지켜야 합니다.');
    const roster = club.playerIds.map(playerId => {
      if (typeof playerId !== 'string' || !playerIds.has(playerId)) throw new Error('구단 명단에 존재하지 않는 선수 ID가 있습니다.');
      if (assigned.has(playerId)) throw new Error('한 선수가 여러 명단에 중복 배정되었습니다.');
      assigned.add(playerId);
      return playerId;
    });
    const lineupIds = legacyRoster ? [...roster] : club.lineupIds;
    if (!Array.isArray(lineupIds) || lineupIds.length !== ROSTER_RULES.starters
      || new Set(lineupIds).size !== ROSTER_RULES.starters || lineupIds.some(id => !roster.includes(id))) throw new Error('주전 5명은 구단 명단의 서로 다른 선수여야 합니다.');
    if (!legacyContracts && (!isObject(club.contracts) || Object.keys(club.contracts).length !== roster.length
      || roster.some(playerId => !Object.hasOwn(club.contracts, playerId)))) throw new Error('계약 명단은 구단 소속 선수와 일치해야 합니다.');
    const contracts = Object.fromEntries(roster.map(playerId => [playerId, legacyContracts
      ? createContract(playersById.get(playerId)) : validateContract(club.contracts[playerId], { legacyTime, legacyWeekly, legacyHolding, day })]));
    return {
      id, name: validatedText(club.name, GAME.maxClubNameLength, '구단 이름'),
      ...(club.logoId === undefined ? {} : { logoId: validateLogoId(club.logoId) }),
      leagueId: club.leagueId, discipline: club.discipline, balance: balance(club.balance, id === world.playerClubId && !legacyCash), playerIds: roster, lineupIds: [...lineupIds], contracts,
      ...(id === world.playerClubId ? { facilities: legacyFacilities ? createFacilities() : validateFacilities(club.facilities), coach: legacyCoach ? null : validateCoach(club.coach), finance: legacyFinance ? createFinance(day) : validateFinance(club.finance, day, { legacyWeekly, legacySponsor, legacyCoach, legacyFacilities, legacyCash, facilities: club.facilities }) } : {}),
    };
  });
  if (LEAGUES.some(league => counts.get(league.id) !== league.teams)) throw new Error('리그별 팀 수가 올바르지 않습니다.');
  const playerClubId = validatedText(world.playerClubId, 64, '플레이어 구단 ID');
  const playerClub = clubs.find(club => club.id === playerClubId);
  if (!playerClub || playerClub.leagueId !== 'pc') throw new Error('플레이어 구단은 PC방 리그에 있어야 합니다.');
  assignClubLogos(clubs, world.seed, playerClubId);
  if (legacyCash) {
    const previous = world.clubs.find(club => club.id === playerClubId);
    const converted = BigInt(playerClub.balance) - BigInt(legacyFinance ? 0 : previous.finance.arrears);
    if (converted < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('기존 미지급금 통합 후 자금이 저장 가능한 범위를 넘습니다.');
    playerClub.balance = Number(converted);
  }
  const sponsorContracts = [playerClub.finance.sponsor, ...playerClub.finance.settlements.map(entry => entry.sponsorContract).filter(Boolean)];
  if (sponsorContracts.some(sponsor => sponsor.kind === 'appearances' && !playersById.has(sponsor.playerId))) throw new Error('스폰서 지정 선수가 존재하지 않습니다.');
  const teamTraining = legacyTeamTraining ? null : validateTeamTraining(world.teamTraining, players, day, playerClub.lineupIds, { legacyDevelopment, legacyCoach });
  const playerEvents = legacyEvents ? createPlayerEvents(world.seed) : validatePlayerEvents(world.playerEvents, players, day, weekDaysRemaining, playerClub.playerIds, teamTraining, { legacyDevelopment });
  const seasonYears=validateYearHeader(world.seasonYears,day,{legacy:legacyYears});
  const seasonContext={...world,seasonYears,clubs,playerClubId,day};
  const pcSeason = legacySeason && world.pcSeason === undefined ? createPcSeason(clubs, competitionSeed(seasonContext)) : validatePcSeason(world.pcSeason, clubs, { legacyActive, legacyWeekSchedule, legacyTiebreaks, legacyPlayoffs, seed: competitionSeed(seasonContext) });
  const citySeason=world.citySeason===undefined && legacyCitySeason?null:validateCitySeason(world.citySeason,{...seasonContext,pcSeason},{legacyFinals:legacyCityFinals});
  const provinceSeason=world.provinceSeason===undefined && legacyProvince?null:validateDomesticSeason(world.provinceSeason,{...seasonContext,pcSeason,citySeason},'province');
  const nationalSeason=world.nationalSeason===undefined && legacyNational?null:validateDomesticSeason(world.nationalSeason,{...seasonContext,pcSeason,citySeason,provinceSeason},'national');
  const worldSeason=world.worldSeason===undefined && legacyWorldGroups?null:validateWorldGroups(world.worldSeason,{...seasonContext,pcSeason,citySeason,provinceSeason,nationalSeason},{legacyRanked:legacyWorldRanked,legacyFinals:legacyWorldFinals});
  const season=worldSeason??nationalSeason??provinceSeason??citySeason??pcSeason;
  if (season.activeMatchId) {
    const active = findOfficialFixture(season, season.activeMatchId);
    if (![active.homeClubId, active.awayClubId].includes(playerClubId)) throw new Error('진행 중인 공식 경기에 내 구단이 없습니다.');
  }
  const scheduled = season.weekSchedule;
  if (scheduled) {
    const playoff = isWorldFinalsWeek(season) || isPlayoffWeek(season) || DOMESTIC_LEAGUES[season.leagueId] && scheduled.fixtureId===playoffWeekId(season);
    const fixture = playoff ? null : findOfficialFixture(season, scheduled.fixtureId);
    if (!playoff && ![fixture.homeClubId, fixture.awayClubId].includes(playerClubId) || day < scheduled.startedDay || day > scheduled.endDay - 1
      || !playoff && scheduled.phase !== 'settling' && nextOfficialFixture({ pcSeason, citySeason, provinceSeason, nationalSeason, worldSeason, playerClubId })?.id !== scheduled.fixtureId
      || scheduled.phase !== 'preparing' && (day !== scheduled.endDay - 1 || weekDaysRemaining !== 1 || playerEvents.week !== null)
      || scheduled.phase === 'preparing' && teamTraining?.status === 'pending'
      || scheduled.phase === 'settling' && teamTraining?.status === 'pending'
      || playerEvents.week && (playerEvents.week.startedDay < scheduled.startedDay || playerEvents.week.endDay !== scheduled.endDay - 1
        || playerEvents.week.teamTraining !== scheduled.teamTraining)) throw new Error('주간 공식 경기와 날짜·훈련 상태가 일치하지 않습니다.');
  }
  const officialRecords = legacyOfficialRecords ? createOfficialRecords() : validateOfficialRecords(world.officialRecords, { seasonYears,pcSeason, citySeason, provinceSeason, nationalSeason, worldSeason, clubs, players, playerClubId, day });
  const seasonCalendar = validateSeasonCalendar(world.seasonCalendar, { seasonYears,day, pcSeason, citySeason, provinceSeason, nationalSeason, worldSeason, playerClubId, weekDaysRemaining, playerEvents, teamTraining, officialRecords }, legacySeasonCalendar,legacyFreeSchedule);
  if (legacyBroadcastGoal) completeBroadcastWeek({ pcSeason, citySeason, provinceSeason, nationalSeason, worldSeason, clubs, playerClubId });
  const result = { seed: world.seed, day, stocks: legacyStocks ? createStockMarket(world.seed, day) : validateStockMarket(world.stocks, day, playerClub.finance.weeklyStartedDay, { legacySignals: legacyStockSignals, seed: world.seed }), weekDaysRemaining, actionRandomState, playerEvents, teamTraining, playerClubId, clubs, players, pcSeason, citySeason, provinceSeason, nationalSeason, worldSeason, officialRecords, seasonCalendar,
    ...(world.playerIdentityVersion === undefined ? {} : { playerIdentityVersion: world.playerIdentityVersion }),
    ...(world.clubIdentityVersion === undefined ? {} : { clubIdentityVersion: world.clubIdentityVersion }),
  };
  result.seasonYears=validateSeasonArchives(seasonYears,result);
  for(const season of [citySeason,provinceSeason,nationalSeason,worldSeason].filter(Boolean))if(season.startedDay<seasonYears.startedDay)throw new Error('현재 연도와 리그 시작일이 일치하지 않습니다.');
  if(legacyFreeSchedule || seasonCalendar.phase==='offseason')completeSeason(result);
  result.aiGrowth = legacyAiGrowth ? createAiGrowth(day) : validateAiGrowth(world.aiGrowth, result);
  result.strategyLibrary = legacyStrategyLibrary ? {} : validateStrategyLibrary(world.strategyLibrary);
  result.matchReports = legacyMatchReports ? [] : validateMatchReports(world.matchReports, result);
  result.counseling = legacyCounseling ? createCounseling(result) : validateCounseling(legacyCounselContent ? addCounselContent(result,world.counseling) : world.counseling, result);
  result.yearAdvance = validateYearAdvance(legacyYearAdvance ? null : world.yearAdvance, result);
  return result;
}
