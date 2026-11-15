import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld as createNewWorld } from '../src/game/create-world.js';
// Existing in-season behavior; fresh-game preseason is covered separately.
const createWorld = (...args) => { const world = createNewWorld(...args); world.seasonCalendar = { mode: 'legacy', phase: 'season' }; return world; };

import { createSponsor, signSponsor, sponsorIncome } from '../src/game/sponsors.js';
import { selectTraining } from '../src/game/training.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { resolvePlayerEvent } from '../src/game/player-events.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { financePanel } from '../src/ui/finance-panel.js';
import { recruitPlayer } from '../src/game/roster.js';
import { getAffiliations } from '../src/game/world-selectors.js';
import { nextOfficialFixture, beginOfficialMatch, finishOfficialWeek } from '../src/game/official-match.js';
import { sponsorsPanel } from '../src/ui/sponsors-panel.js';

function fixture() {
  const world = createWorld(createClub('스폰서 검증').club, 42);
  return { world, club: world.clubs[0], player: world.players[0] };
}
function days(world, count) { for (let i = 0; i < count; i++) assert.equal(advanceDay(world).ok, true); }

test('주간 방송 준비 때 목표를 확정하되 정산 후 새 주는 미진행이고 직전 주 기록만 달성을 표시한다', async () => {
  const { world, player } = fixture();
  assert.equal(signSponsor(world, 'broadcast').ok, true);
  selectTraining(world, player.id, 'broadcast');
  assert.equal(advanceWeek(world, { official: true }).advancedDays, 6);
  const before = sponsorsPanel(getClubView(world));
  assert.match(before, /이번 주 방송 완료 · 목표 달성/);
  assert.doesNotMatch(before, /6\/7|0\/7/);
  assert.equal(world.clubs[0].finance.sponsor.broadcastCompleted, true);
  assert.equal(sponsorIncome(world.clubs[0].finance.sponsor), 1750);
  assert.equal(world.clubs[0].finance.settlements.length, 0);
  assert.deepEqual(restoreWorld(createSave(world)), world);
  assert.doesNotMatch(before, /지급 조건 미달/);
  beginOfficialMatch(world, nextOfficialFixture(world).id);
  const completed = await finishOfficialWeek(world, { forfeit: true });
  const club = getClubView(completed);
  assert.equal(club.finance.settlements.at(-1).income, 1750);
  assert.equal(club.finance.settlements.at(-1).broadcastDays, 7);
  assert.equal(club.finance.sponsor.broadcastDays, 0);
  const after = sponsorsPanel(club);
  assert.match(after, /이번 주 방송 미진행 · 목표 미달/);
  assert.doesNotMatch(after, /이번 주 방송 완료|방금 마친 주간/);
  assert.match(after, /progress value="0" max="1"/);
  assert.match(after, /현재 실적 기준 정산 예정 \$1,250/);
  assert.match(after, /직전 주 정산 · 방송 목표 달성 · 스폰서 수입 \$1,750/);
  assert.equal(club.finance.sponsor.broadcastCompleted, undefined);
  assert.deepEqual(restoreWorld(createSave(completed)), completed);
  assert.doesNotMatch(sponsorsPanel(getClubView(restoreWorld(createSave(completed)))), /이번 주 방송 완료/);
  selectTraining(completed, player.id, 'rest');
  advanceWeek(completed, { official: true });
  const next = sponsorsPanel(getClubView(completed));
  assert.match(next, /이번 주 방송 미진행 · 목표 미달/);
  assert.doesNotMatch(next, /이번 주 방송 완료/);
  assert.equal(sponsorIncome(completed.clubs[0].finance.sponsor), 1250);
});

test('방송 계약 만료나 같은 날 재계약 뒤에도 직전 정산을 이번 주 완료로 재사용하지 않는다', () => {
  const { world, club, player } = fixture();
  signSponsor(world, 'broadcast');
  club.finance.sponsor.remainingWeeks = 1;
  selectTraining(world, player.id, 'broadcast');
  days(world, 7);
  assert.equal(club.finance.sponsor.kind, 'basic');
  assert.equal(club.finance.settlements.at(-1).income, 1750);
  assert.doesNotMatch(sponsorsPanel(getClubView(world)), /이번 주 방송 완료/);
  assert.equal(signSponsor(world, 'broadcast').ok, true);
  const markup = sponsorsPanel(getClubView(world));
  assert.match(markup, /이번 주 방송 미진행 · 목표 미달/);
  assert.match(markup, /직전 주 정산 · 방송 목표 달성/);
  assert.doesNotMatch(markup, /이번 주 방송 완료/);
  assert.equal(sponsorIncome(club.finance.sponsor), 1250);
});

