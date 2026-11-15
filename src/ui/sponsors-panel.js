import { escapeHtml } from './html.js';
import { LEAGUES } from '../config/world.js';
import { sponsorIncome, sponsorSigningIssue, seasonSponsorTerms, sponsorPlayerOffer, isSeasonSponsor, broadcastGoalComplete } from '../game/sponsors.js';

const money = value => `$${value.toLocaleString('en-US')}`;
const names = { basic: '기본', broadcast: '방송', wins: '경기 승리', appearances: '선수 출전' };
export function sponsorReceipt(entry) {
  const contract = entry.sponsorContract;
  if (contract) return `${names[contract.kind]} ${contract.tier}단계 · ${contract.progress}/${seasonSponsorTerms(contract.kind, contract.leagueId, contract.tier).target}회`;
  return entry.sponsorKind === 'broadcast' ? `방송 · ${broadcastGoalComplete(entry) ? '목표 달성' : '목표 미달'}` : entry.sponsorKind === 'legacy' ? '이전 스폰서' : '기본';
}

export function sponsorsPanel(club) {
  const sponsor = club.finance.sponsor, issue = sponsorSigningIssue(club);
  const previous = club.finance.settlements.at(-1);
  if (sponsor.kind !== 'basic') {
    const terms = isSeasonSponsor(sponsor) ? seasonSponsorTerms(sponsor.kind, sponsor.leagueId, sponsor.tier) : null;
    const progress = terms ? sponsor.progress : sponsor.broadcastDays, target = terms?.target ?? 7;
    const league = LEAGUES.find(item => item.id === sponsor.leagueId)?.name;
    const previousBroadcast = sponsor.kind === 'broadcast' && previous?.sponsorKind === 'broadcast' ? `<p class="info-note">직전 주 정산 · 방송 ${broadcastGoalComplete(previous) ? '목표 달성' : '목표 미달'} · 스폰서 수입 ${money(previous.income)}</p>` : '';
    const completed = sponsor.kind === 'broadcast' && broadcastGoalComplete(sponsor);
    const progressLabel = terms ? `${sponsor.kind === 'wins' ? '공식 매치 승리' : '공식 매치 출전'} ${progress}/${target}회 · ${progress >= target ? '지급 조건 달성' : '지급 조건 미달'}`
      : completed ? '이번 주 방송 완료 · 목표 달성' : sponsor.broadcastDays > 0 ? '이번 주 방송 진행 중' : '이번 주 방송 미진행 · 목표 미달';
    const player = sponsor.kind === 'appearances' ? `<p>지정 선수: <strong>${escapeHtml(club.sponsorPlayerName ?? '선수 확인 필요')}</strong>${club.playerIds.includes(sponsor.playerId) ? '' : ' · 구단을 떠나 출전 누적 중단'}</p>` : '';
    return `<div class="sponsor-contracts"><h3>스폰서 계약</h3><article class="sponsor-status"><h4>${names[sponsor.kind]} 스폰서${terms ? ` · ${sponsor.tier}단계` : ''}</h4>
      <p>${terms ? `${league} 플레이오프 종료까지` : `방송 계약 잔여 ${sponsor.remainingWeeks}주`}</p>${player}
      <p role="status">${progressLabel}</p>
      <progress value="${terms ? Math.min(progress, target) : Number(completed)}" max="${terms ? target : 1}" aria-label="스폰서 목표 진행도">${progressLabel}</progress>
      <p>현재 실적 기준 정산 예정 ${money(sponsorIncome(sponsor))} · 목표 달성 시 ${money(terms?.income ?? 1750)}</p>${previousBroadcast}
      <button class="button" disabled>계약 유지 중</button>
      <p data-description="스폰서 지급 조건">${terms ? '계약 후 완료한 공식 승리·시작 주전 출전만 집계합니다. 순위 결정전은 포함하고 기권·팀 연습은 제외합니다. 목표 달성 후 다음 주 정산부터 증액합니다. 플레이오프는 BO3 시리즈당 1회 집계하며 마지막 주 정산 뒤 시즌 계약이 종료됩니다.' : '선수 1명 이상이 방송 행동으로 주간 준비를 마치면 목표 달성을 확정합니다. 확정한 $1,750은 기존 주간 정산 때 지급하며, 미달이면 $1,250입니다. 방송 자체 수입은 별도입니다.'}</p>
      <p>${issue}</p></article></div>`;
  }
  const targetId = sponsorPlayerOffer(club.sponsorSeed, club.playerIds);
  const targetName = club.players.find(player => player.id === targetId)?.nickname ?? '';
  const button = (kind, tier, label) => `<button class="button primary" data-action="sign-sponsor" data-sponsor-kind="${kind}" data-sponsor-tier="${tier}" ${issue || kind !== 'broadcast' && !club.seasonSponsorAvailable ? 'disabled' : ''}>${label}</button>`;
  const offers = ['wins', 'appearances'].map(kind => `<article><h4>${names[kind]} 스폰서</h4><p data-description="시즌 스폰서 계약">플레이오프 종료까지 계약 · 달성 전 주 $1,250</p>${kind === 'appearances' ? `<p>무작위 지정 선수: <strong>${escapeHtml(targetName)}</strong> · 계약 후 대상 고정</p>` : '<p data-description="공식 승리 집계">BO3·BO5도 매치 승리 1회로 집계합니다.</p>'}${[1, 2, 3].map(tier => {
    const terms = seasonSponsorTerms(kind, club.leagueId, tier);
    return `<p>${tier}단계 · ${terms.target}${kind === 'wins' ? '승' : '회 출전'} 달성 → 주 ${money(terms.income)}</p>${button(kind, tier, `${tier}단계 계약`)}`;
  }).join('')}</article>`).join('');
  return `<div class="sponsor-contracts"><h3>스폰서 계약</h3><div class="sponsor-options"><article><h4>기본 스폰서 · 현재 유지 중</h4><p data-description="기본 스폰서">조건 없이 매주 $1,250 · 별도 계약이 없으면 자동 유지</p></article><article><h4>방송 스폰서</h4><p data-description="방송 스폰서">4주 계약 · 주간 방송 준비 완료 시 $1,750, 미달이면 $1,250</p>${button('broadcast', 1, '방송 스폰서 4주 계약')}</article>${offers}</div>${issue ? `<p role="status">${issue}</p>` : '<p data-description="스폰서 선택">새 주 시작에 하나의 스폰서를 선택하세요. 계약 중에는 변경할 수 없습니다.</p>'}<p data-description="시즌 스폰서 제공 범위">진행할 공식 시즌이 있으면 새 주 시작에 계약할 수 있습니다. 계약 이후의 경기만 집계하며 팀 연습과 기권은 제외합니다. 시즌 계약은 플레이오프 마지막 주 정산 뒤 종료됩니다.</p></div>`;
}
