import { randomUnit } from './random.js';
import { counselContent,chooseCounselContent } from '../data/counsel-content.js';
import { reportFixture } from './match-reports.js';
import { seasonYear } from './season-year-context.js';
import { bankruptcyIssue } from './bankruptcy.js';
import { COUNSEL_TYPES,COUNSEL_CHANCES,counselKey,counselId,fullCounselReport,collectCounselCandidates } from './counseling-candidates.js';

const clamp=value=>Math.max(0,Math.min(100,value));
export const ownCounselReceipts=world=>[...(world.seasonYears?.archives??[]).map(archive=>({year:archive.year,records:archive.officialRecords})),
  {year:seasonYear(world),records:world.officialRecords}].flatMap(year=>year.records.receipts.map(receipt=>({year:year.year,fixtureId:receipt.fixtureId,day:receipt.day})))
  .filter(entry=>{const fixture=reportFixture(world,entry);return [fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId);});

export function createCounseling(world=null) {
  return {sequence:0,records:world?ownCounselReceipts(world).map(entry=>({...entry,sequence:null,reason:'baseline',candidates:[],rolls:[],counsels:[]})):[],followUps:[]};
}

// 경기별 전용 난수를 사용하므로 주간 이벤트·주식·경기 계산의 추첨 순서를 소비하지 않는다.
export function drawCounsels(seed, entry, candidates) {
  let hash=(seed^0x636f756e)>>>0;
  for(const char of counselKey(entry))hash=Math.imul(hash^char.codePointAt(0),16777619)>>>0;
  const random={randomState:hash},rolls=[],selected=[];
  let pool=candidates;
  for(const chance of COUNSEL_CHANCES) {
    if(!pool.length)break;
    const roll=randomUnit(random);rolls.push(roll);
    if(roll>=chance)break;
    const pick=randomUnit(random);rolls.push(pick);
    let cursor=pick*pool.reduce((total,row)=>total+row.weight,0);
    const row=pool.find(row=>{cursor-=row.weight;return cursor<0;})??pool.at(-1);
    selected.push(row);
    pool=pool.filter(other=>other.playerId!==row.playerId && other.type!==row.type);
  }
  return {rolls,selected};
}

export function evaluateCounseling(world, fixtureId, year=seasonYear(world)) {
  const entry={year,fixtureId},state=world.counseling;
  if(bankruptcyIssue(world))return {ok:false,message:bankruptcyIssue(world)};
  if(state.records.some(record=>counselKey(record)===counselKey(entry)))return {ok:false,message:'이미 처리한 경기의 상담은 다시 추첨하지 않습니다.'};
  const receipts=ownCounselReceipts(world),receipt=receipts.at(-1),fixture=reportFixture(world,entry);
  if(year!==seasonYear(world) || !receipt || counselKey(receipt)!==counselKey(entry) || !fixture?.result)return {ok:false,message:'현재 연도의 가장 최근 내 공식 경기 종료 후에만 상담을 판정합니다.'};
  const processed=new Set(state.records.map(counselKey));
  const missing=receipts.filter(previous=>counselKey(previous)!==counselKey(entry) && !processed.has(counselKey(previous)));
  const normal=!fixture.result.forfeit;
  const additional=missing.filter(previous=>!reportFixture(world,previous).result.forfeit).length+Number(normal);
  if(!Number.isSafeInteger(state.sequence+additional))return {ok:false,message:'상담 경기 수를 더 늘릴 수 없습니다.'};
  // 호출을 놓친 정상 경기도 쿨다운 기간에는 센다. 지난 경기를 소급 추첨하지 않는다.
  for(const previous of missing) {
    const forfeit=reportFixture(world,previous).result.forfeit;
    state.records.push({...previous,day:world.day,sequence:forfeit?null:++state.sequence,reason:forfeit?'forfeit':'skipped',candidates:[],rolls:[],counsels:[]});
  }
  const sequence=normal?state.sequence+1:null;
  const complete=normal && fullCounselReport(world,entry);
  const candidates=complete?collectCounselCandidates(world,entry,sequence):[];
  const drawn=drawCounsels(world.seed,entry,candidates);
  const record={...entry,day:world.day,sequence,reason:!normal?'forfeit':!complete?'incomplete':'draw',candidates,rolls:drawn.rolls,
    counsels:drawn.selected.map((row,index)=>{
      const counsel={id:counselId(entry,index),playerId:row.playerId,type:row.type,status:'pending',reply:null};
      return {...counsel,contentId:chooseCounselContent(world.seed,counsel,row.evidence)};
    })};
  const owned=new Set(world.clubs.find(club=>club.id===world.playerClubId).playerIds);
  for(const follow of state.followUps) {
    if(follow.status==='scheduled' && !owned.has(follow.playerId))follow.status='expired';
    const index=drawn.selected.findIndex(row=>row.evidence.source==='follow-up' && row.evidence.followUpId===follow.id);
    if(index>=0){follow.status='consumed';follow.consumedBy=record.counsels[index].id;}
  }
  if(normal)state.sequence=sequence;
  state.records.push(record);
  return {ok:true,record,counsels:record.counsels,message:`상담 판정 완료 · ${record.counsels.length}건`};
}

