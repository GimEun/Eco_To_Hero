import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
// Known-seed exploratory decomposition, separate from the completed frozen test.
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== calibration) return result;
  const source = String(result.source);
  const anchor = "for (const profile of ['fixed', 'combined'])";
  assert.equal(source.split(anchor).length, 2);
  return { ...result, source: source.replace(anchor, "for (const profile of ['utility', 'tactics', 'site'])") };
} });
