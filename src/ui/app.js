// DriveHUD UI 外殼：live（真實 GPS）與 sim（模擬）共用同一組元件，差別只在餵資料的來源。
import { CONFIG, createCarView } from './deps.js?v=1.10.0';
import { createSettingsPanel, CAR_MODELS, CAR_COLORS, CAR_VIEWS, CAR_SCENES, CAR_TIMES } from './settings.js?v=1.10.0';
import { estimateTurn } from '../car/turn.js?v=1.10.0';
import { VERSION } from '../version.js?v=1.10.0';
import { rovingRadios } from './a11y.js?v=1.10.0';
import { isStale } from './settings-data.js?v=1.10.0';

export const VERSION_TAG = `V${VERSION.split('.').slice(0, 2).join('.')}`;

export const GPS_LABEL = {
  IDLE: 'GPS 待命',
  SEARCHING: '定位中',
  OK: '定位正常',
  POOR: '訊號不佳',
  DENIED: '權限遭拒',
  UNAVAILABLE: '無法取得定位',
  TIMEOUT: '定位逾時',
  UNSUPPORTED: '不支援定位',
  STALE: '定位資料過期',
  RELOCATING: '重新定位中',
};

const GPS_ERRORS = new Set(['DENIED', 'UNAVAILABLE', 'TIMEOUT', 'UNSUPPORTED']);
/** 測速資料狀態：loading（載入中）／ready（可用）／empty（0 筆）／error（載入失敗）。 */
const DATA_LABEL = {
  loading: ['載入測速資料中', '稍候即可開始偵測'],
  empty: ['測速資料未載入', '目前沒有任何測速點，無法提醒。請重新載入，或到設定匯入官方 CSV'],
  error: ['測速資料未載入', '讀取失敗，無法提醒。請重新載入，或到設定匯入官方 CSV'],
};
export const DATA_MISSING_SPEECH = '測速資料未載入，目前無法提醒測速';

const RADAR_DETAIL = {
  IDLE: '開始行車後偵測前方測速點',
  OK: '掃描行進方向的固定測速點',
  DENIED: '請開啟瀏覽器的定位權限後再試',
  UNAVAILABLE: '目前無法取得定位，請確認裝置已開啟定位服務',
  TIMEOUT: '等待新的 GPS 定位',
  UNSUPPORTED: '此瀏覽器環境不支援定位',
};

const HEADINGS = [
  ['N', '北'], ['NE', '東北'], ['E', '東'], ['SE', '東南'],
  ['S', '南'], ['SW', '西南'], ['W', '西'], ['NW', '西北'],
];
export function headingText(deg) {
  if (deg == null || !Number.isFinite(deg)) return '—';
  const [en, zh] = HEADINGS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  return `${en} ${zh}`;
}

/** 純函式：由引擎狀態與設定決定版面。minimal（手動）優先於 approach（自動）。 */
export function computeLayout(state, settings, config = CONFIG) {
  if (settings.minimal) return 'minimal';
  const f = state && state.focus;
  if (config.ui.autoCompactOnApproach && f && f.phase === 'APPROACHING' && f.relation !== 'OPPOSITE') return 'approach';
  return 'normal';
}

