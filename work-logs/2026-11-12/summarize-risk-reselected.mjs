import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const candidates = [];
const previousFixed = read('risk46/opponent-diagnose-purchase-risk46.json').rows.filter(row => row.profile === 'fixed');
let unchangedFixedControls = 0;
for (const value of [46, 47, 48]) {
  const file = `${root}/risk-reselected${value}/opponent-diagnose-purchase-risk-reselected${value}.json`;
  const run = spawnSync(process.execPath, [`${root}/summarize-recalibration.mjs`, `risk-reselected${value}-summary`, file], {
    encoding: 'utf8', env: { ...process.env, CALIBRATION_ROOT: `${root}/risk-training` },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const summary = read(`risk-training/risk-reselected${value}-summary.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.rows.length, 72);
  let attempts = 0, applied = 0, restored = 0;
  for (const row of data.rows) {
    assert.ok(row.detail.every(round => round.riskDetours));
    assert.deepEqual(row.statRange, [value, 54]);
    for (const round of row.detail) {
      attempts += round.riskDetours.attempts;
      applied += round.riskDetours.applied;
      restored += round.riskDetours.restored;
    }
    if (value === 46 && row.profile === 'fixed') {
      const old = previousFixed.find(prior => prior.seed === row.seed && prior.map === row.map && prior.side === row.side && prior.recruit === row.recruit);
      for (const field of ['score', 'rounds', 'detail', 'recruitment']) assert.deepEqual(row[field], old[field]);
      unchangedFixedControls++;
    }
  }
  candidates.push({ value, ...summary, diagnostic: { attempts, applied, restored } });
}
assert.equal(unchangedFixedControls, 36);
const training = ['relay', 'warehouse', 'research'].flatMap(map => read(`risk-training/train-${map}/opponent-diagnose-purchase-choice-pilot.json`).rows);
assert.equal(training.length, 192);
for (const row of training) assert.ok(row.detail.every(round => round.riskDetours));
const hashes = read('risk-source-hashes.json');
for (const [file, hash] of Object.entries(hashes)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash);
const result = { trainingMatches: training.length, trainingRounds: training.reduce((sum, row) => sum + row.rounds, 0),
  comparisonMatches: candidates.reduce((sum, item) => sum + item.matches, 0), comparisonRounds: candidates.reduce((sum, item) => sum + item.rounds, 0),
  unchangedFixedControls, unchangedProductionFiles: Object.keys(hashes).length, candidates,
  independentValidationRun: false, gameChangesApplied: false,
  note: 'Training and known comparison seeds are separate purposes, not independent final validation. Fixed controls repeat prior matches.' };
fs.writeFileSync(`${root}/risk-reselected-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, candidates: candidates.map(({ groups, ...candidate }) => ({ ...candidate, groups: groups.map(({ maps, ...group }) => group) })) }, null, 2));
