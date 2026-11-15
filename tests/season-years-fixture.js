import assert from 'node:assert/strict';
import { advanceWeek } from '../src/game/calendar.js';
import { officialSeason,recordPcMatch } from '../src/game/pc-season.js';
import { recordBo3Map,recordPlayoffMap,nextPlayoffSeries } from '../src/game/pc-playoffs.js';
import { pickDomesticMaps,enterDomesticSeason } from '../src/game/domestic-season.js';
import { recordDomesticPlayoffMap } from '../src/game/domestic-finals.js';
import { enterWorldGroups,nextWorldFixture } from '../src/game/world-groups.js';
import { enterWorldRanked } from '../src/game/world-ranked.js';
import { recordWorldFinalMap } from '../src/game/world-finals.js';
import { officialLineups,applyOfficialReceipt } from '../src/game/official-records.js';
import { renewContract } from '../src/game/contracts.js';
import { competitionSeed } from '../src/game/season-year-context.js';
import { trip } from './city-fixture.js';

export function renew(world) {for(const id of world.clubs[0].playerIds)renewContract(world,id,168);}
function ordered(ids,own){return [own,...ids.filter(id=>id!==own)];}
function winHome(world,series,ids){const order=ordered(ids,world.playerClubId);return order.indexOf(series.homeClubId)<order.indexOf(series.awayClubId);}
export function fill(world,series,won=true) {
  if(!series.mapPicks)pickDomesticMaps(series,series.awayClubId===world.playerClubId?'away':'home',series.maps[0].mapId);
  series.lineups=officialLineups(world,series);
  while(!series.result)recordBo3Map(series,{homeScore:won?13:6,awayScore:won?6:13});applyOfficialReceipt(world,series,series.lineups);
}
export function completeLeague(world,place=1) {
  renew(world);const season=officialSeason(world),weeks=season.leagueId==='pc'?7:season.leagueId==='city'?9:11;
  for(let week=1;week<=weeks;week++) {
    assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
    for(const fixture of season.fixtures.filter(match=>match.week===week)) {
      const won=winHome(world,fixture,season.clubIds);
      if(season.leagueId==='pc'){recordPcMatch(season,fixture.id,{homeScore:won?13:6,awayScore:won?6:13});applyOfficialReceipt(world,fixture,officialLineups(world,fixture));}
      else fill(world,fixture,won);
    }
    season.weekSchedule.phase='settling';assert.equal(advanceWeek(world).ok,true);
  }
  assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
  while(nextPlayoffSeries(season.playoffs)) {
    const series=nextPlayoffSeries(season.playoffs),mine=[series.homeClubId,series.awayClubId].includes(world.playerClubId);
    if('mapPicks' in series)pickDomesticMaps(series,series.awayClubId===world.playerClubId?'away':'home',series.maps[0].mapId);
    series.lineups=officialLineups(world,series);const won=mine?(series.homeClubId===world.playerClubId)===(place===1):true;
    while(!series.result){const score={homeScore:won?13:6,awayScore:won?6:13},options={seed:competitionSeed(world)};
      if(season.leagueId==='pc')recordPlayoffMap(season.playoffs,series.id,score,options);else recordDomesticPlayoffMap(season,series.id,score,options);}
    applyOfficialReceipt(world,series,series.lineups);
  }
  season.weekSchedule.phase='settling';advanceWeek(world);trip(world);
}
export function completeWorld(world) {
  renew(world);enterWorldGroups(world);const season=world.worldSeason;
  for(let week=1;week<=3;week++) {
    advanceWeek(world,{official:true});
    for(const series of season.fixtures.filter(match=>match.week===week))fill(world,series,winHome(world,series,season.groups.find(group=>group.id===series.groupId).clubIds));
    season.weekSchedule.phase='settling';advanceWeek(world);
  }
  enterWorldRanked(world);
  for(const rounds of [[1,2],[3]]) {
    advanceWeek(world,{official:true});
    for(const round of rounds){for(const series of season.ranked.fixtures.filter(match=>match.round===round))fill(world,series,winHome(world,series,season.ranked.groups.find(group=>group.id===series.groupId).clubIds));
      const next=nextWorldFixture(world);if(next?.week===4)season.weekSchedule.fixtureId=next.id;}
    season.weekSchedule.phase='settling';advanceWeek(world);
  }
  advanceWeek(world,{official:true});
  while(nextPlayoffSeries(season.playoffs)) {
    const series=nextPlayoffSeries(season.playoffs),won=series.awayClubId!==world.playerClubId;
    pickDomesticMaps(series,series.awayClubId===world.playerClubId?'away':'home',series.maps[0].mapId);series.lineups=officialLineups(world,series);
    while(!series.result)recordWorldFinalMap(season,series.id,{homeScore:won?13:6,awayScore:won?6:13},{seed:competitionSeed(world)});applyOfficialReceipt(world,series,series.lineups);
  }
  season.weekSchedule.phase='settling';advanceWeek(world);trip(world);
}
export function completeAnnual(world) {
  renew(world);for(let i=0;i<4;i++)assert.equal(advanceWeek(world,{official:true}).advancedDays,7);
  completeLeague(world);for(const league of ['city','province','national']){enterDomesticSeason(world,league);completeLeague(world);}
  completeWorld(world);return world;
}
