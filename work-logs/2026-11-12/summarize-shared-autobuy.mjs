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
const spec = read('shared-autobuy-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const paired = [], samples = [], groups = [];
let policyChanges = 0, exactOpeningReplays = 0, automaticFreshBuyChecks = 0;
function collect(row, variant, plan) {
  let losses = { home: 0, away: 0 };
  const pistolRun = {};
  for (let i = 0; i < row.detail.length; i++) {
    const round = row.detail[i], previous = row.detail[i - 1];
    const reset = round.round === 1 || round.round === 13 || round.round >= 25 && (round.round - 25) % 3 === 0;
    if (reset) { losses = { home: 0, away: 0 }; for (const actor of round.gear) pistolRun[actor.id] = 0; }
    for (const gear of round.gear) {
      const previousGear = previous?.gear.find(actor => actor.id === gear.id), previousActor = previous?.actors.find(actor => actor.id === gear.id);
      const buyCash = estimateBuyCash(gear, previousGear, previousActor, previous?.thrown ?? [], reset);
      assert.ok(gear.cash >= 0 && gear.cash <= 16000 && buyCash.min <= buyCash.max);
      if (variant === 'shared-auto' && (reset || !previousActor?.alive)) {
        assert.equal(buyCash.min, buyCash.max);
        const actor = { id: gear.id, team: gear.team, number: Number(gear.id.split('-').at(-1)), alive: true,
          weaponId: 'basic-pistol', cash: buyCash.min, armor: 0, throwables: emptyThrowables(), weaponPurchaseCost: 0 };
        const state = { tick: 0, complete: false, economy: { phase: 'buy', roundNumber: round.round, ledger: [] }, actors: [actor] };
        assert.equal(startEconomyRound(state, { autoHome: true }), true);
        assert.deepEqual({ weapon: actor.weaponId, armor: actor.armor, cash: actor.cash, utility: actor.throwables },
          { weapon: gear.weapon, armor: gear.armor, cash: gear.cash, utility: gear.utility });
        automaticFreshBuyChecks++;
      }
      pistolRun[gear.id] = gear.weapon === 'basic-pistol' ? pistolRun[gear.id] + 1 : 0;
      samples.push({ variant, plan, seed: row.seed, round: round.round, team: gear.team, actorId: gear.id,
        weapon: gear.weapon, cash: gear.cash, utilityCount: Object.values(gear.utility).reduce((sum, n) => sum + n, 0),
        losses: losses[gear.team], pistolRun: pistolRun[gear.id] });
    }
    for (const team of ['home', 'away']) losses[team] = round.winner === team ? 0 : losses[team] + 1;
  }
}
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
function summary(rows) {
  return { matches: rows.length, wins: rows.filter(row => row.winner === 'home').length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0), openingWins: rows.filter(row => row.detail[0].winner === 'home').length,
    meanMargin: mean(rows.map(row => row.score.home - row.score.away)),
    sweepScores: rows.filter(row => row.score.home === 13 && row.score.away === 0 || row.score.away === 13 && row.score.home === 0).length };
}
for (const plan of ['standard', 'forward']) {
  const previous = read(`retreat-observation-${plan}/opponent-diagnose-purchase-retreat-observation.json`).rows;
  const current = read(`shared-autobuy-${plan}/opponent-diagnose-purchase-shared-autobuy.json`).rows;
  assert.equal(current.length, 6);
  assert.deepEqual(current.map(row => row.seed).sort((a, b) => a - b), [...spec.seeds].sort((a, b) => a - b));
  for (const row of current) {
    const before = previous.find(old => old.seed === row.seed); assert.ok(before);
    for (const field of ['map', 'side', 'choice', 'recruit', 'profile', 'diagnosticAttackPolicy', 'homeManagement', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses']) assert.deepEqual(row[field], before[field], field);
    assert.equal(row.homePurchasePolicy, 'shared-auto'); assert.equal(before.homePurchasePolicy, 'legacy');
    assert.ok(!Object.hasOwn(row, 'diagnosticDefenseRange'));
    assert.ok(row.detail.every(round => !Object.hasOwn(round, 'defenseRangeAudit')));
    assert.deepEqual(row.detail[0], before.detail[0]); exactOpeningReplays++;
    policyChanges += verifyPolicy(row, 'site');
    assert.equal(row.detail.length, row.rounds); assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    for (const round of row.detail) for (const [role, metric] of Object.entries(round.movementTrace)) {
      assert.equal(metric.episodes, metric.reached + metric.changed + metric.died + metric.pending);
      if (!role.endsWith(':other')) assert.equal(metric.riskPlans, 0);
    }
    paired.push({ plan, seed: row.seed, before: before.score, after: row.score,
      improved: before.winner === 'away' && row.winner === 'home', worsened: before.winner === 'home' && row.winner === 'away',
      marginChange: row.score.home - row.score.away - before.score.home + before.score.away });
    collect(before, 'legacy', plan); collect(row, 'shared-auto', plan);
  }
  groups.push({ plan, before: summary(previous), after: summary(current) });
}
const cohorts = ['legacy', 'shared-auto'].flatMap(variant => ['home', 'away'].flatMap(team => ['all', 'after-3-losses'].map(cohort => {
  const selected = samples.filter(sample => sample.variant === variant && sample.team === team && (cohort === 'all' || sample.losses >= 3));
  return { variant, team, cohort, playerRounds: selected.length,
    armedShare: selected.length ? selected.filter(sample => sample.weapon !== 'basic-pistol').length / selected.length : null,
    weapons: Object.fromEntries([...new Set(selected.map(sample => sample.weapon))].sort().map(weapon => [weapon, selected.filter(sample => sample.weapon === weapon).length])),
    meanCash: mean(selected.map(sample => sample.cash)), meanUtilityCount: mean(selected.map(sample => sample.utilityCount)),
    maximumPistolRun: selected.length ? Math.max(...selected.map(sample => sample.pistolRun)) : 0 };
})));
const result = { groups, paired, cohorts, improvedWinners: paired.filter(pair => pair.improved).length,
  worsenedWinners: paired.filter(pair => pair.worsened).length, meanMarginChange: mean(paired.map(pair => pair.marginChange)),
  exactOpeningReplays, automaticFreshBuyChecks, policyChanges,
  diagnosticMatches: 12, reusedMatches: 12, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Only home diagnostic buyer changed to existing shared auto function; original defense rule and all economics retained. Not full fixed/reactive difficulty validation.' };
fs.writeFileSync(`${root}/shared-autobuy-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, paired: undefined }, null, 2));
