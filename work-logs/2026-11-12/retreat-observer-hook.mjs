import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const practice = new URL('../../src/simulation/practice.js', import.meta.url).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
const observer = new URL('./retreat-observer.mjs', import.meta.url).href;
function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, `Retreat observation anchor changed: ${anchor}`);
  return source.replace(anchor, replacement);
}
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (![practice, calibration].includes(url)) return result;
  let source = String(result.source).replace(/\r\n/g, '\n');
  if (url === practice) {
    source = `import { observeRetreat, captureRetreat } from ${JSON.stringify(observer)};\n` + source;
    source = replaceOnce(source, 'resolveCombat(state, map);', 'observeRetreat(state, map); resolveCombat(state, map); captureRetreat(state);');
  } else {
    source = `import { retreatSummary } from ${JSON.stringify(observer)};\n` + source;
    source = replaceOnce(source, '      actors: state.actors.map(actor =>', '      retreatObservation: retreatSummary(state),\n      actors: state.actors.map(actor =>');
  }
  return { ...result, source };
} });
