import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import './world-ranked-fixture.js';
import { trip } from './city-fixture.js';
import { nextWorldFixture,selectWorldMap } from '../src/game/world-groups.js';
import { worldFinalStandings } from '../src/game/world-finals.js';
import { playoffsComplete } from '../src/game/pc-playoffs.js';
import { advanceWeek } from '../src/game/calendar.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { officialTotals } from '../src/game/official-records.js';
import { beginOfficialMatch,finishOfficialWeek,advanceAiPlayoffs,createOfficialPractice } from '../src/game/official-match.js';
import { signSponsor } from '../src/game/sponsors.js';
import { renewContract } from '../src/game/contracts.js';
import { createSave,restoreWorld,parseBackup,serializeBackup,MAX_BACKUP_BYTES } from '../src/storage/save-data.js';
import { seasonScreen } from '../src/ui/season-screen.js';

import { parent, ready, map, finished } from './world-finals-fixture.js';

test('52주 고정 BO5 대진·3맵 반복과 반대 시작 진영은 저장 후 유지하며 새 주간 준비는 한 번이다',()=>{
  const world=ready(),before=structuredClone(world.worldSeason.playoffs),series=nextWorldFixture(world);
  assert.equal(world.day,364);assert.equal(world.worldSeason.weekSchedule.fixtureId,'world-1-playoffs');assert.deepEqual(new Set(before.rankedClubs),new Set(world.worldSeason.ranked.groups.flatMap(group=>group.clubIds).filter(id=>before.rankedClubs.includes(id))));
  selectWorldMap(world,series.id,series.maps[1].mapId);assert.equal(series.maps.length,5);
  for(const [a,b]of [[0,3],[1,4]]){assert.equal(series.maps[a].mapId,series.maps[b].mapId);assert.notEqual(series.maps[a].attackTeam,series.maps[b].attackTeam);assert.notEqual(series.maps[a].seed,series.maps[b].seed);}
  assert.equal(new Set(series.maps.slice(0,3).map(map=>map.mapId)).size,3);trip(world);
  const mapIds=series.maps.slice(0,3).map(map=>map.mapId);
  for(const id of [...mapIds,...mapIds]){selectWorldMap(world,series.id,id);assert.equal(series.maps.length,5);assert.equal(series.maps[0].mapId,series.mapPicks.home);assert.equal(series.maps[1].mapId,series.mapPicks.away);trip(world);}
  assert.equal(advanceWeek(world,{official:true}).officialPending,true);assert.equal(world.day,364);
});

test('세계 BO5는 2승으로 끝나지 않고 2:2 후 5맵에서 끝나며 맵 사이 퍼즈·주전을 유지한다',async()=>{
  let world=ready(),old=officialTotals(world,world.playerClubId);
  for(const win of [true,true,false,false]) {
    world=await map(world,win,1);const series=nextWorldFixture(world);assert.equal(series.result,null);assert.equal(series.pausesRemaining,1);assert.equal(world.day,364);trip(world);
  }
  const config=createOfficialPractice(world,nextWorldFixture(world));assert.equal(config.seriesLength,5);assert.equal(config.mapNumber,5);assert.deepEqual(config.seriesScore,{home:2,away:2});
  assert.deepEqual(officialTotals(world,world.playerClubId),old);await assert.rejects(finishOfficialWeek(world,{score:{home:13,away:6}}));
  world=await map(world,true,1);assert.equal(world.day,364);assert.equal(officialTotals(world,world.playerClubId).matches,old.matches+1);
  const next=nextWorldFixture(world);assert.ok(next.id.endsWith('-final'));assert.equal(next.pausesRemaining,3);assert.equal(next.lineups,null);trip(world);
});

test('BO5 준결승·결승은 추가 날짜 없이 시리즈당 보상/출전 1회와 마지막 정산 후 스폰서 종료를 적용한다',async()=>{
  let world=ready(),old=officialTotals(world,world.playerClubId),before=structuredClone(world);
  for(let i=0;i<6;i++)world=await map(world,true);
  assert.equal(world.day,365);assert.equal(world.worldSeason.playoffs.settled,true);assert.equal(world.worldSeason.weekSchedule,null);assert.equal(world.clubs[0].finance.sponsor.kind,'basic');
  assert.equal(world.clubs[0].finance.settlements.at(-1).sponsorContract.progress,2);
  const totals=officialTotals(world,world.playerClubId);assert.equal(totals.matches,old.matches+2);assert.equal(totals.rewards,old.rewards+1000);
  for(const id of world.clubs[0].lineupIds)assert.equal(totals.players[id].appearances,old.players[id].appearances+2);
  for(const key of ['pcSeason','citySeason','provinceSeason','nationalSeason'])assert.deepEqual(world[key],before[key]);assert.deepEqual(world.worldSeason.ranked,before.worldSeason.ranked);
  assert.equal(officialWeekStatus(world).phase,'free');assert.equal(signSponsor(world,'wins').ok,false);trip(world);
  const json=serializeBackup(world);assert.ok(new TextEncoder().encode(json).byteLength<=MAX_BACKUP_BYTES);assert.deepEqual(restoreWorld(parseBackup(json)),world);
});

