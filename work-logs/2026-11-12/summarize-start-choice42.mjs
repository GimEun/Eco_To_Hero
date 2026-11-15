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
const spec = read('start-choice42-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const originalChoices = read('risk-training/selected-choices.json').selected;
const expectedChoices = structuredClone(originalChoices);
expectedChoices.initial.warehouse.defense = 'forward'; expectedChoices.initial.research.attack = 'execute';
assert.deepEqual(read('start-choice42-choices.json').selected, expectedChoices);
const baseline = read('shared-range42/opponent-diagnose-purchase-shared-range.json').rows;
assert.equal(baseline.length, 36);
const newRows = [], pairs = [];
let policyChanges = 0, freshBuyChecks = 0, initialGearPairs = 0;
for (const map of spec.newMaps) {
  const data = read(`start-choice42-${map}/opponent-diagnose-purchase-start-choice42.json`);
  const expected = spec.seeds.flatMap(seed => ['home', 'away'].map(side => `${seed}:${side}`)).sort();
  assert.equal(data.rows.length, 6);
  assert.deepEqual(data.rows.map(row => `${row.seed}:${row.side}`).sort(), expected);
  for (const row of data.rows) {
    const before = baseline.find(old => old.map === map && old.seed === row.seed && old.side === row.side && old.profile === 'combined'); assert.ok(before);
    for (const field of ['map', 'side', 'recruit', 'profile', 'diagnosticAttackPolicy', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses']) assert.deepEqual(row[field], before[field], field);
    assert.deepEqual(row.choice, expectedChoices.initial[map]);
    assert.equal(row.homePurchasePolicy, 'shared-auto'); assert.ok(!Object.hasOwn(row, 'diagnosticDefenseRange'));
    assert.deepEqual(row.detail[0].gear, before.detail[0].gear); initialGearPairs++;
    policyChanges += verifyPolicy(row, 'site');
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
      for (const decision of round.riskDetours.decisions) {
        assert.ok(decision.after < decision.before);
        assert.ok(decision.alternativeLength <= decision.originalLength * 1.5 + 1e-7);
        assert.ok(decision.alternativeLength <= decision.originalLength + 240 + 1e-7);
      }
    }
    pairs.push({ map, seed: row.seed, side: row.side, before: before.score, after: row.score,
      improved: before.winner === 'away' && row.winner === 'home', worsened: before.winner === 'home' && row.winner === 'away',
      marginChange: row.score.home - row.score.away - before.score.home + before.score.away });
    newRows.push(row);
  }
}
const candidate = [...baseline.filter(row => row.profile === 'fixed' || row.map === 'relay'), ...newRows];
assert.equal(candidate.length, 36);
assert.equal(new Set(candidate.map(row => [row.seed, row.map, row.side, row.profile].join(':'))).size, 36);
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
function summary(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0), meanMargin: mean(rows.map(row => row.score.home - row.score.away)),
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)), winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
}
const fixed = summary(candidate.filter(row => row.profile === 'fixed')), reactive = summary(candidate.filter(row => row.profile === 'combined'));
const result = { fixed, reactive, baselineReactive: summary(baseline.filter(row => row.profile === 'combined')),
  maps: ['relay', 'warehouse', 'research'].map(map => ({ map,
    before: summary(baseline.filter(row => row.profile === 'combined' && row.map === map)),
    after: summary(candidate.filter(row => row.profile === 'combined' && row.map === map)) })), pairs,
  improvedWinners: pairs.filter(pair => pair.improved).length, worsenedWinners: pairs.filter(pair => pair.worsened).length,
  allRateTargetsMet: fixed.rate <= .2 && reactive.rate >= .55 && reactive.rate <= .65,
  newConditions: 12, reusedConditions: 24, newRounds: newRows.reduce((sum, row) => sum + row.rounds, 0),
  policyChanges, freshBuyChecks, initialGearPairs, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'One predeclared two-map starting-choice candidate; no choosing best map results after observation. Known worlds only, no deployment.' };
fs.writeFileSync(`${root}/start-choice42-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: undefined }, null, 2));
