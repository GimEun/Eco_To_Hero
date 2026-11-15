import { LEAGUES } from '../config/world.js';
import { OPPONENT_STRATEGY } from '../config/opponent-strategy.js';
import { seasonCalendarLabel } from '../game/season-calendar.js';
import { getClubView, getAffiliations } from '../game/world-selectors.js';
import { escapeHtml, rosterTable } from './screens.js';
import { recruitmentCell, recruitmentPrice } from './roster-management.js';
import { logoImage } from './club-logo.js';

const playerSortLabels = { default: '기본 순서', aim: '에임', intelligence: '지능', stamina: '체력', fee: '영입 금액' };

function section(markup) {
  const element = document.createElement('section');
  element.className = 'screen';
  element.innerHTML = markup;
  return element;
}

export function worldScreen(world, leagueId, selectedClubId) {
  const freeCount = world.players.length - getAffiliations(world).size;
  const league = LEAGUES.find(item => item.id === leagueId) ?? LEAGUES[0];
  const clubs = world.clubs.filter(club => club.leagueId === league.id);
  const selected = clubs.find(club => club.id === selectedClubId) ?? clubs[0];
  const clubView = getClubView(world, selected.id);
  return section(`
    <div class="page-heading"><p class="eyebrow">THE ESPORTS WORLD</p><h1 tabindex="-1">같은 꿈, 서로 다른 팀.</h1><p class="lead" data-description="리그 둘러보기">5개 리그, 58개 구단. 우리 팀이 도전할 무대를 살펴보세요.</p></div>
    <div class="world-summary"><span class="tag">58개 구단</span><span class="tag muted-tag">600명 선수</span><span class="tag muted-tag">자유계약 ${freeCount}명</span></div>
    <div class="world-filters"><label for="league-filter">리그 선택</label><select id="league-filter">${LEAGUES.map(item => `<option value="${item.id}" ${item.id === league.id ? 'selected' : ''}>${item.name} · ${item.teams}팀</option>`).join('')}</select></div>
    <div data-description-scope><p class="info-note" data-description="리그 난이도">${league.name} 일반 선수 생성 시 에임·지능·체력은 각각 ${league.min}~${league.max}입니다. AI는 같은 공격 또는 수비 진영에서 ${OPPONENT_STRATEGY.switchAfterLosses[league.id]}연패하면 다음 구매 단계에 해당 진영 전술을 바꿉니다. 생성 범위는 현재 선수 능력의 제한이 아니며 영입·육성한 선수는 그대로 유지됩니다. 내 팀이 강해졌다는 이유로 상대 능력을 즉시 올리거나 내 경기 승률을 강제로 맞추지 않습니다. 상위 리그 시즌 진행과 AI 주간 성장은 후속 기능입니다.</p></div>
    <div class="world-layout"><section class="panel club-directory" aria-labelledby="league-title"><div class="roster-heading"><h2 id="league-title">${league.name}</h2><span class="tag muted-tag">${clubs.length}팀</span></div><div class="club-list">${clubs.map(club => `<button class="club-list-item" data-action="view-club" data-club-id="${escapeHtml(club.id)}" aria-pressed="${club.id === selected.id}"><span class="club-list-identity">${logoImage(club.logoId)}<span>${escapeHtml(club.name)}${club.id === world.playerClubId ? '<small>내 구단</small>' : ''}</span></span><span>${club.playerIds.length}명 →</span></button>`).join('')}</div></section>
    <section class="panel roster-panel" aria-labelledby="selected-club-title"><div class="roster-heading"><div><span class="panel-label">CLUB ROSTER</span><h2 id="selected-club-title" data-selected-roster tabindex="-1">${logoImage(clubView.logoId)}<span>${escapeHtml(clubView.name)}</span></h2></div><span class="tag muted-tag">${league.name}</span></div>${rosterTable(clubView.players, null, 0, player => `<span class="tag muted-tag">${clubView.lineupIds.includes(player.id) ? '주전' : '후보'}</span>`)}<p class="roster-footnote" data-description="구단 명단 조회">조회 전용 · 선수 정보는 전체 세계 데이터와 연결됩니다.</p></section></div>
    <p class="info-note" data-description="리그 제공 범위">PC방 일정·순위는 정규 시즌 메뉴에서 확인하세요. 상위 리그 경기·승강은 준비 중입니다.</p>
  `);
}

