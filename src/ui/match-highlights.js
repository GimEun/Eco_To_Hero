import { escapeHtml } from './screens.js';
import { ROUND_REASONS } from '../config/round.js';
import { STEP_MS } from '../simulation/practice.js';

export function highlightsPanel() {
  return `<section class="panel match-highlights" aria-label="경기 텍스트 하이라이트">
    <div class="roster-heading"><h2>라운드 하이라이트</h2></div>
    <p class="input-hint" data-description="하이라이트 기준">종료된 라운드의 첫 처치·3킬 이상·폭탄 설치/해체·승패를 누적합니다. 같은 틱의 처치는 계산 이벤트 순서로 첫 처치를 표시합니다.</p>
    <ol class="highlight-rounds"></ol>
  </section>`;
}

export function renderHighlights(panel, state) {
  panel.hidden = !state.match;
  if (!state.match) return;
  const name = id => escapeHtml(state.actors.find(actor => actor.id === id).nickname);
  const team = id => escapeHtml(state.teams[id === 'home' ? 0 : 1].name);
  const describe = event => {
    if (event.type === 'first-kill') return `첫 처치 · ${name(event.actorId)} → ${name(event.targetId)}`;
    if (event.type === 'multi-kill') return `${name(event.actorId)} · ${event.kills}킬`;
    if (event.type === 'bomb-planted') return `${name(event.actorId)} · 폭탄 설치`;
    if (event.type === 'bomb-defused') return `${name(event.actorId)} · 폭탄 해체`;
    return `${team(event.winner)} 승리 · ${ROUND_REASONS[event.reason]}`;
  };
  panel.querySelector('.highlight-rounds').innerHTML = state.match.history.map(round =>
    `<li><h3>${round.roundNumber}R${round.overtime ? ` · 연장 ${round.overtime}` : ''} · ${round.score.home}:${round.score.away}</h3><ul>${round.highlights.map(event =>
      `<li><time>${(event.tick * STEP_MS / 1000).toFixed(2)}s</time> ${describe(event)}</li>`).join('')}</ul></li>`).join('')
    || '<li>라운드가 끝나면 주요 장면을 텍스트로 표시합니다.</li>';
}
