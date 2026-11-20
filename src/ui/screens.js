import { GAME } from '../config/game.js';
import { rosterActions } from './roster-management.js';
import { escapeHtml } from './html.js';
import { contractsPanel } from './contracts-panel.js';
import { financePanel } from './finance-panel.js';
import { coachesPanel } from './coaches-panel.js';
import { facilitiesPanel } from './facilities-panel.js';
import { trainingPanel, experiencePanel } from './training-panel.js';
import { counselingPanel } from './counseling-panel.js';
import { WEEKDAYS } from '../config/training.js';
import { playerEventsPanel } from './player-events-panel.js';
import { GROWTH_LABELS } from '../game/player-development.js';
import { clubTabForFocus, clubTabsMarkup, clubTabPanel, mountClubTabs } from './club-tabs.js';
import { isClubBankrupt } from '../game/bankruptcy.js';
import { bankruptcyScreen } from './bankruptcy-screen.js';
import { logoImage, logoPicker } from './club-logo.js';
import { CLUB_LOGOS } from '../data/club-logos.js';
import { officialWeekStatus } from '../game/weekly-official.js';
import { newYearButton } from './season-years-panel.js';
import { scheduleCalendarPanel } from './schedule-calendar-panel.js';
export { escapeHtml } from './html.js';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});

function view(markup) {
  const element = document.createElement('section');
  element.className = 'screen';
  element.innerHTML = markup;
  return element;
}

const arrow = '<span aria-hidden="true">→</span>';
export const gameBanner = new URL('../../Image/게임 배너.png', import.meta.url).href;

export function rosterTable(players, affiliations = null, offset = 0, actionCell = null) {
  return `<div class="table-scroll" role="region" aria-label="선수 명단" tabindex="0"><table class="roster-table${affiliations ? ' roster-table-affiliations' : ''}"><caption class="sr-only">선수 이름과 1~99 범위의 기본 능력치</caption><thead><tr><th scope="col" class="roster-player">선수</th>${affiliations ? '<th scope="col" class="roster-affiliation">소속</th>' : ''}<th scope="col" class="roster-stat roster-aim">에임</th><th scope="col" class="roster-stat roster-intelligence">지능</th><th scope="col" class="roster-stat roster-stamina">체력</th>${actionCell ? '<th scope="col" class="roster-action">명단·영입</th>' : ''}</tr></thead><tbody>
    ${players.map((player, index) => `<tr><th scope="row"><div class="player-identity"><span class="player-number">${String(offset + index + 1).padStart(2, '0')}</span><div class="player-name"><strong>${escapeHtml(player.nickname)}</strong><small>${escapeHtml(player.name)}</small>${player.development ? `<details class="player-development"><summary>성장 정보</summary><small>성장 속도 ${GROWTH_LABELS[player.development.growthRate]} ×${player.development.growthRate / 100}<br>잠재력 에임 ${player.development.potential.aim} · 지능 ${player.development.potential.intelligence} · 체력 ${player.development.potential.stamina}</small></details>` : ''}</div></div></th>${affiliations ? `<td class="roster-affiliation">${escapeHtml(affiliations.get(player.id)?.name ?? '자유계약')}</td>` : ''}<td class="roster-stat roster-aim">${player.aim}</td><td class="roster-stat roster-intelligence">${player.intelligence}</td><td class="roster-stat roster-stamina">${player.stamina}</td>${actionCell ? `<td>${actionCell(player)}</td>` : ''}</tr>`).join('')}
  </tbody></table></div>`;
}

export function menuScreen(hasClub, savedClubName = null, storageChecked = true) {
  const screen = view(`
    <div class="menu-grid">
      <div class="menu-copy">
        <h1 class="menu-banner" tabindex="-1"><img src="${gameBanner}" width="1774" height="887" alt="ECO TO HERO — ESPORTS MANAGER" /></h1>
        <div class="menu-actions">
          <button class="button primary" data-action="new-game">새 게임 시작 ${arrow}</button>
          ${hasClub ? '<button class="button secondary" data-action="club">현재 구단으로 돌아가기</button>' : ''}
          ${savedClubName !== null ? '<button class="button secondary" data-action="continue">저장된 구단 이어하기</button>' : ''}
        </div>
        <div class="backup-actions"><button class="text-button" data-action="import">백업 가져오기</button><button class="text-button" data-action="refresh-save">저장소 다시 확인</button></div>
        <p class="session-note saved-summary"></p>
        <p class="session-note" data-description="저장과 백업">같은 브라우저·주소에서 저장 슬롯 1개를 사용합니다. 중요한 구단은 백업해 주세요.</p>
      </div>
      <aside class="journey" aria-label="리그 성장 목표">
        <h2 class="journey-heading">PC방에서 시작해,<br>세계 정상까지</h2>
        <ol class="league-track">
          <li class="current"><span>01</span><strong>PC방</strong><span>8팀</span></li>
          <li><span>02</span><strong>시</strong><span>10팀</span></li>
          <li><span>03</span><strong>도</strong><span>12팀</span></li>
          <li><span>04</span><strong>전국</strong><span>12팀</span></li>
          <li><span>05</span><strong>전세계</strong><span>16팀</span></li>
        </ol>
        <p class="journey-caption" data-description="리그 성장">PC방 · 시 · 도 · 전국 · 세계 리그에 차례로 도전합니다.</p>
      </aside>
    </div>
    <div class="start-facts"><div><span>첫 도전</span><strong>전술형 FPS · 5 VS 5</strong></div><div><span>시작 무대</span><strong>${GAME.startingLeague} · 8팀</strong></div><div><span>초기 운영 자금</span><strong>${money.format(GAME.startingBalance)}</strong></div></div>
  `);
  screen.querySelector('.saved-summary').textContent = !storageChecked
    ? '저장 슬롯을 아직 확인하지 못했습니다. 저장소 다시 확인을 이용해 주세요.'
    : savedClubName === null ? '저장된 구단이 없습니다.' : `저장 슬롯 · ${savedClubName}`;
  screen.classList.add('menu-screen');
  return screen;
}

