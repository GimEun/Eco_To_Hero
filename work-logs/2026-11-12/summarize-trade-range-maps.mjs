import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
import { estimateBuyCash } from './analyze-round-equipment.mjs';
import { startEconomyRound } from '../../src/simulation/economy.js';
import { emptyThrowables } from '../../src/data/throwables.js';
import { PRACTICE_MAPS } from '../../src/data/maps/index.js';
import { canOccupy, rayDistance } from '../../src/simulation/geometry.js';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('trade-range-maps-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const key = row => [row.seed, row.map, row.side, row.profile].join(':');
const before = spec.maps.flatMap(map => read(`slot3-rifle38-${map}/opponent-diagnose-purchase-slot3-rifle38.json`).rows);
const fresh = spec.maps.flatMap(map => read(`trade-range-maps-${map}/opponent-diagnose-purchase-trade-range-maps.json`).rows);
const reused = read('trade-range-split/opponent-diagnose-purchase-trade-range.json').rows;
assert.equal(fresh.length, 33); assert.deepEqual(fresh.map(key).sort(), spec.newConditions.map(key).sort());
assert.equal(reused.length, 3); assert.deepEqual(reused.map(key).sort(), spec.reused.map(key).sort());
const after = [...fresh, ...reused];
assert.equal(new Set(after.map(key)).size, 36); assert.deepEqual(after.map(key).sort(), spec.expected.map(key).sort());
let policyChanges = 0, freshBuyChecks = 0, checkedSamples = 0, adjustedTicks = 0;
const pairs = [];
for (const row of after) {
  const old = before.find(other => key(other) === key(row)); assert.ok(old);
  for (const field of ['choice', 'recruit', 'profile', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses', 'diagnosticAttackPolicy', 'diagnosticSlot3Preference']) assert.deepEqual(row[field], old[field], field);
  assert.equal(row.diagnosticTradeRange, 'two-tiles');
  assert.ok(!Object.hasOwn(row, 'diagnosticTradeHoldTicks')); assert.ok(!Object.hasOwn(row, 'diagnosticDefenseRange'));
  assert.deepEqual(row.detail[0].gear, old.detail[0].gear);
  if (row.profile === 'combined') policyChanges += verifyPolicy(row, 'site');
  else {
    assert.deepEqual(row.homeChanges, []);
    for (const round of row.detail) {
      assert.equal(round.attackPlans.home, 'execute'); assert.equal(round.defensePlans.home, 'standard'); assert.equal(round.site, 'A');
    }
  }
  assert.equal(row.rounds, row.detail.length); assert.equal(row.rounds, row.score.home + row.score.away);
  assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
  assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
  const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
  assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
  const map = PRACTICE_MAPS.find(map => map.id === row.map);
  for (let i = 0; i < row.detail.length; i++) {
    const round = row.detail[i], previous = row.detail[i - 1];
    assert.equal(round.round, i + 1);
    const reset = round.round === 1 || round.round === 13 || round.round >= 25 && (round.round - 25) % 3 === 0;
    for (const gear of round.gear) {
      assert.ok(gear.cash >= 0 && gear.cash <= 16000);
      if (gear.id.endsWith('-3')) assert.notEqual(gear.weapon, 'shotgun');
      const previousActor = previous?.actors.find(actor => actor.id === gear.id);
      if (reset || !previousActor?.alive) {
        const cash = estimateBuyCash(gear, previous?.gear.find(actor => actor.id === gear.id), previousActor, previous?.thrown ?? [], reset);
        assert.equal(cash.min, cash.max);
        const actor = { id: gear.id, number: Number(gear.id.split('-').at(-1)), team: gear.team, alive: true,
          weaponId: 'basic-pistol', cash: cash.min, armor: 0, throwables: emptyThrowables(), weaponPurchaseCost: 0 };
        const state = { tick: 0, complete: false, actors: [actor], economy: { phase: 'buy', roundNumber: round.round, ledger: [] } };
        assert.equal(startEconomyRound(state, { autoHome: true }), true);
        assert.deepEqual({ weapon: actor.weaponId, armor: actor.armor, cash: actor.cash, utility: actor.throwables },
          { weapon: gear.weapon, armor: gear.armor, cash: gear.cash, utility: gear.utility }); freshBuyChecks++;
      }
    }
    adjustedTicks += round.tradeRangeAudit.counts.adjusted ?? 0;
    for (const sample of round.tradeRangeAudit.samples) {
      checkedSamples++;
      const distance = Math.hypot(sample.point.x - sample.contact.x, sample.point.y - sample.contact.y);
      assert.ok(sample.contact.tick <= sample.tick && sample.tick - sample.contact.tick <= 20);
      assert.ok(distance <= sample.range + 1e-7); assert.ok(sample.shift <= 2 * map.tileSize + 1e-7);
      assert.ok(canOccupy(map, sample.point.x, sample.point.y, 10));
      assert.ok(rayDistance(map, sample.point, Math.atan2(sample.contact.y - sample.point.y, sample.contact.x - sample.point.x), distance) >= distance - 1e-7);
    }
    for (const [role, metric] of Object.entries(round.movementTrace)) {
      assert.equal(metric.episodes, metric.reached + metric.changed + metric.died + metric.pending);
      if (!role.endsWith(':other')) assert.equal(metric.riskPlans, 0);
    }
  }
  pairs.push({ key: key(row), map: row.map, side: row.side, profile: row.profile, seed: row.seed, before: old.score, after: row.score,
    improved: old.winner === 'away' && row.winner === 'home', worsened: old.winner === 'home' && row.winner === 'away' });
}
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
function summary(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0), meanMargin: mean(rows.map(row => row.score.home - row.score.away)),
    winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
}
const group = filter => ({ before: summary(before.filter(filter)), after: summary(after.filter(filter)) });
const groups = ['fixed', 'combined'].map(profile => ({ profile, ...group(row => row.profile === profile) }));
const result = { groups,
  maps: spec.maps.map(map => ({ map, profiles: ['fixed', 'combined'].map(profile => ({ profile, ...group(row => row.map === map && row.profile === profile) })) })),
  sides: ['home', 'away'].map(side => ({ side, profiles: ['fixed', 'combined'].map(profile => ({ profile, ...group(row => row.side === side && row.profile === profile) })) })),
  pairs, improvedWinners: pairs.filter(pair => pair.improved).length, worsenedWinners: pairs.filter(pair => pair.worsened).length,
  allRateTargetsMet: groups[0].after.rate <= .2 && groups[1].after.rate >= .55 && groups[1].after.rate <= .65,
  newConditions: 33, reusedConditions: 3, baselineConditions: 36, policyChanges, freshBuyChecks, checkedSamples, adjustedTicks,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false };
fs.writeFileSync(`${root}/trade-range-maps-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: undefined }, null, 2));
