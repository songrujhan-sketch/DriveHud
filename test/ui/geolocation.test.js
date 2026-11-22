import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeoSource } from '../../src/adapters/geolocation.js';

test('瀏覽器無 geolocation API 時回報 UNSUPPORTED', () => {
  const statuses = [];
  const geo = createGeoSource({ navigatorImpl: {} });
  geo.start(() => {}, (s) => statuses.push(s));
  assert.deepEqual(statuses, ['UNSUPPORTED']);
});

test('watchPosition 錯誤碼 1/2/3 分別回報 DENIED、UNAVAILABLE、TIMEOUT', () => {
  const statuses = [];
  let onErr = null;
  let cleared = null;
  const geo = createGeoSource({
    navigatorImpl: {
      geolocation: {
        watchPosition(_ok, err) { onErr = err; return 42; },
        clearWatch(id) { cleared = id; },
      },
    },
  });
  geo.start(() => {}, (s) => statuses.push(s));
  onErr({ code: 1 });
  onErr({ code: 2 });
  onErr({ code: 3 });
  geo.stop();
  // stop 後的延遲錯誤回呼應被忽略
  onErr({ code: 3 });
  assert.deepEqual(statuses, ['SEARCHING', 'DENIED', 'UNAVAILABLE', 'TIMEOUT']);
  assert.equal(cleared, 42);
});
