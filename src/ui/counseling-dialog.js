import { availableCounsels } from '../game/counseling.js';
import { counselContent } from '../data/counsel-content.js';
import { escapeHtml } from './html.js';

export function counselDialogMarkup(world,id,{saving=false,error='',required=false}={}) {
  const counsel=world.counseling.records.flatMap(record=>record.counsels).find(counsel=>counsel.id===id);
  const player=world.players.find(player=>player.id===counsel?.playerId),content=counselContent(counsel?.contentId),pending=availableCounsels(world);
  if(!counsel || !player || !content)return '<h2 id="counsel-title">현재 대기 중인 상담이 없습니다.</h2><button class="button secondary" data-counsel="later">닫기</button>';
  const owned=world.clubs.find(club=>club.id===world.playerClubId).playerIds.includes(player.id);
  const blocked=required && pending.length>0;
  const answer=counsel.reply?content.answers.find(answer=>answer.id===counsel.reply.choiceId):null;
  const meter=counsel.reply?.after??{happiness:player.morale.happiness,fatigue:player.fatigue};
  const mood=meter.happiness>=90?'의욕적':meter.happiness>=75?'기분 좋음':meter.happiness>=45?'차분함':meter.happiness>=25?'기분이 가라앉음':'많이 침체됨';
  const fatigue=meter.fatigue>=75?'매우 지침':meter.fatigue>=50?'지침':meter.fatigue>=25?'피로가 느껴짐':'컨디션 여유';
  return `<header class="counsel-heading"><div><p class="eyebrow">PLAYER COUNSEL${content.followUp?' / FOLLOW UP':''}</p><h2 id="counsel-title">${escapeHtml(player.nickname)}의 이야기</h2></div>${blocked?'':`<button class="button secondary" data-counsel="later"${saving?' disabled':''}>${counsel.status==='resolved'?'닫기':'나중에'}</button>`}</header>
    <div class="counsel-layout"><div class="counsel-condition"><span>${mood}</span><span>${fatigue}</span></div>
    <section class="counsel-conversation"><p class="counsel-topic">${escapeHtml(content.title)}</p><p class="counsel-speech">${escapeHtml(content.dialogue)}</p>
      ${counsel.status==='resolved'?`<div class="counsel-reaction" role="status"><span>선수의 반응</span><p>${escapeHtml(answer?.reaction??'이전 답변을 기억하고 있습니다.')}</p><p class="input-hint">${escapeHtml(answer?.hint??'이미 답변한 상담입니다.')}</p></div>`
        :owned?`<div class="counsel-answers" aria-label="상담 답변">${content.answers.map(answer=>`<button class="counsel-answer" data-counsel="answer" data-choice="${answer.id}"${saving?' disabled':''}>${escapeHtml(answer.text)}</button>`).join('')}</div>`:'<p class="input-hint">현재 소속 선수가 아니어서 답변할 수 없습니다.</p>'}
      <p class="counsel-save-status" role="status" aria-live="polite">${saving?'답변 저장 중…':counsel.status==='resolved'?'답변을 저장했습니다.':''}</p>
      ${error?`<p class="counsel-error" role="alert">${escapeHtml(error)}</p>`:''}</section></div>
    <footer class="counsel-footer"><span>대기 상담 ${pending.length}건${blocked?' · 모든 상담에 답변하면 계속할 수 있습니다.':''}</span><div>${pending.some(next=>next.id!==id)?`<button class="button secondary" data-counsel="next"${saving?' disabled':''}>다음 상담 →</button>`:''}<button class="button primary" data-counsel="club"${saving||blocked?' disabled':''}>내 구단 →</button></div></footer>`;
}

export function openCounselingDialog({getWorld,onAnswer,onClub,onClose=()=>{},id=null,required=false}) {
  const world=getWorld(),first=id??availableCounsels(world)[0]?.id;
  if(!first)return null;
  const dialog=document.createElement('dialog');
  dialog.className='counsel-dialog';dialog.setAttribute('aria-labelledby','counsel-title');
  let current=first,saving=false,error='',navigating=false;
  const paint=()=>{
    dialog.innerHTML=counselDialogMarkup(getWorld(),current,{saving,error,required});dialog.setAttribute('aria-busy',String(saving));
    if(!saving)(dialog.querySelector('[data-counsel="answer"]')??dialog.querySelector('[data-counsel="next"]')??dialog.querySelector('[data-counsel="club"]'))?.focus({preventScroll:true});
  };
  const blocked=()=>required && availableCounsels(getWorld()).length>0;
  dialog.addEventListener('cancel',event=>{if(saving||blocked())event.preventDefault();});
  dialog.addEventListener('close',()=>{if (globalThis.CSS?.supports('transition-behavior', 'allow-discrete')) setTimeout(() => dialog.remove(), 140); else dialog.remove();if(!navigating)onClose();},{once:true});
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('[data-counsel]');if(!button || button.disabled || saving)return;
    const action=button.dataset.counsel;
    if(blocked() && ['later','club'].includes(action))return;
    if(action==='later'){dialog.close();return;}
    if(action==='club'){navigating=true;dialog.close();onClub();return;}
    if(action==='next') {
      const pending=availableCounsels(getWorld()),index=pending.findIndex(counsel=>counsel.id===current);
      const next=pending[(index+1)%pending.length];
      if(next){current=next.id;error='';paint();}return;
    }
    if(action==='answer') {
      saving=true;error='';paint();
      void Promise.resolve().then(()=>onAnswer(current,button.dataset.choice)).catch(failure=>{error=`답변을 저장하지 못했습니다. ${failure.message??'다시 시도해 주세요.'}`;})
        .finally(()=>{saving=false;paint();});
    }
  });
  document.body.append(dialog);paint();
  try {dialog.showModal();} catch(error) {dialog.remove();throw error;}
  (dialog.querySelector('[data-counsel="answer"]')??dialog.querySelector('[data-counsel="next"]')??dialog.querySelector('[data-counsel="club"]'))?.focus({preventScroll:true});
  return dialog;
}
