import assert from 'node:assert/strict';

export function verifyReactiveChanges(row) {
  let changes = 0;
  assert.equal(row.profile, 'combined');
  const losses = { attack: 0, defense: 0 };
  const plan = { attack: row.choice.attack, defense: row.choice.defense, site: row.choice.site };
  for (let i = 0; i < row.detail.length; i++) {
    const round = row.detail[i];
    assert.equal(round.round, i + 1);
    const role = round.attackTeam === 'home' ? 'attack' : 'defense';
    const decisions = row.homeChanges.filter(change => change.round === i + 1);
    if (losses[role] >= 2) {
      assert.equal(decisions.length, 1); const decision = decisions[0];
      assert.equal(decision.role, role); assert.equal(decision.from, plan[role]);
      const next = role === 'attack' ? plan.attack === 'execute' ? 'split' : 'execute'
        : plan.defense === 'standard' ? 'forward' : 'standard';
      assert.equal(decision.to, next); plan[role] = next;
      if (role === 'attack') {
        assert.equal(decision.previousSite, plan.site); plan.site = plan.site === 'A' ? 'B' : 'A';
        assert.equal(decision.site, plan.site);
      }
      losses[role] = 0; changes++;
    } else assert.equal(decisions.length, 0);
    assert.equal(round.attackPlans.home, plan.attack);
    assert.equal(round.defensePlans.home, plan.defense);
    assert.equal(round.site, role === 'attack' ? plan.site : 'A');
    losses[role] = round.winner === 'home' ? 0 : losses[role] + 1;
    for (const actor of round.gear) assert.ok(actor.cash >= 0 && actor.cash <= 16000);
  }
  assert.equal(row.homeChanges.length, row.homeChanges.filter(change => change.round >= 1 && change.round <= row.rounds).length);
  return changes;
}
