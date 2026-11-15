import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { selectTraining, selectWeeklyActions } from '../src/game/training.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { renewContract } from '../src/game/contracts.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createSave, parseBackup, restoreWorld } from '../src/storage/save-data.js';
import { useDailySchema } from './legacy-fixture.js';
import { trainingPanel, experiencePanel } from '../src/ui/training-panel.js';
import { clubScreen } from '../src/ui/screens.js';

function fixture() {
  const world = createWorld(createClub('주간 일정').club, 42), club = world.clubs[0];
  return { world, club, player: world.players.find(p => p.id === club.playerIds[0]) };
}
const experienceGained = (player, before) => ['aim', 'intelligence', 'stamina'].reduce((sum, key) => sum + (player[key] - before[key]) * 100 + player.training.experience[key] - before.training.experience[key], 0);

test('선수별 주간 행동 하나를 확정하면 7일 모두 같은 행동으로 진행한다', () => {
  const { world, club, player } = fixture();
  assert.equal(selectWeeklyActions(world, club.playerIds.map(playerId => ({ playerId, action: playerId === player.id ? 'aim' : 'rest' }))).ok, true);
  assert.deepEqual(player.training.schedule, Array(7).fill('aim'));
  const result = advanceWeek(world);
  assert.equal(result.advancedDays, 7);
  assert.equal(world.day, 8);
  assert.deepEqual(player.training.experience, { aim: 70, intelligence: 0, stamina: 0 });
  advanceWeek(world);
  assert.equal(player.training.experience.aim, 40);
  assert.equal(player.training.experience.intelligence, 0);
});

test('방송은 하루 30달러를 지급하고 주급 정산과 함께 반영하며 AI 구단은 유지한다', () => {
  const { world, club, player } = fixture();
  selectTraining(world, player.id, 'broadcast');
  const before = structuredClone(world);
  const result = advanceWeek(world);
  assert.equal(result.ok, true);
  assert.equal(result.actionIncome, 210);
  const weeklyPay = Math.floor(Object.values(club.contracts).reduce((sum, c) => sum + c.monthlySalary, 0) / 4);
  assert.equal(club.balance, before.clubs[0].balance + 210 + 1250 - weeklyPay);
  const aiIds = new Set(world.clubs.slice(1).flatMap(club=>club.playerIds));
  assert.deepEqual(world.players.filter(p=>!aiIds.has(p.id)).map(({ morale, fatigue, ...p }) => p), before.players.filter(p=>!aiIds.has(p.id)).map(({ morale, fatigue, ...p }) => p));
  assert.equal(player.fatigue, 7);
  assert.deepEqual(world.clubs.slice(1), before.clubs.slice(1));
  assert.equal(club.contracts[player.id].remainingDays, 77);
});

test('팀 훈련은 날짜 진행만으로 경험치나 보상 난수를 소비하지 않는다', () => {
  const { world, player } = fixture();
  selectTraining(world, player.id, 'team');
  const before = structuredClone(player), replay = structuredClone(world), randomBefore = world.actionRandomState;
  advanceWeek(world); advanceWeek(replay);
  assert.equal(experienceGained(player, before), 0);
  assert.equal(world.actionRandomState, randomBefore);
  assert.equal(world.seed, replay.seed);
  assert.deepEqual(world, replay);
  assert.deepEqual(restoreWorld(createSave(world)), world);
  advanceWeek(world); advanceWeek(replay);
  assert.deepEqual(world, replay);
});

test('팀 훈련이 최대 능력을 고르면 재추첨하거나 상한을 넘지 않는다', () => {
  const { world, player } = fixture();
  player.aim = player.intelligence = player.stamina = 99;
  player.development.potential = { aim: 99, intelligence: 99, stamina: 99 };
  selectTraining(world, player.id, 'team');
  advanceWeek(world);
  assert.deepEqual(player.training.experience, { aim: 0, intelligence: 0, stamina: 0 });
  assert.equal(player.aim, 99);
  assert.doesNotThrow(() => createSave(world));
});

