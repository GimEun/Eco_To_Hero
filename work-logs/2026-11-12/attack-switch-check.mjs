import assert from 'node:assert/strict';
import { policies } from './attack-switch-transform.mjs';
export function verifyPolicy(row, policy) {
  assert.ok(policies.includes(policy)); assert.equal(row.profile, 'combined');
  const losses = { attack: 0, defense: 0 };
  const plan = { attack: row.choice.attack, defense: row.choice.defense, site: row.choice.site };
  let changes = 0;
  for (let i = 0; i < row.detail.length; i++) {
    const round = row.detail[i]; assert.equal(round.round, i + 1);
    const role = round.attackTeam === 'home' ? 'attack' : 'defense';
    const decisions = row.homeChanges.filter(change => change.round === i + 1);
    if (losses[role] >= 2) {
      if (role === 'attack' && policy === 'none') assert.equal(decisions.length, 0);
      else {
        assert.equal(decisions.length, 1); const change = decisions[0];
        assert.equal(change.role, role); assert.equal(change.from, plan[role]);
        if (role === 'defense') plan.defense = plan.defense === 'standard' ? 'forward' : 'standard';
        else {
          assert.equal(change.previousSite, plan.site);
          if (policy !== 'site') plan.attack = plan.attack === 'execute' ? 'split' : 'execute';
          if (policy !== 'tactic') plan.site = plan.site === 'A' ? 'B' : 'A';
          assert.equal(change.site, plan.site);
        }
        assert.equal(change.to, plan[role]); changes++;
      }
      losses[role] = 0;
    } else assert.equal(decisions.length, 0);
    assert.equal(round.attackPlans.home, plan.attack); assert.equal(round.defensePlans.home, plan.defense);
    assert.equal(round.site, role === 'attack' ? plan.site : 'A');
    losses[role] = round.winner === 'home' ? 0 : losses[role] + 1;
  }
  assert.equal(row.homeChanges.length, changes);
  return changes;
}
