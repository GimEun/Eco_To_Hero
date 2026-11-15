import { createCounseling } from '../src/game/counseling.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { trainAiClubs, createAiGrowth } from '../src/game/ai-growth.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { TRAINING_SKILLS } from '../src/config/training.js';
import { selectTraining } from '../src/game/training.js';
import { negotiateTransfer, transferQuote } from '../src/game/transfers.js';
import { createContract } from '../src/game/contracts.js';
import { getClubView, getAffiliations } from '../src/game/world-selectors.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { finishedCity, trip } from './city-fixture.js';
import { beginYearAdvance, advanceYearWeek, activeYearAdvance } from '../src/game/year-advance.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';
import { renewContract } from '../src/game/contracts.js';

function fixture() {
  const world = createWorld(createClub('AI Growth').club, 42), club = world.clubs[1];
  const player = world.players.find(player => player.id === club.playerIds[0]);
  for (const skill of TRAINING_SKILLS) player[skill] = 35;
  player.development = {potential:{aim:70,intelligence:70,stamina:70},growthRate:100};
  return {world,club,player};
}
function days(world, count) { for(let i=0;i<count;i++) assert.equal(advanceDay(world).ok,true); }

test('AI 소속만 기존 경험치 규칙으로 성장하고 계약·자금·명단·행동 난수는 유지한다', () => {
  const {world,player} = fixture(), before = structuredClone(world), assigned = getAffiliations(world);
  const freeIds = new Set(world.players.filter(p=>!assigned.has(p.id)).map(p=>p.id));
  days(world,7);
  assert.deepEqual(player.training.experience,{aim:70,intelligence:0,stamina:0});
  assert.equal(player.fatigue,14); assert.equal(player.morale.happiness,70);
  assert.deepEqual(world.clubs.slice(1),before.clubs.slice(1));
  assert.deepEqual(world.players.filter(p=>freeIds.has(p.id)),before.players.filter(p=>freeIds.has(p.id)));
  assert.equal(world.actionRandomState,before.actionRandomState); assert.deepEqual(world.playerEvents,before.playerEvents);
  assert.equal(world.players[0].training.focus,'rest'); assert.equal(world.players[0].aim,before.players[0].aim);
  trip(world);
});

test('주간 능력 순환과 피로30 이상 휴식은 경험치·행복도·회복에 기존 규칙을 쓴다', () => {
  const {world,player} = fixture();
  days(world,21); assert.deepEqual(player.training.experience,{aim:70,intelligence:70,stamina:70});
  assert.equal(player.fatigue,42); days(world,7);
  assert.equal(player.training.focus,'rest'); assert.equal(player.fatigue,7); assert.equal(player.morale.happiness,84);
  days(world,7); assert.equal(player.training.focus,'aim'); assert.equal(player.aim,36);
  assert.equal(player.training.experience.aim,40); trip(world);
});

test('성장 속도80/100/120%와 선수별 잠재력을 적용하며 최대 능력은 건너뛴다', () => {
  for (const rate of [80,100,120]) {
    const {world,player} = fixture(); player.development.growthRate = rate;
    days(world,7); assert.equal(player.training.experience.aim,7*rate/10);
    player.intelligence = player.development.potential.intelligence;
    days(world,1); assert.equal(player.training.focus,'stamina'); trip(world);
  }
  const {world,player} = fixture();
  player.aim = 69; player.training.experience.aim = 95;
  days(world,7); assert.equal(player.aim,70); assert.equal(player.training.experience.aim,0);
  for (const skill of TRAINING_SKILLS) {player[skill]=player.development.potential[skill];player.training.experience[skill]=0;}
  days(world,7); assert.equal(player.training.focus,'rest');
  assert.deepEqual(TRAINING_SKILLS.map(skill=>player[skill]),[70,70,70]); trip(world);
});

test('피로30 경계·고체력 피로 감소와 반복 휴식의 경험치 감소를 유지한다', () => {
  for(const [fatigue,expected] of [[29,'aim'],[30,'rest']]) {
    const {world,player} = fixture(); player.fatigue=fatigue; days(world,1); assert.equal(player.training.focus,expected);
  }
  const {world,player} = fixture(); player.stamina=80; player.development.potential.stamina=90;
  days(world,7); assert.equal(player.fatigue,7);
  const rest = fixture();
  for(const skill of TRAINING_SKILLS) {rest.player[skill]=70;rest.player.training.experience[skill]=50;}
  days(rest.world,14); assert.equal(rest.player.morale.happiness,91);
  assert.deepEqual(rest.player.training.experience,{aim:36,intelligence:36,stamina:36}); trip(rest.world);
});

test('AI 후보도 성장하고 영입/대체 영입 후에는 실제 소속에 맞춰 한 번만 계산한다', () => {
  const {world,player,club} = fixture(), quote = transferQuote(world,player.id);
  assert.equal(quote.ok,true); const replacement=quote.replacement;
  assert.equal(negotiateTransfer(world,player.id,100).ok,true);
  selectTraining(world,player.id,'intelligence'); const before=structuredClone(player);
  days(world,1);
  assert.equal(player.training.experience.intelligence,before.training.experience.intelligence+10);
  assert.equal(player.training.experience.aim,0); assert.equal(world.aiGrowth.plans[player.id],undefined);
  assert.equal(world.aiGrowth.plans[replacement.id].clubId,club.id);
  const free = world.players.find(p=>!getAffiliations(world).has(p.id)), ai = world.clubs.find(c=>c.leagueId==='world');
  ai.playerIds.push(free.id); ai.contracts[free.id]=createContract(free,undefined,world.day);
  const reserveBefore=structuredClone(free); days(world,1);
  assert.equal(world.aiGrowth.plans[free.id].clubId,ai.id); assert.notDeepEqual(free.training,reserveBefore.training); trip(world);
});

