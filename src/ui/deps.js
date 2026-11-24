// 整合點：app.js / main.js / settings.js 只從這裡 import 引擎、車模、資料。
export { createAlertEngine } from '../engine/alertEngine.js?v=1.10.0';
export { createCarView } from '../car/carView.js?v=1.10.0';
export { mountSettingsData } from './settings-data.js?v=1.10.0';
export { CONFIG } from '../../config.js?v=1.10.0';

import { CONFIG } from '../../config.js?v=1.10.0';
import { createStore } from '../data/store.js?v=1.10.0';
import { updateOnline, importFromFile } from '../data/update.js?v=1.10.0';

/** 資料服務：IndexedDB store + 更新／匯入；更新成功後通知訂閱者（main.js → engine.setCameras）。 */
const store = createStore({ config: CONFIG });
const camerasListeners = [];

let notifyGen = 0;
async function notifyCamerasUpdated() {
  const g = ++notifyGen;
  try {
    const ds = await store.loadDataset();
    if (g !== notifyGen) return; // 之後又有更新：讓最新的那次通知
    if (ds && Array.isArray(ds.cameras)) for (const cb of camerasListeners) cb(ds.cameras, ds);
  } catch (err) { console.warn('重新載入測速資料失敗', err); }
}

export const dataServices = {
  store,
  update: {
    async updateOnline(opts = {}) {
      const r = await updateOnline({ ...opts, store, config: CONFIG });
      if (r.ok) await notifyCamerasUpdated();
      return r;
    },
    async importFromFile(file, opts = {}) {
      const r = await importFromFile(file, { ...opts, store, config: CONFIG });
      if (r.ok) await notifyCamerasUpdated();
      return r;
    },
  },
  onCamerasUpdated(cb) { camerasListeners.push(cb); return () => camerasListeners.splice(camerasListeners.indexOf(cb) >>> 0, 1); },
};

/** 取得測速資料：先試 IndexedDB（使用者更新過的資料），再退回內建快照。回傳 { cameras, fetchedAt, origin }。 */
export async function loadCameraDataset() {
  let ds = null;
  try { ds = await store.loadDataset(); } catch (err) { console.warn('讀取 IndexedDB 失敗', err); }
  if (!ds || !Array.isArray(ds.cameras) || ds.cameras.length === 0) {
    ds = await store.loadBundledSnapshot();
  }
  return { cameras: (ds && ds.cameras) || [], fetchedAt: ds?.fetchedAt ?? null, origin: ds?.origin ?? null };
}

/** 取得相機清單（相容舊介面）。 */
export async function loadCameras() {
  return (await loadCameraDataset()).cameras;
}
