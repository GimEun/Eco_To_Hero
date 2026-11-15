import { createCounseling } from '../src/game/counseling.js';
import test from 'node:test';
import { createAiGrowth } from '../src/game/ai-growth.js';
import assert from 'node:assert/strict';
import { finished } from './world-finals-fixture.js';
import { finishedCity,trip } from './city-fixture.js';
import { completeAnnual,renew } from './season-years-fixture.js';
import { newYearIssue,startNextYear,SEASON_FIELDS } from '../src/game/season-years.js';
import { competitionSeed,yearWeek } from '../src/game/season-year-context.js';
import { advanceWeek } from '../src/game/calendar.js';
import { isPreseason,recruitmentWindowIssue } from '../src/game/season-calendar.js';
import { officialTotals } from '../src/game/official-records.js';
import { nextOfficialFixture,beginOfficialMatch,finishOfficialWeek,officialMatchConfig } from '../src/game/official-match.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { createSave,restoreWorld,parseBackup,serializeBackup,MAX_BACKUP_BYTES } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { seasonScreen } from '../src/ui/season-screen.js';

const parent=finished();
function nextYear(){const world=structuredClone(parent);startNextYear(world);return world;}

test('52주 전·미완료 일정·파산은 새해 전환을 막고 원본을 보존한다',()=>{
  const early=finishedCity(10),before=structuredClone(early);assert.match(newYearIssue(early),/52주/);assert.throws(()=>startNextYear(early));assert.deepEqual(early,before);
  for(const mutate of [w=>w.weekDaysRemaining=1,w=>w.teamTraining={status:'pending'},w=>w.playerEvents.week={event:{status:'pending'}},w=>w.clubs[0].balance=-10000]){
    const world=structuredClone(parent);mutate(world);const original=structuredClone(world);assert.ok(newYearIssue(world));assert.throws(()=>startNextYear(world));assert.deepEqual(world,original);}
});

test('새해는 날짜·선수·자금·계약·시설·주식·행동 난수를 보존하고 한 번만 전환한다',()=>{
  const world=structuredClone(parent),before=structuredClone(world),oldTotal=officialTotals(world,world.playerClubId);startNextYear(world);
  for(const key of ['seed','day','clubs','players','stocks','playerEvents','actionRandomState','aiGrowth'])assert.deepEqual(world[key],before[key]);
  assert.deepEqual(world.seasonYears,{year:2,startedDay:365,archives:[{year:1,startedDay:1,endedDay:365,calendar:before.seasonCalendar,...Object.fromEntries(SEASON_FIELDS.map(key=>[key,before[key]]))}]});
  assert.equal(isPreseason(world),true);assert.equal(yearWeek(world),1);assert.equal(world.worldSeason,null);assert.equal(world.officialRecords.receipts.length,0);
  assert.deepEqual(officialTotals(world,world.playerClubId),oldTotal);assert.throws(()=>startNextYear(world));trip(world);
  assert.notEqual(world.pcSeason,before.pcSeason);assert.notEqual(world.seasonYears.archives[0].pcSeason,before.pcSeason);
});

test('2년 차 비시즌4주는 실제28일 진행하고5주에 PC방 준비·맵 추첨을 연다',()=>{
  const world=nextYear();renew(world);const archive=structuredClone(world.seasonYears.archives[0]);
  for(let i=0;i<4;i++){assert.equal(recruitmentWindowIssue(world),null);assert.equal(advanceWeek(world,{official:true}).advancedDays,7);trip(world);}
  assert.equal(world.day,393);assert.equal(yearWeek(world),5);assert.equal(isPreseason(world),false);assert.ok(recruitmentWindowIssue(world));
  assert.equal(advanceWeek(world,{official:true}).advancedDays,6);assert.equal(world.day,399);assert.equal(officialWeekStatus(world).canPlay,true);trip(world);
  const config=officialMatchConfig(world,nextOfficialFixture(world)),old=officialMatchConfig(parent,parent.pcSeason.fixtures.find(match=>match.id===nextOfficialFixture(world).id));assert.notEqual(config.seed,old.seed);
  assert.deepEqual(world.seasonYears.archives[0],archive);assert.equal(getClubView(world).seasonYear,2);assert.equal(getClubView(world).yearWeek,5);
});

test('새해 대진은 같은 연도/시드로 고정되고 기존 PC방8팀·이름·로고를 유지한다',()=>{
  const a=nextYear(),b=nextYear();assert.deepEqual(a.pcSeason,b.pcSeason);assert.deepEqual(new Set(a.pcSeason.clubIds),new Set(parent.pcSeason.clubIds));
  assert.notEqual(competitionSeed(a),competitionSeed(parent));assert.notDeepEqual(a.pcSeason.fixtures.map(match=>[match.homeClubId,match.awayClubId]),parent.pcSeason.fixtures.map(match=>[match.homeClubId,match.awayClubId]));
  assert.deepEqual(a.clubs.map(club=>[club.id,club.name,club.logoId]),parent.clubs.map(club=>[club.id,club.name,club.logoId]));trip(a);
});

