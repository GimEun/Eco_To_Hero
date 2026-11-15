import { PLAYER_NAMES, PLAYER_HANDLES } from '../data/player-identities.js';
import { randomUnit } from './random.js';
import { signingFee } from './player-costs.js';
import { PLAYER_NICKNAME_GROUPS } from '../data/player-nicknames.js';

export const PLAYER_IDENTITY_VERSION = 2;

function nicknamePool() {
  const handles = new Map();
  for (const base of PLAYER_HANDLES) {
    const variants = [base];
    for (let index = 0; index < base.length; index++) {
      for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
        variants.push(base.slice(0, index) + letter + base.slice(index + 1));
      }
    }
    for (const handle of variants) {
      if (/[a-z]$/i.test(handle) && handle.toLowerCase() !== 'paker') handles.set(handle.toLowerCase(), handle);
    }
  }
  return [...handles.values()];
}

function newGameNicknamePool(seed, count) {
  const randomState = { randomState: (seed ^ 0x68616e64) >>> 0 };
  const used = new Set(['paker']);
  const handles = [];
  let cumulativeWeight = 0;
  for (const group of PLAYER_NICKNAME_GROUPS) {
    const candidates = group.handles.filter(handle => {
      const key = handle.toLowerCase();
      if (used.has(key)) return false;
      used.add(key);
      return true;
    });
    for (let index = candidates.length - 1; index > 0; index--) {
      const target = Math.floor(randomUnit(randomState) * (index + 1));
      [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
    }
    cumulativeWeight += group.weight;
    const needed = Math.round(count * cumulativeWeight / 100) - handles.length;
    if (candidates.length < needed) throw new Error('새 게임 닉네임 후보가 부족합니다.');
    handles.push(...candidates.slice(0, needed));
  }
  return handles;
}

// newGame은 세계 최초 생성에서만 사용한다. 저장 복원의 기존 이름 갱신 규칙은 유지한다.
// 생성/복원한 독립 세계만 갱신하며 경기 난수와 선수 능력은 변경하지 않는다.
export function updatePlayerIdentities(world, { newGame = false } = {}) {
  if (world.playerIdentityVersion === PLAYER_IDENTITY_VERSION) return world;
  const randomState = { randomState: (world.seed ^ 0x6e616d65) >>> 0 };
  const pick = values => values[Math.floor(randomUnit(randomState) * values.length)];
  const preserveNames = world.playerIdentityVersion === 1;
  const handles = newGame ? newGameNicknamePool(world.seed, world.players.length) : nicknamePool();
  const top = (preserveNames && world.players.find(player => player.nickname === 'Paker'))
    || world.players.reduce((best, player) => signingFee(player) > signingFee(best) ? player : best);
  world.players.forEach((player, index) => {
    const group = ['western', 'korean', 'western', 'japanese', 'western'][index % 5];
    const pool = PLAYER_NAMES[group];
    const first = pick(pool.first);
    const last = pick(pool.last);
    if (!preserveNames) player.name = group === 'korean' ? `${last}${first}` : group === 'japanese' ? `${last} ${first}` : `${first} ${last}`;
    const handleIndex = Math.floor(randomUnit(randomState) * handles.length);
    player.nickname = handles.splice(handleIndex, 1)[0];
  });
  top.name = '김상혁';
  top.nickname = 'Paker';
  world.playerIdentityVersion = PLAYER_IDENTITY_VERSION;
  return world;
}
