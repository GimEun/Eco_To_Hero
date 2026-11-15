import { escapeHtml } from './html.js';
import { logoImage } from './club-logo.js';
import { nextPlayoffSeries, playoffFinalRanks, pcQualification } from '../game/pc-playoffs.js';
import { officialWeekStatus } from '../game/weekly-official.js';
import { cityEntryIssue } from '../game/city-season.js';

export function playoffPanel(world) {
  const playoffs = world.pcSeason.playoffs, status = officialWeekStatus(world);
  const clubs = new Map(world.clubs.map(club => [club.id, club]));
  const team = id => `${logoImage(clubs.get(id).logoId)}<span>${escapeHtml(clubs.get(id).name)}</span>`;
  const next = nextPlayoffSeries(playoffs), ranks = playoffFinalRanks(playoffs);
  const qualification = pcQualification(playoffs, world.playerClubId);
  return `<section class="panel"><div class="roster-heading"><h2>PC방 플레이오프 · BO3</h2>${status.phase === 'playoff-ai' ? '<button class="button primary" data-action="advance-playoff-ai">AI 플레이오프 진행 →</button>' : status.canPlay && next ? `<button class="button primary" data-action="start-official">${next.scores.length ? '다음 맵' : 'BO3'} 시작 →</button>` : ''}</div>
    <p class="official-status" role="status">${escapeHtml(status.message)}</p>
    ${qualification?.qualified && playoffs.settled ? `<button class="button primary" data-action="enter-city"${cityEntryIssue(world)?' disabled':''}>시 리그 참가 →</button>` : ''}
    ${!playoffs ? '<p>내 구단에서 마지막 주 행동을 준비하면 고정 대진이 열립니다.</p><button class="button secondary" data-action="club">내 구단 · 주간 준비 →</button>' : `<div class="table-scroll"><table><caption class="sr-only">PC방 플레이오프 대진</caption><thead><tr><th>단계</th><th>구단</th><th>시리즈</th><th>상대</th><th>완료 맵</th></tr></thead><tbody>${playoffs.series.map((series, index) => `<tr><th scope="row">${index < 2 ? `준결승 ${index + 1}` : '결승'}</th><td><span class="season-team">${team(series.homeClubId)}</span></td><td>${series.result ? `${series.result.homeScore}:${series.result.awayScore}${series.result.forfeit ? ' 기권' : ''}` : `${series.scores.filter(score => score.homeScore > score.awayScore).length}:${series.scores.filter(score => score.awayScore > score.homeScore).length} 진행 대기`}</td><td><span class="season-team">${team(series.awayClubId)}</span></td><td>${series.scores.map((score, mapIndex) => `${mapIndex + 1}맵 ${score.homeScore}:${score.awayScore}`).join(' · ') || '—'}</td></tr>`).join('')}</tbody></table></div>`}
    ${ranks ? `<h3>내 구단 · 최종 ${qualification.rank}위 · ${qualification.qualified ? '시 리그 진출 확정' : '올해 공식 도전 탈락'}</h3><h3>시 리그 진출 2팀</h3><div class="world-summary">${qualification.qualifiedClubIds.map(id => `<span class="season-team">${team(id)}</span>`).join('')}</div><h3>PC방 최종 순위</h3><div class="world-summary">${ranks.map((id, index) => `<span class="season-team"><strong>${index + 1}위</strong>${team(id)}${index < 2 ? '<span class="tag">시 리그 진출</span>' : ''}</span>`).join('')}</div><p>${playoffs.settled ? '주간 정산·시즌 스폰서 계약 종료 완료' : '경기 결과 확정 · 마지막 하루 정산 대기'}</p>` : ''}
    <p data-description="플레이오프 규칙">확정 상위 4팀을 무작위로 짝지어 2맵 선승 준결승·결승을 진행합니다. 퍼즈는 BO3 전체 3회이며 이탈 시 시리즈 기권패입니다. 시작 주전은 시리즈 동안 고정하며 완료 맵 결과만 저장합니다. 3위전은 없고 준결승 패자는 정규 순위로 3·4위를 정합니다. 상금·공식 실적은 시리즈당 1회, 기권은 상금·선수 출전·스폰서 실적을 주지 않습니다.</p></section>`;
}
