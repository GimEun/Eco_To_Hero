import { officialMatchConfig } from '../src/game/official-match.js';

export function summaryFixture(world,fixture,mapNumber=1) {
  const ownHome=fixture.homeClubId===world.playerClubId,result=fixture.scores?.[mapNumber-1]??fixture.result;
  const score={home:ownHome?result.homeScore:result.awayScore,away:ownHome?result.awayScore:result.homeScore};
  const config=officialMatchConfig(world,{...fixture,result:null,scores:fixture.scores?.slice(0,mapNumber-1)});
  const lineups=fixture.lineups??world.officialRecords.receipts.find(receipt=>receipt.fixtureId===fixture.id).lineups;
  const initial=ownHome?config.attackTeam:config.attackTeam==='home'?'away':'home';
  const loser=score.home<score.away?'home':'away',winner=loser==='home'?'away':'home',cumulative={home:0,away:0};
  return {mapId:config.map.id,seed:config.seed,score,clubs:{home:world.playerClubId,away:ownHome?fixture.awayClubId:fixture.homeClubId},
    players:['home','away'].flatMap(team=>lineups[ownHome?team:team==='home'?'away':'home'].map((playerId,index)=>({id:`${team}-${index+1}`,playerId,team,
      stats:{kills:0,deaths:0,assists:0,damage:0,shots:0,hits:0},condition:{happiness:70,fatigue:0}}))),
    rounds:Array.from({length:score.home+score.away},(_,index)=>{
      const won=index<score[loser]?loser:winner;cumulative[won]++;
      return {roundNumber:index+1,attackTeam:index<12?initial:initial==='home'?'away':'home',winner:won,reason:'검사용 합성 라운드',ticks:1,overtime:0,score:{...cumulative},highlights:[],
        strategies:[{tick:0,site:'A',attack:{home:'execute',away:'execute'},defense:{home:'standard',away:'standard'},manual:{attack:false,defense:false}}]};
    })};
}

