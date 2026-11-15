import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { COACHES, changeCoach } from '../src/game/coaches.js';
import { selectTraining } from '../src/game/training.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { getClubView, getAffiliations } from '../src/game/world-selectors.js';
import { coachesPanel } from '../src/ui/coaches-panel.js';
import { financePanel } from '../src/ui/finance-panel.js';
import { recruitPlayer, signingFee } from '../src/game/roster.js';

function fixture() {
  const world = createWorld(createClub('코치 검증').club, 42);
  return { world, club: world.clubs[0], player: world.players[0] };
}
function endMatch(world) {
  const actors = world.teamTraining.playerIds.map((playerId, index) => ({ id: `home-${index}`, playerId, team: 'home', stats: { kills: 3, deaths: 1, assists: 0 } }));
  return { complete: true, tick: 10, actors, economy: { roundNumber: 1 }, round: { winner: 'home' }, match: { complete: true, winner: 'home', history: [{}], playerStats: Object.fromEntries(actors.map(actor => [actor.id, actor.stats])) } };
}

test('등급별 고용비 차감·교체 전액·해고 환급 없음과 저장 복원을 확인한다', () => {
  const { world, club } = fixture(), before = club.balance;
  assert.equal(club.coach,null);
  for (const tier of ['beginner','intermediate','advanced']) {
    const cash=club.balance;
    assert.equal(changeCoach(world,tier).ok,true);
    assert.equal(club.balance,cash-COACHES[tier].fee);
    assert.equal(club.coach,tier);
    assert.deepEqual(restoreWorld(createSave(world)),world);
  }
  assert.equal(club.balance,before-6000);
  const cash=club.balance;
  assert.equal(changeCoach(world,null).ok,true);
  assert.equal(club.balance,cash);
  assert.equal(club.coach,null);
});

test('자금 부족·같은 등급·잘못된 입력은 비용과 상태를 변경하지 않는다', () => {
  const { world, club } = fixture(); club.balance=499;
  for (const tier of ['beginner','__proto__','none',undefined,null]) {
    const before=structuredClone(world); assert.equal(changeCoach(world,tier).ok,false); assert.deepEqual(world,before);
  }
  club.balance=1000; changeCoach(world,'beginner');
  const before=structuredClone(world); assert.equal(changeCoach(world,'beginner').ok,false); assert.deepEqual(world,before);
});

test('주간 중간·미완료 일정·이벤트·팀 훈련은 고용/해고/교체를 차단한다', () => {
  for (const block of [
    world=>advanceDay(world), world=>{world.weekDaysRemaining=2;},
    world=>{world.playerEvents.week={};}, world=>{world.teamTraining={status:'pending'};},
  ]) {
    const { world }=fixture(); changeCoach(world,'beginner'); block(world);
    const before=structuredClone(world);
    for (const next of [null,'intermediate']) assert.equal(changeCoach(world,next).ok,false);
    assert.deepEqual(world,before);
  }
});

test('개인 훈련은 성장 속도와 코치 보너스를 곱해 마지막에 반올림한다', () => {
  for (const [tier, bonus] of [['beginner',10],['intermediate',20],['advanced',30]]) {
    for (const rate of [80,100,120]) {
      const { world, player }=fixture(); changeCoach(world,tier); player.development.growthRate=rate;
      selectTraining(world,player.id,'aim');
      assert.equal(advanceDay(world).ok,true);
      assert.equal(player.training.experience.aim,Math.round(10*rate/100*(100+bonus)/100));
      assert.equal(player.training.experience.intelligence,0);
    }
  }
});

test('후보도 보너스를 받으며 잠재력 상한과 휴식/방송 효과를 유지한다', () => {
  const { world, club, player }=fixture(), assigned=getAffiliations(world);
  const reserve=world.players.filter(p=>!assigned.has(p.id)).sort((a,b)=>signingFee(a)-signingFee(b))[0];
  recruitPlayer(world,reserve.id); club.balance=10000; changeCoach(world,'advanced');
  reserve.development.growthRate=100; selectTraining(world,reserve.id,'intelligence');
  player.aim=player.development.potential.aim-1; player.training.experience.aim=99; selectTraining(world,player.id,'aim');
  const broadcaster=world.players.find(p=>p.id===club.lineupIds[1]); selectTraining(world,broadcaster.id,'broadcast');
  const resting=world.players.find(p=>p.id===club.lineupIds[2]), before=structuredClone(resting.training.experience);
  const cash=club.balance; advanceDay(world);
  assert.equal(reserve.training.experience.intelligence,13);
  assert.equal(player.aim,player.development.potential.aim); assert.equal(player.training.experience.aim,0);
  assert.equal(club.balance,cash+30); assert.deepEqual(broadcaster.training.experience,{aim:0,intelligence:0,stamina:0});
  assert.deepEqual(resting.training.experience,before);
});

