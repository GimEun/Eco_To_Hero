import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { finishedNational } from './national-fixture.js';
import { trip } from './city-fixture.js';
import { enterWorldGroups,worldQualification,worldEntryIssue,worldGroupProgress,worldGroupStandings,worldGroupOutcome,nextWorldFixture,selectWorldMap,ensureWorldTiebreakRound,nextWorldTiebreak,recordWorldTiebreak } from '../src/game/world-groups.js';
import { advanceWeek } from '../src/game/calendar.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { beginOfficialMatch,finishOfficialWeek,advanceAiTiebreaks,createOfficialPractice } from '../src/game/official-match.js';
import { officialSeason } from '../src/game/pc-season.js';
import { officialTotals } from '../src/game/official-records.js';
import { signSponsor } from '../src/game/sponsors.js';
import { renewContract } from '../src/game/contracts.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createSave,restoreWorld,parseBackup,serializeBackup,MAX_BACKUP_BYTES } from '../src/storage/save-data.js';
import { seasonScreen } from '../src/ui/season-screen.js';

import {parent,groups,fillSeries,completedGroups} from './world-fixture.js';

test('전국 1·2위만 세계16팀에 진출하며 고정 추첨·4개조·조별3매치를 보존한다',()=>{
  for(const place of [1,2]) {
    const world=place===1?structuredClone(parent):finishedNational(2),before=structuredClone(world);
    assert.equal(worldQualification(world).qualified,true);enterWorldGroups(world);
    const season=world.worldSeason;assert.equal(season.clubIds.length,16);assert.equal(new Set(season.clubIds).size,16);
    assert.deepEqual(season.clubIds.slice(0,2),worldQualification(world).qualifiedClubIds);
    assert.equal(season.clubIds.slice(2).filter(id=>world.clubs.find(club=>club.id===id).leagueId==='world').length,14);
    assert.equal(new Set(season.groups.flatMap(group=>group.clubIds)).size,16);assert.equal(season.fixtures.length,24);
    for(const group of season.groups){const fixtures=season.fixtures.filter(match=>match.groupId===group.id);assert.equal(fixtures.length,6);
      assert.equal(new Set(fixtures.map(match=>[match.homeClubId,match.awayClubId].sort().join('/'))).size,6);
      for(const id of group.clubIds)for(const week of [1,2,3])assert.equal(fixtures.filter(match=>match.week===week && [match.homeClubId,match.awayClubId].includes(id)).length,1);}
    for(const key of ['pcSeason','citySeason','provinceSeason','nationalSeason','players','clubs','day'])assert.deepEqual(world[key],before[key]);
    assert.equal(getClubView(world).leagueId,'world');trip(world);assert.throws(()=>enterWorldGroups(world));
  }
  const loser=finishedNational(12);assert.equal(worldQualification(loser).qualified,false);assert.ok(worldEntryIssue(loser));assert.throws(()=>enterWorldGroups(loser));
});

test('v37 저장을 소급 없이 복원하고 세계 조편성·주간 준비·맵 선택을 왕복 보관한다',()=>{
  const old=createSave(parent);old.schemaVersion=37;delete old.world.worldSeason;assert.deepEqual(restoreWorld(old),{...parent,aiGrowth:createAiGrowth(parent.day),counseling:createCounseling(parent)});
  const world=groups();assert.deepEqual(world.worldSeason,groups().worldSeason);assert.equal(officialSeason(world),world.worldSeason);
  assert.equal(signSponsor(world,'wins',1).ok,true);assert.equal(world.clubs[0].finance.sponsor.leagueId,'world');
  assert.equal(officialWeekStatus(world).phase,'unscheduled');assert.throws(()=>beginOfficialMatch(world,nextWorldFixture(world).id));
  assert.equal(advanceWeek(world,{official:true}).advancedDays,6);assert.equal(world.day,329);trip(world);
  const fixture=nextWorldFixture(world);assert.throws(()=>beginOfficialMatch(world,fixture.id));selectWorldMap(world,fixture.id,fixture.maps[0].mapId);
  assert.equal(officialWeekStatus(world).canPlay,true);assert.equal(new Set(fixture.maps.map(map=>map.mapId)).size,3);trip(world);
});