const icon = path => `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

export const SHELL_HTML = `
<div id="app" class="app layout-normal" data-layout="normal" data-mode="live">
  <div class="frame">
    <header class="topbar">
      <div class="console-brand"><span class="brand-stripes" aria-hidden="true">///</span> Drive<i>HUD</i></div><span class="build-tag">${VERSION_TAG}</span>
      <div class="top-actions">
        <button type="button" class="start-btn" id="btn-start" aria-pressed="false">開始行車</button><button type="button" class="dh-btn" id="btn-settings" aria-haspopup="dialog" aria-controls="settings-panel">設定</button>
      </div>
    </header>
    <section class="speed-zone" aria-label="即時速度">
      <div class="speed-line"><div class="speed" id="speed-value" aria-live="off">—</div><span class="speed-unit">km/h</span></div>
      <div class="speed-meta"><span class="heading" id="heading" aria-label="行進方向">—</span>
        <span class="sys-warn" role="status"><span class="voice-warn" id="voice-warn" hidden>語音無法播放</span><span class="voice-warn" id="wake-warn" hidden>螢幕可能自動關閉</span></span></div>
    </section>
    <section class="radar" id="radar" aria-label="測速雷達">
      <div class="radar-pill">
        <div class="gps" id="gps-status" data-status="IDLE"><span class="dot" aria-hidden="true"></span><span class="gps-text" role="status">GPS 待命</span></div>
        <div class="radar-text"><strong id="radar-state">待機中</strong><span id="radar-detail">開始行車後偵測前方測速點</span></div>
        <span class="nearby-hint" id="nearby-hint" hidden>附近測速點</span>
        <button type="button" class="dh-btn" id="radar-retry" aria-label="重新載入測速資料" hidden>重新載入</button>
      </div>
      <div class="approach" id="approach" hidden>
        <div class="ap-kind" id="ap-kind" hidden>區間測速</div>
        <div class="ap-main">
          <div class="ap-limit"><span class="ap-label">速限</span><span class="ap-limit-val" id="limit-value">—</span></div>
          <div class="ap-dist"><span class="ap-label">剩餘</span><span class="ap-dist-num"><span class="ap-dist-val" id="dist-value">—</span><span class="ap-unit">m</span></span></div>
        </div>
        <div class="ap-progress" aria-hidden="true"><span id="ap-progress-bar"></span></div>
        <div class="ap-addr" id="addr"></div>
        <div class="ap-over" id="over-label" hidden>超速</div>
      </div>
    </section>
    <p class="sr-only" id="sr-alert" role="status"></p>
    <div class="car-zone"><button type="button" id="cb-view" title="點按切換視角"><canvas id="car-canvas" aria-hidden="true" tabindex="-1"></canvas></button>
      <p class="car-fallback" id="car-fallback" role="status" hidden></p>
      <button type="button" class="cb-btn" id="cb-appearance" aria-label="外觀與場景" title="外觀與場景" aria-expanded="false" aria-controls="appearance">${icon('M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.4-9-7.4zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01M17 11.5h.01')}</button>
      <div class="appearance" id="appearance" role="group" aria-label="外觀與場景" hidden>
        <div class="appearance-head"><span>外觀與場景</span><span id="appearance-current"></span></div>
        <div class="carbar" id="carbar">
          <div class="cb-swatches" id="cb-colors" role="radiogroup" aria-label="車色"></div>
          <button type="button" class="cb-btn" id="cb-scene">場景</button>
          <button type="button" class="cb-btn" id="cb-time">時段</button>
        </div>
      </div>
      <div class="model-picker" id="model-picker" role="radiogroup" aria-label="車款" hidden>${CAR_MODELS.map((m) => `<button type="button" role="radio" class="cb-btn" data-model="${m.id}" aria-checked="false">${m.name}</button>`).join('')}</div>
      <div class="vehicle-controls" role="group" aria-label="車輛控制">
        <button type="button" class="cb-btn" id="cb-model" title="選擇車款" aria-haspopup="true" aria-expanded="false" aria-controls="model-picker">${icon('M5 16H3v-4l2-1 2-5h10l2 5 2 1v4h-2m-14 0h2m4 0h2m4 0h2M5 11h14M5 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0z')}<span id="cb-model-name">女武神</span></button>
        <button type="button" class="cb-btn" id="cb-lights" aria-label="車燈" title="車燈" aria-pressed="false">${icon('M14 5c5 0 7 3 7 7s-2 7-7 7h-1V5zM3 6l6 2M3 12h6m-6 6 6-2')}</button>
        <button type="button" class="cb-btn" id="cb-doors" aria-label="車門" title="車門" aria-pressed="false" hidden>${icon('M4 19V9l6-5h9l1 15H4zm2-9h12m-4 4h3')}</button>
        <button type="button" class="cb-btn" id="cb-jet" aria-label="噴射" title="開啟噴射" aria-pressed="false" hidden>${icon('M17 3c1 5-1 8-5 11l-4 1-2-2 1-4c3-4 6-6 10-6zM8 8l-4 1-1 4 3-1m6 1-1 4-4 1 1-3m-3 2-3 4m7-3-3 3M12 8h.01')}</button>
        <button type="button" class="cb-btn" id="cb-orbit" aria-label="360° 環繞" title="360° 環繞" aria-pressed="false">${icon('M21 10a9.2 9.2 0 1 0 .1 4M21 4v6h-6m-7 3 4-3 4 3-4 2-4-2z')}</button>
      </div>
    </div>
    <div class="sim-badge" id="sim-badge" hidden>模擬</div>
  </div>
  <dialog class="settings" id="settings-panel" aria-labelledby="settings-title"></dialog>
