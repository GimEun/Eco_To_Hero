import { pcSeasonStandings, seasonProgress, nextTiebreakFixture } from '../game/pc-season.js';
import { escapeHtml } from './html.js';
import { logoImage } from './club-logo.js';
import { nextOfficialFixture, officialMatchConfig } from '../game/official-match.js';
import { officialWeekStatus } from '../game/weekly-official.js';
import { officialTotals } from '../game/official-records.js';
import { ANNUAL_CALENDAR } from '../config/annual-calendar.js';
import { seasonCalendarLabel } from '../game/season-calendar.js';
import { playoffPanel } from './playoff-panel.js';
import { domesticSeasonScreen } from './domestic-season-screen.js';
import { worldGroupsScreen } from './world-groups-screen.js';
import { seasonYearsPanel,archivedYearMarkup } from './season-years-panel.js';
import { matchReportsPanel } from './match-reports-panel.js';
import { officialSeason } from '../game/pc-season.js';
import { playoffFinalRanks, pcQualification } from '../game/pc-playoffs.js';
import { DOMESTIC_LEAGUES } from '../config/domestic-leagues.js';
import { domesticQualification } from '../game/domestic-season.js';
import { worldQualification } from '../game/world-groups.js';
import { worldFinalStandings } from '../game/world-finals.js';

export function seasonScreen(world,viewYear=null) {
  const archive=world.seasonYears?.archives.find(item=>item.year===viewYear);
  const screen=archive?document.createElement('section'):currentSeasonScreen(world);
  screen.innerHTML=seasonYearsPanel(world,archive?.year??null)+(archive?archivedYearMarkup(world,archive):screen.innerHTML)+matchReportsPanel(world,archive?.year??null);
  screen.className = 'screen season-screen';
  if (!archive) {
    const season = officialSeason(world);
    const nextRule = Object.values(DOMESTIC_LEAGUES).find(rule => rule.previousKey === (DOMESTIC_LEAGUES[season.leagueId]?.key ?? 'pcSeason'));
    const leagueName = world.worldSeason ? '세계 리그' : DOMESTIC_LEAGUES[season.leagueId]?.name ?? 'PC방 리그';
    const ranks = world.worldSeason ? worldFinalStandings(season)?.map(row => row.clubId) : playoffFinalRanks(season.playoffs);
    const champion = ranks?.[0] === world.playerClubId;
    const qualification = world.worldSeason ? null : nextRule ? domesticQualification(world, nextRule.leagueId) : world.nationalSeason ? worldQualification(world) : pcQualification(season.playoffs, world.playerClubId);
    if (ranks && (champion || qualification?.qualified)) {
      const club = world.clubs.find(item => item.id === world.playerClubId);
      const nextName = nextRule?.name ?? '세계 리그';
      screen.innerHTML = screen.innerHTML.replace('<div class="page-heading">', `<section class="season-achievement" aria-label="확정 시즌 성과"><div class="season-achievement-club">${logoImage(club.logoId)}<span>${escapeHtml(club.name)} · ${leagueName}</span></div><h2>${champion ? `${leagueName} 우승` : `${nextName} 진출 확정`}</h2><p>${champion ? '최종 1위' : `최종 ${qualification.rank}위`}${qualification?.qualified ? ` · ${nextName} 진출 확정` : ''}</p><small>${season.playoffs.settled ? '시즌 정산 완료' : '경기 결과 확정 · 시즌 정산 대기'}</small></section><div class="page-heading">`);
    }
  }
  return screen;
}

