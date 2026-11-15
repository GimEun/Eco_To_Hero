import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = 'work-logs/2026-11-11';
const inputs = ['selection', 'holdout'].map(group => `${root}/balance-current-${group}/opponent-diagnose-purchase-current.json`);
const rows = inputs.flatMap(file => JSON.parse(fs.readFileSync(file, 'utf8')).rows);
const key = r => [r.seed, r.map, r.side, r.recruit, r.profile, r.boost, r.purchase].join(':');
assert.equal(new Set(rows.map(key)).size, rows.length);
for (const row of rows) {
  assert.equal(row.detail.length, row.rounds);
  assert.equal(row.switchAfterLosses, 6);
  assert.equal(row.score.home + row.score.away, row.rounds);
  assert.ok(row.detail.every(round => round.attackTeam === 'home' || round.site === 'A'));
}
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
function summary(matches) {
  const wins = matches.filter(row => row.winner === 'home');
  const rounds = matches.flatMap(row => row.detail);
  const teams = Object.fromEntries(['home', 'away'].map(team => {
    const gear = rounds.flatMap(round => round.gear.filter(actor => actor.team === team));
    const weapons = {};
    for (const actor of gear) weapons[actor.weapon] = (weapons[actor.weapon] ?? 0) + 1;
    return [team, { playerRounds: gear.length, weapons, armorRate: mean(gear.map(actor => Number(actor.armor > 0))) }];
  }));
  const roles = Object.fromEntries(['attack', 'defense'].map(role => {
    const selected = rounds.filter(round => (round.attackTeam === 'home') === (role === 'attack'));
    const reasons = {};
    for (const round of selected) reasons[round.reason] = (reasons[round.reason] ?? 0) + 1;
    return [role, { rounds: selected.length, wins: selected.filter(round => round.winner === 'home').length, reasons }];
  }));
  return { matches: matches.length, wins: wins.length, winRate: wins.length / matches.length,
    rounds: rounds.length, averageMargin: mean(matches.map(row => row.score.home - row.score.away)),
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
    closeMatchesWithin4: matches.filter(row => Math.abs(row.score.home - row.score.away) <= 4).length,
    switches: matches.reduce((sum, row) => sum + row.switches, 0), teams, roles };
}
const groups = [];
for (const recruit of [false, true]) for (const profile of ['fixed', 'combined']) {
  const selected = rows.filter(row => row.recruit === recruit && row.profile === profile);
  groups.push({ recruit, profile, ...summary(selected),
    maps: ['relay', 'warehouse', 'research'].map(map => ({ map, ...summary(selected.filter(row => row.map === map)) })),
    seeds: [...new Set(rows.map(row => row.seed))].map(seed => ({ seed, ...summary(selected.filter(row => row.seed === seed)) })),
    sides: ['home', 'away'].map(side => ({ side, ...summary(selected.filter(row => row.side === side)) })) });
}
const old = JSON.parse(fs.readFileSync(`${root}/opponent-diagnose-purchase.json`, 'utf8')).rows
  .filter(row => row.purchase === 'mixed' && row.boost === 0);
const previous = new Map(old.map(row => [key(row), row]));
const pairs = rows.filter(row => previous.has(key(row))).map(row => {
  const before = previous.get(key(row));
  return { key: key(row), recruit: row.recruit, profile: row.profile, map: row.map,
    before: before.score, after: row.score, beforeWinner: before.winner, afterWinner: row.winner,
    marginChange: row.score.home - row.score.away - (before.score.home - before.score.away) };
});
const result = { inputs, matches: rows.length, rounds: rows.reduce((sum, row) => sum + row.rounds, 0), groups,
  comparedMatches: pairs.length, changedWinners: pairs.filter(row => row.beforeWinner !== row.afterWinner).length, pairs };
fs.writeFileSync(`${root}/balance-current-summary.json`, JSON.stringify(result, null, 2) + '\n', 'utf8');
const candidateFiles = fs.existsSync(`${root}/balance-current-candidates`)
  ? fs.readdirSync(`${root}/balance-current-candidates`).filter(name => name.endsWith('.json')) : [];
