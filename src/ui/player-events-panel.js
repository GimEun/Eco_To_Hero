import { findPlayerEvent } from '../data/player-events.js';
import { TRAINING_LABELS } from '../config/training.js';
import { escapeHtml } from './html.js';
import { trainingLimit } from '../game/player-development.js';

const signed = value => `${value > 0 ? '+' : ''}${value}`;
const money = value => `$${Math.abs(value).toLocaleString('en-US')}`;
const skillName = skill => TRAINING_LABELS[skill].replace(' 훈련', '');

export function describeEventEffect(effect) {
  const cash = effect.cash < 0 ? `비용 ${money(effect.cash)}` : effect.cash > 0 ? `수입 ${money(effect.cash)}` : '무료';
  const ability = effect.skill ? `${skillName(effect.skill)} ${signed(effect.delta)} 확률 ${Math.round(effect.chance * 100)}% · 능력 변화 없음 ${Math.round((1 - effect.chance) * 100)}%` : '능력 변화 없음';
  return `${cash} · 행복도 ${signed(effect.happiness)} 확정 · ${ability}`;
}

export function playerEventsPanel(club) {
  const state = club.playerEvents;
  const pending = state.week?.event?.status === 'pending' ? state.week.event : null;
  const definition = pending ? findPlayerEvent(pending.eventId) : null;
  const player = pending ? club.players.find(player => player.id === pending.playerId) : null;
  const names = club.eventPlayerNames;
  return `<section class="panel player-events-panel" aria-labelledby="player-events-title">
    <div class="roster-heading"><h2 id="player-events-title">선수 이벤트</h2><span class="tag muted-tag">주당 60% · 최대 1건</span></div>
    <p class="input-hint" data-description="선수 이벤트 진행">주간 일정 중 선수 요청이 발생하면 진행을 멈춥니다. 비용·행복도·능력 변화 확률을 확인하고 선택하세요. 선택 후 남은 일정을 이어갑니다. 기본 능력과 영입 가격에도 결과를 반영합니다.</p>
    ${pending ? '<button class="button primary" data-action="open-player-event">이벤트 선택 계속하기</button>' : ''}
    <details><summary>최근 이벤트 결과 (${state.history.length}건)</summary>
    ${state.history.length ? `<ol class="player-event-history">${[...state.history].reverse().map(receipt => {
      const event = findPlayerEvent(receipt.eventId), effect = event[receipt.choice];
      const delta = effect.skill ? receipt.statAfter - receipt.statBefore : 0;
      return `<li><strong>${Math.floor((receipt.day - 1) / 7) + 1}주 차 · ${escapeHtml(names[receipt.playerId])} · ${escapeHtml(event.title)} · ${receipt.choice === 'accept' ? '수락' : '거절'}</strong><p>자금 ${signed(receipt.balanceDelta)} · 행복도 ${receipt.happinessBefore} → ${receipt.happinessAfter}</p>${delta ? `<div class="ability-changes"><span class="ability-change${delta < 0 ? ' is-down' : ''}">${skillName(effect.skill)} ${receipt.statBefore} → ${receipt.statAfter} (${signed(delta)})</span></div>` : '<small>능력 변화 없음</small>'}</li>`;
    }).join('')}</ol>` : '<p>아직 선택한 이벤트가 없습니다.</p><p data-description="이벤트 발생">이벤트는 매주 반드시 발생하지는 않습니다.</p>'}</details>
  </section>${pending ? `<dialog id="player-event-dialog" class="player-event-dialog" aria-labelledby="player-event-title">
    <h2 id="player-event-title">${escapeHtml(player.nickname)} · ${escapeHtml(definition.title)}</h2>
    <p data-description="선수 요청 내용">${escapeHtml(definition.description)}</p>
    <p>현재 행복도 ${player.morale.happiness} / 100 · 운영 자금 ${money(club.balance)}</p>
    <div class="player-event-choices">${['accept', 'decline'].map(choice => {
      const effect = definition[choice], insufficient = effect.cash < 0 && club.balance + effect.cash < 0;
      const capped = effect.skill && effect.delta > 0 && player[effect.skill] >= trainingLimit(player, effect.skill);
      return `<article><h3>${choice === 'accept' ? '수락' : '거절'}</h3><p>${describeEventEffect(effect)}${capped ? ' · 잠재력 도달로 실제 능력 상승 없음' : ''}</p><button class="button ${choice === 'accept' ? 'primary' : 'secondary'}" data-action="resolve-player-event" data-event-choice="${choice}" ${insufficient ? 'disabled' : ''}>${insufficient ? '자금 부족' : choice === 'accept' ? '수락하기' : '거절하기'}</button></article>`;
    }).join('')}</div>
    <p class="input-hint" data-description="이벤트 효과와 기록">행복도는 0~100, 기본 능력은 선수별 잠재력까지만 오릅니다. 한계에 도달하면 실제 변화량이 줄 수 있습니다. 능력 상승으로 잠재력에 도달하면 해당 잔여 경험치는 0이 됩니다. 선택 결과는 최근 이벤트에 남으며 같은 이벤트를 다시 적용할 수 없습니다.</p>
    <div class="weekly-action-buttons"><button class="button secondary" data-action="save">선택 전 저장</button><button class="button secondary" data-action="postpone-player-event">나중에 선택</button></div>
  </dialog>` : ''}`;
}
