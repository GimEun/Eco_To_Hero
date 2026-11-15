import assert from 'node:assert/strict';
import { weaponFor } from '../../src/data/weapons.js';
const audits = new WeakMap();
export function transformDefenseRange(source, auditURL) {
  const anchor = 'target.team !== actor.team && canSee(map, actor, target, state));';
  assert.equal(source.split(anchor).length, 2, 'Defense enemies anchor changed');
  source = source.replace(anchor, 'target.team !== actor.team && canSee(map, actor, target, state)\n    && Math.hypot(actor.x - target.x, actor.y - target.y) <= weaponFor(actor).range);');
  const condition = '  if (actor.hp <= 45 || task.role ===';
  assert.equal(source.split(condition).length, 2, 'Defense withdrawal anchor changed');
  source = source.replace(condition, '  recordRangeGuard(state, actor, enemies, support);\n' + condition);
  return `import { recordRangeGuard } from ${JSON.stringify(auditURL)};\n` + source;
}
export function recordRangeGuard(state, actor, enemies, support) {
  const task = actor.defenseTask;
  if (task.withdrawn || !(actor.hp <= 45 || task.role === 'front' && task.plan === 'forward' && enemies.length >= 2 && enemies.length > support)) return;
  if (!audits.has(state)) audits.set(state, new Map());
  const number = state.economy.roundNumber;
  if (!audits.get(state).has(number)) audits.get(state).set(number, []);
  audits.get(state).get(number).push({ tick: state.tick, actorId: actor.id, team: actor.team, hp: actor.hp,
    role: task.role, plan: task.plan, reason: actor.hp <= 45 ? 'low-hp' : 'outnumbered', support,
    range: weaponFor(actor).range, enemies: enemies.map(enemy => ({ id: enemy.id, distance: Math.hypot(actor.x - enemy.x, actor.y - enemy.y) })) });
}
export function rangeGuardSummary(state) {
  return structuredClone(audits.get(state)?.get(state.economy.roundNumber) ?? []);
}
