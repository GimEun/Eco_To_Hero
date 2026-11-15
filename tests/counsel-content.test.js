import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNSEL_CONTENT,COUNSEL_PROFILES,counselContent,chooseCounselContent } from '../src/data/counsel-content.js';
import { COUNSEL_TYPES } from '../src/game/counseling-candidates.js';
import { counselWorld,finishCounselFixture } from './counseling-fixture.js';
import { evaluateCounseling,answerCounseling,availableCounsels } from '../src/game/counseling.js';
import { createSave,restoreWorld } from '../src/storage/save-data.js';
import { counselDialogMarkup,openCounselingDialog } from '../src/ui/counseling-dialog.js';
import { counselingPanel } from '../src/ui/counseling-panel.js';
import { rosterTable } from '../src/ui/screens.js';

function pendingWorld() {
  for(let seed=0;seed<100;seed++) {
    const world=counselWorld(seed),fixture=finishCounselFixture(world);evaluateCounseling(world,fixture.id);
    if(availableCounsels(world).length)return world;
  }
  assert.fail('no counsel');
}
const trip=world=>assert.deepEqual(restoreWorld(createSave(world)),world);

test('32종은 근거8종별 일반3/후속1·답변3개와 고유 대사/반응·승인된 효과를 갖는다',()=>{
  assert.equal(COUNSEL_CONTENT.length,32);assert.equal(new Set(COUNSEL_CONTENT.map(content=>content.id)).size,32);
  assert.equal(new Set(COUNSEL_CONTENT.map(content=>content.dialogue)).size,32);
  for(const type of Object.keys(COUNSEL_TYPES)) {
    const entries=COUNSEL_CONTENT.filter(content=>content.type===type);
    assert.equal(entries.filter(entry=>!entry.followUp).length,3);assert.equal(entries.filter(entry=>entry.followUp).length,1);
  }
  for(const content of COUNSEL_CONTENT) {
    assert.equal(content.answers.length,3);assert.equal(new Set(content.answers.map(answer=>answer.text)).size,3);
    content.answers.forEach((answer,index)=>{
      assert.deepEqual(answer.effect,COUNSEL_PROFILES[index].effect);assert.ok(answer.reaction.length>10);assert.ok(answer.hint.length>10);
      assert.doesNotMatch(answer.text+answer.reaction+answer.hint,/(행복도|피로)\s*[+-]\d|\d+%/);
      assert.equal(Boolean(answer.followUp),!content.followUp && index===1);
      if(answer.followUp)assert.deepEqual(answer.followUp,{type:content.type,afterMatches:6});
    });
  }
});

test('콘텐츠 선택은 결정적이고 일반과 후속 대화를 구분하며 저장 후에도 바뀌지 않는다',()=>{
  const variants=new Set();
  for(let i=0;i<100;i++) {
    const counsel={id:`1:pc-w1:c${i}`,type:'first-kill'},id=chooseCounselContent(42,counsel,{source:'round'});
    assert.equal(id,chooseCounselContent(42,counsel,{source:'round'}));variants.add(id);
    assert.equal(chooseCounselContent(42,counsel,{source:'follow-up'}),'first-kill-4');
  }
  assert.equal(variants.size,3);
  const world=pendingWorld(),id=availableCounsels(world)[0].contentId;trip(world);
  world.matchReports=[];assert.equal(availableCounsels(restoreWorld(createSave(world)))[0].contentId,id);
});

test('선택한 답변의 기존 상태 효과만 한 번 반영하고 조언은6경기 후속을 예약한다',()=>{
  for(const choice of ['encourage','advise','ease']) {
    const world=pendingWorld(),counsel=availableCounsels(world)[0],player=world.players.find(player=>player.id===counsel.playerId),before=structuredClone(world);
    const definition=counselContent(counsel.contentId).answers.find(answer=>answer.id===choice);
    assert.equal(answerCounseling(world,counsel.id,choice).ok,true);
    assert.equal(player.morale.happiness,Math.min(100,Math.max(0,before.players.find(p=>p.id===player.id).morale.happiness+definition.effect.happiness)));
    assert.equal(player.fatigue,Math.min(100,Math.max(0,before.players.find(p=>p.id===player.id).fatigue+definition.effect.fatigue)));
    for(const key of ['aim','intelligence','stamina','training'])assert.deepEqual(player[key],before.players.find(p=>p.id===player.id)[key]);
    assert.deepEqual(world.clubs,before.clubs);trip(world);
    const snapshot=structuredClone(world);assert.equal(answerCounseling(world,counsel.id,choice).ok,false);assert.deepEqual(world,snapshot);
    assert.equal(world.counseling.followUps.length,Number(choice==='advise'));
    if(choice==='advise')assert.equal(world.counseling.followUps[0].dueSequence,world.counseling.sequence+6);
  }
});

test('v46 대기/해결 상담은 효과·추첨을 보존하며 콘텐츠만 보충하고 잘못된 콘텐츠는 거부한다',()=>{
  for(const resolved of [false,true]) {
    const world=pendingWorld(),counsel=availableCounsels(world)[0];if(resolved)answerCounseling(world,counsel.id,'advise');
    const old=createSave(world);old.schemaVersion=46;
    for(const record of old.world.counseling.records)for(const item of record.counsels)delete item.contentId;
    const snapshot=structuredClone(old);assert.deepEqual(restoreWorld(old),world);assert.deepEqual(old,snapshot);
    const bad=structuredClone(world);bad.counseling.records[0].counsels[0].contentId='team-win-99';assert.throws(()=>createSave(bad),/상담 판정/);
  }
});

