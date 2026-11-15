import { reportFixture } from './match-reports.js';

export const COUNSEL_TYPES = Object.freeze({
  'first-kill': 2, 'multi-kill': 2, 'bomb-planted': 2, 'bomb-defused': 2,
  'team-win': 1, 'team-loss': 1, 'low-happiness': 1, 'high-fatigue': 1,
});

export const COUNSEL_CHANCES = Object.freeze([0.6,0.2,0.1,0.05]);
export const COUNSEL_COOLDOWN = 5;
export const counselKey = entry => `${entry.year}:${entry.fixtureId}`;
export const counselId = (entry, index) => `${counselKey(entry)}:c${index+1}`;

export function counselCooldowns(state) {
  const players=new Map(),types=new Map();
  for(const record of state.records) for(const counsel of record.counsels) {
    players.set(counsel.playerId,record.sequence);types.set(counsel.type,record.sequence);
  }
  return {players,types};
}

export function fullCounselReport(world, entry) {
  const fixture=reportFixture(world,entry);
  if (!fixture?.result || fixture.result.forfeit) return null;
  const report=world.matchReports.find(report=>counselKey(report)===counselKey(entry));
  const count=fixture.scores?.length??1;
  if(!report || report.maps.length!==count || report.maps.some((map,index)=>map.mapNumber!==index+1))return null;
  return report;
}

// 실제 출전과 관측된 주요 사건만 후보 근거로 사용한다. 상태 후보는 판정 시점의 기존 수치다.
export function collectCounselCandidates(world, entry, sequence) {
  const fixture=reportFixture(world,entry),report=fullCounselReport(world,entry);
  if(!report)return [];
  const club=world.clubs.find(club=>club.id===world.playerClubId),players=new Map(world.players.map(player=>[player.id,player]));
  const eligible=new Set(report.maps[0].players.filter(actor=>actor.team==='home' && club.playerIds.includes(actor.playerId)).map(actor=>actor.playerId));
  const rows=new Map(),add=(playerId,type,evidence)=>{
    if(eligible.has(playerId))rows.set(`${playerId}:${type}`,{playerId,type,weight:COUNSEL_TYPES[type],evidence});
  };
  const won=(fixture.homeClubId===world.playerClubId)===(fixture.result.homeScore>fixture.result.awayScore);
  for(const playerId of eligible) {
    const player=players.get(playerId);
    add(playerId,won?'team-win':'team-loss',{source:'result',won});
    if(player.morale.happiness<45)add(playerId,'low-happiness',{source:'happiness',value:player.morale.happiness});
    if(player.fatigue>=50)add(playerId,'high-fatigue',{source:'fatigue',value:player.fatigue});
  }
  for(const map of report.maps)for(const round of map.rounds)for(const event of round.highlights) {
    if(!['first-kill','multi-kill','bomb-planted','bomb-defused'].includes(event.type))continue;
    const actor=map.players.find(actor=>actor.id===event.actorId && actor.team==='home');
    if(!actor || rows.has(`${actor.playerId}:${event.type}`))continue;
    add(actor.playerId,event.type,{source:'round',mapNumber:map.mapNumber,roundNumber:round.roundNumber,tick:event.tick,
      ...(event.type==='multi-kill'?{kills:event.kills}:{})});
  }
  for(const follow of world.counseling.followUps) {
    if(follow.status==='scheduled' && follow.dueSequence<=sequence && eligible.has(follow.playerId)) {
      add(follow.playerId,follow.type,{source:'follow-up',followUpId:follow.id});
    }
  }
  const cooldowns=counselCooldowns(world.counseling);
  return [...rows.values()].filter(row=>sequence-(cooldowns.players.get(row.playerId)??-Infinity)>COUNSEL_COOLDOWN
    && sequence-(cooldowns.types.get(row.type)??-Infinity)>COUNSEL_COOLDOWN);
}
