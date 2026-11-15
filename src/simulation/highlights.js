// 종료된 라운드의 실제 이벤트만 복사해 요약한다. 재생이나 경기 계산에는 관여하지 않는다.
export function summarizeRound(events) {
  const highlights = [];
  const kills = new Map();
  let firstKill = false;
  for (const event of events) {
    if (event.type === 'death' && !event.friendlyFire) {
      if (!firstKill) {
        highlights.push({ type: 'first-kill', tick: event.tick, actorId: event.killerId, targetId: event.actorId });
        firstKill = true;
      }
      const previous = kills.get(event.killerId)?.count ?? 0;
      kills.set(event.killerId, { count: previous + 1, tick: event.tick });
    } else if (event.type === 'bomb-planted' || event.type === 'bomb-defused') {
      highlights.push({ type: event.type, tick: event.tick, actorId: event.actorId });
    } else if (event.type === 'round-end') {
      highlights.push({ type: event.type, tick: event.tick, winner: event.winner, reason: event.reason });
    }
  }
  for (const [actorId, { count, tick }] of kills) {
    if (count >= 3) highlights.push({ type: 'multi-kill', tick, actorId, kills: count });
  }
  // 같은 틱의 종료 문구는 다른 주요 행동 뒤에 표시한다.
  return highlights.sort((a, b) => a.tick - b.tick || Number(a.type === 'round-end') - Number(b.type === 'round-end'));
}
