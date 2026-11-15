import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { finishedCity,completedCity,trip } from './city-fixture.js';
import { domesticQualification, domesticEntryIssue, enterDomesticSeason, nextDomesticFixture, selectDomesticMap, domesticStandings } from '../src/game/domestic-season.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { advanceWeek } from '../src/game/calendar.js';
import { officialTotals } from '../src/game/official-records.js';
import { beginOfficialMatch,finishOfficialWeek,createOfficialPractice } from '../src/game/official-match.js';
import { signSponsor } from '../src/game/sponsors.js';
import { renewContract } from '../src/game/contracts.js';
import { createSave,restoreWorld,MAX_BACKUP_BYTES } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { seasonScreen } from '../src/ui/season-screen.js';
import { selectWeeklyActions } from '../src/game/training.js';
import { beginTeamTraining,settleTeamTraining } from '../src/game/team-training.js';
import { createPractice,advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';

import {province,completeAi} from './province-fixture.js';

test('시 리그 최종 1·2위만 도 진출하며 정규 순위/미완료 정산만으로 진출하지 않는다',()=>{
  for(const place of [1,2]) {
    const world=finishedCity(place),before=structuredClone(world),qualification=domesticQualification(world,'province');
    assert.equal(qualification.rank,place);assert.equal(qualification.qualified,true);assert.equal(domesticEntryIssue(world,'province'),null);
    enterDomesticSeason(world,'province');assert.deepEqual(world.citySeason,before.citySeason);assert.deepEqual(world.pcSeason,before.pcSeason);
    assert.equal(world.day,before.day);assert.equal(world.clubs[0].balance,before.clubs[0].balance);trip(world);
  }
  assert.throws(()=>enterDomesticSeason(completedCity(),'province'));
  const out=finishedCity(10);assert.equal(domesticQualification(out,'province').qualified,false);assert.throws(()=>enterDomesticSeason(out,'province'));
  const pending=finishedCity();pending.citySeason.playoffs.settled=false;assert.throws(()=>enterDomesticSeason(pending,'province'));
});

test('12팀·66개 고유 대진·주당 6매치·팀당 BO3 11매치를 고정 추첨하며 v33 날짜/기록을 보존한다',()=>{
  const world=finishedCity(),before=structuredClone(world),old=createSave(world);old.schemaVersion=33;delete old.world.provinceSeason;
  assert.deepEqual(restoreWorld(old),{...world,aiGrowth:createAiGrowth(world.day),counseling:createCounseling(world)});enterDomesticSeason(world,'province');
  const season=world.provinceSeason,again=structuredClone(before);enterDomesticSeason(again,'province');assert.deepEqual(season,again.provinceSeason);
  assert.equal(season.clubIds.length,12);assert.equal(season.fixtures.length,66);
  assert.equal(season.clubIds.filter(id=>world.clubs.find(club=>club.id===id).leagueId==='province').length,10);
  assert.equal(new Set(season.fixtures.map(match=>[match.homeClubId,match.awayClubId].sort().join(':'))).size,66);
  for(const id of season.clubIds)assert.equal(season.fixtures.filter(match=>[match.homeClubId,match.awayClubId].includes(id)).length,11);
  for(let week=1;week<=11;week++)assert.equal(new Set(season.fixtures.filter(match=>match.week===week).flatMap(match=>[match.homeClubId,match.awayClubId])).size,12);
  assert.equal(getClubView(world).leagueId,'province');assert.equal(getClubView(world).league,'도 리그');assert.equal(world.day,155);
  assert.deepEqual(world.officialRecords,before.officialRecords);trip(world);assert.throws(()=>enterDomesticSeason(world,'province'));
});

test('도 주간 준비·방송·맵 선택·3맵 순서·시작 주전/퍼즈/완료 맵 저장을 공통 처리로 이어간다',async()=>{
  let world=province();assert.equal(signSponsor(world,'broadcast').ok,true);
  assert.equal(selectWeeklyActions(world,world.clubs[0].playerIds.map(playerId=>({playerId,action:'broadcast'}))).ok,true);
  const series=nextDomesticFixture(world);assert.throws(()=>beginOfficialMatch(world,series.id));
  assert.throws(()=>selectDomesticMap(world,series.id,series.maps[0].mapId));
  assert.equal(advanceWeek(world,{official:true}).advancedDays,6);assert.equal(world.day,161);assert.equal(world.clubs[0].finance.sponsor.broadcastCompleted,true);
  assert.equal(officialWeekStatus(world).canPlay,false);selectDomesticMap(world,series.id,series.maps[1].mapId);
  assert.equal(new Set(series.maps.map(map=>map.mapId)).size,3);assert.equal(officialWeekStatus(world).canPlay,true);
  beginOfficialMatch(world,series.id);assert.throws(()=>selectDomesticMap(world,series.id,series.maps[0].mapId));
  const before=structuredClone(world),cash=world.clubs[0].balance,receiptCount=world.officialRecords.receipts.length;
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1}});
  assert.deepEqual(before.provinceSeason.fixtures.find(match=>match.id===series.id).scores,[]);
  assert.equal(world.clubs[0].balance,cash);assert.equal(world.officialRecords.receipts.length,receiptCount);trip(world);
  assert.equal(createOfficialPractice(world,nextDomesticFixture(world)).pausesRemaining,1);assert.equal(createOfficialPractice(world,nextDomesticFixture(world)).leagueLabel,'도 리그');
  await assert.rejects(finishOfficialWeek(world,{score:{home:13,away:6}}));
  beginOfficialMatch(world,series.id);assert.deepEqual(world.provinceSeason.fixtures.find(match=>match.id===series.id).lineups,series.lineups);trip(world);
});

