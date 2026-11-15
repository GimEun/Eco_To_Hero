// 이전 기능의 변환 검사를 위한 일 단위 저장. 실제 재정 이력 변환은 별도 통합 검사한다.
export function useDailySchema(save, version) {
  save.schemaVersion = version;
  for (const club of save.world.clubs) {
    for (const contract of Object.values(club.contracts ?? {})) {
      contract.durationDays = ({ 28: 30, 84: 90, 168: 180 })[contract.durationDays] ?? contract.durationDays;
      contract.remainingDays = Math.min(contract.remainingDays, contract.durationDays);
    }
    if (club.finance) club.finance = { startedDay: save.world.day, accruedUnits: 0, arrears: 0, settlements: [] };
  }
  return save;
}
