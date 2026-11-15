import {recordCityPlayoffMap} from '../src/game/city-finals.js';
import {signSponsor} from '../src/game/sponsors.js';
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { recordPcMatch } from '../src/game/pc-season.js';
import { recordPlayoffMap,nextPlayoffSeries,recordBo3Map } from '../src/game/pc-playoffs.js';
import { enterCitySeason, nextCityFixture, pickCityMaps, selectCityMap } from '../src/game/city-season.js';
import { advanceWeek } from '../src/game/calendar.js';
import { officialLineups,applyOfficialReceipt } from '../src/game/official-records.js';
import { createSave,restoreWorld } from '../src/storage/save-data.js';
import { renewContract } from '../src/game/contracts.js';
export const trip=world=>assert.deepEqual(restoreWorld(createSave(world)),world);
export function promoted() {
  const world=createWorld(createClub('CityTest').club,42);
  for(let i=0;i<11;i++)assert.equal(advanceWeek(world).ok,true);
  for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  const ids=[world.playerClubId,...world.pcSeason.clubIds.filter(id=>id!==world.playerClubId)];
  for(const match of world.pcSeason.fixtures) {
    const won=ids.indexOf(match.homeClubId)<ids.indexOf(match.awayClubId);
    recordPcMatch(world.pcSeason,match.id,{homeScore:won?13:6,awayScore:won?6:13});
  }
  advanceWeek(world,{official:true});
  while(nextPlayoffSeries(world.pcSeason.playoffs)) {
    const series=nextPlayoffSeries(world.pcSeason.playoffs);series.lineups=officialLineups(world,series);
    const won=series.awayClubId!==world.playerClubId;
    for(let i=0;i<2;i++)recordPlayoffMap(world.pcSeason.playoffs,series.id,{homeScore:won?13:6,awayScore:won?6:13},{seed:world.seed});
    applyOfficialReceipt(world,series,series.lineups);
  }
  world.pcSeason.weekSchedule.phase='settling';advanceWeek(world);
  assert.equal(world.day,85);trip(world);return world;
}
export function cityReady() {
  const world=promoted();enterCitySeason(world);advanceWeek(world,{official:true});
  const match=nextCityFixture(world);selectCityMap(world,match.id,match.maps[0].mapId);trip(world);
  return world;
}
export function finishAiWeek(world,week) {
  for(const series of world.citySeason.fixtures.filter(item=>item.week===week && !item.result)) {
    if(!series.mapPicks)pickCityMaps(series,'home',series.maps[0].mapId);
    series.lineups=officialLineups(world,series);
    while(!series.result)recordBo3Map(series,{homeScore:13,awayScore:6});
    applyOfficialReceipt(world,series,series.lineups);
  }
  world.citySeason.weekSchedule.phase='settling';advanceWeek(world);
}

export function completedCity(rank=0,cycle=false) {
  const world=promoted();enterCitySeason(world);
  const order=world.citySeason.clubIds.filter(id=>id!==world.playerClubId);order.splice(rank,0,world.playerClubId);
  for(let week=1;week<=9;week++) {
    assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
    for(const series of world.citySeason.fixtures.filter(item=>item.week===week)) {
      const a=order.indexOf(series.homeClubId),b=order.indexOf(series.awayClubId);
      const won=cycle && a<3 && b<3?(a+1)%3===b:a<b;
      const side=series.awayClubId===world.playerClubId?'away':'home';
      pickCityMaps(series,side,series.maps[0].mapId);series.lineups=officialLineups(world,series);
      while(!series.result)recordBo3Map(series,{homeScore:won?13:6,awayScore:won?6:13});
      applyOfficialReceipt(world,series,series.lineups);
    }
    world.citySeason.weekSchedule.phase='settling';assert.equal(advanceWeek(world).ok,true);
  }
  assert.equal(world.day,148);trip(world);return world;
}

export function recordAiPlayoff(world,series) {
  pickCityMaps(series,'home',series.maps[0].mapId);series.lineups=officialLineups(world,series);
  while(!series.result)recordCityPlayoffMap(world.citySeason,series.id,{homeScore:13,awayScore:6},{seed:world.seed});
  applyOfficialReceipt(world,series,series.lineups);
}

export function readyPlayoff() {
  const world=completedCity();assert.equal(signSponsor(world,'wins',1).ok,true);
  advanceWeek(world,{official:true});
  while(true) {
    const series=nextPlayoffSeries(world.citySeason.playoffs);
    if([series.homeClubId,series.awayClubId].includes(world.playerClubId))break;
    recordAiPlayoff(world,series);
  }
  trip(world);return world;
}

export function finishedCity(place=1) {
  const world=completedCity(place<=2?0:9);advanceWeek(world,{official:true});
  while(nextPlayoffSeries(world.citySeason.playoffs)) {
    const series=nextPlayoffSeries(world.citySeason.playoffs),side=series.awayClubId===world.playerClubId?'away':'home';
    pickCityMaps(series,side,series.maps[0].mapId);series.lineups=officialLineups(world,series);
    const mine=[series.homeClubId,series.awayClubId].includes(world.playerClubId);
    const myWin=!(place===2 && series.id.endsWith('-final'));
    const won=mine?((series.homeClubId===world.playerClubId)===myWin):true;
    while(!series.result)recordCityPlayoffMap(world.citySeason,series.id,{homeScore:won?13:6,awayScore:won?6:13},{seed:world.seed});
    applyOfficialReceipt(world,series,series.lineups);
  }
  world.citySeason.weekSchedule.phase='settling';advanceWeek(world);assert.equal(world.day,155);trip(world);return world;
}

