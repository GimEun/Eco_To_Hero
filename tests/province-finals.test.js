import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { completedProvince,readyFinals } from './province-fixture.js';
import { trip } from './city-fixture.js';
import { domesticStandings, selectDomesticMap, nextDomesticFixture } from '../src/game/domestic-season.js';
import { domesticProgress, ensureDomesticTiebreakRound, nextDomesticTiebreak, recordDomesticTiebreak } from '../src/game/domestic-finals.js';
import { playoffFinalRanks } from '../src/game/pc-playoffs.js';
import { officialTotals } from '../src/game/official-records.js';
import { beginOfficialMatch,finishOfficialWeek,advanceAiPlayoffs,advanceAiTiebreaks,createOfficialPractice } from '../src/game/official-match.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { advanceWeek } from '../src/game/calendar.js';
import { createSave,restoreWorld,MAX_BACKUP_BYTES } from '../src/storage/save-data.js';
import { signSponsor } from '../src/game/sponsors.js';
import { renewContract } from '../src/game/contracts.js';
import { seasonScreen } from '../src/ui/season-screen.js';
import { settleTeamTraining } from '../src/game/team-training.js';
import { createPractice,advancePractice } from '../src/simulation/practice.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';

async function myMap(world,remaining=3) {
  const series=nextDomesticFixture(world);if(!series.mapPicks)selectDomesticMap(world,series.id,series.maps[0].mapId);
  beginOfficialMatch(world,series.id);trip(world);
  return finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:remaining}});
}

test('도 BO1은 재동률 팀만 다시 경기하고 1~12위 확정 시 정규 전적·날짜·자금을 보존한다',()=>{
  const world=completedProvince(0,true),before=structuredClone(world),season=world.provinceSeason;
  assert.equal(domesticProgress(season).phase,'tiebreak');assert.equal(advanceWeek(world,{official:true}).tiebreakPending,true);
  ensureDomesticTiebreakRound(season);const ids=season.tiebreaks[0].clubIds;
  for(const fixture of season.tiebreaks[0].fixtures){const won=(ids.indexOf(fixture.homeClubId)+1)%3===ids.indexOf(fixture.awayClubId);
    assert.equal(fixture.kind,'province-tiebreak');recordDomesticTiebreak(season,fixture.id,{homeScore:won?13:6,awayScore:won?6:13});}
  assert.deepEqual(domesticProgress(season).next.clubIds,ids);ensureDomesticTiebreakRound(season);
  for(const fixture of season.tiebreaks[1].fixtures){const won=ids.indexOf(fixture.homeClubId)<ids.indexOf(fixture.awayClubId);recordDomesticTiebreak(season,fixture.id,{homeScore:won?13:6,awayScore:won?6:13});}
  assert.equal(domesticProgress(season).complete,true);assert.deepEqual(domesticStandings(season).map(row=>row.rank),Array.from({length:12},(_,i)=>i+1));
  assert.equal(world.day,before.day);assert.equal(world.clubs[0].balance,before.clubs[0].balance);assert.deepEqual(season.fixtures,before.provinceSeason.fixtures);trip(world);
});

test('도 내 BO1 정상 승리·기권·저장 재진입은 추가 날짜/급여 없이 전적과 스폰서 예외를 지킨다',async()=>{
  for(const forfeit of [false,true]) {
    let world=completedProvince(0,true);signSponsor(world,'wins',1);
    while(officialWeekStatus(world).phase==='tiebreak-ai') {const next=nextDomesticTiebreak(world.provinceSeason);recordDomesticTiebreak(world.provinceSeason,next.id,{homeScore:13,awayScore:6});}
    const fixture=nextDomesticFixture(world),before=officialTotals(world,world.playerClubId),cash=world.clubs[0].balance;
    beginOfficialMatch(world,fixture.id);trip(world);assert.equal(createOfficialPractice(world,fixture).leagueLabel,'도 리그');
    world=await finishOfficialWeek(restoreWorld(createSave(world)),forfeit?{forfeit:true}:{score:{home:13,away:7}});
    const totals=officialTotals(world,world.playerClubId);assert.equal(world.day,232);assert.equal(world.clubs[0].balance,cash);assert.equal(totals.rewards,before.rewards);
    assert.equal(world.clubs[0].finance.sponsor.progress,forfeit?0:1);assert.equal(totals.matches,before.matches+1);
    for(const id of world.clubs[0].lineupIds)assert.equal(totals.players[id].appearances,before.players[id].appearances+(forfeit?0:1));trip(world);
  }
});

