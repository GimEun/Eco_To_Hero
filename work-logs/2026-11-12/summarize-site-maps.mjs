import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const spec = read('site-maps-freeze.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const rows = [], pairs = [];
let verifiedChanges = 0, matchedPrefixRounds = 0;
const key = row => `${row.seed}:${row.side}`;
for (const map of spec.maps) {
  const both = read(`independent-initial46-${map}/opponent-diagnose-purchase-independent-initial46.json`).rows.filter(row => !row.recruit && row.profile === 'combined');
  const site = read(map === 'research' ? 'attack-switch-site/opponent-diagnose-purchase-attack-switch-site.json' : `site-maps-${map}/opponent-diagnose-purchase-site-maps.json`).rows;
  const expected = spec.seeds.flatMap(seed => ['home', 'away'].map(side => `${seed}:${side}`)).sort();
  for (const [policy, samples] of [['both', both], ['site', site]]) {
    assert.deepEqual(samples.map(key).sort(), expected); assert.equal(new Set(samples.map(key)).size, 12);
    for (const sample of samples) {
      const original = both.find(row => key(row) === key(sample));
      assert.equal(sample.map, map);
      for (const field of ['recruit', 'choice', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses']) assert.deepEqual(sample[field], original[field]);
      if (policy === 'site') assert.equal(sample.diagnosticAttackPolicy, policy);
      verifiedChanges += verifyPolicy(sample, policy);
      assert.equal(sample.rounds, sample.detail.length); assert.equal(sample.rounds, sample.score.home + sample.score.away);
      assert.equal(sample.score.home, sample.detail.filter(round => round.winner === 'home').length);
      assert.equal(sample.winner, sample.score.home > sample.score.away ? 'home' : 'away');
      const win = Math.max(sample.score.home, sample.score.away), loss = Math.min(sample.score.home, sample.score.away);
      assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
      if (policy === 'site') {
        const first = original.homeChanges.find(change => change.role === 'attack');
        const prefix = first ? first.round - 1 : original.detail.length;
        assert.deepEqual(sample.detail.slice(0, prefix), original.detail.slice(0, prefix)); matchedPrefixRounds += prefix;
      }
      for (const round of sample.detail) {
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
      rows.push({ policy, sample });
    }
  }
  for (const original of both) {
    const alternate = site.find(row => key(row) === key(original));
    pairs.push({ map, seed: original.seed, side: original.side, both: original.score, site: alternate.score,
      improved: original.winner === 'away' && alternate.winner === 'home', worsened: original.winner === 'home' && alternate.winner === 'away',
      marginChange: alternate.score.home - alternate.score.away - original.score.home + original.score.away });
  }
}
const mean = xs => xs.length ? xs.reduce((sum, n) => sum + n, 0) / xs.length : null;
function summary(entries) {
  const samples = entries.map(entry => entry.sample), wins = samples.filter(row => row.winner === 'home');
  return { matches: samples.length, wins: wins.length, rate: wins.length / samples.length,
    rounds: samples.reduce((sum, row) => sum + row.rounds, 0), meanMargin: mean(samples.map(row => row.score.home - row.score.away)),
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)), winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length,
    roles: ['attack', 'defense'].map(role => { const rounds = samples.flatMap(row => row.detail.filter(round => (round.attackTeam === 'home') === (role === 'attack')));
      return { role, rounds: rounds.length, wins: rounds.filter(round => round.winner === 'home').length }; }) };
}
const groups = ['both', 'site'].map(policy => ({ policy, ...summary(rows.filter(entry => entry.policy === policy)) }));
const maps = spec.maps.map(map => ({ map, policies: ['both', 'site'].map(policy => ({ policy, ...summary(rows.filter(entry => entry.policy === policy && entry.sample.map === map)) })),
  improved: pairs.filter(pair => pair.map === map && pair.improved).length, worsened: pairs.filter(pair => pair.map === map && pair.worsened).length,
  meanMarginChange: mean(pairs.filter(pair => pair.map === map).map(pair => pair.marginChange)) }));
const result = { groups, maps, pairs, conditions: rows.length, newMatches: 24, reusedMatches: 48,
  verifiedChanges, matchedPrefixRounds, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Exploratory known-seed initial-roster comparison. No global policy replacement or deployment approval; downstream economy/defense outcomes can differ.' };
fs.writeFileSync(`${root}/site-maps-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: undefined }, null, 2));
