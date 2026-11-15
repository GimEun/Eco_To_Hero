import { competitionSeed } from './season-year-context.js';
import { nextOfficialFixture, seasonProgress, nextTiebreakFixture, pcSeasonStandings } from './pc-season.js';
import { isPreseason,isFreeSchedule } from './season-calendar.js';
import { PLAYOFF_WEEK_ID, createPcPlayoffs, nextPlayoffSeries, isPlayoffWeek, pcQualification } from './pc-playoffs.js';
import { domesticProgress,nextDomesticTiebreak,createDomesticPlayoffs } from './domestic-finals.js';
import { domesticStandings,domesticQualification } from './domestic-season.js';
import { domesticSeason,domesticRule,playoffWeekId,DOMESTIC_LEAGUES } from '../config/domestic-leagues.js';
import { worldProgress,nextWorldTiebreak,worldQualification } from './world-groups.js';
import { createWorldFinals,WORLD_FINALS_WEEK_ID } from './world-finals.js';

export function requiresTiebreak(world) {
  if(world.worldSeason)return !world.worldSeason.weekSchedule && !world.weekDaysRemaining && !world.playerEvents.week
    && world.teamTraining?.status!=='pending' && worldProgress(world.worldSeason).phase==='tiebreak';
  const domestic=domesticSeason(world);
  if(domestic)return !domestic.weekSchedule && !world.weekDaysRemaining && !world.playerEvents.week
    && world.teamTraining?.status!=='pending' && domesticProgress(domestic).phase==='tiebreak';
  return !world.pcSeason.weekSchedule && !world.weekDaysRemaining && !world.playerEvents.week
    && world.teamTraining?.status !== 'pending' && seasonProgress(world.pcSeason).phase === 'tiebreak';
}

export function beginOfficialSchedule(world, teamTraining) {
  if (isPreseason(world) || isFreeSchedule(world)) return false;
  if(world.worldSeason) {
    const season=world.worldSeason,fixture=nextOfficialFixture(world);
    if(!season.weekSchedule && !world.weekDaysRemaining && !world.playerEvents.week && world.teamTraining?.status!=='pending'
      && season.ranked && worldProgress(season).complete && !season.playoffs && world.day<=Number.MAX_SAFE_INTEGER-7) {
      season.playoffs=createWorldFinals(season,competitionSeed(world),world.day);season.stage='finals';
      season.weekSchedule={fixtureId:WORLD_FINALS_WEEK_ID,startedDay:world.day,endDay:world.day+7,phase:'preparing',teamTraining:Boolean(teamTraining)};return true;
    }
    if(season.weekSchedule || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status==='pending'
      || !fixture || fixture.week===0 || world.day>Number.MAX_SAFE_INTEGER-7)return false;
    season.weekSchedule={fixtureId:fixture.id,startedDay:world.day,endDay:world.day+7,phase:'preparing',teamTraining:Boolean(teamTraining)};
    return true;
  }
  if(domesticSeason(world)) {
    const season=domesticSeason(world),rule=domesticRule(season);
    if(season.weekSchedule || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status==='pending')return false;
    const progress=domesticProgress(season);
    if(progress.phase==='tiebreak')return false;
    if(progress.complete) {
      if(!rule.finals)return false;
      if(season.playoffs?.settled || world.day>Number.MAX_SAFE_INTEGER-7)return false;
      season.playoffs??=createDomesticPlayoffs(competitionSeed(world),domesticStandings(season).map(row=>row.clubId),rule.leagueId);
      season.weekSchedule={fixtureId:playoffWeekId(season),startedDay:world.day,endDay:world.day+7,phase:'preparing',teamTraining:Boolean(teamTraining)};
      return true;
    }
    const fixture=nextOfficialFixture(world);
    if(!fixture || world.day>Number.MAX_SAFE_INTEGER-7)return false;
    season.weekSchedule={fixtureId:fixture.id,startedDay:world.day,endDay:world.day+7,phase:'preparing',teamTraining:Boolean(teamTraining)};
    return true;
  }
  if (world.pcSeason.weekSchedule || world.weekDaysRemaining || world.playerEvents.week || world.teamTraining?.status === 'pending') return false;
  if (seasonProgress(world.pcSeason).complete) {
    if (world.pcSeason.playoffs?.settled || world.day > Number.MAX_SAFE_INTEGER - 7) return false;
    world.pcSeason.playoffs ??= createPcPlayoffs(competitionSeed(world), pcSeasonStandings(world.pcSeason).map(row => row.clubId));
    world.pcSeason.weekSchedule = { fixtureId: PLAYOFF_WEEK_ID, startedDay: world.day, endDay: world.day + 7, phase: 'preparing', teamTraining: Boolean(teamTraining) };
    return true;
  }
  if (world.pcSeason.fixtures.every(fixture => fixture.result)) return false;
  const fixture = nextOfficialFixture(world);
  if (!fixture || world.day > Number.MAX_SAFE_INTEGER - 7) return false;
  world.pcSeason.weekSchedule = { fixtureId: fixture.id, startedDay: world.day, endDay: world.day + 7,
    phase: 'preparing', teamTraining: Boolean(teamTraining) };
  return true;
}

