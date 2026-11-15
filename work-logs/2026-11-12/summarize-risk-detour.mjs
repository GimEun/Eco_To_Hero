import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const baseline = read('candidate46/opponent-diagnose-purchase-reevaluated46.json');
const candidate = read('risk46/opponent-diagnose-purchase-risk46.json');
const key = row => [row.seed, row.map, row.side, row.recruit, row.profile].join(':');
assert.equal(baseline.rows.length, 72); assert.equal(candidate.rows.length, 72);
assert.deepEqual(candidate.rows.map(key).sort(), baseline.rows.map(key).sort());
assert.equal(new Set(candidate.rows.map(key)).size, 72);
const beforeByKey = new Map(baseline.rows.map(row => [key(row), row]));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
let attempts = 0, applied = 0, restored = 0, decisionSamples = 0;
for (const row of candidate.rows) {
  const old = beforeByKey.get(key(row));
  for (const field of ['seed', 'map', 'side', 'choice', 'recruitment', 'boost', 'statRange', 'profile', 'purchase',
    'opponentVariant', 'opponentInitial', 'homePurchasePolicy', 'homeManagement', 'switchAfterLosses', 'homeAverage', 'awayAverage']) {
    assert.deepEqual(row[field], old[field], `Changed comparison condition: ${key(row)} ${field}`);
  }
  assert.equal(row.detail.length, row.rounds);
  assert.equal(row.score.home + row.score.away, row.rounds);
  assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
  for (const round of row.detail) {
    for (const gear of round.gear) assert.ok(gear.cash >= 0 && gear.cash <= 16000);
    const risk = round.riskDetours;
    assert.ok(risk);
    assert.ok(risk.attempts >= risk.applied && risk.applied >= risk.restored && risk.applied >= risk.decisions.length);
    attempts += risk.attempts; applied += risk.applied; restored += risk.restored; decisionSamples += risk.decisions.length;
    for (const decision of risk.decisions) {
      assert.ok(decision.after < decision.before);
      assert.ok(decision.alternativeLength <= decision.originalLength * 1.5 + 1e-7);
      assert.ok(decision.alternativeLength <= decision.originalLength + 240 + 1e-7);
    }
  }
}
function summarize(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length,
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
    winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    endReasons: Object.fromEntries([...new Set(rows.flatMap(row => row.detail.map(round => round.reason)))].sort()
      .map(reason => [reason, rows.reduce((sum, row) => sum + row.detail.filter(round => round.reason === reason).length, 0)])) };
}
const groups = [false, true].flatMap(recruit => ['fixed', 'combined'].map(profile => {
  const before = summarize(baseline.rows.filter(row => row.recruit === recruit && row.profile === profile));
  const after = summarize(candidate.rows.filter(row => row.recruit === recruit && row.profile === profile));
  return { recruit, profile, before, after, targetRateMet: profile === 'fixed' ? after.rate <= .2 : after.rate >= .55 && after.rate <= .65,
    changedWinners: candidate.rows.filter(row => row.recruit === recruit && row.profile === profile && row.winner !== beforeByKey.get(key(row)).winner).length,
    maps: ['relay', 'warehouse', 'research'].map(map => ({ map,
      before: summarize(baseline.rows.filter(row => row.map === map && row.recruit === recruit && row.profile === profile)),
      after: summarize(candidate.rows.filter(row => row.map === map && row.recruit === recruit && row.profile === profile)) })) };
}));
const hashes = read('risk-source-hashes.json');
for (const [file, hash] of Object.entries(hashes)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, `Production file changed: ${file}`);
const result = { matchedConditions: 72, baseline: summarize(baseline.rows), candidate: summarize(candidate.rows),
  diagnostic: { attempts, applied, restored, decisionSamples, omittedDecisionSamples: applied - decisionSamples,
    note: 'Replans and expirations count again. These are not independent successful evasions, kills, or prevented deaths.' },
  groups, allRateTargetsMet: groups.every(group => group.targetRateMet), unchangedProductionFiles: Object.keys(hashes).length,
  independentValidationRun: false, gameChangesApplied: false };
fs.writeFileSync(`${root}/risk-detour-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, groups: groups.map(({ maps, ...group }) => group) }, null, 2));
