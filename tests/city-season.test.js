import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { nextOfficialFixture } from '../src/game/pc-season.js';
import { recordBo3Map } from '../src/game/pc-playoffs.js';
import { enterCitySeason, nextCityFixture, pickCityMaps, selectCityMap, cityStandings } from '../src/game/city-season.js';
import { advanceWeek } from '../src/game/calendar.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { officialLineups, applyOfficialReceipt, officialTotals } from '../src/game/official-records.js';
import { beginOfficialMatch, finishOfficialWeek, createOfficialPractice } from '../src/game/official-match.js';
import { signSponsor } from '../src/game/sponsors.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { selectWeeklyActions } from '../src/game/training.js';
import { beginTeamTraining,settleTeamTraining } from '../src/game/team-training.js';
import { createPractice,advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { seasonScreen } from '../src/ui/season-screen.js';
import { renewContract } from '../src/game/contracts.js';

import {trip,promoted,cityReady,finishAiWeek} from './city-fixture.js';

test('시 리그 진입은 PC방 결과·날짜를 보존하고 고정 10팀의 45매치/9주를 만든다',()=>{
  const world=promoted(),before=structuredClone(world),old=createSave(world);old.schemaVersion=31;delete old.world.citySeason;
  assert.equal(restoreWorld(old).citySeason,null);
  enterCitySeason(world);
  assert.deepEqual(world.pcSeason,before.pcSeason);assert.equal(world.day,85);assert.equal(world.clubs[0].balance,before.clubs[0].balance);
  assert.equal(world.citySeason.clubIds.length,10);assert.equal(world.citySeason.clubIds.filter(id=>world.clubs.find(club=>club.id===id).leagueId==='city').length,8);
  assert.equal(world.citySeason.fixtures.length,45);
  const pairs=new Set(world.citySeason.fixtures.map(match=>[match.homeClubId,match.awayClubId].sort().join(':')));assert.equal(pairs.size,45);
  for(const id of world.citySeason.clubIds)assert.equal(world.citySeason.fixtures.filter(match=>[match.homeClubId,match.awayClubId].includes(id)).length,9);
  const again=structuredClone(before);enterCitySeason(again);assert.deepEqual(world.citySeason,again.citySeason);
  assert.equal(getClubView(world).leagueId,'city');assert.equal(getClubView(world).league,'시 리그');trip(world);
  assert.throws(()=>enterCitySeason(world));assert.throws(()=>enterCitySeason(createWorld(createClub('NotReady').club,42)));
});

test('준비 후 선택한 맵·고정 AI 선택·서로 다른 3맵 순서를 저장하고 시작 후에는 잠근다',()=>{
  const world=promoted();enterCitySeason(world);const match=nextCityFixture(world);
  assert.throws(()=>selectCityMap(world,match.id,match.maps[0].mapId));
  assert.throws(()=>beginOfficialMatch(world,match.id));
  advanceWeek(world,{official:true});assert.equal(world.day,91);assert.equal(officialWeekStatus(world).canPlay,false);
  assert.equal(selectWeeklyActions(world,{}).ok,false);
  const selected=match.maps[1].mapId;selectCityMap(world,match.id,selected);
  assert.equal(officialWeekStatus(world).canPlay,true);assert.equal(new Set(match.maps.map(map=>map.mapId)).size,3);
  const side=match.homeClubId===world.playerClubId?'home':'away';assert.equal(match.mapPicks[side],selected);
  const original=structuredClone(match);selectCityMap(world,match.id,selected);assert.deepEqual(match,original);trip(world);
  beginOfficialMatch(world,match.id);assert.throws(()=>selectCityMap(world,match.id,selected));trip(world);
});

test('완료 맵 후 시리즈 주전·퍼즈를 유지하고 보상 없이 다음 맵으로 이어진다',async()=>{
  let world=cityReady();const match=nextOfficialFixture(world);beginOfficialMatch(world,match.id);
  const before=structuredClone(world),cash=world.clubs[0].balance,receipts=world.officialRecords.receipts.length;
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1}});
  assert.deepEqual(before.citySeason.fixtures.find(item=>item.id===match.id).scores,[]);
  assert.equal(world.clubs[0].balance,cash);assert.equal(world.officialRecords.receipts.length,receipts);assert.equal(world.day,91);
  trip(world);assert.equal(createOfficialPractice(world,nextOfficialFixture(world)).pausesRemaining,1);
  await assert.rejects(finishOfficialWeek(world,{score:{home:13,away:6}}));
  beginOfficialMatch(world,match.id);assert.deepEqual(world.citySeason.fixtures.find(item=>item.id===match.id).lineups,match.lineups);trip(world);
});

