import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const target = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== target) return result;
  const source = String(result.source).replace(/\r\n/g, '\n');
  const anchor = '        rows.push(play(seed, map, side, choiceFor(map.id, recruit), { boost, recruit, engine: true, profile, purchase }));';
  assert.equal(source.split(anchor).length, 2);
  return { ...result, source: source.replace(anchor,
    "        if (map.id === 'research' && side === 'home' && profile === 'combined') continue;\n" + anchor) };
} });
