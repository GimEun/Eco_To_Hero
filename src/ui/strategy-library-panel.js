import { escapeHtml } from './html.js';
import { validateStrategyLibrary } from '../game/strategy-library.js';
import { captureStrategy, applyStrategy } from '../simulation/strategy-presets.js';
import { setSiteAllocation } from '../simulation/site-allocation.js';
import { canEditManual } from '../simulation/manual-tactics.js';

export function strategyLibraryPanel() {
  return `<fieldset class="strategy-library"><legend>맵별 전략 보관</legend><p class="input-hint">맵·공수별 3개 저장칸 · 주전 1~5번 자리 기준. 경유점·시선·연막·기간·자동 전술·A/B 배분을 구단 저장에 보관합니다. 구매 단계에서 직접 불러오세요.</p><div class="practice-controls"><label for="strategy-slot">저장칸</label><select id="strategy-slot"><option value="0">1 · 비어 있음</option><option value="1">2 · 비어 있음</option><option value="2">3 · 비어 있음</option></select><label for="strategy-name">전략 이름</label><input id="strategy-name" maxlength="40" autocomplete="off" /><button type="button" class="button secondary" data-library="save">보관함에 저장</button><button type="button" class="button secondary" data-library="load">불러오기</button></div><p class="strategy-library-message input-hint" role="status" aria-live="polite"></p></fieldset>`;
}

export function siteAllocationPanel() {
  return `<fieldset class="site-allocation"><legend>A/B 최초 배분</legend>${['attack', 'defense'].map(side => `<div class="practice-controls"><label for="allocation-${side}">${side === 'attack' ? '공격' : '수비'} 배분</label><select id="allocation-${side}"><option value="default">기존 자동 배치</option>${Array.from({ length: 6 }, (_, count) => `<option value="${count}">A ${count}명 / B ${5 - count}명</option>`).join('')}</select></div>`).join('')}<p class="input-hint">수동 경로 우선 · 공격 폭탄 담당은 목표 사이트에 배치합니다. 최초 배분 후 교전 지원·사이트 전환·해체는 상황에 따라 이동합니다.</p><p class="allocation-message input-hint" role="status"></p></fieldset>`;
}

export function mountStrategyLibrary(screen, world, { getState, getMap, getSide, commitDraft, refresh, onSave }) {
  const slot = screen.querySelector('#strategy-slot'), name = screen.querySelector('#strategy-name');
  const save = screen.querySelector('[data-library="save"]'), load = screen.querySelector('[data-library="load"]');
  const message = screen.querySelector('.strategy-library-message');
  const allocation = Object.fromEntries(['attack', 'defense'].map(side => [side, screen.querySelector(`#allocation-${side}`)]));
  let pending = false, context = '', disposed = false;
  function render() {
    const state = getState(), map = getMap(), side = getSide();
    const key = `${map.id}:${side}`;
    if (key !== context) { context = key; slot.value = '0'; name.value = ''; }
    const selected = Number(slot.value) || 0;
    const slots = world.strategyLibrary?.[map.id]?.[side] ?? [null, null, null];
    const markup = slots.map((preset, index) => `<option value="${index}">${index + 1} · ${escapeHtml(preset?.name ?? '비어 있음')}</option>`).join('');
    if (slot.innerHTML !== markup) { slot.innerHTML = markup; slot.value = String(selected); }
    const editable = state.round && canEditManual(state) && (!state.round.started || state.economy?.phase === 'buy');
    save.disabled = pending || !editable;
    load.disabled = pending || !editable || !slots[selected];
    slot.disabled = name.disabled = pending || !state.round;
    for (const [sideName, control] of Object.entries(allocation)) {
      control.value = String(state.siteAllocation?.home?.[sideName] ?? 'default');
      control.disabled = pending || !editable;
    }
  }
  const onSlot = () => { name.value = world.strategyLibrary?.[getMap().id]?.[getSide()]?.[Number(slot.value)]?.name ?? ''; render(); };
  const onSaveClick = async () => {
    if (save.disabled || pending) return;
    const state = getState(), map = getMap(), side = getSide(), index = Number(slot.value);
    if (!Number.isInteger(index) || index < 0 || index > 2) return;
    const label = name.value.trim() || `${map.name} ${side === 'attack' ? '공격' : '수비'} ${index + 1}`;
    if (label.length > 40) { message.textContent = '전략 이름은 40자 이내로 입력하세요.'; return; }
    if (!commitDraft()) { message.textContent = '현재 전략의 경유점·연막 설정을 먼저 확인하세요.'; return; }
    try {
      const library = structuredClone(world.strategyLibrary ?? {});
      library[map.id] ??= {};
      library[map.id][side] ??= [null, null, null];
      library[map.id][side][index] = captureStrategy(state, side, label);
      const checked = validateStrategyLibrary(library);
      pending = true; message.textContent = '전략을 구단 저장에 보관 중…'; render();
      await onSave(checked);
      world.strategyLibrary = checked;
      if (!disposed) { name.value = label; message.textContent = `${label} 보관 완료 · ${map.name} ${side === 'attack' ? '공격' : '수비'} ${index + 1}번`; }
    } catch (error) { if (!disposed) message.textContent = `보관 실패: ${error.message}`; }
    finally { pending = false; if (!disposed) render(); }
  };
  const onLoad = () => {
    if (load.disabled) return;
    const state = getState(), map = getMap(), side = getSide();
    const preset = world.strategyLibrary?.[map.id]?.[side]?.[Number(slot.value)];
    const result = applyStrategy(state, map, side, preset);
    message.textContent = result.message;
    if (result.ok) { name.value = preset.name; refresh(true); }
    render();
  };
  const handlers = Object.fromEntries(['attack', 'defense'].map(side => [side, () => {
    const value = allocation[side].value;
    const ok = setSiteAllocation(getState(), getMap(), side, value === 'default' ? null : Number(value));
    screen.querySelector('.allocation-message').textContent = ok ? '최초 배분 반영 완료 · 수동 경로와 이후 상황 대응은 우선합니다.' : '구매 단계에서 설정하세요. 공격 목표 사이트에는 폭탄 담당을 포함해 최소 1명이 필요합니다.';
    refresh(false); render();
  }]));
  slot.addEventListener('change', onSlot); save.addEventListener('click', onSaveClick); load.addEventListener('click', onLoad);
  for (const side of ['attack', 'defense']) allocation[side].addEventListener('change', handlers[side]);
  return { render, dispose() {
    disposed = true;
    slot.removeEventListener('change', onSlot); save.removeEventListener('click', onSaveClick); load.removeEventListener('click', onLoad);
    for (const side of ['attack', 'defense']) allocation[side].removeEventListener('change', handlers[side]);
  } };
}
