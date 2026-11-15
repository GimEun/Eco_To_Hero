import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const spec = read('attack-switch-freeze.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const baseline = read('independent-initial46-research/opponent-diagnose-purchase-independent-initial46.json').rows.filter(row => !row.recruit && row.profile === 'combined');
const sources = Object.fromEntries(spec.policies.map(policy => [policy, policy === 'both' ? baseline : read(`attack-switch-${policy}/opponent-diagnose-purchase-attack-switch-${policy}.json`).rows]));
const key = row => `${row.seed}:${row.side}`;
const expected = spec.seeds.flatMap(seed => ['home', 'away'].map(side => `${seed}:${side}`)).sort();
let changesVerified = 0, prefixRoundsMatched = 0;
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
function roleStats(rounds) {
  const gear = rounds.flatMap(round => round.gear.filter(actor => actor.team === 'home'));
  const actors = rounds.flatMap(round => round.actors.filter(actor => actor.team === 'home'));
  return { rounds: rounds.length, wins: rounds.filter(round => round.winner === 'home').length,
    rate: rounds.length ? rounds.filter(round => round.winner === 'home').length / rounds.length : null,
    rifleShare: gear.filter(actor => actor.weapon === 'training-rifle').length / gear.length,
    defusedEndings: rounds.filter(round => round.reason === 'defused').length,
    explodedEndings: rounds.filter(round => round.reason === 'explosion').length,
    damagePerPlayerRound: actors.reduce((sum, actor) => sum + actor.damage, 0) / actors.length };
}
const summaries = spec.policies.map(policy => {
  const rows = sources[policy]; assert.deepEqual(rows.map(key).sort(), expected); assert.equal(new Set(rows.map(key)).size, 12);
  for (const row of rows) {
    const original = baseline.find(old => key(old) === key(row));
    for (const field of ['map', 'recruit', 'choice', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses']) assert.deepEqual(row[field], original[field], field);
    if (policy !== 'both') assert.equal(row.diagnosticAttackPolicy, policy);
    changesVerified += verifyPolicy(row, policy);
    assert.equal(row.rounds, row.detail.length); assert.equal(row.score.home + row.score.away, row.rounds);
    assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    if (policy !== 'both') {
      const first = original.homeChanges.find(change => change.role === 'attack');
      const prefix = first ? first.round - 1 : original.detail.length;
      assert.deepEqual(row.detail.slice(0, prefix), original.detail.slice(0, prefix));
      prefixRoundsMatched += prefix;
    }
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
  const wins = rows.filter(row => row.winner === 'home');
  return { policy, matches: rows.length, wins: wins.length, rate: wins.length / rows.length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    meanMargin: mean(rows.map(row => row.score.home - row.score.away)),
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
    roles: ['attack', 'defense'].map(role => ({ role, ...roleStats(rows.flatMap(row => row.detail.filter(round => (round.attackTeam === 'home') === (role === 'attack')))) })) };
});
const pairs = baseline.map(row => ({ seed: row.seed, startingAttackTeam: row.side,
  policies: Object.fromEntries(spec.policies.map(policy => { const sample = sources[policy].find(other => key(other) === key(row));
    return [policy, { score: sample.score, winner: sample.winner, margin: sample.score.home - sample.score.away }]; })) }));
const contrasts = [['tactic', 'none'], ['site', 'none'], ['both', 'tactic'], ['both', 'site']].map(([after, before]) => ({ after, before,
  improvedWinners: pairs.filter(pair => pair.policies[before].winner === 'away' && pair.policies[after].winner === 'home').length,
  worsenedWinners: pairs.filter(pair => pair.policies[before].winner === 'home' && pair.policies[after].winner === 'away').length,
  meanMarginChange: mean(pairs.map(pair => pair.policies[after].margin - pair.policies[before].margin)) }));
const result = { summaries, pairs, contrasts, conditions: 48, newMatches: 36, reusedMatches: 12,
  changesVerified, prefixRoundsMatched, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Exploratory known-world policy comparison. Defense rule/buying unchanged; realized defense rounds/economy can differ downstream. No target pass or deployment selection.' };
fs.writeFileSync(`${root}/attack-switch-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: undefined }, null, 2));
