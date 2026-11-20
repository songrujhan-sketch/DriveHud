// 讀 data/snapshots/*.csv → 正規化 → 去重 → 輸出 data/snapshots/cameras.json 與 stats.json
// 用法：node scripts/build-snapshot.mjs
// 若存在全國完整檔 npa7320.csv，就只用它（臺中子集視為其子集，略過）。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { detectFormatDetail, parseNpa7320 } from '../src/data/parsers.js';
import { normalizeRows } from '../src/data/normalize.js';
import { dedupe } from '../src/data/dedupe.js';
import { validate } from '../src/data/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'snapshots');

let files = readdirSync(dir).filter((f) => f.endsWith('.csv')).sort();
if (files.includes('npa7320.csv')) files = files.filter((f) => f !== 'npa7320-taichung.csv');

const rows = [];
const used = [];
for (const f of files) {
  const text = readFileSync(path.join(dir, f), 'utf8');
  const { format, reason } = detectFormatDetail(text);
  if (format !== 'npa7320') { console.warn(`略過 ${f}：${reason}`); continue; }
  const r = parseNpa7320(text);
  rows.push(...r);
  used.push({ file: f, rows: r.length });
}
if (rows.length === 0) { console.error('找不到可用的 7320 CSV'); process.exit(1); }

const { cameras: norm, dropped } = normalizeRows(rows, 'npa7320', CONFIG);
const { cameras: uniq, removed } = dedupe(norm, CONFIG);
const { cameras, stats } = validate(uniq, { total: rows.length, dropped, deduped: removed });

let fetchedAt = null;
const metaPath = path.join(dir, 'META.json');
if (existsSync(metaPath)) {
  try { fetchedAt = JSON.parse(readFileSync(metaPath, 'utf8')).npa7320?.fetchedAt ?? null; } catch { /* ignore */ }
}

const dataset = { source: 'npa7320', origin: 'bundled', fetchedAt, files: used, stats, cameras };
writeFileSync(path.join(dir, 'cameras.json'), JSON.stringify(dataset));
writeFileSync(path.join(dir, 'stats.json'), JSON.stringify({ source: 'npa7320', fetchedAt, files: used, ...stats }, null, 2) + '\n');
console.log(JSON.stringify({ files: used, ...stats }, null, 2));
