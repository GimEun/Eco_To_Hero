import { WEAPONS, BODY_ARMOR, weaponFor } from '../data/weapons.js';
import { THROWABLES } from '../data/throwables.js';
import { EQUIPMENT_IMAGES } from '../data/equipment-images.js';
import { escapeHtml } from './html.js';

const money = value => `$${value.toLocaleString('en-US')}`;
const equipmentImage = id => `<img class="equipment-image" src="${escapeHtml(EQUIPMENT_IMAGES[id])}" alt="" width="120" height="48" decoding="async" draggable="false" />`;
const reasons = { purchase: '무기 구매', 'weapon-refund': '이번 구매 무기 환불', 'armor-purchase': '방탄복 구매', 'utility-purchase': '투척물 구매', kill: '처치 보상', plant: '설치 보상', win: '승리 보상', loss: '패배 보상', 'halftime-reset': '후반전 자금 초기화', 'overtime-reset': '연장 자금 초기화' };

export function economyPanel() {
  return `<section class="panel economy-panel" aria-label="장비 구매와 보상">
    <div class="roster-heading"><h2>장비 구매</h2><span class="economy-phase tag muted-tag"></span></div>
    <div class="equipment-players" role="group" aria-label="장비를 구매할 내 팀 선수"></div>
    <div class="equipment-shop"></div>
    <p class="economy-message" role="status" aria-live="polite"></p>
    <details class="economy-help" data-description="장비 구매·보상·무기 성능"><summary>구매 규칙·보상·무기 성능</summary><p class="economy-rules">선수별 $800 시작 · 상한 $16,000. 처치 +$300 · 승리 +$3,250 · 패배 +$1,400 · 설치 시 공격팀 각 +$800. 상대도 같은 가격과 예산으로 무기·방탄복을 자동 구매합니다.</p>
    <div class="table-scroll" role="region" aria-label="무기 성능" tabindex="0"><table class="weapon-stats-table"><thead><tr><th scope="col">무기</th><th scope="col">가격</th><th scope="col">피해</th><th scope="col">탄창</th><th scope="col">발사 간격</th><th scope="col">재장전</th></tr></thead><tbody>${WEAPONS.map(weapon => `<tr><th scope="row">${weapon.name}</th><td>${money(weapon.price)}</td><td>${weapon.id === 'shotgun' ? '16~80 · 거리에 따라 감소' : weapon.damage}</td><td>${weapon.magazineSize}</td><td>${(weapon.intervalTicks * 0.05).toFixed(2)}초</td><td>${(weapon.reloadTicks * 0.05).toFixed(1)}초</td></tr>`).join('')}</tbody></table></div>
    <p class="economy-rules">기관단총은 이동 사격에 유리하며 기관총·저격소총은 이동 중 명중률이 크게 낮아집니다. 저격소총도 시야·벽·명중 판정을 따릅니다. 방탄복 $650 · 내구도 100 · 총탄 피해 25% 감소, 막은 피해만큼 내구도를 소모합니다. 손상된 방탄복은 $650에 새로 구매할 수 있습니다.</p>
    <p class="economy-rules">섬광탄 $200 · 최대 2초 탐지 거리·명중률 저하. 수류탄 $300 · 중심 최대 50 피해, 거리별 감소·방탄복 적용. 연막탄 $300 · 12초 시야 차단. 종류별 1개씩 보유하며 선수들이 감지한 적에 맞춰 자동 투척합니다. 아군도 영향을 받고 벽 너머에는 섬광·폭발 피해가 전달되지 않습니다. 미사용 투척물은 생존 시 유지하고 사망·진영 교대 자금 초기화 시 소멸합니다.</p>
    <p class="economy-rules">이번 구매 단계에서 산 무기는 시작 전 교체 시 구매액을 환불합니다. 이전 라운드에서 가져온 무기는 환불하지 않습니다. 무료 권총을 선택하면 이번 구매 무기를 취소할 수 있습니다. 생존자의 무기·남은 방탄복은 유지하고 사망자는 권총·방탄복 없음으로 복귀합니다. HP·탄약은 회복합니다. 경기 자금은 구단 운영 자금과 별개이며 이 연습 화면을 나가거나 초기화하면 사라집니다.</p>
    <p class="economy-rules match-reset-note">MR12에서는 후반전 시작 시 $800·권총·방탄복 없음, 연장 시작과 3라운드마다 $10,000·권총·방탄복 없음으로 전원 초기화합니다.</p></details>
    <p class="economy-rules">무기별 이동 속도: ${WEAPONS.map(weapon => `${weapon.name} ${Math.round(weapon.moveMultiplier * 100)}%`).join(' · ')}. 돌격소총 100% 기준입니다.</p>
    <details class="economy-ledger"><summary>내 팀 최근 자금 내역</summary><ol></ol></details>
  </section>`;
}