test('AI에서 빠져나온 선수는 추가 AI 훈련을 받지 않고 같은 주의 다른 AI 소속도 인식한다', () => {
  const {world,club,player} = fixture(); days(world,2);
  const replacement=world.players.find(p=>!getAffiliations(world).has(p.id));
  club.playerIds[club.playerIds.indexOf(player.id)]=replacement.id;
  club.lineupIds[club.lineupIds.indexOf(player.id)]=replacement.id;
  delete club.contracts[player.id];club.contracts[replacement.id]=createContract(replacement,undefined,world.day);
  const before=structuredClone(player); days(world,1); assert.deepEqual(player,before); assert.equal(world.aiGrowth.plans[player.id],undefined);
  const ai=world.clubs.find(c=>c.leagueId==='world'); ai.playerIds.push(player.id); ai.contracts[player.id]=createContract(player,undefined,world.day);
  days(world,1);assert.equal(world.aiGrowth.plans[player.id].clubId,ai.id);trip(world);
});

test('같은 날짜 재호출·일정 중단·파산은 추가 성장을 만들지 않는다', () => {
  const {world,player} = fixture();trainAiClubs(world); const before=structuredClone(player);
  assert.deepEqual(trainAiClubs(world),[]);assert.deepEqual(player,before);
  days(world,1);assert.deepEqual(player,before);trip(world);
  for(const contract of Object.values(world.clubs[0].contracts))contract.remainingDays=1;
  const stopped=structuredClone(world);assert.equal(advanceDay(world).ok,false);assert.deepEqual(world,stopped);
  world.clubs[0].balance=-10000;const bankrupt=structuredClone(world);trainAiClubs(world);assert.deepEqual(world,bankrupt);
});

test('중간 저장/복원은 주간 순환·성장을 이어가고 경기 관전은 날짜·능력을 바꾸지 않는다', () => {
  const {world} = fixture(); days(world,10);const restored=restoreWorld(createSave(world));
  days(world,18);days(restored,18);assert.deepEqual(restored,world);trip(world);
  const before=structuredClone(world), practice=createPractice(RELAY_MAP,getClubView(world),getClubView(world,world.clubs[1].id),{combat:true,seed:42});
  advancePractice(practice,RELAY_MAP,2000);assert.deepEqual(world,before);
});

test('v43 기존 저장은 능력·경험치·계약·재정을 보존하고 적용 시점부터 계산한다', () => {
  const {world} = fixture();days(world,10);const old=createSave(world);old.schemaVersion=43;delete old.world.aiGrowth;
  const snapshot=structuredClone(old),restored=restoreWorld(old);
  assert.deepEqual(old,snapshot);assert.deepEqual(restored,{...world,aiGrowth:createAiGrowth(world.day),counseling:createCounseling(world)});
  days(restored,1);assert.equal(restored.aiGrowth.lastDay,11);trip(restored);
  for(const mutate of [w=>w.aiGrowth.lastDay--,w=>w.aiGrowth.startedDay=w.day+1,w=>w.aiGrowth.plans.missing={},w=>Object.values(w.aiGrowth.plans)[0].nextSkill=3]) {
    const bad=structuredClone(restored);mutate(bad);assert.throws(()=>createSave(bad),/AI 구단 성장/);
  }
});

test('연말 진행도 일반 주간과 같은 AI 성장을 적용한다', () => {
  const world=finishedCity(10);for(const id of world.clubs[0].playerIds)renewContract(world,id,168);
  const normal=structuredClone(world);beginYearAdvance(world,world.clubs[0].playerIds.map(playerId=>({playerId,action:'rest'})));
  for(let i=0;i<30 && activeYearAdvance(world);i++) {
    const result=advanceYearWeek(world);advanceWeek(normal,{events:true});
    if(result.reason==='event') {resolvePlayerEvent(world,'decline');resolvePlayerEvent(normal,'decline');}
    assert.deepEqual(world.players,normal.players);assert.deepEqual(world.aiGrowth,normal.aiGrowth);
    if(result.reason==='blocked')break;
  }
  trip(world);
});

test('52주 성장도 잠재력·99 상한을 지키고 주간 회복과 저장을 유지한다', () => {
  const {world,player} = fixture();
  for(let day=0;day<364;day++) {
    if(day % 140 === 0)for(const id of world.clubs[0].playerIds)renewContract(world,id,168);
    days(world,1);
    for(const skill of TRAINING_SKILLS)assert.ok(player[skill]<=player.development.potential[skill]);
    assert.ok(player.fatigue<=43);
  }
  assert.equal(world.day,365);assert.ok(TRAINING_SKILLS.every(skill=>player[skill]>35));trip(world);
});
