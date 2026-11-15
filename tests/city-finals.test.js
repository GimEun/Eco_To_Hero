import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { trip,completedCity,readyPlayoff } from './city-fixture.js';
import { cityStandings, selectCityMap, nextCityFixture } from '../src/game/city-season.js';
import { cityProgress, nextCityTiebreak, ensureCityTiebreakRound, recordCityTiebreak, CITY_PLAYOFF_WEEK_ID } from '../src/game/city-finals.js';
import { playoffFinalRanks } from '../src/game/pc-playoffs.js';
import { officialTotals } from '../src/game/official-records.js';
import { beginOfficialMatch,finishOfficialWeek,advanceAiPlayoffs,advanceAiTiebreaks,createOfficialPractice } from '../src/game/official-match.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { advanceWeek } from '../src/game/calendar.js';
import { createSave,restoreWorld } from '../src/storage/save-data.js';
import { signSponsor } from '../src/game/sponsors.js';
import { renewContract } from '../src/game/contracts.js';
import { seasonScreen } from '../src/ui/season-screen.js';

async function myMap(world,won=true,remaining=3) {
  const series=nextCityFixture(world);if(!series.mapPicks)selectCityMap(world,series.id,series.maps[0].mapId);
  beginOfficialMatch(world,series.id);trip(world);
  return finishOfficialWeek(world,{score:{home:won?13:6,away:won?6:13,pausesRemaining:remaining}});
}

test('시 리그 정규 동률은 재동률 팀만 다시 BO1으로 정하며 정규 전적/날짜/자금은 보존한다',()=>{
  const world=completedCity(0,true),original=structuredClone(world),regular=cityStandings(world.citySeason).map(row=>[row.clubId,row.wins,row.losses]);
  assert.equal(cityProgress(world.citySeason).phase,'tiebreak');assert.equal(advanceWeek(world,{official:true}).tiebreakPending,true);
  ensureCityTiebreakRound(world.citySeason);const first=world.citySeason.tiebreaks[0],ids=first.clubIds;
  for(const fixture of first.fixtures){const a=ids.indexOf(fixture.homeClubId),b=ids.indexOf(fixture.awayClubId),won=(a+1)%3===b;
    recordCityTiebreak(world.citySeason,fixture.id,{homeScore:won?13:6,awayScore:won?6:13});}
  assert.equal(cityProgress(world.citySeason).next.clubIds.length,3);ensureCityTiebreakRound(world.citySeason);
  for(const fixture of world.citySeason.tiebreaks[1].fixtures){const won=ids.indexOf(fixture.homeClubId)<ids.indexOf(fixture.awayClubId);
    recordCityTiebreak(world.citySeason,fixture.id,{homeScore:won?13:6,awayScore:won?6:13});}
  assert.equal(cityProgress(world.citySeason).complete,true);assert.equal(world.day,original.day);assert.equal(world.clubs[0].balance,original.clubs[0].balance);
  for(const row of cityStandings(world.citySeason)){const old=regular.find(item=>item[0]===row.clubId);assert.deepEqual([row.wins,row.losses],old.slice(1));}
  assert.deepEqual(cityStandings(world.citySeason).map(row=>row.rank),[1,2,3,4,5,6,7,8,9,10]);trip(world);
});

test('시 리그 내 BO1 결정전은 0:13 기권·저장 재진입을 지원하고 추가 날짜·급여가 없다',async()=>{
  let world=completedCity(0,true);while(officialWeekStatus(world).phase==='tiebreak-ai') {
    // 첫 내 경기 전 AI만 정해 두어 기권 결과를 따로 검사한다.
    const fixture=nextCityTiebreak(world.citySeason);recordCityTiebreak(world.citySeason,fixture.id,{homeScore:13,awayScore:6});
  }
  const fixture=nextCityFixture(world),before=structuredClone(world);beginOfficialMatch(world,fixture.id);trip(world);
  assert.equal(createOfficialPractice(world,fixture).tiebreak,true);
  world=await finishOfficialWeek(restoreWorld(createSave(world)),{forfeit:true});
  const result=world.citySeason.tiebreaks.flatMap(round=>round.fixtures).find(item=>item.id===fixture.id).result;
  assert.equal(result.forfeit,true);assert.equal(Math.max(result.homeScore,result.awayScore),13);
  assert.equal(world.day,before.day);assert.deepEqual(world.clubs[0].finance,before.clubs[0].finance);assert.equal(world.clubs[0].balance,before.clubs[0].balance);trip(world);
});

