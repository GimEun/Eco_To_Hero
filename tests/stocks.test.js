import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { STOCKS, createStockMarket, nextStockWeek, stockPrice, tradeStock } from '../src/game/stocks.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { renewContract } from '../src/game/contracts.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { stocksPanel } from '../src/ui/stocks-panel.js';
import { clubTabForFocus } from '../src/ui/club-tabs.js';

function fixture(seed=42) {
  const world=createWorld(createClub('주식 검사').club,seed);
  return {world,club:world.clubs[0]};
}

test('5종목 초기 가격/변동 범위와 빈 보유·손익을 생성하고 기존 난수와 분리한다',()=>{
  assert.deepEqual(STOCKS.map(s=>[s.initial,s.range]),[[100,5],[50,8],[80,10],[40,15],[20,25]]);
  const {world}=fixture(),before=structuredClone(world);
  const updated=nextStockWeek(world.stocks,8,1);
  assert.notEqual(updated.randomState,world.stocks.randomState);
  assert.deepEqual(world,before); assert.deepEqual(createStockMarket(42),world.stocks);
  for(const stock of STOCKS) {
    assert.equal(stockPrice(world.stocks,stock.id),stock.initial);
    assert.deepEqual(world.stocks.positions[stock.id],{quantity:0,costBasisCents:0});
  }
  assert.equal(world.stocks.realizedProfitCents,0);
});

test('주간 변동은 독립 추첨·달러 반올림·최저 1을 지키며 같은 날짜에는 다시 추첨하지 않는다',()=>{
  const moves=new Set();
  for(let seed=0;seed<80;seed++) {
    let market=createStockMarket(seed);
    for(let week=1;week<=20;week++) {
      const before=market; market=nextStockWeek(market,week*7+1,1);
      for(const stock of STOCKS) {
        const price=stockPrice(market,stock.id),prior=stockPrice(before,stock.id);
        assert.ok(Number.isInteger(price)&&price>=1);
        assert.ok(price>=Math.max(1,Math.round(prior*(100-stock.range)/100))&&price<=Math.round(prior*(100+stock.range)/100));
        moves.add(Math.sign(price-prior));
      }
      assert.equal(nextStockWeek(market,week*7+1,1),market);
      assert.equal(nextStockWeek(market,week*7+2,1),market);
    }
    assert.equal(market.history.length,12);
  }
  assert.deepEqual([...moves].sort(),[-1,0,1]);
});

test('매수 수수료 올림·평균 원가 배분·부분/전량 매도의 실현손익을 센트 단위로 보존한다',()=>{
  const {world,club}=fixture(),cash=club.balance;
  tradeStock(world,'nextgear','buy',1); assert.equal(club.balance,cash-51);
  tradeStock(world,'nextgear','buy',2); assert.equal(club.balance,cash-152);
  assert.deepEqual(world.stocks.positions.nextgear,{quantity:3,costBasisCents:15200});
  tradeStock(world,'nextgear','sell',1);
  assert.deepEqual(world.stocks.positions.nextgear,{quantity:2,costBasisCents:10133});
  assert.equal(world.stocks.realizedProfitCents,-167);
  tradeStock(world,'nextgear','sell',2);
  assert.deepEqual(world.stocks.positions.nextgear,{quantity:0,costBasisCents:0});
  assert.equal(club.balance,cash-4); assert.equal(world.stocks.realizedProfitCents,-400);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(world)))),world);
});

test('잘못된 종목/수량·과도한 매수/매도·금액 범위 초과는 자금·주식·난수를 변경하지 않는다',()=>{
  const {world,club}=fixture();
  for(const [id,kind,quantity] of [['bad','buy',1],['__proto__','buy',1],['corechip','buy',0],['corechip','buy',1.5],['corechip','buy','1'],['corechip','bad',1],['corechip','sell',1],['corechip','buy',100000]]) {
    const before=structuredClone(world); assert.equal(tradeStock(world,id,kind,quantity).ok,false); assert.deepEqual(world,before);
  }
  tradeStock(world,'corechip','buy',1); club.balance=Number.MAX_SAFE_INTEGER;
  const before=structuredClone(world); assert.equal(tradeStock(world,'corechip','sell',1).ok,false); assert.deepEqual(world,before);
});

test('주간 중간·미완료 일정/이벤트/팀 훈련과 구단 해체는 모든 거래를 막는다',()=>{
  for(const block of [w=>advanceDay(w),w=>{w.weekDaysRemaining=2;},w=>{w.playerEvents.week={};},w=>{w.teamTraining={status:'pending'};},w=>{w.clubs[0].balance=-10000;}]) {
    const {world}=fixture(); tradeStock(world,'corechip','buy',2); block(world);
    const before=structuredClone(world);
    for(const kind of ['buy','sell']) assert.equal(tradeStock(world,'corechip',kind,1).ok,false);
    assert.deepEqual(world,before);
  }
});

test('보유 주식은 현금과 분리하고 음수 자금에서도 파산 전 매도 수입은 받을 수 있다',()=>{
  const {world,club}=fixture(); tradeStock(world,'corechip','buy',2);
  club.balance=-500; assert.equal(tradeStock(world,'corechip','buy',1).ok,false);
  assert.equal(tradeStock(world,'corechip','sell',1).ok,true); assert.equal(club.balance,-401);
  club.balance=-10000; const before=structuredClone(world); assert.equal(tradeStock(world,'corechip','sell',1).ok,false); assert.deepEqual(world,before);
});

