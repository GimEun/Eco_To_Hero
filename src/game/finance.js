import { FINANCE_RULES } from '../config/finance.js';
import { createSponsor, sponsorIncome, validateSponsor, isSeasonSponsor, SPONSOR_RULES } from './sponsors.js';
import { coachRule, COACHES } from './coaches.js';
import { facilityMaintenance, FACILITY_LEVELS } from './facilities.js';
import { createLoan, validateLoan, weeklyInterest, LOAN_RULES } from './loans.js';

const maximumMaintenance = FACILITY_LEVELS.at(-1).maintenance * 3;

export function createFinance(day = 1) {
  return { startedDay: day, weeklyStartedDay: day, cashStartedDay: day, accruedUnits: 0, facilityAccruedUnits: 0, arrears: 0, settlements: [], sponsor: createSponsor(), loan: createLoan() };
}

// 1/420달러 단위로 기존 1/30 급여와 새 1/28 급여를 반올림 손실 없이 함께 보관한다.
export function prepareDayFinance(world, club, actionIncome = 0, broadcasting = 0) {
  const finance = club.finance;
  let accruedUnits = BigInt(finance.accruedUnits);
  for (const id of club.playerIds) accruedUnits += BigInt(club.contracts[id].monthlySalary) * BigInt(FINANCE_RULES.dailySalaryUnits);
  const coachSalary = coachRule(club.coach)?.weeklySalary ?? 0;
  const maintenance = facilityMaintenance(club.facilities);
  let facilityAccruedUnits = BigInt(finance.facilityAccruedUnits ?? 0) + BigInt(maintenance) * BigInt(FINANCE_RULES.salaryUnitDivisor / FINANCE_RULES.periodDays);
  const interest = weeklyInterest(finance.loan);
  accruedUnits += BigInt(coachSalary + maintenance + interest) * BigInt(FINANCE_RULES.salaryUnitDivisor / FINANCE_RULES.periodDays);
  let cash = BigInt(club.balance) + BigInt(actionIncome);
  const nextDay = world.day + 1;
  const payday = (nextDay - finance.weeklyStartedDay) % FINANCE_RULES.periodDays === 0;
  let settlement = null;
  let sponsor = { ...finance.sponsor };
  if (sponsor.kind === 'broadcast') sponsor.broadcastDays += broadcasting;
  if (payday) {
    const income = sponsorIncome(sponsor);
    cash += BigInt(income);
    const wagesDue = accruedUnits / BigInt(FINANCE_RULES.salaryUnitDivisor);
    accruedUnits %= BigInt(FINANCE_RULES.salaryUnitDivisor);
    cash -= wagesDue;
    settlement = { day: nextDay, income, wagesDue, paidArrears: 0, paidWages: wagesDue, arrears: 0, balance: cash, sponsorKind: sponsor.kind, broadcastDays: sponsor.broadcastDays };
    if (sponsor.broadcastCompleted) settlement.broadcastCompleted = true;
    if (interest) { settlement.loanInterest = interest; settlement.loanPrincipal = finance.loan.principal; }
    if (coachSalary) settlement.coachSalary = coachSalary;
    const actualMaintenance = facilityAccruedUnits / BigInt(FINANCE_RULES.salaryUnitDivisor);
    facilityAccruedUnits %= BigInt(FINANCE_RULES.salaryUnitDivisor);
    if (actualMaintenance) settlement.facilityMaintenance = Number(actualMaintenance);
    if (isSeasonSponsor(sponsor)) settlement.sponsorContract = { ...sponsor };
    sponsor = isSeasonSponsor(sponsor) ? sponsor : sponsor.kind === 'broadcast' && sponsor.remainingWeeks > 1
      ? { kind: 'broadcast', remainingWeeks: sponsor.remainingWeeks - 1, broadcastDays: 0 } : createSponsor();
  }
  const amounts = [accruedUnits, ...Object.entries(settlement ?? {}).filter(([key, value]) => key !== 'balance' && typeof value === 'bigint').map(([, value]) => value)];
  if (cash < BigInt(Number.MIN_SAFE_INTEGER) || cash > BigInt(Number.MAX_SAFE_INTEGER) || amounts.some(value => value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))) {
    return { ok: false, message: '재정 금액이 저장 가능한 범위를 넘어 날짜를 진행할 수 없습니다. 기존 상태는 유지됩니다.' };
  }
  if (settlement) settlement = Object.fromEntries(Object.entries(settlement).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]));
  return {
    ok: true, balance: Number(cash), settlement,
    finance: { ...finance, accruedUnits: Number(accruedUnits), facilityAccruedUnits: Number(facilityAccruedUnits), arrears: 0, sponsor,
      settlements: settlement ? [...finance.settlements, settlement].slice(-FINANCE_RULES.historyLimit) : [...finance.settlements] },
  };
}

