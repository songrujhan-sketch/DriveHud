// 回歸（PR #8 審查 P2-01）：初始載入、重新載入與匯入之間的時序。較早發出、較晚完成的載入
// 不論成功或失敗，都不能蓋掉較新的資料或把正常狀態改成 error。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDataLoader } from '../../src/ui/data-loader.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness() {
  const pending = [];
  const log = [];
  let state = { state: 'idle', cameras: null };
  const loader = createDataLoader({
    load: () => { const d = deferred(); pending.push(d); return d.promise; },
    onLoading: () => { state = { state: 'loading', cameras: null }; log.push('loading'); },
    onData: ({ cameras }) => { state = { state: cameras.length ? 'ready' : 'empty', cameras }; log.push(`data:${cameras.length}`); },
    onError: () => { state = { state: 'error', cameras: null }; log.push('error'); },
  });
  return { loader, pending, log, get state() { return state; } };
}
const cams = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));

test('一般載入：成功 → ready；失敗 → error；0 筆 → empty', async () => {
  const h = harness();
  const p1 = h.loader.reload(); h.pending[0].resolve({ cameras: cams(3) });
  assert.equal(await p1, 'ok'); assert.equal(h.state.state, 'ready');
  const p2 = h.loader.reload(); h.pending[1].reject(new Error('net'));
  assert.equal(await p2, 'error'); assert.equal(h.state.state, 'error');
  const p3 = h.loader.reload(); h.pending[2].resolve({ cameras: [] });
  assert.equal(await p3, 'ok'); assert.equal(h.state.state, 'empty');
});

test('舊載入晚於匯入完成：保留匯入的新資料', async () => {
  const h = harness();
  const initial = h.loader.reload();
  h.loader.push({ cameras: cams(5) });              // 使用者匯入
  h.pending[0].resolve({ cameras: cams(1900) });     // 內建快照這時才回來
  assert.equal(await initial, 'stale');
  assert.equal(h.state.state, 'ready');
  assert.equal(h.state.cameras.length, 5);
  assert.deepEqual(h.log, ['loading', 'data:5']);
});

test('舊載入在匯入後才失敗：不影響新資料與 ready 狀態', async () => {
  const h = harness();
  const initial = h.loader.reload();
  h.loader.push({ cameras: cams(5) });
  h.pending[0].reject(new Error('timeout'));
  assert.equal(await initial, 'stale');
  assert.equal(h.state.state, 'ready');
  assert.equal(h.state.cameras.length, 5);
  assert.ok(!h.log.includes('error'));
});

test('連按重新載入：先發的較晚完成時被丟棄，以最後一次為準', async () => {
  const h = harness();
  const first = h.loader.reload();
  const second = h.loader.reload();
  h.pending[1].resolve({ cameras: cams(7) });
  assert.equal(await second, 'ok');
  h.pending[0].reject(new Error('late failure'));
  assert.equal(await first, 'stale');
  assert.equal(h.state.state, 'ready');
  assert.equal(h.state.cameras.length, 7);
});

test('匯入之後再按重新載入：新的載入照常套用', async () => {
  const h = harness();
  h.loader.push({ cameras: cams(5) });
  const p = h.loader.reload();
  h.pending[0].resolve({ cameras: cams(9) });
  assert.equal(await p, 'ok');
  assert.equal(h.state.cameras.length, 9);
});
