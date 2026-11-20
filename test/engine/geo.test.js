import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineM, bearingDeg, angleDiffDeg, destinationPoint, normDeg } from '../../src/engine/geo.js';

test('haversineM：赤道 1 度經度約 111.2 km、同點為 0', () => {
  assert.ok(Math.abs(haversineM(0, 0, 0, 1) - 111195) < 10);
  assert.equal(haversineM(24.18, 120.6, 24.18, 120.6), 0);
});

test('bearingDeg：正北 0、正東 90、正南 180、正西 270', () => {
  assert.ok(Math.abs(bearingDeg(24, 120, 24.01, 120) - 0) < 0.01);
  assert.ok(Math.abs(bearingDeg(24, 120, 24, 120.01) - 90) < 0.01);
  assert.ok(Math.abs(bearingDeg(24, 120, 23.99, 120) - 180) < 0.01);
  assert.ok(Math.abs(bearingDeg(24, 120, 24, 119.99) - 270) < 0.01);
});

test('angleDiffDeg：跨 0 度與對向', () => {
  assert.equal(angleDiffDeg(350, 10), 20);
  assert.equal(angleDiffDeg(10, 350), 20);
  assert.equal(angleDiffDeg(0, 180), 180);
  assert.equal(angleDiffDeg(-90, 270), 0);
  assert.equal(normDeg(-30), 330);
});

test('destinationPoint 與 haversine／bearing 互為反函數', () => {
  for (const b of [0, 45, 90, 180, 271]) {
    const p = destinationPoint(24.186693, 120.61284, b, 300);
    assert.ok(Math.abs(haversineM(24.186693, 120.61284, p.lat, p.lon) - 300) < 0.01);
    assert.ok(angleDiffDeg(bearingDeg(24.186693, 120.61284, p.lat, p.lon), b) < 0.01);
  }
});
