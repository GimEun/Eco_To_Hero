import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { previewPlayerAction, selectTraining } from '../src/game/training.js';
import { advanceDay, advanceWeek } from '../src/game/calendar.js';
import { nextSettlementForecast } from '../src/game/finance.js';
import { calendarWeek, calendarMonth } from '../src/game/schedule-calendar.js';
import { beginOfficialSchedule } from '../src/game/weekly-official.js';
import { trainingPanel, updateActionPreviews, actionPreviewMarkup } from '../src/ui/training-panel.js';
import { scheduleCalendarPanel, mountScheduleCalendar } from '../src/ui/schedule-calendar-panel.js';
import { TRAINING_SKILLS, TRAINING_LABELS } from '../src/config/training.js';

function fixture() {
  const world = createWorld(createClub('계획 확인 <구단>').club, 42);
  return { world, club: world.clubs[0], player: world.players.find(player => player.id === world.clubs[0].playerIds[0]) };
}

test('모든 행동 예상치는 코치·시설·성장·상한·반복 효과를 반영하고 실제 7일 결과와 같다', () => {
  for (const action of Object.keys(TRAINING_LABELS)) {
    const { world, club, player } = fixture();
    assert.equal(advanceWeek(world).ok, true);
    club.coach = 'advanced'; club.facilities.aim = 2;
    player.development.growthRate = 120;
    player.stamina = 79; player.training.experience.stamina = 95;
    player.fatigue = 30;
    for (const skill of TRAINING_SKILLS) player.development.potential[skill] = player[skill] + 1;
    player.morale = { happiness: 70, lastAction: action, consecutiveDays: 7, lastDay: 7 };
    const before = structuredClone(world), projected = previewPlayerAction(getClubView(world), player, action);
    assert.deepEqual(world, before);
    selectTraining(world, player.id, action);
    assert.equal(advanceWeek(world).ok, true);
    for (const skill of TRAINING_SKILLS) {
      assert.equal(projected.player[skill], player[skill]);
      assert.equal(projected.player.training.experience[skill], player.training.experience[skill]);
    }
    assert.deepEqual(projected.player.morale, player.morale);
    assert.equal(projected.player.fatigue, player.fatigue);
  }
});

test('남은 기간과 연말 반복 예상은 실제 기간만 계산하며 체력 80 경계·상하한을 지킨다', () => {
  const { world, club, player } = fixture();
  club.coach = 'beginner';
  player.stamina = 79; player.development.potential.stamina = 80;
  player.training.experience.stamina = 95; player.fatigue = 20;
  world.weekDaysRemaining = 3;
  const result = previewPlayerAction(getClubView(world), player, 'stamina');
  assert.equal(result.days, 3); assert.equal(result.player.stamina, 80);
  assert.equal(result.fatigue, 4); // 첫날 +2, 체력 80 도달 후 하루 +1.
  assert.equal(result.skills.find(item => item.skill === 'stamina').experience, 5);
  const rest = previewPlayerAction(getClubView(world), player, 'rest', 200);
  assert.equal(rest.player.fatigue, 0); assert.ok(rest.player.morale.happiness <= 100);
  assert.ok(rest.skills.every(item => item.stat === 0 && item.experience <= 0));
  assert.throws(() => previewPlayerAction(getClubView(world), player, 'aim', 0));
});

