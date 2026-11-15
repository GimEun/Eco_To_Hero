import { reportFixture } from './match-reports.js';
import { counselContent,chooseCounselContent } from '../data/counsel-content.js';
import { COUNSEL_TYPES,COUNSEL_COOLDOWN,counselKey,counselId } from './counseling-candidates.js';
import { ownCounselReceipts,drawCounsels } from './counseling.js';

const fail=()=>{throw new Error('상담 판정·저장 상태가 올바르지 않습니다.');};
const integer=value=>Number.isSafeInteger(value) && value>=0;
const meter=value=>Number.isInteger(value) && value>=0 && value<=100;
const clamp=value=>Math.max(0,Math.min(100,value));

function validateReply(reply,record,state,world) {
  if(!reply || typeof reply.choiceId!=='string' || !/^[a-z0-9-]{1,64}$/.test(reply.choiceId)
    || !integer(reply.day) || reply.day<record.day || reply.day>world.day
    || !integer(reply.sequence) || reply.sequence<record.sequence || reply.sequence>state.sequence)fail();
  for(const key of ['happiness','fatigue'])if(!meter(reply.before?.[key]) || !meter(reply.after?.[key])
    || !Number.isInteger(reply.effect?.[key]) || Math.abs(reply.effect[key])>100
    || reply.after[key]!==clamp(reply.before[key]+reply.effect[key]))fail();
  const follow=reply.followUp;
  if(follow!==null && (!follow || !Object.hasOwn(COUNSEL_TYPES,follow.type) || !integer(follow.afterMatches)
    || follow.afterMatches<1 || !Number.isSafeInteger(reply.sequence+follow.afterMatches)))fail();
  return {choiceId:reply.choiceId,day:reply.day,sequence:reply.sequence,
    before:{happiness:reply.before.happiness,fatigue:reply.before.fatigue},effect:{happiness:reply.effect.happiness,fatigue:reply.effect.fatigue},
    after:{happiness:reply.after.happiness,fatigue:reply.after.fatigue},followUp:follow?{type:follow.type,afterMatches:follow.afterMatches}:null};
}

function validateEvidence(row,record,fixture,world,followUps,counsels) {
  const evidence=row.evidence;if(!evidence || typeof evidence.source!=='string')fail();
  const won=(fixture.homeClubId===world.playerClubId)===(fixture.result.homeScore>fixture.result.awayScore);
  if(evidence.source==='result') {
    if(row.type!==(won?'team-win':'team-loss') || evidence.won!==won)fail();
    return {source:'result',won};
  }
  if(evidence.source==='happiness' || evidence.source==='fatigue') {
    if(!meter(evidence.value) || (evidence.source==='happiness'?(row.type!=='low-happiness' || evidence.value>=45):(row.type!=='high-fatigue' || evidence.value<50)))fail();
    return {source:evidence.source,value:evidence.value};
  }
  if(evidence.source==='follow-up') {
    const follow=followUps.find(item=>item?.id===evidence.followUpId);
    if(!follow || follow.playerId!==row.playerId || follow.type!==row.type || follow.dueSequence>record.sequence
      || (follow.status==='consumed' && counsels.get(follow.consumedBy)?.sequence<record.sequence))fail();
    return {source:'follow-up',followUpId:follow.id};
  }
  if(evidence.source!=='round' || COUNSEL_TYPES[row.type]!==2 || !integer(evidence.mapNumber) || evidence.mapNumber<1
    || evidence.mapNumber>(fixture.scores?.length??1) || !integer(evidence.roundNumber) || evidence.roundNumber<1 || !integer(evidence.tick))fail();
  const result=fixture.scores?.[evidence.mapNumber-1]??fixture.result;
  if(result.forfeit || evidence.roundNumber>result.homeScore+result.awayScore)fail();
  if(row.type==='multi-kill' && (!Number.isInteger(evidence.kills) || evidence.kills<3 || evidence.kills>5))fail();
  const map=world.matchReports.find(entry=>counselKey(entry)===counselKey(record))?.maps.find(map=>map.mapNumber===evidence.mapNumber);
  if(map) {
    const round=map.rounds[evidence.roundNumber-1],actor=map.players.find(actor=>actor.playerId===row.playerId && actor.team==='home');
    if(!actor || !round?.highlights.some(event=>event.type===row.type && event.actorId===actor.id && event.tick===evidence.tick
      && (row.type!=='multi-kill' || event.kills===evidence.kills)))fail();
  }
  return {source:'round',mapNumber:evidence.mapNumber,roundNumber:evidence.roundNumber,tick:evidence.tick,
    ...(row.type==='multi-kill'?{kills:evidence.kills}:{})};
}

