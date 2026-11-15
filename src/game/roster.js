import { bankruptcyIssue } from './bankruptcy.js';
import { ROSTER_RULES } from '../config/roster.js';
import { createContract } from './contracts.js';
import { signingFee } from './player-costs.js';
import { LEAGUES } from '../config/world.js';
import { recruitmentWindowIssue } from './season-calendar.js';
export { signingFee } from './player-costs.js';

// 영입 시점에만 판정한다. 보유 선수의 출전·육성·재계약에는 적용하지 않는다.
export function recruitmentIssue(club, player) {
  const league = LEAGUES.find(item => item.id === club.leagueId);
  if (!league) return '구단의 리그를 확인할 수 없어 영입할 수 없습니다.';
  if (['aim', 'intelligence', 'stamina'].some(skill => player[skill] > league.recruitmentMax)) {
    return `${league.name} 영입 기준 초과 · 에임·지능·체력 각각 ${league.recruitmentMax} 이하인 선수만 영입할 수 있습니다. 보유 선수의 성장·출전은 제한하지 않습니다.`;
  }
  return null;
}

export function recruitPlayer(world, playerId) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  const windowIssue = recruitmentWindowIssue(world);
  if (windowIssue) return { ok: false, message: windowIssue };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  const player = world.players.find(player => player.id === playerId);
  if (!player || world.clubs.some(club => club.playerIds.includes(playerId))) return { ok: false, message: '현재 자유계약 선수만 영입할 수 있습니다.' };
  const issue = recruitmentIssue(club, player);
  if (issue) return { ok: false, message: issue };
  if (club.playerIds.length >= ROSTER_RULES.maximum) return { ok: false, message: '주전·후보를 합쳐 최대 8명까지 보유할 수 있습니다.' };
  const fee = signingFee(player);
  if (club.balance < fee) return { ok: false, message: '영입 계약금을 지불할 구단 자금이 부족합니다.' };
  club.balance -= fee;
  club.playerIds.push(playerId);
  club.contracts = { ...club.contracts, [playerId]: createContract(player, undefined, world.day) };
  return { ok: true, message: `${player.nickname} 영입 완료 · 계약금 $${fee.toLocaleString('en-US')} · 후보 등록` };
}

export function releasePlayer(world, playerId) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  if (world.playerEvents.week?.event?.status === 'pending' && world.playerEvents.week.event.playerId === playerId) return { ok: false, message: '이벤트를 선택한 뒤 대상 선수를 방출하세요.' };
  if (world.teamTraining?.status === 'pending' && world.teamTraining.playerIds.includes(playerId)) return { ok: false, message: '팀 훈련을 마친 뒤 참가 선수를 방출하세요.' };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  if (!club.playerIds.includes(playerId)) return { ok: false, message: '내 구단 소속 선수만 방출할 수 있습니다.' };
  if (club.playerIds.length <= ROSTER_RULES.starters) return { ok: false, message: '경기에 참가할 선수 5명을 유지해야 합니다.' };
  const slot = club.lineupIds.indexOf(playerId);
  if (slot >= 0) club.lineupIds[slot] = club.playerIds.find(id => !club.lineupIds.includes(id));
  club.playerIds = club.playerIds.filter(id => id !== playerId);
  delete club.contracts[playerId];
  return { ok: true, message: '선수를 자유계약으로 방출했습니다. 환급은 없으며 주전 방출 시 첫 후보가 해당 자리를 이어받습니다.' };
}

export function replaceStarter(world, incomingId, outgoingId) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  if (world.teamTraining?.status === 'pending') return { ok: false, message: '팀 훈련을 마친 뒤 주전 명단을 바꾸세요.' };
  const club = world.clubs.find(club => club.id === world.playerClubId);
  const slot = club.lineupIds.indexOf(outgoingId);
  if (!club.playerIds.includes(incomingId) || club.lineupIds.includes(incomingId) || slot < 0) return { ok: false, message: '내 팀 후보와 교체할 주전을 선택하세요.' };
  club.lineupIds[slot] = incomingId;
  return { ok: true, message: '주전·후보를 교체했습니다. 다음 팀 연습부터 주전 5명이 참가합니다.' };
}
