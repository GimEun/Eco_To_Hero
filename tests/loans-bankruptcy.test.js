import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { changeLoan } from '../src/game/loans.js';
import { isClubBankrupt } from '../src/game/bankruptcy.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { renewContract } from '../src/game/contracts.js';
import { recruitPlayer, releasePlayer, replaceStarter } from '../src/game/roster.js';
import { saleQuote, sellPlayer, negotiateTransfer } from '../src/game/transfers.js';
import { selectTraining, selectWeeklyActions, trainPlayers } from '../src/game/training.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { changeCoach } from '../src/game/coaches.js';
import { upgradeFacility } from '../src/game/facilities.js';
import { signSponsor } from '../src/game/sponsors.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { financePanel } from '../src/ui/finance-panel.js';
import { clubScreen } from '../src/ui/screens.js';
import { playerEventsPanel } from '../src/ui/player-events-panel.js';

function fixture() {
  const world=createWorld(createClub('대출·파산 검사').club,42),club=world.clubs[0];
  return { world,club,player:world.players[0] };
}
function oldDebt(debt=1200) {
  const {world}=fixture(); advanceWeek(world);
  const old=createSave(world); old.schemaVersion=20;
  const club=old.world.clubs[0],entry=club.finance.settlements[0];
  club.balance=0; club.finance.arrears=debt;
  Object.assign(entry,{wagesDue:1250+debt,paidWages:1250,paidArrears:0,arrears:debt,balance:0});
  delete club.finance.cashStartedDay; delete club.finance.loan;
  return old;
}

test('한도 내 대출·부분 상환·전액 상환은 수수료 없이 자금/원금/내역을 함께 갱신한다',()=>{
  const {world,club}=fixture(),cash=club.balance;
  assert.equal(changeLoan(world,'borrow',5000).ok,true);
  assert.equal(club.balance,cash+5000); assert.equal(club.finance.loan.principal,5000);
  assert.equal(changeLoan(world,'repay',2000).ok,true);
  assert.equal(club.balance,cash+3000); assert.equal(club.finance.loan.principal,3000);
  assert.equal(changeLoan(world,'repay',3000).ok,true);
  assert.equal(club.balance,cash); assert.equal(club.finance.loan.principal,0);
  assert.deepEqual(club.finance.loan.history.map(e=>e.kind),['borrow','repay','repay']);
  assert.deepEqual(restoreWorld(createSave(world)),world);
});

test('한도 초과·잘못된 단위·자금/원금 부족·금액 범위 초과는 상태를 변경하지 않는다',()=>{
  const {world,club}=fixture();
  for(const [kind,amount] of [['borrow',11000],['borrow',500],['borrow',-1000],['borrow',NaN],['repay',1000],['bad',1000]]) {
    const before=structuredClone(world); assert.equal(changeLoan(world,kind,amount).ok,false); assert.deepEqual(world,before);
  }
  changeLoan(world,'borrow',10000); club.balance=999;
  const before=structuredClone(world); assert.equal(changeLoan(world,'repay',1000).ok,false); assert.deepEqual(world,before);
  const a=fixture(); a.club.balance=Number.MAX_SAFE_INTEGER;
  const original=structuredClone(a.world); assert.equal(changeLoan(a.world,'borrow',1000).ok,false); assert.deepEqual(a.world,original);
});

test('대출·상환은 새 주 시작에만 가능하고 일정/이벤트/팀 훈련 중 차단한다',()=>{
  for(const block of [w=>advanceDay(w),w=>{w.weekDaysRemaining=2;},w=>{w.playerEvents.week={};},w=>{w.teamTraining={status:'pending'};}]) {
    const {world}=fixture(); changeLoan(world,'borrow',1000); block(world); const before=structuredClone(world);
    for(const kind of ['borrow','repay']) assert.equal(changeLoan(world,kind,1000).ok,false);
    assert.deepEqual(world,before);
  }
});

