import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { finishedProvince,completedProvince } from './province-fixture.js';
import { trip } from './city-fixture.js';
import { domesticQualification, domesticEntryIssue, enterDomesticSeason, nextDomesticFixture, selectDomesticMap, domesticStandings } from '../src/game/domestic-season.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { advanceWeek } from '../src/game/calendar.js';
import { officialTotals } from '../src/game/official-records.js';
import { beginOfficialMatch,finishOfficialWeek,createOfficialPractice } from '../src/game/official-match.js';
import { signSponsor } from '../src/game/sponsors.js';
import { renewContract } from '../src/game/contracts.js';
import { createSave,restoreWorld,parseBackup,MAX_BACKUP_BYTES } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { seasonScreen } from '../src/ui/season-screen.js';
import { selectWeeklyActions } from '../src/game/training.js';
import { beginTeamTraining,settleTeamTraining } from '../src/game/team-training.js';
import { createPractice,advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';

import {national,completeAi} from './national-fixture.js';

test('도 최종1·2위가 정산 후 전국으로 진출하며 이전 시즌/날짜/자금을 보존한다',()=>{
  for(const place of [1,2]) {
    const world=finishedProvince(place),before=structuredClone(world),qualification=domesticQualification(world,'national');
    assert.equal(qualification.rank,place);assert.equal(qualification.qualified,true);assert.equal(domesticEntryIssue(world,'national'),null);
    enterDomesticSeason(world,'national');assert.equal(world.day,239);assert.equal(world.clubs[0].balance,before.clubs[0].balance);
    for(const key of ['pcSeason','citySeason','provinceSeason'])assert.deepEqual(world[key],before[key]);trip(world);
  }
  assert.throws(()=>enterDomesticSeason(completedProvince(),'national'));
  const out=finishedProvince(12);assert.equal(domesticQualification(out,'national').qualified,false);assert.throws(()=>enterDomesticSeason(out,'national'));
  const pending=finishedProvince();pending.provinceSeason.playoffs.settled=false;assert.throws(()=>enterDomesticSeason(pending,'national'));
});

test('전국12팀·고정 추첨10팀·66개 고유 대진·11주를 생성하고 v35에 빈 상태만 보충한다',()=>{
  const world=finishedProvince(),before=structuredClone(world),old=createSave(world);old.schemaVersion=35;delete old.world.nationalSeason;
  assert.deepEqual(restoreWorld(old),{...world,aiGrowth:createAiGrowth(world.day),counseling:createCounseling(world)});enterDomesticSeason(world,'national');const season=world.nationalSeason;
  const again=structuredClone(before);enterDomesticSeason(again,'national');assert.deepEqual(season,again.nationalSeason);
  assert.equal(season.clubIds.length,12);assert.equal(season.fixtures.length,66);
  assert.equal(season.clubIds.filter(id=>world.clubs.find(club=>club.id===id).leagueId==='national').length,10);
  assert.equal(new Set(season.fixtures.map(match=>[match.homeClubId,match.awayClubId].sort().join(':'))).size,66);
  for(const id of season.clubIds)assert.equal(season.fixtures.filter(match=>[match.homeClubId,match.awayClubId].includes(id)).length,11);
  for(let week=1;week<=11;week++)assert.equal(new Set(season.fixtures.filter(match=>match.week===week).flatMap(match=>[match.homeClubId,match.awayClubId])).size,12);
  assert.equal(getClubView(world).leagueId,'national');assert.equal(getClubView(world).league,'전국 리그');assert.deepEqual(world.officialRecords,before.officialRecords);trip(world);
  assert.throws(()=>enterDomesticSeason(world,'national'));
});

test('전국 주간 방송·맵 선택·완료 맵·시리즈 퍼즈/주전을 저장하고 시작 이후 맵 변경을 막는다',async()=>{
  let world=national();assert.equal(signSponsor(world,'broadcast').ok,true);
  assert.equal(selectWeeklyActions(world,world.clubs[0].playerIds.map(playerId=>({playerId,action:'broadcast'}))).ok,true);
  const series=nextDomesticFixture(world);assert.throws(()=>beginOfficialMatch(world,series.id));assert.throws(()=>selectDomesticMap(world,series.id,series.maps[0].mapId));
  assert.equal(advanceWeek(world,{official:true}).advancedDays,6);assert.equal(world.day,245);assert.equal(world.clubs[0].finance.sponsor.broadcastCompleted,true);
  assert.equal(officialWeekStatus(world).canPlay,false);selectDomesticMap(world,series.id,series.maps[1].mapId);
  assert.equal(new Set(series.maps.map(map=>map.mapId)).size,3);assert.equal(officialWeekStatus(world).canPlay,true);
  beginOfficialMatch(world,series.id);assert.throws(()=>selectDomesticMap(world,series.id,series.maps[0].mapId));
  const before=structuredClone(world),cash=world.clubs[0].balance,count=world.officialRecords.receipts.length;
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1}});
  assert.deepEqual(before.nationalSeason.fixtures.find(match=>match.id===series.id).scores,[]);assert.equal(world.clubs[0].balance,cash);assert.equal(world.officialRecords.receipts.length,count);trip(world);
  const config=createOfficialPractice(world,nextDomesticFixture(world));assert.equal(config.pausesRemaining,1);assert.equal(config.leagueLabel,'전국 리그');
  await assert.rejects(finishOfficialWeek(world,{score:{home:13,away:6}}));beginOfficialMatch(world,series.id);
  assert.deepEqual(world.nationalSeason.fixtures.find(match=>match.id===series.id).lineups,series.lineups);trip(world);
});

