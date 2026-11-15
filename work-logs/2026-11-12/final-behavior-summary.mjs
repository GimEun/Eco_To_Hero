import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('final-behavior-freeze.json');
const changedFiles = Object.entries(spec.productionBefore).filter(([file, value]) => hash(file) !== value).map(([file]) => file.replaceAll('\\', '/'));
assert.deepEqual(changedFiles, ['src/simulation/defense-tactics.js']);
const before = read('final-behavior-before/opponent-diagnose-purchase-final-behavior.json').rows;
const after = read('final-behavior-after/opponent-diagnose-purchase-final-behavior.json').rows;
const key = row => [row.seed, row.map, row.side, row.profile].join(':');
const expected = spec.expected.map(key).sort();
let policyChanges = 0;
for (const rows of [before, after]) {
  assert.equal(rows.length, 36); assert.equal(new Set(rows.map(key)).size, 36); assert.deepEqual(rows.map(key).sort(), expected);
  for (const row of rows) {
    assert.equal(row.statRange, null); assert.equal(row.homePurchasePolicy, 'shared-auto');
    assert.ok(!Object.hasOwn(row, 'diagnosticSlot3Preference')); assert.ok(!Object.hasOwn(row, 'diagnosticTradeRange'));
    assert.equal(row.rounds, row.detail.length); assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    if (row.profile === 'combined') policyChanges += verifyPolicy(row, 'site');
    else {
      assert.deepEqual(row.homeChanges, []);
      for (const round of row.detail) {
        assert.equal(round.attackPlans.home, 'execute'); assert.equal(round.defensePlans.home, 'standard'); assert.equal(round.site, 'A');
      }
    }
    for (const round of row.detail) for (const actor of round.gear) assert.ok(actor.cash >= 0 && actor.cash <= 16000);
  }
}
const pairs = after.map(row => {
  const old = before.find(other => key(other) === key(row)); assert.ok(old);
  for (const field of ['seed', 'map', 'side', 'choice', 'recruit', 'profile', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage']) assert.deepEqual(row[field], old[field], field);
  assert.deepEqual(row.detail[0].gear, old.detail[0].gear);
  return { key: key(row), before: old.score, after: row.score,
    improved: old.winner === 'away' && row.winner === 'home', worsened: old.winner === 'home' && row.winner === 'away' };
});
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
function summary(rows) {
  const rounds = rows.flatMap(row => row.detail);
  return { matches: rows.length, wins: rows.filter(row => row.winner === 'home').length,
    rounds: rounds.length, meanMargin: mean(rows.map(row => row.score.home - row.score.away)),
    defeatsBy10OrMore: rows.filter(row => row.score.away - row.score.home >= 10).length,
    attack: { wins: rounds.filter(round => round.attackTeam === 'home' && round.winner === 'home').length, rounds: rounds.filter(round => round.attackTeam === 'home').length },
    defense: { wins: rounds.filter(round => round.attackTeam === 'away' && round.winner === 'home').length, rounds: rounds.filter(round => round.attackTeam === 'away').length } };
}
const compare = predicate => ({ before: summary(before.filter(predicate)), after: summary(after.filter(predicate)) });
const result = { total: compare(() => true), profiles: ['fixed', 'combined'].map(profile => ({ profile, ...compare(row => row.profile === profile) })),
  maps: spec.maps.map(map => ({ map, ...compare(row => row.map === map),
    profiles: ['fixed', 'combined'].map(profile => ({ profile, ...compare(row => row.map === map && row.profile === profile) })) })),
  pairs, improvedWinners: pairs.filter(pair => pair.improved).length, worsenedWinners: pairs.filter(pair => pair.worsened).length,
  policyChanges, changedFiles, productionBeforeFiles: Object.keys(spec.productionBefore).length,
  productionAfter: Object.fromEntries(Object.keys(spec.productionBefore).map(file => [file, hash(file)])),
  independentValidation: false, numericWinTargetRequired: false,
  note: 'Finite before/after regression comparison under actual stat/weapon rules, shared automatic purchase on both teams. No old experimental improvements included. No population win-rate guarantee.' };
fs.writeFileSync(`${root}/final-behavior-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: undefined, productionAfter: undefined }, null, 2));
