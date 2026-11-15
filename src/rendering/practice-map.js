import { wallRectangles, visionPolygon, cellCenter, findPath } from '../simulation/geometry.js';
import { visibleOpponents } from '../simulation/practice.js';
import { manualPlanFor, manualRouteStart } from '../simulation/manual-tactics.js';

const COLORS = { home: '#8fb5ff', away: '#d0a8f4' };

export function drawPractice(context, map, state, selectedId, manualPreview = undefined) {
  const width = map.columns * map.tileSize;
  const height = map.rows * map.tileSize;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#141b29';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#202a3d';
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= width; x += map.tileSize) { context.moveTo(x, 0); context.lineTo(x, height); }
  for (let y = 0; y <= height; y += map.tileSize) { context.moveTo(0, y); context.lineTo(width, y); }
  context.stroke();

  for (const site of map.sites) {
    const x = site.x * map.tileSize;
    const y = site.y * map.tileSize;
    context.fillStyle = '#253b44';
    context.fillRect(x, y, site.width * map.tileSize, site.height * map.tileSize);
    context.strokeStyle = '#698d93';
    context.strokeRect(x + 2, y + 2, site.width * map.tileSize - 4, site.height * map.tileSize - 4);
    context.fillStyle = '#9bbdbf';
    context.font = 'bold 36px sans-serif';
    context.textAlign = 'center';
    context.fillText(site.name, x + site.width * map.tileSize / 2, y + site.height * map.tileSize / 2 + 12);
  }

  for (const [spawnSide, spawns] of Object.entries(map.spawns)) {
    const attackTeam = state.round?.attackTeam;
    const team = attackTeam ? spawnSide === 'home' ? attackTeam : attackTeam === 'home' ? 'away' : 'home' : spawnSide;
    context.strokeStyle = team === 'home' ? '#435f83' : '#69507c';
    context.lineWidth = 1;
    for (const cell of spawns) {
      context.strokeRect((cell.x + 0.2) * map.tileSize, (cell.y + 0.2) * map.tileSize, map.tileSize * 0.6, map.tileSize * 0.6);
    }
    context.fillStyle = COLORS[team];
    context.font = '11px sans-serif';
    context.textAlign = 'center';
    context.fillText('시작', (spawns[0].x + 0.5) * map.tileSize, spawns[0].y * map.tileSize - 10);
  }

  const selected = state.actors.find(actor => actor.id === selectedId);
  const manual = manualPreview ?? (selected ? manualPlanFor(state, selected) : null);
  const detected = new Set(visibleOpponents(state, map, selectedId).map(actor => actor.id));
  if (selected?.alive) {
    context.beginPath();
    context.moveTo(selected.x, selected.y);
    for (const point of visionPolygon(map, selected, state)) context.lineTo(point.x, point.y);
    context.closePath();
    context.fillStyle = selected.team === 'home' ? 'rgba(143,181,255,0.18)' : 'rgba(208,168,244,0.18)';
    context.fill();
    context.strokeStyle = COLORS[selected.team];
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    selected.route.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.setLineDash([5, 7]);
    context.strokeStyle = '#64758d';
    context.stroke();
    context.setLineDash([]);
    const end = selected.route.at(-1);
    context.strokeRect(end.x - 7, end.y - 7, 14, 14);
  }

  for (const smoke of state.smokes ?? []) {
    if (smoke.expiresTick <= state.tick) continue;
    context.beginPath(); context.arc(smoke.x, smoke.y, smoke.radius, 0, Math.PI * 2);
    context.fillStyle = 'rgba(167,180,195,0.55)'; context.fill();
    context.strokeStyle = '#b5c0ce'; context.lineWidth = 1; context.stroke();
    context.fillStyle = '#e8edf5'; context.font = '11px sans-serif'; context.textAlign = 'center';
    context.fillText(`연막 ${((smoke.expiresTick - state.tick) * 0.05).toFixed(1)}초`, smoke.x, smoke.y - smoke.radius - 5);
  }

  for (const wall of wallRectangles(map)) {
    context.fillStyle = '#374158';
    context.fillRect(wall.x, wall.y, wall.width, wall.height);
    context.strokeStyle = '#65718a';
    context.lineWidth = 1.5;
    context.strokeRect(wall.x + 1, wall.y + 1, wall.width - 2, wall.height - 2);
  }

  if (manual?.cells.length && selected?.team === 'home') {
    let start = manualRouteStart(state, map, selected, manual.side);
    context.strokeStyle = '#f3cf83'; context.fillStyle = '#f3cf83'; context.lineWidth = 2;
    context.setLineDash([4, 4]);
    for (const [index, cell] of manual.cells.entries()) {
      const route = findPath(map, start, cell, selected.radius);
      context.beginPath();
      route.forEach((point, step) => step ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.stroke();
      const point = cellCenter(map, cell);
      context.strokeRect(point.x - 8, point.y - 8, 16, 16);
      context.font = '12px sans-serif'; context.textAlign = 'center';
      context.fillText(String(index + 1), point.x, point.y - 13);
      start = cell;
    }
    context.setLineDash([]);
    const end = cellCenter(map, manual.cells.at(-1));
    context.beginPath(); context.moveTo(end.x, end.y);
    context.lineTo(end.x + Math.cos(manual.angle) * 42, end.y + Math.sin(manual.angle) * 42);
    context.stroke();
  }

  if (selected?.alive && selected.defenseTask && state.round?.bomb.status !== 'planted') {
    const task = selected.defenseTask;
    const point = task.withdrawn ? task.fallback : task.anchor;
    context.strokeStyle = COLORS[selected.team]; context.lineWidth = 1.5;
    context.setLineDash([4, 5]);
    context.strokeRect(point.x - 80, point.y - 80, 160, 160);
    context.setLineDash([]);
    context.beginPath(); context.arc(point.x, point.y, 7, 0, Math.PI * 2); context.stroke();
    context.fillStyle = COLORS[selected.team]; context.font = '11px sans-serif'; context.textAlign = 'center';
    context.fillText(task.withdrawn ? '후퇴 지점' : task.label, point.x, point.y - 87);
  }

  for (const projectile of state.projectiles ?? []) {
    const progress = Math.min(1, (state.tick - projectile.throwTick) / (projectile.detonateTick - projectile.throwTick));
    const x = projectile.from.x + (projectile.to.x - projectile.from.x) * progress;
    const y = projectile.from.y + (projectile.to.y - projectile.from.y) * progress;
    context.beginPath(); context.moveTo(projectile.from.x, projectile.from.y); context.lineTo(x, y);
    context.strokeStyle = '#c0c9dc'; context.lineWidth = 1; context.stroke();
    context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2);
    context.fillStyle = projectile.kind === 'grenade' ? '#ffb575' : projectile.kind === 'flashbang' ? '#fff5c4' : '#bbc7d7'; context.fill();
  }

  for (const event of state.events) {
    if (event.type === 'utility-detonated' && event.kind !== 'smoke' && state.tick - event.tick <= 8) {
      context.beginPath(); context.arc(event.x, event.y, event.radius, 0, Math.PI * 2);
      context.strokeStyle = event.kind === 'grenade' ? '#ffb575' : '#fff5c4'; context.lineWidth = 2; context.stroke();
      continue;
    }
    if (event.type !== 'shot' || state.tick - event.tick > 4) continue;
    const shooter = state.actors.find(actor => actor.id === event.actorId);
    context.beginPath();
    context.moveTo(event.from.x, event.from.y);
    context.lineTo(event.to.x, event.to.y);
    context.strokeStyle = event.hit ? '#f1dba5' : COLORS[shooter.team];
    context.lineWidth = event.hit ? 2 : 1;
    context.stroke();
  }

  if (state.round) {
    const bomb = state.round.bomb;
    const carrier = state.actors.find(actor => actor.id === bomb.carrierId);
    const x = carrier ? carrier.x : bomb.x;
    const y = carrier ? carrier.y - 24 : bomb.y;
    context.fillStyle = bomb.status === 'defused' ? '#9bbdbf' : '#f3cf83';
    context.beginPath();
    context.moveTo(x, y - 8); context.lineTo(x + 8, y);
    context.lineTo(x, y + 8); context.lineTo(x - 8, y); context.closePath(); context.fill();
    if (bomb.status === 'planted') {
      context.beginPath(); context.arc(x, y, 19, 0, Math.PI * 2);
      context.strokeStyle = '#f3cf83'; context.lineWidth = 2; context.stroke();
    }
  }

  for (const actor of state.actors) {
    if (!actor.alive) {
      context.strokeStyle = COLORS[actor.team];
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(actor.x - 8, actor.y - 8); context.lineTo(actor.x + 8, actor.y + 8);
      context.moveTo(actor.x + 8, actor.y - 8); context.lineTo(actor.x - 8, actor.y + 8);
      context.stroke();
      if (actor.id === selectedId) {
        context.beginPath(); context.arc(actor.x, actor.y, 15, 0, Math.PI * 2);
        context.strokeStyle = '#edf1ff'; context.stroke();
      }
      continue;
    }
    if (actor.id === selectedId || detected.has(actor.id)) {
      context.beginPath();
      context.arc(actor.x, actor.y, actor.radius + 5, 0, Math.PI * 2);
      context.strokeStyle = detected.has(actor.id) ? '#f3dfb0' : '#edf1ff';
      context.lineWidth = 2;
      context.stroke();
    }
    context.beginPath();
    context.arc(actor.x, actor.y, actor.radius, 0, Math.PI * 2);
    context.fillStyle = COLORS[actor.team];
    context.fill();
    if (actor.flashUntilTick > state.tick) {
      context.beginPath(); context.arc(actor.x, actor.y, actor.radius + 8, 0, Math.PI * 2);
      context.strokeStyle = '#fff5c4'; context.lineWidth = 2; context.stroke();
      context.fillStyle = '#fff5c4'; context.font = '10px sans-serif'; context.textAlign = 'center';
      context.fillText('섬광', actor.x, actor.y - 23);
    }
    context.beginPath();
    context.moveTo(actor.x, actor.y);
    context.lineTo(actor.x + Math.cos(actor.facing) * 19, actor.y + Math.sin(actor.facing) * 19);
    context.strokeStyle = COLORS[actor.team];
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#101725';
    context.font = 'bold 12px sans-serif';
    context.textAlign = 'center';
    context.fillText(String(actor.number), actor.x, actor.y + 4);
    if (state.combat) {
      context.fillStyle = '#1d2535'; context.fillRect(actor.x - 13, actor.y + 17, 26, 4);
      context.fillStyle = COLORS[actor.team]; context.fillRect(actor.x - 13, actor.y + 17, 26 * actor.hp / 100, 4);
    }
  }
}