export function renderEconomy(panel, state, selectedActorId = 'home-1') {
  panel.hidden = !state.economy;
  if (!state.economy) return;
  panel.querySelector('.match-reset-note').hidden = !state.match;
  const economy = state.economy;
  const buying = economy.phase === 'buy';
  const phase = { buy: '구매 준비', combat: '진행 중 · 구매 마감', ended: '보상 정산 완료' };
  panel.querySelector('.economy-phase').textContent = `연습 ${economy.roundNumber}라운드 · ${phase[economy.phase]}`;
  const players = state.actors.filter(actor => actor.team === 'home');
  const selected = players.find(actor => actor.id === selectedActorId) ?? players[0];
  panel.querySelector('.equipment-players').innerHTML = players.map(actor => `<button type="button" class="equipment-player" data-equipment-actor="${actor.id}" aria-pressed="${actor === selected}" title="${escapeHtml(actor.nickname)} · ${money(actor.cash)} · ${weaponFor(actor).name}"><strong>${actor.number} · ${escapeHtml(actor.nickname)}</strong><span>${money(actor.cash)}</span><small>${weaponFor(actor).name}${actor.alive ? '' : ' · 사망'}</small></button>`).join('');
  const refund = selected.weaponPurchaseCost ?? 0;
  const canBuy = buying && selected.alive;
  const cards = WEAPONS.map(weapon => {
    const owned = selected.weaponId === weapon.id;
    const affordable = selected.cash + refund >= weapon.price;
    const label = owned ? '보유 중' : !buying ? '구매 마감' : !selected.alive ? '사망' : !affordable ? '자금 부족' : refund ? '교체·환불' : '구매';
    return `<button type="button" class="equipment-weapon${owned ? ' is-owned' : ''}" data-buy="${selected.id}" data-equipment="${weapon.id}" ${!canBuy || owned || !affordable ? 'disabled' : ''}>${equipmentImage(weapon.id)}<strong>${weapon.name}</strong><span>${money(weapon.price)}</span><small>이동 ${Math.round(weapon.moveMultiplier * 100)}% · 사거리 ${weapon.range}</small><small>${label}</small></button>`;
  }).join('');
  const utilities = THROWABLES.map(item => {
    const owned = Boolean(selected.throwables?.[item.id]);
    return `<button type="button" class="button secondary equipment-utility${owned ? ' is-owned' : ''}" data-buy="${selected.id}" data-equipment="${item.id}" ${!canBuy || owned || selected.cash < item.price ? 'disabled' : ''}>${equipmentImage(item.id)}<strong>${item.name}</strong><small>${money(item.price)}${owned ? ' · 보유' : selected.cash < item.price ? ' · 부족' : ''}</small></button>`;
  }).join('');
  panel.querySelector('.equipment-shop').innerHTML = `<div class="equipment-summary"><strong>${escapeHtml(selected.nickname)}</strong><span>방탄복 ${selected.armor ?? 0}/100${refund ? ` · 환불 가능 ${money(refund)}` : ''}</span></div><div class="equipment-weapons" role="group" aria-label="${escapeHtml(selected.nickname)} 무기 구매">${cards}</div><div class="equipment-extras" role="group" aria-label="방탄복·투척물 구매"><button type="button" class="button secondary equipment-armor${selected.armor > 0 ? ' is-owned' : ''}" data-buy="${selected.id}" data-equipment="armor" ${!canBuy || selected.armor >= BODY_ARMOR.durability || selected.cash < BODY_ARMOR.price ? 'disabled' : ''}>${equipmentImage('armor')}<strong>방탄복</strong><small>${money(BODY_ARMOR.price)}${selected.armor >= BODY_ARMOR.durability ? ' · 보유' : selected.armor > 0 ? ' · 교체' : ''}</small></button>${utilities}</div>`;
  panel.querySelector('.economy-ledger ol').innerHTML = economy.ledger.filter(entry => players.some(actor => actor.id === entry.actorId)).slice(-15).reverse().map(entry => {
    const actor = state.actors.find(item => item.id === entry.actorId);
    return `<li>${entry.roundNumber}R · ${escapeHtml(actor.nickname)} · ${reasons[entry.reason]} · ${entry.amount >= 0 ? '+' : '−'}${money(Math.abs(entry.amount))}${entry.amount !== entry.requested ? ' (상한 적용)' : ''} → ${money(entry.balance)}</li>`;
  }).join('') || '<li>구매·보상 발생 시 내역이 표시됩니다.</li>';
}
