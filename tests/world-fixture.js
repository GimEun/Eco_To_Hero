import assert from 'node:assert/strict';
import {finishedNational} from './national-fixture.js';
import {trip} from './city-fixture.js';
import {enterWorldGroups} from '../src/game/world-groups.js';
import {advanceWeek} from '../src/game/calendar.js';
import {pickDomesticMaps} from '../src/game/domestic-season.js';
import {officialLineups,applyOfficialReceipt} from '../src/game/official-records.js';
import {recordBo3Map} from '../src/game/pc-playoffs.js';
export const parent=finishedNational();
export function groups(ready=false) {
  const world=structuredClone(parent);enterWorldGroups(world);
  if(ready)advanceWeek(world,{official:true});return world;
}
export function fillSeries(world,series,won=true) {
  if(!series.mapPicks)pickDomesticMaps(series,series.awayClubId===world.playerClubId?'away':'home',series.maps[0].mapId);
  series.lineups=officialLineups(world,series);
  while(!series.result)recordBo3Map(series,{homeScore:won?13:6,awayScore:won?6:13});
  applyOfficialReceipt(world,series,series.lineups);
}
export function completedGroups({cycle=false,last=false,aiCycle=false,groupRank=0}={}) {
  const world=groups(),season=world.worldSeason;
  const ownGroup=season.groups.find(group=>group.clubIds.includes(world.playerClubId));
  const cyclic=aiCycle?season.groups.find(group=>group!==ownGroup):ownGroup;
  for(let week=1;week<=3;week++) {
    assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
    for(const series of season.fixtures.filter(match=>match.week===week)) {
      const group=season.groups.find(group=>group.id===series.groupId),ids=group.clubIds.filter(id=>id!==world.playerClubId);
      if(group===ownGroup)ids.splice(last?3:groupRank,0,world.playerClubId);
      const a=ids.indexOf(series.homeClubId),b=ids.indexOf(series.awayClubId);
      const won=(cycle||aiCycle) && group===cyclic && a<3 && b<3?(a+1)%3===b:a<b;
      fillSeries(world,series,won);
    }
    season.weekSchedule.phase='settling';assert.equal(advanceWeek(world).ok,true);
  }
  assert.equal(world.day,344);trip(world);return world;
}

