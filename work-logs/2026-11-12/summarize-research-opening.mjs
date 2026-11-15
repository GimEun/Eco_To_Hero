import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('research-opening-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
let exactReplays = 0;
const observations = [];
for (const plan of ['split', 'execute']) {
  const original = read(plan === 'split' ? 'slot3-rifle38-research/opponent-diagnose-purchase-slot3-rifle38.json' : 'research-start38-execute/opponent-diagnose-purchase-research-start38.json').rows.filter(row => row.profile === 'combined' && row.side === 'home');
  const replays = read(`research-opening-${plan}/opponent-diagnose-purchase-research-opening.json`).rows;
  assert.equal(replays.length, 3);
  assert.deepEqual(replays.map(row => row.seed).sort((a, b) => a - b), [...spec.seeds].sort((a, b) => a - b));
  for (const row of replays) {
    const previous = original.find(old => old.seed === row.seed); assert.ok(previous);
    const clean = structuredClone(row);
    for (const round of clean.detail) { delete round.researchOpening; delete round.researchSupport; delete round.researchBombEvents; }
    assert.deepEqual(clean, previous); exactReplays++;
    const round = row.detail[0], opening = round.researchOpening, support = round.researchSupport;
    assert.ok(row.detail.slice(1).every(round => round.researchOpening === null && round.researchSupport === null && round.researchBombEvents === null));
    const shots = opening.events.filter(event => event.type === 'shot'), deaths = opening.events.filter(event => event.type === 'death');
    assert.deepEqual(support.shots.map(shot => shot.event), shots);
    assert.deepEqual(support.deaths.map(death => death.event), deaths);
    const actors = Object.entries(opening.actors).map(([id, actor]) => {
      const ownShots = shots.filter(event => event.actorId === id), death = deaths.find(event => event.actorId === id);
      assert.equal(ownShots.length, round.actors.find(actor => actor.id === id).shots);
      return { id, team: actor.team, firstVisible: actor.firstVisible, firstEligible: actor.firstEligible,
        firstShot: ownShots[0]?.tick ?? null, death: death?.tick ?? null, shots: ownShots.length };
    });
    const earliest = (team, get) => { const values = actors.filter(actor => actor.team === team).map(get).filter(value => value !== null); return values.length ? Math.min(...values) : null; };
    observations.push({ plan, seed: row.seed, winner: round.winner, reason: round.reason,
      teams: ['home', 'away'].map(team => {
        const ownShots = support.shots.filter(shot => shot.actor.team === team);
        return { team, firstVisible: earliest(team, actor => actor.firstVisible?.tick ?? null),
          firstEligible: earliest(team, actor => actor.firstEligible?.tick ?? null), firstShot: earliest(team, actor => actor.firstShot),
          shots: ownShots.length, hits: ownShots.filter(shot => shot.event.hit).length,
          noSameTargetAllies: ownShots.filter(shot => shot.sameTargetAllies.length === 0).length,
          meanSameTargetAllies: ownShots.length ? ownShots.reduce((sum, shot) => sum + shot.sameTargetAllies.length, 0) / ownShots.length : null,
          diedWithoutShot: actors.filter(actor => actor.team === team && actor.death !== null && actor.shots === 0).length };
      }), actors, deaths, bombEvents: round.researchBombEvents });
  }
}
const result = { observations, exactWholeMatchReplays: exactReplays, newlySampledMatches: 0, replayedMatches: 6,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length, gameChangesApplied: false,
  limitations: ['Pre-combat sampling is not continuous visibility or team communication.',
    'Same-target allies are opportunity, not actual fire readiness.', 'Same-tick event array order does not establish sub-tick firing/death priority.'] };
fs.writeFileSync(`${root}/research-opening-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, observations: observations.map(({ actors, deaths, ...row }) => ({ ...row, deaths: deaths.map(death => ({ tick: death.tick, actor: death.actorId, killer: death.killerId })) })) }, null, 2));
