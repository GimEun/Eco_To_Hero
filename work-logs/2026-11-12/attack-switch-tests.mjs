import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { transform, policies } from './attack-switch-transform.mjs';
import { verifyPolicy } from './attack-switch-check.mjs';
const source = fs.readFileSync('scripts/calibrate-opponent-strategy.js', 'utf8').replace(/\r\n/g, '\n');
const rows = JSON.parse(fs.readFileSync('work-logs/2026-11-12/independent-initial46-research/opponent-diagnose-purchase-independent-initial46.json', 'utf8')).rows.filter(row => !row.recruit && row.profile === 'combined');
test('both leaves actual simulation/decision code unchanged except output tag and profile filter', () => {
  const transformed = transform(source, 'both')
    .replace("for (const profile of ['combined']) {", "for (const profile of ['fixed', 'combined']) {")
    .replace('diagnosticAttackPolicy: "both", ', '');
  assert.equal(transformed, source);
});
test('hook refuses unknown policies and changed or repeated mutation anchors', () => {
  assert.throws(() => transform(source, 'bad'));
  assert.throws(() => transform(source.replace('const previousSite = homeSite;', '/* changed */'), 'site'));
  assert.throws(() => transform(source + source, 'none'));
});
test('actual twelve baseline histories verify; partial-policy interpretations are rejected', () => {
  assert.equal(rows.length, 12);
  for (const row of rows) {
    verifyPolicy(row, 'both');
    for (const policy of policies.filter(policy => policy !== 'both')) {
      if (row.homeChanges.some(change => change.role === 'attack')) assert.throws(() => verifyPolicy(row, policy));
      else verifyPolicy(row, policy); // No attack trigger makes policies observationally identical.
    }
  }
  assert.ok(rows.some(row => row.homeChanges.some(change => change.role === 'attack')));
});
test('future/early decisions and changed recorded tactics cannot pass replay validation', () => {
  const row = structuredClone(rows[0]);
  row.homeChanges[0].round = 1;
  assert.throws(() => verifyPolicy(row, 'both'));
  const changed = structuredClone(rows[0]);
  changed.detail[0].attackPlans.home = 'execute';
  assert.throws(() => verifyPolicy(changed, 'both'));
});
