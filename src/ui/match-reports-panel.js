import { escapeHtml } from './html.js';
import { reportFixture, MATCH_REPORT_LIMIT } from '../game/match-reports.js';
import { PRACTICE_MAPS } from '../data/maps/index.js';

const ATTACK={execute:'집중 진입',split:'분산 진입'};
const DEFENSE={standard:'기본 수비',forward:'전진 수비'};

export function matchReportsPanel(world, year=null) {
  const reports=(world.matchReports??[]).filter(entry=>year===null || entry.year===year).slice().reverse();
  const players=new Map(world.players.map(player=>[player.id,player.nickname]));
  const clubs=new Map(world.clubs.map(club=>[club.id,club.name]));
  return `<section class="panel match-reports-panel" aria-labelledby="match-reports-title"><div class="roster-heading"><h2 id="match-reports-title">공식 경기 상세 기록</h2><span class="tag muted-tag">최근 ${MATCH_REPORT_LIMIT}매치·시리즈</span></div>
    <p class="input-hint" data-description="공식 경기 상세 기록">완료 맵의 실제 통계를 보관합니다. 기권한 미완료 맵과 도입 전 경기의 통계는 표시하지 않습니다. 경기 기록은 상담 근거로 사용할 예정이며 현재 선수 상태를 바꾸지 않습니다.</p>
    ${reports.length?reports.map(entry=>{
      const fixture=reportFixture(world,entry),home=fixture.homeClubId===world.playerClubId;
      const outcome=fixture.result?`${home?fixture.result.homeScore:fixture.result.awayScore}:${home?fixture.result.awayScore:fixture.result.homeScore}${fixture.result.forfeit?' · 기권':''}`:'시리즈 진행 중';
      return `<details class="season-week"><summary>${entry.year}년 차 · ${escapeHtml(clubs.get(entry.maps[0].clubs.away))} · ${outcome}<small> · 완료 맵 ${entry.maps.length}개</small></summary>${entry.maps.map(map=>{
        const actors=new Map(map.players.map(actor=>[actor.id,players.get(actor.playerId)??actor.playerId]));
        const name=id=>escapeHtml(actors.get(id)??id);
        const eventText=event=>event.type==='first-kill'?`첫 처치 · ${name(event.actorId)} → ${name(event.targetId)}`
          :event.type==='multi-kill'?`${event.kills}킬 · ${name(event.actorId)}`:event.type==='bomb-planted'?`폭탄 설치 · ${name(event.actorId)}`
          :event.type==='bomb-defused'?`폭탄 해체 · ${name(event.actorId)}`:escapeHtml(event.reason);
        return `<details class="match-report-map"><summary>${map.mapNumber}맵 · ${escapeHtml(PRACTICE_MAPS.find(item=>item.id===map.mapId)?.name??map.mapId)} · ${map.score.home}:${map.score.away} · ${map.rounds.length}라운드</summary>
          <div class="table-scroll"><table><caption>선수별 경기 누적 기록 · ADR은 완료 라운드당 평균 피해</caption><thead><tr><th>선수</th><th>K / D / A</th><th>피해 · ADR</th><th>명중 / 발사 · 명중률</th><th>시작 행복도 / 피로</th></tr></thead><tbody>${map.players.map(actor=>{
            const stats=actor.stats;
            return `<tr><th scope="row">${escapeHtml(players.get(actor.playerId)??actor.playerId)}<small> · ${actor.team==='home'?'내 팀':'상대'}</small></th><td>${stats.kills} / ${stats.deaths} / ${stats.assists}</td><td>${stats.damage} · ${(stats.damage/map.rounds.length).toFixed(1)}</td><td>${stats.hits} / ${stats.shots} · ${stats.shots?`${(stats.hits/stats.shots*100).toFixed(1)}%`:'—'}</td><td>${actor.condition.happiness} / ${actor.condition.fatigue}</td></tr>`;
          }).join('')}</tbody></table></div>
          <details><summary>라운드·전술·주요 장면 ${map.rounds.length}개</summary>${map.rounds.map(round=>`<details class="match-report-round"><summary>${round.roundNumber}R · ${round.winner==='home'?'승리':'패배'} · ${round.score.home}:${round.score.away} · 내 팀 ${round.attackTeam==='home'?'공격':'수비'}${round.overtime?` · 연장 ${round.overtime}`:''}</summary><p>${escapeHtml(round.reason)}</p><ul>${round.highlights.filter(event=>event.type!=='round-end').map(event=>`<li>${(event.tick*0.05).toFixed(2)}초 · ${eventText(event)}</li>`).join('')||'<li>처치·설치·해체 하이라이트 없음</li>'}</ul><ul>${round.strategies.map(change=>{
            const attack=round.attackTeam,defense=attack==='home'?'away':'home';
            return `<li>${(change.tick*0.05).toFixed(2)}초 · 목표 ${change.site} · 공격 ${ATTACK[change.attack[attack]]??'기본'} · 수비 ${DEFENSE[change.defense[defense]]??'기본'}${change.manual.attack||change.manual.defense?' · 내 팀 수동 전략 사용':''}</li>`;
          }).join('')}</ul></details>`).join('')}</details></details>`;
      }).join('')}</details>`;
    }).join(''):'<p class="input-hint">아직 저장된 상세 기록이 없습니다. 다음 공식 경기의 완료 맵부터 기록합니다.</p>'}</section>`;
}
