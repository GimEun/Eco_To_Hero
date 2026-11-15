import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { recordPcMatch, pcSeasonStandings, nextOfficialFixture, findOfficialFixture } from '../src/game/pc-season.js';
import { createPcPlayoffs, nextPlayoffSeries, recordPlayoffMap, playoffFinalRanks, pcQualification, PLAYOFF_WEEK_ID } from '../src/game/pc-playoffs.js';
import { advanceWeek } from '../src/game/calendar.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { beginOfficialMatch, finishOfficialWeek, createOfficialPractice, advanceAiPlayoffs } from '../src/game/official-match.js';
import { officialLineups, applyOfficialReceipt, officialTotals } from '../src/game/official-records.js';
import { signSponsor } from '../src/game/sponsors.js';
import { renewContract } from '../src/game/contracts.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { seasonScreen } from '../src/ui/season-screen.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';

function fixture(rank = 0) {
  const world = createWorld(createClub('Playoffs').club, 42);
  world.seasonCalendar = { mode: 'legacy', phase: 'season' };
  const ids = world.pcSeason.clubIds.filter(id => id !== world.playerClubId); ids.splice(rank, 0, world.playerClubId);
  for (const match of world.pcSeason.fixtures) {
    const win = ids.indexOf(match.homeClubId) < ids.indexOf(match.awayClubId);
    assert.equal(recordPcMatch(world.pcSeason, match.id, { homeScore: win ? 13 : 5, awayScore: win ? 5 : 13 }).ok, true);
  }
  return world;
}
const trip = world => assert.deepEqual(restoreWorld(createSave(world)), world);
function finishedFixture(rank = 0) {
  const world=fixture(rank); advanceWeek(world,{official:true});
  while(nextPlayoffSeries(world.pcSeason.playoffs)) {
    const series=nextPlayoffSeries(world.pcSeason.playoffs);
    series.lineups=officialLineups(world,series);
    const homeWins=series.awayClubId!==world.playerClubId;
    for(let i=0;i<2;i++)recordPlayoffMap(world.pcSeason.playoffs,series.id,
      {homeScore:homeWins?13:6,awayScore:homeWins?6:13},{seed:world.seed});
    applyOfficialReceipt(world,series,series.lineups);
  }
  world.pcSeason.weekSchedule.phase='settling';
  return world;
}
function readyMine() {
  const world = fixture(); signSponsor(world, 'wins', 1);
  assert.equal(advanceWeek(world, { official: true }).advancedDays, 6);
  // Deterministic AI semifinal outcome; engine integration is exercised separately.
  const series = nextPlayoffSeries(world.pcSeason.playoffs);
  assert.ok(![series.homeClubId, series.awayClubId].includes(world.playerClubId));
  series.lineups = officialLineups(world, series);
  for (let i=0; i<2; i++) recordPlayoffMap(world.pcSeason.playoffs, series.id, { homeScore:13, awayScore:6 }, { seed:world.seed });
  applyOfficialReceipt(world, series, series.lineups);
  trip(world); return world;
}
async function mapResult(world, home = 13, away = 6, pausesRemaining = 3) {
  const match = nextOfficialFixture(world); assert.ok(match);
  beginOfficialMatch(world, match.id); trip(world);
  return finishOfficialWeek(world, { score: { home, away, pausesRemaining } });
}

test('상위 4팀 무작위 대진·중복 없는 3맵·진영은 고정되며 상태 조회는 원본을 바꾸지 않는다', () => {
  const world = fixture(), ranks = pcSeasonStandings(world.pcSeason).map(row=>row.clubId), original=structuredClone(world);
  const first = createPcPlayoffs(world.seed, ranks), again=createPcPlayoffs(world.seed,ranks);
  assert.deepEqual(first,again); assert.deepEqual(world,original);
  assert.deepEqual(new Set(first.series.flatMap(series=>[series.homeClubId,series.awayClubId])),new Set(ranks.slice(0,4)));
  for(const series of first.series) {
    assert.equal(new Set(series.maps.map(map=>map.mapId)).size,3); assert.equal(series.maps.length,3);
    assert.ok(series.maps.every(map=>['home','away'].includes(map.attackTeam)));
  }
});

