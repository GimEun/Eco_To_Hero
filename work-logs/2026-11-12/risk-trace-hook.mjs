import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const practice = new URL('../../src/simulation/practice.js', import.meta.url).href;
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
const risk = new URL('./risk-detour.mjs', import.meta.url).href;
const trace = new URL('./risk-trace.mjs', import.meta.url).href;
const variant = process.env.RISK_VARIANT ?? 'original';
assert.ok(['baseline', 'original', 'support-first', 'support-stable'].includes(variant));
const enabled = variant !== 'baseline';
const options = { protectSupport: ['support-first', 'support-stable'].includes(variant), stable: variant === 'support-stable' };
function insert(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, `Trace anchor changed: ${anchor}`);
  return source.replace(anchor, replacement);
}
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== practice && url !== calibration) return result;
  let source = String(result.source);
  if (url === practice) {
    source = `import { beginTrace, markRisk, traceMovement, finishTrace } from ${JSON.stringify(trace)};\nimport { prepareRiskDetours } from ${JSON.stringify(risk)};\n` + source;
    const anchor = '  // 이동 전 같은 위치·시야에서 정지 여부를 결정한다.';
    source = insert(source, anchor, `  if (state.round) { beginTrace(state, map); ${enabled ? `prepareRiskDetours(state, map, ${JSON.stringify(options)});` : ''} markRisk(state); }\n${anchor}`);
    source = insert(source, '  moveActors(state, map, engaged, STEP_MS);', '  moveActors(state, map, engaged, STEP_MS);\n  if (state.round) traceMovement(state, true);');
    source = insert(source, '  if (state.combat) avoidFlashes(state, map);', '  if (state.combat) avoidFlashes(state, map);\n  if (state.round) traceMovement(state);');
    source = insert(source, '  if (state.round) resolveRound(state);', '  if (state.round) finishTrace(state);\n  if (state.round) resolveRound(state);');
  } else {
    source = `import { traceSummary } from ${JSON.stringify(trace)};\n` + source;
    const anchor = '      actors: state.actors.map(actor =>';
    source = insert(source, anchor, `      movementTrace: traceSummary(state),\n      riskDetours: state.round.diagnosticRisk ? { attempts: state.round.diagnosticRisk.attempts, applied: state.round.diagnosticRisk.applied, restored: state.round.diagnosticRisk.restored, decisions: structuredClone(state.round.diagnosticRisk.decisions) } : null,\n${anchor}`);
  }
  return { ...result, source };
} });
