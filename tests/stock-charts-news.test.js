import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { STOCKS, createStockMarket, nextStockWeek, stockHistoryRows, tradeStock } from '../src/game/stocks.js';
import { STOCK_NEWS_ODDS, stockNewsText } from '../src/game/stock-news.js';
import { stockChartContent, openStockChart } from '../src/ui/stock-chart.js';
import { stocksPanel } from '../src/ui/stocks-panel.js';
import { getClubView } from '../src/game/world-selectors.js';
import { advanceWeek } from '../src/game/calendar.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';

function fixture(seed=42) {
  const world=createWorld(createClub('차트·정보 검사').club,seed);
  return {world,club:world.clubs[0]};
}

test('처음부터 과거 3주+현재 4개 가격을 제공하고 현재 가격·보유·기존 난수를 바꾸지 않는다',()=>{
  const market=createStockMarket(42),snapshot=structuredClone(market),rows=stockHistoryRows(market);
  assert.deepEqual(rows.map(row=>row.label),['3주 전','2주 전','1주 전','현재']);
  assert.deepEqual(rows.map(row=>row.reference),[true,true,true,false]);
  for(const stock of STOCKS) {
    assert.equal(rows.at(-1).prices[stock.id],stock.initial);
    assert.ok(rows.every(row=>Number.isSafeInteger(row.prices[stock.id])&&row.prices[stock.id]>0));
  }
  assert.deepEqual(createStockMarket(42),market); assert.deepEqual(market,snapshot);
});

test('실제 주간 가격이 쌓이면 최근 4개를 사용하고 초기 참고 가격을 대체한다',()=>{
  let market=createStockMarket(42);
  for(let i=1;i<=3;i++) market=nextStockWeek(market,i*7+1,1);
  const rows=stockHistoryRows(market).slice(-4);
  assert.ok(rows.every(row=>!row.reference));
  assert.deepEqual(rows.map(row=>row.prices),market.history.map(row=>row.prices));
  assert.deepEqual(rows.map(row=>row.label),['3주 전','2주 전','1주 전','현재']);
});

test('승인한 정보별 방향 확률을 실제 가격 추첨에서 적용하고 모든 결과를 허용한다',()=>{
  assert.deepEqual(STOCK_NEWS_ODDS,{positive:{up:45,flat:20,down:35},neutral:{up:40,flat:20,down:40},negative:{up:35,flat:20,down:45}});
  const counts={positive:{up:0,flat:0,down:0},neutral:{up:0,flat:0,down:0},negative:{up:0,flat:0,down:0}},samples=5000;
  for(let seed=0;seed<samples;seed++) {
    const base=createStockMarket(seed);
    for(const tone of Object.keys(counts)) {
      const market={...base,signals:Object.fromEntries(STOCKS.map(stock=>[stock.id,{tone,variant:0}]))};
      const price=nextStockWeek(market,8,1).history.at(-1).prices.corechip;
      counts[tone][price>100?'up':price<100?'down':'flat']++;
    }
  }
  for(const tone of Object.keys(counts)) for(const direction of ['up','flat','down']) {
    assert.ok(counts[tone][direction]>0);
    assert.ok(Math.abs(counts[tone][direction]/samples*100-STOCK_NEWS_ODDS[tone][direction])<3);
  }
  assert.ok(counts.positive.up>counts.negative.up); assert.ok(counts.negative.down>counts.positive.down);
});

test('정보는 현재 주에 고정되고 저장/마지막 날짜 이벤트 재개로 다시 추첨되지 않는다',()=>{
  const a=fixture(),b=fixture();
  a.world.playerEvents.week={startedDay:1,endDay:8,teamTraining:false,event:{eventId:'dating',day:8,status:'scheduled',playerId:null,roll:null}};
  advanceWeek(a.world,{events:true}); const restored=restoreWorld(createSave(a.world));
  const state=structuredClone(restored.stocks); advanceWeek(restored,{events:true}); assert.deepEqual(restored.stocks,state);
  resolvePlayerEvent(restored,'decline'); advanceWeek(restored,{events:true}); advanceWeek(b.world);
  assert.deepEqual(restored.stocks,b.world.stocks);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(restored)))),restored);
});

