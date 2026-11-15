import { buildMatchReport } from '../game/match-reports.js';
import { PRACTICE_MAPS } from '../data/maps/index.js';
import { getClubView } from '../game/world-selectors.js';
import { createPractice, advancePractice, visibleOpponents, STEP_MS } from '../simulation/practice.js';
import { drawPractice } from '../rendering/practice-map.js';
import { escapeHtml } from './screens.js';
import { weaponFor } from '../data/weapons.js';
import { THROWABLES } from '../data/throwables.js';
import { sightRange } from '../simulation/geometry.js';
import { ROUND_RULES, ROUND_REASONS } from '../config/round.js';
import { buyEquipment, startEconomyRound, nextEconomyRound } from '../simulation/economy.js';
import { economyPanel, renderEconomy } from './economy-panel.js';
import { matchPanel, renderMatch } from './match-panel.js';
import { DEFENSE_TACTICS } from '../data/defense-tactics.js';
import { setDefensePlan } from '../simulation/defense-tactics.js';
import { prepareRound, setupRound } from '../simulation/round.js';
import { matchPlayerStats, matchPlayerMetrics } from '../simulation/match.js';
import { highlightsPanel, renderHighlights } from './match-highlights.js';
import { ATTACK_TACTICS } from '../data/attack-tactics.js';
import { setAttackPlan } from '../simulation/attack-tactics.js';
import { MANUAL_DURATIONS, canEditManual, validateManualRoute, setManualRoute, clearManualRoute, setManualDuration, manualRouteStart } from '../simulation/manual-tactics.js';
import { canEditTactics, canRequestTimeout, requestTimeout, requestPause, resumeTimeout, TIMEOUT_RULES } from '../simulation/timeout.js';
import { cellCenter } from '../simulation/geometry.js';
import { settleTeamTraining } from '../game/team-training.js';
import { TEAM_TRAINING_MODES } from '../config/team-training.js';
import { nextPracticeOpponent } from './practice-opponents.js';

export function practiceScreen() {
  const screen = document.createElement('section');
  screen.className = 'screen practice-screen';
  screen.innerHTML = `
    <div class="page-heading"><p class="eyebrow">MAP LAB / 05</p><h1 tabindex="-1">중계소 · MR12 경기</h1><p class="lead" data-description="팀 연습">장비를 준비하고 교전·폭탄·보상부터 최종 경기 결과까지 살펴보세요.</p></div>
    <div class="practice-controls practice-playback-controls"><label for="practice-speed">관전 속도</label><select id="practice-speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select><button class="button primary" type="button" data-practice="toggle">시작</button><button class="button secondary" type="button" data-practice="skip">라운드 스킵</button><button class="button secondary" type="button" data-practice="timeout">감독 타임아웃</button><button class="button secondary" type="button" data-practice="reset">초기화</button><button class="button secondary" type="button" data-practice="next">다음 라운드</button><span class="practice-clock" aria-label="연습 진행 시간">00:00.00</span><span class="tag muted-tag practice-state">시작 대기</span></div>
    <details class="practice-settings"><summary>연습 설정</summary><div class="practice-controls"><label for="practice-mode">연습 모드</label><select id="practice-mode"><option value="match">MR12 경기</option><option value="economy">구매 · 라운드</option><option value="round">한 라운드 · 폭탄</option><option value="combat">교전 연습</option><option value="movement">이동·시야만</option></select></div><div class="practice-controls"><label for="practice-map">연습 맵</label><select id="practice-map">${PRACTICE_MAPS.map(map => `<option value="${map.id}">${escapeHtml(map.name)}</option>`).join('')}</select><span class="input-hint" data-description="맵 변경">맵 변경 시 경기·구매 자금·기록·수동 경로를 초기화합니다.</span></div>
    <div class="round-options practice-controls"><label for="round-side">내 팀 시작 진영</label><select id="round-side"><option value="home">공격</option><option value="away">수비</option></select></div>
    <p class="input-hint" data-description="팀 훈련 보상">주간 팀 훈련 보상은 종료 시 한 번 지급합니다. 기본 경험치: 이동 10·교전 25·폭탄 40·구매 50·MR12 120. 승패·개인 KDA로 보정하며 MR12는 전체 경기 종료에 지급합니다. 일반 관전 반복에는 보상이 없습니다. 결과는 구단 통산 전적에 반영하지 않습니다.</p></details>
    ${matchPanel()}
    <p class="practice-teams"></p>
    <div class="practice-controls practice-panel-toolbar"><button type="button" class="button secondary" data-strategy="manual" aria-expanded="false" aria-controls="manual-strategy-panel">수동 전략</button><button type="button" class="button secondary" data-strategy="automatic" aria-expanded="false" aria-controls="automatic-strategy-panel">자동 전략</button><button type="button" class="button secondary" data-strategy="purchase" aria-expanded="false" aria-controls="purchase-panel">장비 구매</button><button type="button" class="button secondary" data-strategy="content" aria-expanded="false" aria-controls="match-content-panel">경기 내용</button><span class="timeout-status input-hint" role="status"></span><button type="button" class="button primary" data-action="next-playoff-map" hidden>BO3 다음 맵 →</button></div>
    <div class="practice-workspace"><div class="practice-layout"><div class="panel practice-map-wrap"><div class="practice-map-heading"><span>플레이 화면</span><p class="round-status" role="status" aria-live="off"></p><button type="button" class="button secondary" data-practice="expand-map" aria-pressed="false">화면 크게 ↗</button></div><div class="practice-map-stage"><canvas class="practice-canvas" width="960" height="640" aria-label="중계소 2D 지도. 선수 선택 목록에서 시야를 확인할 선수를 선택할 수 있습니다.">브라우저에서 Canvas를 지원해야 지도를 표시할 수 있습니다.</canvas></div><div class="map-legend" aria-label="지도 범례"><strong>지도 범례</strong><span><i class="home-dot"></i>내 팀</span><span><i class="away-dot"></i>상대 팀</span><span>금색 외곽: 감지한 상대</span><span>선: 발사 궤적 · X: 사망 위치</span></div></div>
    <details class="panel practice-details"><summary>선수 정보·시야</summary><label for="practice-player">시야를 확인할 선수</label><select id="practice-player"></select><div class="practice-readout" aria-live="off"></div><div class="practice-detection" role="status" aria-live="polite"></div><p class="input-hint" data-description="선수 선택과 지도 표시">지도나 목록으로 선수를 선택하세요. 점선은 이동 경로, 작은 사각형은 목적지, 큰 점선 사각형은 수비 담당 구역입니다. 금색 ◆는 폭탄입니다.</p></details></div>
    <div class="strategy-options">

    <div class="practice-panels"><section id="manual-strategy-panel" class="manual-editor panel" aria-label="수동 전략 설정" hidden>
      <p class="input-hint" data-description="수동 경로 설정">내 팀 선수를 선택하세요. 현재 내 팀 진영의 경로만 편집할 수 있습니다. 경유점과 마지막 지점의 시선을 지정한 뒤 다른 선수도 편집하세요. 선수별 초안은 유지되며 저장을 누르면 기간과 편집한 모든 선수의 경로·시선이 함께 반영됩니다.</p>
      <div class="practice-controls"><label for="manual-duration">적용 기간</label><select id="manual-duration"><option value="4">4라운드</option><option value="6">6라운드</option><option value="12">12라운드</option></select></div>
      <div class="practice-controls"><label for="manual-edit-mode">지도 조작</label><select id="manual-edit-mode"><option value="select">선수 선택</option><option value="route">경유점 추가</option><option value="angle">시선 지정</option></select><button type="button" class="button secondary" data-manual="undo">마지막 점 취소</button><button type="button" class="button primary" data-manual="save">저장</button><button type="button" class="button secondary" data-manual="clear">자동 전술</button></div>
      <p class="manual-status input-hint"></p><p class="manual-message" role="status"></p>
      <p class="input-hint" data-description="수동 전략 적용 기간">기간은 진영별로 모든 선수 설정이 공유합니다. 해당 진영에서 수동 설정이 있는 라운드가 끝날 때만 1회 차감하며, 만료되면 자동 전술을 사용합니다. 저장하면 현재 진영의 기간도 갱신합니다. 자동 전술 버튼도 저장 후 반영됩니다. 초안은 현재 경기에서 유지하며 새 경기 초기화·맵 변경 시 지웁니다. 교전·폭탄 행동이 우선하며 설치 후에는 자동 배치를 사용합니다.</p>
    </section>
      <section id="automatic-strategy-panel" class="automatic-editor panel" aria-label="자동 전략 설정" hidden><div class="practice-controls" data-tactic-row="defense-plan"><label for="defense-plan">수비 전술</label><select id="defense-plan"><option value="standard">기본 수비</option><option value="forward">전진 수비</option></select></div><div class="practice-controls" data-tactic-row="attack-plan"><label for="attack-plan">공격 전술</label><select id="attack-plan"><option value="execute">집중 진입</option><option value="split">분산 진입</option></select></div><div class="practice-controls" data-tactic-row="round-site"><label for="round-site">목표 사이트</label><select id="round-site"><option>A</option><option>B</option></select></div>
    <p class="tactics-description info-note" data-description="자동 수비 전술"></p>
    <p class="attack-description info-note" data-description="자동 공격 전술"></p>
      </section>
      <div id="purchase-panel" class="purchase-panel" hidden>${economyPanel()}</div>
      <div id="match-content-panel" class="combat-records" hidden><section class="panel combat-stat-panel"><div class="roster-heading"><h2>연습 기록</h2><span class="combat-survivors tag muted-tag"></span></div><details class="combat-help" data-description="경기 통계 기준"><summary>통계 기준</summary><p class="input-hint combat-metrics-note">명중률 = 명중 / 발사. ADR = MR12 완료 라운드의 총 피해 / 완료 라운드 수이며 라운드 종료 때 갱신합니다. 발사·완료 라운드가 없거나 ADR 대상이 아닌 모드는 —로 표시합니다.</p></details><div class="table-scroll" role="region" aria-label="경기 선수 통계" tabindex="0"><table class="combat-table"><thead><tr><th scope="col">선수</th><th scope="col">HP</th><th scope="col">탄약</th><th scope="col">K/D/A</th><th scope="col">피해</th><th scope="col">발사</th><th scope="col">명중</th><th scope="col">명중률</th><th scope="col">ADR</th></tr></thead><tbody></tbody></table></div></section><section class="panel combat-feed"><div class="roster-heading"><h2>최근 교전 이벤트</h2></div><ol class="combat-events" aria-label="최근 교전 이벤트"></ol></section>${highlightsPanel()}</div>
    </div></div></div>
    <dialog class="practice-result-dialog" aria-labelledby="practice-result-title"><div class="roster-heading practice-result-heading"><div><h2 id="practice-result-title">경기 내용</h2><p class="practice-result-summary"></p></div></div><p class="practice-reward-message input-hint"></p><div class="practice-result-content"></div><div class="practice-result-buttons"><button type="button" class="button secondary" data-practice="close-result">결과 닫기</button><button type="button" class="button primary" data-action="next-playoff-map" hidden>BO3 다음 맵 →</button><button type="button" class="button primary" data-action="open-counseling" hidden>선수 상담</button><button type="button" class="button primary" data-action="club">내 구단 →</button></div></dialog>
  `;
  return screen;
}

