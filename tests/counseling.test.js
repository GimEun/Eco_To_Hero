import test from 'node:test';
import assert from 'node:assert/strict';
import { counselWorld,finishCounselFixture } from './counseling-fixture.js';
import { createCounseling,evaluateCounseling,drawCounsels,pendingCounsels,resolveCounsel } from '../src/game/counseling.js';
import { COUNSEL_TYPES,collectCounselCandidates,counselKey } from '../src/game/counseling-candidates.js';
import { createSave,restoreWorld } from '../src/storage/save-data.js';
import { releasePlayer } from '../src/game/roster.js';
import { advanceWeek } from '../src/game/calendar.js';
import { startNextYear } from '../src/game/season-years.js';
import { completeAnnual } from './season-years-fixture.js';
import { summaryFixture } from './match-report-fixture.js';
import { appendMatchReport,reportFixture } from '../src/game/match-reports.js';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';

const trip=world=>assert.deepEqual(restoreWorld(createSave(world)),world);
function drawnWorld(reserve=false) {
  for(let seed=0;seed<100;seed++) {
    const world=counselWorld(seed,reserve),fixture=finishCounselFixture(world);
    const result=evaluateCounseling(world,fixture.id);
    if(result.counsels.length)return {world,fixture,result};
  }
  assert.fail('no counseling fixture');
}

test('실제 요약의 내 출전 선수/주요 사건과 기존 상태만 후보로 쓰고 상대·후보는 제외한다',()=>{
  const world=counselWorld(42,true),fixture=finishCounselFixture(world),club=world.clubs[0];
  const first=world.players.find(player=>player.id===club.lineupIds[0]);first.morale.happiness=44;first.fatigue=50;
  const rows=collectCounselCandidates(world,{year:1,fixtureId:fixture.id},1);
  assert.ok(rows.some(row=>row.type==='first-kill' && row.playerId===first.id && row.weight===2));
  assert.ok(rows.some(row=>row.type==='low-happiness' && row.evidence.value===44));
  assert.ok(rows.some(row=>row.type==='high-fatigue' && row.evidence.value===50));
  assert.ok(rows.every(row=>club.lineupIds.includes(row.playerId)));
  assert.equal(rows.find(row=>row.type==='team-win').weight,1);
  const before=structuredClone(world);collectCounselCandidates(world,{year:1,fixtureId:fixture.id},1);assert.deepEqual(world,before);
});

test('60/20/10/5%는 첫 실패에서 멈추고 최대4개·선수/종류 중복을 허용하지 않는다',()=>{
  const entry={year:1,fixtureId:'pc-1-w1-m1'},types=Object.keys(COUNSEL_TYPES);
  const pool=Array.from({length:5},(_,i)=>types.map(type=>({playerId:`p${i}`,type,weight:COUNSEL_TYPES[type]}))).flat();
  let empty=false,four=false;
  for(let seed=0;seed<20000;seed++) {
    const draw=drawCounsels(seed,entry,pool),size=draw.selected.length;
    assert.ok(size<=4);assert.equal(new Set(draw.selected.map(row=>row.playerId)).size,size);assert.equal(new Set(draw.selected.map(row=>row.type)).size,size);
    assert.equal(draw.rolls.length,size*2+(size<4?1:0));
    if(!size){empty=true;assert.ok(draw.rolls[0]>=.6);}
    if(size===4)four=true;
    if(empty && four)break;
  }
  assert.equal(empty,true);assert.equal(four,true);
  assert.deepEqual(drawCounsels(42,entry,[]),{rolls:[],selected:[]});
});

test('같은 경기 재호출·새로고침은 재추첨·중복 지급을 막고 기존 난수/기본 능력/자금을 소비하지 않는다',()=>{
  const {world,fixture}=drawnWorld(),before=structuredClone(world);
  assert.equal(evaluateCounseling(world,fixture.id).ok,false);assert.deepEqual(world,before);trip(world);
  const restored=restoreWorld(createSave(world)),snapshot=structuredClone(restored);
  assert.equal(evaluateCounseling(restored,fixture.id).ok,false);assert.deepEqual(restored,snapshot);
  const state=counselWorld(6),match=finishCounselFixture(state),prior=structuredClone(state);evaluateCounseling(state,match.id);
  for(const key of ['players','clubs','actionRandomState','playerEvents','stocks'])assert.deepEqual(state[key],prior[key]);
});

test('미완료 요약은 추첨하지 않되 정상 경기 수를 세고 기권은 추첨/쿨다운 수에서 제외한다',()=>{
  const world=counselWorld(),first=finishCounselFixture(world,{report:false});
  assert.equal(evaluateCounseling(world,first.id).record.reason,'incomplete');assert.equal(world.counseling.sequence,1);
  const second=finishCounselFixture(world,{forfeit:true});
  assert.equal(evaluateCounseling(world,second.id).record.reason,'forfeit');assert.equal(world.counseling.sequence,1);trip(world);
  const before=structuredClone(world);assert.equal(evaluateCounseling(world,first.id).ok,false);assert.deepEqual(world,before);
});

