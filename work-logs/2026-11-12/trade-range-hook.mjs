import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const attack = new URL('../../src/simulation/attack-tactics.js', import.meta.url).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
const helper = new URL('./trade-range-point.mjs', import.meta.url).href;
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (![attack, calibration].includes(url)) return result;
  let source = String(result.source).replace(/\r\n/g, '\n');
  const before = url === attack ? '    const support = tradeSupport(state, map, actor);' : '      actors: state.actors.map(actor =>';
  assert.equal(source.split(before).length, 2, 'Trade range anchor changed');
  if (url === attack) {
    source = `import { fitTradePoint } from ${JSON.stringify(helper)};\n` + source;
    source = source.replace(before, '    const support = fitTradePoint(state, map, actor, tradeSupport(state, map, actor));');
  } else {
    source = `import { tradeRangeSummary } from ${JSON.stringify(helper)};\n` + source;
    source = source.replace(before, '      tradeRangeAudit: tradeRangeSummary(state),\n' + before);
    const anchor = 'seed, map: map.id, side, choice, recruit, recruitment, boost, statRange, novice,';
    assert.equal(source.split(anchor).length, 2);
    source = source.replace(anchor, "diagnosticTradeRange: 'two-tiles', " + anchor);
  }
  return { ...result, source };
} });
