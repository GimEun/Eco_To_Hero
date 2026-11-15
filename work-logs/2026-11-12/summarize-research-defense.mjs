import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('research-defense-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const before = read('trade-range-maps-research/opponent-diagnose-purchase-trade-range-maps.json').rows.filter(row => row.side === 'away');
const after = read('research-defense-opening/opponent-diagnose-purchase-research-defense.json').rows;
const key = row => `${row.seed}:${row.profile}`;
assert.equal(after.length, 6); assert.equal(new Set(after.map(key)).size, 6);
assert.deepEqual(after.map(key).sort(), spec.seeds.flatMap(seed => spec.profiles.map(profile => `${seed}:${profile}`)).sort());
const rows = [];
let policyChanges = 0;
for (const row of after) {
  const old = before.find(other => key(other) === key(row)); assert.ok(old);
  const clean = structuredClone(row);
  for (const round of clean.detail) {
    delete round.researchDefenseOpening; delete round.researchDefenseRetreat; delete round.researchDefenseObjectives;
  }
  assert.deepEqual(clean, old, `Full replay changed ${key(row)}`);
  if (row.profile === 'combined') policyChanges += verifyPolicy(row, 'site');
  const first = row.detail[0], opening = first.researchDefenseOpening, retreat = first.researchDefenseRetreat;
  assert.ok(opening && retreat);
  for (const round of row.detail.slice(1)) {
    assert.equal(round.researchDefenseOpening, null); assert.equal(round.researchDefenseRetreat, null); assert.equal(round.researchDefenseObjectives, null);
  }
  const shots = opening.events.filter(event => event.type === 'shot');
  const deaths = opening.events.filter(event => event.type === 'death');
  for (const actor of first.actors) assert.equal(shots.filter(event => event.actorId === actor.id).length, actor.shots);
  const players = first.actors.filter(actor => actor.team === 'home').map(actor => {
    const view = opening.actors[actor.id];
    const playerShots = retreat.shots.filter(value => value.event.actorId === actor.id);
    const withdrawal = retreat.transitions.find(value => value.id === actor.id && value.withdrawn);
    return { id: actor.id, shots: actor.shots, damage: actor.damage, kills: actor.kills, alive: actor.alive,
      firstVisible: view.firstVisible, firstEligible: view.firstEligible,
      firstShot: shots.find(event => event.actorId === actor.id) ?? null,
      death: deaths.find(event => event.actorId === actor.id) ?? null,
      firstShotSnapshot: playerShots[0] ?? null,
      shotsWithSameTargetAlly: playerShots.filter(value => value.sameTargetAllies.length).length,
      movingShots: playerShots.filter(value => value.actor.moving).length,
      withdrawal: withdrawal ?? null, firstObjectives: first.researchDefenseObjectives[actor.id] ?? {} };
  });
  rows.push({ seed: row.seed, profile: row.profile, plan: first.defensePlans.home, score: row.score,
    openingWinner: first.winner, reason: first.reason,
    homeFirstShot: shots.find(event => event.actorId.startsWith('home-'))?.tick ?? null,
    awayFirstShot: shots.find(event => event.actorId.startsWith('away-'))?.tick ?? null,
    firstDeaths: deaths.slice(0, 3), players,
    homeShots: players.reduce((n, player) => n + player.shots, 0),
    supportedShots: players.reduce((n, player) => n + player.shotsWithSameTargetAlly, 0),
    movingShots: players.reduce((n, player) => n + player.movingShots, 0),
    highHpWithdrawals: players.filter(player => player.withdrawal?.hp > 45).map(player => ({ id: player.id, tick: player.withdrawal.tick, hp: player.withdrawal.hp })),
    allDeaths: deaths.map(event => ({ ...event, before: retreat.deaths.find(item => item.event.actorId === event.actorId)?.actorBefore ?? null })) });
}
const groups = spec.profiles.map(profile => {
  const subset = rows.filter(row => row.profile === profile), players = subset.flatMap(row => row.players);
  return { profile, plan: subset[0].plan, matches: subset.length, openingWins: subset.filter(row => row.openingWinner === 'home').length,
    homeShots: subset.reduce((n, row) => n + row.homeShots, 0), supportedShots: subset.reduce((n, row) => n + row.supportedShots, 0),
    movingShots: subset.reduce((n, row) => n + row.movingShots, 0),
    zeroShotPlayers: players.filter(player => !player.shots).length, highHpWithdrawals: subset.reduce((n, row) => n + row.highHpWithdrawals.length, 0),
    homeFirstDeaths: subset.filter(row => row.firstDeaths[0]?.actorId.startsWith('home-')).length };
});
const result = { rows, groups, replayMatches: 6, newIndependentMatches: 0, replayRounds: after.reduce((n, row) => n + row.rounds, 0),
  exactReplayMatches: 6, policyChanges, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  gameChangesApplied: false };
fs.writeFileSync(`${root}/research-defense-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, rows: rows.map(({ players, allDeaths, ...row }) => ({ ...row,
  players: players.map(player => ({ id: player.id, shots: player.shots, damage: player.damage, firstVisible: player.firstVisible?.tick,
    firstEligible: player.firstEligible?.tick, firstShot: player.firstShot?.tick, death: player.death?.tick,
    withdrawal: player.withdrawal ? { tick: player.withdrawal.tick, hp: player.withdrawal.hp } : null,
    objectives: Object.fromEntries(Object.entries(player.firstObjectives).map(([key, value]) => [key, value.tick])) })) })) }, null, 2));
