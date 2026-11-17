import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { createTraining, selectTraining } from '../src/game/training.js';
import { advanceDay } from '../src/game/calendar.js';
import { getAffiliations, getClubView } from '../src/game/world-selectors.js';
import { recruitPlayer, releasePlayer, signingFee } from '../src/game/roster.js';
import { transferQuote, negotiateTransfer } from '../src/game/transfers.js';
import { createSave, restoreWorld, parseBackup } from '../src/storage/save-data.js';
import { useDailySchema } from './legacy-fixture.js';
import { trainingPanel, experiencePanel } from '../src/ui/training-panel.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';

function fixture() {
  const world = createWorld(createClub('육성 검증').club, 42), club = world.clubs[0];
  const player = world.players.find(p => p.id === club.playerIds[0]);
  const assigned = getAffiliations(world);
  const free = world.players.filter(p => !assigned.has(p.id)).sort((a, b) => signingFee(a) - signingFee(b));
  return { world, club, player, free };
}
function days(world, count) { for (let i = 0; i < count; i++) assert.equal(advanceDay(world).ok, true); }

test('모든 신규 선수는 독립된 휴식·능력별 경험치 0으로 시작한다', () => {
  const { world } = fixture(), before = structuredClone(world);
  for (const p of world.players) assert.deepEqual(p.training, createTraining());
  days(world, 10);
  const aiIds = new Set(world.clubs.slice(1).flatMap(club => club.playerIds));
  assert.deepEqual(world.players.filter(p => !aiIds.has(p.id)).map(({ morale, ...p }) => p), before.players.filter(p => !aiIds.has(p.id)).map(({ morale, ...p }) => p));
  world.players[0].training.experience.aim = 10;
  assert.equal(world.players[1].training.experience.aim, 0);
});

test('선택 능력은 9일 경험치 90, 10일에 +1이며 나머지 능력·기존 월급·훈련비는 보존한다', () => {
  for (const skill of ['aim', 'intelligence', 'stamina']) {
    const { world, club, player } = fixture(), before = structuredClone(world);
    assert.equal(selectTraining(world, player.id, skill).ok, true);
    days(world, 9);
    assert.equal(player[skill], before.players[0][skill]);
    assert.equal(player.training.experience[skill], 90);
    days(world, 1);
    assert.equal(player[skill], before.players[0][skill] + 1);
    assert.equal(player.training.experience[skill], 0);
    for (const other of ['aim', 'intelligence', 'stamina'].filter(s => s !== skill)) assert.equal(player[other], before.players[0][other]);
    const weeklyPay = Math.floor(Object.values(club.contracts).reduce((sum, c) => sum + c.monthlySalary, 0) / 4);
    assert.equal(club.balance, before.clubs[0].balance + 1250 - weeklyPay);
    assert.equal(club.contracts[player.id].monthlySalary, before.clubs[0].contracts[player.id].monthlySalary);
    assert.deepEqual(world.clubs.slice(1), before.clubs.slice(1));
  }
});

test('목표 전환·휴식은 각 능력 경험치를 유지하고 잘못된 소속·목표는 상태를 바꾸지 않는다', () => {
  const { world, club, player, free } = fixture();
  selectTraining(world, player.id, 'aim'); days(world, 4);
  selectTraining(world, player.id, 'intelligence'); days(world, 3);
  selectTraining(world, player.id, 'rest'); days(world, 2);
  assert.deepEqual(player.training.experience, { aim: 40, intelligence: 30, stamina: 0 });
  const before = structuredClone(world);
  for (const id of [free[0].id, world.clubs[1].playerIds[0], 'missing']) assert.equal(selectTraining(world, id, 'aim').ok, false);
  for (const focus of ['bad', '__proto__', '', null, 0]) assert.equal(selectTraining(world, player.id, focus).ok, false);
  assert.deepEqual(world, before);
  selectTraining(world, player.id, 'aim'); days(world, 6);
  assert.equal(player.training.experience.aim, 0);
  assert.equal(player.training.experience.intelligence, 30);
  assert.ok(club.playerIds.includes(player.id));
});

