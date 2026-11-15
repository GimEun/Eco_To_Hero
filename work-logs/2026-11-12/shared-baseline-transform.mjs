import assert from 'node:assert/strict';
export function includeFixedProfile(source) {
  const anchor = "for (const profile of ['combined']) {";
  assert.equal(source.split(anchor).length, 2, 'Baseline profile loop changed');
  return source.replace(anchor, "for (const profile of ['fixed', 'combined']) {");
}
