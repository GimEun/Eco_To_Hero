import {seasonYear,yearWeek} from './season-year-context.js';
import { LEAGUES } from '../config/world.js';
import { seasonSponsorAvailable } from './sponsors.js';
import { seasonCalendarLabel } from './season-calendar.js';
import { domesticSeason } from '../config/domestic-leagues.js';

export function getClubView(world, clubId = world?.playerClubId) {
  if (!world) return null;
  const club = world.clubs.find(item => item.id === clubId);
  if (!club) return null;
  const players = new Map(world.players.map(player => [player.id, player]));
  const active=world.worldSeason??domesticSeason(world),leagueId=active?.clubIds.includes(clubId)?active.leagueId:club.leagueId;
  return {
    ...club, leagueId,
    day: world.day, seasonYear:seasonYear(world), yearWeek:yearWeek(world), weekDaysRemaining: world.weekDaysRemaining, teamTrainingPending: world.teamTraining?.status === 'pending', league: LEAGUES.find(league => league.id === leagueId).name,
    playerEvents: world.playerEvents, eventPlayerNames: Object.fromEntries(world.playerEvents.history.map(receipt => [receipt.playerId, players.get(receipt.playerId).nickname])),
    stocks: world.stocks, sponsorSeed: world.seed, sponsorPlayerName: players.get(club.finance?.sponsor.playerId)?.nickname,
    seasonSponsorAvailable: seasonSponsorAvailable(world),
    seasonCalendarLabel: seasonCalendarLabel(world),
    players: club.playerIds.map(id => players.get(id)),
  };
}

export function getAffiliations(world) {
  const result = new Map();
  for (const club of world.clubs) for (const playerId of club.playerIds) result.set(playerId, club);
  return result;
}
