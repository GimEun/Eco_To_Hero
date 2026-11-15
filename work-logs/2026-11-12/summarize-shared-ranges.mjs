import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
import { estimateBuyCash } from './analyze-round-equipment.mjs';
import { startEconomyRound } from '../../src/simulation/economy.js';
import { emptyThrowables } from '../../src/data/throwables.js';
import { createWorld } from '../../src/game/create-world.js';
import { createClub } from '../../src/game/create-club.js';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('shared-ranges-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const baseline = spec.maps.flatMap(map => read(`shared-baseline-${map}/opponent-diagnose-purchase-shared-baseline.json`).rows);
const key = row => [row.seed, row.map, row.side, row.profile].join(':');
const expectedKeys = baseline.map(key).sort(); assert.equal(new Set(expectedKeys).size, 36);
const rawOpponents = Object.fromEntries(spec.seeds.map(seed => {
  const world = createWorld(createClub('Calibration').club, seed);
  const club = world.clubs.find(club => club.leagueId === 'pc' && club.id !== world.playerClubId);
  return [seed, club.playerIds.map(id => world.players.find(player => player.id === id))];
}));
let policyChanges = 0, automaticFreshBuyChecks = 0, identicalOpeningGears = 0;
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
function summary(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0), meanMargin: mean(rows.map(row => row.score.home - row.score.away)),
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)), winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
}
const candidates = spec.candidates.map((minimum, index) => {
  const source = read(`shared-range${minimum}/opponent-diagnose-purchase-shared-range.json`);
  const unique = source.rows;
  assert.equal(new Set(unique.map(key)).size, 36);
  assert.deepEqual(unique.map(key).sort(), expectedKeys);
  assert.equal(source.rows.length, 36); assert.deepEqual(source.seeds, spec.seeds);
  for (const row of unique) {
    const reference = baseline.find(previous => key(previous) === key(row)); assert.ok(reference);
    for (const field of ['choice', 'recruit', 'profile', 'homeManagement', 'homePurchasePolicy', 'purchase', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'recruitment', 'switchAfterLosses', 'diagnosticAttackPolicy']) assert.deepEqual(row[field], reference[field], field);
    assert.deepEqual(row.statRange, [minimum, 54]); assert.equal(row.homePurchasePolicy, 'shared-auto');
    assert.ok(!Object.hasOwn(row, 'diagnosticDefenseRange'));
    const expectedAverage = mean(rawOpponents[row.seed].map(player => mean(['aim', 'intelligence', 'stamina'].map(skill => minimum + Math.round((player[skill] - 30) * (54 - minimum) / 24)))));
    assert.equal(row.awayAverage, expectedAverage);
    assert.deepEqual(row.detail[0].gear, reference.detail[0].gear); identicalOpeningGears++;
    if (row.profile === 'combined') policyChanges += verifyPolicy(row, 'site');
    else {
      assert.deepEqual(row.homeChanges, []);
      for (const round of row.detail) { assert.equal(round.attackPlans.home, 'execute'); assert.equal(round.defensePlans.home, 'standard'); assert.equal(round.site, 'A'); }
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
          const actor = { id: gear.id, number: Number(gear.id.split('-').at(-1)), team: gear.team, alive: true,
            weaponId: 'basic-pistol', cash: value.min, armor: 0, throwables: emptyThrowables(), weaponPurchaseCost: 0 };
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
  }
  const fixed = summary(unique.filter(row => row.profile === 'fixed')), reactive = summary(unique.filter(row => row.profile === 'combined'));
  const distance = Math.max(0, fixed.rate - .2) ** 2 + Math.max(0, .55 - reactive.rate, reactive.rate - .65) ** 2;
  return { minimum, index, fixed, reactive, squaredDistance: distance, allRateTargetsMet: distance === 0,
    maps: spec.maps.map(map => ({ map, fixed: summary(unique.filter(row => row.map === map && row.profile === 'fixed')), reactive: summary(unique.filter(row => row.map === map && row.profile === 'combined')) })) };
});
const old = read('shared-baseline-summary.json');
const reference = { minimum: 48, index: 3, fixed: old.groups[0], reactive: old.groups[1],
  squaredDistance: Math.max(0, old.groups[0].rate - .2) ** 2 + Math.max(0, .55 - old.groups[1].rate, old.groups[1].rate - .65) ** 2,
  allRateTargetsMet: old.allRateTargetsMet, reused: true };
const ordered = [...candidates, reference].sort((a, b) => a.squaredDistance - b.squaredDistance || (a.reactive.winningMargin ?? Infinity) - (b.reactive.winningMargin ?? Infinity) || a.index - b.index);
const result = { candidates, reference, selectedMinimum: ordered[0].minimum, selectedTargetsMet: ordered[0].allRateTargetsMet,
  newConditions: 108, reusedConditions: 36, newRounds: candidates.reduce((sum, candidate) => sum + candidate.fixed.rounds + candidate.reactive.rounds, 0),
  policyChanges, automaticFreshBuyChecks, identicalOpeningGears,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Known-seed lower opponent ranges with shared auto-buy. Candidate ranking only; prior failed conditions preserved; no deployment approval.' };
fs.writeFileSync(`${root}/shared-ranges-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, candidates: candidates.map(({ maps, ...candidate }) => candidate) }, null, 2));