test('중간 계약 중단은 지난 날을 보존하고 저장 복원 후 남은 5일만 재개한다', () => {
  const { world, club, player } = fixture();
  selectTraining(world, player.id, 'team');
  const broadcaster = world.players.find(p => p.id === club.playerIds[1]);
  selectTraining(world, broadcaster.id, 'broadcast');
  club.contracts[player.id].remainingDays = 3;
  const before = structuredClone(player), originalCash = club.balance;
  const result = advanceWeek(world);
  assert.equal(result.ok, false);
  assert.equal(result.advancedDays, 2);
  assert.equal(world.day, 3);
  assert.equal(world.weekDaysRemaining, 5);
  assert.equal(club.balance, originalCash + 60);
  assert.equal(experienceGained(player, before), 0);
  const replay = restoreWorld(parseBackup(JSON.stringify(createSave(world))));
  renewContract(world, player.id, 84); renewContract(replay, player.id, 84);
  assert.equal(advanceWeek(world).advancedDays, 5);
  assert.equal(advanceWeek(replay).advancedDays, 5);
  assert.equal(world.day, 8);
  assert.equal(world.weekDaysRemaining, 0);
  const weeklyPay = Math.floor(Object.values(club.contracts).reduce((sum, c) => sum + c.monthlySalary, 0) / 4);
  assert.equal(club.balance, originalCash + 210 + 1250 - weeklyPay);
  assert.equal(experienceGained(player, before), 0);
  assert.deepEqual(world, replay);
});

test('첫날 중단과 방송 금액 상한 차단은 난수·경험치·자금·날짜를 전혀 바꾸지 않는다', () => {
  const { world, club, player } = fixture();
  selectTraining(world, player.id, 'team');
  club.contracts[player.id].remainingDays = 1;
  let before = structuredClone(world);
  assert.equal(advanceWeek(world).advancedDays, 0);
  assert.deepEqual(world, before);
  renewContract(world, player.id, 84);
  selectTraining(world, player.id, 'broadcast');
  club.balance = Number.MAX_SAFE_INTEGER;
  before = structuredClone(world);
  assert.equal(advanceWeek(world).advancedDays, 0);
  assert.deepEqual(world, before);
});

test('주간 진행 다섯 번은 방송 수입과 주급을 각각 다섯 번 정산한다', () => {
  const { world, club, player } = fixture();
  selectTraining(world, player.id, 'broadcast');
  const initial = club.balance, salary = Object.values(club.contracts).reduce((sum, c) => sum + c.monthlySalary, 0);
  for (let i = 0; i < 5; i++) assert.equal(advanceWeek(world).ok, true);
  assert.equal(world.day, 36);
  assert.equal(club.finance.settlements.length, 5);
  assert.equal(club.finance.settlements[0].day, 8);
  assert.equal(club.finance.settlements[0].balance, initial + 7 * 30 + 1250 - Math.floor(salary / 4));
  assert.equal(club.balance, initial + 35 * 30 + 5 * 1250 - Math.floor(salary * 5 / 4));
});

test('v7 저장은 날짜·기존 경험치/재정을 보존하고 기존 목표로 일주일을 채운다', () => {
  const { world, player } = fixture();
  selectTraining(world, player.id, 'aim'); advanceDay(world);
  const legacy = useDailySchema(createSave(world), 7);
  delete legacy.world.weekDaysRemaining; delete legacy.world.actionRandomState;
  legacy.world.players.forEach(p => { delete p.training.schedule; });
  const before = structuredClone(legacy);
  const restored = restoreWorld(parseBackup(JSON.stringify(legacy)));
  assert.deepEqual(legacy, before);
  assert.equal(restored.day, world.day);
  assert.deepEqual(restored.clubs.map(c => [c.balance, c.playerIds]), world.clubs.map(c => [c.balance, c.playerIds]));
  assert.deepEqual(restored.players[0].training.experience, player.training.experience);
  assert.deepEqual(restored.players[0].training.schedule, Array(7).fill('aim'));
  assert.equal(restored.weekDaysRemaining, 0);
  assert.equal(createSave(restored).schemaVersion, 47);
  assert.deepEqual(restoreWorld(createSave(restored)), restored);
});

