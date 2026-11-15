import { LOAN_RULES, weeklyInterest, loanChangeIssue } from '../game/loans.js';
const money = value => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US')}`;
export function loansPanel(club) {
  const loan = club.finance.loan, issue = loanChangeIssue(club);
  return `<div class="sponsor-contracts"><h3>대출·상환</h3><p>남은 원금 <strong>${money(loan.principal)}</strong> · 추가 대출 가능 ${money(LOAN_RULES.maximum - loan.principal)} · 예상 주 이자 ${money(weeklyInterest(loan))}</p>
    <div class="roster-actions"><label>금액 <select id="loan-amount" aria-label="대출·상환 금액">${Array.from({ length: 10 }, (_, i) => (i + 1) * 1000).map(amount => `<option value="${amount}">${money(amount)}</option>`).join('')}</select></label>
    <button class="button primary" data-action="borrow-loan" ${issue || loan.principal === 10000 ? 'disabled' : ''}>대출받기</button><button class="button secondary" data-action="repay-loan" ${issue || !loan.principal || club.balance < 1000 ? 'disabled' : ''}>선택 금액 상환</button><button class="button secondary" data-action="repay-all-loan" ${issue || !loan.principal || club.balance < loan.principal ? 'disabled' : ''}>전액 상환</button></div>
    ${issue ? `<p role="status">${issue}</p>` : ''}<p data-description="대출과 상환 규칙">새 주 시작에 대출·상환할 수 있습니다. 한도 $10,000 · $1,000 단위 · 주 이자 2% · 수수료/상환 기한 없음. 원금은 직접 상환하며 이자는 실제 진행한 기간만 누적해 주간 정산합니다. 마이너스 자금에는 별도 이자를 붙이지 않습니다.</p>
    <p data-description="대출과 구단 해체">운영 자금이 -$10,000 이하가 되면 즉시 구단 해체로 게임이 종료됩니다. 그 뒤에는 대출로 회복할 수 없습니다.</p>
    <details><summary>최근 대출·상환 내역 (${loan.history.length}건)</summary>${loan.history.length ? `<ol>${[...loan.history].reverse().map(entry => `<li>${Math.floor((entry.day - 1) / 7) + 1}주 차 · ${entry.kind === 'borrow' ? '대출' : '상환'} ${money(entry.amount)} · 남은 원금 ${money(entry.principal)} · 자금 ${money(entry.balance)}</li>`).join('')}</ol>` : '<p>아직 거래 내역이 없습니다.</p>'}</details></div>`;
}
