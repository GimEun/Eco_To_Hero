import { recordStrategy } from './strategy-history.js';
import { ECONOMY_RULES } from '../config/economy.js';
import { BASIC_PISTOL, TRAINING_RIFLE, WEAPONS, BODY_ARMOR, weaponFor } from '../data/weapons.js';
import { THROWABLES, emptyThrowables } from '../data/throwables.js';
import { setupRound } from './round.js';
import { advanceMatch } from './match.js';
import { advanceOpponentStrategy } from './opponent-strategy.js';

export function setupEconomy(state) {
  state.economy = { phase: 'buy', roundNumber: 1, processedEvents: 0, settled: false, ledger: [] };
  for (const actor of state.actors) {
    Object.assign(actor, { cash: ECONOMY_RULES.startingCash, weaponId: BASIC_PISTOL.id, ammo: BASIC_PISTOL.magazineSize, armor: 0, weaponPurchaseCost: 0 });
  }
}

function record(state, actor, requested, reason) {
  const before = actor.cash;
  actor.cash = Math.min(ECONOMY_RULES.maxCash, actor.cash + requested);
  state.economy.ledger.push({ roundNumber: state.economy.roundNumber, tick: state.tick,
    actorId: actor.id, reason, requested, amount: actor.cash - before, balance: actor.cash });
}

function purchaseWeapon(state, actor, weapon) {
  if (actor.weaponId === weapon.id) return { ok: false, message: '이미 보유한 무기입니다.' };
  const refund = actor.weaponPurchaseCost ?? 0;
  if (actor.cash + refund < weapon.price) return { ok: false, message: '무기를 구매할 경기 자금이 부족합니다.' };
  if (refund) record(state, actor, refund, 'weapon-refund');
  if (weapon.price) record(state, actor, -weapon.price, 'purchase');
  Object.assign(actor, { weaponId: weapon.id, ammo: weapon.magazineSize, weaponPurchaseCost: weapon.price });
  return { ok: true, message: `${actor.nickname} · ${weapon.name} 구매 완료` };
}

function purchaseArmor(state, actor) {
  if (actor.armor >= BODY_ARMOR.durability) return { ok: false, message: '방탄복 내구도가 이미 최대입니다.' };
  if (actor.cash < BODY_ARMOR.price) return { ok: false, message: '방탄복을 구매할 경기 자금이 부족합니다.' };
  record(state, actor, -BODY_ARMOR.price, 'armor-purchase');
  actor.armor = BODY_ARMOR.durability;
  return { ok: true, message: `${actor.nickname} · 방탄복 구매 완료` };
}

function purchaseThrowable(state, actor, item) {
  if (actor.throwables[item.id]) return { ok: false, message: `${item.name}은 종류별 1개만 보유할 수 있습니다.` };
  if (actor.cash < item.price) return { ok: false, message: `${item.name}을 구매할 경기 자금이 부족합니다.` };
  record(state, actor, -item.price, 'utility-purchase');
  actor.throwables[item.id] = 1;
  return { ok: true, message: `${actor.nickname} · ${item.name} 구매 완료` };
}

export function buyEquipment(state, actorId, equipmentId) {
  if (!state.economy || state.economy.phase !== 'buy' || state.complete || state.match?.complete) return { ok: false, message: '라운드 시작 전 구매 단계에서만 구매할 수 있습니다.' };
  const actor = state.actors.find(item => item.id === actorId && item.team === 'home' && item.alive);
  if (!actor) return { ok: false, message: '내 팀의 구매 가능한 선수를 선택하세요.' };
  if (equipmentId === 'armor') return purchaseArmor(state, actor);
  const throwable = THROWABLES.find(item => item.id === equipmentId);
  if (throwable) return purchaseThrowable(state, actor, throwable);
  const weapon = WEAPONS.find(item => item.id === equipmentId);
  if (!weapon) return { ok: false, message: '구매할 수 없는 장비입니다.' };
  return purchaseWeapon(state, actor, weapon);
}

