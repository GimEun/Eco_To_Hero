import {recordDomesticPlayoffMap} from '../src/game/domestic-finals.js';
import {beginTeamTraining} from '../src/game/team-training.js';
import {nextPlayoffSeries} from '../src/game/pc-playoffs.js';
import {signSponsor} from '../src/game/sponsors.js';
import assert from 'node:assert/strict';
import {finishedCity,trip} from './city-fixture.js';
import {enterDomesticSeason,nextDomesticFixture,selectDomesticMap,pickDomesticMaps} from '../src/game/domestic-season.js';
import {recordBo3Map} from '../src/game/pc-playoffs.js';
import {advanceWeek} from '../src/game/calendar.js';
import {officialLineups,applyOfficialReceipt} from '../src/game/official-records.js';
import {renewContract} from '../src/game/contracts.js';
export function province(ready=false) {
  const world=finishedCity();enterDomesticSeason(world,'province');
  for(const id of world.clubs[0].playerIds)renewContract(world,id,168);
  if(ready){advanceWeek(world,{official:true});const series=nextDomesticFixture(world);selectDomesticMap(world,series.id,series.maps[0].mapId);}
  trip(world);return world;
}
export function completeAi(world,week,except=null) {
  for(const series of world.provinceSeason.fixtures.filter(item=>item.week===week && item.id!==except && !item.result)) {
    if(!series.mapPicks)pickDomesticMaps(series,series.awayClubId===world.playerClubId?'away':'home',series.maps[0].mapId);
    series.lineups=officialLineups(world,series);
    const homeWins=series.awayClubId!==world.playerClubId;
    while(!series.result)recordBo3Map(series,{homeScore:homeWins?13:6,awayScore:homeWins?6:13});
    applyOfficialReceipt(world,series,series.lineups);
  }
}

export function completedProvince(rank=0,cycle=false) {
  const world=province(),order=world.provinceSeason.clubIds.filter(id=>id!==world.playerClubId);order.splice(rank,0,world.playerClubId);
  for(let week=1;week<=11;week++) {
    assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
    for(const series of world.provinceSeason.fixtures.filter(item=>item.week===week)) {
      const a=order.indexOf(series.homeClubId),b=order.indexOf(series.awayClubId),won=cycle && a<3 && b<3?(a+1)%3===b:a<b;
      pickDomesticMaps(series,series.awayClubId===world.playerClubId?'away':'home',series.maps[0].mapId);
      series.lineups=officialLineups(world,series);
      while(!series.result)recordBo3Map(series,{homeScore:won?13:6,awayScore:won?6:13});
      applyOfficialReceipt(world,series,series.lineups);
    }
    world.provinceSeason.weekSchedule.phase='settling';assert.equal(advanceWeek(world).ok,true);
  }
  assert.equal(world.day,232);trip(world);return world;
}

export function readyFinals(teamTraining=false) {
  const world=completedProvince();signSponsor(world,'wins',1);
  if(teamTraining){beginTeamTraining(world,{official:true});return world;}
  advanceWeek(world,{official:true});
  while(true) {
    const series=nextPlayoffSeries(world.provinceSeason.playoffs);
    if([series.homeClubId,series.awayClubId].includes(world.playerClubId))break;
    pickDomesticMaps(series,'home',series.maps[0].mapId);series.lineups=officialLineups(world,series);
    while(!series.result)recordDomesticPlayoffMap(world.provinceSeason,series.id,{homeScore:13,awayScore:6},{seed:world.seed});
    applyOfficialReceipt(world,series,series.lineups);
  }
  trip(world);return world;
}

export function finishedProvince(place=1) {
  const world=completedProvince(place<=2?0:11);advanceWeek(world,{official:true});
  while(nextPlayoffSeries(world.provinceSeason.playoffs)) {
    const series=nextPlayoffSeries(world.provinceSeason.playoffs);
    pickDomesticMaps(series,series.awayClubId===world.playerClubId?'away':'home',series.maps[0].mapId);
    series.lineups=officialLineups(world,series);
    const mine=[series.homeClubId,series.awayClubId].includes(world.playerClubId),myWin=!(place===2 && series.id.endsWith('-final'));
    const won=mine?((series.homeClubId===world.playerClubId)===myWin):true;
    while(!series.result)recordDomesticPlayoffMap(world.provinceSeason,series.id,{homeScore:won?13:6,awayScore:won?6:13},{seed:world.seed});
    applyOfficialReceipt(world,series,series.lineups);
  }
  world.provinceSeason.weekSchedule.phase='settling';assert.equal(advanceWeek(world).ok,true);assert.equal(world.day,239);trip(world);return world;
}