test('내 BO1 정상 승리는 상금 없이 출전·시 리그 스폰서만 한 번 반영한다',async()=>{
  let world=completedCity(0,true);signSponsor(world,'wins',1);
  while(officialWeekStatus(world).phase==='tiebreak-ai') {
    const fixture=nextCityTiebreak(world.citySeason);recordCityTiebreak(world.citySeason,fixture.id,{homeScore:13,awayScore:6});
  }
  const fixture=nextCityFixture(world),before=officialTotals(world,world.playerClubId),cash=world.clubs[0].balance;
  beginOfficialMatch(world,fixture.id);trip(world);
  world=await finishOfficialWeek(world,{score:{home:13,away:7}});
  const totals=officialTotals(world,world.playerClubId);
  assert.equal(world.day,148);assert.equal(world.clubs[0].balance,cash);assert.equal(totals.wins,before.wins+1);
  assert.equal(totals.rewards,before.rewards);assert.equal(world.clubs[0].finance.sponsor.progress,1);
  for(const id of world.clubs[0].lineupIds)assert.equal(totals.players[id].appearances,before.players[id].appearances+1);trip(world);
});

test('AI끼리 동률인 그룹도 실제 BO1 엔진으로 계산하며 원본·날짜·급여를 보존한다',async()=>{
  const world=completedCity(9,true),before=structuredClone(world);let yields=0;
  assert.equal(officialWeekStatus(world).phase,'tiebreak-ai');
  const result=await advanceAiTiebreaks(world,{yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.deepEqual(world,before);assert.equal(result.day,148);
  assert.deepEqual(result.clubs[0].finance,world.clubs[0].finance);assert.equal(result.clubs[0].balance,world.clubs[0].balance);
  assert.ok(result.citySeason.tiebreaks[0].fixtures.every(match=>match.result));trip(result);
});

test('22주 준비 뒤 시 리그 상위 4팀 고정 대진·맵 선택·시리즈 퍼즈를 저장한다',async()=>{
  let world=readyPlayoff();assert.equal(world.day,154);assert.equal(world.citySeason.weekSchedule.fixtureId,CITY_PLAYOFF_WEEK_ID);
  assert.equal(world.citySeason.playoffs.series.length,2);
  const ranks=cityStandings(world.citySeason).slice(0,4).map(row=>row.clubId);
  assert.deepEqual(new Set(world.citySeason.playoffs.series.flatMap(series=>[series.homeClubId,series.awayClubId])),new Set(ranks));
  assert.equal(officialWeekStatus(world).canPlay,false);
  const cash=world.clubs[0].balance,receipts=world.officialRecords.receipts.length;
  world=await myMap(world,true,1);assert.equal(world.clubs[0].balance,cash);assert.equal(world.officialRecords.receipts.length,receipts);
  assert.equal(createOfficialPractice(world,nextCityFixture(world)).pausesRemaining,1);trip(world);
  await assert.rejects(finishOfficialWeek(world,{score:{home:13,away:6}}));
});

test('준결승·결승 결과와 시리즈당 보상을 반영하고 23주 정산 후 시즌 스폰서를 종료한다',async()=>{
  let world=readyPlayoff(),before=officialTotals(world,world.playerClubId);
  world=await myMap(world);world=await myMap(world);world=await myMap(world);world=await myMap(world);
  assert.equal(world.day,155);assert.equal(world.citySeason.weekSchedule,null);assert.equal(world.citySeason.playoffs.settled,true);
  const ranks=playoffFinalRanks(world.citySeason.playoffs);assert.equal(ranks.length,10);assert.equal(ranks[0],world.playerClubId);
  const totals=officialTotals(world,world.playerClubId);assert.equal(totals.matches-before.matches,2);assert.equal(totals.rewards-before.rewards,1000);
  assert.equal(world.clubs[0].finance.sponsor.kind,'basic');assert.equal(world.clubs[0].finance.settlements.at(-1).sponsorContract.progress,2);trip(world);
  assert.equal(officialWeekStatus(world).phase,'finished');assert.equal(signSponsor(world,'wins').ok,false);
});

test('결승 도중 기권은 이미 이긴 맵을 유지하고 상금·출전 실적을 중복 지급하지 않는다',async()=>{
  let world=readyPlayoff();world=await myMap(world);world=await myMap(world);world=await myMap(world);
  const series=nextCityFixture(world),before=officialTotals(world,world.playerClubId);
  world=await finishOfficialWeek(restoreWorld(createSave(world)),{forfeit:true});
  const final=world.citySeason.playoffs.series[2];assert.equal(final.id,series.id);assert.equal(final.scores.length,3);assert.equal(final.result.forfeit,true);
  const totals=officialTotals(world,world.playerClubId);assert.equal(totals.matches,before.matches+1);assert.equal(totals.rewards,before.rewards);assert.deepEqual(totals.players,before.players);trip(world);
});

test('최종 정산이 계약 만료로 막히면 재계약 후 하루만 처리하고 파산 경계도 저장한다',async()=>{
  let world=readyPlayoff();world=await myMap(world);world=await myMap(world);world=await myMap(world);
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  world=await myMap(world);assert.equal(world.day,154);assert.equal(world.citySeason.weekSchedule.phase,'settling');trip(world);
  const receipts=structuredClone(world.officialRecords.receipts);
  for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  world.clubs[0].balance=0;for(const contract of Object.values(world.clubs[0].contracts))contract.monthlySalary=100000;
  assert.equal(advanceWeek(world,{official:true}).bankrupt,true);assert.equal(world.citySeason.playoffs.settled,true);
  assert.equal(world.day,155);assert.equal(world.clubs[0].finance.sponsor.kind,'basic');assert.deepEqual(world.officialRecords.receipts,receipts);trip(world);
});

test('v32 기존 결과는 유지하고 미정 필드를 보충하며 손상 결정전/대진/퍼즈/주간 상태는 거부한다',()=>{
  const world=completedCity(),old=createSave(world);old.schemaVersion=32;delete old.world.citySeason.tiebreaks;delete old.world.citySeason.playoffs;
  assert.deepEqual(restoreWorld(old),{...world,aiGrowth:createAiGrowth(world.day),counseling:createCounseling(world)});
  const ready=readyPlayoff();
  for(const mutate of [w=>{w.citySeason.playoffs.rankedClubs.reverse();},w=>{w.citySeason.playoffs.series[0].maps.reverse();},
    w=>{w.citySeason.playoffs.settled=true;},w=>{w.citySeason.tiebreaks=[{id:'fake'}];},
    w=>{w.citySeason.weekSchedule.startedDay--;},w=>{w.citySeason.playoffs.series[0].pausesRemaining=4;}
  ]){const copy=structuredClone(ready);mutate(copy);assert.throws(()=>createSave(copy));}
});

test('시 리그 화면은 결정전·플레이오프·최종 10위와 정산 상태를 표시한다',async t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  let world=readyPlayoff(),before=structuredClone(world);
  assert.match(seasonScreen(world).innerHTML,/상위 4팀 플레이오프 대진/);assert.deepEqual(world,before);
  world=await myMap(world);world=await myMap(world);world=await myMap(world);world=await myMap(world);
  const html=seasonScreen(world).innerHTML;assert.match(html,/시 리그 최종 순위/);assert.match(html,/10위/);assert.match(html,/스폰서 계약 종료 완료/);
});

test('내 팀 미진출이면 실제 엔진 AI BO3 3시리즈를 계산하고 같은 주 정산만 마친다',async()=>{
  const world=completedCity(9);advanceWeek(world,{official:true});const original=structuredClone(world);let yields=0;
  assert.equal(officialWeekStatus(world).phase,'playoff-ai');
  const result=await advanceAiPlayoffs(world,{yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.deepEqual(world,original);assert.equal(result.day,155);assert.equal(result.citySeason.playoffs.settled,true);
  assert.equal(playoffFinalRanks(result.citySeason.playoffs)[9],world.playerClubId);trip(result);
});
