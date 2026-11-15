import { bankruptcyIssue } from './bankruptcy.js';
import { CONTRACT_RULES } from '../config/contracts.js';
import { signingFee } from './player-costs.js';

export function createContract(player, durationDays = CONTRACT_RULES.defaultDays, acquiredDay = null) {
  if (!CONTRACT_RULES.durations.includes(durationDays)) throw new Error('계약기간은 4·12·24주 중 선택하세요.');
  return { durationDays, remainingDays: durationDays, monthlySalary: Math.round(signingFee(player) * CONTRACT_RULES.salaryRate / CONTRACT_RULES.salaryStep) * CONTRACT_RULES.salaryStep, acquiredDay };
}

export function validateContract(contract, { legacyTime = false, legacyWeekly = false, legacyHolding = false, day = 1 } = {}) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)
    || !(legacyWeekly ? [30, 90, 180] : [...CONTRACT_RULES.durations, 35, 91, 182]).includes(contract.durationDays)
    || !Number.isSafeInteger(contract.monthlySalary) || contract.monthlySalary < 0
    || contract.monthlySalary % CONTRACT_RULES.salaryStep !== 0) throw new Error('선수 계약기간 또는 급여가 올바르지 않습니다.');
  const remainingDays = legacyTime ? contract.durationDays : contract.remainingDays;
  if (!Number.isInteger(remainingDays) || remainingDays < 1 || remainingDays > contract.durationDays) throw new Error('계약 잔여 기간이 올바르지 않습니다.');
  const acquiredDay = legacyHolding ? null : contract.acquiredDay;
  if (acquiredDay !== null && (!Number.isSafeInteger(acquiredDay) || acquiredDay < 1 || acquiredDay > day)) throw new Error('선수 계약의 영입 날짜가 올바르지 않습니다.');
  return { durationDays: legacyWeekly ? Math.ceil(contract.durationDays / 7) * 7 : contract.durationDays,
    remainingDays: legacyWeekly ? Math.ceil(remainingDays / 7) * 7 : remainingDays, monthlySalary: contract.monthlySalary, acquiredDay };
}

export function renewContract(world, playerId, durationDays) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  if (!club?.playerIds.includes(playerId) || !club.contracts || !Object.hasOwn(club.contracts, playerId)) return { ok: false, message: '내 구단 소속 선수의 계약만 갱신할 수 있습니다.' };
  if (!CONTRACT_RULES.durations.includes(durationDays)) return { ok: false, message: '계약기간은 4·12·24주 중 선택하세요.' };
  const contract = { ...club.contracts[playerId], durationDays, remainingDays: durationDays };
  club.contracts = { ...club.contracts, [playerId]: contract };
  return { ok: true, message: `${durationDays / 7}주로 재계약했습니다. 주급 조건은 유지되며 추가 계약금은 없습니다.` };
}
