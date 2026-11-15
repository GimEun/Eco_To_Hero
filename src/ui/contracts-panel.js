import { escapeHtml } from './html.js';
import { CONTRACT_RULES } from '../config/contracts.js';

export function contractsPanel(club) {
  const total = club.players.reduce((sum, player) => sum + club.contracts[player.id].monthlySalary / 4, 0);
  const expiring = club.players.filter(player => club.contracts[player.id].remainingDays <= 7).length;
  return `<section class="panel contracts-panel" aria-labelledby="contracts-title">
    <div class="roster-heading"><h2 id="contracts-title" tabindex="-1">선수 계약</h2><span class="tag muted-tag">주급 합계 $${total.toLocaleString('en-US')}</span></div>
    <p class="input-hint" data-description="계약 기간과 재계약">구단명 옆 1주 진행으로 내 팀 계약이 1주씩 줄고 만료 선수는 자유계약으로 전환됩니다. 만료 후 5명 미만이면 만료 직전에 멈추며 해결 후 남은 일정만 이어갑니다. 팀 연습·현실 시간에는 날짜가 흐르지 않습니다. 내 팀 급여는 구단 재정에서 매주 정산합니다. AI 구단 계약 감소·급여 정산은 아직 적용하지 않습니다. 재계약은 추가 계약금 없이 남은 계약을 선택 기간으로 갱신하며 주급 조건은 유지합니다. 기존 계약은 남은 기간을 주 단위로 올림해 보존합니다.</p>
    ${expiring ? `<p class="info-note" role="status">이번 주 진행 중 ${expiring}명 계약 만료 예정 · 재계약 또는 추가 영입으로 주전 5명을 유지하세요.</p>` : ''}
    <div class="table-scroll" role="region" aria-label="선수 계약" tabindex="0"><table class="contracts-table"><thead><tr><th scope="col">선수</th><th scope="col">약정 기간</th><th scope="col">남은 계약</th><th scope="col">주급</th><th scope="col">재계약</th></tr></thead><tbody>
      ${club.players.map(player => {
        const contract = club.contracts[player.id];
        return `<tr${contract.remainingDays <= 7 ? ' class="is-expiring"' : ''}><th scope="row">${escapeHtml(player.nickname)}</th><td data-label="약정 기간">${Math.ceil(contract.durationDays / 7)}주</td><td data-label="남은 계약">${Math.ceil(contract.remainingDays / 7)}주${contract.remainingDays <= 7 ? ' · 만료 예정' : ''}</td><td data-label="주급">$${(contract.monthlySalary / 4).toLocaleString('en-US')}</td>
          <td data-label="재계약"><div class="roster-actions"><select data-contract-duration aria-label="${escapeHtml(player.nickname)} 재계약 기간">${CONTRACT_RULES.durations.map(days =>
            `<option value="${days}" ${days === (CONTRACT_RULES.durations.includes(contract.durationDays) ? contract.durationDays : CONTRACT_RULES.defaultDays) ? 'selected' : ''}>${days / 7}주</option>`).join('')}</select>
          <button class="button secondary" data-action="renew-contract" data-player-id="${escapeHtml(player.id)}">재계약</button></div></td></tr>`;
      }).join('')}
    </tbody></table></div>
    <p class="roster-footnote" data-description="주급과 계약 저장">주급은 영입 계약금의 10%를 $10 단위로 반올림한 금액의 1/4입니다. 재계약 후 구단 저장 또는 JSON 백업으로 보관하세요.</p>
  </section>`;
}
