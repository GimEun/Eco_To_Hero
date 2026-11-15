import { registerHooks } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const target = new URL('./summarize-research-start.mjs', import.meta.url).href;
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== target) return result;
  let source = String(result.source);
  for (const [before, after] of [
    ["read('research-start-freeze.json')", "read('research-start38-freeze.json')"],
    ["read('site-stability-research/opponent-diagnose-purchase-site-stability.json').rows", "read('slot3-rifle38-research/opponent-diagnose-purchase-slot3-rifle38.json').rows.filter(row => row.profile === 'combined')"],
    ["read('research-start-execute/opponent-diagnose-purchase-research-start.json').rows", "read('research-start38-execute/opponent-diagnose-purchase-research-start38.json').rows"],
    ['assert.equal(new Set(rows.map(key)).size, 12)', 'assert.equal(new Set(rows.map(key)).size, 6)'],
    ['newMatches: 12, reusedMatches: 12', 'newMatches: 6, reusedMatches: 6'],
    ['`${root}/research-start-summary.json`', '`${root}/research-start38-summary.json`']
  ]) {
    assert.equal(source.split(before).length, 2, `Research38 validator adapter changed: ${before}`);
    source = source.replace(before, after);
  }
  return { ...result, source };
} });
await import(target);
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const comparison = read('research-start38-summary.json');
const before = ['relay', 'warehouse', 'research'].flatMap(map => read(`slot3-rifle38-${map}/opponent-diagnose-purchase-slot3-rifle38.json`).rows);
const changed = read('research-start38-execute/opponent-diagnose-purchase-research-start38.json').rows;
const combined = [...before.filter(row => row.profile === 'fixed' || row.map !== 'research'), ...changed];
assert.equal(combined.length, 36);
assert.equal(new Set(combined.map(row => [row.seed, row.map, row.side, row.profile].join(':'))).size, 36);
const summary = profile => {
  const rows = combined.filter(row => row.profile === profile), wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length,
    rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    winningMargin: wins.length ? wins.reduce((sum, row) => sum + row.score.home - row.score.away, 0) / wins.length : null,
    winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
};
const fixed = summary('fixed'), reactive = summary('combined');
comparison.fullCandidate = { fixed, reactive, newConditions: 6, reusedConditions: 30,
  allRateTargetsMet: fixed.rate <= .2 && reactive.rate >= .55 && reactive.rate <= .65 };
fs.writeFileSync(`${root}/research-start38-summary.json`, JSON.stringify(comparison, null, 2) + '\n');
console.log(JSON.stringify({ fullCandidate: comparison.fullCandidate }));
