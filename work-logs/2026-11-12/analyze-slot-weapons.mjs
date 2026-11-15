import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { PRACTICE_MAPS } from '../../src/data/maps/index.js';
import { WEAPONS } from '../../src/data/weapons.js';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('start-choice42-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const sources = [30, 38, 42].map(minimum => ({ experiment: '21', minimum, file: `shared-range${minimum}/opponent-diagnose-purchase-shared-range.json` }))
  .concat(['warehouse', 'research'].map(map => ({ experiment: '22', minimum: 42, file: `start-choice42-${map}/opponent-diagnose-purchase-start-choice42.json` })));
const inputHashes = Object.fromEntries(sources.map(source => [`${root}/${source.file}`, hash(`${root}/${source.file}`)]));
const samples = [];
let matches = 0;
const preferred = ['training-rifle', 'smg', 'shotgun', 'machine-gun', 'sniper'];
for (const source of sources) {
  const data = read(source.file); assert.equal(data.rows.length, source.experiment === '21' ? 36 : 6);
  for (const row of data.rows) {
    matches++; assert.equal(row.homePurchasePolicy, 'shared-auto'); assert.deepEqual(row.statRange, [source.minimum, 54]);
    assert.equal(row.detail.length, row.rounds);
    const map = PRACTICE_MAPS.find(map => map.id === row.map); assert.ok(map);
    for (const round of row.detail) {
      assert.equal(round.gear.length, 10); assert.equal(round.actors.length, 10);
      for (const gear of round.gear) {
        const actor = round.actors.find(actor => actor.id === gear.id); assert.ok(actor);
        const slot = Number(gear.id.split('-').at(-1)); assert.ok(slot >= 1 && slot <= 5);
        const role = round.attackTeam === gear.team ? 'attack' : 'defense';
        const weapon = WEAPONS.find(weapon => weapon.id === gear.weapon); assert.ok(weapon);
        const defense = map.tactics.defenseTasks[slot - 1];
        const task = role === 'attack' ? slot <= 2 ? 'entry' : slot === 3 ? 'carrier' : 'support' : defense.role;
        for (const field of ['kills', 'deaths', 'damage', 'shots', 'hits']) assert.ok(actor[field] >= 0 && Number.isFinite(actor[field]));
        assert.ok(actor.hits <= actor.shots); assert.ok(actor.deaths <= 1);
        samples.push({ experiment: source.experiment, minimum: source.minimum, map: row.map, profile: row.profile,
          seed: row.seed, side: row.side, round: round.round, team: gear.team, slot, role, task,
          plan: role === 'attack' ? round.attackPlans[gear.team] : round.defensePlans[gear.team],
          weapon: weapon.id, range: weapon.range, preferred: preferred[slot - 1],
          cash: gear.cash, alive: actor.alive, kills: actor.kills, deaths: actor.deaths, damage: actor.damage, shots: actor.shots, hits: actor.hits });
      }
    }
  }
}
assert.equal(matches, 120); assert.equal(samples.length, (1921 + 231) * 10);
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
function summarize(rows) {
  const sum = key => rows.reduce((total, row) => total + row[key], 0), shots = sum('shots'), hits = sum('hits');
  return { playerRounds: rows.length, meanRange: mean(rows.map(row => row.range)),
    preferredHeld: rows.filter(row => row.weapon === row.preferred).length,
    shortRange: rows.filter(row => row.range < 200).length,
    weapons: Object.fromEntries([...new Set(rows.map(row => row.weapon))].sort().map(weapon => [weapon, rows.filter(row => row.weapon === weapon).length])),
    shots, shotsPerRound: rows.length ? shots / rows.length : null,
    damagePerRound: mean(rows.map(row => row.damage)), accuracy: shots ? hits / shots : null,
    surviveRate: rows.length ? rows.filter(row => row.alive).length / rows.length : null,
    zeroShots: rows.filter(row => row.shots === 0).length, kills: sum('kills'), deaths: sum('deaths') };
}
const slotRoles = [1, 2, 3, 4, 5].map(slot => ({ slot, preferred: preferred[slot - 1],
  attack: slot <= 2 ? 'entry' : slot === 3 ? 'carrier' : 'support',
  preferredRange: WEAPONS.find(weapon => weapon.id === preferred[slot - 1]).range,
  defense: PRACTICE_MAPS.map(map => ({ map: map.id, ...map.tactics.defenseTasks[slot - 1] })) }));
const groups = [...new Set(samples.map(row => [row.experiment, row.minimum, row.map, row.profile, row.team, row.role, row.slot].join(':')))].map(key => {
  const [experiment, minimum, map, profile, team, role, slot] = key.split(':');
  return { experiment, minimum: Number(minimum), map, profile, team, role, slot: Number(slot),
    ...summarize(samples.filter(row => [row.experiment, row.minimum, row.map, row.profile, row.team, row.role, row.slot].join(':') === key)) };
});
const selected = samples.filter(row => row.experiment === '21' && row.minimum === 42 && row.profile === 'combined');
const focus = ['home', 'away'].flatMap(team => ['attack', 'defense'].flatMap(role => [1, 2, 3, 4, 5].map(slot => ({ team, role, slot,
  ...summarize(selected.filter(row => row.team === team && row.role === role && row.slot === slot)) }))));
const homeCarriers = selected.filter(row => row.team === 'home' && row.role === 'attack' && row.slot === 3);
const carrierByMap = PRACTICE_MAPS.map(map => ({ map: map.id, ...summarize(homeCarriers.filter(row => row.map === map.id)),
  weapons: [...new Set(homeCarriers.filter(row => row.map === map.id).map(row => row.weapon))].map(weapon => ({ weapon,
    ...summarize(homeCarriers.filter(row => row.map === map.id && row.weapon === weapon)) })) }));
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
for (const [file, value] of Object.entries(inputHashes)) assert.equal(hash(file), value, file);
const result = { matchesAnalyzed: matches, playerRounds: samples.length, newMatchesRun: 0, gameChangesApplied: false,
  slotRoles, groups, focus42Reactive: focus, carrierByMap,
  inputHashes, unchangedProductionFiles: Object.keys(production).length,
  limitations: ['Weapon choice, player ability, slot task, survival and economy are correlated; no isolated weapon/slot causal estimate.',
    'No recorded engagement distances or exact carrier identity after bomb recovery; slot 3 is the initial carrier task.',
    'Damage includes grenades; static defensive labels do not prove the actor stayed at that location all round.'] };
fs.writeFileSync(`${root}/slot-weapon-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ matchesAnalyzed: matches, playerRounds: samples.length, carrierByMap,
  focus42Reactive: focus.filter(row => row.team === 'home').map(({ weapons, ...row }) => row), unchangedProductionFiles: result.unchangedProductionFiles }, null, 2));
