import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = 'work-logs/2026-11-11';
const dominant48 = process.argv[2] === 'dominant48';
const mixed48 = process.argv[2] === 'mixed48' || dominant48;
const prefix = mixed48 ? 'balance-mixed48-choice-seed' : 'balance-choice-seed';
const rows = [1, 42].flatMap(seed => {
  const input = JSON.parse(fs.readFileSync(`${root}/${prefix}${seed}/opponent-diagnose-purchase-choice-pilot.json`, 'utf8'));
  assert.equal(input.rows.length, 96, '훈련용 8조합 비교가 모두 끝나야 선택할 수 있습니다.');
  if (dominant48) {
    const upgraded = JSON.parse(fs.readFileSync(`${root}/balance-mixed48-dominant-seed${seed}/opponent-diagnose-purchase-choice-pilot.json`, 'utf8'));
    assert.equal(upgraded.rows.length, 48);
    input.rows = [...input.rows.filter(row => !row.recruit), ...upgraded.rows];
  }
  return input.rows;
});
const key = row => [row.seed, row.map, row.side, row.recruit, JSON.stringify(row.choice)].join(':');
assert.equal(new Set(rows.map(key)).size, 192);
for (const row of rows) {
  assert.equal(row.boost, mixed48 ? 0 : 6); assert.equal(row.purchase, mixed48 ? 'mixed' : 'rifle-first');
  if (mixed48) assert.deepEqual(row.statRange, [48, 54]);
  if (dominant48 && row.recruit) {
    assert.equal(row.recruitment.policy, 'dominant');
    for (const skill of ['aim', 'intelligence', 'stamina']) assert.ok(row.recruitment.incoming[skill] >= row.recruitment.outgoing[skill]);
  }
  assert.equal(row.switchAfterLosses, 6); assert.equal(row.detail.length, row.rounds);
}
const rankings = [];
const selected = {};
for (const recruit of [false, true]) {
  const profile = recruit ? 'recruited' : 'initial';
  selected[profile] = {};
  for (const map of ['relay', 'warehouse', 'research']) {
    const candidates = [...new Map(rows.filter(row => row.recruit === recruit && row.map === map)
      .map(row => [JSON.stringify(row.choice), row.choice])).values()];
    assert.equal(candidates.length, 8);
    const ranking = candidates.map(choice => {
      const matches = rows.filter(row => row.recruit === recruit && row.map === map && JSON.stringify(row.choice) === JSON.stringify(choice));
      assert.equal(matches.length, 4);
      return { choice, matches: 4, wins: matches.filter(row => row.winner === 'home').length,
        averageMargin: matches.reduce((sum, row) => sum + row.score.home - row.score.away, 0) / 4 };
    }).sort((a, b) => b.wins - a.wins || b.averageMargin - a.averageMargin);
    rankings.push({ profile, map, ranking }); selected[profile][map] = ranking[0].choice;
  }
}
const result = { trainingSeeds: [1, 42], boost: mixed48 ? 0 : 6, purchase: mixed48 ? 'mixed' : 'rifle-first',
  statRange: mixed48 ? [48, 54] : null,
  recruitmentPolicy: dominant48 ? 'dominant' : 'average',
  matches: 192, rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
  rule: 'Most wins, then highest average margin on training seeds; fixed before validation.', selected, rankings };
fs.writeFileSync(`${root}/${dominant48 ? 'balance-dominant48-selected-choices' : mixed48 ? 'balance-mixed48-selected-choices' : 'balance-current-selected-choices'}.json`, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ matches: result.matches, rounds: result.rounds, selected }, null, 2));
