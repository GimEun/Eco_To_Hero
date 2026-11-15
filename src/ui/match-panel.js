import { escapeHtml } from './html.js';
import { logoImage } from './club-logo.js';
import { ROUND_REASONS } from '../config/round.js';
import { MATCH_RULES } from '../config/match.js';

export function matchPanel() {
  return `<section class="panel match-panel" aria-label="MR12 경기 점수">
    <div class="roster-heading"><h2>MR12 경기</h2><span class="match-phase tag muted-tag"></span></div>
    <p class="match-score" aria-live="polite"></p><p class="match-status" role="status"></p>
    <div class="match-help"><button type="button" class="button secondary" data-practice="open-rules">경기 규칙</button></div>
    <dialog class="match-rules-dialog" aria-labelledby="match-rules-title"><div class="match-rules-heading"><h2 id="match-rules-title">MR12 경기 규칙</h2><button type="button" class="button secondary" data-practice="close-rules" aria-label="경기 규칙 닫기">닫기 ✕</button></div><p class="match-rules">정규 13선승 · 12라운드 후 진영 교대와 $800·권총 초기화. 12:12이면 연장 최대 6라운드 중 4선승 · 3:3이면 반복합니다. 연장 시작과 3라운드마다 진영 교대와 $10,000·권총 초기화. 라운드 종료 후 점수·결과를 누적하고 다음 구매 단계로 자동 전환합니다. 매 라운드 구매 완료 · 시작을 누르세요.</p><p class="input-hint">닫기 버튼 또는 Esc를 누르면 경기 화면으로 돌아갑니다.</p></dialog>
    <details class="match-history"><summary>라운드 결과</summary><div class="table-scroll" role="region" aria-label="라운드 결과" tabindex="0"><table class="round-history-table"><thead><tr><th scope="col">라운드</th><th scope="col">공격</th><th scope="col">승리</th><th scope="col">종료 이유</th><th scope="col">점수</th></tr></thead><tbody></tbody></table></div></details>
  </section>`;
}

export function renderMatch(panel, state) {
  panel.hidden = !state.match;
  if (!state.match) return;
  const match = state.match;
  const roundNumber = state.economy.roundNumber;
  const name = team => state.teams[team === 'home' ? 0 : 1].name;
  const half = match.overtime ? (roundNumber - MATCH_RULES.regulationHalf * 2 - 1) % (MATCH_RULES.overtimeHalf * 2) < MATCH_RULES.overtimeHalf
    : roundNumber <= MATCH_RULES.regulationHalf;
  const phase = match.overtime ? `연장 ${match.overtime} ${half ? '전반전' : '후반전'}` : `정규 ${half ? '전반전' : '후반전'}`;
  const last = match.history.at(-1);
  const lastResult = last ? `직전 ${last.roundNumber}R · ${name(last.winner)} 승리 · ${ROUND_REASONS[last.reason]} / ` : '';
  panel.querySelector('.match-phase').textContent = match.complete ? '경기 종료' : `${phase} · ${roundNumber}라운드`;
  panel.querySelector('.match-score').innerHTML = `${logoImage(state.teams[0].logoId)}<span>${escapeHtml(name('home'))} ${match.score.home} : ${match.score.away} ${escapeHtml(name('away'))}</span>${logoImage(state.teams[1].logoId)}`;
  panel.querySelector('.match-status').textContent = match.complete ? `${name(match.winner)} 승리 · 최종 ${match.score.home}:${match.score.away}`
    : state.complete ? `${roundNumber}라운드 종료 · 다음 라운드로 진행하세요.${!match.overtime && match.score.home === 12 && match.score.away === 12 ? ' 12:12 · 다음은 연장전입니다.' : ''}`
    : `${lastResult}${match.transition ?? phase}${match.overtime ? ` · 이번 연장 ${match.overtimeScore.home}:${match.overtimeScore.away} (4선승)` : ''} · 내 팀 ${state.round.attackTeam === 'home' ? '공격' : '수비'}${state.economy.phase === 'buy' ? ` · ${roundNumber}R 구매 대기` : ''}`;
  panel.querySelector('tbody').innerHTML = match.history.map(entry => `<tr><th scope="row">${entry.roundNumber}R${entry.overtime ? ` · 연장 ${entry.overtime}` : ''}</th><td>${escapeHtml(name(entry.attackTeam))}</td><td>${escapeHtml(name(entry.winner))}</td><td>${ROUND_REASONS[entry.reason]}</td><td>${entry.score.home}:${entry.score.away}</td></tr>`).join('')
    || '<tr><td colspan="5">라운드 종료 후 실제 결과가 표시됩니다.</td></tr>';
}