export const pendingCounsels=world=>world.counseling.records.flatMap(record=>record.counsels.filter(counsel=>counsel.status==='pending'));

export const availableCounsels=world=>{
  const owned=new Set(world.clubs.find(club=>club.id===world.playerClubId).playerIds);
  return pendingCounsels(world).filter(counsel=>owned.has(counsel.playerId));
};

export function addCounselContent(world,state) {
  if(!state || !Array.isArray(state.records))return state;
  return {...state,records:state.records.map(record=>!Array.isArray(record?.counsels)?record:{...record,counsels:record.counsels.map(counsel=>{
    if(!counsel || typeof counsel.contentId==='string')return counsel;
    const evidence=record.candidates?.find(row=>row.playerId===counsel.playerId && row.type===counsel.type)?.evidence;
    return {...counsel,contentId:chooseCounselContent(world.seed,counsel,evidence)};
  })})};
}

export function answerCounseling(world,id,choiceId) {
  const counsel=world.counseling.records.flatMap(record=>record.counsels).find(counsel=>counsel.id===id);
  const answer=counselContent(counsel?.contentId)?.answers.find(answer=>answer.id===choiceId);
  if(!answer)return {ok:false,message:'선택할 수 있는 상담 답변이 아닙니다.'};
  return resolveCounsel(world,id,answer);
}

// 콘텐츠 계층의 답변 정의를 처리한다. 기본 능력·경험치·자금 효과는 허용하지 않는다.
export function resolveCounsel(world,id,answer) {
  const ended=bankruptcyIssue(world);if(ended)return {ok:false,message:ended};
  const state=world.counseling,counsel=state.records.flatMap(record=>record.counsels).find(counsel=>counsel.id===id);
  if(!counsel || counsel.status!=='pending')return {ok:false,message:'대기 중인 상담이 아니거나 이미 답변했습니다.'};
  const club=world.clubs.find(club=>club.id===world.playerClubId),player=world.players.find(player=>player.id===counsel.playerId);
  if(!club.playerIds.includes(counsel.playerId))return {ok:false,message:'현재 소속 선수의 상담에만 답변할 수 있습니다.'};
  if(!answer || typeof answer.id!=='string' || !/^[a-z0-9-]{1,64}$/.test(answer.id) || !answer.effect || typeof answer.effect!=='object' || Array.isArray(answer.effect)
    || Object.keys(answer.effect).some(key=>!['happiness','fatigue'].includes(key))
    || Object.values(answer.effect).some(value=>!Number.isInteger(value) || Math.abs(value)>100))return {ok:false,message:'상담 답변 효과가 올바르지 않습니다.'};
  const follow=answer.followUp;
  if(follow && (!Object.hasOwn(COUNSEL_TYPES,follow.type) || !Number.isSafeInteger(follow.afterMatches) || follow.afterMatches<1
    || !Number.isSafeInteger(state.sequence+follow.afterMatches)))return {ok:false,message:'후속 상담 일정이 올바르지 않습니다.'};
  const before={happiness:player.morale.happiness,fatigue:player.fatigue},effect={happiness:answer.effect.happiness??0,fatigue:answer.effect.fatigue??0};
  const after={happiness:clamp(before.happiness+effect.happiness),fatigue:clamp(before.fatigue+effect.fatigue)};
  counsel.reply={choiceId:answer.id,day:world.day,sequence:state.sequence,before,effect,after,
    followUp:follow?{type:follow.type,afterMatches:follow.afterMatches}:null};
  counsel.status='resolved';player.morale.happiness=after.happiness;player.fatigue=after.fatigue;
  if(follow)state.followUps.push({id:`${id}:follow`,sourceId:id,playerId:player.id,type:follow.type,dueSequence:state.sequence+follow.afterMatches,status:'scheduled',consumedBy:null});
  return {ok:true,message:'상담 답변을 반영했습니다.',counsel};
}
