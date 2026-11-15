import {isFreeSchedule} from './season-calendar.js';
import { bankruptcyIssue } from './bankruptcy.js';
import { FINANCE_RULES } from '../config/finance.js';
import { officialSeason } from './pc-season.js';
import { domesticSeason } from '../config/domestic-leagues.js';

export const SPONSOR_RULES = Object.freeze({ durationWeeks: 4, requiredBroadcastDays: 7, preparedBroadcastDays: 6, broadcastIncome: 1750 });
export const createSponsor = () => ({ kind: 'basic', remainingWeeks: 0, broadcastDays: 0 });
export const SEASON_SPONSORS = Object.freeze({
  pc: { wins: [2, 4, 6], winIncome: [2000, 3000, 4500], appearances: [3, 5, 7], appearanceIncome: [1750, 2500, 3500] },
  city: { wins: [3, 5, 8], winIncome: [3000, 4500, 6500], appearances: [4, 7, 9], appearanceIncome: [2500, 3500, 5000] },
  province: { wins: [3, 6, 9], winIncome: [4500, 6500, 9000], appearances: [5, 8, 11], appearanceIncome: [3500, 5000, 7000] },
  national: { wins: [3, 6, 9], winIncome: [6500, 9000, 12500], appearances: [5, 8, 11], appearanceIncome: [5000, 7000, 9500] },
  world: { wins: [2, 4, 6], winIncome: [9000, 12500, 17500], appearances: [3, 5, 7], appearanceIncome: [7000, 9500, 13000] },
});
export const isSeasonSponsor = sponsor => ['wins', 'appearances'].includes(sponsor.kind);
export const broadcastGoalComplete = sponsor => sponsor.broadcastCompleted === true || sponsor.broadcastDays >= SPONSOR_RULES.requiredBroadcastDays;

export function completeBroadcastWeek(world) {
  if (!['match', 'settling'].includes(officialSeason(world).weekSchedule?.phase)) return;
  const sponsor = world.clubs.find(club => club.id === world.playerClubId).finance.sponsor;
  if (sponsor.kind === 'broadcast' && sponsor.broadcastDays >= SPONSOR_RULES.preparedBroadcastDays) sponsor.broadcastCompleted = true;
}
export function seasonSponsorTerms(kind, leagueId, tier) {
  const rule = Object.hasOwn(SEASON_SPONSORS, leagueId) ? SEASON_SPONSORS[leagueId] : null;
  if (!rule || !['wins', 'appearances'].includes(kind) || !Number.isInteger(tier) || tier < 1 || tier > 3) return null;
  return { target: rule[kind][tier - 1], income: rule[kind === 'wins' ? 'winIncome' : 'appearanceIncome'][tier - 1] };
}
export function sponsorIncome(sponsor) {
  if (isSeasonSponsor(sponsor)) {
    const terms = seasonSponsorTerms(sponsor.kind, sponsor.leagueId, sponsor.tier);
    return terms && sponsor.progress >= terms.target ? terms.income : FINANCE_RULES.sponsorIncome;
  }
  return sponsor.kind === 'broadcast' && broadcastGoalComplete(sponsor)
    ? SPONSOR_RULES.broadcastIncome : FINANCE_RULES.sponsorIncome;
}

// 같은 시드와 명단의 제안은 화면 재개방·저장 복원에도 동일하며 경기 난수를 소비하지 않는다.
export function sponsorPlayerOffer(seed, playerIds) {
  return [...playerIds].sort().map(id => {
    let hash = (seed ^ 0x73504f4e) >>> 0;
    for (const letter of id) hash = Math.imul(hash ^ letter.codePointAt(0), 16777619) >>> 0;
    return { id, hash };
  }).sort((a, b) => a.hash - b.hash || a.id.localeCompare(b.id))[0]?.id ?? null;
}

export function sponsorSigningIssue({ finance, day, weekDaysRemaining, playerEvents, teamTrainingPending }) {
  if (finance.sponsor.kind === 'broadcast') return '방송 스폰서 계약이 끝난 뒤 새 계약을 맺을 수 있습니다.';
  if (isSeasonSponsor(finance.sponsor)) return '해당 리그 시즌 종료 후 새 스폰서를 선택할 수 있습니다.';
  if ((day - finance.weeklyStartedDay) % FINANCE_RULES.periodDays !== 0 || weekDaysRemaining || playerEvents.week || teamTrainingPending) {
    return '진행 중인 주간 일정·이벤트·팀 훈련을 마친 뒤 새 주 시작에 계약하세요.';
  }
  return null;
}