export function newGameScreen() {
  return view(`
    <button class="text-button" data-action="menu">← 메인 메뉴</button>
    <div class="page-heading"><p class="eyebrow">NEW GAME / 01</p><h1 tabindex="-1">어떤 무대에 도전할까요?</h1><p class="lead" data-description="종목 선택">팀의 첫 번째 종목을 선택하세요.</p></div>
    <div class="discipline-grid">
      <article class="discipline available">
        <div class="card-top"><span class="tag">플레이 가능</span><span class="card-number">01</span></div>
        <div class="discipline-mark" aria-hidden="true">⌖</div><h2>${GAME.discipline}</h2><p data-description="전술형 FPS">한 번의 판단, 다섯 명의 호흡.<br>정교한 전술로 승부하는 5대5 FPS.</p>
        <div class="chips"><span>5 VS 5</span><span>MR12</span><span>팀 전술</span></div>
        <button class="button primary" data-action="create-club">이 종목으로 창단 ${arrow}</button>
      </article>
      <article class="discipline upcoming"><div class="card-top"><span class="tag muted-tag">준비 중</span><span class="card-number">02</span></div><div class="discipline-mark" aria-hidden="true">◇</div><h2>하이퍼 FPS</h2><p data-description="하이퍼 FPS">개성과 능력이 만드는 새로운 변수.<br>또 다른 팀의 이야기를 준비하고 있습니다.</p><button class="button secondary" disabled>추후 공개</button></article>
      <article class="discipline upcoming"><div class="card-top"><span class="tag muted-tag">준비 중</span><span class="card-number">03</span></div><div class="discipline-mark" aria-hidden="true">◎</div><h2>배틀로얄</h2><p data-description="배틀로얄">끝까지 살아남는 팀을 향해.<br>더 넓은 전장은 다음에 열립니다.</p><button class="button secondary" disabled>추후 공개</button></article>
    </div>
    <p class="info-note" data-description="현재 제공 기능">구단 창단 후 선수 영입·훈련·전술·공식 리그 일정을 진행할 수 있습니다.</p>
  `);
}

export function createClubScreen(draftName, hasClub, logoId = CLUB_LOGOS[0].id) {
  const screen = view(`
    <button class="text-button" data-action="new-game">← 종목 선택</button>
    <div class="page-heading"><p class="eyebrow">BUILD YOUR CLUB / 02</p><h1 tabindex="-1">당신의 구단에 이름을.</h1><p class="lead" data-description="구단 창단">처음은 작아도, 이름에 담긴 꿈은 클 수 있습니다.</p></div>
    <div class="creation-grid">
      <form id="club-form" class="panel creation-form" novalidate>
        <span class="panel-label">CLUB IDENTITY</span><h2>가상 구단 창단</h2>
        <label for="club-name">구단 이름</label>
        <input id="club-name" name="clubName" type="text" maxlength="${GAME.maxClubNameLength}" placeholder="예: 새벽 게이밍" autocomplete="off" required aria-describedby="name-hint name-error" />
        <p id="name-hint" class="input-hint" data-description="구단 이름 입력">최대 ${GAME.maxClubNameLength}자 · 앞뒤 공백은 제외합니다.</p>
        <p id="name-error" class="field-error" role="alert"></p>
        <div class="form-notes" data-description="창단과 저장"><p>임시 선수 5명과 함께 ${GAME.startingLeague}에서 시작합니다.</p><p>창단 시 이 브라우저에 자동 저장합니다. 저장 실패 시 백업을 이용해 주세요.</p>${hasClub ? '<p class="replacement-note">창단 시 기존 구단과 저장의 교체 여부를 확인합니다.</p>' : ''}</div>
        <div class="form-actions"><button class="button secondary" type="button" data-action="new-game">취소</button><button class="button primary" type="submit">구단 창단하기 ${arrow}</button></div>
      </form>
      <aside class="panel starting-kit club-logo-panel">${logoPicker(logoId)}</aside>
    </div>
  `);
  screen.querySelector('#club-name').value = draftName;
  return screen;
}