export function mountPractice(screen, world, { onTrainingReward = () => {}, official = null, onOfficialComplete = async () => {}, onCounselingRequired = null } = {}) {
  const bo3 = Boolean(official?.series || official?.playoff);
  const seriesLabel=official?.seriesLength===5?'BO5':'BO3';
  for(const button of screen.querySelectorAll('[data-action="next-playoff-map"]'))button.textContent=`${seriesLabel} 다음 맵 →`;
  const officialLabel = bo3 ? `${seriesLabel} ${official.leagueLabel ?? '플레이오프'}${official.stageLabel ? ` · ${official.stageLabel}` : ''} · ${official.seriesScore.home}:${official.seriesScore.away} · ${official.mapNumber}맵` : official?.tiebreak ? `${['시 리그','도 리그','전국 리그','세계 리그'].includes(official.leagueLabel)?`${official.leagueLabel} `:''}순위 결정전` : '공식 경기';
  const trainingDay = world.teamTraining?.status === 'pending' ? world.teamTraining.day : null;
  const resultDialog = screen.querySelector('.practice-result-dialog');
  const rulesDialog = screen.querySelector('.match-rules-dialog');
  const openRules = screen.querySelector('[data-practice="open-rules"]');
  const closeRules = screen.querySelector('[data-practice="close-rules"]');
  const expandMap = screen.querySelector('[data-practice="expand-map"]');
  const mapWrap = screen.querySelector('.practice-map-wrap');
  const mapStage = screen.querySelector('.practice-map-stage');
  const closeResult = screen.querySelector('[data-practice="close-result"]');
  let map = official?.map ?? PRACTICE_MAPS[0];
  const home = official?.home ?? getClubView(world);
  let away = official?.away ?? nextPracticeOpponent(world);
  const canvas = screen.querySelector('canvas');
  const context = canvas.getContext('2d');
  const toggle = screen.querySelector('[data-practice="toggle"]');
  const skip = screen.querySelector('[data-practice="skip"]');
  const reset = screen.querySelector('[data-practice="reset"]');
  const next = screen.querySelector('[data-practice="next"]');
  const timeout = screen.querySelector('[data-practice="timeout"]');
  const timeoutStatus = screen.querySelector('.timeout-status');
  const economy = screen.querySelector('.economy-panel');
  const match = screen.querySelector('.match-panel');
  const select = screen.querySelector('#practice-player');
  const readout = screen.querySelector('.practice-readout');
  const detection = screen.querySelector('.practice-detection');
  const modeSelect = screen.querySelector('#practice-mode');
  const mapSelect = screen.querySelector('#practice-map');
  const speedSelect = screen.querySelector('#practice-speed');
  const sideSelect = screen.querySelector('#round-side');
  const siteSelect = screen.querySelector('#round-site');
  const defenseSelect = screen.querySelector('#defense-plan');
  const attackSelect = screen.querySelector('#attack-plan');
  const manualEditor = screen.querySelector('.manual-editor');
  const automaticEditor = screen.querySelector('.automatic-editor');
  const strategyOptions = screen.querySelector('.strategy-options');
  const strategyToolbar = screen.querySelector('.practice-panel-toolbar');
  const manualToggle = screen.querySelector('[data-strategy="manual"]');
  const automaticToggle = screen.querySelector('[data-strategy="automatic"]');
  const purchaseToggle = screen.querySelector('[data-strategy="purchase"]');
  const contentToggle = screen.querySelector('[data-strategy="content"]');
  const purchasePanel = screen.querySelector('.purchase-panel');
  let manualSide;
  const currentSide = () => state.round?.attackTeam === 'home' ? 'attack' : 'defense';
  const manualDuration = screen.querySelector('#manual-duration');
  const manualMode = screen.querySelector('#manual-edit-mode');
  const manualButtons = Object.fromEntries(['undo', 'save', 'clear'].map(key => [key, screen.querySelector(`[data-manual="${key}"]`)]));
  const manualMessage = screen.querySelector('.manual-message');
  if (!context) {
    expandMap.disabled = openRules.disabled = true;
    mapSelect.disabled = true;
    skip.disabled = true;
    speedSelect.disabled = true;
    manualToggle.disabled = automaticToggle.disabled = true;
    purchaseToggle.disabled = contentToggle.disabled = true;
    timeout.disabled = true;
    readout.textContent = '이 브라우저에서 2D 지도를 표시할 수 없습니다.';
    toggle.disabled = true; reset.disabled = true; next.disabled = true; select.disabled = true; modeSelect.disabled = true; sideSelect.disabled = true; siteSelect.disabled = true; defenseSelect.disabled = true; attackSelect.disabled = true;
    manualDuration.disabled = manualMode.disabled = true;
    for (const button of Object.values(manualButtons)) button.disabled = true;
    return () => {};
  }
  if (official) {
    screen.querySelector('.practice-settings').hidden = true;
    modeSelect.value = 'match'; mapSelect.value = map.id; sideSelect.value = official.attackTeam;
    modeSelect.disabled = mapSelect.disabled = sideSelect.disabled = true;
    modeSelect.hidden = true;
    screen.querySelector('label[for="practice-mode"]').hidden = true;
    reset.hidden = true;
    screen.querySelector('.page-heading .eyebrow').textContent = `${(official.home.leagueId??'pc').toUpperCase()} LEAGUE / ${official.tiebreak?'TIEBREAK':'OFFICIAL MATCH'}`;
    screen.querySelector('.page-heading .lead').textContent = '중도 이탈·새로고침 시 0:13 기권패로 처리됩니다. 종료 결과는 자동 저장합니다.';
    screen.querySelector('[data-description="팀 훈련 보상"]').textContent = '공식 경기는 팀 훈련 경험치를 지급하지 않습니다. 경기 결과는 정규 시즌에 반영합니다.';
    screen.querySelector('[data-description="맵 변경"]').textContent = '공식 경기의 맵과 시작 진영은 대진별로 고정됩니다.';
    const returnButton = screen.querySelector('[data-action="club"]');
    returnButton.dataset.action = 'season'; returnButton.textContent = '정규 시즌 →';
  }
  const newState = () => createPractice(map, home, away, { combat: modeSelect.value !== 'movement', seed: official?.seed ?? world.seed,
    round: modeSelect.value === 'round', economy: modeSelect.value === 'economy', match: modeSelect.value === 'match',
    defensePlans: ['match', 'economy', 'round'].includes(modeSelect.value) ? { home: defenseSelect.value, away: 'standard' } : null,
    attackPlans: ['match', 'economy', 'round'].includes(modeSelect.value) ? { home: attackSelect.value, away: 'execute' } : null,
    attackTeam: sideSelect.value, siteName: siteSelect.value, aiTeams: official?.aiTeams ?? [], report:Boolean(official) });
  let state = newState();
  if (bo3) state.timeout.remaining = official.pausesRemaining;
  let selectedId = state.actors[0].id;
  let equipmentActorId = 'home-1';
  let running = false;
  let skipping = false;
  let lastTime = null;
  let frameId = null;
  let disposed = false;
  let mapExpanded = false;
  let lastStatsTick = -1;
  let lastEventCount = -1;
  let lastEconomyKey = null;
  let lastMatchKey = null;
  let manualCells = [];
  let manualAngle = 0;
  let manualDrafts = {};
  let manualOpen = false;
  let automaticOpen = false;
  let purchaseOpen = false;
  let contentOpen = false;
  let resultShown = false;
  function showResult() {
    if (resultShown || !state.complete || state.match && !state.match.complete) return;
    resultShown = true;
    if (mapExpanded) onExpandMap();
    const winner = state.match?.winner ?? state.winner;
    resultDialog.dataset.outcome = winner === 'home' ? 'win' : winner === 'away' ? 'loss' : 'neutral';
    screen.querySelector('#practice-result-title').textContent = `${official ? bo3 ? `${seriesLabel} 맵` : '공식 경기' : '팀 연습'} ${winner === 'home' ? '승리' : winner === 'away' ? '패배' : '종료'}`;
    screen.querySelector('.practice-result-summary').textContent = state.match
      ? `${home.name} ${state.match.score.home} : ${state.match.score.away} ${away.name}`
      : `${home.name} · ${away.name}`;
    if (official) {
      const message = screen.querySelector('.practice-reward-message');
      message.textContent = bo3 ? `${seriesLabel} 완료 맵 결과 저장 중…` : official.tiebreak ? '순위 결정전 종료 · AI 결정전 계산 및 자동 저장 중…' : '공식 경기 종료 · 같은 주 AI 경기 계산 및 자동 저장 중…';
      screen.querySelector('.practice-result-content').innerHTML = screen.querySelector('#match-content-panel').innerHTML;
      if (!resultDialog.open) resultDialog.showModal();
      void onOfficialComplete({ ...state.match.score, report:buildMatchReport(state,official), ...(bo3 ? { pausesRemaining: state.timeout.remaining } : {}) }).then(response => {
        const notice = typeof response === 'object' ? response.notice : response;
        message.textContent = `${bo3 ? `${seriesLabel} 경기 결과를` : official.tiebreak ? '순위 결정전 결과를' : '공식 경기와 같은 주 AI 경기 결과를'} 자동 저장했습니다.${notice ? ` ${notice}` : ''}`;
        if (response?.nextMap) for (const button of screen.querySelectorAll('[data-action="next-playoff-map"]')) button.hidden = false;
        const counselButton=screen.querySelector('[data-action="open-counseling"]');
        counselButton.hidden=Boolean(response?.nextMap || !response?.counselCount);
        if(response?.counselCount)counselButton.textContent=`선수 상담 ${response.counselCount}건`;
        if(!response?.nextMap && response?.counselCount && onCounselingRequired) {
          if(resultDialog.open)resultDialog.close();
          onCounselingRequired();
        }
      }).catch(error => { message.textContent = `결과 저장 실패: ${error.message} · 다른 화면으로 이동하면 저장을 다시 시도합니다.`; });
      return;
    }
    const beforeReward = new Map(world.players.map(player => [player.id, [player.aim, player.intelligence, player.stamina]]));
    const reward = settleTeamTraining(world, state, trainingDay);
    if (reward.ok) onTrainingReward(reward.message);
    const receipt = reward.ok ? reward.receipt : null;
    screen.querySelector('.practice-reward-message').innerHTML = receipt
      ? `${escapeHtml(TEAM_TRAINING_MODES[receipt.mode].label)} · ${receipt.winner === 'home' ? '승리' : receipt.winner === 'away' ? '패배' : '연습 종료'} · 코치 보너스 +${receipt.coachBonus}% · 주간 보상 지급 완료<ul>${receipt.rewards.map(item => {
        const player = world.players.find(player => player.id === item.playerId);
        const applied = Object.values(item.allocation).reduce((sum, value) => sum + value, 0);
        const changes = ['aim', 'intelligence', 'stamina'].flatMap((skill, index) => {
          const previous = beforeReward.get(player.id)[index], delta = player[skill] - previous;
          return delta ? [`<span class="ability-change${delta < 0 ? ' is-down' : ''}">${['에임', '지능', '체력'][index]} ${previous} → ${player[skill]} (${delta > 0 ? '+' : ''}${delta})</span>`] : [];
        }).join('');
        return `<li>${escapeHtml(player.nickname)} · ${item.kills}/${item.deaths}/${item.assists} · 경험치 ${item.experience} (${applied} 적용, 최대 능력 제외)${changes ? `<div class="ability-changes" aria-label="실제 능력 변화">${changes}</div>` : ''}</li>`;
      }).join('')}</ul>` : '연습이 끝났습니다. 이번 주 팀 훈련 보상이 없거나 이미 지급됐습니다.';
    screen.querySelector('.practice-result-content').innerHTML = screen.querySelector('#match-content-panel').innerHTML;
    if (typeof resultDialog.showModal === 'function' && !resultDialog.open) resultDialog.showModal();
  }
  function loadManualDraft() {
    manualSide = currentSide();
    const plan = state.manualPlans?.[manualSide];
    const draft = manualDrafts[manualSide];
    const stored = draft?.players[selectedId] ?? plan?.players[selectedId];
    manualCells = stored ? stored.cells.map(cell => ({ ...cell })) : [];
    manualAngle = stored?.angle ?? (manualSide === 'defense' ? Math.PI : 0);
    manualDuration.value = String(draft?.duration ?? plan?.duration ?? 4);
    manualMode.value = stored?.mode ?? 'select';
    manualMessage.textContent = '';
  }
  function keepManualDraft(changed = false) {
    const draft = manualDrafts[manualSide] ??= { players: {} };
    draft.players[selectedId] = { cells: manualCells.map(cell => ({ ...cell })), angle: manualAngle,
      mode: manualMode.value, changed: changed || Boolean(draft.players[selectedId]?.changed) };
  }
  loadManualDraft();
  select.innerHTML = state.actors.map(actor => `<option value="${actor.id}">${actor.team === 'home' ? '내 팀' : '상대 팀'} ${actor.number} · ${escapeHtml(actor.nickname)}</option>`).join('');
  screen.querySelector('.practice-teams').textContent = `${home.name} (파랑)  vs  ${away.name} (보라) · 테스트 경로 이동`;

  function draw() {
    if (disposed) return;
    if (manualSide !== currentSide()) loadManualDraft();
    screen.querySelector('.page-heading h1').textContent = `${map.name} · ${official ? `${['시 리그','도 리그','전국 리그','세계 리그'].includes(official.leagueLabel) ? '' : 'PC방 '}${officialLabel}` : '팀 연습'}`;
    canvas.ariaLabel = `${map.name} 2D 지도. 선수 선택 목록에서 시야를 확인할 선수를 선택할 수 있습니다.`;
    const rect = mapStage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = Math.min(rect.width / (map.columns * map.tileSize), rect.height / (map.rows * map.tileSize));
    const displayWidth = map.columns * map.tileSize * scale;
    const displayHeight = map.rows * map.tileSize * scale;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(displayWidth * ratio);
    const height = Math.round(displayHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.setTransform(width / (map.columns * map.tileSize), 0, 0, height / (map.rows * map.tileSize), 0, 0);
    drawPractice(context, map, state, selectedId, manualOpen && state.round ? { side: manualSide, cells: manualCells, angle: manualAngle } : undefined);
    const selected = state.actors.find(actor => actor.id === selectedId);
    strategyToolbar.hidden = !state.round && !state.combat;
    strategyOptions.hidden = !(state.round && (manualOpen || automaticOpen) || state.economy && purchaseOpen || state.combat && contentOpen);
    manualToggle.hidden = automaticToggle.hidden = !state.round;
    purchaseToggle.hidden = !state.economy;
    contentToggle.hidden = !state.combat;
    purchasePanel.hidden = !state.economy || !purchaseOpen;
    purchaseToggle.ariaExpanded = String(Boolean(state.economy && purchaseOpen));
    contentToggle.ariaExpanded = String(Boolean(state.combat && contentOpen));
    manualEditor.hidden = !state.round || !manualOpen;
    automaticEditor.hidden = !state.round || !automaticOpen;
    manualToggle.ariaExpanded = String(Boolean(state.round && manualOpen));
    automaticToggle.ariaExpanded = String(Boolean(state.round && automaticOpen));
    const manualEditable = canEditManual(state) && selected.team === 'home';
    manualDuration.disabled = manualMode.disabled = !manualEditable;
    for (const button of Object.values(manualButtons)) button.disabled = !manualEditable;
    if (state.manualPlans) {
      const counts = side => { const plan = state.manualPlans[side]; return `${side === 'attack' ? '공격' : '수비'} ${plan.remaining}/${plan.duration}라운드${Object.keys(plan.players).length ? '' : ' (설정 없음)'}`; };
      const pending = Object.values(manualDrafts[manualSide]?.players ?? {}).filter(player => player.changed).length;
      screen.querySelector('.manual-status').textContent = `${selected.nickname} · ${manualSide === 'attack' ? '공격' : '수비'} 초안 ${manualCells.length}/12점 · 저장 대기 ${pending}명 · ${counts('attack')} / ${counts('defense')}${manualEditable ? '' : ' · 구매 단계·감독 타임아웃의 내 팀 선수만 편집 가능'}`;
    }
    const totalMs = state.tick * STEP_MS;
    screen.querySelector('.practice-clock').textContent = `${String(Math.floor(totalMs / 60000)).padStart(2, '0')}:${(totalMs % 60000 / 1000).toFixed(2).padStart(5, '0')}`;
    const ending = state.round ? `${state.round.winner === 'home' ? '내 팀' : '상대 팀'} 승리 · ${ROUND_REASONS[state.endReason]}` : state.combat ? state.endReason === 'time-limit' ? '연습 시간 종료' : state.endReason === 'mutual-elimination' ? '양 팀 전멸 · 연습 종료' : '전멸 발생 · 연습 종료' : '테스트 목적지 도착 완료';
    screen.querySelector('.practice-state').textContent = state.match?.complete ? '경기 종료' : state.complete ? ending : running ? state.combat ? '교전 진행 중' : '이동 중' : state.tick ? '일시정지' : '시작 대기';
    toggle.textContent = state.match?.complete ? '경기 종료' : state.complete ? state.round ? '라운드 완료' : '연습 완료' : state.economy?.phase === 'buy' ? '구매 완료 · 시작' : running ? '일시정지' : state.tick ? '계속' : '시작';
    toggle.disabled = state.complete || running && state.timeout.remaining === 0;
    skip.hidden = !state.round;
    skip.disabled = skipping || !state.round?.started || state.complete || Boolean(state.match?.complete)
      || Boolean(state.timeout?.active) || state.economy?.phase === 'buy';
    skip.textContent = skipping ? '라운드 스킵 중' : '라운드 스킵';
    if (skipping) {
      toggle.textContent = '스킵 중단 · 일시정지';
      screen.querySelector('.practice-state').textContent = '라운드 스킵 중';
    }
    if (state.match && state.economy.phase === 'buy') toggle.textContent = `${state.economy.roundNumber}R 구매 완료 · 시작`;
    timeout.hidden = !state.match;
    timeoutStatus.hidden = false;
    timeout.disabled = !canRequestTimeout(state);
    if (state.timeout) {
      timeoutStatus.textContent = `${bo3 ? `${seriesLabel} 전체` : '경기 전체'} 퍼즈 잔여 ${state.timeout.remaining}/${TIMEOUT_RULES.regulation}회 · ${state.timeout.active ? state.timeout.kind === 'normal' ? '일시정지 중 · 시간 제한 없음' : '시간 정지 중 · 전술·경로·시선 수정 후 직접 재개하세요. 시간 제한 없음.' : '일시정지·감독 타임아웃 횟수 공유 · 연장 충전 없음'}`;
    }
    if (state.timeout?.active) {
      toggle.textContent = state.timeout.kind === 'normal' ? '퍼즈 종료 · 재개' : '타임아웃 종료 · 재개';
      screen.querySelector('.practice-state').textContent = state.timeout.kind === 'normal' ? '일시정지' : '감독 타임아웃';
    }
    reset.textContent = official ? '새 경기 초기화' : '다음 상대와 연습';
    sideSelect.disabled = Boolean(official || state.match && (state.round.started || state.match.history.length));
    siteSelect.disabled = currentSide() !== 'attack' || !state.round || state.complete || Boolean(state.match?.complete)
      || (state.economy ? state.economy.phase !== 'buy' : state.round.started);
    next.hidden = !state.economy || Boolean(state.match);
    next.disabled = !state.economy?.settled || !state.complete || Boolean(state.match?.complete);
    const matchKey = state.match ? `${state.economy.roundNumber}:${state.match.history.length}:${state.match.complete}` : 'none';
    if (matchKey !== lastMatchKey) { renderMatch(match, state); renderHighlights(screen.querySelector('.match-highlights'), state); lastMatchKey = matchKey; }
    const economyKey = state.economy ? `${state.economy.roundNumber}:${state.economy.phase}:${state.economy.ledger.length}:${state.actors.filter(actor => actor.team === 'home').map(actor => `${actor.weaponId}:${actor.armor}:${actor.alive}:${Object.values(actor.throwables).join('')}`).join(',')}` : 'none';
    if (economyKey !== lastEconomyKey) { renderEconomy(economy, state, equipmentActorId); lastEconomyKey = economyKey; }
    screen.querySelector('.round-options').hidden = !state.round;
    const tacticDescription = screen.querySelector('.tactics-description');
    tacticDescription.hidden = !state.defensePlans || currentSide() !== 'defense';
    screen.querySelector('[data-tactic-row="defense-plan"]').hidden = currentSide() !== 'defense';
    screen.querySelector('[data-tactic-row="attack-plan"]').hidden = currentSide() !== 'attack';
    screen.querySelector('[data-tactic-row="round-site"]').hidden = currentSide() !== 'attack';
    defenseSelect.disabled = currentSide() !== 'defense' || !state.defensePlans || !canEditTactics(state);
    if (state.defensePlans) tacticDescription.textContent = `${DEFENSE_TACTICS[state.defensePlans.home].name} · ${DEFENSE_TACTICS[state.defensePlans.home].description} ${state.round.attackTeam === 'home' ? '현재는 공격이며 수비 진영으로 전환되면 적용합니다.' : '현재 내 팀 수비에 적용 중입니다.'} ${state.opponentStrategy ? '상대 수비는 맵과 수비 진영 연패에 따라 전술을 변경합니다.' : '상대 수비는 기본 수비를 사용합니다.'} 구매 단계·감독 타임아웃에서 편집할 수 있으며 일반 일시정지는 편집을 허용하지 않습니다.`;
    const attackDescription = screen.querySelector('.attack-description');
    attackDescription.hidden = !state.attackPlans || currentSide() !== 'attack';
    attackSelect.disabled = currentSide() !== 'attack' || !state.attackPlans || !canEditTactics(state);
    if (state.attackPlans) attackDescription.textContent = `${ATTACK_TACTICS[state.attackPlans.home].name} · ${ATTACK_TACTICS[state.attackPlans.home].description} ${state.round.attackTeam === 'home' ? '현재 내 팀 공격에 적용 중입니다.' : '공격 진영으로 전환되면 적용합니다.'} ${state.opponentStrategy ? '상대 공격은 맵과 공격 진영 연패에 따라 전술을 변경합니다.' : '상대 공격은 집중 진입을 사용합니다.'} 설치 후 각자 담당 진입로를 경계합니다.`;
    const roundStatus = screen.querySelector('.round-status');
    roundStatus.hidden = !state.round;
    screen.querySelector('.practice-teams').textContent = `${home.name} (파랑) vs ${away.name} (보라)${state.round ? ` · 내 팀 ${state.round.attackTeam === 'home' ? '공격' : '수비'} · 목표 ${state.round.siteName}` : ' · 테스트 경로 이동'}`;
    if (state.round) {
      const { bomb, action } = state.round;
      const labels = { carried: '운반 중', dropped: '바닥에 떨어짐', planted: '설치됨', defused: '해체됨', exploded: '폭발함' };
      const carrier = state.actors.find(actor => actor.id === bomb.carrierId);
      const limit = bomb.plantedTick === null ? ROUND_RULES.limitTicks : bomb.plantedTick + ROUND_RULES.fuseTicks;
      const remaining = Math.max(0, (limit - state.tick) * STEP_MS / 1000).toFixed(2);
      const progress = action ? ` · ${action.type === 'plant' ? '설치' : '해체'} ${((state.tick - action.startTick) * STEP_MS / 1000).toFixed(2)}/${action.type === 'plant' ? 4 : 7}초` : '';
      roundStatus.textContent = `폭탄 ${labels[bomb.status]}${carrier ? ` · ${carrier.nickname}` : ''} · ${bomb.plantedTick === null ? '설치 제한' : '폭발까지'} ${remaining}초${progress}${state.complete ? ` · ${ending}` : ''}`;
    }
    screen.querySelector('.combat-records').hidden = !state.combat || !contentOpen;
    const activity = !selected.alive ? '사망' : state.complete ? '연습 종료'
      : selected.action ? selected.action === 'plant' ? '폭탄 설치 중' : '폭탄 해체 중' : selected.targetId ? '상대와 교전'
      : selected.keepingDistance ? '아군 간격 유지' : selected.trafficBlocked ? '선수 통행 대기' : selected.blocked ? '벽에 가로막힘' : running && selected.intent ? selected.intent : selected.arrived ? '목적지 도착' : running ? '이동 중' : '이동 대기';
    const weapon = weaponFor(selected);
    const selectedStats = matchPlayerStats(state, selected);
    readout.textContent = `${selected.name} · ${selected.nickname}\n위치 ${selected.x.toFixed(1)}, ${selected.y.toFixed(1)}\n시야 ${Math.round(selected.fieldOfView * 180 / Math.PI)}° · 거리 ${Math.round(sightRange(selected, state))}\n${activity}${selected.defenseTask && state.round?.bomb.status !== 'planted' ? `\n임무 ${selected.defenseTask.label} · 담당 ${selected.defenseTask.site}\n${DEFENSE_TACTICS[selected.defenseTask.plan].name}${selected.defenseTask.withdrawn ? ' · 후퇴 유지' : ''}` : ''}${state.combat ? `\nHP ${selected.hp}/100 · 방탄복 ${selected.armor ?? 0}/100 · ${weapon.name}\n탄약 ${selected.ammo}/${weapon.magazineSize}${selected.reloadUntilTick !== null ? ' · 재장전 중' : ''}\n${state.match ? '경기 누적 ' : ''}K/D/A ${selectedStats.kills}/${selectedStats.deaths}/${selectedStats.assists}\n누적 피해 ${selectedStats.damage}${state.economy ? `\n경기 자금 $${selected.cash.toLocaleString('en-US')}` : ''}` : ''}`;
    if (selected.alive && !state.complete && state.round?.saveReason && selected.team !== state.round.attackTeam) {
      readout.textContent += `\n판단: ${state.round.saveReason === 'time' ? '장비 보존 · 해체 시간 부족' : '장비 보존 · 불리한 재탈환'}`;
    }
    if (state.economy) readout.textContent += `\n${THROWABLES.map(item => `${item.name} ${selected.throwables[item.id]}`).join(' \u00b7 ')}`;
    if (selected.flashUntilTick > state.tick) readout.textContent += `\n\uc12c\uad11 \uc601\ud5a5 \uc911 \u00b7 ${((selected.flashUntilTick - state.tick) * STEP_MS / 1000).toFixed(2)}\ucd08`;
    const visible = visibleOpponents(state, map, selectedId);
    if (selected.attackTask) readout.textContent += `\n공격 임무 ${selected.attackTask.label} · ${ATTACK_TACTICS[selected.attackTask.plan].name}\n${state.round.bomb.status === 'planted' ? '설치 후 담당 진입로 경계' : `${selected.attackTask.lane === 'flank' ? '외곽' : '중앙'} 경로 ${selected.attackTask.stage + 1}/${selected.attackTask.points.length}`}`;
    const message = !selected.alive ? '사망한 선수는 감지·이동·사격하지 않습니다.' : visible.length ? `시야 내 상대 ${visible.length}명 · ${visible.map(actor => actor.nickname).join(', ')}` : '시야 내 상대 없음';
    if (detection.textContent !== message) detection.textContent = message;
    if (lastStatsTick !== state.tick) {
      screen.querySelector('.combat-stat-panel h2').textContent = state.match ? '경기 누적 기록' : '연습 기록';
      screen.querySelector('.combat-table tbody').innerHTML = state.actors.map(actor => {
        const stats = matchPlayerMetrics(state, actor);
        return `<tr class="${actor.alive ? '' : 'dead-player'}"><th scope="row"><span class="${actor.team === 'home' ? 'home-text' : 'away-text'}">${actor.number} · ${escapeHtml(actor.nickname)}</span></th><td>${actor.hp}${actor.alive ? '' : ' · 사망'}</td><td>${actor.reloadUntilTick !== null ? '재장전' : actor.ammo}</td><td>${stats.kills}/${stats.deaths}/${stats.assists}</td><td>${stats.damage}</td><td>${stats.shots}</td><td>${stats.hits}</td><td>${stats.accuracy === null ? '—' : `${stats.accuracy.toFixed(1)}%`}</td><td>${stats.adr === null ? '—' : stats.adr.toFixed(1)}</td></tr>`;
      }).join('');
      screen.querySelector('.combat-survivors').textContent = `생존 ${state.actors.filter(actor => actor.team === 'home' && actor.alive).length} : ${state.actors.filter(actor => actor.team === 'away' && actor.alive).length}`;
      lastStatsTick = state.tick;
    }
    if (lastEventCount !== state.events.length) {
      screen.querySelector('.combat-events').innerHTML = state.events.slice(-8).reverse().map(event => {
        const actor = state.actors.find(item => item.id === event.actorId);
        const time = (event.tick * STEP_MS / 1000).toFixed(2);
        const objectiveLabels = { 'plant-start': '폭탄 설치 시작', 'defuse-start': '폭탄 해체 시작', 'bomb-drop': '폭탄 낙하', 'bomb-pickup': '폭탄 회수', 'bomb-planted': '폭탄 설치 완료', 'bomb-defused': '폭탄 해체 완료' };
        if (event.type === 'round-end') return `<li><time>${time}s</time>${event.winner === 'home' ? '내 팀' : '상대 팀'} 승리 · ${ROUND_REASONS[event.reason]}</li>`;
        if (event.type === 'site-rotation') return `<li><time>${time}s</time>${event.team === 'home' ? '내 팀' : '상대 팀'} · ${escapeHtml(event.from)} → ${escapeHtml(event.to)} 사이트 전환</li>`;
        if (event.type === 'equipment-save') return `<li><time>${time}s</time>${event.team === 'home' ? '내 팀' : '상대 팀'} · 장비 보존 (${event.reason === 'time' ? '해체 시간 부족' : '불리한 재탈환'})</li>`;
        if (event.type === 'attack-entry') return `<li><time>${time}s</time>${event.team === 'home' ? '내 팀' : '상대 팀'} · 공동 진입 시작</li>`;
        if (event.type === 'trade-support') return `<li><time>${time}s</time>${escapeHtml(actor.nickname)} · 선두 후속 교전 지원</li>`;
        if (event.type === 'smoke-risk-response') return `<li><time>${time}s</time>${escapeHtml(actor.nickname)} · 연막 위험 경계</li>`;
        if (objectiveLabels[event.type]) return `<li><time>${time}s</time>${escapeHtml(actor.nickname)} · ${objectiveLabels[event.type]}</li>`;
        if (event.type === 'death') {
          const killer = state.actors.find(item => item.id === event.killerId);
          return `<li><time>${time}s</time>${escapeHtml(killer.nickname)} → ${escapeHtml(actor.nickname)} · 사망</li>`;
        }
        if (event.type === 'reload') return `<li><time>${time}s</time>${escapeHtml(actor.nickname)} · 재장전</li>`;
        if (event.type === 'utility-thrown' || event.type === 'utility-detonated') {
          const item = THROWABLES.find(item => item.id === event.kind);
          return `<li><time>${time}s</time>${escapeHtml(actor.nickname)} · ${item.name} ${event.type === 'utility-thrown' ? '투척' : '전개/폭발'}</li>`;
        }
        if (event.type === 'flashed') return `<li><time>${time}s</time>${escapeHtml(actor.nickname)} · 섬광 효과 ${(event.durationTicks * STEP_MS / 1000).toFixed(2)}초</li>`;
        const target = state.actors.find(item => item.id === event.targetId);
        if (event.type === 'grenade-hit') return `<li><time>${time}s</time>${escapeHtml(actor.nickname)} → ${escapeHtml(target.nickname)} · 수류탄 ${event.damage} 피해${event.friendlyFire ? ' (아군/자해)' : ''}</li>`;
        return `<li><time>${time}s</time>${escapeHtml(actor.nickname)} → ${escapeHtml(target.nickname)} · ${event.hit ? `명중 ${event.damage} 피해` : '빗나감'}</li>`;
      }).join('') || '<li>시작 후 실제 교전 이벤트를 표시합니다.</li>';
      lastEventCount = state.events.length;
    }
  }

  function pause() {
    running = false;
    skipping = false;
    lastTime = null;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    draw();
  }

  function frame(timestamp) {
    frameId = null;
    if (disposed || !running) return;
    if (document.hidden && requestPause(state)) { pause(); return; }
    const speed = [1, 2, 4].includes(Number(speedSelect.value)) ? Number(speedSelect.value) : 1;
    // 스킵도 50ms 고정 단계를 빠짐없이 수행하며 입력을 받을 수 있도록 묶음 사이에 양보한다.
    if (skipping) advancePractice(state, map, 2000);
    else if (lastTime !== null) advancePractice(state, map, Math.max(0, timestamp - lastTime) * speed);
    lastTime = timestamp;
    if (state.complete) {
      running = false;
      skipping = false;
      lastTime = null;
      if (state.match && !state.match.complete && nextEconomyRound(state, map)) clearViews();
    }
    draw();
    if (state.complete) showResult();
    if (running) frameId = requestAnimationFrame(frame);
  }

  const onToggle = () => {
    if (running) { if (requestPause(state)) pause(); return; }
    if (state.complete) return;
    if (state.timeout?.active) resumeTimeout(state);
    if (state.economy?.phase === 'buy') { startEconomyRound(state); lastStatsTick = -1; }
    if (state.round) state.round.started = true;
    running = true;
    lastTime = performance.now();
    draw();
    frameId = requestAnimationFrame(frame);
  };
  const onTimeout = () => {
    if (!requestTimeout(state)) return;
    pause();
  };
  const onSkip = () => {
    if (skip.disabled || !state.round || !state.round.started || state.complete || state.match?.complete
      || state.timeout?.active || state.economy?.phase === 'buy') return;
    skipping = true;
    running = true;
    lastTime = performance.now();
    draw();
    if (frameId === null) frameId = requestAnimationFrame(frame);
  };
  const clearViews = () => { lastStatsTick = -1; lastEventCount = -1; lastEconomyKey = null; lastMatchKey = null; economy.querySelector('.economy-message').textContent = ''; loadManualDraft(); };
  const clearResult = () => { resultShown = false; if (resultDialog.open) resultDialog.close(); };
  const onReset = () => { if (official) return; pause(); clearResult(); state = newState(); manualDrafts = {}; clearViews(); draw(); };
  const onNewOpponent = () => { if (official) return; away = nextPracticeOpponent(world); onReset(); };
  const onMap = () => {
    if (official) return;
    const selectedMap = PRACTICE_MAPS.find(item => item.id === mapSelect.value);
    if (!selectedMap) { mapSelect.value = map.id; return; }
    pause();
    clearResult();
    map = selectedMap;
    state = newState();
    manualDrafts = {};
    clearViews();
    draw();
  };
  const onSite = () => {
    if (siteSelect.disabled || !map.sites.some(site => site.name === siteSelect.value)) return;
    setupRound(state, map, state.round.attackTeam, siteSelect.value);
    clearViews(); draw();
  };
  const onNext = () => { if (!state.economy?.settled || !state.complete || state.match?.complete) return; pause(); clearResult(); nextEconomyRound(state, map); clearViews(); draw(); };
  const onBuy = event => {
    const button = event.target.closest('[data-equipment-actor], [data-buy]');
    if (!button || !economy.contains(button)) return;
    if (button.dataset.equipmentActor) {
      equipmentActorId = button.dataset.equipmentActor;
      renderEconomy(economy, state, equipmentActorId);
      economy.querySelector('.economy-message').textContent = '';
      economy.querySelector(`[data-equipment-actor="${equipmentActorId}"]`)?.focus?.();
      return;
    }
    const result = buyEquipment(state, button.dataset.buy, button.dataset.equipment);
    if (result.ok) lastStatsTick = -1;
    economy.querySelector('.economy-message').textContent = result.message;
    draw();
  };
  const onSelect = () => { selectedId = select.value; loadManualDraft(); draw(); };
  const onDefense = () => {
    if (defenseSelect.disabled) return;
    if (setDefensePlan(state, map, defenseSelect.value)) { if (!state.timeout?.active) prepareRound(state, map); }
    else if (state.defensePlans) defenseSelect.value = state.defensePlans.home;
    draw();
  };
  const onAttack = () => {
    if (attackSelect.disabled) return;
    if (setAttackPlan(state, map, attackSelect.value)) { if (!state.timeout?.active) prepareRound(state, map); }
    else if (state.attackPlans) attackSelect.value = state.attackPlans.home;
    draw();
  };
  const onCanvas = event => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * map.columns * map.tileSize;
    const y = (event.clientY - rect.top) / rect.height * map.rows * map.tileSize;
    if (!manualEditor.hidden && manualMode.value !== 'select') {
      if (!canEditManual(state)) return;
      const selected = state.actors.find(actor => actor.id === selectedId);
      if (selected.team !== 'home') return;
      if (manualMode.value === 'route') {
        const cells = [...manualCells, { x: Math.floor(x / map.tileSize), y: Math.floor(y / map.tileSize) }];
        const validation = validateManualRoute(map, selected, manualSide, cells, manualAngle, manualRouteStart(state, map, selected, manualSide));
        if (validation.ok) { manualCells = validation.cells; keepManualDraft(true); manualMessage.textContent = '경유점 임시 저장됨 · 저장을 눌러 전체 편집을 반영하세요.'; }
        else manualMessage.textContent = validation.message;
      } else if (manualCells.length) {
        const end = cellCenter(map, manualCells.at(-1));
        if (Math.hypot(x - end.x, y - end.y) > 1) {
          manualAngle = Math.atan2(y - end.y, x - end.x);
          keepManualDraft(true);
          manualMessage.textContent = '시선 임시 저장됨 · 저장을 눌러 전체 편집을 반영하세요.';
        }
      } else manualMessage.textContent = '경유점을 먼저 추가하세요.';
      draw();
      return;
    }
    const actor = state.actors.find(item => Math.hypot(item.x - x, item.y - y) <= item.radius + 8);
    if (actor) { selectedId = actor.id; select.value = selectedId; loadManualDraft(); draw(); }
  };
  const onManualUndo = () => {
    if (!manualButtons.undo.disabled && manualCells.length) { manualCells.pop(); keepManualDraft(true); draw(); }
  };
  const onManualSave = () => {
    if (manualButtons.save.disabled || !canEditManual(state)) return;
    const duration = Number(manualDuration.value);
    if (!MANUAL_DURATIONS.includes(duration)) return;
    const players = Object.entries(manualDrafts[manualSide]?.players ?? {}).filter(([, player]) => player.changed);
    // 전체 검증이 끝나기 전에는 기간·경로를 변경하지 않는다.
    for (const [id, player] of players) {
      if (!player.cells.length) continue;
      const actor = state.actors.find(item => item.id === id);
      const result = validateManualRoute(map, actor, manualSide, player.cells, player.angle, manualRouteStart(state, map, actor, manualSide));
      if (!result.ok) { manualMessage.textContent = `${actor.nickname}: ${result.message}`; return; }
    }
    setManualDuration(state, manualSide, duration);
    for (const [id, player] of players) {
      if (player.cells.length) setManualRoute(state, map, id, manualSide, player.cells, player.angle);
      else clearManualRoute(state, id, manualSide);
    }
    delete manualDrafts[manualSide];
    if (!state.timeout?.active) prepareRound(state, map);
    loadManualDraft();
    manualMessage.textContent = `${manualSide === 'attack' ? '공격' : '수비'} 전략 저장 완료 · 기간 ${duration}라운드 · 선수 ${players.length}명 반영`;
    draw();
  };
  const onManualClear = () => {
    if (manualButtons.clear.disabled) return;
    manualCells = [];
    keepManualDraft(true);
    manualMessage.textContent = '자동 전술로 복귀할 초안입니다. 저장을 눌러 반영하세요.';
    draw();
  };
  const onManualDuration = () => {
    if (manualDuration.disabled) return;
    const draft = manualDrafts[manualSide] ??= { players: {} };
    draft.duration = Number(manualDuration.value);
    manualMessage.textContent = '기간 임시 저장됨 · 저장을 눌러 전체 편집을 반영하세요.';
    draw();
  };
  const onManualMode = () => { if (!manualMode.disabled) keepManualDraft(); };
  const onVisibility = () => { if (document.hidden && running && requestPause(state)) pause(); };
  const onOpenRules = () => { if (!rulesDialog.open) rulesDialog.showModal(); };
  const onCloseRules = () => rulesDialog.close();
  const backgroundInert = new Map();
  const onExpandMap = () => {
    mapExpanded = !mapExpanded;
    mapWrap.classList.toggle('is-expanded', mapExpanded);
    screen.classList.toggle('is-expanded', mapExpanded);
    expandMap.textContent = mapExpanded ? '원래 크기로 ↙' : '화면 크게 ↗';
    expandMap.ariaPressed = String(mapExpanded);
    if (mapExpanded) {
      for (const element of screen.closest?.('#app')?.querySelectorAll('.sidebar, .topbar, .footer, .skip-link') ?? []) {
        backgroundInert.set(element, element.inert);
        element.inert = true;
      }
      expandMap.focus?.({ preventScroll: true });
    } else {
      for (const [element, inert] of backgroundInert) element.inert = inert;
      backgroundInert.clear();
      expandMap.focus?.({ preventScroll: true });
    }
    draw();
  };
  const onMapEscape = event => {
    if (event.key === 'Tab' && mapExpanded && !resultDialog.open && !rulesDialog.open && !event.target?.closest?.('dialog')) {
      const controls = [...screen.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), summary, [tabindex="0"]')].filter(element => element.getClientRects().length && !element.closest('[inert], details:not([open]) > :not(summary)'));
      const first = controls[0], last = controls.at(-1);
      if (first && (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last || !screen.contains(document.activeElement))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }
    if (event.key === 'Escape' && mapExpanded && !resultDialog.open && !rulesDialog.open && !event.target?.closest?.('dialog')) { event.preventDefault(); onExpandMap(); }
  };
  openRules.addEventListener('click', onOpenRules);
  closeRules.addEventListener('click', onCloseRules);
  expandMap.addEventListener('click', onExpandMap);
  window.addEventListener('keydown', onMapEscape);
  const onManualToggle = () => { manualOpen = !manualOpen; automaticOpen = purchaseOpen = contentOpen = false; draw(); };
  const onAutomaticToggle = () => { automaticOpen = !automaticOpen; manualOpen = purchaseOpen = contentOpen = false; draw(); };
  const onPurchaseToggle = () => { purchaseOpen = !purchaseOpen; manualOpen = automaticOpen = contentOpen = false; draw(); };
  const onContentToggle = () => { contentOpen = !contentOpen; manualOpen = automaticOpen = purchaseOpen = false; draw(); };
  manualToggle.addEventListener('click', onManualToggle);
  automaticToggle.addEventListener('click', onAutomaticToggle);
  purchaseToggle.addEventListener('click', onPurchaseToggle);
  contentToggle.addEventListener('click', onContentToggle);
  toggle.addEventListener('click', onToggle);
  skip.addEventListener('click', onSkip);
  timeout.addEventListener('click', onTimeout);
  reset.addEventListener('click', onNewOpponent);
  next.addEventListener('click', onNext);
  economy.addEventListener('click', onBuy);
  select.addEventListener('change', onSelect);
  modeSelect.addEventListener('change', onReset);
  mapSelect.addEventListener('change', onMap);
  sideSelect.addEventListener('change', onReset);
  siteSelect.addEventListener('change', onSite);
  defenseSelect.addEventListener('change', onDefense);
  attackSelect.addEventListener('change', onAttack);
  canvas.addEventListener('click', onCanvas);
  manualButtons.undo.addEventListener('click', onManualUndo);
  manualButtons.save.addEventListener('click', onManualSave);
  manualButtons.clear.addEventListener('click', onManualClear);
  manualDuration.addEventListener('change', onManualDuration);
  manualMode.addEventListener('change', onManualMode);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', draw);
  const observer = new ResizeObserver(draw);
  const onCloseResult = () => { if (resultDialog.open) resultDialog.close(); };
  closeResult.addEventListener('click', onCloseResult);
  observer.observe(mapStage);
  draw();

  return () => {
    disposed = true;
    rulesDialog.close();
    for (const [element, inert] of backgroundInert) element.inert = inert;
    backgroundInert.clear();
    mapWrap.classList.remove('is-expanded');
    screen.classList.remove('is-expanded');
    openRules.removeEventListener('click', onOpenRules);
    closeRules.removeEventListener('click', onCloseRules);
    expandMap.removeEventListener('click', onExpandMap);
    window.removeEventListener('keydown', onMapEscape);
    onCloseResult();
    closeResult.removeEventListener('click', onCloseResult);
    running = false;
    if (frameId !== null) cancelAnimationFrame(frameId);
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', draw);
    toggle.removeEventListener('click', onToggle);
    skip.removeEventListener('click', onSkip);
    manualToggle.removeEventListener('click', onManualToggle);
    automaticToggle.removeEventListener('click', onAutomaticToggle);
    purchaseToggle.removeEventListener('click', onPurchaseToggle);
    contentToggle.removeEventListener('click', onContentToggle);
    timeout.removeEventListener('click', onTimeout);
    reset.removeEventListener('click', onNewOpponent);
    next.removeEventListener('click', onNext);
    economy.removeEventListener('click', onBuy);
    select.removeEventListener('change', onSelect);
    modeSelect.removeEventListener('change', onReset);
    mapSelect.removeEventListener('change', onMap);
    sideSelect.removeEventListener('change', onReset);
    siteSelect.removeEventListener('change', onSite);
    defenseSelect.removeEventListener('change', onDefense);
    attackSelect.removeEventListener('change', onAttack);
    canvas.removeEventListener('click', onCanvas);
    manualButtons.undo.removeEventListener('click', onManualUndo);
    manualButtons.save.removeEventListener('click', onManualSave);
    manualButtons.clear.removeEventListener('click', onManualClear);
    manualDuration.removeEventListener('change', onManualDuration);
    manualMode.removeEventListener('change', onManualMode);
  };
}