test('준비 완료의 확정 보상은 마지막 하루 방송이 없어도 유지하고 과거 6일 미달 정산은 바꾸지 않는다', () => {
  const { world, club, player } = fixture();
  signSponsor(world, 'broadcast'); selectTraining(world, player.id, 'broadcast');
  days(world, 6); selectTraining(world, player.id, 'rest'); days(world, 1);
  assert.equal(club.finance.settlements[0].broadcastDays, 6);
  assert.equal(club.finance.settlements[0].income, 1250);
  selectTraining(world, player.id, 'broadcast'); advanceWeek(world, { official: true });
  const old = createSave(world); old.schemaVersion = 26; delete old.world.clubs[0].finance.sponsor.broadcastCompleted;
  const restored = restoreWorld(old);
  assert.equal(restored.day, world.day); assert.equal(restored.clubs[0].balance, club.balance);
  assert.deepEqual(restored.players, world.players);
  assert.deepEqual(restored.clubs[0].finance.settlements, club.finance.settlements);
  assert.equal(restored.clubs[0].finance.sponsor.broadcastCompleted, true);
  selectTraining(restored, player.id, 'rest');
  // AI 경기 자체는 별도 검사에서 확인한다. 확정된 방송 목표의 마지막 날 정산만 검증한다.
  restored.pcSeason.weekSchedule = null; restored.weekDaysRemaining = 0;
  days(restored, 1);
  const receipt = restored.clubs[0].finance.settlements.at(-1);
  assert.equal(receipt.broadcastDays, 6); assert.equal(receipt.broadcastCompleted, true);
  assert.equal(receipt.income, 1750);
  assert.deepEqual(restoreWorld(createSave(restored)), restored);
  const bad = structuredClone(restored); bad.clubs[0].finance.settlements.at(-1).broadcastCompleted = false;
  assert.throws(() => createSave(bad));
});

test('기본 계약은 조건 없이 기존 1250 수입과 급여 정산을 유지한다', () => {
  const { world, club } = fixture(); assert.deepEqual(club.finance.sponsor, createSponsor());
  const before = club.balance, salary = Object.values(club.contracts).reduce((sum, contract) => sum + contract.monthlySalary, 0);
  advanceWeek(world);
  assert.equal(club.balance, before + 1250 - Math.floor(salary / 4));
  assert.equal(club.finance.settlements[0].income, 1250);
  assert.equal(club.finance.settlements[0].sponsorKind, 'basic');
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('방송 6일분은 미달·7일분은 1750이며 방송 자체 수입과 합산하고 기본 수입은 중복 지급하지 않는다', () => {
  const { world, club, player } = fixture(), before = club.balance, ai = structuredClone(world.clubs.slice(1));
  assert.equal(signSponsor(world, 'broadcast').ok, true);
  assert.equal(club.balance, before);
  selectTraining(world, player.id, 'broadcast');
  days(world, 6); assert.equal(club.finance.sponsor.broadcastDays, 6);
  assert.equal(sponsorIncome(club.finance.sponsor), 1250);
  const result = advanceDay(world); assert.equal(result.ok, true); assert.match(result.message, /1,750/);
  const receipt = club.finance.settlements[0];
  assert.equal(receipt.broadcastDays, 7); assert.equal(receipt.income, 1750); assert.equal(receipt.sponsorKind, 'broadcast');
  assert.equal(club.balance, before + 210 + 1750 - receipt.paidWages);
  assert.deepEqual(club.finance.sponsor, { kind: 'broadcast', remainingWeeks: 3, broadcastDays: 0 });
  assert.deepEqual(world.clubs.slice(1), ai);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('방송은 선수 합산으로 계산하고 미달도 계약 한 주가 소진된다', () => {
  const { world, club, player } = fixture(), other = world.players[1];
  signSponsor(world, 'broadcast'); selectTraining(world, player.id, 'broadcast'); selectTraining(world, other.id, 'broadcast');
  days(world, 3); assert.equal(club.finance.sponsor.broadcastDays, 6);
  selectTraining(world, other.id, 'rest'); days(world, 1); assert.equal(club.finance.sponsor.broadcastDays, 7);
  selectTraining(world, player.id, 'rest'); days(world, 3);
  assert.equal(club.finance.settlements.at(-1).income, 1750);
  days(world, 7); assert.equal(club.finance.settlements.at(-1).income, 1250);
  assert.equal(club.finance.settlements.at(-1).broadcastDays, 0);
  assert.equal(club.finance.sponsor.remainingWeeks, 2);
});

test('4회 정산 직후 기본으로 돌아가며 갱신 전까지 방송을 해도 추가 수입은 없다', () => {
  const { world, club, player } = fixture(); signSponsor(world, 'broadcast'); selectTraining(world, player.id, 'broadcast');
  for (let i = 0; i < 4; i++) {
    assert.equal(advanceWeek(world).ok, true); assert.equal(club.finance.settlements.at(-1).income, 1750);
    if (i < 3) assert.equal(club.finance.sponsor.remainingWeeks, 3 - i);
  }
  assert.deepEqual(club.finance.sponsor, createSponsor());
  advanceWeek(world); assert.equal(club.finance.settlements.at(-1).income, 1250);
  assert.equal(signSponsor(world, 'broadcast').ok, true); assert.equal(club.finance.sponsor.remainingWeeks, 4);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(world)))), world);
});