export function clubScreen(club, isSaved = false, world = null, { activeTab = 'roster', onTabChange, financeSection = 'sponsors' } = {}) {
  if (isClubBankrupt(club)) return bankruptcyScreen(club, isSaved);
  const active = clubTabForFocus(null, activeTab);
  const yearButton=world?newYearButton(world):'';
  const [eventsBody, eventDialog = ''] = playerEventsPanel(club).split(/(?=<dialog id="player-event-dialog")/);
  const screen = view(`
    <div class="club-heading"><div class="club-identity"><p class="eyebrow">내 구단</p><div class="club-title-row">${logoImage(club.logoId, 'team-logo club-heading-logo')}<h1 class="club-name" tabindex="-1"></h1></div></div><div class="club-calendar"><span>게임 ${club.day}일 차 · ${club.yearWeek??Math.floor((club.day - 1) / 7) + 1}주 차 · ${WEEKDAYS[(club.day - 1) % 7]}요일</span><button class="button primary" data-action="advance-week">${club.playerEvents.week?.event?.status === 'pending' ? '이벤트 선택 계속 ▶' : club.teamTrainingPending ? '팀 훈련 이어하기 ▶' : world && ['tiebreak', 'tiebreak-ai'].includes(officialWeekStatus(world).phase) ? '순위 결정전 진행 ▶' : world && ['ready', 'playoff', 'playoff-ai'].includes(officialWeekStatus(world).phase) ? '공식 경기 진행 ▶' : world && officialWeekStatus(world).phase === 'settling' ? '정산·다음 주 진행 ▶' : club.weekDaysRemaining ? `남은 ${club.weekDaysRemaining}일 진행 ▶` : '1주 진행 ▶'}</button></div></div>
    <p class="info-note" role="status">${escapeHtml(club.seasonCalendarLabel ?? '')}${world && ['finished', 'settling'].includes(officialWeekStatus(world).phase) && world.pcSeason.playoffs?.series[2]?.result ? ` · ${escapeHtml(officialWeekStatus(world).message)}` : ''}</p>
    ${yearButton?`<div class="save-toolbar">${yearButton}</div>`:''}
    <div class="save-toolbar"><span class="tag ${isSaved ? '' : 'muted-tag'}">${isSaved ? '저장 완료' : '현재 창에서만 유지 · 미저장'}</span><div class="save-buttons"><button class="button secondary" data-action="save">구단 저장</button><button class="button secondary" data-action="export">백업 내보내기</button><button class="text-button" data-action="import">백업 가져오기</button></div></div>
    <div class="club-summary" aria-label="구단 요약"><span>운영 자금 <strong>${money.format(club.balance)}</strong></span><span>${escapeHtml(club.league)}</span><span>${escapeHtml(club.discipline)}</span><span>주전 5명 · 후보 ${Math.max(0, club.players.length - 5)}명</span></div>
    ${clubTabsMarkup(active)}
    ${clubTabPanel('roster', `<section class="panel roster-panel club-roster-panel" aria-labelledby="roster-title"><div class="roster-heading"><div><h2 id="roster-title" tabindex="-1">주전·후보 명단</h2></div><div class="roster-counts" aria-label="명단 인원"><span>주전 <strong>${club.lineupIds.length}명</strong></span><span>후보 <strong>${Math.max(0, club.players.length - club.lineupIds.length)} / 3명</strong></span></div></div>
      ${rosterTable(club.players, null, 0, player => rosterActions(club, player, world))}
      <p class="roster-footnote" data-description="명단 관리">주전 5명 · 후보 최대 3명. 명단·영입 칸의 화살표를 눌러 주전·후보와 교체할 선수를 선택하면 바로 반영됩니다. 주전 방출 시 첫 후보가 해당 자리를 이어받으며 5명 미만 방출은 불가합니다. 방출 환급은 없습니다.</p>
    </section>`, active)}
    ${clubTabPanel('development', experiencePanel(club)+counselingPanel(world), active)}
    ${clubTabPanel('contracts', contractsPanel(club), active)}
    ${clubTabPanel('finance', financePanel(club, financeSection), active)}
    ${clubTabPanel('coaches', coachesPanel(club), active)}
    ${clubTabPanel('facilities', facilitiesPanel(club), active)}
    ${clubTabPanel('calendar', `<div data-calendar-host>${scheduleCalendarPanel(world)}</div>`, active)}
    ${clubTabPanel('events', eventsBody, active)}
    ${eventDialog}
    ${trainingPanel(club)}
  `);
  screen.querySelector('.club-name').textContent = club.name;
  screen.classList.add('club-screen');
  mountClubTabs(screen, onTabChange);
  return screen;
}
