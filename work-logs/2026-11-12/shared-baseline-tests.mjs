import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { transform } from './attack-switch-transform.mjs';
import { transformSharedBuy } from './shared-autobuy-transform.mjs';
import { includeFixedProfile } from './shared-baseline-transform.mjs';
test('fixed and reactive loops share identical purchase dispatch without changing decisions', () => {
  const original = fs.readFileSync('scripts/calibrate-opponent-strategy.js', 'utf8').replace(/\r\n/g, '\n');
  const before = transformSharedBuy(transform(original, 'site'));
  const after = includeFixedProfile(before);
  assert.equal(after.replace("for (const profile of ['fixed', 'combined']) {", "for (const profile of ['combined']) {"), before);
  assert.ok(after.includes('startEconomyRound(state, { autoHome: true });'));
  assert.ok(after.includes("if (profile === 'combined' && homeManagement === 'reactive'"));
  assert.throws(() => includeFixedProfile(before + before));
  assert.throws(() => includeFixedProfile(original));
});
