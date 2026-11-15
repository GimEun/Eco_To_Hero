import { activeYearAdvance, yearAdvanceIssue } from '../game/year-advance.js';
import { isFreeSchedule } from '../game/season-calendar.js';
import { escapeHtml } from './html.js';

export function yearAdvanceSummary(world) {
  const session = world.yearAdvance;
  const day = session.endedDay ?? world.day;
  const balance = world.clubs.find(club => club.id === world.playerClubId).balance;
  return `${day - session.startedDay}일 진행 · 남은 ${Math.max(0, session.targetDay - day)}일 · 시작 후 자금 변동 ${balance - session.initialBalance < 0 ? '-' : '+'}$${Math.abs(balance - session.initialBalance).toLocaleString('en-US')}`;
}

export function yearAdvancePanel(world) {
  if (!isFreeSchedule(world)) return '';
  const session = world.yearAdvance, active = activeYearAdvance(world), issue = yearAdvanceIssue(world);
  return `<div class="year-advance-controls">${active
    ? '<button class="button primary" data-action="resume-year-advance">계속 진행 ▶</button><button class="button secondary" data-action="cancel-year-advance">진행 취소</button>'
    : `<button class="button secondary" data-action="start-year-advance"${issue ? ' disabled' : ''}>연말까지 진행 »</button>`}
    ${session ? `<p class="input-hint" role="status">${escapeHtml(session.message)}<br>${escapeHtml(yearAdvanceSummary(world))}</p>` : ''}</div>`;
}

// app의 busy/inert 상태에서도 취소할 수 있도록 별도 모달을 사용한다.
export function showYearAdvanceProgress(onCancel) {
  const dialog = document.createElement('dialog');
  dialog.className = 'club-replacement-dialog';
  dialog.setAttribute('aria-labelledby', 'year-advance-title');
  dialog.innerHTML = '<h2 id="year-advance-title">연말까지 진행 중</h2><p>선택한 행동을 반복합니다. 매주 결과를 자동 저장하며, 취소 시 현재 계산·저장 중인 결과까지 유지합니다.</p><p data-year-progress role="status" aria-live="polite"></p><button type="button" class="button secondary">진행 취소</button>';
  const cancel = () => { onCancel(); dialog.querySelector('button').disabled = true; dialog.querySelector('button').textContent = '저장 후 중단 중…'; };
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.querySelector('button').addEventListener('click', cancel);
  document.body.append(dialog);
  dialog.showModal();
  return { update(world) { dialog.querySelector('[data-year-progress]').textContent = yearAdvanceSummary(world); },
    close() { dialog.close(); if (globalThis.CSS?.supports('transition-behavior', 'allow-discrete')) setTimeout(() => dialog.remove(), 140); else dialog.remove(); } };
}
