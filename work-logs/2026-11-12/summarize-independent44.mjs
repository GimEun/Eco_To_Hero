import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyReactiveChanges } from './reactive-policy-check.mjs';
const root = 'work-logs/2026-11-12';
const validationName = process.argv[2] ?? 'independent44';
assert.ok(/^[a-z0-9-]+$/.test(validationName));
const read = name => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8'));
const spec = read(`${validationName}-freeze.json`);
const maps = ['relay', 'warehouse', 'research'];
const rows = [], exclusions = [];
let managerChangesVerified = 0;
const retry = fs.existsSync(`${root}/${validationName}-retry.json`) ? read(`${validationName}-retry.json`) : null;
if (retry) {
  assert.equal(retry.modelChanges, false);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`${root}/${retry.ioOnlyPreload}`)).digest('hex'), retry.ioSha256);
}
for (const [file, hash] of Object.entries(spec.sha256)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, `Frozen candidate changed: ${file}`);
const production = JSON.parse(fs.readFileSync(spec.productionSourceHashes, 'utf8'));
for (const [file, hash] of Object.entries(production)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, `Production source changed: ${file}`);
for (const map of maps) {
  const data = read(map === 'research' && retry ? retry.replacement : `${validationName}-${map}/opponent-diagnose-purchase-${validationName}.json`);
  if (map === 'research' && retry) {
    const saved = read(retry.original), pending = read(retry.pending);
    assert.deepEqual(data.rows.slice(0, saved.rows.length), saved.rows);
    assert.deepEqual(data.rows.slice(0, pending.rows.length), pending.rows);
  }
  assert.deepEqual(data.seeds, spec.seeds); assert.deepEqual(data.statRange, spec.statRange);
  if (exclusions.length) assert.deepEqual(data.unavailableRecruitments, exclusions);
  else exclusions.push(...data.unavailableRecruitments);
  const omitted = new Set(data.unavailableRecruitments.map(item => item.seed));
  for (const seed of omitted) assert.ok(spec.seeds.includes(seed));
  const expected = spec.seeds.flatMap(seed => [false, true].filter(recruit => !recruit || !omitted.has(seed))
    .flatMap(recruit => ['fixed', 'combined'].flatMap(profile => ['home', 'away'].map(side => [seed, recruit, profile, side].join(':')))));
  const actual = data.rows.map(row => [row.seed, row.recruit, row.profile, row.side].join(':'));
  assert.deepEqual([...actual].sort(), expected.sort(), `Incomplete validation conditions: ${map}`);
  for (const row of data.rows) {
    assert.equal(row.map, map);
    for (const field of ['statRange', 'boost', 'homePurchasePolicy', 'purchase', 'opponentVariant', 'homeManagement']) assert.deepEqual(row[field], spec[field]);
    assert.equal(row.engine, true); assert.equal(row.switchAfterLosses, 6);
    if (spec.homeManagement === 'reactive') {
      if (row.profile === 'combined') managerChangesVerified += verifyReactiveChanges(row);
      else assert.deepEqual(row.homeChanges, []);
    }
    assert.deepEqual(row.choice, spec.selected[row.recruit ? 'recruited' : 'initial'][map]);
    assert.equal(row.rounds, row.detail.length); assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    if (row.recruit) {
      assert.equal(row.recruitment.policy, spec.recruitmentPolicy);
      assert.ok(row.recruitment.fee <= 15000);
      for (const skill of ['aim', 'intelligence', 'stamina']) assert.ok(row.recruitment.incoming[skill] >= row.recruitment.outgoing[skill]);
    }
    for (const round of row.detail) {
      assert.ok(round.riskDetours && round.movementTrace);
      for (const gear of round.gear) assert.ok(gear.cash >= 0 && gear.cash <= 16000);
      for (const [role, group] of Object.entries(round.movementTrace)) {
        assert.equal(group.episodes, group.reached + group.changed + group.died + group.pending);
        if (!role.endsWith(':other')) assert.equal(group.riskPlans, 0);
      }
      for (const decision of round.riskDetours.decisions) {
        assert.ok(decision.after < decision.before);
        assert.ok(decision.alternativeLength <= decision.originalLength * 1.5 + 1e-7);
        assert.ok(decision.alternativeLength <= decision.originalLength + 240 + 1e-7);
      }
    }
  }
  rows.push(...data.rows);
}
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
function summary(selected) {
  const wins = selected.filter(row => row.winner === 'home');
  return { matches: selected.length, wins: wins.length, rate: selected.length ? wins.length / selected.length : null,
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
    winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length,
    rounds: selected.reduce((sum, row) => sum + row.rounds, 0) };
}
const groups = [false, true].flatMap(recruit => ['fixed', 'combined'].map(profile => {
  const matching = rows.filter(row => row.recruit === recruit && row.profile === profile);
  const result = summary(matching);
  return { recruit, profile, ...result, targetRateMet: result.rate !== null && (profile === 'fixed' ? result.rate <= spec.targets.fixedMaximum
    : result.rate >= spec.targets.combinedMinimum && result.rate <= spec.targets.combinedMaximum),
    maps: maps.map(map => ({ map, ...summary(matching.filter(row => row.map === map)) })),
    sides: ['home', 'away'].map(side => ({ startingAttackTeam: side, ...summary(matching.filter(row => row.side === side)) })) };
}));
const result = { ...summary(rows), spec: `${validationName}-freeze.json`, excludedRecruitments: exclusions, groups,
  ioRetry: retry ? { reason: retry.reason, replayedSavedMatches: retry.savedMatches, replayedPendingMatches: retry.completedPendingMatches, matchingReplayConfirmed: true } : null,
  allRateTargetsMet: groups.every(group => group.targetRateMet),
  unchangedFrozenFiles: Object.keys(spec.sha256).length, unchangedProductionFiles: Object.keys(production).length,
  ...(spec.homeManagement === 'reactive' ? { managerChangesVerified } : {}),
  independentValidationRun: true, gameChangesApplied: false, deploymentApproved: false,
  note: spec.homeManagement === 'reactive' ? 'One frozen candidate on predeclared seeds and mechanism-defined fixed/reactive policies. Not a claim about all human skill levels. Prior static validation failure is preserved; margins have no invented passing threshold.'
    : 'One frozen candidate on predeclared seeds. Static diagnostic profiles are not all human players. Score margins are reported separately; no close-score threshold was invented.' };
fs.writeFileSync(`${root}/${validationName}-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, groups: groups.map(({ maps, sides, ...group }) => group) }, null, 2));
