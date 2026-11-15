import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = 'work-logs/2026-11-11';
const choices = JSON.parse(fs.readFileSync(`${root}/balance-dominant48-selected-choices.json`, 'utf8'));
const key = row => [row.seed, row.map, row.side, row.recruit, row.profile].join(':');
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
const experiments = [];
const rowSets = new Map();
const variants = [
  { floor: 44, management: 'static' }, { floor: 46, management: 'static' }, { floor: 48, management: 'static' },
  { floor: 48, management: 'reactive' }, { floor: 47, management: 'reactive' },
  { boost: 6, management: 'static' }, { boost: 8, management: 'static' },
];
for (const { floor = null, boost = 0, management } of variants) {
  const prefix = boost ? `dominant-plus${boost}` : management === 'reactive' ? `reactive${floor}` : `dominant${floor}`;
  const groups = management === 'static' && floor === 48 ? ['known1', 'known2', 'fresh', 'fresh-recruited'] : ['known1', 'known2', 'fresh'];
  const files = groups.map(group => `${root}/balance-${prefix}-${group}/opponent-diagnose-purchase-${prefix}.json`);
  if (files.some(file => !fs.existsSync(file))) continue;
  const inputs = files.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
  const rows = inputs.flatMap(input => input.rows);
  assert.equal(new Set(rows.map(key)).size, rows.length);
  const unavailable = [...new Map(inputs.flatMap(input => input.unavailableRecruitments ?? []).map(item => [item.seed, item])).values()];
  for (const row of rows) {
    assert.deepEqual(row.statRange, boost ? null : [floor, 54]); assert.equal(row.boost, boost);
    assert.equal(row.purchase, 'mixed'); assert.equal(row.homePurchasePolicy, 'legacy');
    assert.equal(row.switchAfterLosses, 6); assert.equal(row.detail.length, row.rounds);
    assert.equal(row.score.home + row.score.away, row.rounds);
    assert.ok(!choices.trainingSeeds.includes(row.seed));
    assert.deepEqual(row.choice, choices.selected[row.recruit ? 'recruited' : 'initial'][row.map]);
    if (row.recruit) {
      assert.equal(row.recruitment.policy, 'dominant');
      for (const skill of ['aim', 'intelligence', 'stamina']) assert.ok(row.recruitment.incoming[skill] >= row.recruitment.outgoing[skill]);
    }
    if (management === 'reactive') {
      assert.equal(row.homeManagement, 'reactive');
      if (row.profile === 'fixed') {
        assert.equal(row.homeChanges.length, 0);
        const controls = rowSets.get(`${floor}:static`);
        if (controls) {
          const control = controls.find(other => key(other) === key(row));
          assert.ok(control); assert.deepEqual(row.score, control.score); assert.deepEqual(row.detail, control.detail);
        }
      }
      const losses = { attack: 0, defense: 0 };
      for (const round of row.detail) {
        const role = round.attackTeam === 'home' ? 'attack' : 'defense';
        const change = row.homeChanges.find(change => change.round === round.round);
        if (change) {
          assert.equal(change.role, role); assert.ok(losses[role] >= 2);
          assert.equal(round[role === 'attack' ? 'attackPlans' : 'defensePlans'].home, change.to);
          if (role === 'attack') assert.equal(round.site, change.site);
          losses[role] = 0;
        }
        losses[role] = round.winner === 'home' ? 0 : losses[role] + 1;
      }
    }
  }
  rowSets.set(`${boost ? `plus${boost}` : floor}:${management}`, rows);
  experiments.push({ floor, boost, management, files, matches: rows.length, rounds: rows.reduce((sum, row) => sum + row.rounds, 0), unavailable,
    complete: rows.length === 156,
    groups: [false, true].flatMap(recruit => ['fixed', 'combined'].map(profile => {
      const selected = rows.filter(row => row.recruit === recruit && row.profile === profile);
      const wins = selected.filter(row => row.winner === 'home');
      const rate = wins.length / selected.length;
      return { recruit, profile, matches: selected.length, wins: wins.length, winRate: rate,
        targetWinRateMet: profile === 'fixed' ? rate <= 0.2 : rate >= 0.55 && rate <= 0.65,
        winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
        winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length,
        maps: ['relay', 'warehouse', 'research'].map(map => {
          const matches = selected.filter(row => row.map === map);
          return { map, matches: matches.length, wins: matches.filter(row => row.winner === 'home').length };
        }) };
    })) });
}
fs.writeFileSync(`${root}/balance-approved-comparison.json`, JSON.stringify({ note: 'Calibration comparison; seeds reused for candidate selection are not a fresh final validation.', experiments }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(experiments.map(({ files, ...experiment }) => experiment), null, 2));
