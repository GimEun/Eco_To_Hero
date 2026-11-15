import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { upgradeFacility, facilityMaintenance } from '../src/game/facilities.js';
import { changeCoach } from '../src/game/coaches.js';
import { selectTraining } from '../src/game/training.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { getClubView, getAffiliations } from '../src/game/world-selectors.js';
import { facilitiesPanel } from '../src/ui/facilities-panel.js';
import { financePanel } from '../src/ui/finance-panel.js';
import { recruitPlayer, signingFee } from '../src/game/roster.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';

const skills = ['aim','intelligence','stamina'];
function fixture() {
  const world=createWorld(createClub('시설 검증').club,42);
  world.clubs[0].balance=100000;
  return { world, club: world.clubs[0], player: world.players[0] };
}
function maxFacility(world,skill) { for(let i=0;i<3;i++) assert.equal(upgradeFacility(world,skill).ok,true); }

test('각 시설은 2000/6000/15000을 추가 지불하고 3단계 효과와 유지비만 적용한다',()=>{
  const {world,club}=fixture(); club.balance=100000;
  for(const skill of skills) {
    for(const [index,cost] of [2000,6000,15000].entries()) {
      const before=club.balance; assert.equal(upgradeFacility(world,skill).ok,true);
      assert.equal(club.balance,before-cost); assert.equal(club.facilities[skill],index+1);
    }
    const before=structuredClone(world); assert.equal(upgradeFacility(world,skill).ok,false); assert.deepEqual(world,before);
  }
  assert.equal(club.balance,31000); assert.equal(facilityMaintenance(club.facilities),1050);
  assert.deepEqual(restoreWorld(createSave(world)),world);
});

test('잘못된 시설·자금 부족·주간 중간·미완료 일정/이벤트/팀 훈련은 상태를 바꾸지 않는다',()=>{
  const {world,club}=fixture(); club.balance=1999;
  for(const skill of ['aim','__proto__',null,undefined,0]) {
    const before=structuredClone(world); assert.equal(upgradeFacility(world,skill).ok,false); assert.deepEqual(world,before);
  }
  for(const block of [w=>advanceDay(w),w=>{w.weekDaysRemaining=2;},w=>{w.playerEvents.week={};},w=>{w.teamTraining={status:'pending'};}]) {
    const {world}=fixture(); block(world); const before=structuredClone(world);
    assert.equal(upgradeFacility(world,'aim').ok,false); assert.deepEqual(world,before);
  }
});

test('성장 속도×코치×해당 시설을 곱한 뒤 한 번 반올림하며 다른 능력에는 미적용한다',()=>{
  for(const skill of skills) for(const rate of [80,100,120]) {
    const {world,player}=fixture(); changeCoach(world,'intermediate'); maxFacility(world,skill);
    player.development.growthRate=rate; selectTraining(world,player.id,skill); advanceDay(world);
    assert.equal(player.training.experience[skill],Math.round(10*rate/100*1.2*1.3));
  }
  const {world,player}=fixture(); player.development.growthRate=100;
  maxFacility(world,'aim'); selectTraining(world,player.id,'intelligence'); advanceDay(world);
  assert.equal(player.training.experience.intelligence,10);
});

test('고급 코치·시설의 17 경험치와 후보 효과·잠재력 상한을 확인한다',()=>{
  const {world,club,player}=fixture(); club.balance=50000;
  const assigned=getAffiliations(world), reserve=world.players.filter(p=>!assigned.has(p.id)).sort((a,b)=>signingFee(a)-signingFee(b))[0];
  recruitPlayer(world,reserve.id); changeCoach(world,'advanced'); maxFacility(world,'aim');
  reserve.development.growthRate=100; selectTraining(world,reserve.id,'aim');
  player.aim=player.development.potential.aim-1; player.training.experience.aim=99; selectTraining(world,player.id,'aim');
  advanceDay(world); assert.equal(reserve.training.experience.aim,17);
  assert.equal(player.aim,player.development.potential.aim); assert.equal(player.training.experience.aim,0);
});