test('유효하지 않은 주간 선택·소속·난수·중단 일수를 거부한다', () => {
  const { world, club } = fixture(), before = structuredClone(world);
  const choices = club.playerIds.map(playerId => ({ playerId, action: 'aim' }));
  for (const bad of [null, [], choices.slice(1), [...choices, choices[0]], choices.map(() => choices[0]),
    choices.map((choice, index) => index === 4 ? { ...choice, playerId: world.clubs[1].playerIds[0] } : choice),
    ...['bad', null, ['aim']].map(action => choices.map((choice, index) => index === 4 ? { ...choice, action } : choice))]) {
    assert.equal(selectWeeklyActions(world, bad).ok, false);
    assert.deepEqual(world, before);
  }
  const changes = [w => { w.weekDaysRemaining = 7; }, w => { w.weekDaysRemaining = -1; }, w => { delete w.weekDaysRemaining; },
    w => { w.actionRandomState = -1; }, w => { w.actionRandomState = 0x100000000; }, w => { delete w.actionRandomState; },
    w => { w.players[0].training.schedule = Array(6).fill('rest'); }, w => { w.players[0].training.schedule[1] = 'bad'; },
    w => { delete w.players[0].training.schedule[1]; }, w => { w.players[0].training.focus = ['aim']; }];
  for (const change of changes) {
    const broken = structuredClone(world); change(broken);
    assert.throws(() => createSave(broken), /행동|주간|훈련/);
  }
});

test('주간 행동 선택 창과 명단 아래 경험치 창을 분리하고 날짜·중단 후 남은 일수를 표시한다', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ innerHTML: '', querySelector: () => ({ textContent: '' }), classList: { add() {} }, querySelectorAll: () => [], addEventListener() {} }) } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'document', descriptor) : delete globalThis.document);
  const { world, player } = fixture();
  selectTraining(world, player.id, 'broadcast');
  const before = structuredClone(world);
  const markup = trainingPanel(getClubView(world));
  assert.match(markup, /선수 행동 선택/);
  assert.match(markup, /<dialog id="weekly-action-dialog"/);
  assert.doesNotMatch(markup, /<dialog[^>]*\sopen(?:\s|>)/);
  assert.match(markup, /data-action="cancel-week"/);
  assert.match(markup, /data-action="confirm-week"/);
  assert.doesNotMatch(markup, /data-schedule-day|weekly-actions-table/);
  assert.match(markup, /경험치 0 \/ 100/);
  assert.equal([...markup.matchAll(/class="weekly-action-skill development-/g)].length, world.clubs[0].playerIds.length * 3);
  for (const skill of ['aim', 'intelligence', 'stamina']) {
    assert.ok(markup.includes(`<strong>${player[skill]}</strong>`));
  }
  assert.equal([...markup.matchAll(/data-week-action-player=/g)].length, world.clubs[0].playerIds.length);
  assert.match(markup, /value="broadcast" selected/);
  const experience = experiencePanel(getClubView(world));
  assert.match(experience, /선수 능력·경험치/);
  assert.match(experience, /경험치 0 \/ 100/);
  assert.doesNotMatch(experience, /<select/);
  assert.deepEqual(world, before);
  const screen = clubScreen(getClubView(world));
  assert.match(screen.innerHTML, /class="club-title-row"/);
  assert.match(screen.innerHTML, /게임 1일 차 · 1주 차 · 월요일/);
  assert.match(screen.innerHTML, /data-action="advance-week">1주 진행/);
  assert.doesNotMatch(screen.innerHTML, /data-action="advance-day"/);
  assert.ok(screen.innerHTML.indexOf('aria-labelledby="roster-title"') < screen.innerHTML.indexOf('aria-labelledby="experience-title"'));
  assert.ok(screen.innerHTML.indexOf('aria-labelledby="experience-title"') < screen.innerHTML.indexOf('aria-labelledby="contracts-title"'));
  world.weekDaysRemaining = 5;
  assert.match(clubScreen(getClubView(world)).innerHTML, /남은 5일 진행/);
});
