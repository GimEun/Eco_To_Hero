import { worldFixtures } from './world-groups.js';
// Official receipts are the source of truth for rewards and participation.
import { officialSeason } from './pc-season.js';
import { domesticFixtures } from './domestic-finals.js';
// Practice never calls this module; historical scores are not backfilled.
export const createOfficialRecords = () => ({ active: null, receipts: [] });

export function officialLineups(world, fixture) {
  return Object.fromEntries(['home', 'away'].map(side => {
    const club = world.clubs.find(item => item.id === fixture[`${side}ClubId`]);
    return [side, [...club.lineupIds]];
  }));
}

export function applyOfficialReceipt(world, fixture, lineups) {
  const records = world.officialRecords;
  if (records.receipts.some(receipt => receipt.fixtureId === fixture.id)) return false;
  if (!fixture.result) throw new Error('공식 경기 결과 확정 후에만 보상을 반영할 수 있습니다.');
  const mine = [fixture.homeClubId, fixture.awayClubId].includes(world.playerClubId);
  const winner = fixture.result.homeScore > fixture.result.awayScore ? fixture.homeClubId : fixture.awayClubId;
  const forfeit = Boolean(fixture.result.forfeit);
  const reward = mine && fixture.week !== 0 && !forfeit ? winner === world.playerClubId ? 500 : 200 : 0;
  const club = world.clubs.find(item => item.id === world.playerClubId);
  if (!Number.isSafeInteger(club.balance + reward)) throw new Error('공식 상금 지급 후 자금이 저장 범위를 초과합니다.');
  const receipt = { fixtureId: fixture.id, day: world.day, lineups: forfeit ? null : structuredClone(lineups), reward };
  if (!forfeit && (!lineups || ['home', 'away'].some(side => lineups[side]?.length !== 5))) throw new Error('공식 경기 시작 명단이 없습니다.');
  if (mine && !forfeit) {
    const sponsor = club.finance.sponsor;
    const side = fixture.homeClubId === club.id ? 'home' : 'away';
    if (sponsor.leagueId === fixture.id.split('-')[0] && (sponsor.kind === 'wins' && winner === club.id
      || sponsor.kind === 'appearances' && club.playerIds.includes(sponsor.playerId) && lineups[side].includes(sponsor.playerId))) {
      if (!Number.isSafeInteger(sponsor.progress + 1)) throw new Error('스폰서 실적이 저장 범위를 초과합니다.');
      sponsor.progress++;
    }
  }
  club.balance += reward;
  records.receipts.push(receipt);
  return true;
}

export function officialTotals(world, clubId) {
  const total = { matches: 0, wins: 0, losses: 0, rewards: 0, players: Object.create(null) };
  for(const year of [world,...(world.seasonYears?.archives??[])]) {
  const fixtures = [...year.pcSeason.fixtures, ...year.pcSeason.tiebreaks.flatMap(round => round.fixtures), ...(year.pcSeason.playoffs?.series ?? []),...domesticFixtures(year.citySeason),...domesticFixtures(year.provinceSeason),...domesticFixtures(year.nationalSeason),...worldFixtures(year.worldSeason)];
  for (const receipt of year.officialRecords.receipts) {
    const fixture = fixtures.find(item => item.id === receipt.fixtureId);
    if (![fixture.homeClubId, fixture.awayClubId].includes(clubId)) continue;
    const side = fixture.homeClubId === clubId ? 'home' : 'away';
    const won = fixture.result[`${side}Score`] > fixture.result[`${side === 'home' ? 'away' : 'home'}Score`];
    total.matches++; total[won ? 'wins' : 'losses']++;
    if (clubId === world.playerClubId) total.rewards += receipt.reward;
    for (const id of receipt.lineups?.[side] ?? []) {
      const player = total.players[id] ??= { appearances: 0, wins: 0, losses: 0 };
      player.appearances++; player[won ? 'wins' : 'losses']++;
    }
  }
  }
  return total;
}

export function validateOfficialRecords(value, world) {
  const fail = () => { throw new Error('공식 경기 보상·출전 기록이 올바르지 않습니다.'); };
  if (!value || typeof value !== 'object' || !Array.isArray(value.receipts) || !Object.hasOwn(value, 'active')) fail();
  const fixtures = [...world.pcSeason.fixtures, ...world.pcSeason.tiebreaks.flatMap(round => round.fixtures), ...(world.pcSeason.playoffs?.series ?? []),...domesticFixtures(world.citySeason),...domesticFixtures(world.provinceSeason),...domesticFixtures(world.nationalSeason),...worldFixtures(world.worldSeason)];
  const players = new Set(world.players.map(player => player.id));
  const lineup = data => {
    if (!data || typeof data !== 'object') fail();
    for (const side of ['home', 'away']) if (!Array.isArray(data[side]) || data[side].length !== 5 || data[side].some(id => !players.has(id))) fail();
    if (new Set([...data.home, ...data.away]).size !== 10) fail();
    return { home: [...data.home], away: [...data.away] };
  };
  const used = new Set();
  for (const series of [...(world.pcSeason.playoffs?.series ?? []),...domesticFixtures(world.citySeason),...domesticFixtures(world.provinceSeason),...domesticFixtures(world.nationalSeason),...worldFixtures(world.worldSeason)]) if (series.lineups) lineup(series.lineups);
  const receipts = value.receipts.map(receipt => {
    const fixture = fixtures.find(item => item.id === receipt?.fixtureId);
    if (!fixture?.result || used.has(receipt.fixtureId) || !Number.isSafeInteger(receipt.day) || receipt.day < (world.seasonYears?.startedDay??1) || receipt.day > world.day) fail();
    used.add(receipt.fixtureId);
    const mine = [fixture.homeClubId, fixture.awayClubId].includes(world.playerClubId);
    const winner = fixture.result.homeScore > fixture.result.awayScore ? fixture.homeClubId : fixture.awayClubId;
    const reward = mine && fixture.week !== 0 && !fixture.result.forfeit ? winner === world.playerClubId ? 500 : 200 : 0;
    if (receipt.reward !== reward || fixture.result.forfeit && receipt.lineups !== null) fail();
    if (['playoff','city','province','national','world','world-final'].includes(fixture.kind) && !fixture.result.forfeit && JSON.stringify(receipt.lineups) !== JSON.stringify(fixture.lineups)) fail();
    return { fixtureId: receipt.fixtureId, day: receipt.day, lineups: fixture.result.forfeit ? null : lineup(receipt.lineups), reward };
  });
  let active = null;
  if (value.active !== null) {
    const fixture = fixtures.find(item => item.id === value.active?.fixtureId);
    if (!fixture || fixture.result || value.active.fixtureId !== officialSeason(world).activeMatchId || used.has(value.active.fixtureId)) fail();
    if (['playoff','city','province','national','world','world-final'].includes(fixture.kind) && JSON.stringify(value.active.lineups) !== JSON.stringify(fixture.lineups)) fail();
    active = { fixtureId: value.active.fixtureId, lineups: lineup(value.active.lineups) };
  }
  // Legacy active matches may lack a lineup: reentry still forfeits, never invents appearances.
  return { active, receipts };
}
