import { FINANCE_RULES } from '../config/finance.js';
import { mountTabs } from './club-tabs.js';
import { sponsorIncome } from '../game/sponsors.js';
import { sponsorsPanel, sponsorReceipt } from './sponsors-panel.js';
import { coachRule } from '../game/coaches.js';
import { facilityMaintenance } from '../game/facilities.js';
import { weeklyInterest } from '../game/loans.js';
import { loansPanel } from './loans-panel.js';
import { stocksPanel } from './stocks-panel.js';

const money = amount => `${amount < 0 ? '-' : ''}$${Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const costBreakdown = entry => [['코치', entry.coachSalary], ['시설 유지비', entry.facilityMaintenance], ['대출 이자', entry.loanInterest]]
  .filter(([, amount]) => amount).map(([label, amount]) => `<br><small>${label} ${money(amount)}</small>`).join('');

const sections = [['sponsors', '스폰서 계약'], ['loans', '대출 상환'], ['stocks', '주식 투자'], ['settlements', '최근 정산 내역']];

export function financePanel(club, selectedSection = 'sponsors') {
  const active = sections.some(([id]) => id === selectedSection) ? selectedSection : 'sponsors';
  const section = (id, markup) => `<div id="finance-section-${id}" class="finance-section" role="tabpanel" aria-labelledby="finance-tab-${id}" data-finance-section="${id}"${id === active ? '' : ' hidden'}>${markup}</div>`;
  const finance = club.finance;
  const elapsed = club.day - finance.weeklyStartedDay;
  const daysLeft = FINANCE_RULES.periodDays - elapsed % FINANCE_RULES.periodDays;
  const monthlySalary = Object.values(club.contracts).reduce((sum, contract) => sum + contract.monthlySalary, 0);
  const coachSalary = coachRule(club.coach)?.weeklySalary ?? 0;
  const maintenance = facilityMaintenance(club.facilities);
  const interest = weeklyInterest(finance.loan);
  const sponsor = finance.sponsor;
  return `<section class="panel finance-panel" aria-labelledby="finance-title">
    <div class="finance-overview">
    <div class="roster-heading"><h2 id="finance-title" tabindex="-1">구단 재정</h2><span class="tag muted-tag">게임 ${Math.floor((club.day - 1) / 7) + 1}주 차</span></div>
    <div class="world-summary"><span class="tag">운영 자금 ${money(club.balance)}</span><span class="tag muted-tag">누적 비용 ${money(finance.accruedUnits / FINANCE_RULES.salaryUnitDivisor)}</span><span class="tag muted-tag">대출 원금 ${money(finance.loan.principal)}</span></div>
    <div class="finance-settlement-summary" aria-label="다음 정산 예상 수입과 주간 비용">
      <dl class="finance-summary-main">
        <div><dt>다음 정산</dt><dd>${Math.floor((club.day + daysLeft - 1) / 7) + 1}주 차 <small>${Math.ceil(daysLeft / 7)}주 이내</small></dd></div>
        <div class="finance-summary-income"><dt>스폰서 수입 <small>현재 실적 기준</small></dt><dd>${money(sponsorIncome(sponsor))}</dd></div>
        <div class="finance-summary-total"><dt>주간 총 비용</dt><dd>${money(monthlySalary / 4 + coachSalary + maintenance + interest)}</dd></div>
      </dl>
      <dl class="finance-summary-costs" aria-label="주간 비용 내역">
        <div><dt>현재 명단 주급 합계</dt><dd>${money(monthlySalary / 4)}</dd></div>
        <div><dt>코치 주급</dt><dd>${money(coachSalary)}</dd></div>
        <div><dt>시설 유지비</dt><dd>${money(maintenance)}</dd></div>
        <div><dt>대출 이자</dt><dd>${money(interest)}</dd></div>
      </dl>
    </div>
    </div>
    <div class="finance-section-tabs" role="tablist" aria-label="재정 항목">${sections.map(([id, label]) => `<button type="button" class="button secondary" role="tab" id="finance-tab-${id}" data-finance-tab="${id}" aria-controls="finance-section-${id}" aria-selected="${id === active}" tabindex="${id === active ? 0 : -1}">${label}</button>`).join('')}</div>
    <div class="finance-section-body">
    ${section('sponsors', sponsorsPanel(club))}
    ${section('loans', loansPanel(club))}
    ${section('stocks', stocksPanel(club))}
    ${section('settlements', `
    <p class="input-hint" data-description="주간 정산 규칙">매주 스폰서 수입을 받은 뒤 급여·유지비·대출 이자를 전액 차감합니다. 자금이 부족해도 음수로 내려가며 -$10,000 이하이면 구단 해체로 종료됩니다. 선택적인 유료 지출은 보유 자금 안에서만 가능합니다. 이자는 대출 원금에만 적용하며 마이너스 자금 자체에는 추가 이자를 붙이지 않습니다. 비용은 실제 진행 기간만 누적하고 $1 미만은 다음 주로 이월합니다. 과거 미지급 기록은 이전 방식의 정산 내역입니다.</p>
    <h3 class="settlement-heading">최근 정산 내역</h3>
    ${finance.settlements.length ? `<div class="table-scroll settlement-history" role="region" aria-label="최근 정산 내역" tabindex="0"><table class="settlement-table"><thead><tr><th scope="col">정산 주차</th><th scope="col">스폰서·실적</th><th scope="col">스폰서 수입</th><th scope="col">발생 비용</th><th scope="col">미지급분 지급</th><th scope="col">이번 비용 지급</th><th scope="col">남은 미지급</th><th scope="col">정산 후 자금</th></tr></thead><tbody>${[...finance.settlements].reverse().map(entry => `<tr><th scope="row">${Math.floor((entry.day - 1) / 7) + 1}주 차${entry.day <= finance.weeklyStartedDay && finance.startedDay !== finance.weeklyStartedDay ? ' · 이전 정산' : ''}</th><td data-label="스폰서·실적">${sponsorReceipt(entry)}</td><td data-label="스폰서 수입">${money(entry.income)}</td><td data-label="발생 비용">${money(entry.wagesDue)}${costBreakdown(entry)}</td><td data-label="미지급분 지급">${money(entry.paidArrears)}</td><td data-label="이번 비용 지급">${money(entry.paidWages)}</td><td data-label="남은 미지급">${money(entry.arrears)}</td><td data-label="정산 후 자금">${money(entry.balance)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="info-note">아직 정산 내역이 없습니다. 1주가 지나면 첫 정산을 합니다.</p>'}
    <p class="roster-footnote" data-description="정산 기록 보관">주간 정산 시작 ${Math.floor((finance.weeklyStartedDay - 1) / 7) + 1}주 차 · 과거 급여 소급 없음 · 최근 ${FINANCE_RULES.historyLimit}회 정산 보관 · 변경 후 구단 저장으로 보관하세요.</p>
    `)}</div>
  </section>`;
}

export function mountFinanceSections(screen, onChange = () => {}) {
  mountTabs(screen, '[data-finance-tab]', button => {
    const body = screen.querySelector('.finance-section-body');
    if (body) body.scrollTop = 0;
    onChange(button.dataset.financeTab);
  });
}