test('행동 변경 예상은 주전 전체 팀 훈련을 반영하고 선택·원본 상태를 변경하지 않는다', () => {
  const { world } = fixture(), club = getClubView(world), before = structuredClone(world);
  const choices = club.players.map((player, i) => ({ dataset: { weekActionPlayer: player.id }, value: i ? 'aim' : 'team' }));
  const outputs = new Map(club.players.map(player => [player.id, { innerHTML: '' }]));
  const period = {}, basics = {};
  const dialog = { dataset: {}, querySelectorAll: () => choices,
    querySelector(selector) { return selector === '[data-preview-period]' ? period : selector === '[data-preview-basics]' ? basics : outputs.get(selector.match(/="([^"]+)"/)[1]); } };
  updateActionPreviews(dialog, club, 3);
  for (const output of outputs.values()) assert.match(output.innerHTML, /3일 예상[\s\S]*팀 훈련/);
  assert.equal(choices[1].value, 'aim');
  choices.forEach(choice => choice.value = 'rest');
  updateActionPreviews(dialog, club);
  assert.match(outputs.values().next().value.innerHTML, /7일 예상/);
  updateActionPreviews(dialog, club, 100);
  assert.equal(period.textContent, '100일 예상');
  assert.match(basics.textContent, /100일 기본 개인 훈련 경험치 \+1000/);
  assert.match(trainingPanel(club), /data-action-preview=/);
  assert.deepEqual(world, before);
});

test('정산 예상은 중간 급여 변경·누적 비용·분수 이월·코치·시설·이자를 실제 정산과 맞춘다', () => {
  const { world, club, player } = fixture();
  club.coach = 'beginner'; club.facilities.aim = 1; club.finance.loan.principal = 1000;
  for (let index = 0; index < 3; index++) assert.equal(advanceDay(world).ok, true);
  club.contracts[player.id].monthlySalary += 17;
  const before = structuredClone(world), forecast = nextSettlementForecast(getClubView(world));
  assert.deepEqual(world, before); assert.equal(forecast.days, 4);
  assert.equal(forecast.accrued + forecast.remainingCost, forecast.cost);
  for (let index = 0; index < 4; index++) assert.equal(advanceDay(world).ok, true);
  assert.equal(forecast.balance, club.balance);
  assert.equal(forecast.cost, club.finance.settlements.at(-1).wagesDue);
  assert.equal(forecast.income, club.finance.settlements.at(-1).income);
});

test('재정 예상은 미래 방송 수입과 방송 추가 실적을 제외하고 계약 만료·금액 범위를 안내한다', () => {
  const { world, club, player } = fixture();
  selectTraining(world, player.id, 'broadcast');
  club.finance.sponsor = { kind: 'broadcast', remainingWeeks: 4, broadcastDays: 0 };
  club.contracts[player.id].remainingDays = 5;
  const before = structuredClone(world), forecast = nextSettlementForecast(getClubView(world));
  assert.equal(forecast.income, 1250);
  assert.equal(forecast.balance, club.balance + forecast.income - forecast.cost);
  assert.equal(forecast.expiring, true); assert.deepEqual(world, before);
  club.balance = Number.MAX_SAFE_INTEGER;
  assert.equal(nextSettlementForecast(getClubView(world)).ok, false);
});

test('달력은 확정 전 행동·미발생 이벤트를 숨기고 중단 일정과 실제 발생 이벤트를 날짜에 표시한다', () => {
  const { world } = fixture();
  const original = structuredClone(world);
  assert.ok(calendarWeek(world).days.every(day => day.entries.every(entry => entry.kind !== 'action')));
  assert.deepEqual(world, original);
  world.playerEvents.week = { startedDay: 1, endDay: 8, teamTraining: true,
    event: { eventId: 'dating', day: 4, status: 'scheduled', playerId: null, roll: null } };
  world.weekDaysRemaining = 5; world.day = 3;
  world.teamTraining = { day: 1, status: 'completed' };
  const before = structuredClone(world), week = calendarWeek(world);
  assert.equal(week.days[2].today, true);
  assert.ok(week.days[0].entries.some(entry => entry.text === '팀 훈련 · 완료'));
  assert.ok(week.days[2].entries.some(entry => /휴식 · 5명/.test(entry.text)));
  assert.ok(week.days.every(day => day.entries.every(entry => entry.kind !== 'event')));
  assert.ok(calendarWeek(world, 2).days[0].entries.some(entry => entry.text === '팀 훈련 · 예정'));
  assert.deepEqual(world, before);
  world.playerEvents.week.event.status = 'pending';
  assert.ok(calendarWeek(world).days[3].entries.some(entry => entry.kind === 'event'));
});

test('달력은 PC방 공식 준비·경기·정산과 실제 경기 완료 날짜를 표시한다', () => {
  const { world } = fixture();
  world.day = 29; world.seasonCalendar.phase = 'season';
  assert.equal(beginOfficialSchedule(world, true), true);
  const before = structuredClone(world), week = calendarWeek(world, 5);
  assert.ok(week.days[6].entries.some(entry => entry.kind === 'match'));
  assert.ok(week.days[6].entries.some(entry => entry.kind === 'training'));
  assert.ok(week.days[0].entries.some(entry => entry.kind === 'finance'));
  assert.deepEqual(world, before);
  const fixtureId = world.pcSeason.weekSchedule.fixtureId;
  world.officialRecords.receipts.push({ fixtureId, day: 34 });
  const updated = calendarWeek(world, 5);
  assert.ok(updated.days[5].entries.some(entry => entry.kind === 'match' && /완료/.test(entry.text)));
});

test('달력은 새해 시작일 기준으로 월·주를 찾고 연장 일정도 12개 월 선택으로 조회한다', () => {
  const { world } = fixture();
  world.seasonYears = { year: 2, startedDay: 370, archives: [] }; world.day = 380;
  const before = structuredClone(world), calendar = calendarWeek(world);
  assert.equal(calendar.year, 2); assert.equal(calendar.week, 2); assert.equal(calendar.days[0].day, 377);
  assert.match(scheduleCalendarPanel(world, 1), /data-calendar-step="-1" disabled/);
  assert.match(scheduleCalendarPanel(world, 53), /data-calendar-step="1" disabled/);
  assert.equal(calendarMonth(world).month, 1); assert.equal(calendarMonth(world).activeDay.date, 11);
  assert.deepEqual(world, before);
  world.day = 370 + 7 * 100;
  assert.equal([...scheduleCalendarPanel(world).matchAll(/<option/g)].length, 12);
  assert.match(scheduleCalendarPanel(world), /연장 일정/);
  assert.equal(calendarMonth(world).activeDay.day, world.day);
  const late = calendarMonth(world), january = calendarMonth(world, late.week, 1, late.days[0].day);
  assert.equal(january.days[0].day, 370 + 365);
  assert.equal(calendarMonth(world, january.week, 1, january.days[5].day).activeDay.day, january.days[5].day);
});

test('달력의 월 선택·날짜 상세·이전/다음 주·이번 주 복귀는 실제 날짜와 저장·난수를 유지한다', () => {
  const { world } = fixture(), before = structuredClone(world), listeners = {}, focused = [];
  const host = { innerHTML: scheduleCalendarPanel(world), addEventListener(name, listener) { listeners[name] = listener; },
    querySelector(selector) { return selector === '[data-calendar-week]'
      ? { dataset: { calendarWeek: this.innerHTML.match(/data-calendar-week="(\d+)"/)[1], calendarMonth: this.innerHTML.match(/data-calendar-month="(\d+)"/)[1], calendarStart: this.innerHTML.match(/data-calendar-start="(\d+)"/)[1] } }
      : { focus: () => focused.push(selector) }; } };
  mountScheduleCalendar({ querySelector: () => host }, world);
  const button = { dataset: { calendarStep: '1' }, hasAttribute: () => false };
  listeners.click({ target: { closest: () => button } });
  assert.match(host.innerHTML, /data-calendar-week="2"/);
  listeners.change({ target: { value: '2', matches: () => true } });
  assert.match(host.innerHTML, /data-calendar-month="2"/);
  listeners.click({ target: { closest: () => ({ dataset: { calendarDay: '40' }, hasAttribute: key => key === 'data-calendar-day' }) } });
  assert.match(host.innerHTML, /2월 9일/);
  assert.match(host.innerHTML, /data-calendar-week="6"/);
  listeners.click({ target: { closest: () => ({ hasAttribute: key => key === 'data-calendar-today' }) } });
  assert.match(host.innerHTML, /data-calendar-week="1"/);
  assert.equal(focused.length, 4); assert.deepEqual(world, before);
});

test('예상치 요약은 변하는 능력만 보여주고 종료 수치와 설명은 접힌 상세에 보관한다', () => {
  const { world, player } = fixture(), club = getClubView(world);
  player.development.growthRate = 100; player.training.experience.aim = 95;
  player.development.potential.aim = player.aim + 2;
  const before = structuredClone(world), html = actionPreviewMarkup(club, player, 'aim');
  const summary = html.split('<details>')[0];
  assert.match(summary, /\+70 XP/); assert.match(summary, /능력 \+1/);
  assert.doesNotMatch(summary, /지능|체력|종료 시|경험치 65/);
  assert.match(html, /<details><summary>자세히<\/summary>/);
  assert.match(html, /경험치 65/);
  assert.deepEqual(world, before);
});

test('월간 달력은 월 길이·요일 정렬·월말 정산과 주 이동을 게임 날짜에 맞춘다', () => {
  const { world } = fixture(), before = structuredClone(world);
  assert.equal(calendarMonth(world, undefined, 1).days.length, 31);
  const feb = calendarMonth(world, undefined, 2);
  assert.equal(feb.days.length, 28); assert.equal(feb.days[0].day, 32);
  assert.equal(feb.offset, 3); assert.equal(feb.days[0].weekday, '목');
  assert.ok(feb.days.some(day => day.entries.some(entry => entry.kind === 'finance')));
  const december = calendarMonth(world, undefined, 12);
  assert.equal(december.days.at(-1).day, 365);
  assert.ok(december.days.at(-1).entries.some(entry => entry.kind === 'finance'));
  assert.equal(calendarMonth(world, 5).month, 1); assert.equal(calendarMonth(world, 6).month, 2);
  const html = scheduleCalendarPanel(world, undefined, 2);
  assert.match(html, /확인할 달/); assert.doesNotMatch(html, /확인할 주/);
  assert.equal([...html.matchAll(/class="calendar-date"/g)].length, 28);
  assert.deepEqual(world, before);
});