const experiments = candidateFiles.map(name => ({ name, file: `${root}/balance-current-candidates/${name}` }));
if (fs.existsSync(`${root}/balance-current-validation`)) {
  for (const name of fs.readdirSync(`${root}/balance-current-validation`).filter(name => name.endsWith('.json')))
    experiments.push({ name: `additional-seeds:${name}`, file: `${root}/balance-current-validation/${name}` });
}
const factors = `${root}/balance-current-factors/opponent-diagnose.json`;
if (fs.existsSync(factors)) experiments.push({ name: 'factors', file: factors });
const fresh = `${root}/balance-current-fresh/opponent-diagnose-purchase-current-fresh.json`;
if (fs.existsSync(fresh)) experiments.push({ name: 'fresh-seeds:307,509,997', file: fresh });
for (const group of ['selection', 'additional', 'fresh']) {
  const file = `${root}/balance-current-reserve-${group}/opponent-diagnose-purchase-current-reserve6.json`;
  if (fs.existsSync(file)) experiments.push({ name: `reserve6:${group}`, file });
}
for (const floor of [44, 46, 48]) for (const group of ['known1', 'known2', 'fresh', ...(floor === 48 ? ['fresh-recruited'] : [])]) {
  const file = `${root}/balance-dominant${floor}-${group}/opponent-diagnose-purchase-dominant${floor}.json`;
  if (fs.existsSync(file)) experiments.push({ name: `dominant${floor}:${group}`, file });
}
const followups = experiments.map(({ name, file }) => {
  const experiment = JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = experiment.rows;
  assert.equal(new Set(data.map(key)).size, data.length);
  for (const row of data) {
    assert.equal(row.detail.length, row.rounds);
    assert.equal(row.score.home + row.score.away, row.rounds);
    assert.equal(row.switchAfterLosses, 6);
    if (row.recruitment?.policy === 'dominant') {
      assert.ok(row.recruitment.fee >= 0);
      for (const skill of ['aim', 'intelligence', 'stamina']) assert.ok(row.recruitment.incoming[skill] >= row.recruitment.outgoing[skill]);
    }
    if (name.startsWith('dominant')) {
      const floor = Number(name.match(/^dominant(\d+):/)[1]);
      assert.deepEqual(row.statRange, [floor, 54]); assert.equal(row.purchase, 'mixed');
      assert.equal(row.homePurchasePolicy, 'legacy'); assert.equal(row.opponentVariant, 'current');
      const choices = JSON.parse(fs.readFileSync(`${root}/balance-dominant48-selected-choices.json`, 'utf8'));
      assert.ok(!choices.trainingSeeds.includes(row.seed));
      assert.deepEqual(row.choice, choices.selected[row.recruit ? 'recruited' : 'initial'][row.map]);
      if (row.recruit) assert.equal(row.recruitment.policy, 'dominant');
    }
    assert.ok(row.detail.every(round => round.attackTeam === 'home' || round.site === 'A'));
    for (const round of row.detail) for (const actor of round.gear) assert.ok(actor.cash >= 0 && actor.cash <= 16000);
    if (name.startsWith('fresh-seeds:')) {
      assert.ok([307, 509, 997].includes(row.seed));
      const choices = JSON.parse(fs.readFileSync(`${root}/balance-current-selected-choices.json`, 'utf8'));
      assert.ok(!choices.trainingSeeds.includes(row.seed));
      assert.deepEqual(row.choice, choices.selected[row.recruit ? 'recruited' : 'initial'][row.map]);
    }
    if (['attack-alternative', 'defense-alternative'].includes(row.opponentVariant)) {
      const initial = experiment.prior[row.map];
      const role = row.opponentVariant === 'attack-alternative' ? 'attack' : 'defense';
      assert.notEqual(row.opponentInitial[role], initial[role]);
      assert.equal(row.detail[0][role === 'attack' ? 'attackPlans' : 'defensePlans'].away, row.opponentInitial[role]);
    }
  }
  return { name, unavailableRecruitments: experiment.unavailableRecruitments ?? [], matches: data.length, rounds: data.reduce((sum, row) => sum + row.rounds, 0),
    groups: [false, true].flatMap(recruit => [...new Set(data.map(row => row.profile))].map(profile => {
      const selected = data.filter(row => row.recruit === recruit && row.profile === profile);
      return { recruit, profile, ...summary(selected), maps: ['relay', 'warehouse', 'research']
        .map(map => ({ map, ...summary(selected.filter(row => row.map === map)) })) };
    })) };
});
fs.writeFileSync(`${root}/balance-current-followups.json`, JSON.stringify(followups, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ matches: result.matches, rounds: result.rounds, comparedMatches: result.comparedMatches,
  changedWinners: result.changedWinners, groups: groups.map(({ teams, roles, maps, seeds, sides, ...group }) => ({ ...group,
    maps: maps.map(({ map, matches, wins, winningMargin, roles }) => ({ map, matches, wins, winningMargin, roles })) })) }, null, 2));
