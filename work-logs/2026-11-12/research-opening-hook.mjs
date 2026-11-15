import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const base = import.meta.url;
const practice = new URL('../../src/simulation/practice.js', base).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', base).href;
const opening = new URL('./opening-engagement.mjs', base).href;
const support = new URL('./retreat-observer.mjs', base).href;
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Research observation anchor changed: ${before}`);
  return source.replace(before, after);
}
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (![practice, calibration, opening, support].includes(url)) return result;
  let source = String(result.source).replace(/\r\n/g, '\n');
  if ([opening, support].includes(url)) source = replaceOnce(source,
    "state.economy?.roundNumber === 1 && state.round?.attackTeam === 'away'",
    "state.economy?.roundNumber === 1 && state.round?.attackTeam === 'home'");
  else if (url === practice) {
    source = `import { observeOpening, captureOpeningEvents } from ${JSON.stringify(opening)};\nimport { observeRetreat, captureRetreat } from ${JSON.stringify(support)};\n` + source;
    source = replaceOnce(source, 'resolveCombat(state, map);', 'observeOpening(state, map); observeRetreat(state, map); resolveCombat(state, map); captureOpeningEvents(state); captureRetreat(state);');
  } else {
    source = `import { openingSummary } from ${JSON.stringify(opening)};\nimport { retreatSummary } from ${JSON.stringify(support)};\n` + source;
    const loop = "for (const seed of seeds.filter(seed => !recruit || eligibleRecruitSeeds.has(seed))) for (const map of activeMaps) for (const side of ['home', 'away']) {\n        rows.push(play(seed, map, side, choiceFor(map.id, recruit), { boost, recruit, engine: true, profile, purchase }));";
    source = replaceOnce(source, loop, loop.replace("['home', 'away']", "['home']"));
    source = replaceOnce(source, '      actors: state.actors.map(actor =>',
      "      researchOpening: openingSummary(state),\n      researchSupport: retreatSummary(state),\n      researchBombEvents: state.economy.roundNumber === 1 ? state.events.filter(event => /^(bomb-|plant-|defuse-|round-end)/.test(event.type)).map(event => structuredClone(event)) : null,\n      actors: state.actors.map(actor =>");
  }
  return { ...result, source };
} });