test('BO5 결승 중간 이탈은 승리 2맵을 보존한 2:3 기권이며 상금·출전·스폰서 중복을 막는다',async()=>{
  let world=ready();for(let i=0;i<5;i++)world=await map(world);
  const before=officialTotals(world,world.playerClubId);world=await finishOfficialWeek(restoreWorld(createSave(world)),{forfeit:true});
  const final=world.worldSeason.playoffs.series[2];assert.equal(final.result.forfeit,true);assert.equal(final.scores.length,5);assert.equal(final.scores.filter(score=>score.forfeit).length,3);
  assert.equal(Math.min(final.result.homeScore,final.result.awayScore),2);assert.equal(Math.max(final.result.homeScore,final.result.awayScore),3);
  assert.equal(officialTotals(world,world.playerClubId).rewards,before.rewards);assert.deepEqual(officialTotals(world,world.playerClubId).players,before.players);trip(world);await assert.rejects(finishOfficialWeek(world,{forfeit:true}));
});

test('세계 최종16팀은 우승·준우승·공동3위/5위/9위로 표시하고 다음 해를 자동 시작하지 않는다',()=>{
  for(const place of [1,2,3]) {
    const world=finished(place),rows=worldFinalStandings(world.worldSeason);assert.equal(new Set(rows.map(row=>row.clubId)).size,16);
    assert.deepEqual([1,2,3,5,9].map(rank=>rows.filter(row=>row.rank===rank).length),[1,1,2,4,8]);assert.equal(rows.find(row=>row.clubId===world.playerClubId).rank,place);
    assert.equal(world.seasonCalendar.phase,'offseason');assert.equal(world.worldSeason.number,1);trip(world);
  }
});

test('52주 마지막 계약 만료는 BO5 결과를 보존하고 재계약 뒤 파산해도 정산/스폰서를 한 번 종료한다',async()=>{
  let world=ready();for(let i=0;i<5;i++)world=await map(world);
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  world=await map(world);assert.equal(world.day,364);assert.equal(officialWeekStatus(world).phase,'settling');assert.equal(world.worldSeason.playoffs.settled,false);trip(world);
  const records=structuredClone(world.officialRecords);for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  world.clubs[0].balance=0;for(const contract of Object.values(world.clubs[0].contracts))contract.monthlySalary=200000;
  assert.equal(advanceWeek(world).bankrupt,true);assert.equal(world.day,365);assert.equal(world.worldSeason.playoffs.settled,true);assert.equal(world.clubs[0].finance.sponsor.kind,'basic');assert.deepEqual(world.officialRecords,records);trip(world);
});

test('진행 중 BO5 준결승 탈락은 남은 AI 경기를 실제 계산하고 정산 후 자유 일정으로 전환한다',async()=>{
  const world=structuredClone(parent);advanceWeek(world,{official:true});const before=structuredClone(world);let yields=0;
  assert.equal(officialWeekStatus(world).phase,'playoff-ai');let result=await advanceAiPlayoffs(world,{yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.deepEqual(world,before);assert.equal(result.day,364);
  const series=nextWorldFixture(result);selectWorldMap(result,series.id,series.maps[0].mapId);beginOfficialMatch(result,series.id);
  result=await finishOfficialWeek(result,{forfeit:true,yieldWork:async()=>{yields++;}});
  assert.ok(playoffsComplete(result.worldSeason.playoffs));assert.equal(result.day,365);assert.equal(result.worldSeason.playoffs.settled,true);
  assert.equal(worldFinalStandings(result.worldSeason).find(row=>row.clubId===result.playerClubId).rank,3);assert.equal(officialWeekStatus(result).phase,'free');trip(result);
});

test('v39 순위별 결과를 보존하고 BO5 대진·맵/반복 진영·퍼즈·미래 결과·정산 손상을 거부한다',()=>{
  const old=createSave(parent);old.schemaVersion=39;delete old.world.worldSeason.playoffs;assert.deepEqual(restoreWorld(old),{...parent,aiGrowth:createAiGrowth(parent.day),counseling:createCounseling(parent)});
  const world=ready(),series=nextWorldFixture(world);selectWorldMap(world,series.id,series.maps[0].mapId);
  for(const mutate of [w=>w.worldSeason.playoffs.rankedClubs.reverse(),w=>w.worldSeason.playoffs.series[0].maps.reverse(),w=>w.worldSeason.playoffs.settled=true,
    w=>w.worldSeason.weekSchedule.endDay++,w=>w.worldSeason.playoffs.series[0].pausesRemaining=4,w=>w.worldSeason.stage='ranked',
    w=>{const s=w.worldSeason.playoffs.series.find(item=>item.id===series.id);s.maps[3].attackTeam=s.maps[0].attackTeam;},w=>{w.worldSeason.playoffs.series.push({id:'fake'});}
  ]){const copy=structuredClone(world);mutate(copy);assert.throws(()=>createSave(copy));}
});

test('세계 화면은 BO5 맵 순서·대진·최종 공동순위와 정산/스폰서 종료를 표시한다',t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  const world=ready(),series=nextWorldFixture(world);selectWorldMap(world,series.id,series.maps[0].mapId);const before=structuredClone(world),html=seasonScreen(world).innerHTML;
  assert.match(html,/52주 BO5 플레이오프/);assert.match(html,/4맵 홈 선택 재경기/);assert.match(html,/세계 BO5 대진/);assert.deepEqual(world,before);
  const done=seasonScreen(finished()).innerHTML;for(const rank of [3,5,9])assert.match(done,new RegExp(`공동 ${rank}위`));assert.match(done,/세계 마지막 정산·스폰서 계약 종료 완료/);assert.doesNotMatch(done,/\$\{/);
});
