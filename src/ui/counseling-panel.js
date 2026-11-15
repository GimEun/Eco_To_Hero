import { availableCounsels } from '../game/counseling.js';
import { counselContent } from '../data/counsel-content.js';
import { escapeHtml } from './html.js';

export function counselingPanel(world) {
  if(!world)return '';
  const pending=availableCounsels(world),players=new Map(world.players.map(player=>[player.id,player.nickname]));
  const resolved=world.counseling.records.flatMap(record=>record.counsels.filter(counsel=>counsel.status==='resolved')).slice(-5).reverse();
  return `<section class="panel counseling-panel" aria-labelledby="counseling-title"><div class="roster-heading"><h2 id="counseling-title">선수 상담</h2><button class="button ${pending.length?'primary':'secondary'}" data-action="open-counseling"${pending.length?'':' disabled'}>대기 상담 ${pending.length}건</button></div>
    <p class="input-hint">${pending.length?'선수의 이야기를 듣고 답변을 선택하세요. 나중에 다시 이어갈 수 있습니다.':'공식 경기 뒤 선수의 이야기가 도착하면 이곳에서 이어갑니다.'}</p>
    ${resolved.length?`<details><summary>최근 상담 결과</summary><ul class="counsel-history">${resolved.map(counsel=>`<li><span>${escapeHtml(players.get(counsel.playerId))} · ${escapeHtml(counselContent(counsel.contentId).title)}</span><button class="button secondary" data-action="open-counseling" data-counsel-id="${escapeHtml(counsel.id)}">다시 보기</button></li>`).join('')}</ul></details>`:''}</section>`;
}
