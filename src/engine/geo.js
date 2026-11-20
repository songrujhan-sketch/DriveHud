// DriveHUD V1.6 — 幾何工具（純函式，WGS84 球面近似）
export const EARTH_RADIUS_M = 6371008.8;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** 正規化到 [0, 360) */
export function normDeg(d) {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** 兩點大圓距離（公尺） */
export function haversineM(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 起點到終點的初始方位角（度，0=北，順時針，[0,360)） */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normDeg(Math.atan2(y, x) * DEG);
}

/** 兩角度的最小夾角（度，[0,180]） */
export function angleDiffDeg(a, b) {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return d > 180 ? 360 - d : d;
}

/** 由起點沿方位角前進 distanceM 後的座標 */
export function destinationPoint(lat, lon, bearing, distanceM) {
  const d = distanceM / EARTH_RADIUS_M;
  const th = bearing * RAD;
  const p1 = lat * RAD, l1 = lon * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1),
    Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * DEG, lon: ((l2 * DEG + 540) % 360) - 180 };
}

/** 以中心點與半徑求簡易經緯度 bounding box（預篩用，略大於實際圓） */
export function boundingBox(lat, lon, radiusM) {
  const dLat = (radiusM / EARTH_RADIUS_M) * DEG;
  const cos = Math.max(0.01, Math.cos(lat * RAD));
  const dLon = dLat / cos;
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}
