import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('retreat-observation-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const observations = [];
let exactWholeMatchReplays = 0;
for (const plan of ['standard', 'forward']) {
  const originals = read(`opening-engagement-${plan}/opponent-diagnose-purchase-opening-engagement.json`).rows;
  const replays = read(`retreat-observation-${plan}/opponent-diagnose-purchase-retreat-observation.json`).rows;
  assert.equal(replays.length, 6);
  assert.deepEqual(replays.map(row => row.seed).sort((a, b) => a - b), [...spec.seeds].sort((a, b) => a - b));
  for (const row of replays) {
    const original = originals.find(previous => previous.seed === row.seed); assert.ok(original);
    const clean = structuredClone(row);
    for (const round of clean.detail) delete round.retreatObservation;
    assert.deepEqual(clean, original); exactWholeMatchReplays++;
    assert.ok(row.detail.slice(1).every(round => round.retreatObservation === null));
    const observation = row.detail[0].retreatObservation;
    assert.ok(observation);
    assert.deepEqual(observation.shots.map(shot => shot.event), row.detail[0].openingEngagement.events.filter(event => event.type === 'shot'));
    assert.deepEqual(observation.deaths.map(death => death.event), row.detail[0].openingEngagement.events.filter(event => event.type === 'death'));
    for (const shot of observation.shots) {
      assert.equal(shot.actor.targetId, shot.event.targetId);
      assert.ok(shot.actor.probability >= .05 && shot.actor.probability <= .95);
      assert.ok(shot.actor.stationaryProbability >= shot.actor.probability);
    }
    const firstWithdrawals = row.detail[0].actors.filter(actor => actor.team === 'home').map(actor => {
      const first = observation.transitions.find(change => change.id === actor.id && change.withdrawn);
      return { id: actor.id, tick: first?.tick ?? null, hp: first?.hp ?? null, firstTransition: first ?? null };
    });
    observations.push({ plan, seed: row.seed, firstWithdrawals, ...observation });
  }
}
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
function shotsSummary(shots) {
  return { shots: shots.length, hits: shots.filter(shot => shot.event.hit).length,
    accuracy: shots.length ? shots.filter(shot => shot.event.hit).length / shots.length : null,
    damage: shots.reduce((sum, shot) => sum + shot.event.damage, 0),
    meanProbability: mean(shots.map(shot => shot.actor.probability)),
    meanMovingPenalty: mean(shots.map(shot => shot.actor.stationaryProbability - shot.actor.probability)),
    noSameTargetAllies: shots.filter(shot => shot.sameTargetAllies.length === 0).length };
}
const groups = ['standard', 'forward'].map(plan => {
  const rows = observations.filter(row => row.plan === plan);
  const allShots = rows.flatMap(row => row.shots), shots = allShots.filter(shot => shot.actor.team === 'home');
  const deaths = rows.flatMap(row => row.deaths.filter(death => death.actorBefore.team === 'home'));
  const withdrawals = rows.flatMap(row => row.firstWithdrawals.filter(change => change.tick !== null));
  return { plan, homeActors: 30, withdrawnActors: withdrawals.length,
    initialWithdrawalAtLowHP: withdrawals.filter(change => change.hp <= 45).length,
    initialWithdrawalAbove45HP: withdrawals.filter(change => change.hp > 45).length,
    shotGroups: [
      ['moving-retreat', shot => shot.actor.moving && shot.actor.retreating],
      ['moving-other', shot => shot.actor.moving && !shot.actor.retreating],
      ['stationary', shot => !shot.actor.moving],
      ['withdrawn', shot => shot.actor.withdrawn],
      ['not-withdrawn', shot => !shot.actor.withdrawn]
    ].map(([group, predicate]) => ({ group, ...shotsSummary(shots.filter(predicate)) })),
    deathsDuringRetreat: deaths.filter(death => death.actorBefore.retreating).length,
    deathsWithdrawn: deaths.filter(death => death.actorBefore.withdrawn).length,
    noSameTargetAlliesAtRetreatShots: shots.filter(shot => shot.actor.retreating && shot.sameTargetAllies.length === 0).length,
    homeMovingShots: shots.filter(shot => shot.actor.moving).length,
    awayMovingShots: allShots.filter(shot => shot.actor.team === 'away' && shot.actor.moving).length,
    timelines: rows.map(row => ({ seed: row.seed,
      firstDeath: row.deaths[0]?.event ?? null,
      firstHomeWithdrawal: row.transitions.find(change => change.team === 'home' && change.withdrawn) ?? null,
      deathOrder: row.deaths.map(death => ({ tick: death.event.tick, actor: death.event.actorId, hpBefore: death.actorBefore.hp,
        withdrawn: death.actorBefore.withdrawn, retreating: death.actorBefore.retreating, moving: death.actorBefore.moving })) })) };
});
const result = { groups, observations, exactWholeMatchReplays, replayedMatches: 12, newlySampledMatches: 0,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length, gameChangesApplied: false,
  limitations: ['Shot groups differ in HP/positions/targets; accuracy differences are not a randomized retreat effect.',
    'Probability delta is the same-state moving-penalty formula, not resampled hit outcomes.',
    'Same-target allies measure visibility/range opportunity, not actual fire readiness or support success.'] };
fs.writeFileSync(`${root}/retreat-observation-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, observations: undefined, groups: groups.map(({ timelines, ...group }) => group) }, null, 2));
