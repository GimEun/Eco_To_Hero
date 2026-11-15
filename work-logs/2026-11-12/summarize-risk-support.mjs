import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { combineMovement } from './risk-trace.mjs';
const root = 'work-logs/2026-11-12';
const read = name => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8'));
const original = read('risk-reselected46/opponent-diagnose-purchase-risk-reselected46.json').rows;
const common = read('trace-original/opponent-diagnose-purchase-trace-original.json').rows;
const key = row => [row.seed, row.map, row.side, row.recruit, row.profile].join(':');
const commonKeys = new Set(common.map(key));
const candidates = [];
const cases = [
  { variant: 'support-first', range: 46, directory: 'full-support-first', mode: 'diagnose-purchase-full-support-first' },
  { variant: 'support-stable', range: 46, directory: 'full-support-stable', mode: 'diagnose-purchase-full-support-stable' },
  ...[44, 45].map(range => ({ variant: `support-first${range}`, range, directory: `support-first${range}`, mode: `diagnose-purchase-support-first${range}` })),
];
for (const { variant, range, directory, mode } of cases) {
  const file = `${root}/${directory}/opponent-${mode}.json`;
  const run = spawnSync(process.execPath, [`${root}/summarize-recalibration.mjs`, `final-${variant}-summary`, file], {
    encoding: 'utf8', env: { ...process.env, CALIBRATION_ROOT: `${root}/risk-training` },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const summary = read(`risk-training/final-${variant}-summary.json`);
  assert.equal(data.rows.length, 72);
  assert.deepEqual(data.rows.map(key).sort(), original.map(key).sort());
  let supportRiskPlans = 0;
  for (const row of data.rows) {
    const old = original.find(prior => key(prior) === key(row));
    for (const field of ['seed', 'map', 'side', 'choice', 'recruitment', 'boost', 'profile', 'purchase', 'opponentVariant', 'opponentInitial', 'homePurchasePolicy', 'homeManagement', 'switchAfterLosses', 'homeAverage']) assert.deepEqual(row[field], old[field]);
    assert.deepEqual(row.statRange, [range, 54]);
    if (range === 46) assert.equal(row.awayAverage, old.awayAverage);
    for (const round of row.detail) for (const [role, group] of Object.entries(round.movementTrace)) {
      assert.equal(group.episodes, group.reached + group.changed + group.died + group.pending);
      if (!role.endsWith(':other')) supportRiskPlans += group.riskPlans;
    }
  }
  assert.equal(supportRiskPlans, 0);
  const subset = data.rows.filter(row => commonKeys.has(key(row)));
  assert.equal(subset.length, 12);
  const rateDistances = summary.groups.map(group => group.profile === 'fixed' ? Math.max(0, group.rate - .2)
    : Math.max(0, .55 - group.rate, group.rate - .65));
  candidates.push({ variant, statRange: [range, 54], ...summary, supportRiskPlans,
    sameAbilityComparison: range === 46,
    squaredRateDistance: rateDistances.reduce((sum, value) => sum + value ** 2, 0),
    movement: combineMovement(data.rows), commonCaseMovement: combineMovement(subset),
    groups: summary.groups.map(group => {
      const rows = original.filter(row => row.recruit === group.recruit && row.profile === group.profile);
      const wins = rows.filter(row => row.winner === 'home');
      return { ...group, beforeWins: wins.length, beforeMatches: rows.length,
        changedWinners: data.rows.filter(row => row.recruit === group.recruit && row.profile === group.profile
          && row.winner !== original.find(prior => key(prior) === key(row)).winner).length };
    }) });
}
const hashes = read('risk-source-hashes.json');
for (const [file, hash] of Object.entries(hashes)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash);
const result = { candidates, commonCaseCount: 12, commonCaseOriginalMovement: combineMovement(common),
  unchangedProductionFiles: Object.keys(hashes).length, independentValidationRun: false, gameChangesApplied: false,
  closestCandidateForProposedValidation: [...candidates].sort((a, b) => a.squaredRateDistance - b.squaredRateDistance)[0].variant,
  proposalOnly: true,
  note: 'Support guard is directly verified. Movement populations differ after battles diverge; arrival means alone are not causal delay estimates. Distance score is a proposal for screening, not a passed gate or changed target. Ability candidates differ from the 46 baseline.' };
fs.writeFileSync(`${root}/risk-support-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ unchangedProductionFiles: result.unchangedProductionFiles, candidates: candidates.map(c => ({
  variant: c.variant, statRange: c.statRange, matches: c.matches, rounds: c.rounds, supportRiskPlans: c.supportRiskPlans, allRateTargetsMet: c.allRateTargetsMet, squaredRateDistance: c.squaredRateDistance,
  groups: c.groups.map(({ maps, ...group }) => group),
})) }, null, 2));