test('발생한 선수 또는 종류는 이후5경기에서 제외하고6번째부터 후보로 다시 허용한다',()=>{
  const {world,result}=drawnWorld(),picked=result.counsels[0];
  for(let i=2;i<=7;i++) {
    const fixture=finishCounselFixture(world);
    const rows=collectCounselCandidates(world,{year:1,fixtureId:fixture.id},i);
    if(i<=6)assert.ok(rows.every(row=>row.playerId!==picked.playerId && row.type!==picked.type));
    else assert.ok(rows.some(row=>row.playerId===picked.playerId && row.type===picked.type));
    evaluateCounseling(world,fixture.id);trip(world);
  }
});

test('명시적으로 답변할 때만 행복도/피로를 범위 내 반영하고 같은 답변을 재적용하지 않는다',()=>{
  const {world}=drawnWorld(),counsel=pendingCounsels(world)[0],player=world.players.find(player=>player.id===counsel.playerId);
  player.morale.happiness=98;player.fatigue=2;
  const original=structuredClone(world),result=resolveCounsel(world,counsel.id,{id:'encourage',effect:{happiness:7,fatigue:-5}});
  assert.equal(result.ok,true);assert.equal(player.morale.happiness,100);assert.equal(player.fatigue,0);
  assert.equal(player.aim,original.players.find(p=>p.id===player.id).aim);trip(world);
  const restored=restoreWorld(createSave(world)),before=structuredClone(restored);
  assert.equal(resolveCounsel(restored,counsel.id,{id:'encourage',effect:{happiness:7}}).ok,false);assert.deepEqual(restored,before);
});

test('잘못된 효과·후속 일정·구단을 떠난 선수에 대한 답변은 전체 상태를 유지한다',()=>{
  const {world}=drawnWorld(true),counsel=pendingCounsels(world)[0];
  for(const answer of [{id:'bad',effect:{aim:1}},{id:'bad',effect:7},{id:'bad',effect:{fatigue:101}},
    {id:'bad',effect:{},followUp:{type:'missing',afterMatches:1}},{id:'bad',effect:{},followUp:{type:'team-win',afterMatches:0}}]) {
    const before=structuredClone(world);assert.equal(resolveCounsel(world,counsel.id,answer).ok,false);assert.deepEqual(world,before);
  }
  assert.equal(releasePlayer(world,counsel.playerId).ok,true);const before=structuredClone(world);
  assert.equal(resolveCounsel(world,counsel.id,{id:'reply',effect:{happiness:5}}).ok,false);assert.deepEqual(world,before);trip(world);
});

test('후속 상담은 저장 후에도 예정 시점·쿨다운·동일 경기 중복을 지킨다',()=>{
  let verified=false;
  for(let seed=0;seed<100 && !verified;seed++) {
    let world=counselWorld(seed);const first=finishCounselFixture(world),result=evaluateCounseling(world,first.id);
    if(!result.counsels.length)continue;
    const source=result.counsels[0];resolveCounsel(world,source.id,{id:'follow',effect:{},followUp:{type:source.type,afterMatches:1}});
    world=restoreWorld(createSave(world));
    for(let i=2;i<=7;i++) {
      const fixture=finishCounselFixture(world);evaluateCounseling(world,fixture.id);
      if(i<=6)assert.equal(world.counseling.followUps[0].status,'scheduled');
    }
    if(world.counseling.followUps[0].status==='consumed') {trip(world);verified=true;}
  }
  assert.equal(verified,true);
});

test('v45 기존 저장은 과거 경기를 처리 완료 기준으로 삼고 자동 추첨을 하지 않는다',()=>{
  const world=counselWorld(),fixture=finishCounselFixture(world),old=createSave(world);old.schemaVersion=45;delete old.world.counseling;
  const before=structuredClone(old),restored=restoreWorld(old);assert.deepEqual(old,before);
  assert.deepEqual(restored,{...world,counseling:createCounseling(world)});assert.equal(restored.counseling.sequence,0);
  assert.equal(evaluateCounseling(restored,fixture.id).ok,false);trip(restored);
  const next=finishCounselFixture(restored);assert.equal(evaluateCounseling(restored,next.id).record.sequence,1);trip(restored);
});