export function playersScreen(world, page = 0, sortKey = 'default', sortDirection = 'asc') {
  const affiliations = getAffiliations(world);
  const freeCount = world.players.length - affiliations.size;
  const home = world.clubs.find(club => club.id === world.playerClubId);
  const homeLeague = LEAGUES.find(league => league.id === home.leagueId);
  const filtered = world.players.filter(player => !affiliations.has(player.id));
  const activeSort = Object.hasOwn(playerSortLabels, sortKey) ? sortKey : 'default';
  const descending = sortDirection === 'desc';
  const prices = activeSort === 'fee' ? new Map(filtered.map(player => [player.id, recruitmentPrice(world, player, affiliations)])) : null;
  if (activeSort !== 'default') {
    const value = activeSort === 'fee' ? player => prices.get(player.id) : player => player[activeSort];
    filtered.sort((a, b) => (value(a) - value(b)) * (descending ? -1 : 1));
  }
  const size = 30;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.max(0, Math.min(page, pages - 1));
  const offset = currentPage * size;
  const visible = filtered.slice(offset, offset + size);
  const screen = section(`
    <div class="page-heading"><h1 tabindex="-1">선수 영입</h1><p class="lead" data-description="자유계약 시장">시장에 나온 자유계약 ${freeCount}명을 살펴보고 영입하세요.</p></div>
    <div class="world-filters"><span class="tag muted-tag">자유계약 · ${freeCount}명</span><button type="button" class="button secondary" data-action="recruitment-limits" aria-haspopup="dialog" aria-controls="recruitment-limits-dialog">리그별 영입 기준</button>
    <div class="player-sort-controls"><label for="player-sort">정렬 기준</label><select id="player-sort">${Object.entries(playerSortLabels).map(([key, label]) => `<option value="${key}" ${activeSort === key ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="button secondary" data-action="player-sort-direction" data-direction="asc" aria-label="오름차순 정렬" title="오름차순: 낮은 값부터" aria-pressed="${!descending}" ${activeSort === 'default' ? 'disabled' : ''}>↑</button><button class="button secondary" data-action="player-sort-direction" data-direction="desc" aria-label="내림차순 정렬" title="내림차순: 높은 값부터" aria-pressed="${descending}" ${activeSort === 'default' ? 'disabled' : ''}>↓</button></div><span class="directory-count">${filtered.length}명 중 ${filtered.length ? offset + 1 : 0}–${offset + visible.length}</span></div>
    <div class="market-overview"><p>구단 운영 자금 $${home.balance.toLocaleString('en-US')} · 명단 ${home.playerIds.length}/8명.</p><p role="status">${escapeHtml(seasonCalendarLabel(world))}</p></div><p class="info-note" data-description="영입 계약금">영입 계약금은 에임·지능·체력 평균의 제곱×2를 $100 단위로 반올림합니다. 금액 정렬은 자유계약 계약금 기준입니다. 영입 선수는 내 구단 후보로 등록됩니다.</p>
    <dialog id="recruitment-limits-dialog" class="training-help-dialog recruitment-limits-dialog" aria-labelledby="recruitment-limits-title">
      <div class="roster-heading"><h2 id="recruitment-limits-title">리그별 영입 기준</h2><form method="dialog"><button class="button secondary" autofocus>닫기</button></form></div>
      <div class="training-help-content"><p>현재 소속: ${homeLeague.name}</p>
        <table class="recruitment-limits-table"><caption class="sr-only">리그별 신규 영입 능력치 상한</caption><thead><tr><th scope="col">리그</th><th scope="col">에임</th><th scope="col">지능</th><th scope="col">체력</th></tr></thead><tbody>${LEAGUES.map(league => `<tr${league.id === homeLeague.id ? ' class="is-current"' : ''}><th scope="row">${league.name}${league.id === homeLeague.id ? ' · 현재' : ''}</th><td>${league.recruitmentMax}</td><td>${league.recruitmentMax}</td><td>${league.recruitmentMax}</td></tr>`).join('')}</tbody></table>
        <p>각 능력이 표의 수치 이하여야 영입할 수 있습니다. 자유계약과 이적 협상에 동일하게 적용합니다.</p><p>기존 보유 선수와 직접 육성한 선수의 성장·출전·재계약은 제한하지 않습니다.</p>
      </div>
    </dialog>
    <p data-description="선수 정렬">오름차순은 낮은 값부터, 내림차순은 높은 값부터 표시합니다.</p>
    <section class="panel roster-panel" aria-label="자유계약 선수 명단">${rosterTable(visible, null, offset, player => recruitmentCell(world, player, affiliations))}${!visible.length ? '<p class="roster-footnote">현재 시장에 나온 선수가 없습니다.</p>' : ''}<div class="pagination"><button class="button secondary" data-action="player-page" data-page="${currentPage - 1}" ${currentPage === 0 ? 'disabled' : ''}>← 이전</button><span>${currentPage + 1} / ${pages}</span><button class="button secondary" data-action="player-page" data-page="${currentPage + 1}" ${currentPage === pages - 1 ? 'disabled' : ''}>다음 →</button></div></section>
    <p class="info-note" data-description="선수 명단과 저장">이름·별명·능력은 가상 데이터입니다. 주전 5명은 항상 유지하며 후보는 최대 3명입니다. 변경 후 내 구단의 구단 저장을 눌러 보관하세요.</p>
  `);
  screen.className = 'screen players-screen';
  return screen;
}
