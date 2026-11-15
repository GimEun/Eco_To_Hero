import { escapeHtml } from './html.js';
import { logoImage } from './club-logo.js';
import { domesticStandings, nextDomesticFixture } from '../game/domestic-season.js';
import { officialWeekStatus } from '../game/weekly-official.js';
import { officialTotals } from '../game/official-records.js';
import { playoffFinalRanks } from '../game/pc-playoffs.js';
import { PRACTICE_MAPS } from '../data/maps/index.js';
import { domesticSeason,domesticRule,DOMESTIC_LEAGUES } from '../config/domestic-leagues.js';
import { domesticQualification,domesticEntryIssue } from '../game/domestic-season.js';
import { worldQualification,worldEntryIssue } from '../game/world-groups.js';

export function domesticSeasonScreen(world) {
  const screen=document.createElement('div'),season=domesticSeason(world),rule=domesticRule(season),fixture=nextDomesticFixture(world),status=officialWeekStatus(world);
  const playoffs=season.playoffs,ranks=playoffFinalRanks(playoffs),tie=fixture?.week===0;
  const nextRule=Object.values(DOMESTIC_LEAGUES).find(next=>next.previousKey===rule.key)??{leagueId:'world',name:'세계 리그'};
  const promotion=nextRule.leagueId==='world'?worldQualification(world):domesticQualification(world,nextRule.leagueId);
  const promotionMarkup=promotion?`<p>${rule.name} 최종 ${promotion.rank}위 · ${promotion.qualified?`${nextRule.name} 진출 확정`:'올해 공식 도전 탈락'}</p>${promotion.qualified && playoffs?.settled?`<button class="button primary" data-action="enter-${nextRule.leagueId}"${(nextRule.leagueId==='world'?worldEntryIssue(world):domesticEntryIssue(world,nextRule.leagueId))?' disabled':''}>${nextRule.name} 참가 →</button>`:''}`:'';
  const rankingNote=rule.finals?'BO3 매치 승패로 집계합니다. 동률은 BO1 1회전으로 정하고 재동률 팀만 다시 경기합니다. 결정전은 추가 날짜·급여 없이 순위를 확정하며 정규 전적에 더하지 않습니다.':`BO3 매치 승패로 집계하며 동률은 공동 순위로 표시합니다. ${rule.name} 동률 결정·${rule.finalWeek}주 플레이오프는 후속 단계입니다.`;
  const clubs=new Map(world.clubs.map(club=>[club.id,club]));
  const team=id=>`<span class="season-team">${logoImage(clubs.get(id).logoId)}${escapeHtml(clubs.get(id).name)}</span>`;
  const mapName=id=>escapeHtml(PRACTICE_MAPS.find(map=>map.id===id).name);
  const completed=season.fixtures.filter(item=>item.result).length,totals=officialTotals(world,world.playerClubId);
  const selectable=fixture?.kind===rule.leagueId && season.weekSchedule?.phase==='match' && !fixture.lineups && world.teamTraining?.status!=='pending';
  const results=matches=>`<div class="table-scroll"><table><thead><tr><th>구단</th><th>결과</th><th>상대</th><th>완료 맵</th></tr></thead><tbody>${matches.map(item=>`<tr><th scope="row">${team(item.homeClubId)}</th><td>${item.result?`${item.result.homeScore}:${item.result.awayScore}${item.result.forfeit?' 기권':''}`:'예정'}</td><td>${team(item.awayClubId)}</td><td>${(item.scores??[]).map((score,j)=>`${j+1}맵 ${score.homeScore}:${score.awayScore}`).join(' · ')||'—'}</td></tr>`).join('')}</tbody></table></div>`;
  screen.innerHTML=`<div class="page-heading"><p class="eyebrow">${rule.leagueId.toUpperCase()} LEAGUE / BO3</p><h1 tabindex="-1">${rule.name} 정규 시즌</h1><p class="lead">${rule.teams}팀 · 1회전 · 팀당 BO3 ${rule.weeks}매치 · ${completed}/${season.fixtures.length}매치 완료</p></div>
    <section class="panel"><div class="roster-heading"><h2>${tie?`${rule.name} 순위 결정전 · BO1`:playoffs?`${rule.name} 플레이오프 · BO3`:fixture?`정규 ${fixture.week}/${rule.weeks}주 · BO3`:'정규 일정 완료'}</h2>${fixture?`<button class="button primary" data-action="start-official"${status.canPlay?'':' disabled'}>${tie?'결정전':fixture.scores.length?'다음 맵':'BO3'} 시작 →</button>`:''}</div>
    <p class="official-status" role="status">${escapeHtml(status.message)}</p>
    ${status.phase==='tiebreak-ai'?'<button class="button primary" data-action="advance-tiebreak-ai">AI 결정전 진행 →</button>':''}
    ${status.phase==='playoff-ai'?'<button class="button primary" data-action="advance-playoff-ai">AI 플레이오프 진행 →</button>':''}
    ${fixture?`<div class="season-start-teams">${team(fixture.homeClubId)} vs ${team(fixture.awayClubId)}</div>
      ${selectable?`<h3>내 팀 선택 맵</h3><div class="save-buttons">${PRACTICE_MAPS.map(map=>`<button class="button ${fixture.mapPicks?.[fixture.homeClubId===world.playerClubId?'home':'away']===map.id?'primary':'secondary'}" data-action="${rule.leagueId==='city'?'pick-city-map':'pick-domestic-map'}" data-fixture-id="${fixture.id}" data-map-id="${map.id}">${escapeHtml(map.name)}</button>`).join('')}</div>`:''}
      ${tie?'<p>단판 MR12 · 맵/시작 진영 고정 추첨 · 기권 0:13 · 퍼즈 3회</p>':fixture.mapPicks?`<p>1맵 · 홈 선택 ${mapName(fixture.mapPicks.home)} → 2맵 · 원정 선택 ${mapName(fixture.mapPicks.away)} → 3맵 ${mapName(fixture.maps[2].mapId)}</p>`:'<p>주간 준비 후 내 팀이 1맵을 고르면 상대가 남은 맵 중 1맵을 선택합니다.</p>'}
      ${!tie?`<p>BO3 ${fixture.scores.filter(score=>score.homeScore>score.awayScore).length}:${fixture.scores.filter(score=>score.awayScore>score.homeScore).length} · 퍼즈 잔여 ${fixture.pausesRemaining}/3회</p>`:''}`:''}
    <button class="button secondary" data-action="club">${status.phase==='playoff-unscheduled'?'내 구단 · 플레이오프 주간 준비':'내 구단'} →</button>
    <p data-description="${rule.name} BO3 규칙">각 팀의 선택 맵을 홈·원정 순서로 진행하고 남은 맵이 3맵입니다. 2맵 선승, 시작 주전 고정, 시리즈 전체 퍼즈 3회입니다. 완료 맵만 저장하며 중도 이탈·새로고침은 기존 승리 맵을 보존한 시리즈 기권패입니다. 상금은 시리즈 승리 $500·패배 $200·기권 $0, 공식 전적·출전·스폰서도 시리즈당 한 번 집계합니다.</p></section>
    ${playoffs?`<section class="panel"><h2>상위 4팀 플레이오프 대진</h2>${playoffs.series.map((series,i)=>`<h3>${i<2?`준결승 ${i+1}`:'결승'}</h3>${results([series])}`).join('')}${ranks?`<h3>${rule.name} 최종 순위</h3><div class="world-summary">${ranks.map((id,i)=>`<span class="season-team"><strong>${i+1}위</strong>${team(id)}</span>`).join('')}</div><p>${playoffs.settled?`마지막 주 정산·${rule.name} 스폰서 계약 종료 완료`:'경기 결과 확정 · 마지막 하루 정산 대기'}</p>${promotionMarkup}`:''}<p data-description="${rule.name} 플레이오프">상위 4팀을 고정 무작위로 짝지어 같은 주에 준결승·결승을 치릅니다. 3위전 없이 준결승 패자의 정규 순위로 3·4위를 정합니다. 주간 준비·팀 훈련·마지막 정산은 한 번이며 마지막 스폰서 수입 지급 뒤 시즌 계약을 종료합니다.</p></section>`:''}
    ${season.tiebreaks?.length?`<section class="panel"><h2>${rule.name} 순위 결정전 기록</h2>${season.tiebreaks.map((round,i)=>`<details class="season-week"${round.fixtures.some(match=>!match.result)?' open':''}><summary>결정전 ${i+1} · ${round.rank}~${round.rank+round.clubIds.length-1}위</summary>${results(round.fixtures)}</details>`).join('')}</section>`:''}
    <section class="panel"><h2>공식 누적 기록 · PC방 + 시 리그${['province','national'].includes(rule.leagueId)?' + 도 리그':''}${rule.leagueId==='national'?' + 전국 리그':''}</h2><p>${totals.matches}매치 · ${totals.wins}승 ${totals.losses}패 · 상금 $${totals.rewards.toLocaleString('en-US')}</p></section>
    <section class="panel"><h2>${rule.name} 정규 순위</h2><div class="table-scroll"><table><thead><tr><th>순위</th><th>구단</th><th>경기</th><th>승</th><th>패</th></tr></thead><tbody>${domesticStandings(season).map(row=>`<tr${row.clubId===world.playerClubId?' class="season-home"':''}><td>${row.tied?'공동 ':''}${row.rank}위</td><th scope="row">${team(row.clubId)}</th><td>${row.played}</td><td>${row.wins}</td><td>${row.losses}</td></tr>`).join('')}</tbody></table></div><p data-description="${rule.name} 순위">${rankingNote}</p></section>
    <section class="panel"><h2>정규 ${rule.weeks}주 일정</h2>${Array.from({length:rule.weeks},(_,i)=>`<details class="season-week"${fixture?.week===i+1?' open':''}><summary>정규 ${i+1}주 · BO3 ${rule.teams/2}매치</summary><div class="table-scroll"><table><thead><tr><th>구단</th><th>결과</th><th>상대</th><th>완료 맵</th></tr></thead><tbody>${season.fixtures.filter(item=>item.week===i+1).map(item=>`<tr><th scope="row">${team(item.homeClubId)}</th><td>${item.result?`${item.result.homeScore}:${item.result.awayScore}${item.result.forfeit?' 기권':''}`:'예정'}</td><td>${team(item.awayClubId)}</td><td>${item.scores.map((score,j)=>`${j+1}맵 ${score.homeScore}:${score.awayScore}`).join(' · ')||'—'}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}</section>
    <section class="panel"><details><summary>PC방 최종 결과</summary><div class="world-summary">${playoffFinalRanks(world.pcSeason.playoffs).map((id,i)=>`<span class="season-team"><strong>${i+1}위</strong>${team(id)}</span>`).join('')}</div></details></section>`;
  for(const archived of [world.citySeason,world.provinceSeason])if(archived && archived!==season)screen.innerHTML+=`<section class="panel"><details><summary>${domesticRule(archived).name} 최종 결과</summary><div class="world-summary">${playoffFinalRanks(archived.playoffs).map((id,i)=>`<span class="season-team"><strong>${i+1}위</strong>${team(id)}</span>`).join('')}</div></details></section>`;
  return screen;
}