test('확률·중복·효과·후속·카운터를 조작한 저장을 거부한다',()=>{
  const {world}=drawnWorld(),counsel=pendingCounsels(world)[0];
  resolveCounsel(world,counsel.id,{id:'reply',effect:{happiness:2},followUp:{type:counsel.type,afterMatches:2}});
  for(const mutate of [s=>s.sequence++,s=>s.records[0].rolls[0]=1,s=>s.records.push(structuredClone(s.records[0])),
    s=>s.records[0].counsels[0].type='missing',s=>s.records[0].counsels[0].reply.after.happiness=0,
    s=>s.records[0].candidates[0].weight=999,s=>s.followUps[0].dueSequence++,s=>s.followUps[0].status='consumed']) {
    const copy=structuredClone(world);mutate(copy.counseling);assert.throws(()=>createSave(copy),/상담 판정/);
  }
});

test('이번 단계는 일반 주간을 막거나 자동 상담을 발생시키지 않는다',()=>{
  const world=counselWorld(),before=structuredClone(world.counseling);advanceWeek(world);
  assert.deepEqual(world.counseling,before);assert.deepEqual(pendingCounsels(world),[]);trip(world);
});

test('새해와 이전 연도의 같은 경기 ID는 기록·쿨다운을 보존하면서 구분한다',()=>{
  const world=completeAnnual(createWorld(createClub('Counsel Years').club,42));
  world.counseling=createCounseling(world);const before=structuredClone(world.counseling);startNextYear(world);trip(world);
  assert.deepEqual(world.counseling,before);completeAnnual(world);
  const receipt=world.officialRecords.receipts.filter(receipt=>{
    const fixture=reportFixture(world,{year:2,fixtureId:receipt.fixtureId});return [fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId);
  }).at(-1),fixture=reportFixture(world,{year:2,fixtureId:receipt.fixtureId});
  // 마지막 BO5의 모든 완료 맵을 합성 요약으로 채워 판정 단위를 확인한다.
  for(let index=0;index<fixture.scores.length;index++) {
    const score=fixture.scores[index],map=summaryFixture(world,fixture,index+1);
    // 이 합성 완주 경기는 모든 맵의 점수가 같다.
    assert.deepEqual(score,fixture.scores[0]);appendMatchReport(world,fixture.id,index+1,world.day,map);
  }
  const result=evaluateCounseling(world,fixture.id,2);assert.equal(result.ok,true);
  const normal=world.officialRecords.receipts.filter(receipt=>{
    const fixture=reportFixture(world,{year:2,fixtureId:receipt.fixtureId});return [fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId) && !fixture.result.forfeit;
  });
  assert.equal(result.record.sequence,normal.length);
  assert.ok(world.counseling.records.some(record=>record.year===1 && record.fixtureId===fixture.id));
  assert.equal(counselKey(result.record),`2:${fixture.id}`);trip(world);
});

test('판정 호출을 놓친 정상5경기도 쿨다운에 세되 지난 상담을 소급 생성하지 않는다',()=>{
  const {world,result}=drawnWorld(),source=result.counsels[0];
  for(let index=0;index<5;index++)finishCounselFixture(world);
  const last=finishCounselFixture(world),resultLast=evaluateCounseling(world,last.id);
  assert.equal(resultLast.record.sequence,7);assert.equal(world.counseling.records.filter(record=>record.reason==='skipped').length,5);
  assert.ok(resultLast.record.candidates.some(row=>row.playerId===source.playerId && row.type===source.type));
  assert.ok(world.counseling.records.filter(record=>record.reason==='skipped').every(record=>!record.counsels.length));trip(world);
});

test('고정10000시드에서 첫 슬롯60%와 사건2:일반1 가중치가 선택 빈도에 반영된다',()=>{
  const entry={year:1,fixtureId:'pc-1-w1-m1'},pool=[{playerId:'p1',type:'first-kill',weight:2},{playerId:'p2',type:'team-win',weight:1}];
  let successes=0,major=0;
  for(let seed=0;seed<10000;seed++) {
    const picked=drawCounsels(seed,entry,pool).selected[0];
    if(picked){successes++;if(picked.type==='first-kill')major++;}
  }
  assert.ok(successes/10000>.57 && successes/10000<.63);
  assert.ok(major/successes>.63 && major/successes<.70);
});

test('구단을 떠난 선수의 예정 후속 상담은 취소 상태로 보존하고 새로 발생시키지 않는다',()=>{
  const {world}=drawnWorld(true),source=pendingCounsels(world)[0];
  assert.equal(resolveCounsel(world,source.id,{id:'later',effect:{},followUp:{type:source.type,afterMatches:1}}).ok,true);
  assert.equal(releasePlayer(world,source.playerId).ok,true);
  const fixture=finishCounselFixture(world);evaluateCounseling(world,fixture.id);
  assert.equal(world.counseling.followUps[0].status,'expired');assert.equal(world.counseling.followUps[0].consumedBy,null);
  assert.ok(pendingCounsels(world).every(counsel=>counsel.playerId!==source.playerId));trip(world);
});
