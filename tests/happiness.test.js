import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { createMorale, happinessModifier, effectiveStats } from '../src/game/happiness.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { selectTraining, selectWeeklyActions } from '../src/game/training.js';
import { beginTeamTraining, settleTeamTraining } from '../src/game/team-training.js';
import { recruitPlayer, releasePlayer, signingFee } from '../src/game/roster.js';
import { getAffiliations, getClubView } from '../src/game/world-selectors.js';
import { createSave, parseBackup, restoreWorld } from '../src/storage/save-data.js';
import { createPractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { trainingPanel, experiencePanel } from '../src/ui/training-panel.js';
import { rosterTable } from '../src/ui/screens.js';

function fixture() {
  const world = createWorld(createClub('행복도 검사').club, 42), club = world.clubs[0], player = world.players[0];
  return { world, club, player };
}
function days(world, count) { for (let i = 0; i < count; i++) assert.equal(advanceDay(world).ok, true); }
const base = player => [player.aim, player.intelligence, player.stamina];

test('동일 훈련은 첫 주 유지·2주 -7·3주 -14이고 실제 다른 행동은 기록을 끊는다', () => {
  const { world, player } = fixture();
  assert.deepEqual(player.morale, createMorale()); selectTraining(world, player.id, 'aim');
  days(world, 7); assert.equal(player.morale.happiness, 70); assert.equal(player.morale.consecutiveDays, 7);
  const before = structuredClone(player.morale);
  selectTraining(world, player.id, 'intelligence'); selectTraining(world, player.id, 'aim');
  assert.deepEqual(player.morale, before);
  days(world, 7); assert.equal(player.morale.happiness, 63);
  days(world, 7); assert.equal(player.morale.happiness, 49);
  selectTraining(world, player.id, 'intelligence'); days(world, 7);
  assert.equal(player.morale.happiness, 49); assert.equal(player.morale.consecutiveDays, 7);
  assert.equal(player.morale.lastAction, 'intelligence');
});

test('방송은 첫 주 +7 이후 반복 불이익이며 행복도 상하한을 지킨다', () => {
  const { world, player } = fixture(); selectTraining(world, player.id, 'broadcast');
  days(world, 7); assert.equal(player.morale.happiness, 77);
  days(world, 7); assert.equal(player.morale.happiness, 70);
  days(world, 7); assert.equal(player.morale.happiness, 56);
  player.morale.happiness = 1; days(world, 1); assert.equal(player.morale.happiness, 0);
  selectTraining(world, player.id, 'rest'); player.morale.happiness = 99;
  days(world, 1); assert.equal(player.morale.happiness, 100);
});

test('휴식 7/8/14/15일 경계와 세 경험치 감소·기본 능력 보존을 확인한다', () => {
  const { world, player } = fixture(), initial = base(player);
  player.training.experience = { aim: 99, intelligence: 99, stamina: 99 };
  days(world, 7); assert.equal(player.morale.happiness, 84); assert.equal(player.training.experience.aim, 99);
  days(world, 1); assert.equal(player.morale.happiness, 85); assert.equal(player.training.experience.aim, 97);
  days(world, 6); assert.equal(player.morale.happiness, 91);
  assert.deepEqual(player.training.experience, { aim: 85, intelligence: 85, stamina: 85 });
  days(world, 1); assert.equal(player.morale.happiness, 91); assert.equal(player.training.experience.aim, 82);
  days(world, 6); assert.deepEqual(player.training.experience, { aim: 64, intelligence: 64, stamina: 64 });
  days(world, 22); assert.deepEqual(player.training.experience, { aim: 0, intelligence: 0, stamina: 0 });
  assert.deepEqual(base(player), initial);
});

test('막힌 날짜는 상태를 보존하고 중간 저장 후 재개해도 실제 행동만 계산한다', () => {
  const { world, club, player } = fixture(); selectTraining(world, player.id, 'broadcast');
  club.contracts[player.id].remainingDays = 3;
  assert.equal(advanceWeek(world).advancedDays, 2);
  assert.equal(player.morale.happiness, 72); assert.equal(player.morale.consecutiveDays, 2);
  const before = structuredClone(world); assert.equal(advanceWeek(world).advancedDays, 0); assert.deepEqual(world, before);
  const restored = restoreWorld(parseBackup(JSON.stringify(createSave(world))));
  restored.clubs[0].contracts[player.id].remainingDays = 84;
  assert.equal(advanceWeek(restored).advancedDays, 5);
  assert.equal(restored.players[0].morale.happiness, 77);
  assert.equal(restored.players[0].morale.consecutiveDays, 7);
  restored.clubs[0].finance.accruedUnits = Number.MAX_SAFE_INTEGER;
  const blocked = structuredClone(restored); assert.equal(advanceDay(restored).ok, false); assert.deepEqual(restored, blocked);
});

test('모든 행복도 경계의 경기 보정·능력 상한과 세계/가격/경험치 보존을 확인한다', () => {
  const { world, player } = fixture(), initial = base(player), price = signingFee(player);
  const home = getClubView(world), away = getClubView(world, world.clubs[1].id);
  for (const [happiness, expected] of [[0,-4],[24,-4],[25,-2],[44,-2],[45,0],[74,0],[75,1],[89,1],[90,3],[100,3]]) {
    player.morale.happiness = happiness;
    const before = structuredClone(world), state = createPractice(RELAY_MAP, home, away, { match: true });
    const actor = state.actors.find(a => a.playerId === player.id);
    assert.equal(happinessModifier(player), expected);
    assert.deepEqual([actor.aim, actor.intelligence, actor.stamina], initial.map(value => value + expected));
    assert.equal(signingFee(player), price); assert.deepEqual(world, before);
  }
  assert.deepEqual(effectiveStats({ aim: 1, intelligence: 2, stamina: 3, morale: { happiness: 0 } }), { aim: 1, intelligence: 1, stamina: 1 });
  assert.deepEqual(effectiveStats({ aim: 98, intelligence: 99, stamina: 97, morale: { happiness: 100 } }), { aim: 99, intelligence: 99, stamina: 99 });
  player.morale.happiness = 90;
  const snapshot = createPractice(RELAY_MAP, home, away);
  player.morale.happiness = 0; assert.equal(snapshot.actors[0].aim, player.aim + 3);
});

test('후보와 AI는 행동 효과를 받고 자유계약 선수는 멈추며 재영입은 행복도를 보존한다', () => {
  const { world, club } = fixture(), affiliations = getAffiliations(world);
  const free = world.players.filter(p => !affiliations.has(p.id)).sort((a,b) => signingFee(a)-signingFee(b))[0];
  const ai = world.players.find(p => p.id === world.clubs[1].playerIds[0]), aiBefore = structuredClone(ai);
  assert.deepEqual(free.morale, createMorale()); recruitPlayer(world, free.id);
  assert.ok(!club.lineupIds.includes(free.id)); days(world, 7);
  assert.equal(free.morale.happiness, 84); releasePlayer(world, free.id);
  const record = structuredClone(free.morale); days(world, 3);
  assert.deepEqual(free.morale, record); assert.notDeepEqual(ai.training, aiBefore.training);
  assert.equal(ai.morale.lastDay, world.day - 1);
  recruitPlayer(world, free.id); assert.deepEqual(free.morale, record);
  days(world, 1); assert.equal(free.morale.consecutiveDays, 1); assert.equal(free.morale.happiness, 86);
});

test('팀 훈련 반복도 행복도에 반영하며 정산/경기 초기화는 행동 기록을 소비하지 않는다', () => {
  const { world, club, player } = fixture();
  const choices = club.playerIds.map(id => ({ playerId: id, action: id === player.id ? 'team' : 'rest' }));
  for (let week = 0; week < 2; week++) {
    selectWeeklyActions(world, choices); assert.equal(beginTeamTraining(world).ok, true);
    const state = { complete: true, tick: 1, combat: false, actors: club.lineupIds.map(id => ({ playerId: id, team: 'home', stats: { kills: 0, deaths: 0, assists: 0 } })) };
    const before = structuredClone(player.morale);
    assert.equal(settleTeamTraining(world, state, world.teamTraining.day).ok, true);
    assert.deepEqual(player.morale, before);
    assert.equal(settleTeamTraining(world, state, world.teamTraining.day).ok, false);
  }
  assert.equal(player.morale.happiness, 63); assert.equal(player.morale.consecutiveDays, 14);
});

test('v10 복원은 기존 세계를 보존하고 행복도 70부터 시작하며 v11 재복원은 기록을 유지한다', () => {
  const { world, player } = fixture(); days(world, 8);
  const old = createSave(world); old.schemaVersion = 10; old.world.players.forEach(p => { delete p.morale; });
  const before = structuredClone(old), restored = restoreWorld(parseBackup(JSON.stringify(old)));
  assert.deepEqual(old, before);
  assert.deepEqual(restored.clubs, world.clubs.map(club => club.finance ? {...club,finance:{...club.finance,cashStartedDay:restored.day}} : club)); assert.equal(restored.day, world.day);
  for (const p of restored.players) assert.deepEqual(p.morale, createMorale());
  assert.deepEqual(restored.players.map(({morale,fatigue,...p})=>p), old.world.players.map(({fatigue,...p})=>p));
  assert.ok(restored.players.every(player=>player.fatigue===0));
  assert.equal(restored.players[0].training.experience.aim, player.training.experience.aim);
  days(restored, 7); assert.equal(restored.players[0].morale.happiness, 84);
  assert.deepEqual(restoreWorld(parseBackup(JSON.stringify(createSave(restored)))), restored);
  assert.equal(createSave(restored).schemaVersion, 48);
});

test('잘못된 행복도·연속 행동·미래/누락 날짜와 잘못된 조합을 저장에서 거부한다', () => {
  const { world } = fixture(); days(world, 2);
  for (const mutate of [
    p => { delete p.morale; }, p => { p.morale.happiness = 101; }, p => { p.morale.happiness = -1; },
    p => { p.morale.happiness = '70'; }, p => { p.morale.happiness = 0.5; },
    p => { p.morale.consecutiveDays = -1; }, p => { p.morale.consecutiveDays = 0.5; },
    p => { p.morale.consecutiveDays = 3; }, p => { p.morale.lastAction = 'bad'; },
    p => { p.morale.lastDay = world.day; }, p => { p.morale.lastDay = null; },
    p => { p.morale.consecutiveDays = 0; },
  ]) { const broken = structuredClone(world); mutate(broken.players[0]); assert.throws(() => createSave(broken), /행복도/); }
});

test('소속 선수 패널은 행복도·임시 능력·연속 행동을 표시하고 일반 선수 목록에는 노출하지 않는다', () => {
  const { world, player } = fixture(); player.nickname = '<script>bad</script>'; days(world, 7);
  const club = getClubView(world), stats = experiencePanel(club), actions = trainingPanel(club);
  assert.match(stats, /행복도/); assert.match(stats, /84 \/ 100/); assert.match(stats, /경기 보정 \+1/);
  assert.match(stats, /경기 적용/); assert.match(stats, /&lt;script&gt;/); assert.doesNotMatch(stats, /<script>/);
  assert.match(actions, /휴식 · 연속 1주/); assert.match(actions, /각 경험치 -21/);
  assert.doesNotMatch(rosterTable(world.players), /행복도/);
});
