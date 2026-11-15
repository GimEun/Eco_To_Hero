import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { WEAPONS, BODY_ARMOR, TRAINING_RIFLE } from '../../src/data/weapons.js';
import { THROWABLES } from '../../src/data/throwables.js';
import { ECONOMY_RULES } from '../../src/config/economy.js';

export function estimateBuyCash(gear, previousGear, previousActor, previousThrows, reset) {
  const retained = !reset && previousActor?.alive;
  const weaponCost = gear.weapon === 'basic-pistol' || retained && previousGear.weapon === gear.weapon ? 0 : WEAPONS.find(weapon => weapon.id === gear.weapon).price;
  let utilityCost = 0;
  for (const item of THROWABLES) {
    const used = previousThrows.filter(event => event.actorId === gear.id && event.kind === item.id).length;
    const carried = retained ? Math.max(0, previousGear.utility[item.id] - used) : 0;
    const bought = gear.utility[item.id] - carried;
    assert.ok(bought >= 0 && bought <= 1);
    utilityCost += bought * item.price;
  }
  const couldRepair = gear.armor === BODY_ARMOR.durability;
  const armorMinimum = couldRepair && !retained ? BODY_ARMOR.price : 0;
  const armorMaximum = couldRepair ? BODY_ARMOR.price : 0;
  return { min: gear.cash + weaponCost + utilityCost + armorMinimum,
    max: Math.min(ECONOMY_RULES.maxCash, gear.cash + weaponCost + utilityCost + armorMaximum), weaponCost, utilityCost,
    retainedWeapon: Boolean(retained && previousGear.weapon === gear.weapon) };
}
function main() {
  const root = 'work-logs/2026-11-12';
  const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const frozen = read('defense-range-freeze.json');
  for (const [file, value] of Object.entries(frozen.sha256)) assert.equal(hash(file), value, file);
  const files = ['standard', 'forward'].flatMap(plan => [
    { variant: 'before', plan, file: `${root}/retreat-observation-${plan}/opponent-diagnose-purchase-retreat-observation.json` },
    { variant: 'after', plan, file: `${root}/defense-range-${plan}/opponent-diagnose-purchase-defense-range.json` }
  ]);
  const inputs = Object.fromEntries(files.map(item => [item.file, hash(item.file)]));
  const matches = [], samples = [], streaks = [], resets = [];
  for (const input of files) for (const row of JSON.parse(fs.readFileSync(input.file, 'utf8')).rows) {
    assert.equal(row.side, 'away'); assert.equal(row.map, 'warehouse');
    let runWinner = null, runLength = 0, runStart = 0;
    const lossStreak = { home: 0, away: 0 }, winStreak = { home: 0, away: 0 };
    const pistolRuns = {};
    const matchKey = [input.variant, input.plan, row.seed].join(':');
    const flush = () => { if (runLength) streaks.push({ matchKey, winner: runWinner, start: runStart, length: runLength }); };
    for (let i = 0; i < row.detail.length; i++) {
      const round = row.detail[i], previous = row.detail[i - 1];
      const reset = round.round === 1 || round.round === 13 || round.round >= 25 && (round.round - 25) % 3 === 0;
      if (reset) {
        flush(); runLength = 0; runWinner = null;
        lossStreak.home = lossStreak.away = winStreak.home = winStreak.away = 0;
        for (const actor of round.gear) pistolRuns[actor.id] = 0;
        if (round.round <= 13) {
          assert.ok(round.gear.every(gear => gear.weapon === 'basic-pistol' && gear.armor === 100 && gear.cash === 150 && Object.values(gear.utility).every(n => n === 0)));
          resets.push({ matchKey, round: round.round, samePistolArmorCash: true });
        }
      }
      const period = round.round <= 12 ? 'first-half' : round.round <= 24 ? 'second-half' : 'overtime';
      for (const gear of round.gear) {
        const previousGear = previous?.gear.find(actor => actor.id === gear.id), previousActor = previous?.actors.find(actor => actor.id === gear.id);
        const cash = estimateBuyCash(gear, previousGear, previousActor, previous?.thrown ?? [], reset);
        assert.ok(cash.min <= cash.max && cash.min >= 0 && cash.max <= ECONOMY_RULES.maxCash);
        pistolRuns[gear.id] = gear.weapon === 'basic-pistol' ? pistolRuns[gear.id] + 1 : 0;
        samples.push({ matchKey, variant: input.variant, plan: input.plan, seed: row.seed, round: round.round, period,
          team: gear.team, actorId: gear.id, role: (round.attackTeam === gear.team) ? 'attack' : 'defense',
          weapon: gear.weapon, cashAfterBuy: gear.cash, utilityCount: Object.values(gear.utility).reduce((sum, n) => sum + n, 0),
          previousLossStreak: lossStreak[gear.team], previousWinStreak: winStreak[gear.team], pistolRun: pistolRuns[gear.id],
          rifleDefinitelyUnaffordable: gear.weapon === 'basic-pistol' && cash.max < TRAINING_RIFLE.price,
          ...cash });
      }
      if (round.winner === runWinner) runLength++;
      else { flush(); runWinner = round.winner; runLength = 1; runStart = round.round; }
      for (const team of ['home', 'away']) {
        if (round.winner === team) { winStreak[team]++; lossStreak[team] = 0; }
        else { lossStreak[team]++; winStreak[team] = 0; }
      }
    }
    flush();
    const first = row.detail.filter(round => round.round <= 12), second = row.detail.filter(round => round.round >= 13 && round.round <= 24);
    matches.push({ matchKey, variant: input.variant, plan: input.plan, seed: row.seed, score: row.score,
      openingWinner: row.detail[0].winner, firstHalfWins: first.filter(round => round.winner === 'home').length,
      firstHalfRounds: first.length, secondHalfWins: second.filter(round => round.winner === 'home').length, secondHalfRounds: second.length,
      won: row.winner === 'home', sweepScore: row.score.home === 13 && row.score.away === 0 || row.score.away === 13 && row.score.home === 0 });
  }
  const mean = xs => xs.length ? xs.reduce((sum, n) => sum + n, 0) / xs.length : null;
  function summary(selected) {
    const pistols = selected.filter(sample => sample.weapon === 'basic-pistol');
    return { playerRounds: selected.length, pistolPlayerRounds: pistols.length,
      rifleShare: selected.length ? selected.filter(sample => sample.weapon === 'training-rifle').length / selected.length : null,
      armedShare: selected.length ? selected.filter(sample => sample.weapon !== 'basic-pistol').length / selected.length : null,
      meanCashAfterBuy: mean(selected.map(sample => sample.cashAfterBuy)), meanUtilityCount: mean(selected.map(sample => sample.utilityCount)),
      meanPreBuyMinimum: mean(selected.map(sample => sample.min)), meanPreBuyMaximum: mean(selected.map(sample => sample.max)),
      pistolDefinitelyCannotAffordRifle: pistols.filter(sample => sample.rifleDefinitelyUnaffordable).length,
      pistolCanAffordRifleDefinitely: pistols.filter(sample => sample.min >= TRAINING_RIFLE.price).length,
      maximumPistolRun: selected.length ? Math.max(...selected.map(sample => sample.pistolRun)) : 0 };
  }
  const cohorts = ['before', 'after'].flatMap(variant => ['home', 'away'].flatMap(team => [
    ['all', () => true], ['after-3-losses', sample => sample.previousLossStreak >= 3], ['after-3-wins', sample => sample.previousWinStreak >= 3]
  ].map(([cohort, predicate]) => ({ variant, team, cohort, ...summary(samples.filter(sample => sample.variant === variant && sample.team === team && predicate(sample))) }))));
  const result = { matches, cohorts, streaks, resets, inputHashes: inputs,
    samples, analyzedConditions: matches.length, analyzedRounds: samples.length / 10,
    sweepScores: matches.filter(match => match.sweepScore).length,
    halftimeFirstRoundSameGear: resets.filter(reset => reset.round === 13).length,
    economy: ECONOMY_RULES, riflePrice: TRAINING_RIFLE.price, armorPrice: BODY_ARMOR.price, utilityPrices: THROWABLES,
    newMatchesRun: 0, gameChangesApplied: false,
    limitations: ['Post-purchase cash is observed; pre-buy cash is bounded because surviving armor durability/repair is not fully recorded.',
      'No complete ledger or all plant events. Do not reconstruct exact income/plant bonuses from final reason alone.',
      'Winning/losing streak cohorts differ in ability/gear/positions and are not randomized.',
      'Home legacy rifle-only weapon attempt differs from opponent mixed-weapon auto-buy; this is diagnostic behavior, not all manual user choices.'] };
  for (const [file, value] of Object.entries(inputs)) assert.equal(hash(file), value, file);
  const production = read('risk-source-hashes.json');
  for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
  result.unchangedProductionFiles = Object.keys(production).length;
  fs.writeFileSync(`${root}/round-equipment-summary.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, samples: undefined, streaks: undefined, matches: undefined, inputHashes: undefined }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
