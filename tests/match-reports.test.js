import { summaryFixture } from './match-report-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { advanceWeek } from '../src/game/calendar.js';
import { nextOfficialFixture,beginOfficialMatch,createOfficialPractice,finishOfficialWeek } from '../src/game/official-match.js';
import { buildMatchReport,appendMatchReport,validateMatchReports,reportFixture } from '../src/game/match-reports.js';
import { completeAnnual } from './season-years-fixture.js';
import { startNextYear } from '../src/game/season-years.js';
import { createPractice,advancePractice } from '../src/simulation/practice.js';
import { startEconomyRound,nextEconomyRound } from '../src/simulation/economy.js';
import { setAttackPlan } from '../src/simulation/attack-tactics.js';
import { setDefensePlan } from '../src/simulation/defense-tactics.js';
import { createSave,restoreWorld } from '../src/storage/save-data.js';
import { cityReady,trip } from './city-fixture.js';
import { ready as worldFinalReady } from './world-finals-fixture.js';
import { selectWorldMap } from '../src/game/world-groups.js';
import { nextWorldFixture } from '../src/game/world-groups.js';
import { matchReportsPanel } from '../src/ui/match-reports-panel.js';
import { recordStrategy } from '../src/simulation/strategy-history.js';
import { recordPcMatch } from '../src/game/pc-season.js';
import { applyOfficialReceipt } from '../src/game/official-records.js';

function pc(seed=42) {
  const world=createWorld(createClub('Report Club').club,seed);
  world.seasonCalendar={mode:'legacy',phase:'season'};
  advanceWeek(world,{official:true});beginOfficialMatch(world,nextOfficialFixture(world).id);return world;
}
function play(world) {
  const fixture=nextOfficialFixture(world),config=createOfficialPractice(world,fixture);
  const state=createPractice(config.map,config.home,config.away,{match:true,report:true,seed:config.seed,attackTeam:config.attackTeam,
    aiTeams:['home','away'],defensePlans:{home:'standard',away:'standard'},attackPlans:{home:'execute',away:'execute'}});
  let rounds=0;
  while(!state.match.complete) {
    assert.ok(rounds++<400);
    startEconomyRound(state,{autoHome:true});
    while(!state.complete)advancePractice(state,config.map,10000);
    if(!state.match.complete)assert.equal(nextEconomyRound(state,config.map),true);
  }
  return {state,config,report:buildMatchReport(state,config)};
}
const parent=pc();
const played=play(parent);

test('실제 MR12 요약은 누적 통계·라운드·진영·전술을 그대로 복사하고 실행 상태와 독립이다',()=>{
  const {state,report}=played;
  assert.deepEqual(report.score,state.match.score);assert.deepEqual(report.rounds,state.match.history);
  assert.equal(report.players.length,10);
  for(const player of report.players)assert.deepEqual(player.stats,state.match.playerStats[player.id]);
  const copy=structuredClone(report);report.players[0].stats.kills++;
  assert.notEqual(report.players[0].stats.kills,state.match.playerStats[report.players[0].id].kills);
  report.players[0].stats.kills=copy.players[0].stats.kills;
  assert.ok(report.rounds.every(round=>round.strategies.length>0));
});

test('BO1 결과·최근 기록·백업은 함께 저장되고 관전 원본·상금 중복 경계는 유지한다',async()=>{
  const original=structuredClone(parent),result=await finishOfficialWeek(parent,{score:{...played.report.score,report:played.report}});
  assert.deepEqual(parent,original);assert.equal(result.matchReports.length,1);trip(result);
  assert.equal(result.matchReports[0].maps[0].rounds.length,played.state.match.history.length);
  const saved=structuredClone(result);
  assert.throws(()=>appendMatchReport(result,result.matchReports[0].fixtureId,1,parent.day,played.report),/이미 저장/);
  assert.deepEqual(result,saved);
  const html=matchReportsPanel(result);assert.match(html,/ADR/);assert.match(html,/명중률/);assert.match(html,/라운드·전술/);
});

test('구매·타임아웃에서 바뀐 실제 설정만 남기고 같은 설정과 이동 틱을 반복 저장하지 않는다',()=>{
  const config=played.config,state=createPractice(config.map,config.home,config.away,{match:true,report:true,
    defensePlans:{home:'standard',away:'standard'},attackPlans:{home:'execute',away:'execute'}});
  startEconomyRound(state);recordStrategy(state);assert.equal(state.reportStrategies.changes.length,1);
  state.timeout.active=true;setAttackPlan(state,config.map,'split');setDefensePlan(state,config.map,'forward');
  state.timeout.active=false;recordStrategy(state);
  assert.equal(state.reportStrategies.changes.length,2);
  assert.equal(state.reportStrategies.changes[1].attack.home,'split');
  assert.equal(state.reportStrategies.changes[1].defense.home,'forward');
  for(let i=0;i<20;i++)recordStrategy(state);assert.equal(state.reportStrategies.changes.length,2);
  state.manualPlans={attack:{remaining:4,players:{'home-1':{}}},defense:{remaining:4,players:{'home-2':{}}}};
  recordStrategy(state);assert.deepEqual(state.reportStrategies.changes.at(-1).manual,{attack:true,defense:false});
});

test('BO3 완료 맵 저장 후 기권해도 완료 맵의 실제 통계만 유지한다',async()=>{
  let world=cityReady();beginOfficialMatch(world,nextOfficialFixture(world).id);
  const match=play(world);world=await finishOfficialWeek(world,{score:{...match.report.score,report:match.report,pausesRemaining:2}});
  assert.equal(world.matchReports[0].maps.length,1);trip(world);
  const before=structuredClone(world.matchReports);
  if(world.citySeason.activeMatchId)world=await finishOfficialWeek(world,{forfeit:true});
  assert.deepEqual(world.matchReports,before);trip(world);
  assert.match(matchReportsPanel(world),/기권/);
});

