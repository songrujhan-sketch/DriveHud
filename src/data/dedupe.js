// 去重：座標距離 ≤ dedupeDistanceM 且（雙方方向已知且最接近 bearing 差 ≤ dedupeBearingDeg，或任一方方向未知）。
// 保留資訊較完整者（有 limit、有方向優先）。同座標不同方向（差 > 門檻）不是重複。

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function distanceM(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function angDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function minBearingDiff(a, b) {
  let m = 180;
  for (const x of a.bearings) for (const y of b.bearings) m = Math.min(m, angDiff(x, y));
  return m;
}

function score(c) {
  return (c.limit != null ? 2 : 0) + (c.directionKnown ? 1 : 0);
}

export function isDuplicate(a, b, config) {
  const maxDist = config?.data?.dedupeDistanceM ?? 15;
  const maxBear = config?.data?.dedupeBearingDeg ?? 30;
  if (distanceM(a.lat, a.lon, b.lat, b.lon) > maxDist) return false;
  if (!a.directionKnown || !b.directionKnown) return true;
  return minBearingDiff(a, b) <= maxBear;
}

/** @returns {{cameras: object[], removed: number}} 輸出維持原始順序 */
export function dedupe(cameras, config) {
  const cell = 0.001; // 約 100 m 格網，足以涵蓋 15 m 門檻
  const order = cameras.map((c, i) => i).sort((i, j) => score(cameras[j]) - score(cameras[i]) || i - j);
  const grid = new Map();
  const keep = new Set();
  const cellOf = (c) => [Math.floor(c.lat / cell), Math.floor(c.lon / cell)];
  for (const idx of order) {
    const c = cameras[idx];
    const [cy, cx] = cellOf(c);
    let dup = false;
    outer:
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = grid.get(`${cy + dy},${cx + dx}`);
        if (!list) continue;
        for (const k of list) {
          if (isDuplicate(c, cameras[k], config)) { dup = true; break outer; }
        }
      }
    }
    if (dup) continue;
    keep.add(idx);
    const key = `${cy},${cx}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(idx);
  }
  const out = cameras.filter((_, i) => keep.has(i));
  return { cameras: out, removed: cameras.length - out.length };
}