test('새 주 이외·잘못된 종류·기존 계약 중에는 계약을 변경하거나 기간을 초기화하지 못한다', () => {
  const { world } = fixture(); const before = structuredClone(world);
  for (const kind of ['basic', '__proto__', null, '', 0]) assert.equal(signSponsor(world, kind).ok, false);
  assert.deepEqual(world, before);
  advanceDay(world); const partial = structuredClone(world);
  assert.equal(signSponsor(world, 'broadcast').ok, false); assert.deepEqual(world, partial);
  days(world, 6); signSponsor(world, 'broadcast'); const active = structuredClone(world);
  assert.equal(signSponsor(world, 'broadcast').ok, false); assert.deepEqual(world, active);
  const team = fixture(); beginTeamTraining(team.world); const pending = structuredClone(team.world);
  assert.equal(signSponsor(team.world, 'broadcast').ok, false); assert.deepEqual(team.world, pending);
});

test('일정 중단·이벤트 선택·저장 복원 후 남은 날짜만 방송 실적으로 처리한다', () => {
  const { world, player } = fixture(); signSponsor(world, 'broadcast'); selectTraining(world, player.id, 'broadcast');
  world.playerEvents.week = { startedDay: 1, endDay: 8, teamTraining: false,
    event: { eventId: 'dating', day: 4, status: 'scheduled', playerId: null, roll: null } };
  const paused = advanceWeek(world, { events: true }); assert.equal(paused.advancedDays, 3);
  const restored = restoreWorld(createSave(world)), club = restored.clubs[0];
  assert.equal(club.finance.sponsor.broadcastDays, 3);
  const snapshot = structuredClone(restored); advanceWeek(restored); assert.deepEqual(restored, snapshot);
  resolvePlayerEvent(restored, 'decline');
  assert.equal(advanceWeek(restored, { events: true }).advancedDays, 4);
  assert.equal(club.finance.settlements[0].broadcastDays, 7); assert.equal(club.finance.settlements[0].income, 1750);
  assert.deepEqual(restoreWorld(createSave(restored)), restored);
});

test('계약/재정 차단은 실적과 잔여 주를 바꾸지 않으며 팀 훈련 정산도 계약을 추가 소비하지 않는다', () => {
  const { world, club, player } = fixture(); signSponsor(world, 'broadcast'); selectTraining(world, player.id, 'broadcast');
  Object.values(club.contracts).forEach(contract => { contract.remainingDays = 1; });
  const before = structuredClone(world); assert.equal(advanceDay(world).ok, false); assert.deepEqual(world, before);
  Object.values(club.contracts).forEach(contract => { contract.remainingDays = 84; });
  club.finance.accruedUnits = Number.MAX_SAFE_INTEGER; const overflow = structuredClone(world);
  assert.equal(advanceDay(world).ok, false); assert.deepEqual(world, overflow);
  const other = fixture(); signSponsor(other.world, 'broadcast');
  beginTeamTraining(other.world); assert.equal(other.club.finance.sponsor.remainingWeeks, 3);
  const state = { complete: true, tick: 1, combat: false, actors: other.club.lineupIds.map(playerId => ({ playerId, team: 'home', stats: { kills: 0, deaths: 0, assists: 0 } })) };
  const sponsor = structuredClone(other.club.finance.sponsor);
  assert.equal(signSponsor(other.world, 'broadcast').ok, false);
  settleTeamTraining(other.world, state, other.world.teamTraining.day); assert.deepEqual(other.club.finance.sponsor, sponsor);
});

