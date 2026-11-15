export const THROWABLES = Object.freeze([
  Object.freeze({ id: 'flashbang', name: '섬광탄', price: 200, radius: 100, delayTicks: 12, durationTicks: 40 }),
  Object.freeze({ id: 'grenade', name: '수류탄', price: 300, radius: 70, delayTicks: 20, damage: 50 }),
  Object.freeze({ id: 'smoke', name: '연막탄', price: 300, radius: 70, delayTicks: 12, durationTicks: 240 }),
]);

export function emptyThrowables() {
  return Object.fromEntries(THROWABLES.map(item => [item.id, 0]));
}