test('BO5도 완료 맵 단위로 기록하고 시리즈 퍼즈·출전·저장을 유지한다',async()=>{
  let world=worldFinalReady();const series=nextWorldFixture(world);
  selectWorldMap(world,series.id,series.maps[0].mapId);beginOfficialMatch(world,series.id);
  const match=play(world);world=await finishOfficialWeek(world,{score:{...match.report.score,report:match.report,pausesRemaining:1}});
  assert.equal(world.matchReports[0].maps[0].mapNumber,1);trip(world);
  assert.equal(nextWorldFixture(world).pausesRemaining,1);
  world=await finishOfficialWeek(world,{forfeit:true});assert.equal(world.matchReports[0].maps.length,1);trip(world);
});

test('미완료·기권만 있는 경기·연습·이전 저장의 과거 통계를 생성하지 않는다',async()=>{
  const config=played.config,state=createPractice(config.map,config.home,config.away,{match:true,report:true});
  assert.equal(buildMatchReport(state,config),null);
  const result=await finishOfficialWeek(pc(43),{forfeit:true});assert.deepEqual(result.matchReports,[]);
  const save=createSave(parent);save.schemaVersion=44;delete save.world.matchReports;
  assert.deepEqual(restoreWorld(save),parent);
});

test('잘못된 점수·맵·선수·통계·라운드·전술·중복 기록은 저장 전에 거부한다',async()=>{
  const world=await finishOfficialWeek(parent,{score:{...played.report.score,report:played.report}});
  for(const mutate of [r=>r.maps[0].score.home++,r=>r.maps[0].mapId='bad',r=>r.maps[0].players[0].playerId='bad',
    r=>r.maps[0].players[0].stats.kills=-1,r=>r.maps[0].rounds[0].score.home++,r=>r.maps[0].rounds[0].strategies[0].site='C',
    r=>r.maps.push(structuredClone(r.maps[0]))]) {
    const copy=structuredClone(world);mutate(copy.matchReports[0]);assert.throws(()=>createSave(copy),/공식 경기 상세/);
  }
  assert.throws(()=>validateMatchReports([...world.matchReports,...world.matchReports],world),/공식 경기 상세/);
});

// 용량 제한과 연도 식별 검사에만 쓰는 합성 데이터다. 실제 경기 통계 수집은 위 엔진 검사에서 확인한다.

test('최근30시리즈만 보관하며 연도별 원래 결과를 보존하고 새해의 같은 경기 ID와 구분한다',()=>{
  const world=completeAnnual(createWorld(createClub('Retention').club,42));
  const receipts=world.officialRecords.receipts.filter(receipt=>{
    const fixture=reportFixture(world,{year:1,fixtureId:receipt.fixtureId});
    return [fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId);
  });
  const oldRecords=structuredClone(world.officialRecords);
  for(const receipt of receipts) {
    const fixture=reportFixture(world,{year:1,fixtureId:receipt.fixtureId});
    appendMatchReport(world,fixture.id,1,receipt.day,summaryFixture(world,fixture));
  }
  assert.equal(world.matchReports.length,30);
  assert.deepEqual(world.matchReports.map(entry=>entry.fixtureId),receipts.slice(-30).map(receipt=>receipt.fixtureId));
  assert.deepEqual(world.officialRecords,oldRecords);trip(world);
  const previous=structuredClone(world.matchReports);startNextYear(world);trip(world);assert.deepEqual(world.matchReports,previous);
  assert.match(matchReportsPanel(world,1),/1년 차/);assert.doesNotMatch(matchReportsPanel(world,2),/<details class="season-week">/);
  completeAnnual(world);
  const fixture=reportFixture(world,{year:2,fixtureId:previous.at(-1).fixtureId});
  appendMatchReport(world,fixture.id,1,world.day,summaryFixture(world,fixture));
  assert.equal(world.matchReports.filter(entry=>entry.fixtureId===fixture.id).length,2);trip(world);
});

test('합성34:30 프로토콜은 반복 연장·3라운드 교대·최종 종료 경계를 검증한다',()=>{
  const world=structuredClone(parent),fixture=nextOfficialFixture(world),ownHome=fixture.homeClubId===world.playerClubId;
  assert.equal(recordPcMatch(world.pcSeason,fixture.id,{homeScore:ownHome?34:30,awayScore:ownHome?30:34}).ok,true);
  applyOfficialReceipt(world,fixture,world.officialRecords.active.lineups);
  const report=summaryFixture(world,fixture),initial=played.config.attackTeam,cumulative={home:0,away:0};
  const winners=[...Array(12).fill('home'),...Array(12).fill('away'),...Array.from({length:6},()=>[...Array(3).fill('home'),...Array(3).fill('away')]).flat(),...Array(4).fill('home')];
  report.rounds=winners.map((winner,index)=>{
    cumulative[winner]++;
    return {...report.rounds[index],roundNumber:index+1,winner,score:{...cumulative},
      attackTeam:index<12?initial:index<24?(initial==='home'?'away':'home'):Math.floor((index-24)/3)%2===0?initial:(initial==='home'?'away':'home'),
      overtime:index<24?0:Math.floor((index-24)/6)+1};
  });
  appendMatchReport(world,fixture.id,1,world.day,report);assert.equal(world.matchReports[0].maps[0].rounds.length,64);
  const broken=structuredClone(world.matchReports);broken[0].maps[0].rounds[27].attackTeam=broken[0].maps[0].rounds[24].attackTeam;
  assert.throws(()=>validateMatchReports(broken,world),/공식 경기 상세/);
});
