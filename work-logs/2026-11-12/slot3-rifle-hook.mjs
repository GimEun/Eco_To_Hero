import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { transformPreference } from './slot3-rifle-transform.mjs';
const economy = new URL('../../src/simulation/economy.js', import.meta.url).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (![economy, calibration].includes(url)) return result;
  let source = String(result.source).replace(/\r\n/g, '\n');
  if (url === economy) source = transformPreference(source);
  else {
    const anchor = 'seed, map: map.id, side, choice, recruit, recruitment, boost, statRange, novice,';
    assert.equal(source.split(anchor).length, 2);
    source = source.replace(anchor, "diagnosticSlot3Preference: 'training-rifle', " + anchor);
  }
  return { ...result, source };
} });
