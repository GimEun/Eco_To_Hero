import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUES } from '../src/config/world.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { recruitmentIssue, recruitPlayer, replaceStarter, signingFee } from '../src/game/roster.js';
import { transferQuote, negotiateTransfer, saleQuote } from '../src/game/transfers.js';
import { getAffiliations } from '../src/game/world-selectors.js';
import { recruitmentCell } from '../src/ui/roster-management.js';
import { createSave, restoreWorld } from '../src/storage/save-data.js';

function fixture() {
  const world = createWorld(createClub('Recruitment').club, 42);
  const club = world.clubs.find(item => item.id === world.playerClubId);
  const affiliations = getAffiliations(world);
  const free = world.players.filter(player => !affiliations.has(player.id));
  return { world, club, free };
}

test('리그별 각 능력의 상한 경계는 허용하고 평균이 낮아도 한 능력이 넘으면 거절한다', () => {
  for (const league of LEAGUES) {
    const club = { leagueId: league.id };
    const player = { aim: league.recruitmentMax, intelligence: league.recruitmentMax, stamina: league.recruitmentMax };
    assert.equal(recruitmentIssue(club, player), null);
    if (league.recruitmentMax === 99) continue;
    for (const skill of ['aim', 'intelligence', 'stamina']) {
      assert.match(recruitmentIssue(club, { aim: 20, intelligence: 20, stamina: 20, [skill]: league.recruitmentMax + 1 }), /영입 기준 초과/);
    }
  }
});

test('새 게임과 복원 저장 모두 자유계약·직접 이적 제안을 막고 실패 시 세계를 보존한다', () => {
  for (const restored of [false, true]) {
    let { world } = fixture();
    if (restored) world = restoreWorld(createSave(world));
    const affiliations = getAffiliations(world);
    const free = world.players.find(player => !affiliations.has(player.id) && recruitmentIssue(world.clubs[0], player));
    const target = world.players.find(player => affiliations.get(player.id)?.leagueId === 'world');
    const before = structuredClone(world);
    assert.match(recruitPlayer(world, free.id).message, /영입 기준 초과/);
    assert.match(transferQuote(world, target.id).message, /영입 기준 초과/);
    assert.equal(negotiateTransfer(world, target.id, 120).ok, false);
    assert.deepEqual(world, before);
    assert.match(recruitmentCell(world, free, affiliations), /disabled>영입 불가/);
    const markup = recruitmentCell(world, target, affiliations);
    assert.match(markup, /영입 불가/);
    assert.doesNotMatch(markup, /data-action="negotiate-transfer"/);
  }
});

test('현재 리그가 달라지면 같은 선수를 영입할 수 있고 정원·계약금 규칙을 유지한다', () => {
  const { world, club, free } = fixture();
  const player = free.find(item => !recruitmentIssue({ leagueId: 'city' }, item) && recruitmentIssue(club, item));
  assert.equal(recruitPlayer(world, player.id).ok, false);
  club.leagueId = 'city';
  const balance = club.balance;
  assert.equal(recruitPlayer(world, player.id).ok, true);
  assert.equal(club.balance, balance - signingFee(player));
  assert.ok(club.contracts[player.id]);
});

test('영입 뒤 성장한 선수는 저장 복원·주전 편성이 가능하고 기존 선수 데이터도 보존한다', () => {
  const { world, club, free } = fixture();
  const player = free.find(item => !recruitmentIssue(club, item));
  assert.equal(recruitPlayer(world, player.id).ok, true);
  player.aim = player.development.potential.aim;
  assert.ok(player.aim > 54);
  const before = structuredClone(world);
  const restored = restoreWorld(createSave(world));
  assert.deepEqual(restored, before);
  assert.equal(replaceStarter(restored, player.id, club.lineupIds[0]).ok, true);
  assert.equal(recruitmentCell(restored, restored.players.find(item => item.id === player.id), getAffiliations(restored)), '내 팀 소속');
});

test('상대 구단의 대체 영입과 판매 구매 구단도 각자 리그의 영입 기준을 지킨다', () => {
  const { world, club, free } = fixture();
  for (const seller of world.clubs.filter(item => item.id !== club.id && item.leagueId === 'pc')) {
    const quote = transferQuote(world, seller.playerIds[0]);
    if (quote.ok) assert.equal(recruitmentIssue(seller, quote.replacement), null);
  }
  const player = free.find(item => !recruitmentIssue(club, item));
  recruitPlayer(world, player.id);
  player.aim = player.development.potential.aim;
  club.contracts[player.id].acquiredDay = null;
  const quote = saleQuote(world, player.id);
  assert.equal(quote.ok, true);
  for (const { buyer } of quote.offers) assert.equal(recruitmentIssue(buyer, player), null);
  assert.ok(quote.offers.every(({ buyer }) => buyer.leagueId !== 'pc'));
});
