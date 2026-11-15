import { FINANCE_RULES } from '../config/finance.js';
import { bankruptcyIssue, BANKRUPTCY_LIMIT } from './bankruptcy.js';

export const LOAN_RULES = Object.freeze({ maximum: 10000, step: 1000, weeklyRate: 2, historyLimit: 20 });
export const createLoan = () => ({ principal: 0, history: [] });
export const weeklyInterest = loan => loan.principal * LOAN_RULES.weeklyRate / 100;
export function loanChangeIssue({ finance, day, weekDaysRemaining, playerEvents, teamTrainingPending }) {
  if ((day - finance.weeklyStartedDay) % FINANCE_RULES.periodDays !== 0 || weekDaysRemaining || playerEvents.week || teamTrainingPending) {
    return '진행 중인 일정·이벤트·팀 훈련을 마친 뒤 새 주 시작에 대출·상환하세요.';
  }
  return null;
}
export function changeLoan(world, kind, amount) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  const club = world.clubs.find(item => item.id === world.playerClubId), loan = club.finance.loan;
  if (!['borrow', 'repay'].includes(kind) || !Number.isSafeInteger(amount) || amount <= 0 || amount % LOAN_RULES.step !== 0) {
    return { ok: false, message: '대출·상환 금액은 $1,000 단위로 선택하세요.' };
  }
  const issue = loanChangeIssue({ ...world, ...club, teamTrainingPending: world.teamTraining?.status === 'pending' });
  if (issue) return { ok: false, message: issue };
  if (kind === 'borrow' && loan.principal + amount > LOAN_RULES.maximum) return { ok: false, message: '총 대출 원금은 $10,000을 넘을 수 없습니다.' };
  if (kind === 'repay' && (amount > loan.principal || amount > club.balance)) return { ok: false, message: '남은 원금과 보유 자금 안에서 상환하세요.' };
  const balance = BigInt(club.balance) + BigInt(kind === 'borrow' ? amount : -amount);
  if (balance > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, message: '대출금이 저장 가능한 자금 범위를 넘습니다.' };
  const principal = loan.principal + (kind === 'borrow' ? amount : -amount);
  club.balance = Number(balance);
  club.finance.loan = { principal, history: [...loan.history, { day: world.day, kind, amount, principal, balance: club.balance }].slice(-LOAN_RULES.historyLimit) };
  return { ok: true, message: `${kind === 'borrow' ? '대출' : '원금 상환'} $${amount.toLocaleString('en-US')} 완료 · 남은 원금 $${principal.toLocaleString('en-US')} · 주 이자 $${weeklyInterest({ principal })}` };
}
export function validateLoan(loan, day, cashStartedDay, weeklyStartedDay) {
  const validPrincipal = value => Number.isInteger(value) && value >= 0 && value <= LOAN_RULES.maximum && value % LOAN_RULES.step === 0;
  const fail = () => { throw new Error('대출 원금 또는 거래 내역이 올바르지 않습니다.'); };
  if (!loan || typeof loan !== 'object' || Array.isArray(loan) || !validPrincipal(loan.principal)
    || !Array.isArray(loan.history) || loan.history.length > LOAN_RULES.historyLimit) fail();
  let previous = null;
  const history = loan.history.map(entry => {
    if (!entry || !Number.isSafeInteger(entry.day) || entry.day < cashStartedDay || entry.day > day || (entry.day - weeklyStartedDay) % 7 !== 0 || previous && entry.day < previous.day
      || !['borrow', 'repay'].includes(entry.kind) || !Number.isInteger(entry.amount) || entry.amount < LOAN_RULES.step
      || entry.amount > LOAN_RULES.maximum || entry.amount % LOAN_RULES.step !== 0 || !validPrincipal(entry.principal)
      || !Number.isSafeInteger(entry.balance) || entry.balance <= BANKRUPTCY_LIMIT || entry.kind === 'repay' && entry.balance < 0) fail();
    const before = entry.principal + (entry.kind === 'borrow' ? -entry.amount : entry.amount);
    if (!validPrincipal(before) || previous && before !== previous.principal) fail();
    previous = entry;
    return { day: entry.day, kind: entry.kind, amount: entry.amount, principal: entry.principal, balance: entry.balance };
  });
  if (loan.principal !== (history.at(-1)?.principal ?? 0)) fail();
  if (history.length && history.length < LOAN_RULES.historyLimit && history[0].principal !== (history[0].kind === 'borrow' ? history[0].amount : -1)) fail();
  return { principal: loan.principal, history };
}
