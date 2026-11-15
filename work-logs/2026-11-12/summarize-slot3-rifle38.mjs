import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
// Reuse the frozen full validator without editing or duplicating its implementation.
const target = new URL('./summarize-slot3-rifle.mjs', import.meta.url).href;
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== target) return result;
  let source = String(result.source);
  for (const [before, after] of [
    ["read('slot3-rifle-freeze.json')", "read('slot3-rifle38-freeze.json')"],
    ["read('shared-range42/opponent-diagnose-purchase-shared-range.json')", "read('shared-range38/opponent-diagnose-purchase-shared-range.json')"],
    ['`slot3-rifle-${map}/opponent-diagnose-purchase-slot3-rifle.json`', '`slot3-rifle38-${map}/opponent-diagnose-purchase-slot3-rifle38.json`'],
    ['`${root}/slot3-rifle-summary.json`', '`${root}/slot3-rifle38-summary.json`']
  ]) {
    assert.equal(source.split(before).length, 2, `Range38 validator adapter anchor changed: ${before}`);
    source = source.replace(before, after);
  }
  return { ...result, source };
} });
await import(target);