</div>`;

export function createApp({
  root,
  mode = 'live',
  engine,
  store,
  speech,
  wakeLock,
  geo,
  autoTick = mode === 'live',
  config = CONFIG,
  data = { state: 'ready', count: null },
  onRetryData = null,
} = {}) {
  root.innerHTML = SHELL_HTML;
  const $ = (s) => root.querySelector(s);
  const appEl = $('#app');
  appEl.dataset.mode = mode;
  const els = {
    gps: $('#gps-status'), gpsText: $('#gps-status .gps-text'), voiceWarn: $('#voice-warn'),
    speed: $('#speed-value'), heading: $('#heading'), approach: $('#approach'),
    limit: $('#limit-value'), dist: $('#dist-value'), addr: $('#addr'), over: $('#over-label'),
    nearby: $('#nearby-hint'), start: $('#btn-start'), canvas: $('#car-canvas'), badge: $('#sim-badge'),
    wakeWarn: $('#wake-warn'), retry: $('#radar-retry'), radarState: $('#radar-state'), radarDetail: $('#radar-detail'),
    kind: $('#ap-kind'), progress: $('#ap-progress-bar'), srAlert: $('#sr-alert'),
  };
  let passedUntil = 0, passedTimer = null;
  // 使用者可調的提醒選項（超速容忍、持續超速提醒）套到引擎；模擬頁的引擎沒有 setOptions，維持 config 預設。
  function applyAlertOptions(s = store.get()) {
    eng?.setOptions?.({ overspeedToleranceKmh: s.toleranceKmh ?? 0, overspeedRepeatS: s.overspeedRepeat ? config.ui.overspeedRepeatS : 0 });
  }
  let dataInfo = { ...data };
  els.retry.addEventListener('click', () => { if (onRetryData) onRetryData(); });
  // 語音實際播放結果（開始發聲／出錯／逾時）決定「語音無法播放」的顯示。
  speech?.onStatus?.((ok) => { els.voiceWarn.hidden = !!ok; });
  // 螢幕常亮：行車中卻沒有取得 → 提醒螢幕可能熄滅（熄滅後定位與語音都會停）。
  let wakeActive = null;
  wakeLock?.onChange?.((s) => { wakeActive = s.active; syncWakeWarn(); });
  function syncWakeWarn() {
    els.wakeWarn.hidden = !(running && mode === 'live' && wakeLock && wakeActive === false && document.visibilityState !== 'hidden');
  }
  if (mode === 'sim') { els.badge.hidden = false; els.start.hidden = true; }

  const panel = createSettingsPanel({ el: $('#settings-panel'), store, config });
  const settingsBtn = $('#btn-settings');
  settingsBtn.addEventListener('click', (event) => panel.toggle(event.currentTarget));

  // 車模區：左下為車款／車燈／車門／噴射／環繞，右上「外觀與場景」開啟浮動面板（車色、場景、時段）；與設定面板共用同一個 store。
  const bar = { model: $('#cb-model'), colors: $('#cb-colors'), view: $('#cb-view'), lights: $('#cb-lights'), doors: $('#cb-doors'), scene: $('#cb-scene'), time: $('#cb-time') };
  bar.colors.innerHTML = CAR_COLORS.map((c) => `<button type="button" role="radio" class="cb-swatch" data-color="${c.hex}" aria-label="${c.name}" title="${c.name}" style="--sw:${c.swatch || c.hex}"></button>`).join('');
  const nextOf = (list, id) => list[(list.findIndex((x) => x.id === id) + 1) % list.length].id;
  const nameOf = (list, id) => (list.find((x) => x.id === id) || list[0]).name;
  function syncBar(s) {
    $('#appearance-current').textContent = `${nameOf(CAR_SCENES, s.scene)}・${nameOf(CAR_TIMES, s.time)}`;
    $('#cb-model-name').textContent = nameOf(CAR_MODELS, s.model);
    bar.scene.textContent = `場景：${nameOf(CAR_SCENES, s.scene)}`;
    bar.time.textContent = `時段：${nameOf(CAR_TIMES, s.time)}`;
    bar.lights.setAttribute('aria-pressed', String(!!s.headlights));
    bar.colors.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === s.color)));
    picker.querySelectorAll('[data-model]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.model === s.model)));
    colorKeys?.sync();
    modelKeys?.sync();
  }
  let colorKeys = null, modelKeys = null;
  // 車款：點按開啟九款車的清單直接選，不必一台一台輪換（每次輪換都要建一次車模）。
  const picker = $('#model-picker');
  function setPicker(open) {
    if (picker.hidden === !open) return;
    if (open) setAppearance(false);
    picker.hidden = !open;
    bar.model.setAttribute('aria-expanded', String(open));
  }
  bar.model.addEventListener('click', () => {
    const opening = picker.hidden;
    setPicker(opening);
    if (opening) picker.querySelector('[tabindex="0"]')?.focus();
  });
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('[data-model]');
    if (!b) return;
    setPicker(false);
    bar.model.focus();
    if (b.dataset.model !== store.get().model) store.set({ model: b.dataset.model });
  });
  bar.view.addEventListener('click', () => {
    if (bar.view.disabled) return;
    setOrbit(false);
    store.set({ view: nextOf(CAR_VIEWS, store.get().view) });
  });
  bar.scene.addEventListener('click', () => store.set({ scene: nextOf(CAR_SCENES, store.get().scene) }));
  bar.time.addEventListener('click', () => store.set({ time: nextOf(CAR_TIMES, store.get().time) }));
  bar.lights.addEventListener('click', () => store.set({ headlights: !store.get().headlights }));
  // 外觀面板：浮在車模區上，開關不改變版面；點面板外、按 Esc、進入接近提醒或極簡模式時收起。
  const appearanceBtn = $('#cb-appearance'), appearanceSheet = $('#appearance');
  function setAppearance(open) {
    if (appearanceSheet.hidden === !open) return;
    if (open) setPicker(false);
    appearanceSheet.hidden = !open;
    appearanceBtn.setAttribute('aria-expanded', String(open));
  }
  appearanceBtn.addEventListener('click', () => setAppearance(appearanceSheet.hidden));
  const onDocPointer = (e) => {
    if (!appearanceSheet.hidden && !appearanceSheet.contains(e.target) && !appearanceBtn.contains(e.target)) setAppearance(false);
    if (!picker.hidden && !picker.contains(e.target) && !bar.model.contains(e.target)) setPicker(false);
  };
  const onDocKey = (e) => {
    if (e.key !== 'Escape') return;
    if (!appearanceSheet.hidden) { setAppearance(false); appearanceBtn.focus(); }
    if (!picker.hidden) { setPicker(false); bar.model.focus(); }
  };
  document.addEventListener('pointerdown', onDocPointer, true);
  document.addEventListener('keydown', onDocKey);
  bar.colors.addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) store.set({ color: b.dataset.color }); });
  // 鍵盤：車色與車款群組各只佔一個 Tab 停駐點，方向鍵移動（車款按 Enter 才換，避免每按一次就建一台車）
  colorKeys = rovingRadios(bar.colors);
  modelKeys = rovingRadios(picker, { selectOnMove: false });
  syncBar(store.get());

  const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  const noop = () => {};
  const createCarStub = () => ({
    setTurn: noop, setSpeedKmh: noop, setColor: noop, setHeadlights: noop, setModel: noop,
    canPreviewJet: () => false, setJetPreview: () => false, jetPreviewActive: false,
    hasDoors: () => false, doorsOpen: false, doorsLocked: false, setDoors: () => false,
    setOrbit: noop, orbiting: false, setView: noop, setScene: noop, setTime: noop, switching: false,
    setCompact: noop, setDarkMode: noop, setQuality: noop, setPaused: noop, resize: noop,
    getInfo: () => ({ paused: true, frames: 0 }), dispose: noop,
  });
  let car = createCarStub();
  let carReady = false;
  const fallback = $('#car-fallback');
  function initCar() {
    try {
      car = createCarView(els.canvas, { ...pick(store.get()), darkMode: !!dark?.matches, paused: !!store.get().minimal,
        onChange: () => syncVehicleActions() });
      carReady = true;
    } catch (error) {
      car = createCarStub();
      carReady = false;
      console.warn('3D 車模無法載入', error);
    }
    appEl.dataset.renderer = carReady ? 'ready' : 'unavailable';
    fallback.hidden = carReady;
    fallback.textContent = carReady ? '' : '3D 車模無法載入（儀表與測速功能仍可正常使用）';
  }
  const onDarkChange = event => { try { car.setDarkMode(event.matches); } catch (_) {} };
  dark?.addEventListener('change', onDarkChange);
  const orbitButton = $('#cb-orbit'), jetButton = $('#cb-jet');
  function setOrbit(on) {
    if (!carReady) return;
    car.setOrbit(on);
    orbitButton.setAttribute('aria-pressed', String(on));
    orbitButton.title = on ? '停止環繞' : '360° 環繞';
    if (!on && car.jetPreviewActive) store.set({view:'rear'});
    syncVehicleActions();
  }
  orbitButton.addEventListener('click', () => setOrbit(!car.orbiting));
  // 車門：只有具備車門動作的車款才顯示；開合狀態不存檔，車速到 5 km/h 就自動關上並鎖定
  function syncVehicleActions() {
    const jetOn = carReady && !!car.jetPreviewActive;
    const viewLocked = jetOn && !car.orbiting;
    const busy = carReady && !!car.switching; // 換車淡出中：操作會作用在即將被換掉的車上，先暫停
    jetButton.hidden = !carReady || !car.canPreviewJet();
    jetButton.setAttribute('aria-pressed', String(jetOn));
    jetButton.title = jetOn ? '關閉噴射' : '開啟噴射';
    const currentView = nameOf(CAR_VIEWS, store.get().view);
    jetButton.disabled = busy;
    bar.view.disabled = !carReady || viewLocked || busy;
    bar.view.setAttribute('aria-label', viewLocked
      ? `目前為${currentView}，噴射中鎖定視角`
      : `目前為${currentView}，點按切換視角`);
    orbitButton.disabled = !carReady || viewLocked || busy;
    orbitButton.setAttribute('aria-pressed', String(carReady && !!car.orbiting));
    const has = carReady && !!car.hasDoors();
    bar.doors.hidden = !has;
    const open = has && !!car.doorsOpen;
    const locked = has && !!car.doorsLocked; // 行駛中不能開門：按鈕停用並寫明原因，不要按了沒反應
    bar.doors.disabled = locked || busy;
    const label = store.get().model === 'daystar' ? '艙罩' : '車門';
    const doorStatus = `${label}：${locked ? '行駛中鎖定' : open ? '開' : '關'}`;
    bar.doors.setAttribute('aria-label', doorStatus);
    bar.doors.title = doorStatus;
    bar.doors.setAttribute('aria-pressed', String(open));
  }
  bar.doors.addEventListener('click', () => { if (carReady) car.setDoors(!car.doorsOpen); syncVehicleActions(); });
  jetButton.addEventListener('click', () => {
    if (!carReady) return;
    const jetOn = car.setJetPreview(!car.jetPreviewActive);
    if (jetOn && !car.orbiting) store.set({view:'rear'});
    syncVehicleActions();
  });
  initCar();
  syncVehicleActions();
  function onContextLost(event) {
    event.preventDefault();
    const lost = carReady ? car : null;
    car = createCarStub();
    carReady = false;
    appEl.dataset.renderer = 'unavailable';
    fallback.textContent = '3D 顯示已中斷，速度與測速提醒仍可使用。';
    fallback.hidden = false;
    syncVehicleActions();
    lost?.dispose();
  }
  function onContextRestored() {
    if (carReady) return;
    initCar();
    render();
  }
  els.canvas.addEventListener('webglcontextlost', onContextLost);
  els.canvas.addEventListener('webglcontextrestored', onContextRestored);

  let running = mode === 'sim';
  // 本次行車是否已用語音告知「測速資料未載入」。資料恢復 ready 或停止行車時重設，
  // 所以同一段缺漏（empty／error 之間切換、重複更新同一狀態）只講一次。
  let dataWarned = false;
  function warnMissingData() {
    if (!running || !speech || dataWarned) return;
    if (dataInfo.state !== 'empty' && dataInfo.state !== 'error') return;
    dataWarned = true;
    if (speech.speak(DATA_MISSING_SPEECH) === false) els.voiceWarn.hidden = false;
  }
  let relocating = false;
  let adapterStatus = null;
  let previousCourse = null, turnTimeout;
  function resetTurn() {
    clearTimeout(turnTimeout); previousCourse = null; car?.setTurn(0);
  }
  function updateTurn(fix) {
    const state = eng?.getState();
    if (state?.gps !== 'OK' || !(state.speedKmh >= 8) || !Number.isFinite(state.headingDeg)) {
      resetTurn(); return;
    }
    const course = { t:fix.t, heading:state.headingDeg, speed:state.speedKmh/3.6 };
    car?.setTurn(estimateTurn(previousCourse,course)); previousCourse=course;
    clearTimeout(turnTimeout); turnTimeout=setTimeout(resetTurn,2500);
  }
  let tickTimer = null;
  let eng = engine;
  const renderCbs = [];
  const eventCbs = [];

  function pick(s) { return { model: s.model, color: s.color, headlights: s.headlights, quality: s.lowQuality ? 'low' : 'high', view: s.view, scene: s.scene, time: s.time }; }

  function gpsKey(state) {
    if (!running) return 'IDLE';
    if (GPS_ERRORS.has(adapterStatus)) return adapterStatus;
    if (relocating) return 'RELOCATING';
    return (state && state.gps) || 'SEARCHING';
  }

  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  let lastLayout = null;
  function render() {
    const rawState = eng?.getState();
    const g = gpsKey(rawState);
    const state = g === 'OK' ? rawState : {
      ...rawState, speedKmh:null, headingDeg:null, focus:null, nearby:[], overspeed:false,
    };
    const settings = store.get();
    const layout = computeLayout(state, settings, config);
    if (layout !== lastLayout) {
      appEl.classList.remove(`layout-${lastLayout}`);
      appEl.classList.add(`layout-${layout}`);
      appEl.dataset.layout = layout;
      lastLayout = layout;
      if (layout !== 'normal') { setAppearance(false); setPicker(false); }
    }

    els.gps.dataset.status = g;
    setText(els.gpsText, GPS_LABEL[g] || g);
    const missing = DATA_LABEL[dataInfo.state];
    if (appEl.dataset.data !== dataInfo.state) appEl.dataset.data = dataInfo.state;
    if (missing) {
      setText(els.radarState, missing[0]);
      setText(els.radarDetail, missing[1]);
    } else if (g === 'OK' && passedUntil > Date.now()) {
      setText(els.radarState, '已通過測速點');
      setText(els.radarDetail, '繼續偵測前方測速點');
    } else {
      setText(els.radarState, g === 'OK' ? '偵測中' : g === 'IDLE' ? '待機中' : (GPS_LABEL[g] || g));
      setText(els.radarDetail, RADAR_DETAIL[g] || '等待有效的 GPS 訊號');
    }
    els.retry.hidden = !(onRetryData && (dataInfo.state === 'empty' || dataInfo.state === 'error'));
    // 測速資料超過 90 天：設定鈕加提示點（不打擾行車畫面）
    const stale = dataInfo.state === 'ready' && isStale(dataInfo.fetchedAt);
    if (settingsBtn.classList.contains('has-dot') !== stale) {
      settingsBtn.classList.toggle('has-dot', stale);
      settingsBtn.setAttribute('aria-label', stale ? '設定（測速資料已超過 90 天，建議更新）' : '設定');
    }

    setText(els.speed, state.speedKmh == null ? '—' : String(Math.round(state.speedKmh)));
    els.speed.classList.toggle('empty', state.speedKmh == null);
    setText(els.heading, headingText(state.headingDeg));

    const f = state.focus;
    const approaching = !!(f && f.phase === 'APPROACHING' && f.relation !== 'OPPOSITE');
    try {
      // 接近測速點時雷達面板蓋住車模：暫停 3D 繪製（畫布尺寸不變，不會重新配置），把 GPU 留給儀表。
      car.setPaused?.(layout === 'minimal' || approaching);
      car.setSpeedKmh(state.speedKmh || 0);
      if (layout !== 'normal' && car.orbiting) setOrbit(false);
    } catch (err) {
      console.warn('3D 車模渲染更新失敗', err);
    }
    syncVehicleActions();

    els.approach.hidden = !approaching;
    appEl.classList.toggle('has-approach', approaching);
    const over = approaching && !!state.overspeed;
    els.approach.classList.toggle('over', over);
    appEl.classList.toggle('overspeed', over);
    els.over.hidden = !over;
    if (approaching) {
      const lim = f.camera.limit;
      setText(els.limit, lim == null ? '速限未知' : String(lim));
      els.limit.classList.toggle('unknown', lim == null);
      els.limit.classList.toggle('three', lim != null && lim >= 100);
      setText(els.dist, String(Math.max(0, Math.round(f.distanceM / 10) * 10)));
      setText(els.addr, f.camera.address || '');
      els.kind.hidden = !f.camera.interval;
      // 距離進度：從提醒那一刻（半徑）到相機位置
      const radius = f.radiusM > 0 ? f.radiusM : Math.max(f.distanceM, 200);
      const p = Math.min(1, Math.max(0, 1 - f.distanceM / radius));
      els.progress.style.setProperty('--p', p.toFixed(3));
    }
    const nearbyHint = !approaching && ((state.nearby && state.nearby.length > 0) || (f && f.relation === 'AMBIGUOUS'));
    els.nearby.hidden = !nearbyHint;
    appEl.classList.toggle('has-nearby', !!nearbyHint);

    const view = { layout, overspeed: over, nearbyHint: !!nearbyHint, approaching, gps: g, state };
    renderCbs.forEach((cb) => cb(view));
    return view;
  }

  function ingest(events = []) {
    for (const e of events) {
      if ((e.type === 'APPROACH_ALERT' || e.type === 'OVERSPEED_ALERT' || e.type === 'OVERSPEED_REPEAT') && e.speechText) {
        panel.duckMusic();
        const ok = speech ? speech.speak(e.speechText) : false;
        els.voiceWarn.hidden = ok !== false ? true : false;
        e.__spoken = ok;
        if (e.type !== 'OVERSPEED_REPEAT') els.srAlert.textContent = e.speechText; // 螢幕閱讀器只播一次主要提醒
      }
      if (e.type === 'PASSED') {
        // 通過後短暫顯示「已通過測速點」，讓駕駛確定提醒結束
        passedUntil = Date.now() + config.ui.passedNoticeMs;
        clearTimeout(passedTimer);
        passedTimer = setTimeout(() => render(), config.ui.passedNoticeMs + 50);
      }
    }
    if (events.length) eventCbs.forEach((cb) => cb(events));
    if (relocating && eng && eng.getState().gps === 'OK') relocating = false;
    return render();
  }

  function onFix(fix) {
    if (!eng) return;
    ingest(eng.pushFix(fix));
    updateTurn(fix);
  }

  function startTick() {
    if (tickTimer || !autoTick) return;
    tickTimer = setInterval(() => { if (eng) ingest(eng.tick()); }, 1000);
  }

  // 「開始行車」：先 speech.unlock（需在手勢內，故同步呼叫），再 wakeLock，再 geo.start。
  function start() {
    if (running) return;
    running = true;
    els.start.textContent = '停止行車';
    els.start.setAttribute('aria-pressed', 'true');
    if (speech) speech.unlock();
    // 資料缺漏時直接用語音講清楚：駕駛不一定會看畫面。資料之後才載入失敗時由 setData 補講。
    warnMissingData();
    if (wakeLock) wakeLock.request();
    geo?.start(onFix, (status) => {
      if (!running) return;
      if (GPS_ERRORS.has(status) && !GPS_ERRORS.has(adapterStatus)) {
        eng?.reset();
        resetTurn();
        speech?.cancel?.();
      }
      adapterStatus = status;
      render();
    });
    startTick();
    syncWakeWarn();
    render();
  }
  function stop() {
    running = false;
    dataWarned = false;
    geo?.stop(); wakeLock?.release(); speech?.cancel?.();
    clearInterval(tickTimer); tickTimer = null;
    eng?.reset(); adapterStatus = null; resetTurn(); relocating = false;
    els.start.textContent = '開始行車'; els.voiceWarn.hidden = true;
    els.start.setAttribute('aria-pressed', 'false');
    syncWakeWarn();
    render();
  }
  els.start.addEventListener('click', () => running ? stop() : start());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && running && mode === 'live' && eng) {
      resetTurn(); eng.reset();
      relocating = true;
      render();
    }
  });

  // 設定變動只更新有改的項目（換色不會重設車款、場景等）。
  let prevSettings = store.get();
  store.subscribe((s) => {
    const p = prevSettings;
    prevSettings = s;
    syncBar(s);
    render();
    try {
      if (s.model !== p.model) car.setModel(s.model);
      if (s.color !== p.color) car.setColor(s.color);
      if (s.headlights !== p.headlights) car.setHeadlights(s.headlights);
      if (s.lowQuality !== p.lowQuality) car.setQuality(s.lowQuality ? 'low' : 'high');
      if (s.view !== p.view) car.setView(s.view);
      if (s.scene !== p.scene) car.setScene(s.scene);
      if (s.time !== p.time) car.setTime(s.time);
      if (s.toleranceKmh !== p.toleranceKmh || s.overspeedRepeat !== p.overspeedRepeat) applyAlertOptions(s);
      syncVehicleActions();
    } catch (err) {
      console.warn('3D 車模更新失敗', err);
    }
  });

  applyAlertOptions();
  render();

  return {
    el: appEl,
    start, render, ingest, onFix, panel,
    get car() { return car; },
    setEngine(e) { resetTurn(); eng = e; relocating = false; applyAlertOptions(); render(); },
    /** 測速資料狀態：{ state: 'loading'|'ready'|'empty'|'error', count } */
    setData(d) {
      dataInfo = { ...dataInfo, ...d };
      if (dataInfo.state === 'ready') dataWarned = false;
      render();
      warnMissingData();
    },
    get data() { return { ...dataInfo }; },
    setLastFix(f) { updateTurn(f); },
    onRender(cb) { renderCbs.push(cb); },
    onEvents(cb) { eventCbs.push(cb); },
    destroy() {
      resetTurn();
      clearTimeout(passedTimer);
      panel.destroy();
      clearInterval(tickTimer);
      dark?.removeEventListener('change', onDarkChange);
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onDocKey);
      els.canvas.removeEventListener('webglcontextlost', onContextLost);
      els.canvas.removeEventListener('webglcontextrestored', onContextRestored);
      car?.dispose();
    },
  };
}