test('이벤트 중단·복원·마지막 날짜 이벤트 재개는 같은 주 가격을 한 번만 갱신한다',()=>{
  for(const eventDay of [4,8]) {
    const a=fixture(),b=fixture();
    a.world.playerEvents.week={startedDay:1,endDay:8,teamTraining:false,event:{eventId:'dating',day:eventDay,status:'scheduled',playerId:null,roll:null}};
    const paused=advanceWeek(a.world,{events:true}); assert.equal(paused.eventPending,true);
    const restored=restoreWorld(createSave(a.world)),snapshot=structuredClone(restored.stocks);
    assert.equal(advanceWeek(restored,{events:true}).eventPending,true); assert.deepEqual(restored.stocks,snapshot);
    resolvePlayerEvent(restored,'decline'); advanceWeek(restored,{events:true}); advanceWeek(b.world);
    assert.deepEqual(restored.stocks,b.world.stocks);
    assert.equal(restored.stocks.history.length,2); assert.deepEqual(restoreWorld(createSave(restored)),restored);
  }
});

test('계약·재정 진행 실패는 가격을 바꾸지 않고 팀 훈련 경기 종료는 다시 추첨하지 않는다',()=>{
  const {world,club}=fixture(); for(let i=0;i<6;i++) advanceDay(world);
  club.contracts[club.playerIds[0]].remainingDays=1;
  const before=structuredClone(world.stocks); assert.equal(advanceDay(world).ok,false); assert.deepEqual(world.stocks,before);
  renewContract(world,club.playerIds[0],84); advanceDay(world);
  const settled = structuredClone(world.stocks); club.finance.accruedUnits=Number.MAX_SAFE_INTEGER;
  assert.equal(advanceDay(world).ok,false); assert.deepEqual(world.stocks,settled);
  const other=fixture(); beginTeamTraining(other.world); const market=structuredClone(other.world.stocks);
  const state={complete:true,tick:1,combat:false,actors:other.club.lineupIds.map(playerId=>({playerId,team:'home',stats:{kills:0,deaths:0,assists:0}}))};
  settleTeamTraining(other.world,state,other.world.teamTraining.day); assert.deepEqual(other.world.stocks,market);
});

test('12주 가격/20건 거래 이력이 잘린 뒤에도 보유/손익/저장 복원이 유지된다',()=>{
  const {world,club}=fixture(); club.playerIds.forEach(id=>renewContract(world,id,168));
  for(let i=0;i<15;i++) { tradeStock(world,'nextgear','buy',1); tradeStock(world,'nextgear','sell',1); }
  tradeStock(world,'corechip','buy',3);
  for(let i=0;i<14;i++) advanceWeek(world);
  assert.equal(world.stocks.history.length,12); assert.equal(world.stocks.trades.length,20);
  assert.deepEqual(restoreWorld(createSave(world)),world);
  assert.equal(tradeStock(world,'corechip','sell',3).ok,true); assert.deepEqual(restoreWorld(createSave(world)),world);
});

test('v21은 현금/부채/훈련을 보존하고 현재 날짜 초기 시장을 만들며 다음 정산부터 갱신한다',()=>{
  const {world}=fixture(); advanceWeek(world); advanceDay(world); advanceDay(world);
  const old=createSave(world); old.schemaVersion=21; delete old.world.stocks;
  const before=structuredClone(old),restored=restoreWorld(old);
  assert.deepEqual(old,before); assert.deepEqual(restored.stocks,createStockMarket(world.seed,world.day));
  const {stocks,...rest}=restored; assert.deepEqual(rest,{...old.world,aiGrowth:createAiGrowth(world.day),counseling:createCounseling(world)});
  for(let i=0;i<5;i++) advanceDay(restored);
  assert.equal(restored.day,15); assert.equal(restored.stocks.lastUpdatedDay,15); assert.equal(restored.stocks.history.length,2);
  assert.deepEqual(restoreWorld(createSave(restored)),restored);
});

test('손상된 가격/보유/거래/수수료/실현손익과 외부 추가 필드를 검증한다',()=>{
  const {world}=fixture(); tradeStock(world,'nextgear','buy',3); tradeStock(world,'nextgear','sell',1); advanceWeek(world);
  for(const mutate of [m=>{m.history[0].prices.corechip=0;},m=>{m.history.at(-1).prices.corechip=9999;},m=>{m.lastUpdatedDay=1;},m=>{m.positions.nextgear.quantity=-1;},m=>{m.positions.nextgear.costBasisCents++;},m=>{m.trades[0].fee=0;},m=>{m.trades[1].profitCents++;},m=>{m.realizedProfitCents++;},m=>{m.randomState=-1;},m=>{m.trades[0].quantity=.5;}]) {
    const bad=structuredClone(world); mutate(bad.stocks); assert.throws(()=>createSave(bad),/주식/);
  }
  const input=createSave(world); input.world.stocks.external='ignored';
  assert.equal(restoreWorld(input).stocks.external,undefined);
});

test('주식 화면은 가격·보유·손익·거래/이력과 재정 탭 복귀 초점을 제공한다',()=>{
  const {world}=fixture(); tradeStock(world,'nextgear','buy',3);
  const html=stocksPanel(getClubView(world));
  assert.match(html,/코어칩/); assert.match(html,/노바랩스/); assert.match(html,/3주/); assert.match(html,/평균 \$50\.67/);
  assert.match(html,/평가손익 -\$2\.00/); assert.match(html,/최근 12주 가격/); assert.match(html,/data-action="sell-all-stock"/);
  assert.equal(clubTabForFocus('#stocks-title','roster'),'finance');
});