test('세계 BO3는 주전·퍼즈를 공유하고 맵1개 결과에는 보상 없이 다음 맵을 저장한다',async()=>{
  let world=groups(true);const fixture=nextWorldFixture(world);selectWorldMap(world,fixture.id,fixture.maps[0].mapId);beginOfficialMatch(world,fixture.id);trip(world);
  const old=structuredClone(world),totals=officialTotals(world,world.playerClubId);
  world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:1}});
  assert.deepEqual(old.worldSeason.fixtures.find(match=>match.id===fixture.id).scores,[]);
  const next=nextWorldFixture(world),config=createOfficialPractice(world,next);assert.equal(config.leagueLabel,'세계 리그');assert.equal(config.mapNumber,2);assert.equal(config.pausesRemaining,1);
  assert.deepEqual(next.lineups,old.officialRecords.active.lineups);assert.equal(world.day,329);assert.deepEqual(officialTotals(world,world.playerClubId),totals);trip(world);
  await assert.rejects(finishOfficialWeek(world,{score:{home:13,away:6}}));assert.throws(()=>selectWorldMap(world,next.id,next.maps[1].mapId));
});

test('세계 한 주는 내 BO3 후 AI 7시리즈를 실제 엔진으로 계산하고 한 번 정산한다',async()=>{
  const world=groups(true),fixture=nextWorldFixture(world);selectWorldMap(world,fixture.id,fixture.maps[0].mapId);beginOfficialMatch(world,fixture.id);
  const before=structuredClone(world);let yields=0;
  const result=await finishOfficialWeek(world,{forfeit:true,yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.deepEqual(world,before);assert.equal(result.day,330);assert.equal(result.worldSeason.weekSchedule,null);
  const matches=result.worldSeason.fixtures.filter(match=>match.week===1);assert.equal(matches.filter(match=>match.result).length,8);assert.equal(matches.filter(match=>match.result.forfeit).length,1);
  assert.equal(result.officialRecords.receipts.length,before.officialRecords.receipts.length+8);
  assert.equal(officialTotals(result,result.playerClubId).rewards,officialTotals(before,before.playerClubId).rewards);trip(result);
  await assert.rejects(finishOfficialWeek(result,{forfeit:true}));
});

test('세계 47~49주에만 조별24매치를 마치고 1위4팀·2위4팀·탈락8팀을 확정한다',()=>{
  const world=completedGroups(),season=world.worldSeason,outcome=worldGroupOutcome(season);
  assert.equal(worldGroupProgress(season).complete,true);assert.equal(outcome.firstClubIds.length,4);assert.equal(outcome.secondClubIds.length,4);
  assert.equal(new Set(outcome.qualifiedClubIds).size,8);assert.equal(new Set(outcome.eliminatedClubIds).size,8);assert.ok(outcome.firstClubIds.includes(world.playerClubId));
  for(const group of season.groups){const rows=worldGroupStandings(season,group.id);assert.deepEqual(rows.map(row=>row.rank),[1,2,3,4]);assert.ok(rows.every(row=>row.played===3));}
  assert.equal(officialWeekStatus(world).phase,'world-groups-complete');assert.equal(nextWorldFixture(world),null);
  for(const key of ['pcSeason','citySeason','provinceSeason','nationalSeason'])assert.deepEqual(world[key],parent[key]);
  const json=serializeBackup(world);assert.ok(new TextEncoder().encode(json).byteLength<=MAX_BACKUP_BYTES);assert.deepEqual(restoreWorld(parseBackup(json)),world);
  const last=completedGroups({last:true});assert.ok(worldGroupOutcome(last.worldSeason).eliminatedClubIds.includes(last.playerClubId));trip(last);
});

test('세계 3팀 재동률은 해당 조만 BO1 재경기하며 날짜·급여·정규 전적을 보존한다',()=>{
  const world=completedGroups({cycle:true}),season=world.worldSeason,before=structuredClone(world);
  assert.equal(advanceWeek(world,{official:true}).tiebreakPending,true);ensureWorldTiebreakRound(season);const ids=season.tiebreaks[0].clubIds;
  for(const fixture of season.tiebreaks[0].fixtures){assert.equal(fixture.kind,'world-tiebreak');const won=(ids.indexOf(fixture.homeClubId)+1)%3===ids.indexOf(fixture.awayClubId);recordWorldTiebreak(season,fixture.id,{homeScore:won?13:6,awayScore:won?6:13});}
  assert.deepEqual(worldGroupProgress(season).next.clubIds,ids);ensureWorldTiebreakRound(season);
  for(const fixture of season.tiebreaks[1].fixtures){const won=ids.indexOf(fixture.homeClubId)<ids.indexOf(fixture.awayClubId);recordWorldTiebreak(season,fixture.id,{homeScore:won?13:6,awayScore:won?6:13});}
  assert.ok(worldGroupOutcome(season));assert.equal(world.day,before.day);assert.deepEqual(world.clubs,before.clubs);assert.deepEqual(season.fixtures,before.worldSeason.fixtures);trip(world);
});

test('세계 내 BO1은 정상 승리/기권을 기록하며 추가 날짜 없이 세계 스폰서 실적을 구분한다',async()=>{
  for(const forfeit of [false,true]) {
    let world=completedGroups({cycle:true});signSponsor(world,'wins',1);
    while(officialWeekStatus(world).phase==='tiebreak-ai'){const fixture=nextWorldTiebreak(world.worldSeason);recordWorldTiebreak(world.worldSeason,fixture.id,{homeScore:13,awayScore:6});}
    const fixture=nextWorldFixture(world),cash=world.clubs[0].balance,old=officialTotals(world,world.playerClubId);
    beginOfficialMatch(world,fixture.id);trip(world);assert.equal(createOfficialPractice(world,fixture).leagueLabel,'세계 리그');
    world=await finishOfficialWeek(restoreWorld(createSave(world)),forfeit?{forfeit:true}:{score:{home:13,away:6}});
    assert.equal(world.day,344);assert.equal(world.clubs[0].balance,cash);assert.equal(world.clubs[0].finance.sponsor.progress,forfeit?0:1);
    const totals=officialTotals(world,world.playerClubId);assert.equal(totals.matches,old.matches+1);assert.equal(totals.rewards,old.rewards);trip(world);
  }
});

test('세계 AI 조별 결정전은 실제 BO1 엔진으로 처리하고 원본·날짜를 보존한다',async()=>{
  const world=completedGroups({aiCycle:true}),before=structuredClone(world);let yields=0;
  assert.equal(officialWeekStatus(world).phase,'tiebreak-ai');const result=await advanceAiTiebreaks(world,{yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.deepEqual(world,before);assert.equal(result.day,344);assert.deepEqual(result.clubs[0].finance,world.clubs[0].finance);trip(result);
});

test('세계 마지막 하루 계약 중단은 결과·보상을 보존하고 재계약 후 정산하며 스폰서를 유지한다',async()=>{
  let world=groups();assert.equal(signSponsor(world,'wins',1).ok,true);advanceWeek(world,{official:true});
  const fixture=nextWorldFixture(world);selectWorldMap(world,fixture.id,fixture.maps[0].mapId);
  for(const other of world.worldSeason.fixtures.filter(match=>match.week===1 && match!==fixture))fillSeries(world,other);
  beginOfficialMatch(world,fixture.id);world=await finishOfficialWeek(world,{score:{home:13,away:6}});beginOfficialMatch(world,fixture.id);
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  world=await finishOfficialWeek(world,{score:{home:13,away:6}});assert.equal(world.day,329);assert.equal(officialWeekStatus(world).phase,'settling');trip(world);
  const receipts=structuredClone(world.officialRecords.receipts);for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  assert.equal(advanceWeek(world).ok,true);assert.equal(world.day,330);assert.deepEqual(world.officialRecords.receipts,receipts);assert.equal(world.clubs[0].finance.sponsor.leagueId,'world');trip(world);
});

test('세계 저장은 조편성·맵·미래 경기·주간 일정·명단·결정전 손상을 거부한다',()=>{
  const world=groups(true),fixture=nextWorldFixture(world);selectWorldMap(world,fixture.id,fixture.maps[0].mapId);trip(world);
  for(const mutate of [w=>w.worldSeason.clubIds.reverse(),w=>w.worldSeason.groups[0].clubIds.reverse(),w=>w.worldSeason.fixtures[0].groupId='Z',
    w=>w.worldSeason.fixtures[0].maps.reverse(),w=>w.worldSeason.weekSchedule.startedDay--,w=>w.worldSeason.fixtures[8].pausesRemaining=2,
    w=>w.worldSeason.tiebreaks.push({id:'fake'}),w=>w.worldSeason.stage='finals',w=>w.worldSeason.activeMatchId='fake']) {
    const copy=structuredClone(world);mutate(copy);assert.throws(()=>createSave(copy));
  }
  const tied=completedGroups({cycle:true});ensureWorldTiebreakRound(tied.worldSeason);tied.worldSeason.tiebreaks[0].fixtures[0].kind='national-tiebreak';assert.throws(()=>createSave(tied));
});

test('세계 화면은 4개조·맵 선택·진출8팀·이전 결과를 표시하고 후속 경기를 시작하지 않는다',t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  const world=groups(true),before=structuredClone(world),html=seasonScreen(world).innerHTML;assert.match(html,/pick-world-map/);assert.match(html,/세계 조별 순위/);assert.deepEqual(world,before);
  const completed=completedGroups(),final=seasonScreen(completed).innerHTML;assert.match(final,/진출 8팀/);assert.match(final,/조 1위 4팀/);assert.match(final,/전국 리그 최종 결과/);assert.doesNotMatch(final,/\$\{|start-world-final/);
});