test('v22 저장은 실제 가격·보유·손익·거래·가격 난수를 유지하고 참고 가격/정보만 추가한다',()=>{
  const {world}=fixture(); tradeStock(world,'nextgear','buy',3); advanceWeek(world);
  const old=createSave(world); old.schemaVersion=22;
  for(const key of ['prehistory','signals','newsRandomState']) delete old.world.stocks[key];
  const before=structuredClone(old),restored=restoreWorld(old);
  assert.deepEqual(old,before);
  const {prehistory,signals,newsRandomState,...market}=restored.stocks;
  assert.deepEqual(market,old.world.stocks); assert.equal(prehistory.length,3); assert.equal(Object.keys(signals).length,5);
  assert.ok(Number.isInteger(newsRandomState)); assert.deepEqual(restored.clubs,old.world.clubs); assert.deepEqual(restored.players,old.world.players);
  assert.deepEqual(restoreWorld(old),restored); assert.deepEqual(restoreWorld(createSave(restored)),restored);
});

test('차트는 종목별 4개 점·가격·닫기 양식을 표시하며 평평한 가격도 유효한 SVG를 만든다',()=>{
  const market=createStockMarket(42),before=structuredClone(market);
  for(const stock of STOCKS) {
    const html=stockChartContent(market,stock.id);
    assert.match(html,new RegExp(stock.name)); assert.equal((html.match(/<circle /g)??[]).length,4);
    assert.match(html,/3주 전/); assert.match(html,/현재/); assert.match(html,/form method="dialog"/);
    assert.doesNotMatch(html,/NaN|Infinity/);
  }
  const flat=structuredClone(market); flat.prehistory.forEach(prices=>{prices.corechip=100;});
  assert.doesNotMatch(stockChartContent(flat,'corechip'),/NaN|Infinity/);
  assert.deepEqual(market,before); assert.equal(stockChartContent(market,'__proto__'),null);
});

test('차트 열기는 모달만 변경하고 이미 열린 모달/잘못된 종목을 안전하게 처리한다',()=>{
  const market=createStockMarket(42),before=structuredClone(market);
  const dialog={open:false,innerHTML:'',calls:0,showModal(){this.open=true;this.calls++;}};
  assert.equal(openStockChart(dialog,market,'corechip'),true); assert.equal(dialog.calls,1);
  assert.equal(openStockChart(dialog,market,'nextgear'),true); assert.equal(dialog.calls,1); assert.match(dialog.innerHTML,/넥스트기어/);
  const html=dialog.innerHTML; assert.equal(openStockChart(dialog,market,'bad'),false); assert.equal(dialog.innerHTML,html);
  assert.equal(openStockChart(null,market,'corechip'),false); assert.deepEqual(market,before);
});

test('시장 정보는 가격 이력 위에 있고 문장만 표시하며 종목명에 차트 버튼을 제공한다',()=>{
  const {world}=fixture(),html=stocksPanel(getClubView(world));
  assert.ok(html.indexOf('stock-information-title')<html.indexOf('최근 12주 가격'));
  const info=html.slice(html.indexOf('<section class="stock-information"'),html.indexOf('</section>')+10);
  assert.doesNotMatch(info,/positive|negative|neutral|45%|35%|긍정|부정/);
  for(const stock of STOCKS) { assert.match(info,new RegExp(stockNewsText(world.stocks,stock.id))); assert.match(html,new RegExp(`data-action="open-stock-chart" data-stock-id="${stock.id}"`)); }
  assert.match(html,/stock-chart-dialog/); assert.match(html,/3주 전 · 참고/);
});

test('손상된 정보/참고 가격/난수를 거부하고 불필요한 외부 필드를 제거한다',()=>{
  const {world}=fixture();
  for(const mutate of [m=>{m.signals.corechip.tone='__proto__';},m=>{m.signals.corechip.variant=99;},m=>{m.prehistory.pop();},m=>{m.prehistory[0].corechip=0;},m=>{m.newsRandomState=-1;}]) {
    const bad=structuredClone(world); mutate(bad.stocks); assert.throws(()=>createSave(bad),/주식/);
  }
  const save=createSave(world); save.world.stocks.signals.corechip.extra='ignored';
  assert.equal(restoreWorld(save).stocks.signals.corechip.extra,undefined);
});
