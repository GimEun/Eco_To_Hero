export const TRAINING_RIFLE = Object.freeze({
  id: 'training-rifle', name: '돌격소총', range: 200,
  damage: 34, intervalTicks: 6, magazineSize: 30, reloadTicks: 40, price: 2700,
});

export const BASIC_PISTOL = Object.freeze({
  id: 'basic-pistol', name: '기본 권총', range: 160,
  damage: 22, intervalTicks: 10, magazineSize: 12, reloadTicks: 30, price: 0,
});

export const WEAPONS = Object.freeze([
  BASIC_PISTOL,
  Object.freeze({ id: 'smg', name: '기관단총', price: 1500, range: 150, damage: 23, intervalTicks: 4, magazineSize: 30, reloadTicks: 36, movingPenalty: 0.07 }),
  Object.freeze({ id: 'machine-gun', name: '기관총', price: 4000, range: 210, damage: 30, intervalTicks: 5, magazineSize: 80, reloadTicks: 80, movingPenalty: 0.28 }),
  TRAINING_RIFLE,
  Object.freeze({ id: 'shotgun', name: '산탄총', price: 1800, range: 120, damage: 80, intervalTicks: 20, magazineSize: 8, reloadTicks: 50 }),
  Object.freeze({ id: 'sniper', name: '저격소총', price: 4750, range: 300, damage: 100, intervalTicks: 32, magazineSize: 5, reloadTicks: 60, movingPenalty: 0.4 }),
]);

export const BODY_ARMOR = Object.freeze({ price: 650, durability: 100, reduction: 0.25 });

export function weaponDamage(weapon, distance) {
  return weapon.id === 'shotgun'
    ? Math.round(weapon.damage * Math.max(0.2, 1 - Math.max(0, distance - 40) / 100))
    : weapon.damage;
}

export function weaponFor(actor) {
  return WEAPONS.find(weapon => weapon.id === actor.weaponId) ?? TRAINING_RIFLE;
}

export const COMBAT_LIMIT_TICKS = 1200;
