import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyReactiveChanges } from './reactive-policy-check.mjs';
import { OPPONENT_STRATEGY } from '../../src/config/opponent-strategy.js';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const starting = read('risk-training/selected-choices.json').selected;
const reference = ['relay', 'warehouse', 'research'].flatMap(map => read(`reactive-eval44-${map}/opponent-diagnose-purchase-reactive-eval44.json`).rows);
const retries = read('reactive-calibration-io-retries.json');
const specs = [{ name: 'range46', range: 46, variant: 'current' }, { name: 'range48', range: 48, variant: 'current' },
  { name: 'attack46', range: 46, variant: 'attack-alternative' }, { name: 'defense46', range: 46, variant: 'defense-alternative' }];
const key = row => [row.seed, row.map, row.side, row.recruit, row.profile].join(':');
const mean = numbers => numbers.length ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : null;
function summarize(rows) {
  const groups = [false, true].flatMap(recruit => ['fixed', 'combined'].map(profile => {
    const selected = rows.filter(row => row.recruit === recruit && row.profile === profile);
    assert.equal(selected.length, 18);
    const wins = selected.filter(row => row.winner === 'home'), rate = wins.length / selected.length;
    const distance = profile === 'fixed' ? Math.max(0, rate - .2) : Math.max(0, .55 - rate, rate - .65);
    return { recruit, profile, matches: selected.length, wins: wins.length, rate, distance,
      targetRateMet: distance === 0, winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
      winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
  }));
  return { matches: rows.length, rounds: rows.reduce((sum, row) => sum + row.rounds, 0), groups,
    squaredRateDistance: groups.reduce((sum, group) => sum + group.distance ** 2, 0),
    reactiveWinningMargin: mean(rows.filter(row => row.profile === 'combined' && row.winner === 'home').map(row => row.score.home - row.score.away)),
    allRateTargetsMet: groups.every(group => group.targetRateMet) };
}
let verifiedChanges = 0, replayedRows = 0;
const candidates = specs.map(spec => {
  const retry = retries.find(retry => retry.name === spec.name);
  const file = retry?.replacement ?? `reactive-${spec.name}/opponent-diagnose-purchase-reactive-${spec.name}.json`;
  const data = read(file);
  assert.equal(data.rows.length, 72); assert.deepEqual(data.seeds, [73, 101, 211]);
  assert.deepEqual(data.rows.map(key).sort(), reference.map(key).sort());
  assert.equal(new Set(data.rows.map(key)).size, 72);
  if (retry) {
    const pending = read(retry.pending); assert.deepEqual(data.rows.slice(0, pending.rows.length), pending.rows); replayedRows += pending.rows.length;
  }
  for (const row of data.rows) {
    assert.equal(row.homeManagement, 'reactive'); assert.equal(row.purchase, 'mixed');
    assert.equal(row.homePurchasePolicy, 'legacy'); assert.equal(row.switchAfterLosses, 6);
    assert.deepEqual(row.statRange, [spec.range, 54]); assert.equal(row.opponentVariant, spec.variant);
    assert.deepEqual(row.choice, starting[row.recruit ? 'recruited' : 'initial'][row.map]);
    const previous = reference.find(old => key(old) === key(row));
    assert.deepEqual(row.recruitment, previous.recruitment); assert.equal(row.homeAverage, previous.homeAverage);
    const initial = { ...OPPONENT_STRATEGY.maps[row.map] };
    if (spec.variant === 'attack-alternative') initial.attack = initial.attack === 'execute' ? 'split' : 'execute';
    if (spec.variant === 'defense-alternative') initial.defense = initial.defense === 'standard' ? 'forward' : 'standard';
    assert.deepEqual(row.opponentInitial, initial);
    assert.equal(row.detail.length, row.rounds); assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    if (row.profile === 'combined') verifiedChanges += verifyReactiveChanges(row);
    else assert.deepEqual(row.homeChanges, []);
    for (const round of row.detail) {
      for (const actor of round.gear) assert.ok(actor.cash >= 0 && actor.cash <= 16000);
      for (const [role, metric] of Object.entries(round.movementTrace)) {
        assert.equal(metric.episodes, metric.reached + metric.changed + metric.died + metric.pending);
        if (!role.endsWith(':other')) assert.equal(metric.riskPlans, 0);
      }
    }
  }
  return { ...spec, file, eligible: true, ...summarize(data.rows) };
});
const ordered = [...candidates].sort((a, b) => a.squaredRateDistance - b.squaredRateDistance
  || (a.reactiveWinningMargin ?? Infinity) - (b.reactiveWinningMargin ?? Infinity) || specs.findIndex(s => s.name === a.name) - specs.findIndex(s => s.name === b.name));
const hashes = read('risk-source-hashes.json');
for (const [file, hash] of Object.entries(hashes)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash);
const result = { knownSeeds: [73, 101, 211], reference: { name: 'range44', eligible: false, reason: 'Prior independent fixed-profile failure is preserved', ...summarize(reference) },
  candidates, selected: ordered[0], verifiedChanges, exactReplayedRows: replayedRows,
  unchangedProductionFiles: Object.keys(hashes).length, independentValidation: false, gameChangesApplied: false };
fs.writeFileSync(`${root}/reactive-calibration-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
