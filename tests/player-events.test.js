import { createCounseling } from '../src/game/counseling.js';
import { createAiGrowth } from '../src/game/ai-growth.js';
import { createStockMarket } from '../src/game/stocks.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_EVENTS, PLAYER_EVENT_RULES } from '../src/data/player-events.js';
import { createPlayerEvents, planPlayerEventWeek, pendingPlayerEvent, resolvePlayerEvent } from '../src/game/player-events.js';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { beginTeamTraining } from '../src/game/team-training.js';
import { selectWeeklyActions } from '../src/game/training.js';
import { releasePlayer } from '../src/game/roster.js';
import { renewContract } from '../src/game/contracts.js';
import { createSave, parseBackup, restoreWorld } from '../src/storage/save-data.js';
import { getClubView } from '../src/game/world-selectors.js';
import { playerEventsPanel } from '../src/ui/player-events-panel.js';

function fixture(eventId = 'treadmill', offset = 3, teamTraining = false, source = null) {
  const world = source ?? createWorld(createClub('이벤트 검사').club, 42), club = world.clubs[0], start = world.day;
  world.playerEvents.week = { startedDay: start, endDay: start + 7, teamTraining,
    event: { eventId, day: start + offset, status: 'scheduled', playerId: null, roll: null } };
  const result = teamTraining ? beginTeamTraining(world, { events: true }) : advanceWeek(world, { events: true });
  assert.equal(result.eventPending, true); assert.equal(result.advancedDays, offset);
  return { world, club, result, event: world.playerEvents.week.event, player: world.players.find(p => p.id === world.playerEvents.week.event.playerId) };
}

test('15종은 각 수락/거절을 제공하고 1000개 시드에서 60% 발생 및 모든 종류/주간 날짜가 나온다', () => {
  assert.equal(PLAYER_EVENTS.length, 15); assert.equal(new Set(PLAYER_EVENTS.map(e => e.id)).size, 15);
  let count = 0; const found = new Set(), offsets = new Set();
  for (let seed = 0; seed < 1000; seed++) {
    const world = { playerEvents: createPlayerEvents(seed) }; planPlayerEventWeek(world, 1, 7, false);
    const { event } = world.playerEvents.week;
    if (event) { count++; found.add(event.eventId); offsets.add(event.day - 1); }
  }
  assert.ok(count > 550 && count < 650); assert.equal(found.size, 15); assert.equal(offsets.size, 7);
  for (const e of PLAYER_EVENTS) assert.equal(e.decline.cash, 0);
});

