// 主畫面啟動：index.html 只需 <div id="root"></div> + <script type="module" src="…/main.js">。
// 先畫出儀表，測速資料在背景載入；載入失敗或 0 筆時畫面與語音都會明說，不會假裝在偵測。
import { CONFIG, createAlertEngine, loadCameraDataset, dataServices } from './deps.js?v=1.10.0';
import { createApp } from './app.js?v=1.10.0';
import { createSettingsStore } from './settings.js?v=1.10.0';
import { createGeoSource } from '../adapters/geolocation.js?v=1.10.0';
import { createSpeech } from '../adapters/speech.js?v=1.10.0';
import { createWakeLock } from '../adapters/wakelock.js?v=1.10.0';

function showFatal(root, err) {
  console.error('DriveHUD 無法啟動', err);
  root.textContent = '';
  const box = document.createElement('div');
  box.className = 'boot boot-error';
  box.setAttribute('role', 'alert');
  const title = document.createElement('p');
  title.className = 'boot-title';
  title.textContent = 'DriveHUD 無法啟動';
  const msg = document.createElement('p');
  msg.textContent = '請重新整理頁面；若仍失敗，請確認網路連線後再試。';
  const reload = document.createElement('a');
  reload.className = 'boot-reload';
  reload.href = './';
  reload.textContent = '重新整理';
  box.append(title, msg, reload);
  root.appendChild(box);
}

function boot() {
  const root = document.getElementById('root');
  let app;
  try {
    const engine = createAlertEngine({ cameras: [], config: CONFIG });
    dataServices.onCamerasUpdated((list, ds) => {
      engine.setCameras(list);
      app?.setData({ state: list.length ? 'ready' : 'empty', count: list.length, fetchedAt: ds?.fetchedAt ?? null });
    });
    app = createApp({
      root,
      mode: 'live',
      engine,
      store: createSettingsStore(),
      speech: createSpeech(),
      wakeLock: createWakeLock(),
      geo: createGeoSource(),
      data: { state: 'loading', count: 0 },
      onRetryData: () => loadData(),
    });

    async function loadData() {
      app.setData({ state: 'loading', count: 0 });
      try {
        const { cameras, fetchedAt } = await loadCameraDataset();
        engine.setCameras(cameras);
        app.setData({ state: cameras.length ? 'ready' : 'empty', count: cameras.length, fetchedAt });
      } catch (err) {
        console.warn('載入測速資料失敗', err);
        app.setData({ state: 'error', count: 0 });
      }
    }
    loadData();

    // 除錯／e2e 用的全域入口只在網址帶 ?debug 時掛上。
    if (new URLSearchParams(location.search).has('debug')) window.__drivehud = { app, engine };
  } catch (err) {
    showFatal(root, err);
  }
}
boot();
