import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const spec = read('research-start-freeze.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const originalChoices = read('risk-training/selected-choices.json').selected;
const changedChoices = read('research-start-choices.json').selected;
const expectedChoices = structuredClone(originalChoices); expectedChoices.initial.research.attack = 'execute';
assert.deepEqual(changedChoices, expectedChoices);
const before = read('site-stability-research/opponent-diagnose-purchase-site-stability.json').rows;
const after = read('research-start-execute/opponent-diagnose-purchase-research-start.json').rows;
const key = row => `${row.seed}:${row.side}`;
const expected = spec.seeds.flatMap(seed => ['home', 'away'].map(side => `${seed}:${side}`)).sort();
for (const rows of [before, after]) { assert.deepEqual(rows.map(key).sort(), expected); assert.equal(new Set(rows.map(key)).size, 12); }
let changesVerified = 0, unchangedDefensePrefixRounds = 0, defensePrefixRoundsCompared = 0;
const differingDefensePrefixes = [], paired = [];
for (const row of after) {
  const old = before.find(other => key(other) === key(row));
  assert.deepEqual(row.choice, { ...old.choice, attack: 'execute' }); assert.equal(old.choice.attack, 'split');
  for (const field of ['map', 'recruit', 'profile', 'diagnosticAttackPolicy', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses']) assert.deepEqual(row[field], old[field], field);
  changesVerified += verifyPolicy(row, 'site');
  assert.equal(row.detail.length, row.rounds); assert.equal(row.rounds, row.score.home + row.score.away);
  assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
  assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
  const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
  assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
  assert.deepEqual(row.detail[0].gear, old.detail[0].gear);
  for (const round of row.detail) {
    assert.equal(round.attackPlans.home, 'execute');
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
  if (row.side === 'away') {
    const firstAttack = old.detail.find(round => round.attackTeam === 'home')?.round ?? Infinity;
    for (const previous of old.detail.filter(round => round.round < firstAttack)) {
      defensePrefixRoundsCompared++;
      const normalized = structuredClone(previous); normalized.attackPlans.home = 'execute';
      try { assert.deepEqual(row.detail[previous.round - 1], normalized); unchangedDefensePrefixRounds++; }
      catch { differingDefensePrefixes.push({ seed: row.seed, round: previous.round }); }
    }
  }
  paired.push({ seed: row.seed, startingAttackTeam: row.side, before: old.score, after: row.score,
    improved: old.winner === 'away' && row.winner === 'home', worsened: old.winner === 'home' && row.winner === 'away',
    marginChange: row.score.home - row.score.away - old.score.home + old.score.away });
}
const mean = xs => xs.length ? xs.reduce((sum, n) => sum + n, 0) / xs.length : null;
function summary(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length, rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    meanMargin: mean(rows.map(row => row.score.home - row.score.away)), winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
    roles: ['attack', 'defense'].map(role => { const rounds = rows.flatMap(row => row.detail.filter(round => (round.attackTeam === 'home') === (role === 'attack')));
      const opening = rows.filter(row => (row.side === 'home') === (role === 'attack')).map(row => row.detail[0]);
      return { role, wins: rounds.filter(round => round.winner === 'home').length, rounds: rounds.length,
        openingWins: opening.filter(round => round.winner === 'home').length, openingRounds: opening.length }; }) };
}
const result = { split: summary(before), execute: summary(after), paired,
  improvedWinners: paired.filter(pair => pair.improved).length, worsenedWinners: paired.filter(pair => pair.worsened).length,
  meanMarginChange: mean(paired.map(pair => pair.marginChange)), changesVerified, unchangedDefensePrefixRounds, defensePrefixRoundsCompared, differingDefensePrefixes,
  newMatches: 12, reusedMatches: 12, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Known-world research map initial-attack-plan comparison. Site-only policy, defense and buying rules retained; downstream economy/round composition may differ. Not deployment or global target validation.' };
fs.writeFileSync(`${root}/research-start-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
