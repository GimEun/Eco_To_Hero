import { activeYearAdvance, advanceYearWeek, cancelYearAdvance } from './year-advance.js';

// 주간 결과의 저장이 성공한 뒤 다음 주를 계산한다.
export async function runYearAdvance(world, { commit, cancelled = () => false, onCheckpoint = async () => {} }) {
  while (activeYearAdvance(world)) {
    const candidate = structuredClone(world);
    const result = cancelled() ? cancelYearAdvance(candidate) : advanceYearWeek(candidate);
    await commit(candidate);
    world = candidate;
    await onCheckpoint(world);
    if (cancelled() && activeYearAdvance(world)) {
      const stopped = structuredClone(world);
      cancelYearAdvance(stopped);
      await commit(stopped);
      return stopped;
    }
    if (result.reason !== 'ready') break;
  }
  return world;
}
