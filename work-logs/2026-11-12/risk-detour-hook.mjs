import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';

const practiceUrl = new URL('../../src/simulation/practice.js', import.meta.url).href;
const calibrationUrl = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
const diagnosticUrl = new URL('./risk-detour.mjs', import.meta.url).href;
// Explicit Node-only opt-in. The browser application never imports this file.
if (process.env.RISK_DETOUR !== '0') registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== practiceUrl && url !== calibrationUrl) return result;
    let source = String(result.source);
    if (url === practiceUrl) {
      const anchor = '  // 이동 전 같은 위치·시야에서 정지 여부를 결정한다.';
      assert.equal(source.split(anchor).length, 2, 'Diagnostic movement insertion anchor changed');
      source = `import { prepareRiskDetours } from ${JSON.stringify(diagnosticUrl)};\n` + source.replace(anchor, `  if (state.round) prepareRiskDetours(state, map);\n${anchor}`);
    } else {
      const anchor = '      actors: state.actors.map(actor =>';
      assert.equal(source.split(anchor).length, 2, 'Diagnostic metrics insertion anchor changed');
      source = source.replace(anchor, `      riskDetours: state.round.diagnosticRisk ? { attempts: state.round.diagnosticRisk.attempts, applied: state.round.diagnosticRisk.applied, restored: state.round.diagnosticRisk.restored, decisions: structuredClone(state.round.diagnosticRisk.decisions) } : null,\n${anchor}`);
    }
    return { ...result, source };
  },
});