test('삭제한 초상화를 요청하지 않고 상담 상태와 답변은 유지한다',()=>{
  const world=pendingWorld(),counsel=availableCounsels(world)[0];
  const html=counselDialogMarkup(world,counsel.id);
  assert.doesNotMatch(html,/<img|counsel-portrait|counsel-face/);
  assert.match(html,/counsel-condition/);
  assert.equal((html.match(/data-counsel="answer"/g)??[]).length,3);
  assert.doesNotMatch(rosterTable(world.players.slice(0,5)),/counsel-portrait|counsel-face/);
});

test('대사·답변·반응은 이스케이프하고 숫자 효과 없이 보여주며 육성에서 결과를 다시 볼 수 있다',()=>{
  const world=pendingWorld(),counsel=availableCounsels(world)[0],player=world.players.find(player=>player.id===counsel.playerId);
  player.nickname='<img src=x>';
  const html=counselDialogMarkup(world,counsel.id);assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<h2[^>]*><img/);
  assert.equal((html.match(/data-counsel="answer"/g)??[]).length,3);assert.doesNotMatch(html,/(행복도|피로)\s*[+-]\d|\/100/);
  answerCounseling(world,counsel.id,'advise');
  const reaction=counselDialogMarkup(world,counsel.id);assert.match(reaction,/선수의 반응/);assert.doesNotMatch(reaction,/data-counsel="answer"/);
  assert.match(counselingPanel(world),/최근 상담 결과|다시 보기/);
});

function domFixture(t,{showError=false}={}) {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),children=new Set();let dialog;
  const body={append(element){children.add(element);}};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{body,createElement(){
    const listeners=new Map();
    dialog={innerHTML:'',open:false,attributes:{},setAttribute(key,value){this.attributes[key]=value;},addEventListener(type,callback){listeners.set(type,callback);},
      querySelector(selector){return this.innerHTML.includes(selector.slice(1,-1))?{focus(){}}:null;},
      showModal(){if(showError)throw Error('show failed');this.open=true;},close(){this.open=false;listeners.get('close')?.();},remove(){children.delete(this);},
      click(action,choice){const button={disabled:false,dataset:{counsel:action,choice}};listeners.get('click')({target:{closest:()=>button}});},
      escape(){let prevented=false;listeners.get('cancel')({preventDefault(){prevented=true;}});if(!prevented)this.close();return prevented;}};
    return dialog;
  }}});
  t.after(()=>previous?Object.defineProperty(globalThis,'document',previous):delete globalThis.document);
  return {get dialog(){return dialog;},children};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('Esc와 나중에는 답변하지 않고 대기 상태를 보존한다',t=>{
  const f=domFixture(t),world=pendingWorld(),before=structuredClone(world);let answers=0,closes=0;
  openCounselingDialog({getWorld:()=>world,onAnswer:()=>answers++,onClub(){},onClose:()=>closes++});
  assert.equal(f.dialog.open,true);assert.equal(f.dialog.escape(),false);assert.equal(f.children.size,0);assert.equal(answers,0);assert.equal(closes,1);assert.deepEqual(world,before);
  openCounselingDialog({getWorld:()=>world,onAnswer:()=>answers++,onClub(){}});f.dialog.click('later');assert.deepEqual(world,before);assert.equal(answers,0);
});

test('저장 중 중복 클릭/Esc를 막고 저장 실패는 대기를 유지해 재시도할 수 있다',async t=>{
  const f=domFixture(t);let world=pendingWorld(),attempts=0,rejectSave;
  const before=structuredClone(world);
  openCounselingDialog({getWorld:()=>world,onClub(){},onAnswer:async(id,choice)=>{
    attempts++;const candidate=structuredClone(world);assert.equal(answerCounseling(candidate,id,choice).ok,true);
    if(attempts===1)await new Promise((_,reject)=>{rejectSave=reject;});world=candidate;
  }});
  f.dialog.click('answer','advise');f.dialog.click('answer','advise');await flush();
  assert.equal(attempts,1);assert.equal(f.dialog.escape(),true);assert.equal(f.dialog.open,true);assert.deepEqual(world,before);
  rejectSave(Error('disk full'));await flush();assert.match(f.dialog.innerHTML,/disk full/);assert.deepEqual(world,before);
  f.dialog.click('answer','advise');await flush();assert.equal(attempts,2);assert.match(f.dialog.innerHTML,/선수의 반응/);trip(world);
});

test('모달 열기 실패는 대기를 지우지 않고 DOM을 정리한다',t=>{
  const f=domFixture(t,{showError:true}),world=pendingWorld(),before=structuredClone(world);
  assert.throws(()=>openCounselingDialog({getWorld:()=>world,onAnswer(){},onClub(){}}),/show failed/);
  assert.equal(f.children.size,0);assert.deepEqual(world,before);
});

test('여러 미응답 상담의 다음 버튼은 첫 두 개를 반복하지 않고 전체 목록을 순환한다',t=>{
  const f=domFixture(t);let world;
  for(let seed=0;seed<100;seed++) {
    const candidate=counselWorld(seed);
    for(let game=0;game<7;game++) {const fixture=finishCounselFixture(candidate);evaluateCounseling(candidate,fixture.id);}
    if(availableCounsels(candidate).length>=3){world=candidate;break;}
  }
  assert.ok(world);const queue=availableCounsels(world),before=structuredClone(world);
  openCounselingDialog({getWorld:()=>world,onAnswer(){assert.fail('navigation answered');},onClub(){}});
  for(let i=0;i<queue.length+1;i++) {
    assert.equal(f.dialog.innerHTML,counselDialogMarkup(world,queue[i%queue.length].id));f.dialog.click('next');
  }
  assert.deepEqual(world,before);f.dialog.click('later');
});
