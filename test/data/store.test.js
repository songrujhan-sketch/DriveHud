import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { saveDataset, loadDataset, createStore, loadBundledSnapshot } from '../../src/data/store.js';
import { readFile } from 'node:fs/promises';

const sample = (n) => ({ cameras: Array.from({ length: n }, (_, i) => ({ id: String(i), lat: 24, lon: 120 })), source: 'npa7320', fetchedAt: '2026-11-20T00:00:00.000Z', stats: { kept: n } });

test('空資料庫 load 回傳 null', async () => {
  assert.equal(await loadDataset({ indexedDB: new IDBFactory() }), null);
});

test('save → load 往返；再次 save 覆蓋', async () => {
  const idb = new IDBFactory();
  await saveDataset(sample(3), { indexedDB: idb });
  assert.deepEqual(await loadDataset({ indexedDB: idb }), sample(3));
  await saveDataset(sample(5), { indexedDB: idb });
  assert.equal((await loadDataset({ indexedDB: idb })).cameras.length, 5);
});

test('createStore 綁定注入的 indexedDB', async () => {
  const s = createStore({ indexedDB: new IDBFactory() });
  await s.saveDataset(sample(2));
  assert.equal((await s.loadDataset()).stats.kept, 2);
});

test('無 indexedDB 時拋出中文錯誤', async () => {
  await assert.rejects(() => loadDataset({ indexedDB: undefined }), /IndexedDB/);
});

// loadBundledSnapshot：以假 fetch 對應檔案
function fakeFetch(files) {
  return async (url) => {
    const name = String(url).split('/').pop();
    if (!(name in files)) return { ok: false, status: 404 };
    const body = files[name];
    return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
  };
}
const taichung = await readFile(new URL('../../data/snapshots/npa7320-taichung.csv', import.meta.url), 'utf8');
const base = 'http://x/data/snapshots/';

test('loadBundledSnapshot 優先 cameras.json', async () => {
  const j = JSON.stringify(sample(7));
  const r = await loadBundledSnapshot({ fetchImpl: fakeFetch({ 'cameras.json': j, 'npa7320.csv': taichung }), baseUrl: base });
  assert.equal(r.cameras.length, 7);
  assert.equal(r.origin, 'bundled');
});

test('無 cameras.json → 用 npa7320.csv', async () => {
  const full = taichung; // 以同內容代表
  const r = await loadBundledSnapshot({ fetchImpl: fakeFetch({ 'npa7320.csv': full, 'npa7320-taichung.csv': 'garbage' }), baseUrl: base });
  assert.equal(r.file, 'npa7320.csv');
  assert.equal(r.cameras.length, 192);
});

test('只剩台中子集 → 用子集', async () => {
  const r = await loadBundledSnapshot({ fetchImpl: fakeFetch({ 'npa7320-taichung.csv': taichung }), baseUrl: base });
  assert.equal(r.file, 'npa7320-taichung.csv');
  assert.equal(r.stats.kept, 192);
});

test('cameras.json 損壞 → 退回 CSV；全無 → null', async () => {
  const r = await loadBundledSnapshot({ fetchImpl: fakeFetch({ 'cameras.json': '{bad', 'npa7320-taichung.csv': taichung }), baseUrl: base });
  assert.equal(r.file, 'npa7320-taichung.csv');
  assert.equal(await loadBundledSnapshot({ fetchImpl: fakeFetch({}), baseUrl: base }), null);
  assert.equal(await loadBundledSnapshot({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, baseUrl: base }), null);
});

test('cameras.json 可為純陣列', async () => {
  const r = await loadBundledSnapshot({ fetchImpl: fakeFetch({ 'cameras.json': JSON.stringify(sample(2).cameras) }), baseUrl: base });
  assert.equal(r.cameras.length, 2);
});
