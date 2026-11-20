// STUB：讀取 data/snapshots/npa7320-taichung.csv，回傳少量 Camera。整合時由 src/data/ 取代。
const DIRS = { 北: 0, 東北: 45, 東: 90, 東南: 135, 南: 180, 西南: 225, 西: 270, 西北: 315 };
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
function parseDirect(raw) {
  const s = (raw || '').trim();
  const m = s.match(/(東北|東南|西北|西南|北|南|東|西)(?:向|往)(東北|東南|西北|西南|北|南|東|西)/);
  if (m) return { bearings: [DIRS[m[2]]], bidirectional: false };
  if (/南北/.test(s)) return { bearings: [0, 180], bidirectional: true };
  if (/東西/.test(s)) return { bearings: [90, 270], bidirectional: true };
  return { bearings: [], bidirectional: /雙向/.test(s) };
}
export async function loadBundledSnapshot() {
  const url = new URL('../../../data/snapshots/npa7320-taichung.csv', import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('snapshot ' + res.status);
  const lines = (await res.text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(2);
  const cams = [];
  for (const line of lines) {
    const [city, region, address, , , lon, lat, direct, limit] = splitCsv(line);
    const la = Number(lat), lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
    const d = parseDirect(direct);
    const lim = Number(limit);
    cams.push({
      id: `npa7320|${la.toFixed(6)}|${lo.toFixed(6)}|${d.bearings.join('-')}`,
      lat: la, lon: lo, bearings: d.bearings, bidirectional: d.bidirectional,
      directionKnown: d.bearings.length > 0, limit: Number.isFinite(lim) && limit.trim() !== '' ? lim : null,
      roadClass: /快速道路|國道|高架/.test(address) ? 'expressway' : 'urban', interval: /區間/.test(direct),
      source: 'npa7320', address, city, region, rawDirect: direct,
    });
    if (cams.length >= 40) break;
  }
  return cams;
}
