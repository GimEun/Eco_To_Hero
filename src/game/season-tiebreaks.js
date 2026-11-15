// 정규 전적의 동률 그룹을 유지하고, 완료된 결정전의 승패로만 순위를 나눈다.
export function tiebreakProgress(regularRows, rounds, seasonId = 'pc-1') {
  const groups = [];
  for (const row of regularRows) {
    const previous = groups.at(-1);
    if (previous && previous.wins === row.wins && previous.losses === row.losses) previous.clubIds.push(row.clubId);
    else groups.push({ rank: groups.reduce((sum, group) => sum + group.clubIds.length, 1), wins: row.wins, losses: row.losses, clubIds: [row.clubId] });
  }
  let consumed = 0;
  while (true) {
    const index = groups.findIndex(group => group.clubIds.length > 1);
    if (index < 0) return { groups, complete: true, consumed, activeRound: null, next: null };
    const group = groups[index];
    const expected = createRound(consumed + 1, group, seasonId);
    const round = rounds[consumed];
    if (!round) return { groups, complete: false, consumed, activeRound: null, next: expected };
    consumed++;
    if (round.fixtures.some(fixture => !fixture.result)) return { groups, complete: false, consumed, activeRound: round, next: null };
    const wins = new Map(group.clubIds.map(id => [id, 0]));
    for (const fixture of round.fixtures) wins.set(fixture.result.homeScore > fixture.result.awayScore ? fixture.homeClubId : fixture.awayClubId,
      wins.get(fixture.result.homeScore > fixture.result.awayScore ? fixture.homeClubId : fixture.awayClubId) + 1);
    const ordered = [...group.clubIds].sort((a, b) => wins.get(b) - wins.get(a) || a.localeCompare(b));
    const split = [];
    for (const id of ordered) {
      const previous = split.at(-1);
      if (previous && previous.wins === wins.get(id)) previous.clubIds.push(id);
      else split.push({ rank: group.rank + split.reduce((sum, part) => sum + part.clubIds.length, 0), wins: wins.get(id), losses: group.clubIds.length - 1 - wins.get(id), clubIds: [id] });
    }
    groups.splice(index, 1, ...split);
  }
}

function createRound(number, group, seasonId) {
  const id = `${seasonId}-t${number}`;
  const clubIds = [...group.clubIds].sort();
  const fixtures = [];
  for (let first = 0; first < clubIds.length; first++) {
    for (let second = first + 1; second < clubIds.length; second++) {
      const pair = [clubIds[first], clubIds[second]];
      if ((number + fixtures.length) % 2) pair.reverse();
      fixtures.push({ id: `${id}-m${fixtures.length + 1}`, ...(seasonId.startsWith('world-1-')?{kind:'world-tiebreak'}:{}), ...(['city-1','province-1','national-1'].includes(seasonId)?{kind:`${seasonId.split('-')[0]}-tiebreak`}:{}),week: 0, homeClubId: pair[0], awayClubId: pair[1], result: null });
    }
  }
  return { id, rank: group.rank, clubIds, fixtures };
}