export function buyRifle(state, actorId) {
  return buyEquipment(state, actorId, TRAINING_RIFLE.id);
}

function autoPurchase(state, actor) {
  // 생존 무기는 유지하며, 각 선수의 선호 무기를 감당하지 못하면 저렴한 무기를 선택한다.
  if (actor.weaponId === BASIC_PISTOL.id) {
    const preferred = ['training-rifle', 'smg', 'shotgun', 'machine-gun', 'sniper'][actor.number - 1];
    const weapon = [preferred, 'training-rifle', 'smg'].map(id => WEAPONS.find(item => item.id === id))
      .find(item => item.price <= actor.cash);
    if (weapon) purchaseWeapon(state, actor, weapon);
  }
  purchaseArmor(state, actor);
  for (const id of ['smoke', 'grenade', 'flashbang']) purchaseThrowable(state, actor, THROWABLES.find(item => item.id === id));
}

export function startEconomyRound(state, { autoHome = false } = {}) {
  if (!state.economy || state.economy.phase !== 'buy' || state.complete || state.match?.complete) return false;
  for (const actor of state.actors.filter(item => autoHome || item.team === 'away')) autoPurchase(state, actor);
  for (const actor of state.actors) actor.weaponPurchaseCost = 0;
  state.economy.phase = 'combat';
    recordStrategy(state);
  return true;
}

export function updateEconomy(state) {
  const economy = state.economy;
  if (!economy || economy.settled) return;
  const end = state.events.length;
  for (const event of state.events.slice(economy.processedEvents, end)) {
    if (event.type === 'death' && !event.friendlyFire) {
      const killer = state.actors.find(actor => actor.id === event.killerId);
      record(state, killer, ECONOMY_RULES.killReward, 'kill');
    } else if (event.type === 'bomb-planted') {
      for (const actor of state.actors.filter(item => item.team === state.round.attackTeam)) {
        record(state, actor, ECONOMY_RULES.plantReward, 'plant');
      }
    }
  }
  economy.processedEvents = end;
  if (!state.complete) return;
  for (const actor of state.actors) {
    const won = actor.team === state.round.winner;
    record(state, actor, won ? ECONOMY_RULES.winReward : ECONOMY_RULES.lossReward, won ? 'win' : 'loss');
  }
  economy.settled = true;
  economy.phase = 'ended';
}

export function nextEconomyRound(state, map) {
  if (!state.economy?.settled || !state.complete) return false;
  if (state.match && (state.match.complete || state.match.history.length !== state.economy.roundNumber)) return false;
  const siteName = state.round.initialSiteName ?? state.round.siteName;
  const transition = state.match ? advanceMatch(state) : { attackTeam: state.round.attackTeam, resetCash: null };
  advanceOpponentStrategy(state, transition.attackTeam);
  state.economy.roundNumber++;
  Object.assign(state, { tick: 0, remainderMs: 0, complete: false, endReason: null, events: [], projectiles: [], smokes: [] });
  for (const actor of state.actors) {
    if (transition.resetCash !== null) record(state, actor, transition.resetCash - actor.cash, transition.reason);
    if (!actor.alive || transition.resetCash !== null) {
      actor.weaponId = BASIC_PISTOL.id;
      actor.armor = 0;
      actor.throwables = emptyThrowables();
    }
    actor.weaponPurchaseCost = 0;
    Object.assign(actor, { alive: true, hp: 100, ammo: weaponFor(actor).magazineSize, moving: false, incomingFire: null,
      reloadUntilTick: null, targetId: null, readyTick: 0, nextShotTick: 0, damageBy: {}, flashUntilTick: 0, flashStrength: 0, nextUtilityTick: 0, utilityContact: null,
      grenadeEvades: 0, evadedGrenadeId: null, flashThreat: null, flashDodges: 0,
      stats: { kills: 0, deaths: 0, assists: 0, damage: 0, shots: 0, hits: 0 } });
  }
  Object.assign(state.economy, { phase: 'buy', processedEvents: 0, settled: false });
  setupRound(state, map, transition.attackTeam, siteName);
  return true;
}
