import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createPractice, stepPractice } from '../src/simulation/practice.js';
import { startEconomyRound } from '../src/simulation/economy.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { WEAPONS } from '../src/data/weapons.js';
import { canOccupy } from '../src/simulation/geometry.js';

const count = Number(process.argv[2] ?? 2);
const vision = process.argv[3] ?? 'current';
const output = process.argv[4];
const statModes = process.argv[5] === 'equal' ? ['equal'] : ['equal', 'home-strong', 'away-strong'];
const gears = process.argv[6]?.split(',') ?? ['pistol', 'rifle', 'mixed'];
assert.ok(Number.isInteger(count) && count > 0 && count <= 100);
assert.ok(['current', 'equal', 'mild'].includes(vision));
const teams = (strong) => ['home', 'away'].map(team => ({ name: team, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${team}-${i}`, name: `${team}-${i}`, nickname: `${team}-${i}`, aim: strong === team ? 65 : 45,
  intelligence: strong === team ? 65 : 45, stamina: 45,
})) }));
const rows = [];
const slowCases = [];
const rotationCases = [];
for (const map of PRACTICE_MAPS) {
  for (const site of ['A', 'B']) for (const attack of ['execute', 'split']) for (const defense of ['standard', 'forward'])
    for (const gear of gears) for (const stats of statModes) {
      const row = { map: map.id, site, attack, defense, gear, stats, rounds: 0, defenseWins: 0, strongerWins: 0,
        plants: 0, timeouts: 0, shots: 0, deaths: 0, deathsWithoutShots: 0, friendlyFlashTicks: 0, enemyFlashTicks: 0,
        friendlyGrenadeDamage: 0, grenadeDamage: 0, smokeThrows: 0, grenadeEvades: 0, flashDodges: 0,
        saveRounds: 0, saveDecisions: 0, savingSurvivors: 0,
        rotationRounds: 0, rotationPlants: 0, spacingTicks: 0 };
      for (let seed = 0; seed < count; seed++) for (const attackTeam of ['home', 'away']) {
        const state = createPractice(map, ...teams(stats === 'equal' ? null : stats.split('-')[0]), { seed, economy: true, attackTeam, siteName: site,
          attackPlans: { home: attack, away: attack }, defensePlans: { home: defense, away: defense } });
        startEconomyRound(state);
        for (const actor of state.actors) {
          const id = gear === 'mixed' ? ['training-rifle','smg','shotgun','machine-gun','sniper'][actor.number - 1] : gear === 'pistol' ? 'basic-pistol' : 'training-rifle';
          const weapon = WEAPONS.find(item => item.id === id);
          Object.assign(actor, { weaponId: id, ammo: weapon.magazineSize, armor: ['pistol','rifle-bare','rifle-utilities'].includes(gear) ? 0 : 100,
            throwables: ['pistol','rifle-bare','rifle-armor'].includes(gear) ? { flashbang: 0, grenade: 0, smoke: 0 } : { flashbang: 1, grenade: 1, smoke: 1 } });
          if (vision === 'equal') Object.assign(actor, { viewRange: 200, fieldOfView: Math.PI / 2 });
          if (vision === 'mild') Object.assign(actor, { viewRange: actor.team === attackTeam ? 220 : 240,
            fieldOfView: Math.PI * (actor.team === attackTeam ? 100 : 110) / 180 });
        }
        for (let tick = 0; tick < 3200 && !state.complete; tick++) {
          stepPractice(state, map);
          row.spacingTicks += state.actors.filter(actor => actor.alive && actor.keepingDistance).length;
        }
        assert.equal(state.complete, true);
        row.rounds++; row.defenseWins += Number(state.round.winner !== attackTeam);
        row.strongerWins += Number(stats !== 'equal' && state.round.winner === stats.split('-')[0]);
        row.plants += Number(state.events.some(event => event.type === 'bomb-planted'));
        row.timeouts += Number(state.endReason === 'timeout');
        const saves = state.events.filter(event => event.type === 'equipment-save');
        row.saveRounds += Number(saves.length > 0);
        row.saveDecisions += saves.length;
        row.savingSurvivors += state.actors.filter(actor => actor.alive && actor.team !== attackTeam
          && saves.some(event => event.team === actor.team)).length;
        const rotation = state.events.find(event => event.type === 'site-rotation');
        row.rotationRounds += Number(Boolean(rotation));
        row.rotationPlants += Number(Boolean(rotation) && state.events.some(event => event.type === 'bomb-planted' && event.tick >= rotation.tick));
        if (rotation) rotationCases.push({ map: map.id, site, attack, defense, gear, stats, seed, attackTeam,
          rotation, winner: state.round.winner, reason: state.endReason });
        if (state.endReason === 'timeout') slowCases.push({ map:map.id,site,attack,defense,gear,stats,seed,attackTeam,
          bomb:state.round.bomb.status, survivors:state.actors.filter(actor=>actor.alive).map(actor=>({id:actor.id,intent:actor.intent,
            blocked:actor.blocked,trafficBlocked:actor.trafficBlocked,shots:actor.stats.shots,arrived:actor.arrived})) });
        for (const actor of state.actors) {
          assert.ok(actor.hp >= 0 && actor.hp <= 100 && actor.armor >= 0 && actor.armor <= 100);
          assert.ok(canOccupy(map,actor.x,actor.y,actor.radius));
          assert.ok(actor.cash>=0&&actor.cash<=16000);
          assert.ok(actor.ammo>=0&&actor.ammo<=WEAPONS.find(weapon=>weapon.id===actor.weaponId).magazineSize);
          row.shots += actor.stats.shots; row.deaths += Number(!actor.alive);
          row.deathsWithoutShots += Number(!actor.alive && actor.stats.shots === 0);
          row.grenadeEvades += actor.grenadeEvades ?? 0;
          row.flashDodges += actor.flashDodges ?? 0;
        }
        const alive=state.actors.filter(actor=>actor.alive);
        for(let i=0;i<alive.length;i++) for(let j=i+1;j<alive.length;j++)
          assert.ok(Math.hypot(alive[i].x-alive[j].x,alive[i].y-alive[j].y)>=alive[i].radius+alive[j].radius-1e-6);
        for (const event of state.events) {
          if (event.type === 'utility-thrown' && event.kind === 'smoke') row.smokeThrows++;
          if (event.type === 'grenade-hit') { row.grenadeDamage += event.friendlyFire ? 0 : event.damage; row.friendlyGrenadeDamage += event.friendlyFire ? event.damage : 0; }
          if (event.type === 'flashed') {
            const same = state.actors.find(actor => actor.id === event.actorId).team === state.actors.find(actor => actor.id === event.sourceId).team;
            row[same ? 'friendlyFlashTicks' : 'enemyFlashTicks'] += event.durationTicks;
          }
        }
      }
      rows.push(row);
    }
  console.error(`${map.id}: ${rows.filter(row => row.map === map.id).reduce((sum,row)=>sum+row.rounds,0)} rounds`);
}
const total = rows.reduce((sum,row) => { for (const key of ['rounds','defenseWins','strongerWins','plants','timeouts','shots','deaths','deathsWithoutShots','friendlyFlashTicks','enemyFlashTicks','friendlyGrenadeDamage','grenadeDamage','smokeThrows','grenadeEvades','flashDodges','saveRounds','saveDecisions','savingSurvivors','rotationRounds','rotationPlants','spacingTicks']) sum[key]=(sum[key]??0)+row[key]; return sum; }, {});
const result = { seeds: count, vision, total, rows, slowCases, rotationCases };
if (output) fs.writeFileSync(output, JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({ seeds:count,vision,total }));
