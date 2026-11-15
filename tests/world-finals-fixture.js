import assert from 'node:assert/strict';
import {completeRanked} from './world-ranked-fixture.js';
import {trip} from './city-fixture.js';
import {pickDomesticMaps} from '../src/game/domestic-season.js';
import {officialLineups,applyOfficialReceipt} from '../src/game/official-records.js';
import {recordWorldFinalMap} from '../src/game/world-finals.js';
import {nextPlayoffSeries} from '../src/game/pc-playoffs.js';
import {advanceWeek} from '../src/game/calendar.js';
import {signSponsor} from '../src/game/sponsors.js';
import {nextWorldFixture,selectWorldMap} from '../src/game/world-groups.js';
import {beginOfficialMatch,finishOfficialWeek} from '../src/game/official-match.js';
export const parent=completeRanked();
export function fill(world,series,homeWin=true) {
  if(!series.mapPicks)pickDomesticMaps(series,series.awayClubId===world.playerClubId?'away':'home',series.maps[0].mapId);
  series.lineups=officialLineups(world,series);
  while(!series.result)recordWorldFinalMap(world.worldSeason,series.id,{homeScore:homeWin?13:6,awayScore:homeWin?6:13},{seed:world.seed,remaining:series.pausesRemaining});
  applyOfficialReceipt(world,series,series.lineups);
}
export function ready() {
  const world=structuredClone(parent);assert.equal(signSponsor(world,'wins',1).ok,true);assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
  while(true){const series=nextPlayoffSeries(world.worldSeason.playoffs);if([series.homeClubId,series.awayClubId].includes(world.playerClubId))break;fill(world,series);}
  trip(world);return world;
}
export async function map(world,win=true,remaining=3) {
  const series=nextWorldFixture(world);if(!series.mapPicks)selectWorldMap(world,series.id,series.maps[0].mapId);
  beginOfficialMatch(world,series.id);trip(world);
  return finishOfficialWeek(world,{score:{home:win?13:6,away:win?6:13,pausesRemaining:remaining}});
}
export function finished(place=1) {
  const world=structuredClone(parent);advanceWeek(world,{official:true});
  while(nextPlayoffSeries(world.worldSeason.playoffs)) {
    const series=nextPlayoffSeries(world.worldSeason.playoffs),mine=[series.homeClubId,series.awayClubId].includes(world.playerClubId);
    const myWin=place===1 || place===2 && !series.id.endsWith('-final');fill(world,series,mine?(series.homeClubId===world.playerClubId)===myWin:true);
  }
  world.worldSeason.weekSchedule.phase='settling';advanceWeek(world);trip(world);return world;
}

