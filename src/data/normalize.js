import { parseDirect } from './direct.js';

export const TAIWAN_BOUNDS = { latMin: 21, latMax: 26.5, lonMin: 118, lonMax: 122.5 };

const EXPRESSWAY_RE = /快速道路|快速公路|[台臺]6\d線|[台臺]7\d線|國道|高架|交流道/;

export function inferRoadClass(address) {
  const a = typeof address === 'string' ? address.trim() : '';
  if (!a) return 'unknown';
  return EXPRESSWAY_RE.test(a) ? 'expressway' : 'urban';
}

function toNumber(v) {
  if (v == null) return NaN;
  const s = String(v).trim();
  if (s === '') return NaN;
  return Number(s);
}

export function validCoord(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= TAIWAN_BOUNDS.latMin && lat <= TAIWAN_BOUNDS.latMax &&
    lon >= TAIWAN_BOUNDS.lonMin && lon <= TAIWAN_BOUNDS.lonMax;
}

/** 穩定 ID：`${source}|${lat6}|${lon6}|${bearingKey}`（與 types.js 一致） */
export function makeId(camera) {
  const bearingKey = camera.bearings?.length
    ? camera.bearings.join('-')
    : (camera.bidirectional ? 'bi' : 'na');
  return `${camera.source}|${camera.lat.toFixed(6)}|${camera.lon.toFixed(6)}|${bearingKey}`;
}

/**
 * 原始列 → Camera；座標無效回傳 null（呼叫端計入 dropped）。
 * limit 非數字（或 ≤ 0）→ null。
 */
export function toCamera(row, source = 'npa7320', config) {
  const lat = toNumber(row.Latitude);
  const lon = toNumber(row.Longitude);
  if (!validCoord(lat, lon)) return null;
  const limitNum = toNumber(row.limit);
  const limit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : null;
  const rawDirect = String(row.direct ?? '').trim();
  const d = parseDirect(rawDirect, config);
  const address = String(row.Address ?? '').trim();
  const camera = {
    id: '',
    lat,
    lon,
    bearings: d.bearings,
    bidirectional: d.bidirectional,
    directionKnown: d.bearings.length > 0,
    limit,
    roadClass: inferRoadClass(address),
    interval: d.interval,
    source,
    address,
    city: String(row.CityName ?? '').trim(),
    region: String(row.RegionName ?? '').trim(),
    rawDirect,
  };
  camera.id = makeId(camera);
  return camera;
}

/** 批次轉換，回傳 { cameras, dropped } */
export function normalizeRows(rows, source, config) {
  const cameras = [];
  let dropped = 0;
  for (const row of rows) {
    const c = toCamera(row, source, config);
    if (c) cameras.push(c); else dropped++;
  }
  return { cameras, dropped };
}
