import { escapeHtml } from './html.js';
const money = value => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US')}`;
export function bankruptcyScreen(club, isSaved) {
  const screen = document.createElement('section');
  screen.className = 'screen bankruptcy-screen';
  screen.innerHTML = `<div class="panel sponsor-contracts"><p class="eyebrow">CLUB CLOSED</p><h1 tabindex="-1">구단 해체 · 게임 종료</h1><p><strong>${escapeHtml(club.name)}</strong>의 운영 자금이 -$10,000 이하가 되어 구단이 해체됐습니다.</p><p>종료 시점: ${Math.floor((club.day - 1) / 7) + 1}주 차 · 운영 자금 ${money(club.balance)} · 대출 원금 ${money(club.finance.loan.principal)}</p><p data-description="해체 후 이용 안내">날짜 진행·팀 연습·선수 거래·계약·시설·대출은 종료됐습니다. 구단 기록은 남아 있으며 새 게임 시작 시 기존 구단 교체를 확인합니다.</p><p>${isSaved ? '이 상태는 저장되어 있습니다.' : '종료 상태는 아직 저장하지 않았습니다. 기록을 남기려면 구단 저장을 눌러 주세요.'}</p><div class="form-actions"><button class="button primary" data-action="new-game">새 게임 시작</button><button class="button secondary" data-action="save">구단 저장</button><button class="button secondary" data-action="export">JSON 백업 내보내기</button><button class="text-button" data-action="menu">메인 메뉴</button></div></div>`;
  return screen;
}
