export type WorldPoint = readonly [number, number];

export const GAME_PALETTE = { meadow: "#B9D984", pond: "#7DB4DB", sun: "#F2CE68", coral: "#ED927E", lilac: "#B3A0D8" };

// Geometry belongs to this one local garden; there is no world builder or SDK here.
const shoreline: readonly WorldPoint[] = [[72,48],[144,16],[240,0],[384,8],[480,48],[544,104],[576,176],[560,248],[512,312],[432,360],[304,384],[176,376],[80,336],[24,272],[0,192],[16,112]];
const obstacles = [
  { x: 70, y: 258, w: 128, h: 64 },
  { x: 396, y: 233, w: 48, h: 34 },
  { x: 366, y: 101, w: 48, h: 34 },
  { x: 138, y: 84, w: 12, h: 12 },
  { x: 446, y: 104, w: 12, h: 12 },
  { x: 315, y: 50, w: 50, h: 16 },
];

export function project(x: number, y: number): [number, number] {
  return [800 + 1.2990381057 * (x - y - 96), 690 + 0.42 * (x + y - 480)];
}

export function unproject(x: number, y: number): [number, number] {
  const difference = (x - 800) / 1.2990381057 + 96;
  const sum = (y - 690) / 0.42 + 480;
  return [(sum + difference) / 2, (sum - difference) / 2];
}

export function isWalkable([x, y]: WorldPoint) {
  let inside = false;
  for (let i = 0, j = shoreline.length - 1; i < shoreline.length; j = i++) {
    const [ax, ay] = shoreline[i], [bx, by] = shoreline[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) < 7) return false;
  }
  return inside && !obstacles.some(rect => {
    const nearX = Math.max(rect.x, Math.min(rect.x + rect.w, x));
    const nearY = Math.max(rect.y, Math.min(rect.y + rect.h, y));
    return Math.hypot(x - nearX, y - nearY) <= 7;
  });
}

export function createNavigator() {
  const spacing = 8, columns = 73, rows = 49, count = columns * rows;
  const point = (index: number): WorldPoint => [(index % columns) * spacing, Math.floor(index / columns) * spacing];
  const valid = Array.from({ length: count }, (_, index) => isWalkable(point(index)));
  const distance = (a: WorldPoint, b: WorldPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function segmentClear(from: WorldPoint, to: WorldPoint) {
    const steps = Math.max(1, Math.ceil(distance(from, to) / 2));
    for (let i = 0; i <= steps; i++) {
      if (!isWalkable([from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps])) return false;
    }
    return true;
  }

  function nearby(location: WorldPoint) {
    const result: number[] = [];
    const cx = Math.round(location[0] / spacing), cy = Math.round(location[1] / spacing);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy, index = y * columns + x;
      if (x >= 0 && x < columns && y >= 0 && y < rows && valid[index] && segmentClear(location, point(index))) result.push(index);
    }
    return result;
  }

  function route(from: WorldPoint, to: WorldPoint): WorldPoint[] | null {
    if (!isWalkable(from) || !isWalkable(to)) return null;
    if (segmentClear(from, to)) return [to];
    const starts = nearby(from), ends = new Set(nearby(to));
    const parents = new Int32Array(count).fill(-1), costs = new Float64Array(count).fill(Infinity);
    const open = new Set(starts), closed = new Set<number>();
    for (const index of starts) costs[index] = distance(from, point(index));
    let reached = -1;
    while (open.size) {
      let current = -1, best = Infinity;
      for (const index of open) {
        const score = costs[index] + distance(point(index), to);
        if (score < best) { best = score; current = index; }
      }
      if (ends.has(current)) { reached = current; break; }
      open.delete(current); closed.add(current);
      const x = current % columns, y = Math.floor(current / columns);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= columns || y + dy < 0 || y + dy >= rows) continue;
        const next = (y + dy) * columns + x + dx;
        const cost = costs[current] + spacing * Math.hypot(dx, dy);
        if (!valid[next] || closed.has(next) || cost >= costs[next] || !segmentClear(point(current), point(next))) continue;
        parents[next] = current; costs[next] = cost; open.add(next);
      }
    }
    if (reached < 0) return null;
    const path: WorldPoint[] = [to];
    for (let index = reached; index !== -1; index = parents[index]) path.unshift(point(index));
    const simplified: WorldPoint[] = [];
    let anchor = from;
    for (let index = 0; index < path.length;) {
      let last = path.length - 1;
      while (last > index && !segmentClear(anchor, path[last])) last--;
      simplified.push(path[last]); anchor = path[last]; index = last + 1;
    }
    return simplified;
  }

  return { route, segmentClear };
}