test('2년 차 PC방 실제 AI 계산·기권·저장은 이전 연도 기록/상금과 충돌하지 않는다',async()=>{
  let world=nextYear();renew(world);for(let i=0;i<4;i++)advanceWeek(world,{official:true});advanceWeek(world,{official:true});
  const fixture=nextOfficialFixture(world),archive=structuredClone(world.seasonYears.archives),totals=officialTotals(world,world.playerClubId);beginOfficialMatch(world,fixture.id);trip(world);let yields=0;
  world=await finishOfficialWeek(world,{forfeit:true,yieldWork:async()=>{yields++;}});
  assert.ok(yields>0);assert.equal(world.day,400);assert.equal(world.officialRecords.receipts.length,4);assert.equal(officialTotals(world,world.playerClubId).matches,totals.matches+1);
  assert.equal(officialTotals(world,world.playerClubId).rewards,totals.rewards);assert.deepEqual(world.seasonYears.archives,archive);trip(world);await assert.rejects(finishOfficialWeek(world,{forfeit:true}));
});

test('2년 차 모든 국내·세계 단계를 재완주하고3년 차에도 상세 기록/누적 합산을 유지한다',()=>{
  const world=nextYear(),first=structuredClone(world.seasonYears.archives[0]),oldTotal=officialTotals(world,world.playerClubId);completeAnnual(world);
  assert.equal(world.day,729);assert.equal(world.seasonCalendar.phase,'offseason');assert.equal(yearWeek(world),53);assert.deepEqual(world.seasonYears.archives[0],first);
  const thisYear=officialTotals({...world,seasonYears:{archives:[]}},world.playerClubId),all=officialTotals(world,world.playerClubId);
  assert.equal(all.matches,oldTotal.matches+thisYear.matches);assert.equal(all.rewards,oldTotal.rewards+thisYear.rewards);
  for(const id of world.clubs[0].lineupIds)assert.equal(all.players[id].appearances,(oldTotal.players[id]?.appearances??0)+(thisYear.players[id]?.appearances??0));
  startNextYear(world);assert.equal(world.seasonYears.year,3);assert.equal(world.seasonYears.archives.length,2);assert.equal(world.seasonYears.startedDay,729);
  assert.deepEqual(officialTotals(world,world.playerClubId),all);assert.deepEqual(world.seasonYears.archives[0],first);trip(world);
  const source=serializeBackup(world);assert.ok(new TextEncoder().encode(source).byteLength>1024*1024);assert.ok(new TextEncoder().encode(source).byteLength<MAX_BACKUP_BYTES);
  assert.deepEqual(restoreWorld(parseBackup(source)),world);
});

test('v41 기존 진행은1년 차로 보충하고 날짜/완료 결과·재정·계약을 소급하지 않는다',()=>{
  const old=createSave(parent);old.schemaVersion=41;delete old.world.seasonYears;const input=structuredClone(old),world=restoreWorld(old);
  assert.deepEqual(old,input);assert.deepEqual(world,{...parent,aiGrowth:createAiGrowth(parent.day),counseling:createCounseling(parent)});assert.equal(newYearIssue(world),null);startNextYear(world);trip(world);
});

test('연도/경계·과거 맵/상금/중복 기록·현재 연도의 과거 영수증 혼입을 거부한다',()=>{
  const world=nextYear();
  for(const mutate of [w=>w.seasonYears.year++,w=>w.seasonYears.startedDay--,w=>w.seasonYears.archives[0].year=2,
    w=>w.seasonYears.archives[0].endedDay=364,w=>w.seasonYears.archives[0].calendar.phase='season',
    w=>w.seasonYears.archives[0].worldSeason.fixtures[0].maps[0].seed++,w=>w.seasonYears.archives[0].officialRecords.receipts[0].reward=100000,
    w=>w.seasonYears.archives[0].officialRecords.receipts.push(w.seasonYears.archives[0].officialRecords.receipts[0]),
    w=>w.officialRecords.receipts.push(w.seasonYears.archives[0].officialRecords.receipts[0])]){
    const copy=structuredClone(world);mutate(copy);assert.throws(()=>createSave(copy));}
});

test('연도별 조회는 상세 결과·완료 맵·출전을 표시하고 지난 경기를 실행할 수 없으며 원본을 보존한다',t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  const world=nextYear(),before=structuredClone(world),current=seasonScreen(world).innerHTML,history=seasonScreen(world,1).innerHTML;
  assert.match(current,/2년 차 · 1주 차/);assert.match(current,/1년 차 기록/);assert.match(history,/SEASON HISTORY \/ READ ONLY/);assert.match(history,/대진·완료 맵·출전 명단/);
  assert.match(history,/세계 리그 보관 기록/);assert.doesNotMatch(history,/data-action="start-official"|data-action="pick-/);assert.deepEqual(world,before);
  const free=seasonScreen(parent).innerHTML;assert.match(free,/data-action="start-next-year"/);
});
