import { verifyReactiveChanges } from './reactive-policy-check.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const baseline = read('support-first44/opponent-diagnose-purchase-support-first44.json').rows;
const rows = ['relay', 'warehouse', 'research'].flatMap(map => {
  const data = read(`reactive-eval44-${map}/opponent-diagnose-purchase-reactive-eval44.json`);
  assert.deepEqual(data.seeds, [73, 101, 211]); assert.equal(data.rows.length, 24);
  assert.ok(data.rows.every(row => row.map === map)); return data.rows;
});
const key = row => [row.seed, row.map, row.side, row.recruit, row.profile].join(':');
assert.deepEqual(rows.map(key).sort(), baseline.map(key).sort());
assert.equal(new Set(rows.map(key)).size, 72);
let fixedControls = 0, changes = 0;
for (const row of rows) {
  const old = baseline.find(previous => key(previous) === key(row));
  for (const field of ['choice', 'recruitment', 'boost', 'statRange', 'purchase', 'opponentVariant', 'opponentInitial', 'homePurchasePolicy', 'switchAfterLosses', 'homeAverage', 'awayAverage']) assert.deepEqual(row[field], old[field]);
  assert.equal(row.homeManagement, 'reactive');
  assert.equal(row.rounds, row.detail.length); assert.equal(row.rounds, row.score.home + row.score.away);
  if (row.profile === 'fixed') {
    const a = structuredClone(row), b = structuredClone(old);
    delete a.homeManagement; delete b.homeManagement;
    assert.deepEqual(a, b); fixedControls++; continue;
  }
  changes += verifyReactiveChanges(row);
}
const summarize = selected => {
  const wins = selected.filter(row => row.winner === 'home');
  return { matches: selected.length, wins: wins.length, rate: wins.length / selected.length,
    winningMargin: wins.length ? wins.reduce((sum, row) => sum + row.score.home - row.score.away, 0) / wins.length : null,
    winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length,
    rounds: selected.reduce((sum, row) => sum + row.rounds, 0) };
};
const groups = [false, true].map(recruit => ({ recruit,
  fixed: summarize(rows.filter(row => row.recruit === recruit && row.profile === 'fixed')),
  static: summarize(baseline.filter(row => row.recruit === recruit && row.profile === 'combined')),
  reactive: summarize(rows.filter(row => row.recruit === recruit && row.profile === 'combined')),
  maps: ['relay', 'warehouse', 'research'].map(map => ({ map,
    static: summarize(baseline.filter(row => row.map === map && row.recruit === recruit && row.profile === 'combined')),
    reactive: summarize(rows.filter(row => row.map === map && row.recruit === recruit && row.profile === 'combined')) })) }));
const hashes = read('risk-source-hashes.json');
for (const [file, hash] of Object.entries(hashes)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash);
const result = { newMatches: rows.length, newRounds: rows.reduce((sum, row) => sum + row.rounds, 0),
  knownSeeds: [73, 101, 211], fixedControls, verifiedOwnSideLossChanges: changes, groups,
  independentValidation: false, unchangedProductionFiles: Object.keys(hashes).length, gameChangesApplied: false,
  note: 'Mechanism-defined diagnostic policies, not proven human skill tiers. Prior static-protocol validation failure is not reclassified.' };
fs.writeFileSync(`${root}/reactive-evaluation-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