test('도 AI 동률 그룹을 실제 BO1 엔진으로 계산하고 원본과 날짜·재정을 보존한다',async()=>{
  const world=completedProvince(11,true),before=structuredClone(world);let yields=0;
  assert.equal(officialWeekStatus(world).phase,'tiebreak-ai');
  const result=await advanceAiTiebreaks(world,{yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.deepEqual(world,before);assert.equal(result.day,232);assert.deepEqual(result.clubs[0].finance,world.clubs[0].finance);
  assert.ok(result.provinceSeason.tiebreaks[0].fixtures.every(match=>match.result));trip(result);
});

test('34주 팀 훈련을 마친 뒤 고정 상위4팀 BO3 대진과 맵 선택을 열고 퍼즈를 유지한다',async()=>{
  const training=readyFinals(true);assert.equal(training.day,238);assert.equal(officialWeekStatus(training).phase,'training');trip(training);
  const other=training.clubs.find(club=>club.id!==training.playerClubId),state=createPractice(RELAY_MAP,getClubView(training),getClubView(training,other.id),{seed:42});
  advancePractice(state,RELAY_MAP,160000);assert.equal(settleTeamTraining(training,state,238).ok,true);trip(training);
  let world=readyFinals();assert.equal(world.provinceSeason.weekSchedule.fixtureId,'province-1-playoffs');
  assert.deepEqual(new Set(world.provinceSeason.playoffs.series.flatMap(series=>[series.homeClubId,series.awayClubId])),new Set(domesticStandings(world.provinceSeason).slice(0,4).map(row=>row.clubId)));
  const before=officialTotals(world,world.playerClubId);world=await myMap(world,1);
  assert.equal(world.day,238);assert.equal(createOfficialPractice(world,nextDomesticFixture(world)).pausesRemaining,1);
  assert.deepEqual(officialTotals(world,world.playerClubId),before);trip(world);
  await assert.rejects(finishOfficialWeek(world,{score:{home:13,away:6}}));
});

test('도 준결승/결승 보상·출전은 시리즈당1회이며 최종12위·35주 정산 뒤 스폰서를 종료한다',async()=>{
  let world=readyFinals(),old=officialTotals(world,world.playerClubId),pc=structuredClone(world.pcSeason),city=structuredClone(world.citySeason);
  world=await myMap(world);world=await myMap(world);world=await myMap(world);world=await myMap(world);
  assert.equal(world.day,239);assert.equal(Math.floor((world.day-1)/7)+1,35);assert.equal(world.provinceSeason.playoffs.settled,true);
  assert.equal(world.provinceSeason.weekSchedule,null);assert.equal(world.clubs[0].finance.sponsor.kind,'basic');
  assert.equal(world.clubs[0].finance.settlements.at(-1).sponsorContract.progress,2);
  const ranks=playoffFinalRanks(world.provinceSeason.playoffs);assert.equal(ranks.length,12);assert.equal(ranks[0],world.playerClubId);
  const totals=officialTotals(world,world.playerClubId);assert.equal(totals.matches,old.matches+2);assert.equal(totals.rewards,old.rewards+1000);
  for(const id of world.clubs[0].lineupIds)assert.equal(totals.players[id].appearances,old.players[id].appearances+2);
  assert.equal(officialWeekStatus(world).phase,'finished');assert.equal(signSponsor(world,'wins').ok,false);
  assert.deepEqual(world.pcSeason,pc);assert.deepEqual(world.citySeason,city);trip(world);
  assert.ok(new TextEncoder().encode(JSON.stringify(createSave(world),null,2)).byteLength<MAX_BACKUP_BYTES);
  const semifinalLosers=world.provinceSeason.playoffs.series.slice(0,2).map(series=>series.result.homeScore>series.result.awayScore?series.awayClubId:series.homeClubId);
  semifinalLosers.sort((a,b)=>world.provinceSeason.playoffs.rankedClubs.indexOf(a)-world.provinceSeason.playoffs.rankedClubs.indexOf(b));
  assert.deepEqual(ranks.slice(2,4),semifinalLosers);
});

test('도 결승 도중 기권은 기존 승리 맵을 보존하고 상금·출전·스폰서를 추가하지 않는다',async()=>{
  let world=readyFinals();world=await myMap(world);world=await myMap(world);world=await myMap(world);
  const old=officialTotals(world,world.playerClubId);world=await finishOfficialWeek(restoreWorld(createSave(world)),{forfeit:true});
  const final=world.provinceSeason.playoffs.series[2];assert.equal(final.result.forfeit,true);assert.equal(final.scores.length,3);assert.ok(final.scores.slice(1).every(score=>score.forfeit));
  const totals=officialTotals(world,world.playerClubId);assert.equal(totals.rewards,old.rewards);assert.deepEqual(totals.players,old.players);trip(world);
  await assert.rejects(finishOfficialWeek(world,{forfeit:true}));
});

test('도 마지막 정산은 계약 만료 시 결과를 보존하고 재계약 후 파산해도 한 번만 마친다',async()=>{
  let world=readyFinals();world=await myMap(world);world=await myMap(world);world=await myMap(world);
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  world=await myMap(world);assert.equal(world.day,238);assert.equal(officialWeekStatus(world).phase,'settling');trip(world);
  const receipts=structuredClone(world.officialRecords.receipts);for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  world.clubs[0].balance=0;for(const contract of Object.values(world.clubs[0].contracts))contract.monthlySalary=100000;
  assert.equal(advanceWeek(world,{official:true}).bankrupt,true);assert.equal(world.day,239);assert.equal(world.provinceSeason.playoffs.settled,true);
  assert.equal(world.clubs[0].finance.sponsor.kind,'basic');assert.deepEqual(world.officialRecords.receipts,receipts);trip(world);
});

test('v34 정규 결과/날짜는 유지하고 손상된 도 결정전/대진/선택 맵/퍼즈/정산 상태는 거부한다',()=>{
  const world=completedProvince(),old=createSave(world);old.schemaVersion=34;assert.deepEqual(restoreWorld(old),{...world,aiGrowth:createAiGrowth(world.day),counseling:createCounseling(world)});
  const ready=readyFinals();
  for(const mutate of [w=>w.provinceSeason.playoffs.rankedClubs.reverse(),w=>w.provinceSeason.playoffs.series[0].maps.reverse(),
    w=>{w.provinceSeason.playoffs.settled=true;},w=>{w.provinceSeason.tiebreaks=[{id:'fake'}];},
    w=>{w.provinceSeason.weekSchedule.startedDay--;},w=>{w.provinceSeason.playoffs.series[0].pausesRemaining=4;}
  ]){const copy=structuredClone(ready);mutate(copy);assert.throws(()=>createSave(copy));}
});

test('도 화면은 결정전과 최종12위·정산·승인된 전국 진출을 표시한다',async t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  const tie=completedProvince(0,true);ensureDomesticTiebreakRound(tie.provinceSeason);
  assert.match(seasonScreen(tie).innerHTML,/도 리그 순위 결정전 기록/);
  let world=readyFinals(),before=structuredClone(world);assert.match(seasonScreen(world).innerHTML,/상위 4팀 플레이오프 대진/);assert.deepEqual(world,before);
  world=await myMap(world);world=await myMap(world);world=await myMap(world);world=await myMap(world);
  const html=seasonScreen(world).innerHTML;assert.match(html,/도 리그 최종 순위/);assert.match(html,/12위/);assert.match(html,/스폰서 계약 종료 완료/);assert.doesNotMatch(html,/\$\{/);
  assert.match(officialWeekStatus(world).message,/전국 리그 진출 확정/);
});

test('도 미진출 시 실제 AI BO3 3시리즈를 계산하고 같은 주 정산·최종순위만 반영한다',async()=>{
  const world=completedProvince(11);advanceWeek(world,{official:true});const before=structuredClone(world);let yields=0;
  assert.equal(officialWeekStatus(world).phase,'playoff-ai');
  const result=await advanceAiPlayoffs(world,{yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.deepEqual(world,before);assert.equal(result.day,239);assert.equal(result.provinceSeason.playoffs.settled,true);
  assert.equal(playoffFinalRanks(result.provinceSeason.playoffs)[11],world.playerClubId);trip(result);
});
