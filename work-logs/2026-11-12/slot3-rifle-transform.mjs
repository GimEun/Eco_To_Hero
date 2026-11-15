import assert from 'node:assert/strict';
export function transformPreference(source) {
  const anchor = "['training-rifle', 'smg', 'shotgun', 'machine-gun', 'sniper'][actor.number - 1]";
  assert.equal(source.split(anchor).length, 2, 'Slot preference anchor changed');
  return source.replace(anchor, "['training-rifle', 'smg', 'training-rifle', 'machine-gun', 'sniper'][actor.number - 1]");
}