export function validateCounseling(value,world) {
  if(!value || !integer(value.sequence) || !Array.isArray(value.records) || !Array.isArray(value.followUps))fail();
  if(!value.records.length) {
    if(value.sequence || value.followUps.length)fail();
    return {sequence:0,records:[],followUps:[]};
  }
  const receipts=new Map(ownCounselReceipts(world).map(receipt=>[counselKey(receipt),receipt]));
  if(value.records.length>receipts.size)fail();
  const rawCounsels=new Map();
  for(const record of value.records)if(Array.isArray(record?.counsels))for(const counsel of record.counsels) {
    if(rawCounsels.has(counsel?.id))fail();rawCounsels.set(counsel?.id,{counsel,sequence:record.sequence});
  }
  if(value.followUps.length>rawCounsels.size)fail();
  let sequence=0;
  const used=new Set(),playersCooldown=new Map(),typesCooldown=new Map();
  const records=value.records.map(record=>{
    const receipt=record && receipts.get(counselKey(record)),fixture=receipt && reportFixture(world,receipt);
    if(!receipt || used.has(counselKey(record)) || !integer(record.day) || record.day<receipt.day || record.day>world.day
      || !Array.isArray(record.candidates) || record.candidates.length>40 || !Array.isArray(record.rolls) || record.rolls.length>8
      || !Array.isArray(record.counsels) || record.counsels.length>4)fail();
    used.add(counselKey(record));
    if(record.reason==='baseline' || record.reason==='forfeit') {
      if(record.sequence!==null || record.candidates.length || record.rolls.length || record.counsels.length
        || record.reason==='baseline' && sequence!==0 || record.reason==='forfeit' && !fixture.result.forfeit)fail();
      return {year:record.year,fixtureId:record.fixtureId,day:record.day,sequence:null,reason:record.reason,candidates:[],rolls:[],counsels:[]};
    }
    if(!['incomplete','skipped','draw'].includes(record.reason) || fixture.result.forfeit || record.sequence!==++sequence)fail();
    if(record.reason!=='draw' && (record.candidates.length || record.rolls.length || record.counsels.length))fail();
    const context=record.year===(world.seasonYears?.year??1)?world:world.seasonYears.archives.find(archive=>archive.year===record.year);
    const lineups=fixture.lineups??context.officialRecords.receipts.find(receipt=>receipt.fixtureId===record.fixtureId)?.lineups;
    if(!lineups)fail();
    const lineup=lineups[fixture.homeClubId===world.playerClubId?'home':'away'],poolKeys=new Set();
    const candidates=record.candidates.map(row=>{
      if(!row || !lineup.includes(row.playerId) || !Object.hasOwn(COUNSEL_TYPES,row.type) || row.weight!==COUNSEL_TYPES[row.type]
        || poolKeys.has(`${row.playerId}:${row.type}`) || sequence-(playersCooldown.get(row.playerId)??-Infinity)<=COUNSEL_COOLDOWN
        || sequence-(typesCooldown.get(row.type)??-Infinity)<=COUNSEL_COOLDOWN)fail();
      poolKeys.add(`${row.playerId}:${row.type}`);
      return {playerId:row.playerId,type:row.type,weight:row.weight,evidence:validateEvidence(row,record,fixture,world,value.followUps,rawCounsels)};
    });
    const drawn=drawCounsels(world.seed,record,candidates);
    if(JSON.stringify(record.rolls)!==JSON.stringify(drawn.rolls) || record.counsels.length!==drawn.selected.length)fail();
    const counsels=record.counsels.map((counsel,index)=>{
      const picked=drawn.selected[index];
      if(!counsel || counsel.id!==counselId(record,index) || counsel.playerId!==picked.playerId || counsel.type!==picked.type
        || !['pending','resolved'].includes(counsel.status) || counsel.status==='pending' && counsel.reply!==null)fail();
      const content=counselContent(counsel.contentId);
      if(!content || content.type!==counsel.type || counsel.contentId!==chooseCounselContent(world.seed,counsel,picked.evidence))fail();
      const reply=counsel.status==='resolved'?validateReply(counsel.reply,record,value,world):null;
      playersCooldown.set(counsel.playerId,sequence);typesCooldown.set(counsel.type,sequence);
      return {id:counsel.id,playerId:counsel.playerId,type:counsel.type,status:counsel.status,reply,contentId:counsel.contentId};
    });
    return {year:record.year,fixtureId:record.fixtureId,day:record.day,sequence,reason:record.reason,candidates,rolls:[...record.rolls],counsels};
  });
  if(sequence!==value.sequence)fail();
  const allCounsels=new Map(records.flatMap(record=>record.counsels.map(counsel=>[counsel.id,{record,counsel}]))),usedFollowUps=new Set();
  const followUps=value.followUps.map(follow=>{
    const source=allCounsels.get(follow?.sourceId),definition=source?.counsel.reply?.followUp;
    if(!source || !definition || follow.id!==`${follow.sourceId}:follow` || usedFollowUps.has(follow.id)
      || follow.playerId!==source.counsel.playerId || follow.type!==definition.type
      || follow.dueSequence!==source.counsel.reply.sequence+definition.afterMatches || !integer(follow.dueSequence)
      || !['scheduled','consumed','expired'].includes(follow.status))fail();
    usedFollowUps.add(follow.id);
    if(follow.status==='consumed') {
      const target=allCounsels.get(follow.consumedBy);
      if(!target || target.counsel.playerId!==follow.playerId || target.counsel.type!==follow.type || target.record.sequence<follow.dueSequence
        || !target.record.candidates.some(row=>row.playerId===follow.playerId && row.type===follow.type && row.evidence.followUpId===follow.id))fail();
    } else if(follow.consumedBy!==null)fail();
    return {id:follow.id,sourceId:follow.sourceId,playerId:follow.playerId,type:follow.type,dueSequence:follow.dueSequence,status:follow.status,consumedBy:follow.consumedBy};
  });
  if(followUps.length!==[...allCounsels.values()].filter(item=>item.counsel.reply?.followUp).length)fail();
  return {sequence,records,followUps};
}
