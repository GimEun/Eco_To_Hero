import { escapeHtml } from './html.js';
import { signingFee, recruitmentIssue } from '../game/roster.js';
import { ROSTER_RULES } from '../config/roster.js';
import { transferQuote, saleQuote } from '../game/transfers.js';
import { recruitmentWindowIssue } from '../game/season-calendar.js';

export function recruitmentPrice(world, player, affiliations) {
  const seller = affiliations.get(player.id);
  return seller && seller.id !== world.playerClubId ? transferQuote(world, player.id, affiliations).askingPrice : signingFee(player);
}

export function rosterActions(club, player, world = null) {
  const slot = club.lineupIds.indexOf(player.id);
  const id = escapeHtml(player.id);
  const alternatives = club.players.filter(other => slot >= 0 ? !club.lineupIds.includes(other.id) : club.lineupIds.includes(other.id));
  const replace = `<select data-lineup-target data-lineup-player="${id}" aria-label="${escapeHtml(player.nickname)} 주전·후보 선택">
    <option value="" selected>${slot >= 0 ? '주전' : '후보'}</option>
    ${alternatives.map(other => `<option value="${escapeHtml(other.id)}">${slot >= 0 ? '후보' : '주전'} · ${escapeHtml(other.nickname)}와 교체</option>`).join('')}
    ${!alternatives.length ? '<option disabled>후보 · 교체할 후보 없음</option>' : ''}
    </select>`;
  return `<div class="roster-actions">${replace}<button class="button secondary" data-action="release-player" data-player-id="${id}" ${club.players.length <= ROSTER_RULES.starters ? 'disabled' : ''}>방출</button></div>${world ? playerSale(world, player) : ''}`;
}

export function playerSale(world, player) {
  const quote = saleQuote(world, player.id);
  return `<details class="player-sale transfer-negotiation"><summary>선수 판매${quote.amount !== undefined ? ` · $${quote.amount.toLocaleString('en-US')}` : ''}${quote.remainingDays ? ` · 판매까지 ${Math.ceil(quote.remainingDays / 7)}주` : ''}</summary>
    ${quote.ok ? `<p>판매액 $${quote.amount.toLocaleString('en-US')}</p><p data-description="선수 판매 방식">수수료 없음 · 구매 가능한 구단에 자동 판매합니다.</p><div class="roster-actions"><button class="button secondary" data-action="sell-player" data-player-id="${escapeHtml(player.id)}" aria-label="${escapeHtml(player.nickname)} 판매하기">판매하기</button></div><p data-description="판매 후 명단 처리">상대 구단이 주전 편성과 방출을 결정합니다. 세계 리그 팀은 후보 최대 3명, 다른 AI 팀은 주전 5명만 유지합니다. 내 주전 판매 시 첫 후보가 자리를 채웁니다.</p>` : `<p>${escapeHtml(quote.message)}</p><button class="button secondary" disabled>판매 불가</button>`}
  </details>`;
}

export function recruitmentCell(world, player, affiliations) {
  const club = world.clubs.find(c => c.id === world.playerClubId);
  const affiliated = affiliations.get(player.id);
  if (affiliated?.id === club.id) return '내 팀 소속';
  const windowIssue = recruitmentWindowIssue(world);
  if (windowIssue) return '<div class="roster-actions"><button class="button secondary" disabled>시즌 중 영입 불가</button></div>';
  if (affiliated) {
    const quote = transferQuote(world, player.id, affiliations);
    const leagueIssue = recruitmentIssue(club, player);
    const full = club.playerIds.length >= ROSTER_RULES.maximum;
    const insufficient = quote.ok && club.balance < quote.offers[0].amount;
    return `<details class="transfer-negotiation"><summary>이적 협상 · $${quote.askingPrice.toLocaleString('en-US')}</summary>
      <p>다른 구단 소속 · 기준 이적료 $${quote.askingPrice.toLocaleString('en-US')} · 별도 계약금 없음</p>
      ${quote.ok ? `<div class="roster-actions"><select data-transfer-rate aria-label="${escapeHtml(player.nickname)} 이적 제안 금액">${quote.offers.map(offer => `<option value="${offer.rate}" ${offer.rate === 100 ? 'selected' : ''}>${offer.rate}% · $${offer.amount.toLocaleString('en-US')}</option>`).join('')}</select><button class="button secondary" data-action="negotiate-transfer" data-player-id="${escapeHtml(player.id)}" ${full || insufficient ? 'disabled' : ''}>${full ? '정원 초과' : insufficient ? '자금 부족' : '제안하기'}</button></div><p data-description="이적 제안 조건">기준 이상이면 수락합니다. 자금·후보 자리·대체 선수 확보가 필요합니다. 성사 시 후보·12주 계약으로 등록됩니다.</p>` : `${leagueIssue ? '' : `<p>${escapeHtml(quote.message)}</p>`}<button class="button secondary" disabled>${leagueIssue ? '영입 불가' : '협상 불가'}</button>`}
    </details>`;
  }
  const fee = signingFee(player);
  const issue = recruitmentIssue(club, player);
  const disabled = issue || club.playerIds.length >= ROSTER_RULES.maximum || club.balance < fee;
  return `<div class="roster-actions"><span>$${fee.toLocaleString('en-US')}</span><button class="button secondary" data-action="recruit-player" data-player-id="${escapeHtml(player.id)}" ${disabled ? 'disabled' : ''}>${issue ? '영입 불가' : club.playerIds.length >= ROSTER_RULES.maximum ? '정원 초과' : club.balance < fee ? '자금 부족' : '영입'}</button></div>`;
}

