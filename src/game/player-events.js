import { bankruptcyIssue } from './bankruptcy.js';
import { PLAYER_EVENTS, PLAYER_EVENT_RULES, findPlayerEvent } from '../data/player-events.js';
import { randomUnit } from './random.js';
import { TRAINING_LABELS } from '../config/training.js';
import { trainingLimit } from './player-development.js';

export const createPlayerEvents = seed => ({ randomState: (seed ^ 0x65766e74) >>> 0, week: null, history: [] });
export const pendingPlayerEvent = world => world.playerEvents.week?.event?.status === 'pending';
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

// 첫 성공 날짜를 처리한 뒤에만 호출해 진행이 막힌 날짜에는 난수를 소비하지 않는다.
export function planPlayerEventWeek(world, startedDay, length, teamTraining) {
  const events = world.playerEvents;
  if (events.week) return;
  const occurs = randomUnit(events) < PLAYER_EVENT_RULES.chance;
  const offset = occurs ? 1 + Math.floor(randomUnit(events) * length) : null;
  const definition = occurs ? PLAYER_EVENTS[Math.floor(randomUnit(events) * PLAYER_EVENTS.length)] : null;
  events.week = { startedDay, endDay: startedDay + length, teamTraining,
    event: occurs ? { eventId: definition.id, day: startedDay + offset, status: 'scheduled', playerId: null, roll: null } : null };
}

export function triggerPlayerEvent(world) {
  const events = world.playerEvents, event = events.week?.event;
  if (!event || event.status !== 'scheduled' || event.day !== world.day) return false;
  const club = world.clubs.find(club => club.id === world.playerClubId);
  event.playerId = club.playerIds[Math.floor(randomUnit(events) * club.playerIds.length)];
  event.roll = randomUnit(events);
  event.status = 'pending';
  return true;
}

export function resolvePlayerEvent(world, choice) {
  const ended = bankruptcyIssue(world);
  if (ended) return { ok: false, message: ended };
  if (!pendingPlayerEvent(world) || !['accept', 'decline'].includes(choice)) return { ok: false, message: '선택할 수 있는 선수 이벤트가 없습니다.' };
  const state = world.playerEvents, event = state.week.event, definition = findPlayerEvent(event.eventId), effect = definition[choice];
  const club = world.clubs.find(club => club.id === world.playerClubId);
  const player = world.players.find(player => player.id === event.playerId);
  if (!club.playerIds.includes(event.playerId)) return { ok: false, message: '이벤트 대상 선수가 내 구단 소속이 아닙니다.' };
  const balance = BigInt(club.balance) + BigInt(effect.cash);
  if (effect.cash < 0 && balance < 0n) return { ok: false, message: '수락 비용을 낼 자금이 부족합니다. 거절하거나 자금을 마련하세요.' };
  if (balance > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, message: '이벤트 수입이 저장 가능한 자금 범위를 넘습니다.' };
  const happinessBefore = player.morale.happiness, happinessAfter = clamp(happinessBefore + effect.happiness, 0, 100);
  const statBefore = effect.skill ? player[effect.skill] : null;
  const statLimit = effect.skill ? trainingLimit(player, effect.skill) : null;
  const statAfter = effect.skill ? clamp(statBefore + (event.roll < effect.chance ? effect.delta : 0), 1, statLimit) : null;
  const receipt = { eventId: event.eventId, day: event.day, playerId: event.playerId, choice, roll: event.roll,
    balanceDelta: effect.cash, happinessBefore, happinessAfter, statBefore, statAfter, statLimit };
  club.balance = Number(balance); player.morale.happiness = happinessAfter;
  if (effect.skill) {
    player[effect.skill] = statAfter;
    if (statAfter === statLimit && statAfter > statBefore) player.training.experience[effect.skill] = 0;
  }
  event.status = 'resolved'; state.history.push(receipt);
  state.history = state.history.slice(-PLAYER_EVENT_RULES.historyLimit);
  return { ok: true, receipt, message: `${player.nickname} · ${definition.title} · ${choice === 'accept' ? '수락' : '거절'} · 행복도 ${happinessBefore}→${happinessAfter}${effect.skill ? ` · ${TRAINING_LABELS[effect.skill].replace(' 훈련', '')} ${statBefore}→${statAfter}` : ''} · 자금 ${effect.cash > 0 ? '+' : ''}${effect.cash}.` };
}