test('도 리그 팀 훈련이 남으면 맵 선택·공식 시작을 막고 완료 후 같은 주에 연다',()=>{
  const world=province();assert.equal(beginTeamTraining(world,{official:true}).ok,true);assert.equal(officialWeekStatus(world).phase,'training');
  const fixture=nextDomesticFixture(world);assert.throws(()=>selectDomesticMap(world,fixture.id,fixture.maps[0].mapId));
  const other=world.clubs.find(club=>club.id!==world.playerClubId),state=createPractice(RELAY_MAP,getClubView(world),getClubView(world,other.id),{seed:42});
  advancePractice(state,RELAY_MAP,160000);assert.equal(settleTeamTraining(world,state,161).ok,true);assert.equal(officialWeekStatus(world).phase,'ready');trip(world);
});

test('11주 종료 후 동률이 없으면 기록·도 스폰서 실적을 보존하고 플레이오프 준비로 이어진다',()=>{
  const world=province(),pc=structuredClone(world.pcSeason),city=structuredClone(world.citySeason),oldTotals=officialTotals(world,world.playerClubId);
  assert.equal(signSponsor(world,'wins',1).ok,true);assert.equal(world.clubs[0].finance.sponsor.leagueId,'province');
  for(let week=1;week<=11;week++) {
    assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
    completeAi(world,week);world.provinceSeason.weekSchedule.phase='settling';assert.equal(advanceWeek(world).advancedDays,1);trip(world);
    assert.equal(world.day,155+week*7);
  }
  assert.equal(world.day,232);assert.equal(Math.floor((world.day-1)/7)+1,34);assert.equal(officialWeekStatus(world).phase,'playoff-unscheduled');assert.ok(domesticStandings(world.provinceSeason).every(row=>!row.tied));
  assert.equal(nextDomesticFixture(world),null);assert.equal(world.provinceSeason.playoffs,null);assert.deepEqual(world.provinceSeason.tiebreaks,[]);
  assert.equal(world.clubs[0].finance.sponsor.progress,11);assert.equal(world.clubs[0].finance.settlements.at(-1).income,4500);
  assert.equal(officialTotals(world,world.playerClubId).matches,oldTotals.matches+11);assert.equal(domesticStandings(world.provinceSeason).reduce((n,row)=>n+row.played,0),132);
  assert.deepEqual(world.pcSeason,pc);assert.deepEqual(world.citySeason,city);
  const backupBytes=new TextEncoder().encode(JSON.stringify(createSave(world),null,2)).byteLength;
  assert.ok(backupBytes<MAX_BACKUP_BYTES,`도 정규 종료 JSON 백업 ${backupBytes}바이트`);
});