test('휴식·방송과 팀 훈련 보상은 시설 강화 전후 동일하다',()=>{
  for(const action of ['rest','broadcast']) {
    const a=fixture(),b=fixture(); maxFacility(a.world,'aim');
    for(const x of [a,b]) { selectTraining(x.world,x.player.id,action); advanceDay(x.world); }
    assert.deepEqual(a.player,b.player);
  }
  const a=fixture(),b=fixture(); maxFacility(a.world,'aim');
  for(const x of [a,b]) {
    changeCoach(x.world,'beginner'); beginTeamTraining(x.world);
    const state={complete:true,tick:1,combat:false,actors:x.club.lineupIds.map(playerId=>({playerId,team:'home',stats:{kills:0,deaths:0,assists:0}}))};
    assert.equal(settleTeamTraining(x.world,state,x.world.teamTraining.day).ok,true);
  }
  assert.deepEqual(a.world.teamTraining.receipt,b.world.teamTraining.receipt);
});

test('모든 시설 최대 유지비 1050은 일할 누적하고 급여/코치와 한 번 정산한다',()=>{
  const {world,club}=fixture(); club.balance=100000; changeCoach(world,'advanced');
  skills.forEach(skill=>maxFacility(world,skill));
  const before=club.balance, salary=Object.values(club.contracts).reduce((sum,c)=>sum+c.monthlySalary,0)/4;
  advanceDay(world);
  assert.equal(club.finance.accruedUnits,Object.values(club.contracts).reduce((sum,c)=>sum+c.monthlySalary*15,0)+(700+1050)*60);
  const restored=restoreWorld(createSave(world)); for(let i=0;i<6;i++) advanceDay(restored);
  const actual=restored.clubs[0],entry=actual.finance.settlements.at(-1);
  assert.equal(entry.facilityMaintenance,1050); assert.equal(entry.coachSalary,700); assert.equal(entry.wagesDue,Math.floor(salary+1750));
  assert.equal(actual.balance,before+1250-entry.wagesDue); assert.deepEqual(restoreWorld(createSave(restored)),restored);
});

test('자금 부족 시 유지비도 전액 차감하며 금액 범위 초과 시 상태를 유지한다',()=>{
  const {world,club}=fixture(); maxFacility(world,'aim'); club.balance=0;
  Object.values(club.contracts).forEach(c=>{c.monthlySalary=2000;});
  advanceWeek(world); const first=club.finance.settlements.at(-1);
  assert.equal(first.facilityMaintenance,350); assert.equal(first.paidWages,2850); assert.equal(club.balance,-1600); assert.equal(club.finance.arrears,0);
  advanceWeek(world); const next=club.finance.settlements.at(-1);
  assert.equal(next.paidArrears,0); assert.equal(next.paidWages,2850); assert.equal(club.balance,-3200);
  const before=structuredClone(world); club.finance.accruedUnits=Number.MAX_SAFE_INTEGER;
  const blocked=structuredClone(world); assert.equal(advanceDay(world).ok,false); assert.deepEqual(world,blocked);
  assert.equal(before.clubs[0].finance.settlements.length,2);
});

test('이벤트로 중단한 주는 복원 후 남은 기간만 비용과 경험치를 누적한다',()=>{
  const {world,player}=fixture(); upgradeFacility(world,'aim'); player.development.growthRate=100; selectTraining(world,player.id,'aim');
  world.playerEvents.week={startedDay:1,endDay:8,teamTraining:false,event:{eventId:'dating',day:4,status:'scheduled',playerId:null,roll:null}};
  assert.equal(advanceWeek(world,{events:true}).advancedDays,3);
  assert.equal(player.training.experience.aim,33);
  assert.equal(upgradeFacility(world,'aim').ok,false);
  const restored=restoreWorld(createSave(world)); resolvePlayerEvent(restored,'decline');
  assert.equal(advanceWeek(restored,{events:true}).advancedDays,4);
  assert.equal(restored.clubs[0].finance.settlements.at(-1).facilityMaintenance,100);
  assert.deepEqual(restoreWorld(createSave(restored)),restored);
});