test('정규 순위·준결승·결승 한 맵만으로 시 리그 진출을 미리 확정하지 않는다', () => {
  const world=fixture(); assert.equal(pcQualification(null,world.playerClubId),null);
  advanceWeek(world,{official:true});
  for(let i=0;i<2;i++) {
    const series=nextPlayoffSeries(world.pcSeason.playoffs);series.lineups=officialLineups(world,series);
    recordPlayoffMap(world.pcSeason.playoffs,series.id,{homeScore:13,awayScore:6},{seed:world.seed});
    assert.equal(pcQualification(world.pcSeason.playoffs,world.playerClubId),null);
    recordPlayoffMap(world.pcSeason.playoffs,series.id,{homeScore:13,awayScore:6},{seed:world.seed});
  }
  const final=nextPlayoffSeries(world.pcSeason.playoffs);final.lineups=officialLineups(world,final);
  recordPlayoffMap(world.pcSeason.playoffs,final.id,{homeScore:13,awayScore:6},{seed:world.seed});
  for(const id of world.pcSeason.clubIds)assert.equal(pcQualification(world.pcSeason.playoffs,id),null);
});

test('최종 1·2위만 시 리그 진출, 3~8위 탈락이며 저장·정산 후 같은 결과를 읽는다', () => {
  const world=finishedFixture(),ranks=playoffFinalRanks(world.pcSeason.playoffs),before=structuredClone(world);
  for(const [index,id] of ranks.entries()) {
    const result=pcQualification(world.pcSeason.playoffs,id);
    assert.deepEqual(result,{rank:index+1,qualified:index<2,nextLeagueId:index<2?'city':null,
      qualifiedClubIds:ranks.slice(0,2),eliminatedClubIds:ranks.slice(2)});
    result.qualifiedClubIds.reverse(); // 반환 배열 편집은 원본 순위에 영향을 주지 않는다.
  }
  assert.equal(pcQualification(world.pcSeason.playoffs,'missing'),null);
  assert.deepEqual(world,before);trip(world);
  const restored=restoreWorld(createSave(world));
  assert.deepEqual(pcQualification(restored.pcSeason.playoffs,world.playerClubId),pcQualification(world.pcSeason.playoffs,world.playerClubId));
  assert.equal(advanceWeek(restored).ok,true);
  assert.deepEqual(pcQualification(restored.pcSeason.playoffs,world.playerClubId),pcQualification(world.pcSeason.playoffs,world.playerClubId));
  assert.equal(officialWeekStatus(restored).canPlay,false);trip(restored);
});

test('시즌 화면은 내 진출/탈락·정산 대기를 구분하고 진출 2팀을 표시하며 조회로 상태를 바꾸지 않는다', t => {
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  for(const [rank,label] of [[0,'시 리그 진출 확정'],[7,'올해 공식 도전 탈락']]) {
    const world=finishedFixture(rank),before=structuredClone(world),status=officialWeekStatus(world);
    assert.equal(status.phase,'settling');assert.match(status.message,new RegExp(label));
    const html=seasonScreen(world).innerHTML;
    assert.match(html,new RegExp(label));assert.match(html,/시 리그 진출 2팀/);
    assert.equal((html.match(/<span class="tag">시 리그 진출<\/span>/g)||[]).length,2);
    assert.match(html,/마지막 하루 정산 대기/);assert.deepEqual(world,before);
    advanceWeek(world);
    assert.equal(officialWeekStatus(world).phase,rank===7?'free':'finished');
    assert.match(officialWeekStatus(world).message,new RegExp(label));
    assert.equal(world.clubs[0].leagueId,'pc'); // 실제 참가 리그 전환은 다음 단계다.
  }
});

test('BO3는 2:0 또는 2:1로 종료하고 3·4위는 준결승 패자의 정규 순위를 따른다', () => {
  const world=fixture(), ranks=pcSeasonStandings(world.pcSeason).map(row=>row.clubId), playoffs=createPcPlayoffs(world.seed,ranks);
  for(let i=0;i<3;i++) {
    const series=nextPlayoffSeries(playoffs); series.lineups=officialLineups(world,series);
    const results=i===2?[[6,13],[13,6],[13,6]]:[[13,6],[13,6]];
    for(const [homeScore,awayScore] of results) recordPlayoffMap(playoffs,series.id,{homeScore,awayScore},{seed:world.seed});
    assert.equal(series.result.homeScore,2);
  }
  const final=playoffs.series[2], finalRanks=playoffFinalRanks(playoffs);
  assert.equal(finalRanks[0],final.homeClubId); assert.equal(finalRanks[1],final.awayClubId);
  assert.ok(ranks.indexOf(finalRanks[2])<ranks.indexOf(finalRanks[3])); assert.deepEqual(finalRanks.slice(4),ranks.slice(4));
});

