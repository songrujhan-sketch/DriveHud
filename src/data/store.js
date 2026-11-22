// IndexedDB：db 'drivehud'、store 'dataset'、key 'current'。indexedDB 可注入（測試用 fake-indexeddb）。
import { runPipeline } from './pipeline.js?v=1.10.0';

export const DB_NAME = 'drivehud';
export const STORE_NAME = 'dataset';
const KEY = 'current';

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb(idb) {
  return new Promise((resolve, reject) => {
    if (!idb) { reject(new Error('此環境不支援 IndexedDB')); return; }
    const r = idb.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE_NAME)) r.result.createObjectStore(STORE_NAME);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('IndexedDB 被其他分頁佔用'));
  });
}

/**
 * @param {{cameras:object[], source:string, fetchedAt:string, stats:object}} dataset
 * @param {{indexedDB?:IDBFactory}} [opts]
 */
export async function saveDataset(dataset, { indexedDB = globalThis.indexedDB } = {}) {
  const db = await openDb(indexedDB);
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('寫入被中止'));
    });
    tx.objectStore(STORE_NAME).put(dataset, KEY);
    await done;
  } finally {
    db.close();
  }
}

/** @returns {Promise<object|null>} */
export async function loadDataset({ indexedDB = globalThis.indexedDB } = {}) {
  const db = await openDb(indexedDB);
  try {
    const v = await req(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY));
    return v ?? null;
  } finally {
    db.close();
  }
}

/** 綁定 indexedDB 的 store 物件，供 UI／update 注入。 */
export function createStore({ indexedDB = globalThis.indexedDB, fetchImpl, baseUrl, config } = {}) {
  return {
    saveDataset: (d) => saveDataset(d, { indexedDB }),
    loadDataset: () => loadDataset({ indexedDB }),
    loadBundledSnapshot: (o = {}) => loadBundledSnapshot({ fetchImpl, baseUrl, config, ...o }),
  };
}

/**
 * 初次啟動資料：依序嘗試 data/snapshots/cameras.json → npa7320.csv → npa7320-taichung.csv。
 * 回傳資料集（含 origin:'bundled'）；全部不存在則 null。
 */
export async function loadBundledSnapshot({ fetchImpl = globalThis.fetch, baseUrl, config } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const base = baseUrl ?? new URL('../../data/snapshots/', import.meta.url).href;
  const get = async (name) => {
    try {
      const r = await fetchImpl(new URL(name, base).href);
      return r && r.ok ? r : null;
    } catch { return null; }
  };

  const jsonRes = await get('cameras.json');
  if (jsonRes) {
    try {
      const j = await jsonRes.json();
      const cameras = Array.isArray(j) ? j : j.cameras;
      if (Array.isArray(cameras) && cameras.length > 0) {
        return { ...(Array.isArray(j) ? {} : j), cameras, source: j.source ?? 'npa7320', origin: 'bundled' };
      }
    } catch { /* 往下一個來源 */ }
  }
  for (const name of ['npa7320.csv', 'npa7320-taichung.csv']) {
    const res = await get(name);
    if (!res) continue;
    const out = runPipeline(await res.text(), config);
    if (out.ok) {
      return { cameras: out.cameras, source: 'npa7320', origin: 'bundled', fetchedAt: null, stats: out.stats, file: name };
    }
  }
  return null;
}
