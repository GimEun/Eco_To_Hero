import fs from 'node:fs';
import assert from 'node:assert/strict';
import { RESEARCH_MAP as map } from '../../src/data/maps/research.js';
import { createWorld } from '../../src/game/create-world.js';
import { createClub } from '../../src/game/create-club.js';
import { getClubView } from '../../src/game/world-selectors.js';
import { createPractice, stepPractice } from '../../src/simulation/practice.js';
import { canOccupy, cellCenter, findPath } from '../../src/simulation/geometry.js';
const geometry = [];
for (const site of ['A', 'B']) for (const lane of ['main', 'flank']) {
  const points = [...map.tactics.attackSites[site][lane], map.tactics.attackSites[site].plant];
  const segments = [];
  let from = { x: 2, y: 8 };
  for (const [x, y] of points) {
    const to = { x, y }, point = cellCenter(map, to);
    assert.ok(canOccupy(map, point.x, point.y, 10));
    const path = findPath(map, from, to, 10); assert.ok(path.length);
    segments.push({ from, to, distance: (path.length - 1) * map.tileSize }); from = to;
  }
  geometry.push({ site, lane, segments, distance: segments.reduce((n, segment) => n + segment.distance, 0) });
}
const movement = [];
for (const seed of [73, 101, 211]) for (const siteName of ['A', 'B']) for (const attack of ['execute', 'split']) for (const attackTeam of ['home', 'away']) {
  const world = createWorld(createClub('PathCheck').club, seed), original = structuredClone(world);
  const away = world.clubs.find(club => club.leagueId === 'pc' && club.id !== world.playerClubId);
  const state = createPractice(map, getClubView(world), getClubView(world, away.id), { seed, round: true,
    attackTeam, siteName, attackPlans: { home: attack, away: attack }, defensePlans: { home: 'standard', away: 'standard' } });
  for (const actor of state.actors) {
    actor.viewRange = 0;
    if (actor.team !== attackTeam) actor.speed = 0;
  }
  while (!state.complete && state.round.bomb.status !== 'planted' && state.tick < 2400) stepPractice(state, map);
  assert.equal(state.round.bomb.status, 'planted', `${seed}/${siteName}/${attack}/${attackTeam}`);
  assert.deepEqual(world, original);
  movement.push({ seed, site: siteName, attack, attackTeam, plantTick: state.tick,
    attackerStages: state.actors.filter(actor => actor.team === attackTeam).map(actor => ({ id: actor.id, stage: actor.attackTask.stage })) });
}
fs.writeFileSync('work-logs/2026-11-12/final-behavior-paths.json', JSON.stringify({ geometry, movement,
  limitation: 'No-contact reachability/progress checks; does not estimate contested-site win probability.' }, null, 2) + '\n');
console.log(JSON.stringify({ connectedRoutes: geometry.length, completedPlantScenarios: movement.length,
  siteMaxPlantTicks: Object.fromEntries(['A', 'B'].map(site => [site, Math.max(...movement.filter(row => row.site === site).map(row => row.plantTick))])) }));
