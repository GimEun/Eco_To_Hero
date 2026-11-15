import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const attack = new URL('../../src/simulation/attack-tactics.js', import.meta.url).href;
const practice = new URL('../../src/simulation/practice.js', import.meta.url).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
const helper = new URL('./trade-hold.mjs', import.meta.url).href;
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (![attack, calibration, practice].includes(url)) return result;
  let source = String(result.source).replace(/\r\n/g, '\n');
  if (url === practice) {
    const anchor = '  if (state.round) prepareRound(state, map);';
    assert.equal(source.split(anchor).length, 2);
    return { ...result, source: `import { pruneTradeHolds } from ${JSON.stringify(helper)};\n` + source.replace(anchor, anchor + '\n  if (state.round) pruneTradeHolds(state);') };
  }
  const before = url === attack ? '    const support = tradeSupport(state, map, actor);' : '      actors: state.actors.map(actor =>';
  assert.equal(source.split(before).length, 2, 'Trade hold anchor changed');
  if (url === attack) {
    source = `import { retainTradeDestination } from ${JSON.stringify(helper)};\n` + source;
    source = source.replace(before, '    const support = retainTradeDestination(state, map, actor, tradeSupport(state, map, actor));');
  } else {
    source = `import { tradeHoldSummary } from ${JSON.stringify(helper)};\n` + source;
    source = source.replace(before, '      tradeHoldAudit: tradeHoldSummary(state),\n' + before);
    const anchor = 'seed, map: map.id, side, choice, recruit, recruitment, boost, statRange, novice,';
    assert.equal(source.split(anchor).length, 2);
    source = source.replace(anchor, 'diagnosticTradeHoldTicks: 60, ' + anchor);
  }
  return { ...result, source };
} });