test('v19 저장은 기존 코치·자금·경험치·재정을 보존하고 시설 미보유로 변환한다',()=>{
  const {world,club}=fixture(); changeCoach(world,'beginner'); advanceWeek(world);
  const old=createSave(world); old.schemaVersion=19; delete old.world.clubs[0].facilities;
  const before=structuredClone(old),restored=restoreWorld(old);
  assert.deepEqual(old,before); assert.deepEqual(restored.clubs[0].facilities,{aim:0,intelligence:0,stamina:0});
  assert.equal(restored.clubs[0].balance,club.balance); assert.equal(restored.clubs[0].coach,'beginner');
  assert.deepEqual(restored.clubs[0].finance,{...club.finance,cashStartedDay:restored.day}); assert.deepEqual(restored.players,world.players);
});

test('손상된 시설/유지비를 거부하고 화면에는 비용·효과·최대 단계와 정산 내역을 표시한다',()=>{
  const {world,club}=fixture(); maxFacility(world,'aim'); advanceWeek(world);
  for(const value of [null,{},[],{aim:4,intelligence:0,stamina:0},{aim:1.5,intelligence:0,stamina:0},{aim:0,intelligence:0,stamina:0,extra:0}]) {
    const bad=structuredClone(world); bad.clubs[0].facilities=value; assert.throws(()=>createSave(bad),/시설/);
  }
  for(const value of [-50,1051,'200']) {
    const bad=structuredClone(world); bad.clubs[0].finance.settlements[0].facilityMaintenance=value; assert.throws(()=>createSave(bad),/재정/);
  }
  const view=getClubView(world),html=facilitiesPanel(view);
  assert.match(html,/최대 3단계/); assert.match(html,/개인 훈련 경험치 \+30%/);
  assert.match(html,/주간 유지비 \$350/); assert.match(financePanel(view),/시설 유지비 \$350/);
  assert.equal(club.facilities.aim,3);
});

test('가격 인상 전 진행 중 저장은 발생 비용을 보존하고 남은 기간만 새 유지비를 누적한다',()=>{
  const {world,club}=fixture();
  club.facilities.aim=3;
  Object.values(club.contracts).forEach(contract=>{contract.monthlySalary=0;});
  for(let i=0;i<3;i++) advanceDay(world);
  const old=createSave(world);
  old.world.clubs[0].finance.accruedUnits -= (350-200)*60*3;
  delete old.world.clubs[0].finance.facilityAccruedUnits;
  const original=structuredClone(old),restored=restoreWorld(old);
  assert.deepEqual(old,original);
  assert.equal(restored.clubs[0].finance.accruedUnits,200*60*3);
  assert.equal(restored.clubs[0].finance.facilityAccruedUnits,200*60*3);
  for(let i=0;i<4;i++) advanceDay(restored);
  const finance=restored.clubs[0].finance;
  assert.equal(finance.settlements[0].wagesDue,285);
  assert.equal(finance.settlements[0].facilityMaintenance,285);
  assert.equal(finance.facilityAccruedUnits,300);
  assert.deepEqual(restoreWorld(createSave(restored)),restored);
  const history=createSave(restored);
  history.world.clubs[0].finance.settlements[0].facilityMaintenance=200;
  assert.equal(restoreWorld(history).clubs[0].finance.settlements[0].facilityMaintenance,200);
  for(const value of [null,-1,Infinity,'0',Number.MAX_SAFE_INTEGER]) {
    const bad=structuredClone(history);bad.world.clubs[0].finance.facilityAccruedUnits=value;
    assert.throws(()=>restoreWorld(bad),/재정/);
  }
});
