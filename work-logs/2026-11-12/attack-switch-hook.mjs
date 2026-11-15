import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { policies, transform } from './attack-switch-transform.mjs';
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
const policy = process.env.DIAGNOSTIC_ATTACK_POLICY;
assert.ok(policies.includes(policy), 'Explicit diagnostic attack policy required');
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== calibration) return result;
  return { ...result, source: transform(String(result.source).replace(/\r\n/g, '\n'), policy) };
} });
