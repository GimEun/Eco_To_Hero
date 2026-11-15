import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
import { estimateBuyCash } from './analyze-round-equipment.mjs';
import { startEconomyRound } from '../../src/simulation/economy.js';
import { emptyThrowables } from '../../src/data/throwables.js';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('slot3-rifle-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const before = read('shared-range42/opponent-diagnose-purchase-shared-range.json').rows;
const after = spec.maps.flatMap(map => read(`slot3-rifle-${map}/opponent-diagnose-purchase-slot3-rifle.json`).rows);
const key = row => [row.seed, row.map, row.side, row.profile].join(':');
const expected = spec.seeds.flatMap(seed => spec.maps.flatMap(map => ['home', 'away'].flatMap(side => ['fixed', 'combined'].map(profile => [seed, map, side, profile].join(':'))))).sort();
assert.equal(after.length, 36); assert.equal(new Set(after.map(key)).size, 36); assert.deepEqual(after.map(key).sort(), expected);
let policyChanges = 0, initialRoundPairs = 0, freshBuyChecks = 0;
const pairs = [];
for (const row of after) {
  const old = before.find(previous => key(previous) === key(row)); assert.ok(old);
  for (const field of ['choice', 'recruit', 'profile', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses', 'diagnosticAttackPolicy']) assert.deepEqual(row[field], old[field], field);
  assert.equal(row.diagnosticSlot3Preference, 'training-rifle'); assert.ok(!Object.hasOwn(row, 'diagnosticDefenseRange'));
  assert.deepEqual(row.detail[0], old.detail[0]); initialRoundPairs++;
  if (row.profile === 'combined') policyChanges += verifyPolicy(row, 'site');
  else {
    assert.deepEqual(row.homeChanges, []);
    for (const round of row.detail) { assert.equal(round.attackPlans.home, 'execute'); assert.equal(round.defensePlans.home, 'standard'); assert.equal(round.site, 'A'); }
  }
  assert.equal(row.rounds, row.detail.length); assert.equal(row.rounds, row.score.home + row.score.away);
  assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
  assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
  const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
  assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
  for (let i = 0; i < row.detail.length; i++) {
    const round = row.detail[i], previous = row.detail[i - 1];
    const reset = round.round === 1 || round.round === 13 || round.round >= 25 && (round.round - 25) % 3 === 0;
    for (const gear of round.gear) {
      assert.ok(gear.cash >= 0 && gear.cash <= 16000);
      if (gear.id.endsWith('-3')) assert.notEqual(gear.weapon, 'shotgun');
      const previousActor = previous?.actors.find(actor => actor.id === gear.id);
      if (reset || !previousActor?.alive) {
        const value = estimateBuyCash(gear, previous?.gear.find(actor => actor.id === gear.id), previousActor, previous?.thrown ?? [], reset);
        assert.equal(value.min, value.max);
        const actor = { id: gear.id, number: Number(gear.id.split('-').at(-1)), team: gear.team, alive: true,
          weaponId: 'basic-pistol', cash: value.min, armor: 0, throwables: emptyThrowables(), weaponPurchaseCost: 0 };
        const state = { tick: 0, complete: false, actors: [actor], economy: { phase: 'buy', roundNumber: round.round, ledger: [] } };
        assert.equal(startEconomyRound(state, { autoHome: true }), true);
        assert.deepEqual({ weapon: actor.weaponId, armor: actor.armor, cash: actor.cash, utility: actor.throwables },
          { weapon: gear.weapon, armor: gear.armor, cash: gear.cash, utility: gear.utility }); freshBuyChecks++;
      }
    }
    for (const [role, metric] of Object.entries(round.movementTrace)) {
      assert.equal(metric.episodes, metric.reached + metric.changed + metric.died + metric.pending);
      if (!role.endsWith(':other')) assert.equal(metric.riskPlans, 0);
    }
  }
  pairs.push({ map: row.map, seed: row.seed, side: row.side, profile: row.profile, before: old.score, after: row.score,
    improved: old.winner === 'away' && row.winner === 'home', worsened: old.winner === 'home' && row.winner === 'away' });
}
const mean = xs => xs.length ? xs.reduce((sum, n) => sum + n, 0) / xs.length : null;
function summary(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length, rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    meanMargin: mean(rows.map(row => row.score.home - row.score.away)), winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
    winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
}
function slotStats(rows) {
  const values = rows.flatMap(row => row.detail.filter(round => round.attackTeam === 'home').map(round => ({ gear: round.gear.find(actor => actor.id === 'home-3'), actor: round.actors.find(actor => actor.id === 'home-3') })));
  return { playerRounds: values.length, rifles: values.filter(value => value.gear.weapon === 'training-rifle').length,
    shotguns: values.filter(value => value.gear.weapon === 'shotgun').length,
    survival: mean(values.map(value => Number(value.actor.alive))), damagePerRound: mean(values.map(value => value.actor.damage)),
    zeroShots: values.filter(value => value.actor.shots === 0).length };
}
const groups = ['fixed', 'combined'].map(profile => ({ profile, before: summary(before.filter(row => row.profile === profile)), after: summary(after.filter(row => row.profile === profile)) }));
const result = { groups, maps: spec.maps.map(map => ({ map, profiles: ['fixed', 'combined'].map(profile => ({ profile,
  before: summary(before.filter(row => row.map === map && row.profile === profile)), after: summary(after.filter(row => row.map === map && row.profile === profile)) })) })),
  slot3HomeReactiveAttack: { before: slotStats(before.filter(row => row.profile === 'combined')), after: slotStats(after.filter(row => row.profile === 'combined')) }, pairs,
  allRateTargetsMet: groups[0].after.rate <= .2 && groups[1].after.rate >= .55 && groups[1].after.rate <= .65,
  policyChanges, initialRoundPairs, freshBuyChecks, newConditions: 36, reusedConditions: 36,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Both teams slot3 preference changed equally in diagnostic only; known-world causal policy trial, not independent difficulty validation or deployment approval.' };
fs.writeFileSync(`${root}/slot3-rifle-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: undefined }, null, 2));
