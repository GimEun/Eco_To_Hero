import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const spec = read('site-calibration-freeze.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const key = row => [row.seed, row.map, row.side].join(':');
const expected = spec.seeds.flatMap(seed => spec.maps.flatMap(map => ['home', 'away'].map(side => [seed, map, side].join(':')))).sort();
let changesVerified = 0, matchedPrefixRounds = 0;
const mean = xs => xs.length ? xs.reduce((sum, n) => sum + n, 0) / xs.length : null;
function group(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
    winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
}
const candidates = spec.candidates.map((candidate, index) => {
  const previous = read(candidate.reference).rows.filter(row => !row.recruit);
  const fixed = previous.filter(row => row.profile === 'fixed');
  const site = read(`site-cal-${candidate.name}/opponent-diagnose-purchase-site-cal.json`).rows;
  for (const samples of [fixed, site]) {
    assert.deepEqual(samples.map(key).sort(), expected); assert.equal(new Set(samples.map(key)).size, 18);
  }
  for (const row of site) {
    assert.equal(row.diagnosticAttackPolicy, 'site'); assert.equal(row.profile, 'combined'); assert.equal(row.recruit, false);
    const original = previous.find(old => old.profile === 'combined' && key(old) === key(row)); assert.ok(original);
    for (const field of ['map', 'choice', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses']) assert.deepEqual(row[field], original[field], field);
    assert.deepEqual(row.statRange, [candidate.range, 54]); assert.equal(row.opponentVariant, candidate.variant);
    assert.equal(row.homePurchasePolicy, 'legacy'); assert.equal(row.purchase, 'mixed');
    changesVerified += verifyPolicy(row, 'site');
    assert.equal(row.rounds, row.detail.length); assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    const first = original.homeChanges.find(change => change.role === 'attack');
    const prefix = first ? first.round - 1 : original.detail.length;
    assert.deepEqual(row.detail.slice(0, prefix), original.detail.slice(0, prefix)); matchedPrefixRounds += prefix;
    for (const round of row.detail) {
      for (const actor of round.gear) assert.ok(actor.cash >= 0 && actor.cash <= 16000);
      for (const [role, metric] of Object.entries(round.movementTrace)) {
        assert.equal(metric.episodes, metric.reached + metric.changed + metric.died + metric.pending);
        if (!role.endsWith(':other')) assert.equal(metric.riskPlans, 0);
      }
      for (const decision of round.riskDetours.decisions) {
        assert.ok(decision.after < decision.before);
        assert.ok(decision.alternativeLength <= decision.originalLength * 1.5 + 1e-7);
        assert.ok(decision.alternativeLength <= decision.originalLength + 240 + 1e-7);
      }
    }
  }
  const baseline = group(fixed), reactive = group(site);
  const fixedDistance = Math.max(0, baseline.rate - .2), reactiveDistance = Math.max(0, .55 - reactive.rate, reactive.rate - .65);
  return { ...candidate, index, fixed: baseline, reactive, squaredDistance: fixedDistance ** 2 + reactiveDistance ** 2,
    allRateTargetsMet: fixedDistance === 0 && reactiveDistance === 0,
    maps: spec.maps.map(map => ({ map, fixed: group(fixed.filter(row => row.map === map)), reactive: group(site.filter(row => row.map === map)) })) };
});
const ordered = [...candidates].sort((a, b) => a.squaredDistance - b.squaredDistance || (a.reactive.winningMargin ?? Infinity) - (b.reactive.winningMargin ?? Infinity) || a.index - b.index);
const result = { candidates, selected: ordered[0].name, newMatches: 54, reusedMatches: 54,
  newRounds: candidates.reduce((sum, candidate) => sum + candidate.reactive.rounds, 0),
  changesVerified, matchedPrefixRounds, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'User-approved site-only attack switch diagnostic policy. Initial roster only. Prior independent failures preserved. Candidate ranking is not deployment approval or independent validation.' };
fs.writeFileSync(`${root}/site-calibration-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, candidates: candidates.map(({ maps, ...candidate }) => candidate) }, null, 2));