test('후보도 성장하며 방출 후 멈추고 재영입 후 기존 목표·경험치로 재개한다', () => {
  const { world, club, free } = fixture();
  const reserve = free[0];
  recruitPlayer(world, reserve.id);
  assert.ok(!club.lineupIds.includes(reserve.id));
  selectTraining(world, reserve.id, 'aim'); days(world, 4);
  releasePlayer(world, reserve.id); days(world, 3);
  assert.equal(reserve.training.experience.aim, 40);
  recruitPlayer(world, reserve.id);
  assert.equal(reserve.training.focus, 'aim');
  days(world, 6);
  assert.equal(reserve.training.experience.aim, 0);
});

test('계약 만료 마지막 날은 훈련하고 이후 자유계약 상태에서는 성장하지 않는다', () => {
  const { world, club, free } = fixture();
  recruitPlayer(world, free[0].id);
  selectTraining(world, free[0].id, 'aim');
  club.contracts[free[0].id].remainingDays = 1;
  days(world, 1);
  assert.equal(getAffiliations(world).has(free[0].id), false);
  assert.equal(free[0].training.experience.aim, 10);
  days(world, 1);
  assert.equal(free[0].training.experience.aim, 10);
});

test('계약·재정으로 날짜 진행이 거절되면 경험치·능력도 바꾸지 않는다', () => {
  const { world, club, player } = fixture();
  selectTraining(world, player.id, 'aim');
  club.contracts[player.id].remainingDays = 1;
  let before = structuredClone(world);
  assert.equal(advanceDay(world).ok, false);
  assert.deepEqual(world, before);
  club.contracts[player.id].remainingDays = 90;
  club.finance.accruedUnits = Number.MAX_SAFE_INTEGER;
  before = structuredClone(world);
  assert.equal(advanceDay(world).ok, false);
  assert.deepEqual(world, before);
});

test('능력 98에서 99에 도달하면 경험치를 0으로 정리하고 추가 훈련으로 초과하지 않는다', () => {
  const { world, player } = fixture();
  player.aim = 98; player.training.experience.aim = 95;
  player.development.potential.aim = 99;
  selectTraining(world, player.id, 'aim'); days(world, 1);
  assert.equal(player.aim, 99);
  assert.equal(player.training.experience.aim, 0);
  days(world, 10);
  assert.equal(player.aim, 99);
  assert.equal(player.training.experience.aim, 0);
  assert.doesNotThrow(() => createSave(world));
});

test('진행 중 연습은 독립된 능력을 유지하고 성장 후 새 연습은 최신 에임·지능·체력을 복사한다', () => {
  const { world, club, player } = fixture();
  const away = () => getClubView(world, world.clubs[1].id);
  const old = createPractice(RELAY_MAP, getClubView(world), away(), { combat: true });
  const oldAim = player.aim, oldFee = signingFee(player);
  selectTraining(world, player.id, 'aim'); days(world, 10);
  const fresh = createPractice(RELAY_MAP, getClubView(world), away(), { combat: true });
  assert.equal(old.actors.find(a => a.playerId === player.id).aim, oldAim);
  const actor = fresh.actors.find(a => a.playerId === player.id);
  assert.equal(actor.aim, player.aim);
  assert.equal(actor.intelligence, player.intelligence);
  assert.equal(actor.stamina, player.stamina);
  assert.ok(signingFee(player) >= oldFee);
  const before = structuredClone(world);
  advancePractice(fresh, RELAY_MAP, 1000);
  assert.deepEqual(world, before);
  assert.equal(club.playerIds.length, 5);
});