test('맵 종료/저장/다음 맵에서 명단·퍼즈를 유지하고 시리즈 실적과 상금은 한 번만 지급한다', async () => {
  let world=readyMine(), series=nextOfficialFixture(world), id=series.id;
  const cash=world.clubs[0].balance;
  world=await mapResult(world,13,6,1);
  series=findOfficialFixture(world.pcSeason,id);
  assert.equal(series.scores.length,1); assert.equal(series.result,null); assert.equal(series.pausesRemaining,1);
  assert.equal(world.pcSeason.activeMatchId,id); assert.equal(series.awaitingNextMap,true);
  assert.equal(officialTotals(world,world.playerClubId).matches,0); assert.equal(world.clubs[0].balance,cash);
  assert.equal(world.clubs[0].finance.sponsor.progress,0); trip(world);
  world=restoreWorld(createSave(world));
  assert.equal(createOfficialPractice(world,nextOfficialFixture(world)).pausesRemaining,1);
  await assert.rejects(finishOfficialWeek(world,{score:{home:13,away:6}}));
  world=await mapResult(world,13,6,0);
  assert.equal(officialTotals(world,world.playerClubId).matches,1); assert.equal(world.clubs[0].balance,cash+500);
  assert.equal(world.clubs[0].finance.sponsor.progress,1);
  assert.equal(world.day,7); assert.equal(world.pcSeason.playoffs.series.length,3); trip(world);
  const original=structuredClone(world);
  const done=findOfficialFixture(world.pcSeason,id); assert.equal(applyOfficialReceipt(world,done,done.lineups),false);
  assert.deepEqual(world,original);
});

test('준결승·결승 승리 후 마지막 주 정산을 한 번 마치고 시즌 스폰서를 종료한다', async () => {
  let world=readyMine();
  world=await mapResult(world); world=await mapResult(world);
  world=await mapResult(world); world=await mapResult(world);
  assert.equal(world.day,8); assert.equal(world.pcSeason.weekSchedule,null); assert.equal(world.pcSeason.playoffs.settled,true);
  assert.equal(world.clubs[0].finance.sponsor.kind,'basic');
  const settlement=world.clubs[0].finance.settlements.at(-1);
  assert.equal(settlement.sponsorContract.progress,2); assert.equal(settlement.income,2000);
  const totals=officialTotals(world,world.playerClubId);
  assert.deepEqual([totals.matches,totals.wins,totals.rewards],[2,2,1000]);
  assert.ok(Object.values(totals.players).every(player=>player.appearances===2));
  assert.equal(playoffFinalRanks(world.pcSeason.playoffs)[0],world.playerClubId); trip(world);
});

test('이긴 맵을 보존하는 시리즈 기권은 남은 맵만 0:13, 상금·출전·계약 실적은 제외한다', async () => {
  let world=readyMine(); world=await mapResult(world); world=await mapResult(world);
  world=await mapResult(world); // 1:0 in the final, between maps is still a live series.
  const id=world.pcSeason.activeMatchId, wonBefore=structuredClone(findOfficialFixture(world.pcSeason,id).scores[0]);
  world=await finishOfficialWeek(restoreWorld(createSave(world)),{forfeit:true});
  const final=findOfficialFixture(world.pcSeason,id);
  assert.equal(final.result.forfeit,true); assert.deepEqual(final.scores[0],wonBefore);
  assert.equal(final.scores.length,3); assert.ok(final.scores.slice(1).every(score=>score.forfeit));
  const totals=officialTotals(world,world.playerClubId);
  assert.deepEqual([totals.matches,totals.wins,totals.losses,totals.rewards],[2,1,1,500]);
  assert.ok(Object.values(totals.players).every(player=>player.appearances===1)); trip(world);
});

test('마지막 계약 만료로 정산이 막혀도 확정 시리즈를 보존하고 재계약 후 하루만 정산한다', async () => {
  let world=readyMine(); world=await mapResult(world); world=await mapResult(world);
  world=await mapResult(world);
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  world=await mapResult(world);
  assert.equal(world.day,7); assert.equal(officialWeekStatus(world).phase,'settling');
  assert.equal(world.pcSeason.playoffs.settled,false); assert.equal(world.clubs[0].finance.sponsor.progress,2); trip(world);
  const receipts=structuredClone(world.officialRecords.receipts);
  for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  assert.equal(advanceWeek(world,{official:true}).advancedDays,1);
  assert.equal(world.day,8); assert.equal(world.pcSeason.playoffs.settled,true); assert.equal(world.clubs[0].finance.settlements.length,1);
  assert.deepEqual(world.officialRecords.receipts,receipts); trip(world);
});

