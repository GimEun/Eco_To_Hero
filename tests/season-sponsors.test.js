import { createAiGrowth } from '../src/game/ai-growth.js';
import { createStockMarket } from '../src/game/stocks.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld as createNewWorld } from '../src/game/create-world.js';
// Existing in-season behavior; fresh-game preseason is covered separately.
const createWorld = (...args) => { const world = createNewWorld(...args); world.seasonCalendar = { mode: 'legacy', phase: 'season' }; return world; };

import { advanceWeek } from '../src/game/calendar.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';
import { seasonSponsorTerms, sponsorPlayerOffer, sponsorIncome, signSponsor } from '../src/game/sponsors.js';
import { getClubView } from '../src/game/world-selectors.js';
import { financePanel } from '../src/ui/finance-panel.js';

function fixture() {
  const world = createWorld(createClub('스폰서 시즌').club, 42);
  return { world, club: world.clubs[0] };
}
function contract(club, kind = 'wins', tier = 1, progress = 0) {
  return { kind, remainingWeeks: 0, broadcastDays: 0, leagueId: club.leagueId, tier, progress,
    playerId: kind === 'appearances' ? sponsorPlayerOffer(42, club.playerIds) : null };
}

test('5개 리그의 승리/출전 3단계 승인 금액과 달성 경계를 확인한다', () => {
  const expectations = [
    ['pc', [2,4,6], [2000,3000,4500], [3,5,7], [1750,2500,3500]],
    ['city', [3,5,8], [3000,4500,6500], [4,7,9], [2500,3500,5000]],
    ['province', [3,6,9], [4500,6500,9000], [5,8,11], [3500,5000,7000]],
    ['national', [3,6,9], [6500,9000,12500], [5,8,11], [5000,7000,9500]],
    ['world', [2,4,6], [9000,12500,17500], [3,5,7], [7000,9500,13000]],
  ];
  for (const [leagueId, wins, winIncome, appearances, appearanceIncome] of expectations) {
    for (const [kind, counts, amounts] of [['wins', wins, winIncome], ['appearances', appearances, appearanceIncome]]) {
      for (let tier = 1; tier <= 3; tier++) {
        const target = counts[tier - 1], income = amounts[tier - 1];
        assert.deepEqual(seasonSponsorTerms(kind, leagueId, tier), { target, income });
        assert.equal(sponsorIncome({ kind, leagueId, tier, progress: target - 1 }), 1250);
        assert.equal(sponsorIncome({ kind, leagueId, tier, progress: target }), income);
      }
    }
  }
  for (const tier of [0,4,1.5,'1']) assert.equal(seasonSponsorTerms('wins','pc',tier),null);
  assert.equal(seasonSponsorTerms('wins','__proto__',1),null);
});

test('무작위 지정 제안은 명단 순서·화면 재개방·저장 복원에도 동일하다', () => {
  const { world, club } = fixture(), before = structuredClone(world);
  const id = sponsorPlayerOffer(world.seed, club.playerIds);
  assert.ok(club.playerIds.includes(id));
  assert.equal(sponsorPlayerOffer(world.seed, [...club.playerIds].reverse()), id);
  assert.equal(financePanel(getClubView(world)), financePanel(getClubView(restoreWorld(createSave(world)))));
  assert.deepEqual(world, before);
  assert.ok(new Set(Array.from({ length: 100 }, (_, seed) => sponsorPlayerOffer(seed, club.playerIds))).size > 1);
});

test('선택 전 4종·리그별 3단계를 표시하고 PC방 시즌 계약을 연결한다', () => {
  const { world } = fixture(), before = structuredClone(world);
  const html = financePanel(getClubView(world));
  assert.match(html, /기본 스폰서/); assert.match(html, /방송 스폰서/);
  assert.match(html, /경기 승리 스폰서/); assert.match(html, /선수 출전 스폰서/);
  assert.match(html, /6승 달성/); assert.match(html, /7회 출전/);
  assert.doesNotMatch(html.match(/<button[^>]*data-sponsor-kind="wins"[^>]*>/)[0], /disabled/);
  for (const kind of ['wins','appearances']) for (const tier of [1,2,3]) {
    const copy = structuredClone(world);
    assert.equal(signSponsor(copy,kind,tier).ok,true);
    assert.equal(copy.clubs[0].finance.sponsor.progress,0);
    assert.deepEqual(restoreWorld(createSave(copy)),copy);
  }
  assert.deepEqual(world,before);
  assert.equal(signSponsor(world,'broadcast').ok,true);
  const active = financePanel(getClubView(world));
  assert.doesNotMatch(active, /data-action="sign-sponsor"/);
  assert.doesNotMatch(active, /선수 출전 스폰서|경기 승리 스폰서|기본 스폰서/);
});

test('시즌 계약 정산은 4주 뒤에도 유지되며 목표 달성 전후 실제 수입과 이력을 보존한다', () => {
  const { world, club } = fixture();
  club.finance.sponsor = contract(club);
  for (let i = 0; i < 4; i++) {
    assert.equal(advanceWeek(world).ok,true);
    assert.equal(club.finance.settlements.at(-1).income,1250);
    assert.equal(club.finance.sponsor.progress,0);
  }
  // 공식 경기 연동 전의 정산 단위 검증용 실적. 연습 경기에서는 이 값을 변경하지 않는다.
  club.finance.sponsor.progress = 2;
  assert.equal(advanceWeek(world).ok,true);
  assert.equal(club.finance.settlements.at(-1).income,2000);
  assert.equal(club.finance.settlements[0].sponsorContract.progress,0);
  assert.equal(signSponsor(world,'broadcast').ok,false);
  assert.deepEqual(restoreWorld(createSave(world)),world);
});

test('지정 선수 이탈 후에도 대상·실적은 고정되고 UI와 저장이 유지된다', () => {
  const { world, club } = fixture();
  club.finance.sponsor = contract(club,'appearances',2,4);
  const id = club.finance.sponsor.playerId;
  const view = getClubView(world);
  const html = financePanel({ ...view, playerIds: view.playerIds.filter(playerId => playerId !== id) });
  assert.match(html,/출전/); assert.match(html,/4\/5회/); assert.match(html,/누적 중단/);
  assert.doesNotMatch(html,/data-action="sign-sponsor"/);
  assert.deepEqual(restoreWorld(createSave(world)),world);
});

test('계약·과거 실적·지정 선수·수입 손상을 거부하고 v17 방송 계약을 보존한다', () => {
  const { world, club } = fixture(); club.finance.sponsor = contract(club,'appearances');
  advanceWeek(world);
  for (const mutate of [s=>{s.progress=-1;},s=>{s.tier=4;},s=>{s.playerId='missing';},s=>{s.remainingWeeks=4;}]) {
    const bad = structuredClone(world); mutate(bad.clubs[0].finance.sponsor); assert.throws(()=>createSave(bad));
  }
  for (const mutate of [e=>{e.income=9999;},e=>{e.sponsorContract.kind='wins';},e=>{delete e.sponsorContract;}]) {
    const bad = structuredClone(world); mutate(bad.clubs[0].finance.settlements[0]); assert.throws(()=>createSave(bad));
  }
  const old = fixture(); signSponsor(old.world,'broadcast'); advanceWeek(old.world);
  const save=createSave(old.world); save.schemaVersion=17;
  const expected=structuredClone(old.world); expected.clubs[0].finance.cashStartedDay=expected.day; expected.stocks=createStockMarket(expected.seed,expected.day);
  expected.aiGrowth=createAiGrowth(expected.day);
  assert.deepEqual(restoreWorld(save),expected);
});
