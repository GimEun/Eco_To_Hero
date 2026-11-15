import { validateLegacyClub, validateWorld, isObject } from '../game/validate-world.js';
import { createWorld } from '../game/create-world.js';
import { updatePlayerIdentities } from '../game/player-identities.js';
import { updateClubNames } from '../game/club-names.js';

export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const FORMAT = 'eco-to-hero';
export const SCHEMA_VERSION = 47;

// 외부 JSON을 그대로 게임 상태에 합치지 않고 현재 버전에서 사용하는 필드만 복원한다.
export function validateSave(value) {
  if (!isObject(value) || value.format !== FORMAT) throw new Error('이 게임의 백업 파일이 아닙니다.');
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, SCHEMA_VERSION].includes(value.schemaVersion)) throw new Error('지원하지 않는 저장 버전입니다. 기존 구단은 유지됩니다.');
  if (typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) {
    throw new Error('저장 시간이 올바르지 않습니다.');
  }
  if (value.schemaVersion === 1) {
    return { format: FORMAT, schemaVersion: 1, savedAt: value.savedAt, club: validateLegacyClub(value.club) };
  }
  return {
    format: FORMAT, schemaVersion: SCHEMA_VERSION, savedAt: value.savedAt,
    world: validateWorld(value.world, { legacyRoster: value.schemaVersion === 2, legacyContracts: value.schemaVersion < 4, legacyTime: value.schemaVersion < 5, legacyFinance: value.schemaVersion < 6, legacyTraining: value.schemaVersion < 7, legacySchedule: value.schemaVersion < 8, legacyTeamTraining: value.schemaVersion < 9, legacyWeekly: value.schemaVersion < 10, legacyHappiness: value.schemaVersion < 11, legacyEvents: value.schemaVersion < 12, legacyDevelopment: value.schemaVersion < 13, legacyCondition: value.schemaVersion < 14, legacyAiRoster: value.schemaVersion < 15, legacyHolding: value.schemaVersion < 16, legacySponsor: value.schemaVersion < 17, legacyCoach: value.schemaVersion < 19, legacyFacilities: value.schemaVersion < 20, legacyCash: value.schemaVersion < 21, legacyStocks: value.schemaVersion < 22, legacyStockSignals: value.schemaVersion < 23, legacySeason: value.schemaVersion < 24, legacyActive: value.schemaVersion < 25, legacyWeekSchedule: value.schemaVersion < 26, legacyBroadcastGoal: value.schemaVersion < 27, legacyTiebreaks: value.schemaVersion < 28, legacyOfficialRecords: value.schemaVersion < 29, legacySeasonCalendar: value.schemaVersion < 30, legacyPlayoffs: value.schemaVersion < 31, legacyCitySeason: value.schemaVersion < 32, legacyCityFinals: value.schemaVersion < 33, legacyProvince: value.schemaVersion < 34, legacyNational: value.schemaVersion < 36, legacyWorldGroups: value.schemaVersion < 38, legacyWorldRanked: value.schemaVersion < 39, legacyWorldFinals: value.schemaVersion < 40, legacyFreeSchedule: value.schemaVersion < 41, legacyYears: value.schemaVersion < 42, legacyYearAdvance: value.schemaVersion < 43, legacyAiGrowth: value.schemaVersion < 44, legacyMatchReports: value.schemaVersion < 45, legacyCounseling: value.schemaVersion < 46, legacyCounselContent: value.schemaVersion < 47 }),
  };
}

export function createSave(world) {
  return validateSave({ format: FORMAT, schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), world });
}

export function serializeBackup(world) {
  const save=createSave(world),readable=JSON.stringify(save,null,2);
  if(new TextEncoder().encode(readable).byteLength<=MAX_BACKUP_BYTES)return readable;
  const compact=JSON.stringify(save);
  if(new TextEncoder().encode(compact).byteLength>MAX_BACKUP_BYTES)throw new Error('백업 파일이 32MB를 초과해 내보낼 수 없습니다. 구단 저장은 유지됩니다.');
  return compact;
}

export function restoreWorld(value) {
  const data = validateSave(value);
  if (data.schemaVersion >= 2) return updateClubNames(updatePlayerIdentities(data.world));
  // 같은 구형 저장은 같은 세계로 변환한다. 읽기만으로 기존 저장을 바꾸지 않는다.
  let seed = 2166136261;
  for (const character of JSON.stringify(data.club)) seed = Math.imul(seed ^ character.codePointAt(0), 16777619) >>> 0;
  const world = createWorld(data.club, seed);
  world.seasonCalendar = { mode: 'legacy', phase: 'season' };
  return world;
}

export function parseBackup(source) {
  if (new TextEncoder().encode(source).byteLength > MAX_BACKUP_BYTES) throw new Error('백업 파일은 32MB 이하여야 합니다.');
  let parsed;
  try { parsed = JSON.parse(source); }
  catch { throw new Error('JSON 형식이 올바르지 않습니다.'); }
  return validateSave(parsed);
}