export function signSponsor(world, kind, tier = 1) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  if (!['broadcast', 'wins', 'appearances'].includes(kind)) return { ok: false, message: '계약할 스폰서를 선택하세요.' };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  const issue = sponsorSigningIssue({ finance: club.finance, day: world.day, weekDaysRemaining: world.weekDaysRemaining,
    playerEvents: world.playerEvents, teamTrainingPending: world.teamTraining?.status === 'pending' });
  if (issue) return { ok: false, message: issue };
  if (kind !== 'broadcast') {
    const leagueId=officialSeason(world).leagueId;
    const terms = seasonSponsorTerms(kind, leagueId, tier);
    if (!terms) return { ok: false, message: '리그와 계약 단계를 확인하세요.' };
    if (!seasonSponsorAvailable(world)) return { ok: false, message: '진행할 공식 시즌에서 계약할 수 있습니다.' };
    club.finance.sponsor = { kind, remainingWeeks: 0, broadcastDays: 0, leagueId, tier, progress: 0,
      playerId: kind === 'appearances' ? sponsorPlayerOffer(world.seed, club.playerIds) : null };
    return { ok: true, message: '시즌 스폰서 계약 완료 · 계약 이후 공식 경기만 집계하며 플레이오프 종료까지 유지합니다.' };
  }
  club.finance.sponsor = { kind, remainingWeeks: SPONSOR_RULES.durationWeeks, broadcastDays: 0 };
  return { ok: true, message: '방송 스폰서 4주 계약 완료 · 주간 방송 준비 완료 시 목표 달성 확정, 정산 때 $1,750을 지급합니다. 미달이면 $1,250입니다.' };
}

export function seasonSponsorAvailable(world) {
  if(isFreeSchedule(world))return false;
  const club = world.clubs.find(item => item.id === world.playerClubId);
  const season = officialSeason(world);
  if(world.worldSeason)return season.clubIds.includes(club.id) && !season.playoffs?.settled;
  if(domesticSeason(world))return season.clubIds.includes(club.id) && !season.playoffs?.settled;
  return club.leagueId === 'pc' && season?.leagueId === 'pc' && season.clubIds.includes(club.id)
    && (!season.fixtures.every(fixture => fixture.result) || !season.playoffs?.settled);
}

export function validateSponsor(sponsor, day, weeklyStartedDay) {
  if (sponsor && isSeasonSponsor(sponsor)) {
    if (!seasonSponsorTerms(sponsor.kind, sponsor.leagueId, sponsor.tier) || sponsor.remainingWeeks !== 0 || sponsor.broadcastDays !== 0
      || sponsor.broadcastCompleted !== undefined || !Number.isSafeInteger(sponsor.progress) || sponsor.progress < 0
      || (sponsor.kind === 'wins' ? sponsor.playerId !== null : typeof sponsor.playerId !== 'string' || !sponsor.playerId)) {
      throw new Error('시즌 스폰서 계약 정보가 올바르지 않습니다.');
    }
    return Object.fromEntries(['kind', 'remainingWeeks', 'broadcastDays', 'leagueId', 'tier', 'progress', 'playerId'].map(key => [key, sponsor[key]]));
  }
  const elapsed = (day - weeklyStartedDay) % FINANCE_RULES.periodDays;
  if (!sponsor || typeof sponsor !== 'object' || Array.isArray(sponsor) || !['basic', 'broadcast'].includes(sponsor.kind)
    || !Number.isInteger(sponsor.remainingWeeks) || !Number.isInteger(sponsor.broadcastDays)
    || sponsor.broadcastCompleted !== undefined && (sponsor.broadcastCompleted !== true || sponsor.kind !== 'broadcast' || sponsor.broadcastDays < SPONSOR_RULES.preparedBroadcastDays)
    || (sponsor.kind === 'basic' ? sponsor.remainingWeeks !== 0 || sponsor.broadcastDays !== 0
      : sponsor.remainingWeeks < 1 || sponsor.remainingWeeks > SPONSOR_RULES.durationWeeks || sponsor.broadcastDays < 0 || sponsor.broadcastDays > elapsed * 8)) {
    throw new Error('스폰서 계약 또는 주간 방송 실적이 올바르지 않습니다.');
  }
  return { kind: sponsor.kind, remainingWeeks: sponsor.remainingWeeks, broadcastDays: sponsor.broadcastDays, ...(sponsor.broadcastCompleted ? { broadcastCompleted: true } : {}) };
}