test('시 리그 방송 준비 완료와 팀 훈련 대기를 기존 흐름으로 연결한다',()=>{
  const broadcast=promoted();enterCitySeason(broadcast);signSponsor(broadcast,'broadcast');
  assert.equal(selectWeeklyActions(broadcast,broadcast.clubs[0].playerIds.map(playerId=>({playerId,action:'broadcast'}))).ok,true);
  advanceWeek(broadcast,{official:true});assert.equal(broadcast.clubs[0].finance.sponsor.broadcastCompleted,true);trip(broadcast);
  const world=promoted();enterCitySeason(world);assert.equal(signSponsor(world,'broadcast').ok,true);
  const club=world.clubs[0];assert.equal(selectWeeklyActions(world,club.playerIds.map(playerId=>({playerId,action:'broadcast'}))).ok,true);
  assert.equal(beginTeamTraining(world,{official:true}).ok,true);assert.equal(officialWeekStatus(world).phase,'training');trip(world);
  const other=world.clubs.find(club=>club.id!==world.playerClubId);
  const state=createPractice(RELAY_MAP,getClubView(world),getClubView(world,other.id),{seed:42});advancePractice(state,RELAY_MAP,160000);
  assert.equal(settleTeamTraining(world,state,91).ok,true);assert.equal(officialWeekStatus(world).phase,'ready');trip(world);
});

test('시 리그 저장 재진입의 기권은 기존 승리 맵을 보존하고 출전·스폰서·상금을 주지 않는다',async()=>{
  let world=promoted();enterCitySeason(world);signSponsor(world,'appearances',1);advanceWeek(world,{official:true});
  const series=nextCityFixture(world);selectCityMap(world,series.id,series.maps[0].mapId);beginOfficialMatch(world,series.id);
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1}});trip(world);
  // 기권 자체와 마지막 정산을 분리해 확인할 수 있도록 AI 결과는 완료된 상태로 준비한다.
  for(const other of world.citySeason.fixtures.filter(item=>item.week===1 && item.id!==series.id)) {
    pickCityMaps(other,'home',other.maps[0].mapId);other.lineups=officialLineups(world,other);
    while(!other.result)recordBo3Map(other,{homeScore:13,awayScore:6});applyOfficialReceipt(world,other,other.lineups);
  }
  const previous=officialTotals(world,world.playerClubId);
  world=await finishOfficialWeek(restoreWorld(createSave(world)),{forfeit:true});
  const done=world.citySeason.fixtures.find(item=>item.id===series.id),totals=officialTotals(world,world.playerClubId);
  assert.equal(done.scores.length,3);assert.equal(done.scores[0].forfeit,undefined);assert.ok(done.scores.slice(1).every(score=>score.forfeit));
  assert.equal(done.result.forfeit,true);assert.equal(totals.rewards,previous.rewards);assert.equal(totals.matches,previous.matches+1);
  assert.deepEqual(totals.players,previous.players);assert.equal(world.clubs[0].finance.sponsor.progress,0);trip(world);
  await assert.rejects(finishOfficialWeek(world,{forfeit:true}));
});

test('시 리그 마지막 하루의 계약 만료로 막히면 BO3 결과를 보존하고 재계약 후 한 번만 정산한다',async()=>{
  let world=cityReady();const series=nextCityFixture(world);beginOfficialMatch(world,series.id);
  world=await finishOfficialWeek(world,{score:{home:13,away:6}});beginOfficialMatch(world,series.id);
  for(const other of world.citySeason.fixtures.filter(item=>item.week===1 && item.id!==series.id)) {
    pickCityMaps(other,'home',other.maps[0].mapId);other.lineups=officialLineups(world,other);
    while(!other.result)recordBo3Map(other,{homeScore:13,awayScore:6});applyOfficialReceipt(world,other,other.lineups);
  }
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  world=await finishOfficialWeek(world,{score:{home:13,away:6}});
  assert.equal(world.day,91);assert.equal(officialWeekStatus(world).phase,'settling');trip(world);
  const receipts=structuredClone(world.officialRecords.receipts),cash=world.clubs[0].balance;
  for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  assert.equal(advanceWeek(world,{official:true}).advancedDays,1);assert.equal(world.day,92);
  assert.deepEqual(world.officialRecords.receipts,receipts);assert.notEqual(world.clubs[0].balance,cash);trip(world);
});

