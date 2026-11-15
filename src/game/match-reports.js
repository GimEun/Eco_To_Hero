import { matchPlayerStats } from '../simulation/match.js';
import { officialMatchConfig } from './official-match.js';
import { findOfficialFixture } from './pc-season.js';
import { seasonYear } from './season-year-context.js';

export const MATCH_REPORT_LIMIT = 30;
const STATS = ['kills','deaths','assists','damage','shots','hits'];
const sides = ['home','away'];
const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = () => { throw new Error('공식 경기 상세 요약이 올바르지 않습니다.'); };

export function buildMatchReport(state, official) {
  if (!state.match?.complete || !state.reportStrategies || state.match.history.some(round=>!round.strategies?.length)) return null;
  return { mapId: official.map.id, seed: state.seed, score: {...state.match.score},
    clubs: {home:official.home.id,away:official.away.id},
    players: state.actors.map(actor=>{
      const player = official[actor.team].players.find(player=>player.id===actor.playerId);
      return {id:actor.id,playerId:actor.playerId,team:actor.team,stats:{...matchPlayerStats(state,actor)},
        condition:{happiness:player.morale.happiness,fatigue:player.fatigue}};
    }),
    rounds: structuredClone(state.match.history) };
}

function contextFor(world, year) {
  if (year === seasonYear(world)) return world;
  const archive = world.seasonYears.archives.find(archive=>archive.year===year);
  return archive ? {...world,...archive,seasonYears:{year,startedDay:archive.startedDay,archives:[]}} : null;
}

export function reportFixture(world, entry) {
  const context = contextFor(world,entry.year);
  if (!context) return null;
  for (const season of [context.pcSeason,context.citySeason,context.provinceSeason,context.nationalSeason,context.worldSeason]) {
    if (!season) continue;
    const fixture = findOfficialFixture(season,entry.fixtureId);
    if (fixture) return fixture;
  }
  return null;
}

function validateStrategies(changes, ticks) {
  if (!Array.isArray(changes) || !changes.length || changes.length>ticks+2) fail();
  let previous = -1;
  return changes.map(change=>{
    if (!change || !integer(change.tick) || change.tick<previous || change.tick>ticks || !['A','B'].includes(change.site)) fail();
    previous=change.tick;
    for(const side of sides) {
      if (![null,'execute','split'].includes(change.attack?.[side]) || ![null,'standard','forward'].includes(change.defense?.[side])) fail();
    }
    if (['attack','defense'].some(side=>typeof change.manual?.[side]!=='boolean')) fail();
    return {tick:change.tick,site:change.site,attack:{home:change.attack.home,away:change.attack.away},
      defense:{home:change.defense.home,away:change.defense.away},manual:{attack:change.manual.attack,defense:change.manual.defense}};
  });
}

