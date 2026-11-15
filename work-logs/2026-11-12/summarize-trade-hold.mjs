import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('trade-hold-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const groups = [], pairs = [];
let policyChanges = 0, heldSamples = 0;
function summary(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    meanMargin: rows.reduce((sum, row) => sum + row.score.home - row.score.away, 0) / rows.length,
    openingWins: rows.filter(row => row.detail[0].winner === 'home').length,
    openingPlants: rows.filter(row => row.detail[0].researchBombEvents.some(event => event.type === 'bomb-planted')).length };
}
for (const plan of ['split', 'execute']) {
  const before = read(`entry-support-${plan}/opponent-diagnose-purchase-entry-support.json`).rows;
  const after = read(`trade-hold-${plan}/opponent-diagnose-purchase-trade-hold.json`).rows;
  assert.equal(after.length, 3); assert.deepEqual(after.map(row => row.seed).sort((a, b) => a - b), [...spec.seeds].sort((a, b) => a - b));
  for (const row of after) {
    const original = before.find(other => other.seed === row.seed); assert.ok(original);
    for (const field of ['map', 'side', 'choice', 'recruit', 'profile', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses', 'diagnosticAttackPolicy', 'diagnosticSlot3Preference']) assert.deepEqual(row[field], original[field], field);
    assert.equal(row.diagnosticTradeHoldTicks, 60); assert.deepEqual(row.detail[0].gear, original.detail[0].gear);
    policyChanges += verifyPolicy(row, 'site');
    assert.equal(row.rounds, row.detail.length); assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    for (const round of row.detail) {
      for (const sample of round.tradeHoldAudit.samples) {
        assert.equal(sample.age, sample.tick - sample.observedTick); assert.ok(sample.age >= 0 && sample.age < 60); heldSamples++;
      }
      for (const actor of round.gear) assert.ok(actor.cash >= 0 && actor.cash <= 16000);
      for (const [role, metric] of Object.entries(round.movementTrace)) {
        assert.equal(metric.episodes, metric.reached + metric.changed + metric.died + metric.pending);
        if (!role.endsWith(':other')) assert.equal(metric.riskPlans, 0);
      }
    }
    const shot = (round, id) => round.researchOpening.events.find(event => event.type === 'shot' && event.actorId === id)?.tick ?? null;
    pairs.push({ plan, seed: row.seed, before: original.score, after: row.score,
      improved: original.winner === 'away' && row.winner === 'home', worsened: original.winner === 'home' && row.winner === 'away',
      supportFirstShots: ['home-4', 'home-5'].map(id => ({ id, before: shot(original.detail[0], id), after: shot(row.detail[0], id) })),
      openingDeaths: row.detail[0].researchOpening.events.filter(event => event.type === 'death').map(event => ({ tick: event.tick, actor: event.actorId })),
      openingHoldAudit: row.detail[0].tradeHoldAudit,
      heldTicks: row.detail.reduce((sum, round) => sum + (round.tradeHoldAudit.counts.held ?? 0), 0) });
  }
  groups.push({ plan, before: summary(before), after: summary(after) });
}
const result = { groups, pairs, improvedWinners: pairs.filter(pair => pair.improved).length, worsenedWinners: pairs.filter(pair => pair.worsened).length,
  policyChanges, heldSamples, diagnosticMatches: 6, reusedMatches: 6,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Observed trade destination held up to 60 ticks since last real observation; equal attack-side rule for both teams; known-world trial only.' };
fs.writeFileSync(`${root}/trade-hold-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: pairs.map(({ openingDeaths, openingHoldAudit, ...pair }) => ({ ...pair, openingHeldTicks: openingHoldAudit.counts.held ?? 0 })) }, null, 2));
