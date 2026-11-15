import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { completedGroups,fillSeries } from './world-fixture.js';
import { trip } from './city-fixture.js';
import { enterWorldRanked,worldRankedEntryIssue,worldRankedOutcome,worldRankedStandings } from '../src/game/world-ranked.js';
import { worldGroupOutcome, worldProgress, nextWorldFixture, ensureWorldTiebreakRound, nextWorldTiebreak, recordWorldTiebreak } from '../src/game/world-groups.js';
import { beginOfficialMatch,finishOfficialWeek,advanceAiTiebreaks,createOfficialPractice } from '../src/game/official-match.js';
import { advanceWeek } from '../src/game/calendar.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { officialTotals } from '../src/game/official-records.js';
import { createSave,restoreWorld,serializeBackup,parseBackup,MAX_BACKUP_BYTES } from '../src/storage/save-data.js';
import { renewContract } from '../src/game/contracts.js';
import { signSponsor,sponsorIncome } from '../src/game/sponsors.js';
import { seasonScreen } from '../src/ui/season-screen.js';

import {parent,ranked,fillRound,completeRanked,start} from './world-ranked-fixture.js';

test('조1위/2위별 4팀을 고정 편성하고 50주2매치·51주1매치 대진과 이전 기록을 보존한다',()=>{
  for(const second of [false,true]) {
    const world=ranked(false,second),outcome=worldGroupOutcome(world.worldSeason),current=world.worldSeason.ranked;
    assert.deepEqual(current.groups.map(group=>group.clubIds),[outcome.firstClubIds,outcome.secondClubIds]);
    assert.equal(current.fixtures.length,12);assert.equal(new Set(current.fixtures.map(match=>match.id)).size,12);
    for(const group of current.groups){const fixtures=current.fixtures.filter(match=>match.groupId===group.id);assert.equal(fixtures.length,6);
      assert.equal(new Set(fixtures.map(match=>[match.homeClubId,match.awayClubId].sort().join('/'))).size,6);
      for(const id of group.clubIds){assert.equal(fixtures.filter(match=>match.week===4 && [match.homeClubId,match.awayClubId].includes(id)).length,2);assert.equal(fixtures.filter(match=>match.week===5 && [match.homeClubId,match.awayClubId].includes(id)).length,1);}}
    assert.equal(nextWorldFixture(world).groupId,second?'R2':'R1');assert.throws(()=>enterWorldRanked(world));trip(world);
    if(!second)assert.deepEqual(world.worldSeason.fixtures,parent.worldSeason.fixtures);assert.deepEqual(world.players,parent.players);
  }
  const lost=completedGroups({last:true});assert.ok(worldRankedEntryIssue(lost));assert.throws(()=>enterWorldRanked(lost));
});

test('v38 저장은 세계 조별 완료/날짜/스폰서를 보존하고 순위별 미진입 상태만 보충한다',()=>{
  const old=createSave(parent);old.schemaVersion=38;delete old.world.worldSeason.ranked;
  assert.deepEqual(restoreWorld(old),{...parent,aiGrowth:createAiGrowth(parent.day),counseling:createCounseling(parent)});const world=ranked(true);trip(world);
  const bad=createSave(world);delete bad.world.worldSeason.ranked;assert.throws(()=>restoreWorld(bad));
  assert.throws(()=>beginOfficialMatch(ranked(),nextWorldFixture(ranked()).id));
});

