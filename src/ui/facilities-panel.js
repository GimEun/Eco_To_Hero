import { TRAINING_SKILLS } from '../config/training.js';
import { FACILITY_NAMES, FACILITY_LEVELS, facilityChangeIssue, facilityMaintenance } from '../game/facilities.js';

const money = amount => `$${amount.toLocaleString('en-US')}`;
const skillNames = { aim: '에임', intelligence: '지능', stamina: '체력' };
export function facilitiesPanel(club) {
  const issue = facilityChangeIssue(club);
  return `<section class="panel facilities-panel" aria-labelledby="facilities-title"><div class="roster-heading"><h2 id="facilities-title" tabindex="-1">훈련 시설</h2><span class="tag">주간 유지비 ${money(facilityMaintenance(club.facilities))}</span></div>
    <div class="sponsor-contracts"><div class="sponsor-options">${TRAINING_SKILLS.map(skill => {
      const level = club.facilities[skill], current = FACILITY_LEVELS[level], next = FACILITY_LEVELS[level + 1];
      return `<article class="facility-card"><h3>${FACILITY_NAMES[skill]}</h3><p class="facility-effect">${level ? `${level}단계 · ${skillNames[skill]} 개인 훈련 경험치 +${current.bonus}%` : `미보유 · ${skillNames[skill]} 개인 훈련 경험치 보너스 없음`}</p><p>현재 주간 유지비 ${money(current.maintenance)}</p>
        ${next ? `<div class="facility-next"><strong>다음 ${level + 1}단계</strong><p>${skillNames[skill]} 개인 훈련 경험치 <b>+${next.bonus}%</b><br>현재보다 +${next.bonus - current.bonus}%p · 주 유지비 ${money(next.maintenance)}</p></div><button class="button primary" data-action="upgrade-facility" data-facility="${skill}" ${issue || club.balance < next.fee ? 'disabled' : ''}>${level ? '강화' : '구매'} · ${money(next.fee)}</button>` : '<button class="button" disabled>최대 3단계</button>'}
        <div class="table-scroll facility-levels" role="region" aria-label="${skillNames[skill]} 시설 단계별 비용" tabindex="0"><table class="facility-table"><caption>${skillNames[skill]} 훈련 시설 · 단계별 비용과 효과</caption><thead><tr><th scope="col">단계</th><th scope="col">구매·강화비</th><th scope="col">${skillNames[skill]} 경험치</th><th scope="col">주 유지비</th></tr></thead><tbody>${FACILITY_LEVELS.slice(1).map((tier, index) => `<tr${level === index + 1 ? ' class="is-current"' : ''}><th scope="row">${index + 1}단계${level === index + 1 ? '<small>현재</small>' : ''}</th><td>${money(tier.fee)}</td><td>+${tier.bonus}%</td><td>${money(tier.maintenance)}</td></tr>`).join('')}</tbody></table></div></article>`;
    }).join('')}</div>${issue ? `<p role="status">${issue}</p>` : ''}
      <div data-description="시설 이용 안내">
        <h3>구매·강화와 단계별 비용</h3>
        <p>새 주 시작에 시설을 구매·강화할 수 있습니다. 구매·강화비는 해당 단계로 올릴 때 한 번 지불합니다. 경험치 보너스와 유지비는 현재 단계 값으로 적용합니다.</p>
        <h3>훈련 효과</h3>
        <p>주전·후보의 해당 능력 개인 훈련에 적용합니다. 성장 속도·코치·시설 보너스를 곱한 뒤 마지막에 반올림하며 잠재력 상한은 유지합니다. 팀 훈련·휴식·방송·이벤트에는 시설 보너스를 적용하지 않습니다.</p>
        <h3>유지비와 저장</h3>
        <p>각 시설은 현재 단계의 유지비만 부담합니다. 유지비는 실제 진행한 기간만 누적하여 매주 급여와 함께 정산하고 부족분은 미지급금으로 이월합니다. 변경 후 구단 저장으로 보관하세요.</p>
      </div>
    </div></section>`;
}
