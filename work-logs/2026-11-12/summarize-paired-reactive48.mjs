import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const rows = ['relay', 'warehouse', 'research'].flatMap(map => JSON.parse(fs.readFileSync(
  `${root}/independent-reactive48-${map}/opponent-diagnose-purchase-independent-reactive48.json`, 'utf8')).rows);
const eligible = [...new Set(rows.filter(row => row.recruit).map(row => row.seed))];
const groups = ['fixed', 'combined'].map(profile => {
  const after = rows.filter(row => row.recruit && row.profile === profile);
  const before = after.map(row => rows.find(old => !old.recruit && old.profile === profile
    && old.seed === row.seed && old.map === row.map && old.side === row.side));
  assert.ok(before.every(Boolean)); assert.equal(after.length, 18);
  return { profile, matchedSeeds: eligible, pairs: after.length,
    beforeWins: before.filter(row => row.winner === 'home').length,
    afterWins: after.filter(row => row.winner === 'home').length,
    changedWinners: after.filter((row, i) => row.winner !== before[i].winner).length,
    meanScoreMarginChange: after.reduce((sum, row, i) => sum + (row.score.home - row.score.away)
      - (before[i].score.home - before[i].score.away), 0) / after.length };
});
const result = { groups,
  note: 'Only the same eligible worlds/maps/sides are paired. All six initial worlds versus three recruited worlds are different populations. Recruitment changes player identity and stats; not a pure single-stat causal estimate.' };
fs.writeFileSync(`${root}/reactive48-paired-roster-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
