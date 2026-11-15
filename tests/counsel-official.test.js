import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { advanceWeek } from '../src/game/calendar.js';
import { nextOfficialFixture,beginOfficialMatch,finishOfficialWeek } from '../src/game/official-match.js';
import { officialSeason,recordPcMatch } from '../src/game/pc-season.js';
import { officialLineups,applyOfficialReceipt } from '../src/game/official-records.js';
import { pickDomesticMaps } from '../src/game/domestic-season.js';
import { recordBo3Map } from '../src/game/pc-playoffs.js';
import { selectWorldMap,nextWorldFixture } from '../src/game/world-groups.js';
import { drawCounsels,availableCounsels,answerCounseling } from '../src/game/counseling.js';
import { createSave,restoreWorld } from '../src/storage/save-data.js';
import { summaryFixture } from './match-report-fixture.js';
import { cityReady,trip } from './city-fixture.js';
import { ready as finalsReady,fill as fillFinal } from './world-finals-fixture.js';
import { counselWorld,finishCounselFixture } from './counseling-fixture.js';
import { evaluateCounseling } from '../src/game/counseling.js';
import { getClubView } from '../src/game/world-selectors.js';
import { effectiveStats } from '../src/game/happiness.js';
import { createPractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';

// 1번에서 검증한 기록 규약을 사용하는 합성 완료 맵이다. 상담 연결과 원자적 저장 경계를 분리 검사한다.
function payload(world,fixture) {
  const mine=fixture.homeClubId===world.playerClubId,score={homeScore:mine?13:6,awayScore:mine?6:13};
  const mapNumber=(fixture.scores?.length??0)+1;
  const clone={...fixture,lineups:fixture.lineups??world.officialRecords.active.lineups,result:score,
    ...(fixture.scores?{scores:[...fixture.scores,score]}:{})};
  return {home:13,away:6,pausesRemaining:2,report:summaryFixture(world,clone,mapNumber)};
}
function finishOtherGames(world,fixture) {
  const season=officialSeason(world);
  const others=fixture.kind==='world-final'?season.playoffs.series:season.fixtures.filter(item=>item.week===fixture.week);
  for(const other of others) {
    if(other.result || [other.homeClubId,other.awayClubId].includes(world.playerClubId))continue;
    if(fixture.kind==='world-final'){fillFinal(world,other);continue;}
    const lineups=officialLineups(world,other);
    if(other.maps){pickDomesticMaps(other,'home',other.maps[0].mapId);other.lineups=lineups;while(!other.result)recordBo3Map(other,{homeScore:13,awayScore:6});}
    else assert.equal(recordPcMatch(season,other.id,{homeScore:13,awayScore:6}).ok,true);
    applyOfficialReceipt(world,other,lineups);
  }
}
function pcWithDraw() {
  for(let seed=0;seed<100;seed++) {
    const world=createWorld(createClub('Auto Counsel').club,seed);world.seasonCalendar={mode:'legacy',phase:'season'};
    advanceWeek(world,{official:true});const fixture=nextOfficialFixture(world);
    if(drawCounsels(seed,{year:1,fixtureId:fixture.id},[{playerId:'probe',type:'team-win',weight:1}]).selected.length) {
      finishOtherGames(world,fixture);beginOfficialMatch(world,fixture.id);return world;
    }
  }
  assert.fail('no draw fixture');
}

test('새 공식 BO1 결과·요약·상담/대사 선택을 함께 저장하며 로드 후 재판정하지 않는다',async()=>{
  const world=pcWithDraw(),before=structuredClone(world),fixture=nextOfficialFixture(world);
  const result=await finishOfficialWeek(world,{score:payload(world,fixture)});
  assert.deepEqual(world,before);assert.equal(result.matchReports.length,1);assert.ok(availableCounsels(result).length);
  const record=result.counseling.records.find(record=>record.fixtureId===fixture.id);assert.equal(record.reason,'draw');
  assert.ok(record.counsels.every(counsel=>typeof counsel.contentId==='string'));trip(result);
  const restored=restoreWorld(createSave(result));assert.deepEqual(restored.counseling,result.counseling);
});

test('BO3는 중간 맵에서 추첨하지 않고 전체 완료 뒤 한 번만 판정한다',async()=>{
  let world=cityReady();const fixture=nextOfficialFixture(world);finishOtherGames(world,fixture);
  beginOfficialMatch(world,fixture.id);world=await finishOfficialWeek(world,{score:payload(world,fixture)});
  assert.ok(!world.counseling.records.some(record=>record.fixtureId===fixture.id));trip(world);
  const next=nextOfficialFixture(world);beginOfficialMatch(world,next.id);
  world=await finishOfficialWeek(world,{score:payload(world,next)});
  assert.equal(world.counseling.records.filter(record=>record.fixtureId===fixture.id && record.reason==='draw').length,1);trip(world);
});

test('BO5도 세 번째 승리 전까지 판정하지 않고 정상 시리즈 종료에서만 연결한다',async()=>{
  let world=finalsReady();let fixture=nextWorldFixture(world);selectWorldMap(world,fixture.id,fixture.maps[0].mapId);finishOtherGames(world,fixture);
  const id=fixture.id;
  for(let map=1;map<=3;map++) {
    fixture=nextWorldFixture(world);beginOfficialMatch(world,fixture.id);world=await finishOfficialWeek(world,{score:payload(world,fixture)});
    assert.equal(world.counseling.records.filter(record=>record.fixtureId===id).length,Number(map===3));trip(world);
  }
});

test('기권과 일부 맵 요약이 없는 시리즈는 새 상담을 만들어내지 않는다',async()=>{
  for(const forfeit of [true,false]) {
    let world=cityReady();const fixture=nextOfficialFixture(world);finishOtherGames(world,fixture);
    beginOfficialMatch(world,fixture.id);world=await finishOfficialWeek(world,{score:{home:13,away:6,pausesRemaining:2}});
    if(forfeit)world=await finishOfficialWeek(world,{forfeit:true});
    else {const next=nextOfficialFixture(world);beginOfficialMatch(world,next.id);world=await finishOfficialWeek(world,{score:payload(world,next)});}
    assert.equal(availableCounsels(world).length,0);
    if(!forfeit)assert.equal(world.counseling.records.find(record=>record.fixtureId===fixture.id).reason,'incomplete');trip(world);
  }
});

test('상담 답변 효과는 새 경기의 기존 행복도/피로 보정에 반영되고 기본 능력은 유지된다',()=>{
  let world,counsel;
  for(let seed=0;seed<100;seed++) {
    world=counselWorld(seed);const fixture=finishCounselFixture(world);evaluateCounseling(world,fixture.id);counsel=availableCounsels(world)[0];if(counsel)break;
  }
  assert.ok(counsel);const player=world.players.find(player=>player.id===counsel.playerId);player.morale.happiness=44;player.fatigue=50;
  const before={aim:player.aim,intelligence:player.intelligence,stamina:player.stamina};
  assert.equal(answerCounseling(world,counsel.id,'advise').ok,true);
  const practice=createPractice(RELAY_MAP,getClubView(world),getClubView(world,world.clubs[1].id),{combat:true});
  const actor=practice.actors.find(actor=>actor.playerId===player.id),stats=effectiveStats(player);
  for(const key of Object.keys(before)){assert.equal(player[key],before[key]);assert.equal(actor[key],stats[key]);}
  assert.equal(player.morale.happiness,46);assert.equal(player.fatigue,47);trip(world);
});
