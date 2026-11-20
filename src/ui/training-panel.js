import { escapeHtml } from './html.js';
import { TRAINING_LABELS, TRAINING_RULES, TRAINING_SKILLS, ACTION_RULES } from '../config/training.js';
import { happinessModifier, effectiveStats } from '../game/happiness.js';
import { GROWTH_LABELS, trainingLimit } from '../game/player-development.js';
import { playerCondition, fatigueModifier } from '../game/player-condition.js';
import { coachRule } from '../game/coaches.js';
import { facilityBonus } from '../game/facilities.js';
import { previewPlayerAction } from '../game/training.js';

const options = (selected, starter) => Object.entries(TRAINING_LABELS).filter(([key]) => starter || key !== 'team').map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`).join('');
const position = (club, player) => `<small class="training-position">${club.lineupIds.includes(player.id) ? '주전' : '후보'}</small>`;
const signed = value => `${value > 0 ? '+' : ''}${value}`;

export function actionPreviewMarkup(club, player, action, days = club.weekDaysRemaining || ACTION_RULES.weekDays) {
  if (!Number.isSafeInteger(club.day + days)) return '<p>게임 날짜 범위를 넘어 예상치를 표시할 수 없습니다.</p>';
  const preview = previewPlayerAction(club, player, action, days);
  const changed = preview.skills.filter(({ stat, experience }) => stat || experience);
  return `<h4>${preview.days}일 예상${action === 'team' ? '<small>팀 훈련 · 경기 보상 제외</small>' : ''}</h4>
    <div class="action-preview-changes">${changed.length ? changed.map(({ skill, stat, experience }) =>
      `<span class="action-preview-change"><span>${TRAINING_LABELS[skill].replace(' 훈련', '')}</span><strong>${signed(experience)} XP</strong>${stat ? `<b>능력 ${signed(stat)}</b>` : ''}</span>`).join('') : '<span class="action-preview-unchanged">능력·경험치 변동 없음</span>'}</div>
    <div class="action-preview-condition"><span>행복도 <strong>${signed(preview.happiness)}</strong></span><span>피로 <strong>${signed(preview.fatigue)}</strong></span></div>
    <details><summary>자세히</summary><dl>${preview.skills.map(({ skill }) => `<div><dt>${TRAINING_LABELS[skill].replace(' 훈련', '')}</dt><dd>능력 ${preview.player[skill]} · 경험치 ${preview.player.training.experience[skill]}</dd></div>`).join('')}
      <div><dt>행복도</dt><dd>${preview.player.morale.happiness}</dd></div><div><dt>피로</dt><dd>${preview.player.fatigue}</dd></div></dl></details>`;
}

export function updateActionPreviews(dialog, club, days = club.weekDaysRemaining || ACTION_RULES.weekDays) {
  dialog.dataset.previewDays = String(days);
  const period = dialog.querySelector('[data-preview-period]');
  if (period) period.textContent = `${days}일 예상`;
  const basics = dialog.querySelector('[data-preview-basics]');
  if (basics) basics.textContent = `${days}일 기본 개인 훈련 경험치 +${TRAINING_RULES.dailyExperience * days} · 방송 수입 $${ACTION_RULES.broadcastIncome * days}`;
  const choices = [...dialog.querySelectorAll('[data-week-action-player]')];
  const team = choices.some(select => select.value === 'team' && club.lineupIds.includes(select.dataset.weekActionPlayer));
  for (const select of choices) {
    const player = club.players.find(item => item.id === select.dataset.weekActionPlayer);
    const output = dialog.querySelector(`[data-action-preview="${player.id}"]`);
    if (output) output.innerHTML = actionPreviewMarkup(club, player, team && club.lineupIds.includes(player.id) ? 'team' : select.value, days);
  }
}

function actionSkills(player) {
  return TRAINING_SKILLS.map(skill => {
    const label = TRAINING_LABELS[skill].replace(' 훈련', '');
    const experience = player.training.experience[skill];
    const capped = player[skill] >= trainingLimit(player, skill);
    return `<div class="weekly-action-skill development-${skill}"><span>${label} <strong>${player[skill]}</strong></span><progress class="development-xp" max="${TRAINING_RULES.levelExperience}" value="${capped ? TRAINING_RULES.levelExperience : experience}" aria-label="${escapeHtml(`${player.nickname} ${label} 경험치 ${experience} / ${TRAINING_RULES.levelExperience}`)}"></progress><small>경험치 ${experience} / ${TRAINING_RULES.levelExperience}${capped ? ' · 최대' : ''}</small></div>`;
  }).join('');
}

function actionCondition(player) {
  const meters = [
    ['happiness', '행복도', player.morale.happiness, '높을수록 좋음', player.morale.happiness < 45],
    ['fatigue', '피로', player.fatigue, '낮을수록 좋음', player.fatigue >= 50],
    ['condition', '컨디션', playerCondition(player), '높을수록 좋음'],
  ];
  return meters.map(([key, label, value, hint, low]) => `<div class="weekly-action-skill weekly-action-meter weekly-action-${key}${low ? ' is-low' : ''}"><span>${label} <strong>${value}<small>/100</small></strong></span><progress class="development-xp" max="100" value="${value}" aria-label="${escapeHtml(`${player.nickname} ${label} ${value} / 100 · ${hint}`)}"></progress><small>${hint}</small></div>`).join('');
}

function developmentPlayer(club, player) {
  const stats = effectiveStats(player);
  const happiness = happinessModifier(player);
  const statusHint = `행복도 경기 보정 ${happiness > 0 ? '+' : ''}${happiness} · 피로 경기 보정: 에임·지능 ${fatigueModifier(player)}`;
  return `<li class="development-player"><div class="development-profile"><h3 class="development-nickname">${escapeHtml(player.nickname)}</h3><div class="development-player-meta">${position(club, player)}<span>성장 속도 ${GROWTH_LABELS[player.development.growthRate]} ×${player.development.growthRate / 100}</span></div></div>
    <div class="development-metrics"><div class="development-status" title="${statusHint}" aria-label="선수 상태">${actionCondition(player)}</div>
    <div class="development-skills">
    ${TRAINING_SKILLS.map(skill => {
      const limit = trainingLimit(player, skill), capped = player[skill] >= limit;
      const experience = player.training.experience[skill];
      const modifier = stats[skill] - player[skill];
      const label = `${player.nickname} ${TRAINING_LABELS[skill].replace(' 훈련', '')} ${capped ? '최대 능력 · 잠재력 도달' : `경험치 ${experience} / ${TRAINING_RULES.levelExperience}`}`;
      return `<section class="development-skill development-${skill}"><h4 class="development-skill-label">${TRAINING_LABELS[skill].replace(' 훈련', '')}</h4><div class="development-stat"><strong>${player[skill]}</strong><small>잠재력 ${limit}</small></div><progress class="development-xp" max="${TRAINING_RULES.levelExperience}" value="${capped ? TRAINING_RULES.levelExperience : experience}" aria-label="${escapeHtml(label)}"></progress><div class="development-skill-meta"><span>${capped ? '최대 능력 · 잠재력 도달' : `경험치 ${experience} / ${TRAINING_RULES.levelExperience}`}</span><span class="development-live${modifier > 0 ? ' is-up' : modifier < 0 ? ' is-low' : ''}">경기 적용 ${stats[skill]}</span></div></section>`;
    }).join('')}</div></div></li>`;
}

export function experiencePanel(club) {
  return `<section class="panel training-panel development-panel" aria-labelledby="experience-title">
    <div class="roster-heading"><h2 id="experience-title" tabindex="-1">선수 능력·경험치</h2><span class="tag muted-tag">경험치 ${TRAINING_RULES.levelExperience}마다 능력 +1</span></div>
    <ul class="development-roster" aria-label="선수별 능력·경험치">
      ${club.players.map(player => developmentPlayer(club, player)).join('')}
    </ul>
    <div class="training-help-buttons" aria-label="육성 설명"><button type="button" class="button secondary" data-action="training-help" data-help-topic="growth" aria-haspopup="dialog">성장 설명</button><button type="button" class="button secondary" data-action="training-help" data-help-topic="happiness" aria-haspopup="dialog">행복도 설명</button><button type="button" class="button secondary" data-action="training-help" data-help-topic="fatigue" aria-haspopup="dialog">피로·컨디션 설명</button></div>
  </section>`;
}

export function trainingPanel(club) {
  const days = club.weekDaysRemaining || ACTION_RULES.weekDays;
  const teamSelected = club.players.some(player => club.lineupIds.includes(player.id) && player.training.focus === 'team');
  return `<dialog id="weekly-action-dialog" class="weekly-action-dialog" aria-labelledby="training-title">
    <div class="roster-heading"><h2 id="training-title" tabindex="-1">선수 행동 선택</h2><span class="tag muted-tag" data-preview-period>${days}일 진행</span></div>
    <p class="input-hint" data-description="선수 행동 선택">선수마다 ${days}일 동안 진행할 행동을 선택하세요.${club.weekDaysRemaining ? ' 중단된 일정의 남은 날짜만 진행합니다.' : ''} 선택 완료 전에는 날짜와 행동이 바뀌지 않습니다.</p>
    <details class="action-preview-bonuses"><summary>코치·시설 보너스</summary>
    <div class="training-current-bonuses" aria-label="현재 훈련 보너스"><span>코치 훈련 보너스 +${coachRule(club.coach)?.bonus ?? 0}%</span><span>개인 훈련 시설 보너스: 에임 +${facilityBonus(club.facilities, 'aim')}% · 지능 +${facilityBonus(club.facilities, 'intelligence')}% · 체력 +${facilityBonus(club.facilities, 'stamina')}%</span><span data-preview-basics>${days}일 기본 개인 훈련 경험치 +${TRAINING_RULES.dailyExperience * days} · 방송 수입 $${ACTION_RULES.broadcastIncome * days}</span></div>
    </details>
    <div class="training-help-buttons" aria-label="선수 행동 설명"><button type="button" class="button secondary" data-action="training-help" data-help-topic="actions" aria-haspopup="dialog">주간 행동 설명</button><button type="button" class="button secondary" data-action="training-help" data-help-topic="growth" aria-haspopup="dialog">성장 설명</button><button type="button" class="button secondary" data-action="training-help" data-help-topic="happiness" aria-haspopup="dialog">행복도 설명</button><button type="button" class="button secondary" data-action="training-help" data-help-topic="fatigue" aria-haspopup="dialog">피로·컨디션 설명</button></div>
    <ul class="weekly-action-players" aria-label="선수 주간 행동">
      ${club.players.map(player => `<li class="weekly-action-player"><div class="weekly-action-player-heading"><div><strong>${escapeHtml(player.nickname)}</strong>${position(club, player)}</div><label>이번 주 행동<select data-week-action-player="${escapeHtml(player.id)}" aria-label="${escapeHtml(player.nickname)} 주간 행동">${options(club.lineupIds.includes(player.id) && teamSelected ? 'team' : player.training.focus === 'team' && !club.lineupIds.includes(player.id) ? 'rest' : player.training.focus, club.lineupIds.includes(player.id))}</select></label></div><div class="weekly-action-skills">${actionSkills(player)}</div><div class="weekly-action-skills" aria-label="선수 상태">${actionCondition(player)}</div><details class="weekly-action-status"><summary>상태·행동 기록</summary><small>피로 경기 보정: 에임·지능 ${fatigueModifier(player)}</small><br><small>${player.morale.lastAction === null ? '행동 기록 없음' : `${TRAINING_LABELS[player.morale.lastAction]} · 연속 ${Math.ceil(player.morale.consecutiveDays / 7)}주${player.morale.lastDay < club.day - 1 ? ' (이전 소속 기록)' : ''}`}</small></details><div class="action-preview" data-action-preview="${escapeHtml(player.id)}">${actionPreviewMarkup(club, player, club.lineupIds.includes(player.id) && teamSelected ? "team" : player.training.focus === "team" && !club.lineupIds.includes(player.id) ? "rest" : player.training.focus, days)}</div></li>`).join('')}
    </ul>
    <details class="action-preview-note"><summary>예상치 계산 기준</summary><p>현재 코치·시설·반복 행동·잠재력 상한을 반영합니다. 표시 기간을 모두 진행했을 때의 값이며 계약·이벤트로 중단될 수 있습니다. 미래 경기·팀 훈련 보상·무작위 이벤트 변화는 제외합니다.</p></details>
    <p class="roster-footnote" data-description="육성 저장">변경 후 구단 저장으로 보관하세요.</p>
    <div class="weekly-action-buttons"><button type="button" class="button secondary" data-action="cancel-week">취소</button><button type="button" class="button primary" data-action="confirm-week">선택 완료 · ${teamSelected ? '팀 훈련' : club.weekDaysRemaining ? `남은 ${days}일` : '1주'} 진행 ▶</button></div>
  </dialog>
  <dialog id="training-help-actions" class="training-help-dialog" aria-labelledby="training-help-actions-title">
    <div class="roster-heading"><h2 id="training-help-actions-title">주간 행동 설명</h2><form method="dialog"><button type="submit" class="button secondary" autofocus>닫기</button></form></div>
    <div class="training-help-content"><h3>선택과 진행</h3><p>선수마다 행동 하나를 선택하면 진행할 날짜 동안 동일하게 적용합니다. 중단된 일정은 남은 날짜만 진행합니다. 선택만 바꾸거나 취소해도 날짜·행복도·연속 행동 기록은 바뀌지 않습니다.</p><h3>개인 훈련·방송·휴식</h3><p>개인 훈련은 선택 능력의 기본 경험치를 하루 +${TRAINING_RULES.dailyExperience} 얻습니다. 방송하기는 선수 한 명당 하루 ${ACTION_RULES.broadcastIncome}의 수입을 얻습니다. 휴식은 피로를 낮추고 행복도를 회복하지만, 연속 휴식이 길어지면 경험치가 감소합니다.</p><h3>팀 훈련</h3><p>주전 한 명이 팀 훈련을 고르면 주전 5명이 함께 참가하고 후보 행동은 유지됩니다. 경험치는 연습 종료 시 모드·승패·KDA에 따라 한 번 지급합니다. MR12가 가장 많은 기본 경험치를 줍니다.</p><h3>비용과 저장</h3><p>추가 훈련비는 없으며 기존 계약 주급은 유지됩니다. 실제 진행한 날짜만 반영하고, 변경 후 구단 저장을 눌러 보관하세요.</p></div>
  </dialog>
  <dialog id="training-help-growth" class="training-help-dialog" aria-labelledby="training-help-growth-title">
    <div class="roster-heading"><h2 id="training-help-growth-title">성장 설명</h2><form method="dialog"><button type="submit" class="button secondary" autofocus>닫기</button></form></div>
    <div class="training-help-content"><h3>경험치와 잠재력</h3><p>경험치 ${TRAINING_RULES.levelExperience}마다 해당 능력이 +1 오릅니다. 능력별 잠재력에 도달하면 더 오르지 않습니다. 표에서 기본 능력·잠재력·경험치와 경기 적용 능력을 확인할 수 있습니다.</p><h3>성장 속도와 훈련 보너스</h3><p>선수별 성장 속도는 ×0.8/×1/×1.2입니다. 개인 훈련은 기본 경험치에 성장 속도×코치×시설을 곱한 뒤 마지막에 한 번 반올림합니다. 팀 훈련은 성장 속도와 코치 보너스를 적용하며 시설 효과는 없습니다.</p><h3>경기에 적용되는 능력</h3><p>행복도 보정에 피로 보정을 합산하며 경기 적용 능력은 1~99입니다. 이 보정으로 기본 능력·영입 가격·성장 경험치가 바뀌지는 않습니다.</p></div>
  </dialog>
  <dialog id="training-help-happiness" class="training-help-dialog" aria-labelledby="training-help-happiness-title">
    <div class="roster-heading"><h2 id="training-help-happiness-title">행복도 설명</h2><form method="dialog"><button type="submit" class="button secondary" autofocus>닫기</button></form></div>
    <div class="training-help-content"><h3>훈련과 방송</h3><p>훈련 첫 주는 행복도 유지, 방송 첫 주는 +7입니다. 같은 행동은 2주째 -7, 3주째부터 매주 -14입니다. 개인 훈련 세 종류는 다른 행동으로 계산합니다.</p><h3>연속 휴식</h3><ul><li>첫 주: 행복도 +14</li><li>2주째: 행복도 +7, 세 능력 경험치 각각 -14</li><li>3주째부터: 행복도 유지, 각 경험치 -21</li></ul><p>실제 진행한 기간만 반영하며 경험치는 0 미만으로 줄지 않고 기본 능력치는 유지됩니다.</p><h3>경기 보정</h3><ul><li>행복도 90 이상 +3</li><li>75~89 +1</li><li>45~74 0</li><li>25~44 -2</li><li>24 이하 -4</li></ul></div>
  </dialog>
  <dialog id="training-help-fatigue" class="training-help-dialog" aria-labelledby="training-help-fatigue-title">
    <div class="roster-heading"><h2 id="training-help-fatigue-title">피로·컨디션 설명</h2><form method="dialog"><button type="submit" class="button secondary" autofocus>닫기</button></form></div>
    <div class="training-help-content"><h3>하루 피로 변화</h3><ul><li>개인 훈련 하루 +2</li><li>팀 훈련 +3</li><li>방송 +1</li><li>휴식 -5</li></ul><p>피로는 0~100이며 컨디션은 100에서 피로를 뺀 값입니다. 기본 체력 80 이상은 개인·팀 훈련 증가량이 하루 1 줄어듭니다. 실제 진행한 날짜만 반영합니다.</p><h3>경기 보정</h3><p>피로 25 이상 에임·지능 -1 / 50 이상 -3 / 75 이상 -5를 행복도 보정과 합산합니다. 새 팀 연습의 에임·지능에 적용하며 이미 시작한 경기의 능력은 바뀌지 않습니다.</p></div>
  </dialog>`;
}
