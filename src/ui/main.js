// 主畫面啟動：index.html 只需 <div id="root"></div> + <script type="module" src="…/main.js">。
// 先畫出儀表，測速資料在背景載入；載入失敗或 0 筆時畫面與語音都會明說，不會假裝在偵測。
import { CONFIG, createAlertEngine, loadCameraDataset, dataServices } from './deps.js?v=1.10.0';
import { createApp } from './app.js?v=1.10.0';
import { createSettingsStore } from './settings.js?v=1.10.0';
import { createDataLoader } from './data-loader.js?v=1.10.0';
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
    // 初始載入、重新載入與匯入共用一個時序：較舊的載入晚完成時直接丟棄。
    const loader = createDataLoader({
      load: loadCameraDataset,
      onLoading: () => app?.setData({ state: 'loading', count: 0 }),
      onData: ({ cameras, fetchedAt }) => {
        engine.setCameras(cameras);
        app?.setData({ state: cameras.length ? 'ready' : 'empty', count: cameras.length, fetchedAt: fetchedAt ?? null });
      },
      onError: (err) => {
        console.warn('載入測速資料失敗', err);
        app?.setData({ state: 'error', count: 0 });
      },
    });
    dataServices.onCamerasUpdated((list, ds) => loader.push({ cameras: list, fetchedAt: ds?.fetchedAt ?? null }));
    app = createApp({
      root,
      mode: 'live',
      engine,
      store: createSettingsStore(),
      speech: createSpeech(),
      wakeLock: createWakeLock(),
      geo: createGeoSource(),
      data: { state: 'loading', count: 0 },
      onRetryData: () => loader.reload(),
    });
    loader.reload();

    // 除錯／e2e 用的全域入口只在網址帶 ?debug 時掛上。
    if (new URLSearchParams(location.search).has('debug')) window.__drivehud = { app, engine };
  } catch (err) {
    showFatal(root, err);
  }
}
boot();
