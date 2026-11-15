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
const spec = read('shared-baseline-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const fixedReference = read('reactive-range48/opponent-diagnose-purchase-reactive-range48.json').rows.filter(row => !row.recruit && row.profile === 'fixed');
const reactiveReference = read('site-cal-range48/opponent-diagnose-purchase-site-cal.json').rows;
const key = row => [row.seed, row.side, row.profile].join(':');
const rows = [];
let policyChanges = 0, automaticFreshBuyChecks = 0, exactOpeningReplays = 0;
for (const map of spec.maps) {
  const data = read(`shared-baseline-${map}/opponent-diagnose-purchase-shared-baseline.json`);
  const expected = spec.seeds.flatMap(seed => ['home', 'away'].flatMap(side => ['fixed', 'combined'].map(profile => [seed, side, profile].join(':')))).sort();
  assert.deepEqual(data.rows.map(key).sort(), expected); assert.equal(new Set(data.rows.map(key)).size, 12);
  for (const row of data.rows) {
    const reference = (row.profile === 'fixed' ? fixedReference : reactiveReference).find(old => old.seed === row.seed && old.map === map && old.side === row.side); assert.ok(reference);
    for (const field of ['map', 'side', 'choice', 'recruit', 'profile', 'homeManagement', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses']) assert.deepEqual(row[field], reference[field], field);
    assert.equal(row.homePurchasePolicy, 'shared-auto'); assert.equal(row.diagnosticAttackPolicy, 'site');
    assert.ok(!Object.hasOwn(row, 'diagnosticDefenseRange'));
    assert.deepEqual(row.detail[0], reference.detail[0]); exactOpeningReplays++;
    if (row.profile === 'combined') policyChanges += verifyPolicy(row, 'site');
    else {
      assert.deepEqual(row.homeChanges, []);
      for (const round of row.detail) {
        assert.equal(round.attackPlans.home, 'execute'); assert.equal(round.defensePlans.home, 'standard'); assert.equal(round.site, 'A');
      }
    }
    assert.equal(row.detail.length, row.rounds); assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    for (let i = 0; i < row.detail.length; i++) {
      const round = row.detail[i], previous = row.detail[i - 1];
      const reset = round.round === 1 || round.round === 13 || round.round >= 25 && (round.round - 25) % 3 === 0;
      for (const gear of round.gear) {
        assert.ok(gear.cash >= 0 && gear.cash <= 16000);
        const previousActor = previous?.actors.find(actor => actor.id === gear.id);
        if (reset || !previousActor?.alive) {
          const value = estimateBuyCash(gear, previous?.gear.find(actor => actor.id === gear.id), previousActor, previous?.thrown ?? [], reset);
          assert.equal(value.min, value.max);
          const actor = { id: gear.id, number: Number(gear.id.split('-').at(-1)), team: gear.team,
            alive: true, weaponId: 'basic-pistol', cash: value.min, armor: 0, throwables: emptyThrowables(), weaponPurchaseCost: 0 };
          const state = { tick: 0, complete: false, actors: [actor], economy: { phase: 'buy', roundNumber: round.round, ledger: [] } };
          assert.equal(startEconomyRound(state, { autoHome: true }), true);
          assert.deepEqual({ weapon: actor.weaponId, armor: actor.armor, cash: actor.cash, utility: actor.throwables },
            { weapon: gear.weapon, armor: gear.armor, cash: gear.cash, utility: gear.utility }); automaticFreshBuyChecks++;
        }
      }
      for (const [role, metric] of Object.entries(round.movementTrace)) {
        assert.equal(metric.episodes, metric.reached + metric.changed + metric.died + metric.pending);
        if (!role.endsWith(':other')) assert.equal(metric.riskPlans, 0);
      }
    }
    rows.push(row);
  }
}
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
function summary(selected) {
  const wins = selected.filter(row => row.winner === 'home');
  return { matches: selected.length, wins: wins.length, rate: wins.length / selected.length,
    rounds: selected.reduce((sum, row) => sum + row.rounds, 0), meanMargin: mean(selected.map(row => row.score.home - row.score.away)),
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)), winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
}
const groups = ['fixed', 'combined'].map(profile => ({ profile, ...summary(rows.filter(row => row.profile === profile)) }));
const result = { groups, maps: spec.maps.map(map => ({ map, profiles: ['fixed', 'combined'].map(profile => ({ profile, ...summary(rows.filter(row => row.map === map && row.profile === profile)) })) })),
  pairs: rows.filter(row => row.profile === 'fixed').map(fixed => { const reactive = rows.find(row => row.profile === 'combined' && row.map === fixed.map && row.seed === fixed.seed && row.side === fixed.side);
    return { seed: fixed.seed, map: fixed.map, side: fixed.side, fixed: fixed.score, reactive: reactive.score,
      improved: fixed.winner === 'away' && reactive.winner === 'home', worsened: fixed.winner === 'home' && reactive.winner === 'away' }; }),
  allRateTargetsMet: groups[0].rate <= .2 && groups[1].rate >= .55 && groups[1].rate <= .65,
  diagnosticMatches: rows.length, policyChanges, automaticFreshBuyChecks, exactOpeningReplays,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Known-world same-auto-buy baseline, initial roster only. No prior failure reclassification, no changed economic rule, no deployment approval.' };
fs.writeFileSync(`${root}/shared-baseline-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: undefined }, null, 2));
