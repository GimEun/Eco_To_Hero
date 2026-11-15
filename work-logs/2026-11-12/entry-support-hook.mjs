import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const practice = new URL('../../src/simulation/practice.js', import.meta.url).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
const observer = new URL('./entry-support-observer.mjs', import.meta.url).href;
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Entry observer anchor changed: ${before}`);
  return source.replace(before, after);
}
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (![practice, calibration].includes(url)) return result;
  let source = String(result.source).replace(/\r\n/g, '\n');
  if (url === practice) {
    source = `import { observeEntrySupport, captureEntrySupport } from ${JSON.stringify(observer)};\n` + source;
    source = replaceOnce(source, 'resolveCombat(state, map);', 'observeEntrySupport(state, map); resolveCombat(state, map); captureEntrySupport(state);');
  } else {
    source = `import { entrySupportSummary } from ${JSON.stringify(observer)};\n` + source;
    source = replaceOnce(source, '      actors: state.actors.map(actor =>', '      entrySupportObservation: entrySupportSummary(state),\n      actors: state.actors.map(actor =>');
  }
  return { ...result, source };
} });
