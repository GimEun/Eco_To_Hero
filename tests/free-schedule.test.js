import test from 'node:test';
import assert from 'node:assert/strict';
import { finishedCity,trip } from './city-fixture.js';
import { finishedProvince } from './province-fixture.js';
import { finishedNational } from './national-fixture.js';
import { completedGroups } from './world-fixture.js';
import { completeRanked } from './world-ranked-fixture.js';
import { finished,ready } from './world-finals-fixture.js';
import { isFreeSchedule,recruitmentWindowIssue,completeSeason } from '../src/game/season-calendar.js';
import { officialWeekStatus,beginOfficialSchedule } from '../src/game/weekly-official.js';
import { advanceWeek } from '../src/game/calendar.js';
import { beginOfficialMatch } from '../src/game/official-match.js';
import { createSave,restoreWorld,serializeBackup,parseBackup } from '../src/storage/save-data.js';
import { recruitPlayer,recruitmentIssue } from '../src/game/roster.js';
import { transferQuote,negotiateTransfer } from '../src/game/transfers.js';
import { signSponsor } from '../src/game/sponsors.js';
import { selectTraining } from '../src/game/training.js';
import { beginTeamTraining,settleTeamTraining } from '../src/game/team-training.js';
import { createPractice,advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { getClubView,getAffiliations } from '../src/game/world-selectors.js';
import { seasonScreen } from '../src/ui/season-screen.js';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { renewContract } from '../src/game/contracts.js';

test('국내 각 단계 탈락·세계 조별/순위별 탈락·세계 종료는 자유 일정과 영입을 연다',()=>{
  for(const world of [finishedCity(10),finishedProvince(12),finishedNational(12),completedGroups({last:true}),completeRanked({last:true}),finished()]) {
    assert.equal(world.seasonCalendar.phase,'offseason');assert.equal(isFreeSchedule(world),true);assert.equal(recruitmentWindowIssue(world),null);
    assert.equal(officialWeekStatus(world).phase,'free');assert.equal(officialWeekStatus(world).canPlay,false);assert.match(getClubView(world).seasonCalendarLabel,/자유 일정.*영입 가능/);
    const before=structuredClone(world);assert.equal(beginOfficialSchedule(world,false),false);assert.deepEqual(world,before);trip(world);
    assert.equal(world.worldSeason?.playoffs?.settled || !world.worldSeason?.playoffs,true);
  }
});

test('진출권과 미완료 BO5·세계 결정전/주간 정산은 자유 일정으로 오인하지 않는다',()=>{
  for(const world of [finishedCity(),finishedProvince(),finishedNational(),completedGroups(),completeRanked(),ready(),completedGroups({cycle:true})]) {
    assert.equal(isFreeSchedule(world),false);assert.ok(recruitmentWindowIssue(world));assert.equal(completeSeason(world),false);trip(world);
  }
  const world=ready();assert.throws(()=>beginOfficialMatch(world,'fake'));assert.notEqual(officialWeekStatus(world).phase,'free');
});

test('자유 일정은 기존 영입 조건을 지키며 자유계약·타 구단 영입 API를 다시 연다',()=>{
  const world=finishedCity(10),club=world.clubs.find(club=>club.id===world.playerClubId),affiliations=getAffiliations(world);
  const agent=world.players.find(player=>!affiliations.has(player.id) && !recruitmentIssue(club,player));assert.ok(agent);
  assert.equal(recruitPlayer(world,agent.id).ok,true);
  const seller=world.clubs.find(item=>item.id!==world.playerClubId && item.leagueId==='pc');
  const target=seller.playerIds.find(id=>transferQuote(world,id).ok);assert.ok(target);assert.equal(negotiateTransfer(world,target,100).ok,true);trip(world);
  const high=world.players.find(player=>!getAffiliations(world).has(player.id) && recruitmentIssue(club,player));assert.ok(high);assert.equal(recruitPlayer(world,high.id).ok,false);
});

test('자유 일정 한 주는 공식 경기 없이 훈련·방송 수입·계약7일·급여를 그대로 반영한다',()=>{
  const world=finishedCity(10),club=world.clubs[0],id=club.lineupIds[0];
  for(const playerId of club.playerIds)renewContract(world,playerId,84);
  for(const playerId of club.playerIds)selectTraining(world,playerId,playerId===id?'aim':'broadcast');
  const before=structuredClone(world),result=advanceWeek(world,{official:true});assert.equal(result.ok,true);assert.equal(result.advancedDays,7);
  assert.ok(result.actionIncome>0);assert.equal(world.day,before.day+7);assert.equal(world.pcSeason.number,1);assert.equal(world.citySeason.weekSchedule,null);
  for(const playerId of club.playerIds)assert.equal(club.contracts[playerId].remainingDays,before.clubs[0].contracts[playerId].remainingDays-7);
  const player=world.players.find(player=>player.id===id),old=before.players.find(player=>player.id===id);assert.ok(player.aim>old.aim || player.training.experience.aim>old.training.experience.aim);
  assert.deepEqual(world.officialRecords,before.officialRecords);assert.deepEqual(world.citySeason,before.citySeason);assert.equal(club.finance.settlements.at(-1).day,world.day);trip(world);
});

test('자유 일정 팀 훈련은7일 뒤 보상을 정산하고 공식 일정이나 다음 해를 만들지 않는다',()=>{
  const world=completedGroups({last:true}),start=world.day;assert.equal(beginTeamTraining(world,{official:true}).advancedDays,7);assert.equal(world.teamTraining.status,'pending');
  assert.equal(isFreeSchedule(world),true);assert.equal(world.worldSeason.weekSchedule,null);trip(world);
  const other=world.clubs.find(club=>club.id!==world.playerClubId),state=createPractice(RELAY_MAP,getClubView(world),getClubView(world,other.id),{seed:42});advancePractice(state,RELAY_MAP,160000);
  assert.equal(settleTeamTraining(world,state,start+7).ok,true);assert.equal(world.seasonCalendar.phase,'offseason');assert.equal(world.worldSeason.ranked,null);trip(world);
});

test('v40 이미 종료 저장은 소급 정산 없이 전환하고 세계 시즌 스폰서만 종료한다',()=>{
  const world=completedGroups({last:true}),old=createSave(world);old.schemaVersion=40;old.world.seasonCalendar.phase='season';
  old.world.clubs[0].finance.sponsor={kind:'wins',remainingWeeks:0,broadcastDays:0,leagueId:'world',tier:1,progress:0,playerId:null};
  const before=structuredClone(old),restored=restoreWorld(old);assert.deepEqual(old,before);assert.equal(restored.seasonCalendar.phase,'offseason');assert.equal(restored.clubs[0].finance.sponsor.kind,'basic');
  assert.equal(restored.day,world.day);assert.equal(restored.clubs[0].balance,world.clubs[0].balance);assert.deepEqual(restored.worldSeason,world.worldSeason);
  assert.deepEqual(restored.clubs[0].finance.settlements,world.clubs[0].finance.settlements);assert.deepEqual(restored.players,world.players);trip(restored);
});

test('기존 방송 계약은 자유 일정 진입 후 잔여 기간을 유지하고 다음 정산에서만 한 주 감소한다',()=>{
  const world=finishedCity(10);for(const id of world.clubs[0].playerIds)renewContract(world,id,84);assert.equal(signSponsor(world,'broadcast').ok,true);const old=createSave(world);old.schemaVersion=40;old.world.seasonCalendar.phase='season';
  const restored=restoreWorld(old);assert.equal(restored.clubs[0].finance.sponsor.remainingWeeks,4);assert.equal(restored.clubs[0].finance.sponsor.kind,'broadcast');
  advanceWeek(restored,{official:true});assert.equal(restored.clubs[0].finance.sponsor.remainingWeeks,3);assert.equal(signSponsor(restored,'wins').ok,false);trip(restored);
});

test('자유 일정도 최소5명 계약 만료는 중단하고 재계약 후 남은 하루만 이어간다',()=>{
  const world=finishedCity(10),before=world.day,result=advanceWeek(world,{official:true});assert.equal(result.ok,false);assert.equal(result.advancedDays,6);
  assert.equal(world.weekDaysRemaining,1);assert.equal(isFreeSchedule(world),true);assert.equal(world.citySeason.weekSchedule,null);trip(world);
  for(const id of world.clubs[0].playerIds)renewContract(world,id,84);
  assert.equal(advanceWeek(world,{official:true}).advancedDays,1);assert.equal(world.day,before+7);trip(world);
});

test('기존 저장의 미완료 팀 훈련은 먼저 보존하고 보상 완료 뒤 자유 일정으로 전환한다',()=>{
  const world=completedGroups({last:true});beginTeamTraining(world,{official:true});const old=createSave(world);old.schemaVersion=40;old.world.seasonCalendar.phase='season';
  const restored=restoreWorld(old);assert.equal(restored.seasonCalendar.phase,'season');assert.ok(recruitmentWindowIssue(restored));assert.equal(restored.teamTraining.status,'pending');
  const other=restored.clubs.find(club=>club.id!==restored.playerClubId),state=createPractice(RELAY_MAP,getClubView(restored),getClubView(restored,other.id),{seed:42});advancePractice(state,RELAY_MAP,160000);
  assert.equal(settleTeamTraining(restored,state,restored.teamTraining.day).ok,true);assert.equal(restored.seasonCalendar.phase,'offseason');trip(restored);
});

test('종료 근거 없는 자유 일정 위조를 거부하며 세계 탈락 후 미시작 상위 단계는 열지 않는다',()=>{
  const world=createWorld(createClub('FreeTest').club,42),fake=structuredClone(world);fake.seasonCalendar.phase='offseason';assert.throws(()=>createSave(fake));
  for(const ended of [completedGroups({last:true}),completeRanked({last:true})]) {
    const archive=structuredClone(ended.worldSeason);assert.equal(beginOfficialSchedule(ended,false),false);advanceWeek(ended,{official:true});assert.deepEqual(ended.worldSeason,archive);trip(ended);
  }
});

test('자유 일정 상태·영입 안내·기존 결과는 저장과 화면에 표시하며52주 준비를 유도하지 않는다',t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({})};t.after(()=>{globalThis.document=old;});
  const world=completeRanked({last:true}),before=structuredClone(world),html=seasonScreen(world).innerHTML;
  assert.match(html,/자유 일정/);assert.match(html,/선수 영입이 다시 열렸습니다/);assert.doesNotMatch(html,/내 구단에서 52주 주간 행동을 준비하세요/);assert.deepEqual(world,before);
  assert.deepEqual(restoreWorld(parseBackup(serializeBackup(world))),world);
});
