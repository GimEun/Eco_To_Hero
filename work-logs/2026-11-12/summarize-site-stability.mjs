import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const spec = read('site-stability-freeze.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const key = row => `${row.seed}:${row.side}`;
const expected = spec.seeds.flatMap(seed => ['home', 'away'].map(side => `${seed}:${side}`)).sort();
const groups = { fixed: [], both: [], site: [] };
let changesVerified = 0, matchedPrefixRounds = 0;
for (const map of spec.maps) {
  const previous = read(`independent-reactive48-${map}/opponent-diagnose-purchase-independent-reactive48.json`).rows.filter(row => !row.recruit);
  const fixed = previous.filter(row => row.profile === 'fixed'), both = previous.filter(row => row.profile === 'combined');
  const site = read(`site-stability-${map}/opponent-diagnose-purchase-site-stability.json`).rows;
  for (const samples of [fixed, both, site]) {
    assert.deepEqual(samples.map(key).sort(), expected); assert.equal(new Set(samples.map(key)).size, 12);
  }
  for (const row of site) {
    const original = both.find(other => key(other) === key(row));
    assert.equal(row.diagnosticAttackPolicy, 'site'); assert.equal(row.profile, 'combined'); assert.equal(row.recruit, false);
    assert.equal(row.map, map); assert.deepEqual(row.statRange, [48, 54]); assert.equal(row.opponentVariant, 'current');
    assert.equal(row.purchase, 'mixed'); assert.equal(row.homePurchasePolicy, 'legacy');
    for (const field of ['choice', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses']) assert.deepEqual(row[field], original[field]);
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
  groups.fixed.push(...fixed); groups.both.push(...both); groups.site.push(...site);
}
const mean = xs => xs.length ? xs.reduce((sum, n) => sum + n, 0) / xs.length : null;
function summary(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0), winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
    winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length,
    meanMargin: mean(rows.map(row => row.score.home - row.score.away)) };
}
const overall = Object.fromEntries(Object.entries(groups).map(([name, rows]) => [name, summary(rows)]));
const paired = groups.both.map(original => {
  const alternate = groups.site.find(row => row.map === original.map && key(row) === key(original));
  return { seed: original.seed, map: original.map, side: original.side, both: original.score, site: alternate.score,
    improved: original.winner === 'away' && alternate.winner === 'home', worsened: original.winner === 'home' && alternate.winner === 'away',
    marginChange: alternate.score.home - alternate.score.away - original.score.home + original.score.away };
});
const result = { overall, maps: spec.maps.map(map => ({ map, ...Object.fromEntries(Object.entries(groups).map(([name, rows]) => [name, summary(rows.filter(row => row.map === map))])) })),
  seeds: spec.seeds.map(seed => ({ seed, ...Object.fromEntries(Object.entries(groups).map(([name, rows]) => [name, summary(rows.filter(row => row.seed === seed))])) })),
  paired, improvedWinners: paired.filter(row => row.improved).length, worsenedWinners: paired.filter(row => row.worsened).length,
  initialRateTargetsMet: overall.fixed.rate <= .2 && overall.site.rate >= .55 && overall.site.rate <= .65,
  primaryConditions: 72, newMatches: 36, reusedFixedMatches: 36, historicalBothMatches: 36,
  changesVerified, matchedPrefixRounds, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Known-world stability check, initial roster only. Historical independent both-policy failure preserved. No reseeding or deployment approval.' };
fs.writeFileSync(`${root}/site-stability-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, seeds: undefined, paired: undefined }, null, 2));
