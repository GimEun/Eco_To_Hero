import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const base = import.meta.url;
const practice = new URL('../../src/simulation/practice.js', base).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', base).href;
const opening = new URL('./opening-engagement.mjs', base).href;
const retreat = new URL('./retreat-observer.mjs', base).href;
const objectives = new URL('./research-defense-observer.mjs', base).href;
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, `Defense observation anchor changed: ${before}`);
  return source.replace(before, after);
}
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (![practice, calibration].includes(url)) return result;
  let source = String(result.source).replace(/\r\n/g, '\n');
  if (url === practice) {
    source = `import { observeOpening, captureOpeningEvents } from ${JSON.stringify(opening)};\nimport { observeRetreat, captureRetreat } from ${JSON.stringify(retreat)};\nimport { observeDefenseObjectives } from ${JSON.stringify(objectives)};\n` + source;
    source = once(source, 'resolveCombat(state, map);', 'observeOpening(state, map); observeRetreat(state, map); observeDefenseObjectives(state); resolveCombat(state, map); captureOpeningEvents(state); captureRetreat(state);');
  } else {
    source = `import { openingSummary } from ${JSON.stringify(opening)};\nimport { retreatSummary } from ${JSON.stringify(retreat)};\nimport { defenseObjectiveSummary } from ${JSON.stringify(objectives)};\n` + source;
    const loop = "for (const seed of seeds.filter(seed => !recruit || eligibleRecruitSeeds.has(seed))) for (const map of activeMaps) for (const side of ['home', 'away']) {\n        rows.push(play(seed, map, side, choiceFor(map.id, recruit), { boost, recruit, engine: true, profile, purchase }));";
    source = once(source, loop, loop.replace("['home', 'away']", "['away']"));
    source = once(source, '      actors: state.actors.map(actor =>',
      '      researchDefenseOpening: openingSummary(state),\n      researchDefenseRetreat: retreatSummary(state),\n      researchDefenseObjectives: defenseObjectiveSummary(state),\n      actors: state.actors.map(actor =>');
  }
  return { ...result, source };
} });