test('주급은 일별 누적 후 정산하고 해고해도 발생 급여·미지급 이력을 보존한다', () => {
  const { world, club }=fixture(); changeCoach(world,'advanced');
  const cash=club.balance, salary=Object.values(club.contracts).reduce((sum,c)=>sum+c.monthlySalary/4,0);
  advanceDay(world);
  const accrued=Object.values(club.contracts).reduce((sum,c)=>sum+c.monthlySalary*15,0)+700*60;
  assert.equal(club.finance.accruedUnits,accrued);
  let restored=restoreWorld(createSave(world));
  for (let i=0;i<6;i++) assert.equal(advanceDay(restored).ok,true);
  const actual=restored.clubs[0], receipt=actual.finance.settlements.at(-1);
  assert.equal(receipt.wagesDue,Math.floor(salary+700)); assert.equal(receipt.coachSalary,700);
  assert.equal(actual.balance,cash+1250-receipt.wagesDue);
  changeCoach(restored,null); const previous=structuredClone(actual.finance);
  advanceWeek(restored); assert.equal(actual.finance.settlements.at(-1).coachSalary,undefined);
  assert.deepEqual(actual.finance.settlements[0],previous.settlements[0]);
  assert.deepEqual(restoreWorld(createSave(restored)),restored);
});

test('코치 급여 부족은 음수 자금에 반영하고 금액 범위 초과 시 상태를 유지한다', () => {
  const { world, club }=fixture(); changeCoach(world,'advanced'); club.balance=0;
  for (const contract of Object.values(club.contracts)) contract.monthlySalary=2000;
  advanceWeek(world); const entry=club.finance.settlements.at(-1);
  assert.equal(entry.paidWages,3200); assert.equal(club.balance,-1950); assert.equal(club.finance.arrears,0);
  changeCoach(world,null);
  advanceWeek(world); assert.equal(club.finance.settlements.at(-1).paidArrears,0); assert.equal(club.finance.settlements.at(-1).paidWages,2500);
  assert.equal(club.balance,-3200);
  club.finance.accruedUnits=Number.MAX_SAFE_INTEGER;
  const before=structuredClone(world); assert.equal(advanceDay(world).ok,false); assert.deepEqual(world,before);
});

test('팀 훈련은 최대 270 경험치·보너스 기록·중복 지급 방지·코치 교체 후 과거 보존을 확인한다', () => {
  const { world, club }=fixture(); changeCoach(world,'advanced');
  for (const player of world.players) player.development.growthRate=120;
  beginTeamTraining(world); const pending=restoreWorld(createSave(world));
  assert.equal(changeCoach(pending,null).ok,false);
  const result=settleTeamTraining(pending,endMatch(pending),pending.teamTraining.day);
  assert.equal(result.ok,true); assert.equal(result.receipt.coachBonus,30);
  assert.ok(result.receipt.rewards.every(reward=>reward.experience===270));
  const before=structuredClone(pending);
  assert.equal(settleTeamTraining(pending,endMatch(pending),pending.teamTraining.day).ok,false); assert.deepEqual(pending,before);
  assert.equal(changeCoach(pending,null).ok,true);
  assert.deepEqual(restoreWorld(createSave(pending)),pending);
  const bad=structuredClone(pending); bad.teamTraining.receipt.coachBonus=20; assert.throws(()=>createSave(bad));
  assert.equal(club.coach,'advanced');
});

test('구형 v18은 코치 없음·보너스 0으로 변환하고 자금·급여·과거 훈련을 보존한다', () => {
  const { world, club }=fixture(); beginTeamTraining(world); settleTeamTraining(world,endMatch(world),world.teamTraining.day);
  const save=createSave(world); save.schemaVersion=18;
  delete save.world.clubs[0].coach; delete save.world.teamTraining.receipt.coachBonus;
  const before=structuredClone(save), restored=restoreWorld(save);
  assert.deepEqual(save,before); assert.equal(restored.clubs[0].coach,null); assert.equal(restored.teamTraining.receipt.coachBonus,0);
  assert.equal(restored.clubs[0].balance,club.balance); assert.deepEqual(restored.clubs[0].finance,{...club.finance,cashStartedDay:restored.day});
  assert.deepEqual(restored.teamTraining.receipt.rewards,world.teamTraining.receipt.rewards);
  for (const value of [undefined,{},'__proto__','none',1]) {
    const bad=structuredClone(restored); bad.clubs[0].coach=value; assert.throws(()=>createSave(bad));
  }
});

test('코치 화면은 가격·효과·변경 제한과 재정 합계를 표시한다', () => {
  const { world }=fixture();
  assert.match(coachesPanel(getClubView(world)),/고용한 코치 없음/);
  changeCoach(world,'intermediate');
  const html=coachesPanel(getClubView(world)); assert.match(html,/중급 코치/); assert.match(html,/고용 중/); assert.match(html,/코치 해고/);
  assert.match(financePanel(getClubView(world)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '),/코치 주급 \$350/);
  advanceDay(world); assert.match(coachesPanel(getClubView(world)),/disabled>코치 해고/);
});