test('전국 팀 훈련 완료 전 맵 선택/공식 시작을 막고 같은 주에 재개한다',()=>{
  const world=national();assert.equal(beginTeamTraining(world,{official:true}).ok,true);assert.equal(officialWeekStatus(world).phase,'training');
  const fixture=nextDomesticFixture(world);assert.throws(()=>selectDomesticMap(world,fixture.id,fixture.maps[0].mapId));
  const other=world.clubs.find(club=>club.id!==world.playerClubId),state=createPractice(RELAY_MAP,getClubView(world),getClubView(world,other.id),{seed:42});
  advancePractice(state,RELAY_MAP,160000);assert.equal(settleTeamTraining(world,state,245).ok,true);assert.equal(officialWeekStatus(world).phase,'ready');trip(world);
});

test('전국11주 종료 후46주·66매치·전국 스폰서와 누적 기록/JSON 백업을 유지한다',()=>{
  const world=national(),previous=structuredClone(world),old=officialTotals(world,world.playerClubId);
  assert.equal(signSponsor(world,'wins',1).ok,true);assert.equal(world.clubs[0].finance.sponsor.leagueId,'national');
  for(let week=1;week<=11;week++) {
    assert.equal(advanceWeek(world,{official:true}).advancedDays,6);completeAi(world,week);world.nationalSeason.weekSchedule.phase='settling';
    assert.equal(advanceWeek(world).advancedDays,1);trip(world);assert.equal(world.day,239+week*7);
  }
  assert.equal(world.day,316);assert.equal(Math.floor((world.day-1)/7)+1,46);assert.equal(officialWeekStatus(world).phase,'playoff-unscheduled');assert.ok(domesticStandings(world.nationalSeason).every(row=>!row.tied));
  assert.equal(nextDomesticFixture(world),null);assert.equal(world.nationalSeason.playoffs,null);assert.deepEqual(world.nationalSeason.tiebreaks,[]);
  assert.equal(world.clubs[0].finance.sponsor.progress,11);assert.equal(world.clubs[0].finance.settlements.at(-1).income,6500);
  assert.equal(officialTotals(world,world.playerClubId).matches,old.matches+11);assert.equal(domesticStandings(world.nationalSeason).reduce((n,row)=>n+row.played,0),132);
  for(const key of ['pcSeason','citySeason','provinceSeason'])assert.deepEqual(world[key],previous[key]);
  const json=JSON.stringify(createSave(world),null,2),bytes=new TextEncoder().encode(json).byteLength;
  assert.ok(bytes<MAX_BACKUP_BYTES,`전국 정규 종료 백업 ${bytes}바이트`);assert.deepEqual(restoreWorld(parseBackup(json)),world);
});