test('주 2% 이자는 일할 누적·저장 복원 후 한 번 정산하고 부분 상환은 다음 주부터 반영한다',()=>{
  const {world,club}=fixture(); changeLoan(world,'borrow',5000);
  const cash=club.balance,payroll=Object.values(club.contracts).reduce((sum,c)=>sum+c.monthlySalary/4,0);
  for(let i=0;i<3;i++) advanceDay(world);
  const restored=restoreWorld(createSave(world));
  for(let i=0;i<4;i++) advanceDay(restored);
  const actual=restored.clubs[0],first=actual.finance.settlements[0];
  assert.equal(first.loanInterest,100); assert.equal(first.loanPrincipal,5000);
  assert.equal(actual.balance,cash+1250-Math.floor(payroll+100));
  changeLoan(restored,'repay',2000); advanceWeek(restored);
  assert.equal(actual.finance.settlements[1].loanInterest,60);
  changeLoan(restored,'repay',3000); advanceWeek(restored);
  assert.equal(actual.finance.settlements[2].loanInterest,undefined);
  assert.equal(actual.finance.loan.principal,0); assert.deepEqual(restoreWorld(createSave(restored)),restored);
});

test('마이너스 자금은 파산 전 대출/수입으로 회복하고 선택적 유료 지출은 차단한다',()=>{
  const {world,club}=fixture(); club.balance=-9999;
  const before=structuredClone(world); assert.equal(changeCoach(world,'beginner').ok,false); assert.equal(upgradeFacility(world,'aim').ok,false); assert.deepEqual(world,before);
  assert.equal(changeLoan(world,'borrow',10000).ok,true); assert.equal(club.balance,1);
  advanceWeek(world); assert.ok(club.balance>1); assert.equal(club.finance.settlements[0].loanInterest,200);
  assert.equal(isClubBankrupt(club),false); assert.deepEqual(restoreWorld(createSave(world)),world);
});

test('음수 운영 자금에서도 무료 이벤트 수락/거절은 가능하고 유료 선택만 차단한다',()=>{
  const {world,club}=fixture();
  world.playerEvents.week={startedDay:1,endDay:8,teamTraining:false,event:{eventId:'treadmill',day:4,status:'scheduled',playerId:null,roll:null}};
  advanceWeek(world,{events:true}); club.balance=-500;
  const before=structuredClone(world); assert.equal(resolvePlayerEvent(world,'accept').ok,false); assert.deepEqual(world,before);
  assert.equal(resolvePlayerEvent(world,'decline').ok,true); assert.equal(club.balance,-500);
  assert.deepEqual(restoreWorld(createSave(world)),world);
  assert.doesNotMatch(playerEventsPanel(getClubView(world)),/disabled>거절하기/);
});

test('정확히 -10000 또는 그 아래 정산에서 즉시 해체하고 이벤트/팀 훈련을 추가 실행하지 않는다',()=>{
  for(const salary of [9000,9010]) {
    const {world,club}=fixture(); club.balance=0;
    Object.values(club.contracts).forEach(c=>{c.monthlySalary=salary;});
    world.playerEvents.week={startedDay:1,endDay:8,teamTraining:true,event:{eventId:'dating',day:8,status:'scheduled',playerId:null,roll:null}};
    const result=beginTeamTraining(world,{events:true});
    assert.equal(result.ok,false); assert.equal(result.bankrupt,true); assert.equal(result.advancedDays,7);
    assert.equal(world.day,8); assert.equal(club.balance,1250-Math.floor(salary*5/4));
    assert.equal(world.teamTraining,null); assert.equal(world.playerEvents.week,null); assert.equal(world.weekDaysRemaining,0);
    const before=structuredClone(world); assert.equal(advanceWeek(world).advancedDays,0); assert.deepEqual(world,before);
    assert.deepEqual(restoreWorld(createSave(world)),world);
  }
  const {club}=fixture(); club.balance=-9999; assert.equal(isClubBankrupt(club),false);
});

