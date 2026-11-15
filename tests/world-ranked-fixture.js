import assert from 'node:assert/strict';
import {completedGroups,fillSeries} from './world-fixture.js';
import {trip} from './city-fixture.js';
import {enterWorldRanked} from '../src/game/world-ranked.js';
import {advanceWeek} from '../src/game/calendar.js';
import {nextWorldFixture,selectWorldMap} from '../src/game/world-groups.js';
import {beginOfficialMatch} from '../src/game/official-match.js';
export const parent=completedGroups();
export function ranked(ready=false,second=false) {
  const world=second?completedGroups({groupRank:1}):structuredClone(parent);enterWorldRanked(world);
  if(ready)advanceWeek(world,{official:true});return world;
}
export function fillRound(world,round,{cycle=false,aiCycle=false,last=false}={}) {
  const ranked=world.worldSeason.ranked,mine=ranked.groups.find(group=>group.clubIds.includes(world.playerClubId));
  for(const series of ranked.fixtures.filter(match=>match.round===round && !match.result)) {
    const group=ranked.groups.find(group=>group.id===series.groupId),ids=group.clubIds.filter(id=>id!==world.playerClubId);
    if(group===mine)ids.splice(last?3:0,0,world.playerClubId);
    const a=ids.indexOf(series.homeClubId),b=ids.indexOf(series.awayClubId);
    const cyclic=cycle && group===mine || aiCycle && group!==mine;
    fillSeries(world,series,cyclic && a<3 && b<3?(a+1)%3===b:a<b);
  }
}
export function completeRanked(options={}) {
  const world=ranked();
  for(const rounds of [[1,2],[3]]) {
    assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
    for(const round of rounds){fillRound(world,round,options);const next=nextWorldFixture(world);if(next?.week===world.worldSeason.ranked.fixtures.find(match=>match.round===round).week)world.worldSeason.weekSchedule.fixtureId=next.id;}
    world.worldSeason.weekSchedule.phase='settling';assert.equal(advanceWeek(world).ok,true);trip(world);
  }
  assert.equal(world.day,358);return world;
}
export function start(world) {const fixture=nextWorldFixture(world);if(!fixture.mapPicks)selectWorldMap(world,fixture.id,fixture.maps[0].mapId);beginOfficialMatch(world,fixture.id);trip(world);return fixture;}

