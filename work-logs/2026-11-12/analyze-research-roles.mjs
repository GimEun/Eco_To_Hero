import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = path => JSON.parse(fs.readFileSync(`${root}/${path}`, 'utf8'));
const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const inputs = ['slot3-rifle38-research/opponent-diagnose-purchase-slot3-rifle38.json',
  'trade-range-maps-research/opponent-diagnose-purchase-trade-range-maps.json',
  'trade-range-split/opponent-diagnose-purchase-trade-range.json',
  'trade-range-execute/opponent-diagnose-purchase-trade-range.json'];
const spec = read('trade-range-maps-freeze.json');
for (const [path, value] of Object.entries(spec.sha256)) assert.equal(hash(path), value, path);
const production = read('risk-source-hashes.json');
for (const [path, value] of Object.entries(production)) assert.equal(hash(path), value, path);
const inputHashes = Object.fromEntries(inputs.map(path => [`${root}/${path}`, hash(`${root}/${path}`)]));
const before = read(inputs[0]).rows;
const after = [...read(inputs[1]).rows, ...read(inputs[2]).rows];
const execute = read(inputs[3]).rows;
assert.equal(before.length, 12); assert.equal(after.length, 12); assert.equal(execute.length, 3);
const role = round => round.attackTeam === 'home' ? 'attack' : 'defense';
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
function tally(rounds) {
  return { rounds: rounds.length, wins: rounds.filter(round => round.winner === 'home').length,
    homeShots: rounds.reduce((sum, round) => sum + round.actors.filter(actor => actor.team === 'home').reduce((n, actor) => n + actor.shots, 0), 0),
    zeroShotPlayerRounds: rounds.reduce((sum, round) => sum + round.actors.filter(actor => actor.team === 'home' && actor.shots === 0).length, 0),
    meanSurvivors: mean(rounds.map(round => round.actors.filter(actor => actor.team === 'home' && actor.alive).length)),
    reasons: Object.fromEntries([...new Set(rounds.map(round => round.reason))].map(reason => [reason, rounds.filter(round => round.reason === reason).length])) };
}
const groups = [];
const timelines = [];
let policyChanges = 0;
for (const [variant, rows] of [['before', before], ['range', after], ['range-execute', execute]]) {
  assert.equal(new Set(rows.map(row => `${row.seed}:${row.side}:${row.profile}`)).size, rows.length);
  for (const row of rows) {
    assert.equal(row.map, 'research'); assert.equal(row.rounds, row.detail.length);
    assert.deepEqual(row.statRange, [38, 54]); assert.equal(row.homePurchasePolicy, 'shared-auto');
    assert.equal(row.diagnosticSlot3Preference, 'training-rifle');
    if (row.profile === 'combined') policyChanges += verifyPolicy(row, 'site');
    for (const round of row.detail) assert.equal(round.actors.length, 10);
    const changeRounds = new Set(row.homeChanges.map(change => change.round));
    timelines.push({ variant, seed: row.seed, side: row.side, profile: row.profile, score: row.score, choice: row.choice,
      roles: Object.fromEntries(['attack', 'defense'].map(value => [value, tally(row.detail.filter(round => role(round) === value))])),
      firstOwnChange: row.homeChanges[0] ?? null,
      changes: row.homeChanges.map(change => ({ ...change,
        nextTwoSameRole: row.detail.filter(round => round.round >= change.round && role(round) === change.role).slice(0, 2).map(round => ({ round: round.round, winner: round.winner, site: round.site, reason: round.reason })) })),
      rounds: row.detail.map(round => ({ round: round.round, role: role(round), winner: round.winner,
        plan: role(round) === 'attack' ? round.attackPlans.home : round.defensePlans.home, site: round.site,
        opponentPlan: role(round) === 'attack' ? round.defensePlans.away : round.attackPlans.away,
        reason: round.reason, changed: changeRounds.has(round.round) })) });
  }
  for (const profile of [...new Set(rows.map(row => row.profile))]) {
    const subset = rows.filter(row => row.profile === profile);
    const rounds = subset.flatMap(row => row.detail);
    const configurations = [...new Set(rounds.map(round => [role(round), role(round) === 'attack' ? round.attackPlans.home : round.defensePlans.home, round.site].join(':')))];
    groups.push({ variant, profile, matches: subset.length, wins: subset.filter(row => row.winner === 'home').length,
      attack: tally(rounds.filter(round => role(round) === 'attack')), defense: tally(rounds.filter(round => role(round) === 'defense')),
      firstHalf: tally(rounds.filter(round => round.round <= 12)),
      secondHalf: tally(rounds.filter(round => round.round > 12 && round.round <= 24)),
      openingBySide: ['home', 'away'].map(side => {
        const selected = subset.filter(row => row.side === side);
        const firstHalf = selected.flatMap(row => row.detail.filter(round => round.round <= 12));
        const gear = firstHalf.flatMap(round => round.gear.filter(actor => actor.team === 'home'));
        return { side, matches: selected.length, openingWins: selected.filter(row => row.detail[0].winner === 'home').length,
          firstHalf: tally(firstHalf), riflePlayerRounds: gear.filter(actor => actor.weapon === 'training-rifle').length,
          pistolPlayerRounds: gear.filter(actor => actor.weapon === 'basic-pistol').length, totalPlayerRounds: gear.length };
      }),
      switchWindows: ['attack', 'defense'].map(value => {
        const windows = subset.flatMap(row => row.homeChanges.filter(change => change.role === value).map(change =>
          row.detail.filter(round => round.round >= change.round && role(round) === value).slice(0, 2)));
        return { role: value, changes: windows.length, nextTwo: tally(windows.flat()) };
      }),
      configurations: configurations.map(key => ({ key, ...tally(rounds.filter(round => [role(round), role(round) === 'attack' ? round.attackPlans.home : round.defensePlans.home, round.site].join(':') === key)) })) });
  }
}
function battle(round) {
  return { attackTeam: round.attackTeam, site: round.site, gear: round.gear, actors: round.actors, winner: round.winner, reason: round.reason,
    activeHome: role(round) === 'attack' ? round.attackPlans.home : round.defensePlans.home,
    activeAway: role(round) === 'attack' ? round.defensePlans.away : round.attackPlans.away };
}
const prefixPairs = execute.map(row => {
  const fixed = after.find(other => other.seed === row.seed && other.side === row.side && other.profile === 'fixed'); assert.ok(fixed);
  const split = after.find(other => other.seed === row.seed && other.side === row.side && other.profile === 'combined'); assert.ok(split);
  let matchingPrefix = 0;
  while (matchingPrefix < Math.min(fixed.rounds, row.rounds) && JSON.stringify(battle(fixed.detail[matchingPrefix])) === JSON.stringify(battle(row.detail[matchingPrefix]))) matchingPrefix++;
  return { seed: row.seed, side: row.side, fixed: fixed.score, executeReactive: row.score, splitReactive: split.score,
    matchingBattlePrefix: matchingPrefix, firstExecuteChange: row.homeChanges[0] ?? null,
    nextFixed: fixed.detail[matchingPrefix] ? battle(fixed.detail[matchingPrefix]).activeHome : null,
    nextReactive: row.detail[matchingPrefix] ? battle(row.detail[matchingPrefix]).activeHome : null,
    splitFirstRound: { winner: split.detail[0].winner, plan: split.detail[0].attackPlans.home },
    executeFirstRound: { winner: row.detail[0].winner, plan: row.detail[0].attackPlans.home } };
});
for (const [path, value] of Object.entries(inputHashes)) assert.equal(hash(path), value, path);
for (const group of groups) {
  assert.equal(group.attack.rounds + group.defense.rounds, group.configurations.reduce((n, row) => n + row.rounds, 0));
  assert.equal(group.attack.wins + group.defense.wins, group.configurations.reduce((n, row) => n + row.wins, 0));
  assert.ok(group.openingBySide.every(row => row.totalPlayerRounds === row.firstHalf.rounds * 5));
}
const result = { groups, timelines, prefixPairs, policyChanges, inputHashes,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  distinctInputMatches: 27, newMatches: 0, gameChangesApplied: false, independentValidation: false,
  limitation: 'Round-weighted descriptive evidence only. Starting tactics differ; switch outcomes are confounded by past combat/economy and enemy changes. No causal win-rate claim.' };
fs.writeFileSync(`${root}/research-role-analysis.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, timelines: undefined, inputHashes: undefined }, null, 2));