export function validateFinance(finance, day, { legacyWeekly = false, legacySponsor = false, legacyCoach = false, legacyFacilities = false, legacyCash = false, facilities = null } = {}) {
  const safe = value => Number.isSafeInteger(value) && value >= 0;
  const fail = () => { throw new Error('구단 재정 정보가 올바르지 않습니다.'); };
  if (!finance || typeof finance !== 'object' || Array.isArray(finance)
    || !safe(finance.startedDay) || finance.startedDay < 1 || finance.startedDay > day
    || !safe(finance.accruedUnits) || !safe(finance.arrears) || !Array.isArray(finance.settlements)) fail();
  const weeklyStartedDay = legacyWeekly ? day : finance.weeklyStartedDay;
  if (!Number.isSafeInteger(weeklyStartedDay) || weeklyStartedDay < finance.startedDay || weeklyStartedDay > day) fail();
  const cashStartedDay = legacyCash ? day : finance.cashStartedDay;
  if (!Number.isSafeInteger(cashStartedDay) || cashStartedDay < weeklyStartedDay || cashStartedDay > day || !legacyCash && finance.arrears !== 0) fail();
  const loan = legacyCash ? createLoan() : validateLoan(finance.loan, day, cashStartedDay, weeklyStartedDay);
  const oldCycles = Math.floor((weeklyStartedDay - finance.startedDay) / 30);
  const sponsor = legacySponsor ? createSponsor() : validateSponsor(finance.sponsor, day, weeklyStartedDay);
  const newCycles = legacyWeekly ? 0 : Math.floor((day - weeklyStartedDay) / FINANCE_RULES.periodDays);
  const cycles = oldCycles + newCycles;
  if (legacyWeekly ? (day - finance.startedDay) % 30 === 0 && finance.accruedUnits >= 30
    : day > weeklyStartedDay && (day - weeklyStartedDay) % FINANCE_RULES.periodDays === 0 && finance.accruedUnits >= FINANCE_RULES.salaryUnitDivisor) fail();
  if (day === finance.startedDay && finance.accruedUnits !== 0) fail();
  if (finance.settlements.length !== Math.min(cycles, FINANCE_RULES.historyLimit)) fail();
  const keys = ['day', 'income', 'wagesDue', 'paidArrears', 'paidWages', 'arrears', 'balance'];
  const settlements = finance.settlements.map((entry, index) => {
    const cycle = cycles - finance.settlements.length + index + 1;
    const old = cycle <= oldCycles;
    const expectedDay = old ? finance.startedDay + cycle * 30 : weeklyStartedDay + (cycle - oldCycles) * FINANCE_RULES.periodDays;
    const sponsorKind = legacySponsor ? old ? 'legacy' : 'basic' : entry?.sponsorKind;
    const broadcastDays = legacySponsor ? 0 : entry?.broadcastDays;
    const broadcastCompleted = entry?.broadcastCompleted;
    const coachSalary = legacyCoach ? 0 : entry?.coachSalary ?? 0;
    const maintenance = legacyFacilities ? 0 : entry?.facilityMaintenance ?? 0;
    const cashMode = !legacyCash && expectedDay > cashStartedDay;
    const loanInterest = cashMode ? entry?.loanInterest ?? 0 : 0;
    const loanPrincipal = cashMode ? entry?.loanPrincipal ?? 0 : 0;
    if (!Number.isInteger(loanPrincipal) || loanPrincipal < 0 || loanPrincipal > LOAN_RULES.maximum || loanPrincipal % LOAN_RULES.step !== 0
      || loanInterest !== weeklyInterest({ principal: loanPrincipal })) fail();
    const priorLoan = loan.history.filter(entry => entry.day < expectedDay).at(-1);
    if (cashMode && (priorLoan || loan.history.length < LOAN_RULES.historyLimit) && loanPrincipal !== (priorLoan?.principal ?? 0)) fail();
    if (!safe(maintenance) || maintenance > maximumMaintenance || old && maintenance !== 0) fail();
    if (![0, ...Object.values(COACHES).map(coach => coach.weeklySalary)].includes(coachSalary) || old && coachSalary !== 0) fail();
    const seasonContract = ['wins', 'appearances'].includes(sponsorKind) ? validateSponsor(entry.sponsorContract, entry.day, weeklyStartedDay) : null;
    if (!Number.isInteger(broadcastDays) || broadcastDays < 0 || broadcastDays > 56
      || broadcastCompleted !== undefined && (broadcastCompleted !== true || old || sponsorKind !== 'broadcast' || broadcastDays < SPONSOR_RULES.preparedBroadcastDays)
      || (old ? sponsorKind !== 'legacy' || broadcastDays !== 0
        : !['basic', 'broadcast', 'wins', 'appearances'].includes(sponsorKind) || sponsorKind !== 'broadcast' && broadcastDays !== 0)) fail();
    if (seasonContract && seasonContract.kind !== sponsorKind) fail();
    const expectedIncome = old ? 5000 : sponsorIncome(seasonContract ?? { kind: sponsorKind, broadcastDays, broadcastCompleted });
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || keys.some(key => key === 'balance' && cashMode ? !Number.isSafeInteger(entry[key]) : !safe(entry[key]))
      || entry.day !== expectedDay || entry.income !== expectedIncome || entry.paidWages > entry.wagesDue || coachSalary + maintenance + loanInterest > entry.wagesDue) fail();
    const previous = index > 0 ? finance.settlements[index - 1].arrears : cycle === 1 ? 0 : null;
    if (cashMode ? entry.paidWages !== entry.wagesDue || entry.paidArrears !== 0 || entry.arrears !== 0 : previous !== null && (entry.paidArrears > previous
      || BigInt(entry.arrears) !== BigInt(previous) - BigInt(entry.paidArrears) + BigInt(entry.wagesDue) - BigInt(entry.paidWages)
      || (entry.paidArrears < previous && entry.paidWages > 0))) fail();
    return { ...Object.fromEntries(keys.map(key => [key, entry[key]])), sponsorKind, broadcastDays, ...(broadcastCompleted ? { broadcastCompleted: true } : {}), ...(loanInterest ? { loanInterest, loanPrincipal } : {}), ...(coachSalary ? { coachSalary } : {}), ...(maintenance ? { facilityMaintenance: maintenance } : {}), ...(seasonContract ? { sponsorContract: seasonContract } : {}) };
  });
  if (legacyCash && finance.arrears !== (settlements.at(-1)?.arrears ?? 0)) fail();
  const units = BigInt(finance.accruedUnits) * (legacyWeekly ? 14n : 1n);
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  // 가격 인상 전 저장의 진행 중인 주는 기존 요율로 발생한 유지비만 보충한다.
  const oldRates = [0, 50, 100, 200];
  const oldMaintenance = legacyFacilities || !facilities ? 0 : Object.values(facilities).reduce((sum, level) => sum + oldRates[level], 0);
  const facilityAccruedUnits = finance.facilityAccruedUnits === undefined
    ? oldMaintenance * ((day - weeklyStartedDay) % FINANCE_RULES.periodDays) * (FINANCE_RULES.salaryUnitDivisor / FINANCE_RULES.periodDays)
    : finance.facilityAccruedUnits;
  if (!safe(facilityAccruedUnits) || facilityAccruedUnits > maximumMaintenance * FINANCE_RULES.salaryUnitDivisor) fail();
  return { startedDay: finance.startedDay, weeklyStartedDay, cashStartedDay, accruedUnits: Number(units), facilityAccruedUnits, arrears: 0, settlements, sponsor, loan };
}