test('해체 후 모든 구단 변경·거래·훈련·대출을 차단하고 기록은 보존한다',()=>{
  const {world,club,player}=fixture(); club.balance=-10000;
  const calls=[()=>advanceDay(world),()=>advanceWeek(world),()=>changeLoan(world,'borrow',10000),()=>changeCoach(world,null),()=>upgradeFacility(world,'aim'),
    ()=>signSponsor(world,'broadcast'),()=>recruitPlayer(world,'none'),()=>releasePlayer(world,player.id),()=>replaceStarter(world,player.id,'none'),
    ()=>renewContract(world,player.id,84),()=>saleQuote(world,player.id),()=>sellPlayer(world,player.id),()=>negotiateTransfer(world,'none',100),
    ()=>selectTraining(world,player.id,'aim'),()=>selectWeeklyActions(world,[]),()=>beginTeamTraining(world),()=>settleTeamTraining(world,{},0),()=>resolvePlayerEvent(world,'decline')];
  const before=structuredClone(world);
  for(const call of calls) { const result=call(); assert.equal(result.ok,false); assert.match(result.message,/해체/); assert.deepEqual(world,before); }
  assert.deepEqual(trainPlayers(world,club.playerIds),[]); assert.deepEqual(world,before);
  assert.equal(world.clubs.length,58); assert.equal(world.players.length,600); assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(world)))),world);
});

test('v20 미지급금은 한 번만 자금에서 차감하고 과거 정산을 보존한다',()=>{
  const old=oldDebt(),before=structuredClone(old),restored=restoreWorld(old),club=restored.clubs[0];
  assert.deepEqual(old,before); assert.equal(club.balance,-1200); assert.equal(club.finance.arrears,0);
  assert.equal(club.finance.cashStartedDay,8); assert.deepEqual(club.finance.loan,{principal:0,history:[]});
  assert.deepEqual(club.finance.settlements,old.world.clubs[0].finance.settlements);
  assert.deepEqual(restoreWorld(createSave(restored)),restored);
  assert.equal(advanceWeek(restored).ok,true); assert.equal(club.balance,-1200+1250-club.finance.settlements.at(-1).wagesDue);
  assert.equal(club.finance.settlements.at(-1).paidArrears,0); assert.deepEqual(restoreWorld(createSave(restored)),restored);
});

test('기존 미지급 통합으로 -10000이 되면 불러온 즉시 해체 상태를 유지한다',()=>{
  const restored=restoreWorld(oldDebt(10000)); assert.equal(restored.clubs[0].balance,-10000);
  assert.equal(advanceWeek(restored).bankrupt,true); assert.deepEqual(restoreWorld(createSave(restored)),restored);
});

test('대출 20건 기록 잘림 후 원금·이자·저장 복원을 유지하고 손상 기록을 거부한다',()=>{
  const {world,club}=fixture(); for(let i=0;i<15;i++) { changeLoan(world,'borrow',1000); changeLoan(world,'repay',1000); }
  changeLoan(world,'borrow',5000); assert.equal(club.finance.loan.history.length,20);
  advanceWeek(world); assert.deepEqual(restoreWorld(createSave(world)),world);
  for(const mutate of [l=>{l.principal=11000;},l=>{l.history.at(-1).principal=4000;},l=>{l.history.at(-1).day=2;},l=>{l.history[0].amount=500;}]) {
    const bad=structuredClone(world); mutate(bad.clubs[0].finance.loan); assert.throws(()=>createSave(bad),/대출/);
  }
  for(const mutate of [e=>{e.loanInterest=99;},e=>{e.loanPrincipal=4000;},e=>{delete e.loanInterest;delete e.loanPrincipal;}]) {
    const bad=structuredClone(world); mutate(bad.clubs[0].finance.settlements[0]); assert.throws(()=>createSave(bad),/재정/);
  }
  const bad=structuredClone(world); bad.clubs[1].balance=-1; assert.throws(()=>createSave(bad),/자금/);
});

test('재정은 음수·이자·상환을 표시하고 해체 화면에는 기록 저장과 새 게임을 제공한다',t=>{
  const {world,club}=fixture(); changeLoan(world,'borrow',5000); club.balance=-500;
  const markup=financePanel(getClubView(world)); assert.match(markup,/-\$500/); assert.match(markup,/예상 주 이자 \$100/); assert.match(markup,/data-action="borrow-loan"/);
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({innerHTML:''})}});
  t.after(()=>previous?Object.defineProperty(globalThis,'document',previous):delete globalThis.document);
  club.balance=-10000; const html=clubScreen(getClubView(world),false,world).innerHTML;
  assert.match(html,/구단 해체 · 게임 종료/); assert.match(html,/data-action="new-game"/); assert.match(html,/data-action="save"/);
  assert.doesNotMatch(html,/data-action="advance-week"|data-action="borrow-loan"|data-club-tab/);
});
