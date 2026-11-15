import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = process.env.CALIBRATION_ROOT ?? 'work-logs/2026-11-12';
const maps = ['relay', 'warehouse', 'research'];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (name, data) => fs.writeFileSync(`${root}/${name}.json`, JSON.stringify(data, null, 2) + '\n');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const key = row => [row.seed, row.map, row.side, row.recruit, row.profile, row.boost, row.statRange, row.opponentVariant].join(':');
function validate(row) {
  assert.equal(row.purchase, 'mixed');
  assert.equal(row.homePurchasePolicy, 'legacy');
  assert.equal(row.homeManagement, 'static');
  assert.equal(row.switchAfterLosses, 6);
  assert.equal(row.score.home + row.score.away, row.rounds);
  assert.equal(row.detail.length, row.rounds);
  assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
  assert.ok(row.score[row.winner] >= 13);
  for (const round of row.detail) for (const actor of round.gear) assert.ok(actor.cash >= 0 && actor.cash <= 16000);
  for (const round of row.detail) if (round.riskDetours) {
    const risk = round.riskDetours;
    assert.ok(risk.attempts >= risk.applied && risk.applied >= risk.restored && risk.applied >= risk.decisions.length);
    for (const decision of risk.decisions) {
      assert.ok(decision.after < decision.before);
      assert.ok(decision.alternativeLength <= decision.originalLength * 1.5 + 1e-7);
      assert.ok(decision.alternativeLength <= decision.originalLength + 240 + 1e-7);
    }
  }
  if (row.recruit) {
    for (const skill of ['aim', 'intelligence', 'stamina']) assert.ok(row.recruitment.incoming[skill] >= row.recruitment.outgoing[skill]);
    assert.ok(row.recruitment.fee <= 15000);
  }
}
function summary(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  return { matches: rows.length, wins: wins.length, rate: wins.length / rows.length,
    averageMargin: mean(rows.map(row => row.score.home - row.score.away)),
    winningMargin: mean(wins.map(row => row.score.home - row.score.away)),
    winsWithin4: wins.filter(row => row.score.home - row.score.away <= 4).length };
}
if (process.argv[2] === 'controls') {
  const before = read('work-logs/2026-11-11/defense-support48/opponent-diagnose-purchase-defense-support48.json').rows;
  const after = read(`${root}/candidate48/opponent-diagnose-purchase-reevaluated48.json`).rows.filter(row => row.profile === 'fixed');
  assert.equal(after.length, 36);
  for (const row of after) {
    const old = before.find(prior => key(prior) === key(row));
    assert.ok(old);
    for (const field of ['score', 'rounds', 'detail', 'recruitment']) assert.deepEqual(row[field], old[field]);
  }
  const result = { unchangedFixedControls: after.length, checked: ['score', 'rounds', 'detail', 'recruitment'] };
  write('fixed-controls', result); console.log(JSON.stringify(result));
} else if (process.argv[2] === 'select') {
  const selected = { initial: {}, recruited: {} }, groups = [];
  let trainingRange = null;
  for (const map of maps) {
    const data = read(`${root}/train-${map}/opponent-diagnose-purchase-choice-pilot.json`);
    assert.deepEqual(data.seeds, [1, 42]);
    if (!trainingRange) trainingRange = data.statRange;
    assert.ok(Array.isArray(trainingRange) && trainingRange.length === 2);
    assert.deepEqual(data.statRange, trainingRange);
    assert.equal(data.rows.length, 64);
    for (const row of data.rows) {
      validate(row); assert.equal(row.map, map); assert.deepEqual(row.statRange, trainingRange);
      assert.ok(data.seeds.includes(row.seed)); assert.equal(row.profile, 'combined');
    }
    assert.equal(new Set(data.rows.map(row => `${key(row)}:${JSON.stringify(row.choice)}`)).size, 64);
    for (const recruit of [false, true]) {
      const choices = [...new Set(data.rows.filter(row => row.recruit === recruit).map(row => JSON.stringify(row.choice)))];
      assert.equal(choices.length, 8);
      const ranked = choices.map(choice => ({ choice: JSON.parse(choice), ...summary(data.rows.filter(row => row.recruit === recruit && JSON.stringify(row.choice) === choice)) }));
      assert.ok(ranked.every(group => group.matches === 4));
      ranked.sort((a, b) => b.wins - a.wins || b.averageMargin - a.averageMargin);
      selected[recruit ? 'recruited' : 'initial'][map] = ranked[0].choice;
      groups.push({ map, recruit, ranked });
    }
  }
  write('selected-choices', { trainingSeeds: [1, 42], statRange: trainingRange, selected, groups });
  console.log(JSON.stringify({ selected, best: groups.map(g => ({ map: g.map, recruit: g.recruit, ...g.ranked[0] })) }, null, 2));
} else {
  const files = process.argv.slice(3);
  assert.ok(files.length);
  const rows = files.flatMap(file => {
    const data = read(file);
    const expected = data.seeds.flatMap(seed => [false, true].filter(recruit => !recruit || !data.unavailableRecruitments.some(item => item.seed === seed))
      .flatMap(recruit => maps.flatMap(map => ['home', 'away'].flatMap(side => ['fixed', 'combined'].map(profile => [seed, map, side, recruit, profile].join(':'))))));
    const actual = data.rows.map(row => [row.seed, row.map, row.side, row.recruit, row.profile].join(':'));
    assert.deepEqual([...actual].sort(), expected.sort(), `Incomplete or duplicated conditions: ${file}`);
    return data.rows;
  });
  assert.equal(new Set(rows.map(key)).size, rows.length);
  const choices = read(`${root}/selected-choices.json`).selected;
  for (const row of rows) {
    validate(row); assert.deepEqual(row.choice, choices[row.recruit ? 'recruited' : 'initial'][row.map]);
  }
  const groups = [false, true].flatMap(recruit => ['fixed', 'combined'].map(profile => {
    const matching = rows.filter(row => row.recruit === recruit && row.profile === profile);
    const result = summary(matching);
    return { recruit, profile, ...result, targetRateMet: profile === 'fixed' ? result.rate <= .2 : result.rate >= .55 && result.rate <= .65,
      maps: maps.map(map => ({ map, ...summary(matching.filter(row => row.map === map)) })) };
  }));
  const result = { files, matches: rows.length, rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    groups, allRateTargetsMet: groups.every(g => g.targetRateMet),
    note: 'Diagnostic static profiles. Close scores are reported separately; no new close-game threshold is invented.' };
  write(process.argv[2], result); console.log(JSON.stringify(result, null, 2));
}
