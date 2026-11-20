// 主畫面啟動：index.html 只需 <div id="root"></div> + <script type="module" src="…/main.js">。
import { CONFIG, createAlertEngine, loadCameras, dataServices } from './deps.js';
import { createApp } from './app.js';
import { createSettingsStore } from './settings.js';
import { createGeoSource } from '../adapters/geolocation.js';
import { createSpeech } from '../adapters/speech.js';
import { createWakeLock } from '../adapters/wakelock.js';

async function boot() {
  const root = document.getElementById('root');
  let cameras = [];
  try { cameras = await loadCameras(); } catch (err) { console.warn('載入測速資料失敗', err); }
  const engine = createAlertEngine({ cameras, config: CONFIG });
  dataServices.onCamerasUpdated((list) => engine.setCameras(list));
  const app = createApp({
    root,
    mode: 'live',
    engine,
    store: createSettingsStore(),
    speech: createSpeech(),
    wakeLock: createWakeLock(),
    geo: createGeoSource(),
  });
  window.__drivehud = { app, engine }; // 方便除錯 / e2e
}
boot();
