import { escapeHtml } from './html.js';
import { logoImage } from './club-logo.js';
import { isFreeSchedule } from '../game/season-calendar.js';
import { seasonYear,yearWeek } from '../game/season-year-context.js';
import { newYearIssue } from '../game/season-years.js';
import { yearAdvancePanel } from './year-advance-panel.js';
import { playoffFinalRanks } from '../game/pc-playoffs.js';
import { pcSeasonStandings } from '../game/pc-season.js';
import { domesticStandings } from '../game/domestic-season.js';
import { domesticFixtures } from '../game/domestic-finals.js';
import { worldFinalStandings } from '../game/world-finals.js';
import { worldGroupOutcome,worldFixtures } from '../game/world-groups.js';
import { officialTotals } from '../game/official-records.js';
import { PRACTICE_MAPS } from '../data/maps/index.js';

export function newYearButton(world) {
  if(!isFreeSchedule(world))return '';
  const issue=newYearIssue(world);
  return `<button class="button secondary" data-action="start-next-year"${issue?' disabled':''}>새해 시작 →</button>${issue?`<span class="input-hint">${escapeHtml(issue)}</span>`:''}${yearAdvancePanel(world)}`;
}

export function seasonYearsPanel(world,viewYear=null) {
  const current=seasonYear(world);
  return `<section class="panel"><div class="roster-heading"><h2>${current}년 차 · ${yearWeek(world)}주 차</h2>${newYearButton(world)}</div><div class="save-buttons"><button class="button ${viewYear===null?'primary':'secondary'}" data-action="view-season-year" data-year="current">현재 ${current}년 차</button>${(world.seasonYears?.archives??[]).map(archive=>`<button class="button ${viewYear===archive.year?'primary':'secondary'}" data-action="view-season-year" data-year="${archive.year}">${archive.year}년 차 기록</button>`).join('')}</div></section>`;
}

export function archivedYearMarkup(world,archive) {
  const clubs=new Map(world.clubs.map(club=>[club.id,club])),players=new Map(world.players.map(player=>[player.id,player]));
  const team=id=>`<span class="season-team">${logoImage(clubs.get(id).logoId)}${escapeHtml(clubs.get(id).name)}</span>`;
  const mapName=id=>escapeHtml(PRACTICE_MAPS.find(map=>map.id===id)?.name??id);
  const totals=officialTotals({...world,...archive,seasonYears:{archives:[]}},world.playerClubId);
  const sections=[['PC방',archive.pcSeason],['시 리그',archive.citySeason],['도 리그',archive.provinceSeason],['전국 리그',archive.nationalSeason],['세계 리그',archive.worldSeason]];
  const ranksFor=season=>{
    if(season.leagueId==='world') {
      const final=worldFinalStandings(season);if(final)return final;
      const stage=season.ranked??season,outcome=worldGroupOutcome(stage);
      return outcome?outcome.placements.flatMap(group=>group.clubIds.map((clubId,i)=>({rank:i+1,clubId,group:group.groupId}))):[];
    }
    const final=playoffFinalRanks(season.playoffs);if(final)return final.map((clubId,i)=>({rank:i+1,clubId}));
    return season.leagueId==='pc'?pcSeasonStandings(season):domesticStandings(season);
  };
  return `<div class="page-heading"><p class="eyebrow">SEASON HISTORY / READ ONLY</p><h1 tabindex="-1">${archive.year}년 차 기록</h1><p class="lead">누적 ${archive.startedDay}~${archive.endedDay}일 · 완료 결과 조회</p></div>
    <section class="panel"><h2>이 연도 공식 기록</h2><p>${totals.matches}매치 · ${totals.wins}승 ${totals.losses}패 · 상금 $${totals.rewards.toLocaleString('en-US')}</p><div class="table-scroll"><table><thead><tr><th>선수</th><th>출전</th><th>승</th><th>패</th></tr></thead><tbody>${Object.entries(totals.players).map(([id,record])=>`<tr><th scope="row">${escapeHtml(players.get(id)?.nickname??id)}</th><td>${record.appearances}</td><td>${record.wins}</td><td>${record.losses}</td></tr>`).join('')}</tbody></table></div></section>
    ${sections.filter(([,season])=>season).map(([name,season])=>{
      const fixtures=season.leagueId==='world'?worldFixtures(season):domesticFixtures(season),ranks=ranksFor(season);
      return `<section class="panel"><h2>${name} 보관 기록</h2><div class="world-summary">${ranks.map(row=>`<span class="season-team"><strong>${row.group?`${escapeHtml(row.group)} · `:''}${season.leagueId==='world' && season.playoffs && row.rank>=3?'공동 ':''}${row.rank}위</strong>${team(row.clubId)}</span>`).join('')}</div><details><summary>대진·완료 맵·출전 명단 ${fixtures.filter(fixture=>fixture.result).length}/${fixtures.length}매치</summary>${fixtures.map(fixture=>`<details class="season-week"><summary>${team(fixture.homeClubId)} ${fixture.result?`${fixture.result.homeScore}:${fixture.result.awayScore}${fixture.result.forfeit?' 기권':''}`:'미진행'} ${team(fixture.awayClubId)}</summary>${(fixture.maps??[]).map((map,i)=>`<p>${i+1}맵 · ${mapName(map.mapId)} · 홈 ${map.attackTeam==='home'?'공격':'수비'} 시작 · ${fixture.scores?.[i]?`${fixture.scores[i].homeScore}:${fixture.scores[i].awayScore}${fixture.scores[i].forfeit?' 기권':''}`:'미진행'}</p>`).join('')}${(()=>{const lineups=fixture.lineups??archive.officialRecords.receipts.find(receipt=>receipt.fixtureId===fixture.id)?.lineups;return lineups?`<p>홈 출전 · ${lineups.home.map(id=>escapeHtml(players.get(id)?.nickname??id)).join(' / ')}</p><p>원정 출전 · ${lineups.away.map(id=>escapeHtml(players.get(id)?.nickname??id)).join(' / ')}</p>`:'';})()}</details>`).join('')}</details></section>`;
    }).join('')}`;
}