test('실제 새 주간 추첨은 발생/미발생과 일반/팀 훈련 모두 정확히 7일 후 한 번 마친다', () => {
  let occurred = 0, absent = 0;
  for (const team of [false, true]) for (let seed = 0; seed < 20; seed++) {
    const world = createWorld(createClub('주간 연결').club, seed);
    const progress = () => team ? beginTeamTraining(world, { events: true }) : advanceWeek(world, { events: true });
    let result = progress();
    if (result.eventPending) {
      occurred++; assert.equal(world.playerEvents.week.teamTraining, team);
      assert.equal(resolvePlayerEvent(world, 'decline').ok, true);
      result = progress(); assert.equal(world.playerEvents.history.length, 1);
    } else { absent++; assert.equal(world.playerEvents.history.length, 0); }
    assert.equal(result.ok, true); assert.equal(world.day, 8); assert.equal(world.weekDaysRemaining, 0);
    assert.equal(world.playerEvents.week, null); assert.equal(world.clubs[0].finance.settlements.length, 1);
    assert.equal(world.teamTraining?.status === 'pending', team);
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
  assert.ok(occurred > 0 && absent > 0);
});

test('전 이벤트의 수락/거절 비용·행복도·확률 성공 능력 효과를 실제 선수에게 한 번 적용한다', () => {
  for (const definition of PLAYER_EVENTS) for (const choice of ['accept', 'decline']) {
    const { world, club, event, player } = fixture(definition.id); event.roll = 0;
    const before = structuredClone(player), cash = club.balance, effect = definition[choice];
    const outcome = resolvePlayerEvent(world, choice);
    assert.equal(outcome.ok, true); assert.equal(club.balance, cash + effect.cash);
    assert.equal(player.morale.happiness, Math.max(0, Math.min(100, before.morale.happiness + effect.happiness)));
    for (const skill of ['aim', 'intelligence', 'stamina']) assert.equal(player[skill], before[skill] + (effect.skill === skill ? effect.delta : 0));
    assert.equal(world.playerEvents.history.length, 1); assert.equal(pendingPlayerEvent(world), false);
    assert.deepEqual(player.morale.lastDay, before.morale.lastDay);
    const after = structuredClone(world); assert.equal(resolvePlayerEvent(world, choice).ok, false); assert.deepEqual(world, after);
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
});

test('확률 임계점·행복도/능력 상하한·최대 능력 경험치 처리를 지킨다', () => {
  for (const [roll, change] of [[0.699999, 1], [0.7, 0], [0.99999, 0]]) {
    const { world, player, event } = fixture(); event.roll = roll;
    const initial = player.stamina; resolvePlayerEvent(world, 'accept'); assert.equal(player.stamina, initial + change);
  }
  const high = fixture('equipment'); high.event.roll = 0; high.player.aim = 98;
  high.player.development.potential.aim = 99;
  high.player.training.experience.aim = 70; high.player.morale.happiness = 99;
  resolvePlayerEvent(high.world, 'accept'); assert.equal(high.player.aim, 99); assert.equal(high.player.training.experience.aim, 0); assert.equal(high.player.morale.happiness, 100);
  const low = fixture('dating'); low.event.roll = 0; low.player.intelligence = 1;
  low.player.training.experience.intelligence = 25;
  resolvePlayerEvent(low.world, 'accept'); assert.equal(low.player.intelligence, 1); assert.equal(low.player.training.experience.intelligence, 25);
  const unhappy = fixture('diet'); unhappy.player.morale.happiness = 1;
  resolvePlayerEvent(unhappy.world, 'accept'); assert.equal(unhappy.player.morale.happiness, 0);
});

test('돈이 부족한 유료 수락과 수입 상한 초과는 변경 없이 거절하고 무료 거절을 허용한다', () => {
  const poor = fixture(); poor.club.balance = 0;
  const before = structuredClone(poor.world); assert.equal(resolvePlayerEvent(poor.world, 'accept').ok, false); assert.deepEqual(poor.world, before);
  assert.equal(resolvePlayerEvent(poor.world, 'decline').ok, true); assert.equal(poor.club.balance, 0);
  const full = fixture('collaboration'); full.club.balance = Number.MAX_SAFE_INTEGER;
  const previous = structuredClone(full.world); assert.equal(resolvePlayerEvent(full.world, 'accept').ok, false); assert.deepEqual(full.world, previous);
  assert.equal(resolvePlayerEvent(full.world, 'decline').ok, true);
});

test('선택 대기는 날짜·다음 주·행동 변경·팀 훈련·대상 방출을 막으며 모든 상태를 보존한다', () => {
  const { world, club, player } = fixture(), before = structuredClone(world);
  assert.equal(advanceDay(world).eventPending, true); assert.equal(advanceWeek(world).eventPending, true);
  assert.equal(beginTeamTraining(world, { events: true }).eventPending, true);
  assert.equal(selectWeeklyActions(world, club.playerIds.map(playerId => ({ playerId, action: 'aim' }))).ok, false);
  assert.equal(releasePlayer(world, player.id).ok, false); assert.deepEqual(world, before);
});

test('중간 이벤트 저장/복원은 같은 대상·확률을 유지하고 선택 후 남은 기간만 재개한다', () => {
  const { world, event } = fixture(), seed = world.seed, rewardRandom = world.actionRandomState;
  const saved = JSON.stringify(createSave(world)), replay = restoreWorld(parseBackup(saved));
  assert.deepEqual(replay.playerEvents.week.event, event);
  assert.equal(world.day, 4); assert.equal(world.weekDaysRemaining, 4);
  for (const current of [world, replay]) {
    assert.equal(resolvePlayerEvent(current, 'accept').ok, true);
    const random = current.playerEvents.randomState;
    assert.equal(advanceWeek(current, { events: true }).advancedDays, 4);
    assert.equal(current.playerEvents.randomState, random); assert.equal(current.playerEvents.week, null);
    assert.equal(current.day, 8); assert.equal(current.seed, seed); assert.equal(current.actionRandomState, rewardRandom);
    assert.equal(current.clubs[0].finance.settlements.length, 1);
  }
  assert.deepEqual(world, replay); assert.deepEqual(restoreWorld(createSave(world)), world);
});

test('마지막 날 팀 훈련 이벤트는 선택 후 날짜 추가 없이 연습 참가 상태를 만든다', () => {
  const { world } = fixture('dating', 7, true);
  assert.equal(world.day, 8); assert.equal(world.weekDaysRemaining, 0); assert.equal(world.teamTraining, null);
  const copy = restoreWorld(createSave(world));
  assert.equal(copy.playerEvents.week.teamTraining, true);
  resolvePlayerEvent(copy, 'decline');
  assert.equal(beginTeamTraining(copy, { events: true }).advancedDays, 0);
  assert.equal(copy.day, 8); assert.equal(copy.playerEvents.week, null);
  assert.equal(copy.teamTraining.status, 'pending'); assert.equal(copy.teamTraining.day, 8);
  assert.deepEqual(restoreWorld(createSave(copy)), copy);
});

test('계약 중단 전에는 추첨하지 않고 일부 진행 후 차단/재개도 같은 주 이벤트를 유지한다', () => {
  const world = createWorld(createClub('중단').club, 42), club = world.clubs[0], id = club.playerIds[0];
  club.contracts[id].remainingDays = 1;
  const before = structuredClone(world); assert.equal(advanceWeek(world, { events: true }).advancedDays, 0); assert.deepEqual(world, before);
  club.contracts[id].remainingDays = 3;
  world.playerEvents.week = { startedDay: 1, endDay: 8, teamTraining: false,
    event: { eventId: 'treadmill', day: 6, status: 'scheduled', playerId: null, roll: null } };
  assert.equal(advanceWeek(world, { events: true }).advancedDays, 2);
  const expected = structuredClone(world.playerEvents), restored = restoreWorld(createSave(world));
  renewContract(restored, id, 84);
  assert.equal(advanceWeek(restored, { events: true }).eventPending, true);
  assert.equal(restored.day, 6); assert.equal(restored.playerEvents.week.event.eventId, expected.week.event.eventId);
  resolvePlayerEvent(restored, 'decline'); advanceWeek(restored, { events: true });
  assert.equal(restored.day, 8); assert.equal(restored.playerEvents.history.length, 1);
});

test('새 이벤트는 최근 20개만 보관하고 저장/이어하기로 비용과 결과를 중복 적용하지 않는다', () => {
  const world = createWorld(createClub('장기 이벤트').club, 42);
  for (let i = 0; i < 25; i++) {
    world.clubs[0].playerIds.forEach(id => renewContract(world, id, 168));
    fixture('hobby', 3, false, world); resolvePlayerEvent(world, 'decline'); advanceWeek(world, { events: true });
    assert.deepEqual(restoreWorld(createSave(world)), world);
  }
  assert.equal(world.playerEvents.history.length, PLAYER_EVENT_RULES.historyLimit);
  assert.equal(world.playerEvents.history[0].day, 39);
});

test('v11 변환은 행복도·행동·능력·재정·주간 잔여를 보존하며 이벤트만 빈 상태로 시작한다', () => {
  const { world } = fixture(); const old = createSave(world); old.schemaVersion = 11; delete old.world.playerEvents; old.world.clubs[0].finance.cashStartedDay=old.world.day;
  const before = structuredClone(old), restored = restoreWorld(parseBackup(JSON.stringify(old)));
  assert.deepEqual(old, before);
  const { playerEvents, ...rest } = restored; assert.deepEqual(rest, { ...old.world, players:old.world.players.map(player=>({...player,fatigue:0})), aiGrowth:createAiGrowth(world.day),counseling:createCounseling(world), stocks: createStockMarket(world.seed,world.day) });
  assert.deepEqual(playerEvents, createPlayerEvents(world.seed));
  assert.deepEqual(restoreWorld(createSave(restored)), restored); assert.equal(createSave(restored).schemaVersion, 47);
});

test('손상된 이벤트·대상·확률·중복 이력·효과·주간 경계는 저장에서 거부한다', () => {
  const { world } = fixture();
  for (const change of [
    w => { delete w.playerEvents; }, w => { w.playerEvents.randomState = -1; },
    w => { w.playerEvents.week.event.eventId = 'bad'; }, w => { w.playerEvents.week.event.playerId = 'missing'; },
    w => { w.playerEvents.week.event.roll = NaN; }, w => { w.playerEvents.week.event.roll = 1; },
    w => { w.playerEvents.week.endDay++; }, w => { w.playerEvents.week.teamTraining = 1; },
    w => { w.playerEvents.week.event.status = 'resolved'; }, w => { w.playerEvents.week.event.day++; },
    w => { w.playerEvents.week.event.status = 'scheduled'; },
  ]) { const broken = structuredClone(world); change(broken); assert.throws(() => createSave(broken), /이벤트/); }
  resolvePlayerEvent(world, 'accept');
  for (const change of [
    s => { s.history.push(s.history[0]); }, s => { s.history[0].balanceDelta++; },
    s => { s.history[0].happinessAfter++; }, s => { s.history[0].statAfter = -1; },
  ]) { const broken = structuredClone(world); change(broken.playerEvents); assert.throws(() => createSave(broken), /이벤트/); }
});

test('이벤트 화면은 선택 전 비용/확률·자금 부족·실제 결과와 이름 이스케이프를 표시한다', () => {
  const { world, club, player } = fixture(); player.nickname = '<img src=x>'; club.balance = 0;
  const markup = playerEventsPanel(getClubView(world));
  assert.match(markup, /비용 \$500/); assert.match(markup, /체력 \+1 확률 70%/);
  assert.match(markup, /능력 변화 없음 30%/); assert.match(markup, /자금 부족/);
  assert.match(markup, /data-event-choice="decline"/); assert.match(markup, /선택 전 저장/);
  assert.match(markup, /&lt;img/); assert.doesNotMatch(markup, /<img/);
  resolvePlayerEvent(world, 'decline');
  const history = playerEventsPanel(getClubView(world)); assert.match(history, /최근 이벤트 결과 \(1건\)/);
  assert.match(history, /거절/); assert.match(history, /행복도 \d+ → \d+/); assert.doesNotMatch(history, /<img/);
});
