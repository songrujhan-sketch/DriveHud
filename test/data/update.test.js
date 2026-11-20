import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import { CONFIG } from '../../config.js';
import { createStore } from '../../src/data/store.js';
import { updateOnline, importFromFile, CORS_REASON } from '../../src/data/update.js';

const csv = await readFile(new URL('../../data/snapshots/npa7320-taichung.csv', import.meta.url), 'utf8');
const mk = () => {
  const store = createStore({ indexedDB: new IDBFactory() });
  store.loadBundledSnapshot = async () => null; // 避免測試依賴實際檔案
  return store;
};
const ok = (body) => async () => ({ ok: true, status: 200, text: async () => body });
const now = () => Date.parse('2026-11-20T01:00:00Z');
const URL_ = 'https://example.test/x';

test('updateOnline 成功並儲存', async () => {
  const store = mk();
  const r = await updateOnline({ url: URL_, fetchImpl: ok(csv), store, config: CONFIG, now });
  assert.equal(r.ok, true);
  assert.equal(r.stats.kept, 192);
  assert.equal(r.fetchedAt, '2026-11-20T01:00:00.000Z');
  const saved = await store.loadDataset();
  assert.equal(saved.cameras.length, 192);
  assert.equal(saved.origin, 'online');
});

test('TypeError: Failed to fetch（CORS）→ 明確中文原因，舊版保留', async () => {
  const store = mk();
  await updateOnline({ url: URL_, fetchImpl: ok(csv), store, config: CONFIG, now });
  const r = await updateOnline({
    url: URL_, store, config: CONFIG, now,
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, '無法連線或被瀏覽器跨網域限制擋下，請改用匯入 CSV');
  assert.equal(r.reason, CORS_REASON);
  assert.equal((await store.loadDataset()).cameras.length, 192);
});

test('HTTP 錯誤', async () => {
  const r = await updateOnline({ url: URL_, store: mk(), config: CONFIG, now, fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /503/);
});

test('無網址設定', async () => {
  const r = await updateOnline({ store: mk(), config: { data: { sources: {} } }, fetchImpl: ok(csv), now });
  assert.equal(r.ok, false);
});

test('筆數過少（< 舊 × minAcceptRatio）拒絕並保留舊版', async () => {
  const store = mk();
  await updateOnline({ url: URL_, fetchImpl: ok(csv), store, config: CONFIG, now });
  const lines = csv.split('\n');
  const tiny = [...lines.slice(0, 2), ...lines.slice(2, 12)].join('\n'); // 10 筆
  const r = await updateOnline({ url: URL_, fetchImpl: ok(tiny), store, config: CONFIG, now });
  assert.equal(r.ok, false);
  assert.match(r.reason, /已保留舊版/);
  assert.equal((await store.loadDataset()).cameras.length, 192);
});

test('剛好達門檻（= 舊 × 0.5）接受', async () => {
  const store = mk();
  await updateOnline({ url: URL_, fetchImpl: ok(csv), store, config: CONFIG, now });
  const lines = csv.trim().split('\n');
  const half = [...lines.slice(0, 2), ...lines.slice(2, 2 + 96)].join('\n');
  const r = await updateOnline({ url: URL_, fetchImpl: ok(half), store, config: CONFIG, now });
  assert.equal(r.ok, true);
  assert.equal(r.stats.kept, 96);
});

test('100855 格式 → unsupported 原因', async () => {
  const bad = '設備編號,型式,縣市,取締項目\n1,a,b,槽化線\n';
  const r = await updateOnline({ url: URL_, fetchImpl: ok(bad), store: mk(), config: CONFIG, now });
  assert.equal(r.ok, false);
  assert.match(r.reason, /100855/);
});

test('importFromFile 成功；以 File 物件', async () => {
  const store = mk();
  const file = new File([csv], 'npa7320.csv', { type: 'text/csv' });
  const r = await importFromFile(file, { store, config: CONFIG, now });
  assert.equal(r.ok, true);
  const saved = await store.loadDataset();
  assert.equal(saved.origin, 'import');
  assert.equal(saved.file, 'npa7320.csv');
});

test('importFromFile 無法辨識 / 無檔案 / 亂碼', async () => {
  const store = mk();
  assert.equal((await importFromFile(new File(['a,b\n1,2'], 'x.csv'), { store, config: CONFIG, now })).ok, false);
  assert.equal((await importFromFile(null, { store, config: CONFIG, now })).ok, false);
  const r = await importFromFile({ text: async () => '�'.repeat(20) }, { store, config: CONFIG, now });
  assert.match(r.reason, /編碼/);
  assert.equal(await store.loadDataset(), null);
});

test('全部座標無效 → 失敗', async () => {
  const t = 'CityName,RegionName,Address,DeptNm,BranchNm,Longitude,Latitude,direct,limit\n設置縣市,a,b,c,d,e,f,g,h\n臺中市,中區,x,警,,abc,def,南向北,50\n';
  const r = await updateOnline({ url: URL_, fetchImpl: ok(t), store: mk(), config: CONFIG, now });
  assert.equal(r.ok, false);
});
