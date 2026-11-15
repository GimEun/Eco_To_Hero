import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyReactiveChanges } from './reactive-policy-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inputs = ['relay', 'warehouse', 'research'].map(map => `${root}/independent-initial46-${map}/opponent-diagnose-purchase-independent-initial46.json`);
const sources = Object.fromEntries(inputs.map(file => [file, hash(file)]));
const all = inputs.flatMap(file => read(file).rows.filter(row => !row.recruit));
assert.equal(all.length, 72);
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
function metrics(rounds) {
  const stats = rounds.flatMap(round => round.actors.filter(actor => actor.team === 'home'));
  const gear = rounds.flatMap(round => round.gear.filter(actor => actor.team === 'home'));
  const thrown = rounds.flatMap(round => round.thrown.filter(event => event.actorId.startsWith('home-')));
  const sum = key => stats.reduce((sum, actor) => sum + actor[key], 0);
  const reasons = Object.fromEntries([...new Set(rounds.map(round => round.reason))].sort().map(reason => [reason, rounds.filter(round => round.reason === reason).length]));
  const shots = sum('shots'), hits = sum('hits');
  const utilityCounts = Object.fromEntries(['smoke', 'grenade', 'flashbang'].map(kind => [kind, thrown.filter(event => event.kind === kind).length]));
  return { rounds: rounds.length, wins: rounds.filter(round => round.winner === 'home').length,
    roundWinRate: rounds.length ? rounds.filter(round => round.winner === 'home').length / rounds.length : null,
    reasons, confirmedPlantedEndings: (reasons.defused ?? 0) + (reasons.explosion ?? 0),
    kills: sum('kills'), deaths: sum('deaths'), shots, hits, accuracy: shots ? hits / shots : null,
    damagePerPlayerRound: stats.length ? sum('damage') / stats.length : null,
    zeroShotPlayerRounds: stats.filter(actor => actor.shots === 0).length,
    riflePlayerRounds: gear.filter(actor => actor.weapon === 'training-rifle').length,
    playerRounds: gear.length, meanStartCashAfterPurchases: mean(gear.map(actor => actor.cash)),
    utilityCarriedByPistolPlayerRounds: gear.filter(actor => actor.weapon === 'basic-pistol' && Object.values(actor.utility).some(n => n > 0)).length,
    throws: utilityCounts };
}
let verifiedChanges = 0;
for (const row of all) {
  assert.equal(row.detail.length, row.rounds);
  assert.equal(row.score.home + row.score.away, row.rounds);
  assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
  if (row.profile === 'combined') verifiedChanges += verifyReactiveChanges(row);
  else assert.deepEqual(row.homeChanges, []);
  for (const round of row.detail) {
    assert.equal(round.actors.length, 10); assert.equal(round.gear.length, 10);
    for (const actor of round.actors) {
      assert.ok(actor.deaths <= 1); assert.ok(actor.hits <= actor.shots);
      for (const key of ['shots', 'hits', 'damage', 'kills', 'deaths']) assert.ok(Number.isFinite(actor[key]) && actor[key] >= 0);
    }
  }
}
const mapGroups = ['relay', 'warehouse', 'research'].map(map => ({ map,
  profiles: ['fixed', 'combined'].map(profile => {
    const rows = all.filter(row => row.map === map && row.profile === profile);
    return { profile, matches: rows.length, wins: rows.filter(row => row.winner === 'home').length,
      roles: ['attack', 'defense'].map(role => ({ role, ...metrics(rows.flatMap(row => row.detail.filter(round => (round.attackTeam === 'home') === (role === 'attack')))) })) };
  }) }));
const research = all.filter(row => row.map === 'research');
const paired = research.filter(row => row.profile === 'fixed').map(fixed => {
  const reactive = research.find(row => row.profile === 'combined' && row.seed === fixed.seed && row.side === fixed.side);
  assert.ok(reactive); assert.equal(fixed.homeAverage, reactive.homeAverage); assert.equal(fixed.awayAverage, reactive.awayAverage);
  return { seed: fixed.seed, startingAttackTeam: fixed.side, fixed: { winner: fixed.winner, score: fixed.score },
    reactive: { winner: reactive.winner, score: reactive.score },
    outcome: fixed.winner === reactive.winner ? 'same' : reactive.winner === 'home' ? 'improved' : 'worsened',
    marginChange: reactive.score.home - reactive.score.away - fixed.score.home + fixed.score.away,
    changes: reactive.homeChanges.length };
});
assert.equal(paired.length, 12);
const configs = new Map(), changes = [];
for (const row of research) for (const round of row.detail) {
  const role = round.attackTeam === 'home' ? 'attack' : 'defense';
  const key = [row.profile, role, role === 'attack' ? round.attackPlans.home : round.defensePlans.home, round.site].join(':');
  if (!configs.has(key)) configs.set(key, []);
  configs.get(key).push(round);
  const change = row.homeChanges.find(change => change.round === round.round);
  if (change) changes.push({ seed: row.seed, startingAttackTeam: row.side, ...change, winner: round.winner,
    reason: round.reason, riflePlayers: round.gear.filter(actor => actor.team === 'home' && actor.weapon === 'training-rifle').length });
}
const sourceHashes = read(`${root}/risk-source-hashes.json`);
for (const [file, value] of Object.entries(sourceHashes)) assert.equal(hash(file), value);
for (const [file, value] of Object.entries(sources)) assert.equal(hash(file), value);
const result = { maps: mapGroups, research: { paired,
  outcomes: Object.fromEntries(['same', 'improved', 'worsened'].map(outcome => [outcome, paired.filter(pair => pair.outcome === outcome).length])),
  configurations: [...configs.entries()].map(([configuration, rounds]) => ({ configuration, ...metrics(rounds) })),
  changeRoundResults: ['attack', 'defense'].map(role => { const rows = changes.filter(change => change.role === role);
    return { role, changes: rows.length, wins: rows.filter(change => change.winner === 'home').length }; }), changes },
  verifiedChanges, unchangedProductionFiles: Object.keys(sourceHashes).length, sourceHashes: sources,
  newMatchesRun: 0, gameChangesApplied: false,
  limitations: ['Observational policy bundle comparison, not isolated switching effect.',
    'Unequal match length/economy and loss-trigger selection bias; round groups are not randomized.',
    'Exact plant counts, first-contact/death timings and utility effectiveness are not recorded.',
    'Utility thrown count does not establish useful hits, flash duration or smoke obstruction.'] };
fs.writeFileSync(`${root}/research-policy-analysis.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ maps: mapGroups, research: { ...result.research, changes: undefined, configurations: result.research.configurations.map(c => ({ configuration: c.configuration, rounds: c.rounds, wins: c.wins, rifles: c.riflePlayerRounds, playerRounds: c.playerRounds })) }, verifiedChanges, unchangedProductionFiles: result.unchangedProductionFiles }, null, 2));