function validateMap(value, entry, world, fixture) {
  const context=contextFor(world,entry.year), mapNumber=value?.mapNumber;
  if (!Number.isInteger(mapNumber) || mapNumber<1 || mapNumber>(fixture.maps?.length??1)
    || !integer(value.day) || value.day<context.seasonYears.startedDay || value.day>world.day) fail();
  const result=fixture.scores?.[mapNumber-1]??(mapNumber===1?fixture.result:null);
  if (!result || result.forfeit) fail();
  const ownHome=fixture.homeClubId===world.playerClubId;
  const expected={home:ownHome?result.homeScore:result.awayScore,away:ownHome?result.awayScore:result.homeScore};
  if (value.clubs?.home!==world.playerClubId || value.clubs?.away!==(ownHome?fixture.awayClubId:fixture.homeClubId)
    || value.score?.home!==expected.home || value.score?.away!==expected.away) fail();
  const config=officialMatchConfig(context,{...fixture,result:null,scores:fixture.scores?.slice(0,mapNumber-1)});
  if (value.mapId!==config.map.id || value.seed!==config.seed) fail();
  const lineups=fixture.lineups??context.officialRecords.receipts.find(receipt=>receipt.fixtureId===fixture.id)?.lineups
    ?? context.officialRecords.active?.lineups;
  if (!lineups || !Array.isArray(value.players) || value.players.length!==10) fail();
  const actorIds=new Set(), playerIds=new Set();
  const players=value.players.map(player=>{
    if (!player || !sides.includes(player.team) || !lineups[ownHome?player.team:player.team==='home'?'away':'home'].includes(player.playerId)
      || typeof player.id!=='string' || !/^(home|away)-[1-5]$/.test(player.id) || !player.id.startsWith(`${player.team}-`)
      || actorIds.has(player.id) || playerIds.has(player.playerId) || STATS.some(key=>!integer(player.stats?.[key]))
      || player.stats.hits>player.stats.shots || ['happiness','fatigue'].some(key=>!Number.isInteger(player.condition?.[key]) || player.condition[key]<0 || player.condition[key]>100)) fail();
    actorIds.add(player.id);playerIds.add(player.playerId);
    return {id:player.id,playerId:player.playerId,team:player.team,stats:Object.fromEntries(STATS.map(key=>[key,player.stats[key]])),
      condition:{happiness:player.condition.happiness,fatigue:player.condition.fatigue}};
  });
  if (!Array.isArray(value.rounds) || value.rounds.length!==expected.home+expected.away) fail();
  const score={home:0,away:0}, overtimeScore={home:0,away:0};
  const initial=ownHome?config.attackTeam:config.attackTeam==='home'?'away':'home';
  const rounds=value.rounds.map((round,index)=>{
    const expectedAttack=index<12?initial:index<24?(initial==='home'?'away':'home')
      :Math.floor((index-24)/3)%2===0?initial:(initial==='home'?'away':'home');
    if (!round || round.roundNumber!==index+1 || round.attackTeam!==expectedAttack || !sides.includes(round.winner)
      || !integer(round.ticks) || round.ticks<1 || !integer(round.overtime) || round.overtime!==(index<24?0:Math.floor((index-24)/6)+1)
      || typeof round.reason!=='string' || round.reason.length>180 || !Array.isArray(round.highlights)) fail();
    score[round.winner]++;
    if(index>=24) {
      if((index-24)%6===0){overtimeScore.home=0;overtimeScore.away=0;}
      overtimeScore[round.winner]++;
    }
    const finished=index<24?score[round.winner]>=13:overtimeScore[round.winner]>=4;
    if(finished!==(index===value.rounds.length-1))fail();
    if (round.score?.home!==score.home || round.score?.away!==score.away) fail();
    const highlights=round.highlights.map(event=>{
      if (!event || !['first-kill','multi-kill','bomb-planted','bomb-defused','round-end'].includes(event.type)
        || !integer(event.tick) || event.tick>round.ticks) fail();
      if (event.type==='round-end') {
        if(event.winner!==round.winner || event.reason!==round.reason)fail();
        return {type:event.type,tick:event.tick,winner:event.winner,reason:event.reason};
      }
      if (!actorIds.has(event.actorId)) fail();
      if(event.type==='first-kill' && !actorIds.has(event.targetId))fail();
      if(event.type==='multi-kill' && (!integer(event.kills) || event.kills<3))fail();
      return {type:event.type,tick:event.tick,actorId:event.actorId,
        ...(event.type==='first-kill'?{targetId:event.targetId}:{}),...(event.type==='multi-kill'?{kills:event.kills}:{})};
    });
    return {roundNumber:round.roundNumber,attackTeam:round.attackTeam,winner:round.winner,reason:round.reason,ticks:round.ticks,
      overtime:round.overtime,score:{...score},highlights,strategies:validateStrategies(round.strategies,round.ticks)};
  });
  if(score.home!==expected.home || score.away!==expected.away)fail();
  return {mapNumber,day:value.day,mapId:value.mapId,seed:value.seed,score:{...expected},clubs:{home:value.clubs.home,away:value.clubs.away},players,rounds};
}

export function validateMatchReports(value, world) {
  if (!Array.isArray(value) || value.length>MATCH_REPORT_LIMIT) fail();
  const used=new Set();
  return value.map(entry=>{
    if(!entry || !Number.isInteger(entry.year) || entry.year<1 || entry.year>seasonYear(world) || typeof entry.fixtureId!=='string')fail();
    const key=`${entry.year}:${entry.fixtureId}`,fixture=reportFixture(world,entry);
    if(used.has(key) || !fixture || ![fixture.homeClubId,fixture.awayClubId].includes(world.playerClubId)
      || !Array.isArray(entry.maps) || !entry.maps.length)fail();
    used.add(key);
    const maps=entry.maps.map(map=>validateMap(map,entry,world,fixture));
    if(maps.some((map,index)=>index && map.mapNumber<=maps[index-1].mapNumber))fail();
    return {year:entry.year,fixtureId:entry.fixtureId,maps};
  });
}

export function appendMatchReport(world, fixtureId, mapNumber, day, report) {
  if (!report) return;
  const year=seasonYear(world),old=world.matchReports.find(entry=>entry.year===year && entry.fixtureId===fixtureId);
  if (old?.maps.some(map=>map.mapNumber===mapNumber)) throw new Error('이미 저장한 공식 맵 요약입니다.');
  const entry={year,fixtureId,maps:[...(old?.maps??[]),{...report,mapNumber,day}]};
  const records=[...world.matchReports.filter(item=>item!==old),entry].slice(-MATCH_REPORT_LIMIT);
  world.matchReports=validateMatchReports(records,world);
}
