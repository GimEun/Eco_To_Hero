import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
import { canOccupy, rayDistance } from '../../src/simulation/geometry.js';
import { PRACTICE_MAPS } from '../../src/data/maps/index.js';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('trade-range-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const map = PRACTICE_MAPS.find(map => map.id === 'research');
const groups = [], pairs = [];
let policyChanges = 0, checkedSamples = 0;
function summary(rows) {
  return { matches: rows.length, wins: rows.filter(row => row.winner === 'home').length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    meanMargin: rows.reduce((sum, row) => sum + row.score.home - row.score.away, 0) / rows.length,
    openingWins: rows.filter(row => row.detail[0].winner === 'home').length,
    openingPlants: rows.filter(row => row.detail[0].researchBombEvents.some(event => event.type === 'bomb-planted')).length };
}
for (const plan of ['split', 'execute']) {
  const before = read(`entry-support-${plan}/opponent-diagnose-purchase-entry-support.json`).rows;
  const after = read(`trade-range-${plan}/opponent-diagnose-purchase-trade-range.json`).rows;
  assert.equal(after.length, 3); assert.deepEqual(after.map(row => row.seed).sort((a, b) => a - b), [...spec.seeds].sort((a, b) => a - b));
  for (const row of after) {
    const original = before.find(other => other.seed === row.seed); assert.ok(original);
    for (const field of ['map', 'side', 'choice', 'recruit', 'profile', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses', 'diagnosticAttackPolicy', 'diagnosticSlot3Preference']) assert.deepEqual(row[field], original[field], field);
    assert.equal(row.diagnosticTradeRange, 'two-tiles'); assert.ok(!Object.hasOwn(row, 'diagnosticTradeHoldTicks'));
    assert.deepEqual(row.detail[0].gear, original.detail[0].gear);
    policyChanges += verifyPolicy(row, 'site');
    assert.equal(row.rounds, row.detail.length); assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    for (const round of row.detail) {
      for (const sample of round.tradeRangeAudit.samples) {
        checkedSamples++; const distance = Math.hypot(sample.point.x - sample.contact.x, sample.point.y - sample.contact.y);
        assert.ok(sample.contact.tick <= sample.tick && sample.tick - sample.contact.tick <= 20);
        assert.ok(distance <= sample.range + 1e-7); assert.ok(sample.shift <= 2 * map.tileSize + 1e-7);
        assert.ok(canOccupy(map, sample.point.x, sample.point.y, 10));
        assert.ok(rayDistance(map, sample.point, Math.atan2(sample.contact.y - sample.point.y, sample.contact.x - sample.point.x), distance) >= distance - 1e-7);
      }
      for (const actor of round.gear) assert.ok(actor.cash >= 0 && actor.cash <= 16000);
      for (const [role, metric] of Object.entries(round.movementTrace)) {
        assert.equal(metric.episodes, metric.reached + metric.changed + metric.died + metric.pending);
        if (!role.endsWith(':other')) assert.equal(metric.riskPlans, 0);
      }
    }
    const firstShot = (round, id) => round.researchOpening.events.find(event => event.type === 'shot' && event.actorId === id)?.tick ?? null;
    pairs.push({ plan, seed: row.seed, before: original.score, after: row.score,
      improved: original.winner === 'away' && row.winner === 'home', worsened: original.winner === 'home' && row.winner === 'away',
      supportFirstShots: ['home-4', 'home-5'].map(id => ({ id, before: firstShot(original.detail[0], id), after: firstShot(row.detail[0], id) })),
      openingAudit: row.detail[0].tradeRangeAudit,
      adjustedActorTicks: row.detail.reduce((sum, round) => sum + (round.tradeRangeAudit.counts.adjusted ?? 0), 0) });
  }
  groups.push({ plan, before: summary(before), after: summary(after) });
}
const result = { groups, pairs, improvedWinners: pairs.filter(pair => pair.improved).length,
  worsenedWinners: pairs.filter(pair => pair.worsened).length, policyChanges, checkedSamples,
  diagnosticMatches: 6, reusedMatches: 6, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Only observed-contact trade point geometry changed for both attacking teams. No destination hold, no economic/player change, known-world trial only.' };
fs.writeFileSync(`${root}/trade-range-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: pairs.map(({ openingAudit, ...pair }) => ({ ...pair, openingCounts: openingAudit.counts })) }, null, 2));
