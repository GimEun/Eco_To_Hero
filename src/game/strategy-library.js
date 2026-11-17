import { PRACTICE_MAPS } from '../data/maps/index.js';
import { ATTACK_TACTICS } from '../data/attack-tactics.js';
import { DEFENSE_TACTICS } from '../data/defense-tactics.js';
import { validateManualRoute, validateManualSmoke, MANUAL_DURATIONS } from '../simulation/manual-tactics.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validateStrategyLibrary(value) {
  if (!object(value) || Object.keys(value).some(id => !PRACTICE_MAPS.some(map => map.id === id))) throw new Error('맵별 전략 보관 정보가 올바르지 않습니다.');
  const result = {};
  for (const [mapId, sides] of Object.entries(value)) {
    if (!object(sides) || Object.keys(sides).some(side => !['attack', 'defense'].includes(side))) throw new Error('전략 진영이 올바르지 않습니다.');
    const map = PRACTICE_MAPS.find(map => map.id === mapId);
    result[mapId] = {};
    for (const [side, slots] of Object.entries(sides)) {
      if (!Array.isArray(slots) || slots.length !== 3) throw new Error('전략 저장칸은 진영별 3개입니다.');
      result[mapId][side] = slots.map(preset => {
        if (preset === null) return null;
        if (!object(preset) || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 40
          || !MANUAL_DURATIONS.includes(preset.duration) || !object(preset.players) || !object(preset.smokes)
          || !Object.hasOwn(side === 'attack' ? ATTACK_TACTICS : DEFENSE_TACTICS, preset.plan)
          || !['A', 'B'].includes(preset.siteName)
          || preset.allocationA !== null && (!Number.isInteger(preset.allocationA) || preset.allocationA < 0 || preset.allocationA > 5)
          || side === 'attack' && preset.allocationA !== null && (preset.siteName === 'A' ? preset.allocationA === 0 : preset.allocationA === 5)) throw new Error('저장 전략 이름·기간·전술·인원이 올바르지 않습니다.');
        const carrierNumber = preset.carrierNumber === undefined ? 3 : preset.carrierNumber;
        if (!Number.isInteger(carrierNumber) || carrierNumber < 1 || carrierNumber > 5) throw new Error('폭탄 담당 주전 자리가 올바르지 않습니다.');
        const players = {}, smokes = {};
        for (const [id, player] of Object.entries(preset.players)) {
          if (!/^home-[1-5]$/.test(id) || !object(player)) throw new Error('전략 주전 자리가 올바르지 않습니다.');
          const actor = { team: 'home', number: Number(id.at(-1)), radius: 10 };
          const checked = validateManualRoute(map, actor, side, player.cells, player.angle);
          if (!checked.ok) throw new Error(`저장 전략 경유점: ${checked.message}`);
          players[id] = { cells: checked.cells, angle: checked.angle };
        }
        for (const [id, smoke] of Object.entries(preset.smokes)) {
          if (!/^home-[1-5]$/.test(id) || smoke === null) throw new Error('전략 연막 주전 자리가 올바르지 않습니다.');
          const checked = validateManualSmoke(map, smoke);
          if (!checked.ok) throw new Error(checked.message);
          smokes[id] = checked.smoke;
        }
        return { name: preset.name.trim(), duration: preset.duration, players, smokes,
          plan: preset.plan, siteName: preset.siteName, allocationA: preset.allocationA, carrierNumber };
      });
    }
  }
  return result;
}
