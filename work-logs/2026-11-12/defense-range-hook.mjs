import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { transformDefenseRange } from './defense-range-transform.mjs';
const defense = new URL('../../src/simulation/defense-tactics.js', import.meta.url).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
const audit = new URL('./defense-range-transform.mjs', import.meta.url).href;
function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, `Range diagnostic anchor changed: ${anchor}`);
  return source.replace(anchor, replacement);
}
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (![defense, calibration].includes(url)) return result;
  let source = String(result.source).replace(/\r\n/g, '\n');
  if (url === defense) source = transformDefenseRange(source, audit);
  else {
    source = `import { rangeGuardSummary } from ${JSON.stringify(audit)};\n` + source;
    source = replaceOnce(source, '      actors: state.actors.map(actor =>', '      defenseRangeAudit: rangeGuardSummary(state),\n      actors: state.actors.map(actor =>');
    source = replaceOnce(source, 'seed, map: map.id, side, choice, recruit, recruitment, boost, statRange, novice,',
      "diagnosticDefenseRange: 'weapon', seed, map: map.id, side, choice, recruit, recruitment, boost, statRange, novice,");
  }
  return { ...result, source };
} });
