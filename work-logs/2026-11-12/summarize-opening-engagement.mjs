import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('opening-engagement-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const output = [];
let exactReplays = 0;
for (const plan of ['standard', 'forward']) {
  const original = read(plan === 'standard' ? 'site-stability-warehouse/opponent-diagnose-purchase-site-stability.json' : 'warehouse-start-forward/opponent-diagnose-purchase-warehouse-start.json').rows.filter(row => row.side === 'away');
  const replay = read(`opening-engagement-${plan}/opponent-diagnose-purchase-opening-engagement.json`).rows;
  assert.deepEqual(replay.map(row => row.seed).sort((a, b) => a - b), [...spec.seeds].sort((a, b) => a - b));
  assert.equal(replay.length, 6);
  for (const row of replay) {
    const previous = original.find(old => old.seed === row.seed); assert.ok(previous);
    const clean = structuredClone(row);
    for (const round of clean.detail) delete round.openingEngagement;
    assert.deepEqual(clean, previous); exactReplays++;
    const trace = row.detail[0].openingEngagement; assert.ok(trace);
    assert.ok(row.detail.slice(1).every(round => round.openingEngagement === null));
    const shots = trace.events.filter(event => event.type === 'shot'), deaths = trace.events.filter(event => event.type === 'death');
    for (const actor of row.detail[0].actors) {
      assert.equal(shots.filter(event => event.actorId === actor.id).length, actor.shots);
      assert.equal(deaths.filter(event => event.actorId === actor.id).length, actor.deaths);
    }
    const actors = Object.entries(trace.actors).map(([id, actor]) => {
      const firstShot = shots.find(event => event.actorId === id), death = deaths.find(event => event.actorId === id);
      const firstIncoming = shots.find(event => event.targetId === id);
      assert.ok(!firstShot || actor.firstEligible && actor.firstEligible.tick <= firstShot.tick);
      return { id, ...actor, firstShotTick: firstShot?.tick ?? null, deathTick: death?.tick ?? null,
        firstIncomingShotTick: firstIncoming?.tick ?? null,
        eligibleToShotTicks: firstShot && actor.firstEligible ? firstShot.tick - actor.firstEligible.tick : null,
        shots: shots.filter(event => event.actorId === id).length };
    });
    const first = (team, field) => { const values = actors.filter(actor => actor.team === team).map(actor => field(actor)).filter(value => value !== null); return values.length ? Math.min(...values) : null; };
    const firstShotTicks = Object.fromEntries(['home', 'away'].map(team => [team, first(team, actor => actor.firstShotTick)]));
    const earliestDeathTick = deaths.length ? Math.min(...deaths.map(event => event.tick)) : null;
    output.push({ plan, seed: row.seed, winner: row.detail[0].winner, reason: row.detail[0].reason,
      firstVisibleTicks: Object.fromEntries(['home', 'away'].map(team => [team, first(team, actor => actor.firstVisible?.tick ?? null)])),
      firstEligibleTicks: Object.fromEntries(['home', 'away'].map(team => [team, first(team, actor => actor.firstEligible?.tick ?? null)])),
      firstShotTicks, firstDeathTick: earliestDeathTick,
      firstDeaths: deaths.filter(event => event.tick === earliestDeathTick).map(event => event.actorId),
      homeDiedWithoutShot: actors.filter(actor => actor.team === 'home' && actor.deathTick !== null && actor.shots === 0).length,
      actors, deaths, shots });
  }
}
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
const groups = ['standard', 'forward'].map(plan => {
  const rows = output.filter(row => row.plan === plan);
  return { plan, rounds: rows.length, wins: rows.filter(row => row.winner === 'home').length,
    firstShotHomeEarlier: rows.filter(row => row.firstShotTicks.home !== null && row.firstShotTicks.away !== null && row.firstShotTicks.home < row.firstShotTicks.away).length,
    firstShotAwayEarlier: rows.filter(row => row.firstShotTicks.home !== null && row.firstShotTicks.away !== null && row.firstShotTicks.away < row.firstShotTicks.home).length,
    firstShotSameTick: rows.filter(row => row.firstShotTicks.home !== null && row.firstShotTicks.home === row.firstShotTicks.away).length,
    homeDiedWithoutShot: rows.reduce((sum, row) => sum + row.homeDiedWithoutShot, 0),
    meanHomeFirstShotLagTicks: mean(rows.map(row => row.firstShotTicks.home !== null && row.firstShotTicks.away !== null ? row.firstShotTicks.home - row.firstShotTicks.away : null).filter(value => value !== null)),
    teams: ['home', 'away'].map(team => { const actors = rows.flatMap(row => row.actors.filter(actor => actor.team === team));
      return { team, shots: actors.reduce((sum, actor) => sum + actor.shots, 0),
        eligibleActors: actors.filter(actor => actor.firstEligible !== null).length,
        meanEligibleToShotTicks: mean(actors.map(actor => actor.eligibleToShotTicks).filter(value => value !== null)),
        reacquireTicks: actors.reduce((sum, actor) => sum + actor.reacquireTicks, 0) }; }) };
});
const result = { groups, observations: output, exactWholeMatchReplays: exactReplays,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  newlySampledMatches: 0, replayedMatches: 12, gameChangesApplied: false,
  limitations: ['Visibility sampled at pre-combat phase after movement/utility, not continuously or through team communication.',
    'Eligible-to-first-shot interval may contain interrupted visibility/target changes, not pure reaction delay.',
    'Simultaneous tick events must not be treated as a sub-tick firing/death advantage.'] };
fs.writeFileSync(`${root}/opening-engagement-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, observations: output.map(({ actors, deaths, shots, ...row }) => row) }, null, 2));
