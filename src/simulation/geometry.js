export function wallRectangles(map) {
  return map.walls.map(wall => ({
    x: wall.x * map.tileSize, y: wall.y * map.tileSize,
    width: wall.width * map.tileSize, height: wall.height * map.tileSize,
  }));
}

export function cellCenter(map, cell) {
  return { x: (cell.x + 0.5) * map.tileSize, y: (cell.y + 0.5) * map.tileSize };
}

export function reachedDestination(actor, point) {
  return Math.hypot(actor.x - point.x, actor.y - point.y) <= 6
    || Boolean(actor.arrived && actor.crowdedGoal && Math.hypot(actor.crowdedGoal.x - point.x, actor.crowdedGoal.y - point.y) < 1e-7);
}

export function canOccupy(map, x, y, radius = 10, walls = null) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false;
  if (x - radius < 0 || y - radius < 0 || x + radius > map.columns * map.tileSize || y + radius > map.rows * map.tileSize) return false;
  return !(walls ?? wallRectangles(map)).some(wall => {
    const nearX = Math.max(wall.x, Math.min(x, wall.x + wall.width));
    const nearY = Math.max(wall.y, Math.min(y, wall.y + wall.height));
    return (x - nearX) ** 2 + (y - nearY) ** 2 <= radius ** 2;
  });
}

export function moveWithCollision(map, actor, target) {
  const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, actor.radius / 2)));
  let position = { x: actor.x, y: actor.y };
  for (let index = 1; index <= steps; index++) {
    const x = actor.x + (target.x - actor.x) * index / steps;
    const y = actor.y + (target.y - actor.y) * index / steps;
    if (!canOccupy(map, x, y, actor.radius)) break;
    position = { x, y };
  }
  return position;
}

export function findPath(map, start, goal, radius = 10, obstacles = []) {
  let walls = null;
  const valid = cell => {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)
      || cell.x < 0 || cell.y < 0 || cell.x >= map.columns || cell.y >= map.rows) return false;
    const point = cellCenter(map, cell);
    return canOccupy(map, point.x, point.y, radius, walls) && (cell.x === start.x && cell.y === start.y
      || obstacles.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= radius + other.radius + 2));
  };
  if (!valid(start) || !valid(goal)) return [];
  walls = wallRectangles(map);
  const key = cell => cell.y * map.columns + cell.x;
  const queue = [start];
  const previous = new Map([[key(start), null]]);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (key(current) === key(goal)) {
      const path = [];
      for (let cell = current; cell; cell = previous.get(key(cell))) path.unshift(cellCenter(map, cell));
      return path;
    }
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (previous.has(key(next)) || !valid(next)) continue;
      previous.set(key(next), current);
      queue.push(next);
    }
  }
  return [];
}

export function rayDistance(map, origin, angle, range, walls = null) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let nearest = range;
  for (const wall of walls ?? wallRectangles(map)) {
    let near = 0;
    let far = range;
    for (let axis = 0; axis < 2; axis++) {
      const position = axis === 0 ? origin.x : origin.y;
      const direction = axis === 0 ? dx : dy;
      const min = axis === 0 ? wall.x : wall.y;
      const max = min + (axis === 0 ? wall.width : wall.height);
      if (Math.abs(direction) < 1e-10) {
        if (position < min || position > max) { far = -1; break; }
      } else {
        const a = (min - position) / direction;
        const b = (max - position) / direction;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
    }
    if (near <= far && far >= 0) nearest = Math.min(nearest, near);
  }
  return nearest;
}

const relativeAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function sightRange(observer, state = null) {
  return observer.viewRange * (state && observer.flashUntilTick > state.tick ? 1 - 0.65 * (observer.flashStrength ?? 1) : 1);
}

export function sightDistance(map, observer, angle, state = null, walls = null) {
  let distance = rayDistance(map, observer, angle, sightRange(observer, state), walls);
  for (const smoke of state?.smokes ?? []) {
    if (smoke.expiresTick <= state.tick) continue;
    const dx = smoke.x - observer.x, dy = smoke.y - observer.y;
    const projection = dx * Math.cos(angle) + dy * Math.sin(angle);
    const perpendicularSquared = dx * dx + dy * dy - projection * projection;
    if (perpendicularSquared > smoke.radius ** 2) continue;
    const halfChord = Math.sqrt(Math.max(0, smoke.radius ** 2 - perpendicularSquared));
    if (projection + halfChord < 0) continue;
    // 연막은 먼 시야를 가리지만 바로 앞의 접촉 교전까지 없애지 않는다. 벽은 기존 거리로 차단한다.
    distance = Math.min(distance, Math.max(32, projection - halfChord));
  }
  return distance;
}

export function canSee(map, observer, target, state = null) {
  const distance = Math.hypot(target.x - observer.x, target.y - observer.y);
  if (distance < 1e-9) return true;
  if (distance > sightRange(observer, state)) return false;
  const angle = Math.atan2(target.y - observer.y, target.x - observer.x);
  if (Math.abs(relativeAngle(angle - observer.facing)) > observer.fieldOfView / 2 + 1e-9) return false;
  return distance <= sightDistance(map, observer, angle, state) + 1e-9;
}

export function visionPolygon(map, observer, state = null) {
  const half = observer.fieldOfView / 2;
  const offsets = Array.from({ length: 33 }, (_, index) => -half + index * half * 2 / 32);
  const walls = wallRectangles(map);
  // 벽 모서리 양쪽을 포함해 시야 경계가 벽을 가로질러 이어지지 않게 한다.
  for (const wall of walls) {
    for (const x of [wall.x, wall.x + wall.width]) for (const y of [wall.y, wall.y + wall.height]) {
      const offset = relativeAngle(Math.atan2(y - observer.y, x - observer.x) - observer.facing);
      for (const value of [offset - 1e-7, offset, offset + 1e-7]) if (value >= -half && value <= half) offsets.push(value);
    }
  }
  return offsets.sort((a, b) => a - b).map(offset => {
    const angle = observer.facing + offset;
    const distance = sightDistance(map, observer, angle, state, walls);
    return { x: observer.x + Math.cos(angle) * distance, y: observer.y + Math.sin(angle) * distance };
  });
}
