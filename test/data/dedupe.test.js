import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupe, distanceM } from '../../src/data/dedupe.js';
import { validate } from '../../src/data/validate.js';

const cfg = { data: { dedupeDistanceM: 15, dedupeBearingDeg: 30 } };
const cam = (o) => {
  const bearings = o.bearings ?? [];
  return {
    id: o.id ?? Math.random().toString(36), lat: 24.18, lon: 120.6, bearings,
    bidirectional: false, directionKnown: bearings.length > 0, limit: 50, roadClass: 'urban',
    interval: false, source: 'npa7320', address: '', city: '臺中市', region: '', rawDirect: '', ...o,
  };
};
// 0.0001° 緯度 ≈ 11.1 m
const near = { lat: 24.18009 };

test('distanceM 合理', () => {
  assert.ok(Math.abs(distanceM(24, 120, 24.001, 120) - 111.2) < 1);
});

test('同座標相反方向不是重複', () => {
  const r = dedupe([cam({ bearings: [0] }), cam({ bearings: [180] })], cfg);
  assert.equal(r.cameras.length, 2);
  assert.equal(r.removed, 0);
});

test('同座標同方向為重複', () => {
  const r = dedupe([cam({ bearings: [90] }), cam({ bearings: [90] })], cfg);
  assert.equal(r.cameras.length, 1);
  assert.equal(r.removed, 1);
});

test('方向差在門檻內（≤30°）為重複，超過不是', () => {
  assert.equal(dedupe([cam({ bearings: [90] }), cam({ ...near, bearings: [110] })], cfg).cameras.length, 1);
  assert.equal(dedupe([cam({ bearings: [90] }), cam({ ...near, bearings: [135] })], cfg).cameras.length, 2);
});

test('距離超過 15 m 不是重複', () => {
  assert.equal(dedupe([cam({ bearings: [90] }), cam({ lat: 24.1802, bearings: [90] })], cfg).cameras.length, 2);
});

test('任一方方向未知 → 視為同一點，保留較完整者', () => {
  const unknown = cam({ id: 'u', limit: 50 });
  const known = cam({ id: 'k', ...near, bearings: [90], limit: 50 });
  const r = dedupe([unknown, known], cfg);
  assert.deepEqual(r.cameras.map((c) => c.id), ['k']);
});

test('有 limit 優先於有方向', () => {
  const a = cam({ id: 'a', bearings: [90], limit: null });
  const b = cam({ id: 'b', ...near, bearings: [90], limit: 60 });
  assert.deepEqual(dedupe([a, b], cfg).cameras.map((c) => c.id), ['b']);
});

test('雙向 [0,180] 與單向 0 同點 → 重複', () => {
  const bi = cam({ id: 'bi', bearings: [0, 180], bidirectional: true });
  const one = cam({ id: 'one', bearings: [0] });
  assert.equal(dedupe([bi, one], cfg).cameras.length, 1);
});

test('輸出維持原始順序', () => {
  const list = [cam({ id: 'x', lat: 24.1, bearings: [0] }), cam({ id: 'y', lat: 24.2, bearings: [0] }), cam({ id: 'z', lat: 24.3, bearings: [0] })];
  assert.deepEqual(dedupe(list, cfg).cameras.map((c) => c.id), ['x', 'y', 'z']);
});

test('validate 統計', () => {
  const list = [
    cam({ city: '臺中市', limit: null }),
    cam({ lat: 24.2, city: '臺北市', bearings: [90], interval: true }),
    cam({ lat: 99, city: '臺北市' }), // 無效座標
  ];
  const { cameras, stats } = validate(list, { total: 5, dropped: 1, deduped: 0 });
  assert.equal(cameras.length, 2);
  assert.deepEqual(stats, {
    total: 5, kept: 2, dropped: 2, deduped: 0,
    byCity: { 臺中市: 1, 臺北市: 1 }, limitMissing: 1, directionUnknown: 1, interval: 1,
  });
});

test('validate 無 meta 時 total 由內容推得', () => {
  assert.equal(validate([cam({})]).stats.total, 1);
});