test('도 시리즈 기권은 승리 맵을 보존하고 상금/출전/스폰서를 제외하며 재계약 후 정산만 재개한다',async()=>{
  let world=province();signSponsor(world,'appearances',1);advanceWeek(world,{official:true});
  const series=nextDomesticFixture(world);selectDomesticMap(world,series.id,series.maps[0].mapId);beginOfficialMatch(world,series.id);
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1}});completeAi(world,1,series.id);
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  const oldTotals=officialTotals(world,world.playerClubId);world=await finishOfficialWeek(restoreWorld(createSave(world)),{forfeit:true});
  const done=world.provinceSeason.fixtures.find(match=>match.id===series.id);assert.equal(done.scores.length,3);assert.equal(done.result.forfeit,true);
  assert.equal(world.day,161);assert.equal(officialWeekStatus(world).phase,'settling');assert.equal(world.clubs[0].finance.sponsor.progress,0);trip(world);
  assert.deepEqual(officialTotals(world,world.playerClubId).players,oldTotals.players);assert.equal(officialTotals(world,world.playerClubId).rewards,oldTotals.rewards);
  const receipts=structuredClone(world.officialRecords.receipts);for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  assert.equal(advanceWeek(world,{official:true}).advancedDays,1);assert.equal(world.day,162);assert.deepEqual(world.officialRecords.receipts,receipts);trip(world);
  await assert.rejects(finishOfficialWeek(world,{forfeit:true}));
});

test('손상된 도 참가/대진/미래 경기/퍼즈/명단/시작 ID와 미구현 결승 상태를 거부한다',()=>{
  const world=province(true),series=nextDomesticFixture(world);beginOfficialMatch(world,series.id);
  for(const mutate of [w=>w.provinceSeason.clubIds.reverse(),w=>w.provinceSeason.fixtures[0].maps.reverse(),
    w=>{w.provinceSeason.fixtures.find(match=>match.id===series.id).pausesRemaining=4;},
    w=>{w.provinceSeason.fixtures.find(match=>match.id===series.id).lineups.home[0]='missing';},
    w=>{w.provinceSeason.activeMatchId=null;},w=>{w.provinceSeason.weekSchedule=null;},w=>{w.officialRecords.active=null;},
    w=>{w.provinceSeason.playoffs={series:[]};},w=>{w.provinceSeason.tiebreaks=[{id:'fake'}];},
    w=>{w.provinceSeason.fixtures.find(match=>match.week===2).mapPicks={home:'relay',away:'warehouse'};},
  ]){const copy=structuredClone(world);mutate(copy);assert.throws(()=>createSave(copy));}
});

test('시 최종 결과에 도 참가가 나오고 도 화면은 12팀/11주·맵 선택·PC방/시 기록을 표시한다',t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  const city=finishedCity(),cityHtml=seasonScreen(city).innerHTML;
  assert.match(cityHtml,/도 리그 진출 확정/);assert.match(cityHtml,/enter-province/);assert.doesNotMatch(cityHtml,/\$\{/);
  const world=province(true),before=structuredClone(world),html=seasonScreen(world).innerHTML;
  assert.match(html,/도 리그 정규 시즌/);assert.match(html,/12팀/);assert.match(html,/정규 11주 일정/);assert.match(html,/pick-domestic-map/);
  assert.match(html,/시 리그 최종 결과/);assert.match(html,/PC방 최종 결과/);assert.doesNotMatch(html,/\$\{/);assert.deepEqual(world,before);
});

test('내 도 BO3 종료 뒤 AI 5시리즈를 실제 엔진으로 계산하고 보상/주간 정산을 한 번 처리한다',async()=>{
  let world=province(true);const series=nextDomesticFixture(world),old=officialTotals(world,world.playerClubId);
  beginOfficialMatch(world,series.id);world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:2}});
  beginOfficialMatch(world,series.id);const before=structuredClone(world);let yields=0;
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1},yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.equal(before.provinceSeason.fixtures.find(match=>match.id===series.id).result,null);
  assert.equal(world.day,162);assert.equal(world.provinceSeason.activeMatchId,null);
  assert.equal(world.provinceSeason.fixtures.filter(match=>match.week===1 && match.result).length,6);
  const totals=officialTotals(world,world.playerClubId);assert.equal(totals.matches,old.matches+1);assert.equal(totals.rewards,old.rewards+500);trip(world);
});