export function validatePlayerEvents(state, players, day, remainingDays, rosterIds, teamTraining, { legacyDevelopment = false } = {}) {
  const fail = () => { throw new Error('선수 이벤트 또는 주간 진행 기록이 올바르지 않습니다.'); };
  const integer = value => Number.isSafeInteger(value);
  const ids = new Set(players.map(player => player.id));
  if (!state || typeof state !== 'object' || Array.isArray(state) || !integer(state.randomState) || state.randomState < 0 || state.randomState > 0xffffffff
    || !Array.isArray(state.history) || state.history.length > PLAYER_EVENT_RULES.historyLimit) fail();
  let previousDay = 0;
  const history = Array.from(state.history, receipt => {
    if (!receipt || !findPlayerEvent(receipt.eventId) || !ids.has(receipt.playerId) || !integer(receipt.day) || receipt.day <= previousDay || receipt.day > day
      || !['accept', 'decline'].includes(receipt.choice) || typeof receipt.roll !== 'number' || !Number.isFinite(receipt.roll) || receipt.roll < 0 || receipt.roll >= 1
      || !integer(receipt.happinessBefore) || receipt.happinessBefore < 0 || receipt.happinessBefore > 100) fail();
    const effect = findPlayerEvent(receipt.eventId)[receipt.choice];
    const statLimit = effect.skill ? legacyDevelopment ? 99 : receipt.statLimit : null;
    if (receipt.balanceDelta !== effect.cash || receipt.happinessAfter !== clamp(receipt.happinessBefore + effect.happiness, 0, 100)) fail();
    if (effect.skill) {
      if (!integer(receipt.statBefore) || receipt.statBefore < 1 || receipt.statBefore > 99
        || !integer(statLimit) || statLimit < Math.max(70, receipt.statBefore) || statLimit > 99
        || receipt.statAfter !== clamp(receipt.statBefore + (receipt.roll < effect.chance ? effect.delta : 0), 1, statLimit)) fail();
    } else if (receipt.statBefore !== null || receipt.statAfter !== null || !legacyDevelopment && receipt.statLimit !== null) fail();
    previousDay = receipt.day;
    return { eventId: receipt.eventId, day: receipt.day, playerId: receipt.playerId, choice: receipt.choice, roll: receipt.roll,
      balanceDelta: receipt.balanceDelta, happinessBefore: receipt.happinessBefore, happinessAfter: receipt.happinessAfter, statBefore: receipt.statBefore, statAfter: receipt.statAfter, statLimit };
  });
  let week = null;
  if (state.week !== null) {
    const value = state.week;
    if (!value || !integer(value.startedDay) || value.startedDay < 1 || !integer(value.endDay) || value.endDay <= value.startedDay || value.endDay - value.startedDay > 7
      || day <= value.startedDay || day > value.endDay || remainingDays !== value.endDay - day || typeof value.teamTraining !== 'boolean' || teamTraining?.status === 'pending') fail();
    let event = null;
    if (value.event !== null) {
      const e = value.event;
      if (!e || !findPlayerEvent(e.eventId) || !integer(e.day) || e.day <= value.startedDay || e.day > value.endDay || !['scheduled', 'pending', 'resolved'].includes(e.status)) fail();
      if (e.status === 'scheduled') {
        if (e.day <= day || e.playerId !== null || e.roll !== null) fail();
      } else {
        if (!ids.has(e.playerId) || typeof e.roll !== 'number' || !Number.isFinite(e.roll) || e.roll < 0 || e.roll >= 1 || e.day > day) fail();
        if (e.status === 'pending' && (e.day !== day || !rosterIds.includes(e.playerId))) fail();
        if (e.status === 'resolved' && !history.some(r => r.day === e.day && r.playerId === e.playerId && r.eventId === e.eventId && r.roll === e.roll)) fail();
      }
      event = { eventId: e.eventId, day: e.day, status: e.status, playerId: e.playerId, roll: e.roll };
    }
    week = { startedDay: value.startedDay, endDay: value.endDay, teamTraining: value.teamTraining, event };
    if (week.event?.status === 'pending' && history.some(r => r.day >= week.event.day)) fail();
  }
  return { randomState: state.randomState, week, history };
}
