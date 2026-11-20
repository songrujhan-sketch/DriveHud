import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../../config.js';
import { runPipeline } from '../../src/data/pipeline.js';

const csv = await readFile(new URL('../../data/snapshots/npa7320-taichung.csv', import.meta.url), 'utf8');

test('臺中 192 筆子集：統計', () => {
  const r = runPipeline(csv, CONFIG);
  assert.equal(r.ok, true);
  assert.equal(r.stats.total, 192);
  assert.equal(r.stats.kept, 192);
  assert.equal(r.stats.dropped, 0);
  assert.deepEqual(r.stats.byCity, { 臺中市: 192 });
  assert.equal(r.stats.directionUnknown, 7);
  assert.equal(r.stats.interval, 2);
  assert.equal(r.stats.limitMissing, 0);
});

test('§8.1 命中點方向（direct = 車流前進方向）', () => {
  const { cameras } = runPipeline(csv, CONFIG);
  const near = (lat, lon) => cameras.find((c) => Math.abs(c.lat - lat) < 1e-6 && Math.abs(c.lon - lon) < 1e-6);
  assert.deepEqual(near(24.18653, 120.60414).bearings, [0]);   // 東大路一段，南向北
  assert.deepEqual(near(24.186693, 120.61284).bearings, [90]); // 福科路，西向東
  assert.deepEqual(near(24.129442, 120.619804).bearings, [0, 180]); // 中彰快速道路
  assert.equal(near(24.129442, 120.619804).roadClass, 'expressway');
});

test('所有 id 唯一', () => {
  const { cameras } = runPipeline(csv, CONFIG);
  assert.equal(new Set(cameras.map((c) => c.id)).size, cameras.length);
});

test('directSemantics=facing 時方向反轉', () => {
  const cfg = { ...CONFIG, data: { ...CONFIG.data, directSemantics: 'facing' } };
  const { cameras } = runPipeline(csv, cfg);
  const c = cameras.find((x) => Math.abs(x.lat - 24.186693) < 1e-6 && Math.abs(x.lon - 120.61284) < 1e-6);
  assert.deepEqual(c.bearings, [270]);
});
