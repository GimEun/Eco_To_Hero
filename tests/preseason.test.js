import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { advanceWeek, advanceDay } from '../src/game/calendar.js';
import { officialWeekStatus } from '../src/game/weekly-official.js';
import { nextOfficialFixture, beginOfficialMatch } from '../src/game/official-match.js';
import { isPreseason, recruitmentWindowIssue } from '../src/game/season-calendar.js';
import { recruitPlayer, signingFee, replaceStarter } from '../src/game/roster.js';
import { transferQuote, negotiateTransfer } from '../src/game/transfers.js';
import { renewContract } from '../src/game/contracts.js';
import { getClubView, getAffiliations } from '../src/game/world-selectors.js';
import { selectWeeklyActions } from '../src/game/training.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';
import { randomUnit } from '../src/game/random.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { recruitmentCell } from '../src/ui/roster-management.js';
const sample = () => createWorld(createClub('Preseason').club, 42);
const trip = world => assert.deepEqual(restoreWorld(createSave(world)), world);
const choices = (world, action) => getClubView(world).playerIds.map(playerId => ({ playerId, action }));
function freeAgent(world) {
  const assigned = getAffiliations(world);
  return world.players.find(player => !assigned.has(player.id) && ['aim','intelligence','stamina'].every(key => player[key] <= 54) && signingFee(player) <= world.clubs[0].balance);
}
test('새 게임의 4주 비시즌은 훈련·계약·급여를 처리하고 5주 차 공식 준비부터 연다', () => {
  const world = sample(), club = world.clubs[0], duration = Object.values(club.contracts)[0].remainingDays;
  assert.equal(isPreseason(world), true); assert.equal(officialWeekStatus(world).canPlay, false);
  assert.throws(() => beginOfficialMatch(world, nextOfficialFixture(world).id));
  const agent = freeAgent(world); assert.equal(recruitPlayer(world, agent.id).ok, true);
  for (let week = 1; week <= 4; week++) {
    assert.equal(selectWeeklyActions(world, choices(world, week % 2 ? 'aim' : 'intelligence')).ok, true);
    assert.equal(advanceWeek(world, { official: true }).advancedDays, 7);
    assert.equal(world.pcSeason.weekSchedule, null); assert.ok(world.pcSeason.fixtures.every(fixture => !fixture.result));
    assert.equal(isPreseason(world), week < 4); trip(world);
  }
  assert.equal(world.day, 29); assert.equal(club.finance.settlements.length, 4);
  assert.equal(Object.values(club.contracts)[0].remainingDays, duration - 28);
  assert.ok(world.players.find(player => player.id === club.playerIds[0]).training.experience.aim > 0);
  assert.equal(advanceWeek(world, { official: true }).advancedDays, 6);
  assert.equal(world.day, 35); assert.equal(officialWeekStatus(world).canPlay, true); trip(world);
});
test('4주 마지막 날 이벤트는 저장 후 계속하며 선택·남은 일정 완료 전에 시즌으로 넘어가지 않는다', () => {
  let world = sample(); for (let i=0;i<3;i++) advanceWeek(world);
  for (let seed=0;seed<10000;seed++) {
    const random={randomState:seed};
    if (randomUnit(random)<.6 && 1+Math.floor(randomUnit(random)*7)===7) { world.playerEvents.randomState=seed; break; }
  }
  const result = advanceWeek(world, { official: true, events: true });
  assert.equal(result.eventPending, true); assert.equal(world.day, 29); assert.equal(isPreseason(world), true); trip(world);
  world = restoreWorld(createSave(world)); assert.equal(resolvePlayerEvent(world, 'decline').ok, true);
  assert.equal(advanceWeek(world, { official:true, events:true }).advancedDays, 0);
  assert.equal(isPreseason(world), false); assert.equal(world.day,29); assert.equal(world.pcSeason.weekSchedule,null); trip(world);
});
test('4주 팀 훈련은 보상을 마칠 때 시즌 전환하며 반복 정산과 조기 경기 시작을 막는다', () => {
  const world = sample(); for(let i=0;i<3;i++) advanceWeek(world);
  assert.equal(beginTeamTraining(world, {official:true}).ok,true);
  assert.equal(world.day,29); assert.equal(isPreseason(world),true); trip(world);
  assert.equal(advanceWeek(world,{official:true}).ok,false);
  const pending = structuredClone(world); assert.equal(advanceDay(world).ok,false); assert.deepEqual(world,pending);
  assert.throws(()=>beginOfficialMatch(world,nextOfficialFixture(world).id));
  const away = world.clubs.find(club=>club.id!==world.playerClubId);
  const state=createPractice(RELAY_MAP,getClubView(world),getClubView(world,away.id),{seed:42});
  advancePractice(state,RELAY_MAP,160000); assert.equal(state.complete,true);
  assert.equal(settleTeamTraining(world,state,29).ok,true); assert.equal(isPreseason(world),false);
  assert.equal(settleTeamTraining(world,state,29).ok,false); trip(world);
});
test('시즌 영입은 화면·자유계약·이적 API 모두 거절하되 재계약·주전 교체는 유지한다', () => {
  const world=sample(),club=world.clubs[0],agent=freeAgent(world);
  assert.equal(recruitPlayer(world,agent.id).ok,true);
  const other=world.clubs.find(item=>item.id!==club.id && item.leagueId==='pc');
  const target=other.playerIds[0];
  for(let i=0;i<4;i++)advanceWeek(world,{official:true});
  const candidate=freeAgent(world),before=structuredClone(world);
  assert.equal(recruitPlayer(world,candidate.id).ok,false);
  assert.equal(transferQuote(world,target).ok,false); assert.equal(negotiateTransfer(world,target,100).ok,false);
  assert.match(recruitmentCell(world,candidate,getAffiliations(world)),/시즌 중 영입 불가/);
  assert.doesNotMatch(recruitmentCell(world,candidate,getAffiliations(world)),/시즌 중에는 선수를|비시즌에 영입하세요/);
  assert.match(recruitmentCell(world,world.players.find(player=>player.id===target),getAffiliations(world)),/시즌 중 영입 불가/);
  assert.deepEqual(world,before);
  assert.equal(replaceStarter(world,agent.id,club.lineupIds[0]).ok,true);
  assert.equal(renewContract(world,club.playerIds[0],84).ok,true); trip(world);
});
test('v29 저장은 원래 날짜·계약·경기 일정을 보존하며 시즌으로 복원하고 영입을 잠근다', () => {
  const world=sample(),old=createSave(world); old.schemaVersion=29; delete old.world.seasonCalendar;
  const input=structuredClone(old),restored=restoreWorld(old);
  assert.deepEqual(old,input); assert.deepEqual(restored.seasonCalendar,{mode:'legacy',phase:'season'});
  assert.equal(restored.day,world.day); assert.deepEqual(restored.clubs,world.clubs); assert.deepEqual(restored.pcSeason,world.pcSeason);
  assert.ok(recruitmentWindowIssue(restored));
  assert.equal(advanceWeek(restored,{official:true}).advancedDays,6); assert.equal(officialWeekStatus(restored).canPlay,true); trip(restored);
});
test('연간 비시즌은 연도만 바뀌었다고 영입을 다시 열지 않으며 잘못된 전환 저장을 거부한다', () => {
  const world=sample(); for(let i=0;i<4;i++)advanceWeek(world);
  world.day=365; assert.ok(recruitmentWindowIssue(world));
  const fresh=sample();
  for(const mutate of [
    value=>{delete value.seasonCalendar;}, value=>{value.seasonCalendar.phase='season';},
    value=>{value.seasonCalendar.mode='legacy';}, value=>{value.seasonCalendar.phase='unknown';},
  ]) { const copy=structuredClone(fresh); mutate(copy); assert.throws(()=>createSave(copy)); }
});
