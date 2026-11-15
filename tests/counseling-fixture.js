import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { recordPcMatch } from '../src/game/pc-season.js';
import { officialLineups,applyOfficialReceipt } from '../src/game/official-records.js';
import { appendMatchReport } from '../src/game/match-reports.js';
import { summaryFixture } from './match-report-fixture.js';
import { recruitPlayer,signingFee } from '../src/game/roster.js';
import { getAffiliations } from '../src/game/world-selectors.js';

export function counselWorld(seed=42,reserve=false) {
  const world=createWorld(createClub('Counsel Test').club,seed);
  if(reserve) {
    const affiliated=getAffiliations(world);
    const player=world.players.filter(player=>!affiliated.has(player.id)).sort((a,b)=>signingFee(a)-signingFee(b)).find(player=>Math.max(player.aim,player.intelligence,player.stamina)<=54);
    if(!recruitPlayer(world,player.id).ok)throw Error('reserve recruit failed');
  }
  world.seasonCalendar={mode:'legacy',phase:'season'};return world;
}

// 판정·저장 규약 검사용 합성 경기다. 실제 엔진 통계 수집은 match-reports.test.js에서 검사한다.
export function finishCounselFixture(world,{report=true,forfeit=false,signals=true}={}) {
  const fixture=world.pcSeason.fixtures.find(fixture=>!fixture.result && [fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId));
  const home=fixture.homeClubId===world.playerClubId;
  const result=forfeit?{homeScore:home?0:13,awayScore:home?13:0,forfeit:true}:{homeScore:home?13:6,awayScore:home?6:13};
  const lineups=officialLineups(world,fixture);
  if(!recordPcMatch(world.pcSeason,fixture.id,result).ok)throw Error('fixture failed');
  applyOfficialReceipt(world,fixture,lineups);
  if(report && !forfeit) {
    const data=summaryFixture(world,fixture);
    if(signals) {
      const actors=data.players.filter(actor=>actor.team==='home');
      const plant=data.rounds.find(round=>round.attackTeam==='home'),defuse=data.rounds.find(round=>round.attackTeam==='away');
      data.rounds[0].highlights.push({type:'first-kill',tick:1,actorId:actors[0].id,targetId:'away-1'});
      data.rounds[1].highlights.push({type:'multi-kill',tick:1,actorId:actors[1].id,kills:3});
      plant.highlights.push({type:'bomb-planted',tick:1,actorId:actors[2].id});
      defuse.highlights.push({type:'bomb-defused',tick:1,actorId:actors[3].id});
    }
    appendMatchReport(world,fixture.id,1,world.day,data);
  }
  return fixture;
}