function currentSeasonScreen(world) {
  if(world.worldSeason)return worldGroupsScreen(world);
  if(world.nationalSeason || world.provinceSeason || world.citySeason)return domesticSeasonScreen(world);
  const season = world.pcSeason;
  const totals = officialTotals(world, world.playerClubId);
  const clubs = new Map(world.clubs.map(club => [club.id, club]));
  const rows = pcSeasonStandings(season);
  const completed = season.fixtures.filter(fixture => fixture.result).length;
  const nextWeek = season.fixtures.find(fixture => !fixture.result)?.week ?? 7;
  const upcoming = nextOfficialFixture(world);
  const weekly = officialWeekStatus(world);
  const progress = seasonProgress(season);
  const playoffMode = progress.complete && (!season.weekSchedule || season.weekSchedule.fixtureId === 'pc-1-playoffs');
  const tie = progress.phase === 'tiebreak';
  const preview = tie ? nextTiebreakFixture(season) : upcoming;
  const config = preview ? officialMatchConfig(world, preview) : null;
  const mine = preview && [preview.homeClubId, preview.awayClubId].includes(world.playerClubId);
  const identity = id => `${logoImage(clubs.get(id).logoId)}<span>${escapeHtml(clubs.get(id).name)}${id === world.playerClubId ? '<small>내 구단</small>' : ''}</span>`;
  const screen = document.createElement('section');
  screen.className = 'screen';
  screen.innerHTML = `
    <div class="page-heading"><p class="eyebrow">PC LEAGUE / REGULAR SEASON</p><h1 tabindex="-1">PC방 정규 시즌</h1><p class="lead" data-description="정규 시즌 안내">8팀이 한 번씩 맞붙는 7주 시즌의 대진과 기록을 확인하세요.</p></div>
    <div class="world-summary"><span class="tag">1회전 · 팀당 7경기</span><span class="tag muted-tag">BO1 · MR12</span><span class="tag muted-tag">정규 ${completed} / 28경기</span><span class="tag muted-tag">${progress.complete ? '정규 시즌 순위 확정' : tie ? '순위 결정전 진행 중' : completed ? '정규 일정 진행 중' : '대진 확정 · 경기 미시작'}</span></div>
    ${playoffMode ? playoffPanel(world) : ''}
    <section class="panel season-start"${playoffMode ? ' hidden' : ''}><div class="roster-heading"><h2>${tie ? '정규 시즌 순위 결정전' : upcoming ? `시즌 ${upcoming.week}주 공식 경기` : progress.complete ? '정규 시즌 순위 확정' : '정규 경기 진행 대기'}</h2>${preview && mine && !playoffMode ? `<button type="button" class="button primary" data-action="start-official"${weekly.canPlay ? '' : ' disabled'}>${tie ? '순위 결정전' : '공식 경기'} 시작 →</button>` : tie ? `<button type="button" class="button primary" data-action="advance-tiebreak-ai"${weekly.phase === 'tiebreak-ai' ? '' : ' disabled'}>AI 결정전 진행 →</button>` : ''}</div>
      ${preview ? `<p class="season-start-teams"><span class="season-team">${identity(preview.homeClubId)}</span> vs <span class="season-team">${identity(preview.awayClubId)}</span> · ${escapeHtml(config.map.name)}${mine ? ` · 내 팀 ${((preview.homeClubId === world.playerClubId) === (config.attackTeam === 'home')) ? '공격' : '수비'} 시작` : ' · AI 대결'}</p><p class="input-hint" data-description="공식 경기 운영">중도 이탈·새로고침은 0:13 기권패입니다. 퍼즈는 경기 전체 3회이며 시간 제한이 없습니다. ${tie ? '결정전은 추가 날짜·훈련·급여 없이 진행하고 결과를 자동 저장합니다.' : '주간 준비 후 경기하며 같은 주 AI 경기 계산 및 마지막 하루 정산 후 자동 저장합니다.'}</p>` : progress.complete ? '<p>1~8위 정규 순위를 확정했습니다. 상위 4팀은 BO3 플레이오프에서 최종 순위를 결정합니다.</p>' : '<p>남은 정규 경기 결과를 확정한 뒤 순위를 결정합니다.</p>'}<p class="official-status" role="status">${escapeHtml(weekly.message)}</p>${!weekly.canPlay && weekly.phase !== 'tiebreak-ai' ? '<button type="button" class="button secondary" data-action="club">내 구단 →</button>' : ''}</section>
    ${progress.complete ? `<section class="panel season-start"><h2>정규 시즌 최종 순위 · 플레이오프 진출 4팀</h2><div class="season-start-teams">${rows.slice(0, 4).map(row => `<span class="season-team"><strong>${row.rank}위</strong>${identity(row.clubId)}</span>`).join('')}</div><p class="input-hint">정규 순위이며 플레이오프 최종 순위와 다릅니다. 시 리그 진출은 플레이오프 최종 1·2위로 결정합니다.</p></section>` : ''}
    ${season.tiebreaks.length ? `<section class="panel season-start"><h2>순위 결정전 기록</h2><p class="input-hint" data-description="동률 결정전 규칙">동률 팀끼리 BO1 1회전으로 대결하고, 다시 동률인 팀들만 재경기합니다. 결정전 승패는 정규 28경기 전적에 더하지 않고 최종 순위만 결정합니다.</p>${season.tiebreaks.map((round, index) => `<details class="season-week"${round.fixtures.some(fixture => !fixture.result) ? ' open' : ''}><summary>결정전 ${index + 1} · ${round.rank}~${round.rank + round.clubIds.length - 1}위 <span>${round.fixtures.filter(fixture => fixture.result).length}/${round.fixtures.length}경기</span></summary><div class="table-scroll"><table class="season-fixtures"><thead><tr><th>구단</th><th>결과</th><th>상대 구단</th></tr></thead><tbody>${round.fixtures.map(fixture => `<tr><td><span class="season-team">${identity(fixture.homeClubId)}</span></td><td class="season-score">${fixture.result ? `${fixture.result.homeScore}:${fixture.result.awayScore}${fixture.result.forfeit ? ' · 기권' : ''}` : '예정'}</td><td><span class="season-team">${identity(fixture.awayClubId)}</span></td></tr>`).join('')}</tbody></table></div></details>`).join('')}</section>` : ''}
    <div class="season-layout">
      <section class="panel" aria-labelledby="season-standings-title"><h2 id="season-standings-title">정규 시즌 순위</h2>
        <div class="table-scroll" role="region" aria-label="PC방 정규 시즌 순위" tabindex="0"><table class="season-standings"><caption class="sr-only">승이 많은 순, 패가 적은 순. 동률은 단판 순위 결정전.</caption><thead><tr><th scope="col">순위</th><th scope="col">구단</th><th scope="col">경기</th><th scope="col">승</th><th scope="col">패</th><th scope="col">라운드 득실</th></tr></thead><tbody>
        ${rows.map(row => `<tr${row.clubId === world.playerClubId ? ' class="season-home"' : ''}><td>${row.rank === null ? '—' : `${row.tied ? '공동 ' : ''}${row.rank}위`}</td><th scope="row"><span class="season-team">${identity(row.clubId)}</span>${row.needsTiebreak ? '<span class="tag muted-tag">결정전 필요</span>' : ''}</th><td>${row.played}</td><td class="season-wins">${row.wins}</td><td>${row.losses}</td><td>${row.roundDifference > 0 ? '+' : ''}${row.roundDifference}</td></tr>`).join('')}
        </tbody></table></div><p class="roster-footnote" data-description="순위 결정 기준">승·패가 같으면 단판 순위 결정전으로 정합니다. 라운드 득실은 참고 기록입니다.</p>
      </section>
      <section class="panel" aria-labelledby="season-schedule-title"><h2 id="season-schedule-title">7주 경기 일정</h2>
        ${Array.from({ length: 7 }, (_, index) => { const week = index + 1, fixtures = season.fixtures.filter(fixture => fixture.week === week); return `<details class="season-week"${week === nextWeek ? ' open' : ''}><summary>시즌 ${week}주 차 <span>${fixtures.filter(fixture => fixture.result).length} / 4경기</span></summary><div class="table-scroll" role="region" aria-label="시즌 ${week}주 차 대진" tabindex="0"><table class="season-fixtures"><caption class="sr-only">시즌 ${week}주 차 네 경기</caption><thead><tr><th scope="col">구단</th><th scope="col">결과</th><th scope="col">상대 구단</th></tr></thead><tbody>${fixtures.map(fixture => `<tr${[fixture.homeClubId, fixture.awayClubId].includes(world.playerClubId) ? ' class="season-home"' : ''}><td><span class="season-team">${identity(fixture.homeClubId)}</span></td><td class="season-score">${fixture.result ? `${fixture.result.homeScore} : ${fixture.result.awayScore}${fixture.result.forfeit ? ' <small>기권</small>' : ''}` : '<span class="tag muted-tag">예정</span>'}</td><td><span class="season-team">${identity(fixture.awayClubId)}</span></td></tr>`).join('')}</tbody></table></div></details>`; }).join('')}
        <p class="roster-footnote">완료된 경기는 다시 실행할 수 없습니다.</p>
      </section>
    </div>
    <section class="panel"><h2>연간 일정</h2><p role="status">${escapeHtml(seasonCalendarLabel(world))}</p><div class="world-summary">${ANNUAL_CALENDAR.map(stage => `<span class="tag muted-tag">${stage.name} ${stage.startWeek}~${stage.endWeek}주</span>`).join('')}</div><p data-description="연간 승급 일정">연 1회 PC방부터 세계까지 순차 도전합니다. 시즌 중에는 휴식 주에도 영입이 잠기며 탈락·세계 종료 후 자유 일정에서 다시 열립니다. 52주가 지난 뒤 중단 일정 없이 새해를 시작하면 현재 날짜에서 비시즌 4주와 PC방 재도전을 진행합니다. 날짜 건너뛰기는 후속 단계입니다.</p></section>
    <section class="panel"><h2>공식 경기 전적·상금</h2><p>${totals.matches}경기 · ${totals.wins}승 ${totals.losses}패 · 누적 경기 상금 ${totals.rewards.toLocaleString('en-US')}</p><div class="table-scroll"><table><thead><tr><th>선수</th><th>출전</th><th>승</th><th>패</th></tr></thead><tbody>${Object.entries(totals.players).map(([id, record]) => `<tr><th scope="row">${escapeHtml(world.players.find(player => player.id === id)?.nickname ?? id)}</th><td>${record.appearances}</td><td>${record.wins}</td><td>${record.losses}</td></tr>`).join('')}</tbody></table></div><p data-description="공식 전적·상금">연결 이후 완료한 공식 경기만 기록합니다. 정규 승리 $500·패배 $200, 기권과 결정전은 상금이 없습니다. 결정전은 전적·출전을 집계하고 기권은 구단 패배만 기록합니다. 과거 경기와 팀 연습은 소급 집계하지 않습니다.</p></section>
  `;
  return screen;
}
