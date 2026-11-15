import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const read = name => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8'));
const probe = read('research-elements/opponent-diagnose-purchase-research-elements.json');
const baseline = read('support-first44/opponent-diagnose-purchase-support-first44.json').rows.filter(row => row.map === 'research');
const expected = [73, 101, 211].flatMap(seed => [false, true].flatMap(recruit => ['home', 'away'].flatMap(side => ['utility', 'tactics', 'site'].map(profile => [seed, recruit, side, profile].join(':')))));
assert.equal(probe.rows.length, 36);
assert.deepEqual(probe.rows.map(row => [row.seed, row.recruit, row.side, row.profile].join(':')).sort(), expected.sort());
let unchangedSiteControls = 0;
for (const row of probe.rows) {
  assert.equal(row.map, 'research'); assert.deepEqual(row.statRange, [44, 54]);
  assert.equal(row.purchase, 'mixed'); assert.equal(row.homePurchasePolicy, 'legacy');
  assert.equal(row.homeManagement, 'static'); assert.equal(row.rounds, row.detail.length);
  assert.equal(row.rounds, row.score.home + row.score.away);
  if (row.profile === 'site') {
    const old = baseline.find(old => old.seed === row.seed && old.recruit === row.recruit && old.side === row.side && old.profile === 'fixed');
    const a = structuredClone(row), b = structuredClone(old);
    delete a.profile; delete b.profile;
    assert.deepEqual(a, b); unchangedSiteControls++;
  }
}
const rows = [...baseline, ...probe.rows];
const groups = [false, true].map(recruit => ({ recruit,
  profiles: ['fixed', 'utility', 'tactics', 'site', 'combined'].map(profile => {
    const selected = rows.filter(row => row.recruit === recruit && row.profile === profile);
    const gear = selected.flatMap(row => row.detail.flatMap(round => round.gear.filter(actor => actor.team === 'home')));
    return { profile, matches: selected.length, wins: selected.filter(row => row.winner === 'home').length,
      rounds: selected.reduce((sum, row) => sum + row.rounds, 0), playerRounds: gear.length,
      rifleShare: gear.filter(actor => actor.weapon === 'training-rifle').length / gear.length };
  }) }));
const result = { exploratory: true, independentValidation: false, newMatches: probe.rows.length,
  newRounds: probe.rows.reduce((sum, row) => sum + row.rounds, 0), reusedReferenceMatches: baseline.length,
  unchangedSiteControls, groups,
  originalValidationSha256: crypto.createHash('sha256').update(fs.readFileSync(`${root}/independent44-summary.json`)).digest('hex'),
  note: 'Known seeds only. Static action profiles are not ordered skill levels. Effects are not additive; gear frequencies also depend on changed wins and survival. No benchmark adoption or validation-result substitution.' };
fs.writeFileSync(`${root}/research-elements-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
