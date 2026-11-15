import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { OPPONENT_STRATEGY } from '../../src/config/opponent-strategy.js';
const root = 'work-logs/2026-11-12', name = 'independent-initial46';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
// Reuse unchanged full protocol validation; its four-group target flags are legacy diagnostics.
execFileSync(process.execPath, [`${root}/summarize-independent44.mjs`, name], { stdio: 'pipe' });
const checked = read(`${name}-summary.json`);
const rows = ['relay', 'warehouse', 'research'].flatMap(map => read(`${name}-${map}/opponent-diagnose-purchase-${name}.json`).rows);
for (const row of rows) {
  const expected = { ...OPPONENT_STRATEGY.maps[row.map] };
  expected.attack = expected.attack === 'execute' ? 'split' : 'execute';
  assert.deepEqual(row.opponentInitial, expected);
}
const paired = ['fixed', 'combined'].map(profile => {
  const after = rows.filter(row => row.recruit && row.profile === profile);
  const before = after.map(row => rows.find(old => !old.recruit && old.profile === profile && old.seed === row.seed && old.map === row.map && old.side === row.side));
  assert.ok(before.every(Boolean));
  return { profile, pairs: after.length, beforeWins: before.filter(row => row.winner === 'home').length,
    afterWins: after.filter(row => row.winner === 'home').length,
    meanScoreMarginChange: after.length ? after.reduce((sum, row, i) => sum + row.score.home - row.score.away - before[i].score.home + before[i].score.away, 0) / after.length : null };
});
const result = { ...checked, groups: checked.groups.map(group => ({ ...group, targetRateMet: group.recruit ? null : group.targetRateMet })),
  targetScope: 'initial-only', initialRateTargetsMet: checked.groups.filter(group => !group.recruit).every(group => group.targetRateMet),
  paired, note: 'Recruitment has no win-rate cap. Legacy allRateTargetsMet is removed; close-game metrics are descriptive, without an invented pass threshold. Prior failures unchanged.' };
delete result.allRateTargetsMet;
fs.writeFileSync(`${root}/initial-reference-result.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, groups: result.groups.map(({ maps, sides, ...group }) => group) }, null, 2));