test('결승 뒤 마지막 정산으로 파산해도 완료 경기와 정산·계약 종료를 저장할 수 있다', async () => {
  let world=readyMine(); world=await mapResult(world); world=await mapResult(world);
  world=await mapResult(world);
  world.clubs[0].balance=0;
  for(const contract of Object.values(world.clubs[0].contracts))contract.monthlySalary=100000;
  world=await mapResult(world);
  assert.ok(world.clubs[0].balance<=-10000); assert.equal(world.day,8);
  assert.equal(world.pcSeason.playoffs.settled,true); assert.equal(world.pcSeason.weekSchedule,null);
  assert.equal(world.clubs[0].finance.sponsor.kind,'basic');
  assert.equal(world.clubs[0].finance.settlements.length,1); trip(world);
});

test('기존 v30 결과/날짜는 보존하고 플레이오프만 빈 상태로 보충하며 손상 상태는 거부한다', () => {
  const original=fixture(),old=createSave(original); old.schemaVersion=30; delete old.world.pcSeason.playoffs;
  const restored=restoreWorld(old); assert.equal(restored.day,original.day); assert.deepEqual(restored.pcSeason,original.pcSeason);
  const world=readyMine(); beginOfficialMatch(world,nextOfficialFixture(world).id);
  for(const mutate of [
    s=>{s.playoffs.series[1].maps.reverse();}, s=>{s.playoffs.series[1].pausesRemaining=4;},
    s=>{s.playoffs.rankedClubs.reverse();}, s=>{s.playoffs.series[1].result={homeScore:2,awayScore:0};},
    s=>{s.playoffs.series[1].lineups.home[0]='missing';}, s=>{s.weekSchedule=null;},
  ]) {const copy=structuredClone(world);mutate(copy.pcSeason);assert.throws(()=>createSave(copy));}
});

test('플레이오프 주간 팀 훈련이 남으면 AI/내 경기를 모두 막고 훈련 후 같은 주에 연다', () => {
  const world=fixture(); assert.equal(beginTeamTraining(world,{official:true}).ok,true);
  assert.equal(world.day,7); assert.equal(officialWeekStatus(world).phase,'training'); trip(world);
  assert.throws(()=>beginOfficialMatch(world,world.pcSeason.playoffs.series[1].id));
  const other=world.clubs.find(club=>club.id!==world.playerClubId);
  const state=createPractice(RELAY_MAP,getClubView(world),getClubView(world,other.id),{seed:42});
  advancePractice(state,RELAY_MAP,160000); assert.equal(settleTeamTraining(world,state,7).ok,true);
  assert.equal(world.day,7); assert.equal(officialWeekStatus(world).phase,'playoff-ai'); trip(world);
});

test('새 게임의 플레이오프 준비는 12주 차에 배치되고 화면 조회는 대진/날짜를 바꾸지 않는다', t => {
  const world=createWorld(createClub('AnnualPlayoff').club,42);
  for(let i=0;i<11;i++)assert.equal(advanceWeek(world).ok,true);
  const order=[world.playerClubId,...world.pcSeason.clubIds.filter(id=>id!==world.playerClubId)];
  for(const match of world.pcSeason.fixtures){const won=order.indexOf(match.homeClubId)<order.indexOf(match.awayClubId);recordPcMatch(world.pcSeason,match.id,{homeScore:won?13:5,awayScore:won?5:13});}
  assert.equal(world.day,78); assert.equal(Math.floor((world.day-1)/7)+1,12);
  for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  assert.equal(advanceWeek(world,{official:true}).advancedDays,6); assert.equal(world.day,84); trip(world);
  const original=structuredClone(world),old=globalThis.document;
  globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  const html=seasonScreen(world).innerHTML;
  assert.match(html,/PC방 플레이오프 · BO3/);assert.match(html,/준결승 1/);assert.match(html,/advance-playoff-ai/);
  assert.deepEqual(world,original);
});

test('미진출 팀은 실제 MR12 AI BO3 세 시리즈를 처리하고 보상 없이 주간 정산 한 번만 한다', async () => {
  const world=fixture(7); assert.equal(advanceWeek(world,{official:true}).advancedDays,6);
  assert.equal(world.pcSeason.weekSchedule.fixtureId,PLAYOFF_WEEK_ID);
  assert.equal(officialWeekStatus(world).phase,'playoff-ai'); const original=structuredClone(world);
  let yields=0;const result=await advanceAiPlayoffs(world,{yieldWork:async()=>{yields++;}});
  assert.deepEqual(world,original);assert.ok(yields>0);
  assert.equal(result.day,8); assert.equal(result.pcSeason.playoffs.settled,true);
  assert.equal(result.officialRecords.receipts.length,3);assert.equal(officialTotals(result,result.playerClubId).matches,0);
  assert.equal(playoffFinalRanks(result.pcSeason.playoffs)[7],result.playerClubId); trip(result);
  await assert.rejects(advanceAiPlayoffs(result));
});
