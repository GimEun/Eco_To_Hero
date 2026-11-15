import { COACHES, coachRule, coachChangeIssue } from '../game/coaches.js';

const money = amount => `$${amount.toLocaleString('en-US')}`;
export function coachesPanel(club) {
  const current = coachRule(club.coach), issue = coachChangeIssue(club);
  return `<section class="panel coaches-panel" aria-labelledby="coaches-title"><div class="roster-heading"><h2 id="coaches-title" tabindex="-1">코치 관리</h2><span class="tag">${current?.name ?? '고용한 코치 없음'}</span></div>
    <div class="sponsor-contracts"><p${current ? '' : ' data-description="코치 효과"'}>${current ? `현재 훈련 경험치 +${current.bonus}% · 주급 ${money(current.weeklySalary)}` : '코치를 고용하면 개인 훈련과 주간 팀 훈련 경험치가 증가합니다.'}</p>
    <div class="sponsor-options">${Object.entries(COACHES).map(([id, rule]) => `<article><h3>${rule.name}</h3><p>고용비 ${money(rule.fee)} · 주급 ${money(rule.weeklySalary)}</p><p>훈련 경험치 +${rule.bonus}%</p><button class="button primary" data-action="change-coach" data-coach="${id}" ${issue || club.coach === id || club.balance < rule.fee ? 'disabled' : ''}>${club.coach === id ? '고용 중' : current ? '이 코치로 교체' : '고용'}</button></article>`).join('')}</div>
    ${current ? `<p><button class="button secondary" data-action="change-coach" data-coach="none" ${issue ? 'disabled' : ''}>코치 해고</button></p>` : ''}
    ${issue ? `<p role="status">${issue}</p>` : ''}<p data-description="코치 고용과 해고">새 주 시작에 고용·해고·교체할 수 있습니다. 교체 시 새 코치 고용비를 지불합니다. 해고 비용·환급은 없습니다.</p>
    <p data-description="코치 훈련 효과와 급여">주전·후보의 개인 훈련 및 주간 팀 훈련 보상에 적용합니다. 성장 속도와 곱한 뒤 마지막에 반올림하며 잠재력 상한은 유지합니다. 휴식·방송·이벤트에는 적용하지 않습니다. 코치 주급은 선수 급여와 함께 정산하며 부족분은 미지급 급여로 이월합니다.</p></div></section>`;
}