test('스폰서·방송 수입과 급여는 음수 자금에서 함께 정산하고 장부를 보존한다', () => {
  const { world, club } = fixture(); Object.values(club.contracts).forEach(contract => { contract.monthlySalary = 4000; });
  club.balance = 0; advanceWeek(world); assert.equal(club.balance,-3750);
  signSponsor(world, 'broadcast'); selectTraining(world, world.players[0].id, 'broadcast');
  advanceWeek(world); const entry = club.finance.settlements.at(-1);
  assert.equal(entry.income, 1750); assert.equal(entry.paidArrears, 0); assert.equal(entry.paidWages, 5000); assert.equal(club.balance,-6790);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('8명 전원 방송은 주간 56일분으로 기록하고 스폰서는 한 번만 지급한다', () => {
  const { world, club } = fixture(), affiliations = getAffiliations(world); club.balance = 100000;
  // Recruit the reserves during the fresh-game preseason before testing broadcasting.
  world.seasonCalendar = { mode: 'annual', phase: 'preseason' };
  const free = world.players.filter(player => !affiliations.has(player.id) && Math.max(player.aim, player.intelligence, player.stamina) <= 54).slice(0, 3);
  for (const player of free) assert.equal(recruitPlayer(world, player.id).ok, true);
  for (const id of club.playerIds) selectTraining(world, id, 'broadcast');
  signSponsor(world, 'broadcast'); advanceWeek(world);
  assert.equal(club.finance.settlements.length, 1);
  assert.equal(club.finance.settlements[0].broadcastDays, 56);
  assert.equal(club.finance.settlements[0].income, 1750);
  assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('v16 변환은 과거 수입/급여/자금/실적 없는 주간 상태를 보존하고 기본 계약을 추가한다', () => {
  const { world } = fixture(); advanceWeek(world); days(world, 3);
  const old = createSave(world); old.schemaVersion = 16;
  const finance = old.world.clubs[0].finance; delete finance.sponsor;
  finance.settlements.forEach(entry => { delete entry.sponsorKind; delete entry.broadcastDays; });
  const snapshot = structuredClone(old), restored = restoreWorld(old), actual = restored.clubs[0].finance;
  assert.deepEqual(old, snapshot); assert.deepEqual(actual.sponsor, createSponsor());
  assert.equal(restored.clubs[0].balance, old.world.clubs[0].balance);
  assert.deepEqual(actual.settlements.map(({ sponsorKind, broadcastDays, ...entry }) => entry), finance.settlements);
  assert.equal(actual.accruedUnits, finance.accruedUnits);
  assert.deepEqual(restoreWorld(createSave(restored)), restored);
});

test('저장은 계약/실적/과거 수입의 손상을 거부하고 재정 화면은 상태·조건·계약 버튼을 표시한다', () => {
  const { world, player } = fixture(); signSponsor(world, 'broadcast'); selectTraining(world, player.id, 'broadcast'); days(world, 3);
  const markup = financePanel(getClubView(world));
  assert.doesNotMatch(markup, /data-action="sign-sponsor"/); assert.match(markup, /잔여 4주/); assert.match(markup, /이번 주 방송 진행 중/);
  assert.match(markup, /disabled>계약 유지 중/);
  for (const mutate of [s => { s.kind = 'bad'; }, s => { s.remainingWeeks = 0; }, s => { s.broadcastDays = 25; }, s => { s.broadcastDays = .5; }]) {
    const bad = structuredClone(world); mutate(bad.clubs[0].finance.sponsor); assert.throws(() => createSave(bad), /스폰서/);
  }
  days(world, 4);
  for (const mutate of [e => { e.income = 3000; }, e => { e.broadcastDays = 6; }, e => { e.broadcastDays = 57; }, e => { e.sponsorKind = 'basic'; }]) {
    const bad = structuredClone(world); mutate(bad.clubs[0].finance.settlements[0]); assert.throws(() => createSave(bad), /재정/);
  }
});