test('손상된 참가팀·미래 경기·중복 맵·퍼즈·시작 명단·진행 ID를 저장에서 거부한다',()=>{
  const world=cityReady(),id=nextCityFixture(world).id;beginOfficialMatch(world,id);
  for(const mutate of [
    w=>w.citySeason.clubIds.reverse(),w=>{w.citySeason.fixtures.find(item=>item.id===id).maps.reverse();},
    w=>{w.citySeason.fixtures.find(item=>item.id===id).pausesRemaining=4;},
    w=>{w.citySeason.fixtures.find(item=>item.id===id).lineups.home[0]='missing';},
    w=>{w.citySeason.activeMatchId=null;},w=>{w.citySeason.weekSchedule=null;},w=>{w.officialRecords.active=null;},
    w=>{w.citySeason.fixtures.find(item=>item.week===2).mapPicks={home:'relay',away:'warehouse'};},
  ]){const copy=structuredClone(world);mutate(copy);assert.throws(()=>createSave(copy));}
});

test('9주 모두 매주 한 번만 정산하고 완료 후 플레이오프를 만들어내지 않으며 PC방 기록을 보존한다',()=>{
  const world=promoted(),pc=structuredClone(world.pcSeason);enterCitySeason(world);assert.equal(signSponsor(world,'wins',1).ok,true);
  assert.equal(world.clubs[0].finance.sponsor.leagueId,'city');
  for(let week=1;week<=9;week++) {
    assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
    const match=nextCityFixture(world);selectCityMap(world,match.id,match.maps[0].mapId);
    finishAiWeek(world,week);trip(world);assert.equal(world.day,85+week*7);
  }
  assert.equal(world.day,148);assert.equal(Math.floor((world.day-1)/7)+1,22);
  assert.equal(nextOfficialFixture(world),null);assert.equal(officialWeekStatus(world).phase,'tiebreak-ai');
  assert.deepEqual(world.pcSeason,pc);assert.equal(world.citySeason.fixtures.filter(match=>match.result).length,45);
  assert.equal(cityStandings(world.citySeason).reduce((sum,row)=>sum+row.played,0),90);
  assert.equal(world.officialRecords.receipts.filter(receipt=>receipt.fixtureId.startsWith('city-')).length,45);
  assert.equal(officialTotals(world,world.playerClubId).matches,11);assert.equal(world.clubs[0].finance.sponsor.kind,'wins');trip(world);
  const cityWins=world.citySeason.fixtures.filter(match=>[match.homeClubId,match.awayClubId].includes(world.playerClubId)
    && (match.homeClubId===world.playerClubId)===(match.result.homeScore>match.result.awayScore)).length;
  assert.equal(world.clubs[0].finance.sponsor.progress,cityWins);
});

test('시 리그 화면은 맵 선택·시리즈 결과·PC방 기록을 표시하고 조회로 상태를 변경하지 않는다',t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  const world=cityReady(),before=structuredClone(world),html=seasonScreen(world).innerHTML;
  assert.match(html,/시 리그 정규 시즌/);assert.match(html,/pick-city-map/);assert.match(html,/정규 9주 일정/);assert.match(html,/PC방 최종 결과/);
  assert.deepEqual(world,before);
});

test('내 BO3 종료 후 같은 주 AI 4시리즈를 실제 엔진으로 처리하고 시리즈 상금·출전을 한 번 반영한다',async()=>{
  let world=cityReady();const match=nextCityFixture(world);beginOfficialMatch(world,match.id);
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:2}});
  beginOfficialMatch(world,match.id);const before=structuredClone(world);let yields=0;
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1},yieldWork:async()=>{yields++;}});
  assert.deepEqual(before.citySeason.fixtures.find(item=>item.id===match.id).result,null);
  assert.ok(yields>0);assert.equal(world.day,92);assert.equal(world.citySeason.activeMatchId,null);
  assert.equal(world.citySeason.fixtures.filter(item=>item.week===1 && item.result).length,5);
  assert.equal(world.officialRecords.receipts.filter(item=>item.fixtureId===match.id).length,1);
  assert.equal(officialTotals(world,world.playerClubId).matches,3);trip(world);
});
