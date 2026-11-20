import { calendarMonth } from '../game/schedule-calendar.js';
import { escapeHtml } from './html.js';

const entryLabels = { match: '경기', action: '행동', finance: '정산', training: '팀 훈련', event: '이벤트' };

export function scheduleCalendarPanel(world, selectedWeek, selectedMonth, selectedDay) {
  if (!world) return '';
  const calendar = calendarMonth(world, selectedWeek, selectedMonth, selectedDay);
  const active = calendar.activeDay;
  const blanks = Array.from({ length: calendar.offset }, () => '<li class="calendar-empty" aria-hidden="true"></li>').join('');
  const trailing = Array.from({ length: (7 - (calendar.offset + calendar.days.length) % 7) % 7 }, () => '<li class="calendar-empty" aria-hidden="true"></li>').join('');
  return `<section class="panel schedule-calendar" aria-labelledby="schedule-calendar-title" data-calendar-week="${calendar.week}" data-calendar-month="${calendar.month}" data-calendar-start="${calendar.days[0].day}">
    <div class="roster-heading"><h2 id="schedule-calendar-title" tabindex="-1">구단 달력</h2><span class="tag muted-tag">${calendar.year}년 차${calendar.cycle ? ' · 연장 일정' : ''}</span></div>
    <div class="calendar-navigation" aria-label="달력 이동">
      <button type="button" class="button secondary" data-calendar-step="-1"${calendar.week === 1 ? ' disabled' : ''}>이전 주</button>
      <label>확인할 달<select data-calendar-select>${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}"${index + 1 === calendar.month ? ' selected' : ''}>${index + 1}월</option>`).join('')}</select></label>
      <button type="button" class="button secondary" data-calendar-step="1"${calendar.week === calendar.maxWeek ? ' disabled' : ''}>다음 주</button>
      <button type="button" class="button secondary" data-calendar-today>이번 주</button>
    </div>
    <p class="calendar-period" role="status" aria-live="polite"><strong>${calendar.month}월</strong><span>${calendar.week}주 차 선택 · 게임 ${calendar.days[0].day}~${calendar.days.at(-1).day}일</span></p>
    <div class="calendar-weekdays" aria-hidden="true">${calendar.weekdays.map(day => `<span>${day}</span>`).join('')}</div>
    <ol class="calendar-days" aria-label="${calendar.month}월 날짜별 일정">${blanks}${calendar.days.map(day => {
      const kinds = [...new Set(day.entries.map(entry => entry.kind))];
      return `<li class="calendar-day${day.today ? ' is-today' : ''}${day.past ? ' is-past' : ''}${day.week === calendar.week ? ' is-current-week' : ''}">
        <button type="button" class="calendar-date" data-calendar-day="${day.day}" aria-controls="calendar-day-detail" aria-pressed="${day.day === active.day}"${day.today ? ' aria-current="date"' : ''}${day.valid ? '' : ' disabled'} aria-label="${calendar.month}월 ${day.date}일 ${day.weekday}요일${day.today ? ' 오늘' : ''}, 일정 ${day.entries.length}건">
          <span class="calendar-date-number">${day.date}${day.today ? '<small>오늘</small>' : ''}</span><span class="calendar-markers">${kinds.map(kind => `<span class="calendar-marker calendar-${kind}">${entryLabels[kind]}</span>`).join('')}</span>
        </button></li>`;
    }).join('')}${trailing}</ol>
    <section id="calendar-day-detail" class="calendar-day-detail" aria-labelledby="calendar-day-title">
      <h3 id="calendar-day-title">${calendar.month}월 ${active.date}일 <small>${active.weekday}요일 · 게임 ${active.day}일 · ${active.week}주 차</small></h3>
      ${active.entries.length ? `<ul>${active.entries.map(entry => `<li class="calendar-${entry.kind}">${escapeHtml(entry.text)}</li>`).join('')}</ul>` : `<p>${active.past ? '보관된 일정이 없습니다.' : '확정된 일정이 없습니다.'}</p>`}
    </section>
    <details class="calendar-help"><summary>달력 안내</summary><p>날짜를 누르면 일정을 확인할 수 있습니다. 월은 조회용이며 게임은 기존 52주 기준으로 진행합니다. 선택 전 행동과 미발생 이벤트는 표시하지 않습니다. 달력 이동은 게임 날짜를 바꾸지 않습니다.</p></details>
  </section>`;
}

export function mountScheduleCalendar(screen, world) {
  const host = screen.querySelector('[data-calendar-host]');
  if (!host) return;
  function show(week, month, day, focus) {
    host.innerHTML = scheduleCalendarPanel(world, week, month, day);
    const control = host.querySelector(focus);
    (control?.disabled ? host.querySelector('[data-calendar-select]') : control)?.focus({ preventScroll: true });
  }
  host.addEventListener('click', event => {
    const button = event.target.closest('[data-calendar-step], [data-calendar-today], [data-calendar-day]');
    if (!button || button.disabled) return;
    const calendar = host.querySelector('[data-calendar-week]');
    const week = Number(calendar.dataset.calendarWeek);
    if (button.hasAttribute('data-calendar-day')) {
      show(week, Number(calendar.dataset.calendarMonth), Number(button.dataset.calendarDay), `[data-calendar-day="${button.dataset.calendarDay}"]`);
    } else if (button.hasAttribute('data-calendar-today')) {
      show(undefined, undefined, world.day, '[data-calendar-today]');
    } else {
      show(week + Number(button.dataset.calendarStep), undefined, undefined, `[data-calendar-step="${button.dataset.calendarStep}"]`);
    }
  });
  host.addEventListener('change', event => {
    if (event.target.matches('[data-calendar-select]')) {
      const calendar = host.querySelector('[data-calendar-week]');
      show(Number(calendar.dataset.calendarWeek), Number(event.target.value), Number(calendar.dataset.calendarStart), '[data-calendar-select]');
    }
  });
}