test('전국 시리즈 기권은 기존 맵을 유지하며 보상/출전/스폰서 제외와 정산 중단/파산을 저장한다',async()=>{
  let world=national();signSponsor(world,'appearances',1);advanceWeek(world,{official:true});const series=nextDomesticFixture(world);
  selectDomesticMap(world,series.id,series.maps[0].mapId);beginOfficialMatch(world,series.id);
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1}});completeAi(world,1,series.id);
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  const old=officialTotals(world,world.playerClubId);world=await finishOfficialWeek(restoreWorld(createSave(world)),{forfeit:true});
  const done=world.nationalSeason.fixtures.find(match=>match.id===series.id);assert.equal(done.scores.length,3);assert.equal(done.result.forfeit,true);
  assert.equal(world.day,245);assert.equal(officialWeekStatus(world).phase,'settling');assert.equal(world.clubs[0].finance.sponsor.progress,0);
  assert.deepEqual(officialTotals(world,world.playerClubId).players,old.players);assert.equal(officialTotals(world,world.playerClubId).rewards,old.rewards);trip(world);
  const receipts=structuredClone(world.officialRecords.receipts);for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  const bankruptcy=structuredClone(world);assert.equal(advanceWeek(world,{official:true}).advancedDays,1);assert.equal(world.day,246);trip(world);
  bankruptcy.clubs[0].balance=0;for(const contract of Object.values(bankruptcy.clubs[0].contracts))contract.monthlySalary=100000;
  assert.equal(advanceWeek(bankruptcy,{official:true}).bankrupt,true);assert.deepEqual(bankruptcy.officialRecords.receipts,receipts);trip(bankruptcy);
  await assert.rejects(finishOfficialWeek(world,{forfeit:true}));
});

test('손상된 전국 참가/대진/미래 경기/퍼즈/명단/진행 ID와 손상된 종료 상태를 거부한다',()=>{
  const world=national(true),series=nextDomesticFixture(world);beginOfficialMatch(world,series.id);
  for(const mutate of [w=>w.nationalSeason.clubIds.reverse(),w=>w.nationalSeason.fixtures[0].maps.reverse(),
    w=>{w.nationalSeason.fixtures.find(match=>match.id===series.id).pausesRemaining=4;},w=>{w.nationalSeason.fixtures.find(match=>match.id===series.id).lineups.home[0]='missing';},
    w=>{w.nationalSeason.activeMatchId=null;},w=>{w.nationalSeason.weekSchedule=null;},w=>{w.officialRecords.active=null;},
    w=>{w.nationalSeason.playoffs={series:[]};},w=>{w.nationalSeason.tiebreaks=[{id:'fake'}];},
    w=>{w.nationalSeason.fixtures.find(match=>match.week===2).mapPicks={home:'relay',away:'warehouse'};},
  ]){const copy=structuredClone(world);mutate(copy);assert.throws(()=>createSave(copy));}
});

test('도 최종 화면에 전국 참가가 표시되고 전국 화면에서 과거 세 리그 결과를 볼 수 있다',t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  const previous=finishedProvince(),html=seasonScreen(previous).innerHTML;assert.match(html,/전국 리그 진출 확정/);assert.match(html,/enter-national/);assert.doesNotMatch(html,/\$\{/);
  const world=national(true),before=structuredClone(world),view=seasonScreen(world).innerHTML;
  assert.match(view,/전국 리그 정규 시즌/);assert.match(view,/12팀/);assert.match(view,/정규 11주 일정/);assert.match(view,/pick-domestic-map/);
  for(const name of ['PC방','시 리그','도 리그'])assert.match(view,new RegExp(`${name} 최종 결과`));assert.match(view,/동률은 BO1/);
  assert.doesNotMatch(view,/\$\{/);assert.deepEqual(world,before);
});

test('내 전국 BO3 종료 뒤 AI5시리즈를 실제 엔진으로 계산하고 주간 보상을 한 번 지급한다',async()=>{
  let world=national(true);const series=nextDomesticFixture(world),old=officialTotals(world,world.playerClubId);
  beginOfficialMatch(world,series.id);world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:2}});
  beginOfficialMatch(world,series.id);const before=structuredClone(world);let yields=0;
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1},yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.equal(before.nationalSeason.fixtures.find(match=>match.id===series.id).result,null);
  assert.equal(world.day,246);assert.equal(world.nationalSeason.fixtures.filter(match=>match.week===1 && match.result).length,6);
  const totals=officialTotals(world,world.playerClubId);assert.equal(totals.matches,old.matches+1);assert.equal(totals.rewards,old.rewards+500);trip(world);
});