test('50주 첫 기권 뒤 AI3 BO3는 실제 계산하고 정산 없이 두 번째 매치를 열며 퍼즈를 새로 부여한다',async()=>{
  let world=ranked();assert.equal(signSponsor(world,'wins',1).ok,true);advanceWeek(world,{official:true});
  const fixture=start(world),before=structuredClone(world),finance=structuredClone(world.clubs[0].finance);let yields=0;
  world=await finishOfficialWeek(world,{forfeit:true,yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.deepEqual(before.worldSeason.ranked.fixtures.find(match=>match.id===fixture.id).scores,[]);
  assert.equal(world.day,350);assert.equal(world.weekDaysRemaining,1);assert.equal(world.worldSeason.weekSchedule.phase,'match');assert.deepEqual(world.clubs[0].finance,finance);
  assert.equal(world.worldSeason.ranked.fixtures.filter(match=>match.round===1 && match.result).length,4);
  assert.ok(world.worldSeason.ranked.fixtures.filter(match=>match.round===2).every(match=>!match.result));
  const next=nextWorldFixture(world);assert.equal(next.round,2);assert.equal(next.pausesRemaining,3);assert.equal(world.worldSeason.weekSchedule.fixtureId,next.id);
  assert.equal(advanceWeek(world,{official:true}).officialPending,true);trip(world);await assert.rejects(finishOfficialWeek(world,{forfeit:true}));
  for(const other of world.worldSeason.ranked.fixtures.filter(match=>match.round===2 && match.id!==next.id))fillSeries(world,other);
  start(world);world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1}});assert.equal(world.day,350);trip(world);
  const config=createOfficialPractice(world,nextWorldFixture(world));assert.match(config.stageLabel,/순위별 리그/);assert.equal(config.pausesRemaining,1);
  const old=officialTotals(world,world.playerClubId);start(world);world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1}});
  assert.equal(world.day,351);assert.equal(world.worldSeason.weekSchedule,null);assert.equal(world.clubs[0].finance.settlements.at(-1).day,351);assert.equal(world.clubs[0].finance.settlements.at(-2).day,344);
  assert.equal(officialTotals(world,world.playerClubId).rewards,old.rewards+500);assert.equal(world.clubs[0].finance.sponsor.progress,1);trip(world);
});

test('51주 종료에 두 리그 상위2팀씩 총4팀을 확정하고 조별 전적·세계 스폰서를 유지한다',()=>{
  const world=completeRanked(),outcome=worldRankedOutcome(world.worldSeason.ranked);
  assert.equal(new Set(outcome.qualifiedClubIds).size,4);assert.equal(new Set(outcome.eliminatedClubIds).size,4);assert.ok(outcome.qualifiedClubIds.includes(world.playerClubId));
  for(const group of world.worldSeason.ranked.groups){const rows=worldRankedStandings(world.worldSeason.ranked,group.id);assert.deepEqual(rows.map(row=>row.rank),[1,2,3,4]);assert.ok(rows.every(row=>row.played===3));}
  assert.equal(officialWeekStatus(world).phase,'world-ranked-complete');assert.equal(nextWorldFixture(world),null);assert.deepEqual(world.worldSeason.fixtures,parent.worldSeason.fixtures);
  const lost=completeRanked({last:true});assert.ok(worldRankedOutcome(lost.worldSeason.ranked).eliminatedClubIds.includes(lost.playerClubId));
  const json=serializeBackup(world);assert.ok(new TextEncoder().encode(json).byteLength<=MAX_BACKUP_BYTES);assert.deepEqual(restoreWorld(parseBackup(json)),world);
});

test('순위별 BO1은 해당 리그의 재동률만 재경기하고 날짜·급여·BO3 전적을 보존한다',()=>{
  const world=completeRanked({cycle:true}),before=structuredClone(world),season=world.worldSeason;
  assert.equal(advanceWeek(world,{official:true}).tiebreakPending,true);ensureWorldTiebreakRound(season);const ids=season.ranked.tiebreaks[0].clubIds;
  for(const fixture of season.ranked.tiebreaks[0].fixtures){const won=(ids.indexOf(fixture.homeClubId)+1)%3===ids.indexOf(fixture.awayClubId);recordWorldTiebreak(season,fixture.id,{homeScore:won?13:6,awayScore:won?6:13});}
  assert.deepEqual(worldProgress(season).next.clubIds,ids);ensureWorldTiebreakRound(season);
  for(const fixture of season.ranked.tiebreaks[1].fixtures){const won=ids.indexOf(fixture.homeClubId)<ids.indexOf(fixture.awayClubId);recordWorldTiebreak(season,fixture.id,{homeScore:won?13:6,awayScore:won?6:13});}
  assert.equal(worldRankedOutcome(season.ranked).qualifiedClubIds.length,4);assert.equal(world.day,before.day);assert.deepEqual(world.clubs,before.clubs);assert.deepEqual(season.ranked.fixtures,before.worldSeason.ranked.fixtures);trip(world);
});

