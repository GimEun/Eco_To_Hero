import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const practice = new URL('../../src/simulation/practice.js', import.meta.url).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
const observer = new URL('./opening-engagement.mjs', import.meta.url).href;
function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, `Opening observation anchor changed: ${anchor}`);
  return source.replace(anchor, replacement);
}
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (![practice, calibration].includes(url)) return result;
  let source = String(result.source).replace(/\r\n/g, '\n');
  if (url === practice) {
    source = `import { observeOpening, captureOpeningEvents } from ${JSON.stringify(observer)};\n` + source;
    source = replaceOnce(source, 'resolveCombat(state, map);', 'observeOpening(state, map); resolveCombat(state, map); captureOpeningEvents(state);');
  } else {
    source = `import { openingSummary } from ${JSON.stringify(observer)};\n` + source;
    const loop = "for (const seed of seeds.filter(seed => !recruit || eligibleRecruitSeeds.has(seed))) for (const map of activeMaps) for (const side of ['home', 'away']) {\n        rows.push(play(seed, map, side, choiceFor(map.id, recruit), { boost, recruit, engine: true, profile, purchase }));";
    source = replaceOnce(source, loop, loop.replace("['home', 'away']", "['away']"));
    source = replaceOnce(source, '      actors: state.actors.map(actor =>', '      openingEngagement: openingSummary(state),\n      actors: state.actors.map(actor =>');
  }
  return { ...result, source };
} });
