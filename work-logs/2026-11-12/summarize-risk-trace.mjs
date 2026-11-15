import fs from 'node:fs';
import assert from 'node:assert/strict';
import { combineMovement } from './risk-trace.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const baseline = read('trace-baseline/opponent-diagnose-purchase-trace-baseline.json').rows;
const original = read('trace-original/opponent-diagnose-purchase-trace-original.json').rows;
const prior = read('risk-reselected46/opponent-diagnose-purchase-risk-reselected46.json').rows;
const noRisk = read('candidate46/opponent-diagnose-purchase-reevaluated46.json').rows;
const key = row => [row.seed, row.map, row.side, row.recruit, row.profile].join(':');
const strip = row => { const copy = structuredClone(row); for (const round of copy.detail) delete round.movementTrace; return copy; };
assert.equal(baseline.length, 12); assert.equal(original.length, 12);
assert.deepEqual(baseline.map(key).sort(), original.map(key).sort());
for (const row of original) assert.deepEqual(strip(row), prior.find(old => key(old) === key(row)));
let unchangedBaseline = 0;
for (const row of baseline) {
  const old = noRisk.find(old => key(old) === key(row));
  if (row.profile !== 'fixed' && JSON.stringify(row.choice) !== JSON.stringify(old.choice)) continue;
  const current = strip(row), previous = structuredClone(old);
  current.detail.forEach(round => { assert.equal(round.riskDetours, null); delete round.riskDetours; });
  // The fixed profile never uses its stored choice metadata.
  if (row.profile === 'fixed') { delete current.choice; delete previous.choice; }
  assert.deepEqual(current, previous); unchangedBaseline++;
}
function summarize(rows) {
  for (const row of rows) for (const round of row.detail) for (const [key, group] of Object.entries(round.movementTrace)) {
    assert.equal(group.episodes, group.reached + group.changed + group.died + group.pending);
    assert.ok(group.travel >= 0 && group.arrivalTicks >= 0);
  }
  return { matches: rows.length, rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    wins: rows.filter(row => row.winner === 'home').length, groups: combineMovement(rows) };
}
const result = { exactOriginalMatches: original.length, exactBaselineMatches: unchangedBaseline,
  baseline: summarize(baseline), original: summarize(original),
  note: 'Stage displacement totals and objective episode statistics. Different battles have different episode populations; averages alone do not establish direct delays.' };
fs.writeFileSync(`${root}/risk-trace-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