test('순위별 내 BO1 정상/기권과 AI BO1 실제 계산은 기존 기록·추가 정산 없이 반영된다',async()=>{
  for(const forfeit of [false,true]) {
    let world=completeRanked({cycle:true});while(officialWeekStatus(world).phase==='tiebreak-ai'){const fixture=nextWorldTiebreak(world.worldSeason);recordWorldTiebreak(world.worldSeason,fixture.id,{homeScore:13,awayScore:6});}
    const fixture=nextWorldFixture(world),old=officialTotals(world,world.playerClubId),finance=structuredClone(world.clubs[0].finance);
    beginOfficialMatch(world,fixture.id);trip(world);world=await finishOfficialWeek(world,forfeit?{forfeit:true}:{score:{home:13,away:6}});
    assert.equal(world.day,358);assert.equal(officialTotals(world,world.playerClubId).matches,old.matches+1);assert.deepEqual(world.clubs[0].finance,finance);trip(world);
  }
  const world=completeRanked({aiCycle:true}),before=structuredClone(world);let yields=0;
  const result=await advanceAiTiebreaks(world,{yieldWork:async()=>{yields++;}});assert.ok(yields>0);assert.deepEqual(world,before);assert.equal(result.day,358);trip(result);
});

test('두 번째 매치 뒤 계약 만료로 정산이 막혀도 두 결과를 보존하고 재계약 후 한 번 정산한다',async()=>{
  let world=ranked(true);fillRound(world,1);world.worldSeason.weekSchedule.fixtureId=nextWorldFixture(world).id;
  const fixture=nextWorldFixture(world);for(const other of world.worldSeason.ranked.fixtures.filter(match=>match.round===2 && match.id!==fixture.id))fillSeries(world,other);
  start(world);world=await finishOfficialWeek(world,{score:{home:13,away:6}});start(world);
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  world=await finishOfficialWeek(world,{score:{home:13,away:6}});assert.equal(world.day,350);assert.equal(officialWeekStatus(world).phase,'settling');trip(world);
  const records=structuredClone(world.officialRecords);for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  assert.equal(advanceWeek(world).advancedDays,1);assert.equal(world.day,351);assert.deepEqual(world.officialRecords,records);trip(world);
});

test('순위별 승리/출전 스폰서는 기존 세계 목표를 적용하고 종료에도 계약을 유지한다',()=>{
  for(const kind of ['wins','appearances']) {
    const world=ranked();assert.equal(signSponsor(world,kind,1).ok,true);
    for(const rounds of [[1,2],[3]]) {
      advanceWeek(world,{official:true});for(const round of rounds){fillRound(world,round);const next=nextWorldFixture(world);if(next?.week===4)world.worldSeason.weekSchedule.fixtureId=next.id;}
      world.worldSeason.weekSchedule.phase='settling';advanceWeek(world);
    }
    const sponsor=world.clubs[0].finance.sponsor;assert.equal(sponsor.kind,kind);assert.equal(sponsor.leagueId,'world');assert.equal(sponsor.progress,3);
    assert.equal(sponsorIncome(sponsor),kind==='wins'?9000:7000);trip(world);
  }
});

test('순위별 저장은 참가자·순서·미래 매치·주간 정산·결정전·맵·중복 기록 손상을 거부한다',()=>{
  const world=ranked(true);start(world);trip(world);
  for(const mutate of [w=>w.worldSeason.ranked.groups.reverse(),w=>w.worldSeason.ranked.fixtures[0].round=3,w=>w.worldSeason.ranked.startedDay--,
    w=>w.worldSeason.ranked.fixtures[8].pausesRemaining=2,w=>w.worldSeason.weekSchedule.phase='settling',w=>w.worldSeason.ranked.fixtures[0].maps.reverse(),
    w=>w.worldSeason.ranked.tiebreaks.push({id:'fake'}),w=>w.worldSeason.stage='groups']){const copy=structuredClone(world);mutate(copy);assert.throws(()=>createSave(copy));}
});

test('세계 화면은 순위별 참가·두 매치 일정·4강 진출·조별 기록을 표시하고 BO5를 열지 않는다',t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  assert.match(seasonScreen(parent).innerHTML,/enter-world-ranked/);
  const world=ranked(true),before=structuredClone(world),html=seasonScreen(world).innerHTML;assert.match(html,/순위별 리그 순위/);assert.match(html,/50주 · 팀당 2매치/);assert.deepEqual(world,before);
  const done=seasonScreen(completeRanked()).innerHTML;assert.match(done,/세계 4강 진출 4팀/);assert.match(done,/조별 최종 결과/);assert.doesNotMatch(done,/\$\{|start-world-final/);
});
