import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = 'work-logs/2026-11-11';
const read = path => JSON.parse(fs.readFileSync(`${root}/${path}`, 'utf8'));
const natural = read('defense-contact-support-natural.json');
assert.equal(natural.matches, 36);
assert.equal(natural.completed, 36);
assert.ok(natural.results.every(row => row.supportRounds > 0 && row.supportRounds <= row.rounds));
const before = ['known1', 'known2', 'fresh', 'fresh-recruited'].flatMap(group =>
  read(`balance-dominant48-${group}/opponent-diagnose-purchase-dominant48.json`).rows);
const after = read('defense-support48/opponent-diagnose-purchase-defense-support48.json');
const key = row => [row.seed, row.map, row.side, row.recruit, row.profile].join(':');
const beforeByKey = new Map(before.map(row => [key(row), row]));
assert.equal(beforeByKey.size, 156);
assert.equal(after.rows.length, 156);
assert.equal(new Set(after.rows.map(key)).size, 156);
const choices = read('balance-dominant48-selected-choices.json');
for (const row of after.rows) {
  const old = beforeByKey.get(key(row));
  assert.ok(old);
  for (const field of ['choice', 'statRange', 'boost', 'purchase', 'homePurchasePolicy', 'switchAfterLosses', 'recruitment']) {
    assert.deepEqual(row[field], old[field], `Changed comparison condition: ${key(row)} ${field}`);
  }
  assert.deepEqual(row.statRange, [48, 54]);
  assert.equal(row.boost, 0);
  assert.equal(row.purchase, 'mixed');
  assert.equal(row.homePurchasePolicy, 'legacy');
  assert.equal(row.switchAfterLosses, 6);
  assert.equal(row.homeManagement ?? 'static', 'static');
  assert.equal(old.homeManagement ?? 'static', 'static');
  assert.deepEqual(row.choice, choices.selected[row.recruit ? 'recruited' : 'initial'][row.map]);
  assert.equal(row.detail.length, row.rounds);
  assert.equal(row.score.home + row.score.away, row.rounds);
  if (row.recruit) for (const skill of ['aim', 'intelligence', 'stamina']) {
    assert.ok(row.recruitment.incoming[skill] >= row.recruitment.outgoing[skill]);
  }
}
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const result = {
  note: 'Same known calibration conditions before/after support rule. Ability mapping is diagnostic only. Not an independent final validation or a causal measure of support kills.',
  natural: { matches: natural.matches, completed: natural.completed, rounds: sum(natural.results, 'rounds'),
    timeouts: sum(natural.results, 'timeouts'), supportRounds: sum(natural.results, 'supportRounds'),
    supportEpisodes: sum(natural.results, 'supportEpisodes') },
  comparison: { matches: after.rows.length, rounds: sum(after.rows, 'rounds'), unavailableRecruitments: after.unavailableRecruitments,
    groups: [false, true].flatMap(recruit => ['fixed', 'combined'].map(profile => {
      const rows = after.rows.filter(row => row.recruit === recruit && row.profile === profile);
      const old = before.filter(row => row.recruit === recruit && row.profile === profile);
      const wins = rows.filter(row => row.winner === 'home');
      const rate = wins.length / rows.length;
      return { recruit, profile, matches: rows.length, beforeWins: old.filter(row => row.winner === 'home').length,
        afterWins: wins.length, afterWinRate: rate,
        targetWinRateMet: profile === 'fixed' ? rate <= 0.2 : rate >= 0.55 && rate <= 0.65,
        winningMargin: wins.length ? wins.reduce((sum, row) => sum + row.score.home - row.score.away, 0) / wins.length : null,
        winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
    })) },
};
fs.writeFileSync(`${root}/defense-contact-support-summary.json`, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(result, null, 2));