export function officialWeekStatus(world) {
  if(isFreeSchedule(world))return {phase:'free',canPlay:false,message:`${world.worldSeason?.playoffs?.settled?'세계 최종 일정 종료':'올해 공식 도전 탈락'} · 자유 일정 · 선수 영입·주간 훈련·방송·팀 연습 가능 · 다음 해 전환은 후속 단계입니다.`};
  if(world.worldSeason) {
    const season=world.worldSeason,schedule=season.weekSchedule,fixture=nextOfficialFixture(world);
    const label=season.playoffs?'세계 BO5 플레이오프':season.ranked?'세계 순위별 리그':'세계 조별리그';
    if(schedule?.phase==='preparing')return {phase:'preparing',canPlay:false,message:`${label} 주간 행동·이벤트를 먼저 마치세요.`};
    if(schedule?.phase==='settling')return {phase:'settling',canPlay:false,message:`${label} 결과 저장 완료 · 마지막 하루 정산을 마치세요.`};
    if(world.teamTraining?.status==='pending')return {phase:'training',canPlay:false,message:'진행 중인 팀 훈련을 먼저 마치세요.'};
    if(season.playoffs) {
      if(season.playoffs.settled)return {phase:'finished',canPlay:false,message:'세계 최종 순위·마지막 정산·시즌 스폰서 종료 완료 · 다음 해 전환은 후속 단계입니다.'};
      const next=nextPlayoffSeries(season.playoffs),mine=next && [next.homeClubId,next.awayClubId].includes(world.playerClubId);
      return {phase:mine?'playoff':'playoff-ai',canPlay:Boolean(mine && (!season.activeMatchId || next.awaitingNextMap) && next.mapPicks),
        message:mine?'세계 BO5 · 3맵 선승 · 시리즈 전체 퍼즈 3회 · 맵 선택 후 시작':'남은 AI BO5를 진행하세요. 추가 날짜 없이 계산합니다.'};
    }
    const progress=worldProgress(season);
    if(!schedule && progress.phase==='tiebreak') {
      if(world.weekDaysRemaining || world.playerEvents.week)return {phase:'preparing',canPlay:false,message:'진행 중인 주간 일정을 먼저 마치세요.'};
      const next=nextWorldTiebreak(season),mine=[next.homeClubId,next.awayClubId].includes(world.playerClubId);
      return {phase:mine?'tiebreak':'tiebreak-ai',canPlay:mine && !season.activeMatchId,message:`${label} ${progress.groupId} 결정전 · 추가 날짜·훈련·급여 없이 BO1으로 순위를 확정합니다.`};
    }
    if(progress.complete)return {phase:season.ranked?'world-ranked-complete':'world-groups-complete',canPlay:false,
      message:season.ranked?'세계 순위별 리그 완료 · 내 구단에서 52주 플레이오프 주간 행동을 준비하세요.':'세계 조별 순위 확정 · 각 조 상위 2팀은 시즌 화면에서 순위별 리그에 참가하세요.'};
    if(!schedule)return {phase:'unscheduled',canPlay:false,message:`내 구단에서 주간 일정을 준비하면 ${label} BO3가 열립니다.`};
    return {phase:'ready',canPlay:Boolean(fixture && (!season.activeMatchId || fixture.awaitingNextMap) && fixture.mapPicks),
      message:fixture?.mapPicks?`${label} BO3 · ${fixture.week===4?'이번 주 두 시리즈 종료 뒤 정산 · ':''}시리즈 전체 퍼즈 3회`:'내 팀 선택 맵을 정하면 BO3를 시작할 수 있습니다.'};
  }
  if(domesticSeason(world)) {
    const season=domesticSeason(world),rule=domesticRule(season),schedule=season.weekSchedule,fixture=nextOfficialFixture(world);
    if(schedule?.phase==='preparing')return {phase:'preparing',canPlay:false,message:`${rule.name} 주간 행동·이벤트를 먼저 마치세요.`};
    if(schedule?.phase==='settling')return {phase:'settling',canPlay:false,message:`${rule.name} 결과 저장 완료 · 마지막 하루 정산을 마치세요.`};
    if(world.teamTraining?.status==='pending')return {phase:'training',canPlay:false,message:'진행 중인 팀 훈련을 먼저 마치세요.'};
    const progress=domesticProgress(season);
    if(!schedule && progress.phase==='tiebreak') {
      if(world.weekDaysRemaining || world.playerEvents.week)return {phase:'preparing',canPlay:false,message:'진행 중인 주간 일정을 먼저 마치세요.'};
      const next=nextDomesticTiebreak(season),mine=[next.homeClubId,next.awayClubId].includes(world.playerClubId);
      return {phase:mine?'tiebreak':'tiebreak-ai',canPlay:mine && !season.activeMatchId,message:`${rule.name} 순위 결정전 · 추가 날짜·훈련·급여 없이 BO1으로 순위를 확정합니다.`};
    }
    if(!schedule && progress.complete) {
      if(!rule.finals)return {phase:'regular-complete',canPlay:false,message:`${rule.name} 정규 ${rule.weeks}매치 완료 · ${rule.finalWeek}주 동률 결정·플레이오프는 후속 단계입니다.`};
      const nextRule=Object.values(DOMESTIC_LEAGUES).find(next=>next.previousKey===rule.key);
      if(!nextRule){const promoted=worldQualification(world);return {phase:season.playoffs?.settled?'finished':'playoff-unscheduled',canPlay:false,
        message:season.playoffs?.settled?`전국 최종 ${promoted.rank}위 · ${promoted.qualified?'세계 리그 진출 확정 · 시즌 화면에서 참가하세요.':'올해 공식 도전 탈락'}`:'전국 리그 정규 순위 확정 · 내 구단에서 플레이오프 주간 행동을 준비하세요.'};}
      const promoted=domesticQualification(world,nextRule.leagueId);
      return {phase:season.playoffs?.settled?'finished':'playoff-unscheduled',canPlay:false,
        message:season.playoffs?.settled?`${rule.name} 최종 ${promoted.rank}위 · ${promoted.qualified?`${nextRule.name} 진출 확정 · 시즌 화면에서 참가하세요.`:'올해 공식 도전 탈락'}`:`${rule.name} 정규 순위 확정 · 내 구단에서 플레이오프 주간 행동을 준비하세요.`};
    }
    if(!schedule)return {phase:'unscheduled',canPlay:false,message:`내 구단에서 주간 일정을 준비하면 ${rule.name} BO3가 열립니다.`};
    if(schedule.fixtureId===playoffWeekId(season)) {
      const next=nextPlayoffSeries(season.playoffs),mine=next && [next.homeClubId,next.awayClubId].includes(world.playerClubId);
      return {phase:mine?'playoff':'playoff-ai',canPlay:Boolean(mine && (!season.activeMatchId || next.awaitingNextMap) && next.mapPicks),
        message:mine?`${rule.name} BO3 플레이오프 · 맵 선택 후 시작 · 시리즈 전체 퍼즈 3회`:'남은 AI 플레이오프를 진행하세요. 추가 날짜 없이 계산합니다.'};
    }
    return {phase:'ready',canPlay:Boolean(fixture && (!season.activeMatchId || fixture.awaitingNextMap) && fixture.mapPicks),
      message:fixture?.mapPicks?`${rule.name} BO3 · 두 맵 선승 · 퍼즈는 시리즈 전체 3회`:'내 팀의 선택 맵을 정하면 BO3를 시작할 수 있습니다.'};
  }
  if (isPreseason(world)) return { phase: 'preseason', canPlay: false, message: '비시즌 · 1~4주 동안 훈련·영입을 진행하세요. 남은 이벤트·팀 훈련까지 마치면 5주 차부터 공식 시즌을 시작합니다.' };
  const fixture = nextOfficialFixture(world), schedule = world.pcSeason.weekSchedule;
  const progress = seasonProgress(world.pcSeason);
  const qualification = pcQualification(world.pcSeason.playoffs, world.playerClubId);
  const outcome = qualification ? `PC방 최종 ${qualification.rank}위 · ${qualification.qualified ? '시 리그 진출 확정' : '올해 공식 도전 탈락'}` : '';
  if (isPlayoffWeek(world.pcSeason)) {
    if (schedule.phase === 'preparing') return { phase: 'preparing', canPlay: false, message: '플레이오프 주간 행동·이벤트를 먼저 마치세요.' };
    if (schedule.phase === 'settling') return { phase: 'settling', canPlay: false, message: `${outcome} · 남은 하루 정산을 마치면 시즌 계약이 종료됩니다.` };
    if (world.teamTraining?.status === 'pending') return { phase: 'training', canPlay: false, message: '플레이오프 주간 팀 훈련을 먼저 마치세요.' };
    const series = nextPlayoffSeries(world.pcSeason.playoffs);
    const mine = series && [series.homeClubId, series.awayClubId].includes(world.playerClubId);
    return { phase: mine ? 'playoff' : 'playoff-ai', canPlay: Boolean(mine && (!world.pcSeason.activeMatchId || series.awaitingNextMap)),
      message: mine ? 'BO3 플레이오프 · 두 맵 선승 · 퍼즈는 시리즈 전체 3회 · 중도 이탈 시 시리즈 기권패' : '남은 AI 플레이오프를 진행하세요. 추가 날짜 없이 계산합니다.' };
  }
  if (progress.complete && !schedule) return { phase: world.pcSeason.playoffs?.settled ? 'finished' : 'playoff-unscheduled', canPlay: false,
    message: world.pcSeason.playoffs?.settled ? `${outcome} · ${qualification?.qualified ? '시즌 화면에서 시 리그에 참가하세요.' : '탈락 후 일정·다음 해 전환은 후속 단계입니다.'}` : '정규 순위 확정 · 내 구단에서 플레이오프 주간 행동을 준비하세요.' };
  if (!schedule && progress.phase === 'tiebreak') {
    if (world.teamTraining?.status === 'pending') return { phase: 'training', canPlay: false, message: '진행 중인 팀 훈련을 먼저 마친 뒤 순위 결정전을 진행하세요.' };
    if (world.weekDaysRemaining || world.playerEvents.week) return { phase: 'preparing', canPlay: false, message: '기존에 진행 중인 주간 일정을 먼저 마친 뒤 순위 결정전을 진행하세요.' };
    const next = nextTiebreakFixture(world.pcSeason);
    const mine = [next.homeClubId, next.awayClubId].includes(world.playerClubId);
    return { phase: mine ? 'tiebreak' : 'tiebreak-ai', canPlay: mine && !world.pcSeason.activeMatchId,
      message: '정규 일정 종료 · 순위 결정전 진행 중 · 추가 날짜·훈련·급여 처리는 없습니다.' };
  }
  if (!schedule && !fixture && progress.phase === 'regular') return { phase: 'regular-pending', canPlay: false,
    message: '정규 경기 결과가 아직 모두 확정되지 않았습니다.' };
  if (!schedule) return { phase: fixture ? 'unscheduled' : 'finished', canPlay: false,
    message: fixture ? '내 구단에서 주간 일정을 진행하면 이번 주 공식 경기가 열립니다.' : '정규 시즌 순위를 확정했습니다. 플레이오프는 후속 단계에서 진행합니다.' };
  if (schedule.phase === 'preparing') return { phase: 'preparing', canPlay: false, message: '진행 중인 주간 행동·이벤트를 먼저 마치세요.' };
  if (schedule.phase === 'settling') return { phase: 'settling', canPlay: false, message: '공식 경기 결과는 저장됐습니다. 내 구단에서 계약 등 남은 정산 조건을 해결하고 일정을 마치세요.' };
  if (world.teamTraining?.status === 'pending') return { phase: 'training', canPlay: false, message: '이번 주 팀 훈련을 먼저 마치세요.' };
  return { phase: 'ready', canPlay: !world.pcSeason.activeMatchId, message: '주간 준비 완료 · 공식 경기를 마치거나 기권한 뒤 다음 주로 진행합니다.' };
}