test('이적과 상대 대체 영입은 선수의 기존 목표와 능력별 경험치를 지우지 않는다', () => {
  const { world } = fixture();
  const target = world.players.find(p => p.id === world.clubs[1].playerIds[0]);
  target.training = { focus: 'intelligence', schedule: Array(7).fill('intelligence'), experience: { aim: 20, intelligence: 50, stamina: 30 } };
  const quote = transferQuote(world, target.id);
  quote.replacement.training.experience.aim = 40;
  const before = structuredClone(target.training), replacement = structuredClone(quote.replacement.training);
  assert.equal(negotiateTransfer(world, target.id, 100).ok, true);
  assert.deepEqual(target.training, before);
  assert.deepEqual(quote.replacement.training, replacement);
  days(world, 1);
  assert.equal(target.training.experience.intelligence, 60);
  assert.equal(quote.replacement.training.focus, 'aim');
  assert.equal(quote.replacement.training.experience.aim, replacement.experience.aim + Math.round(10 * quote.replacement.development.growthRate / 100));
  assert.equal(quote.replacement.training.experience.intelligence, replacement.experience.intelligence);
  assert.equal(quote.replacement.training.experience.stamina, replacement.experience.stamina);
});

test('v8은 목표·경험치·능력과 급여 누적을 왕복하고 v6는 기존 상태를 보존해 휴식으로 변환한다', () => {
  const { world, player } = fixture();
  selectTraining(world, player.id, 'aim'); days(world, 13);
  const saved = createSave(world);
  assert.equal(saved.schemaVersion, 48);
  const restored = restoreWorld(parseBackup(JSON.stringify(saved)));
  assert.deepEqual(restored, world);
  days(restored, 1);
  assert.equal(restored.players[0].training.experience.aim, 40);
  const legacy = useDailySchema(structuredClone(saved), 6);
  legacy.world.players.forEach(p => { delete p.training; });
  const before = structuredClone(legacy);
  const upgraded = restoreWorld(parseBackup(JSON.stringify(legacy)));
  assert.deepEqual(legacy, before);
  assert.deepEqual(upgraded.clubs.map(c => [c.balance, c.playerIds, c.lineupIds]), world.clubs.map(c => [c.balance, c.playerIds, c.lineupIds]));
  assert.equal(upgraded.day, world.day);
  for (let i = 0; i < world.players.length; i++) {
    const { training, morale, ...other } = upgraded.players[i];
    const { morale: oldMorale, ...oldPlayer } = legacy.world.players[i];
    assert.deepEqual(other, { ...oldPlayer, fatigue: 0 });
    assert.deepEqual(training, createTraining());
  }
});

test('v8은 훈련 필드 누락·잘못된 목표/경험치·최대 능력 잔여 경험치를 거부한다', () => {
  const { world } = fixture();
  const changes = [p => { delete p.training; }, p => { p.training.focus = 'bad'; }, p => { p.training.experience = null; },
    ...[undefined, -1, 100, 0.5, '10', null].map(value => p => { p.training.experience.aim = value; }),
    p => { p.aim = 99; p.training.experience.aim = 10; }];
  for (const change of changes) {
    const broken = structuredClone(world); change(broken.players[0]);
    assert.throws(() => createSave(broken), /훈련/);
  }
});

test('훈련 표는 선택 목표·세 경험치·후보·최대 능력을 표시하고 이름과 ID를 이스케이프한다', () => {
  const { world, player, free } = fixture();
  recruitPlayer(world, free[0].id);
  player.nickname = '<img src=x onerror=bad>';
  selectTraining(world, player.id, 'aim'); days(world, 3);
  player.stamina = 99;
  player.development.potential.stamina = 99;
  const markup = experiencePanel(getClubView(world));
  assert.match(trainingPanel(getClubView(world)), /value="aim" selected/);
  assert.match(markup, /경험치 30 \/ 100/);
  assert.match(markup, /경험치 0 \/ 100/);
  assert.match(markup, /최대 능력/);
  assert.match(markup, /후보/);
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /&lt;img/);
  const view = getClubView(world); view.players[0].id = 'id" onclick="bad';
  assert.match(trainingPanel(view), /data-week-action-player="id&quot; onclick=&quot;bad"/);
});
