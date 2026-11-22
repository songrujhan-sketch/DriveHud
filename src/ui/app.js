// DriveHUD UI 外殼：live（真實 GPS）與 sim（模擬）共用同一組元件，差別只在餵資料的來源。
import { CONFIG, createCarView } from './deps.js?v=1.9.3';
import { createSettingsPanel, CAR_MODELS, CAR_COLORS, CAR_VIEWS, CAR_SCENES, CAR_TIMES } from './settings.js?v=1.9.3';
import { estimateTurn } from '../car/turn.js';

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
      <div class="console-brand"><span class="brand-stripes" aria-hidden="true">///</span> Drive<i>HUD</i></div><span class="build-tag">V1.9</span>
      <div class="top-actions"><span class="voice-warn" id="voice-warn" hidden>語音無法播放</span>
      <button type="button" class="start-btn" id="btn-start">開始行車</button><button type="button" class="dh-btn" id="btn-settings" aria-haspopup="dialog" aria-controls="settings-panel">設定</button></div>
    </header>
    <div class="car-zone"><button type="button" id="cb-view" title="點按切換視角"><canvas id="car-canvas" aria-hidden="true" tabindex="-1"></canvas>
    </button>
    <p class="car-fallback" id="car-fallback" role="status" hidden></p>
      <div class="vehicle-controls" role="group" aria-label="車輛控制">
      <button type="button" class="cb-btn" id="cb-model" title="點按切換車款">${icon('M5 16H3v-4l2-1 2-5h10l2 5 2 1v4h-2m-14 0h2m4 0h2m4 0h2M5 11h14M5 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0z')}<span id="cb-model-name">女武神</span></button>
        <button type="button" class="cb-btn" id="cb-lights" aria-label="車燈" title="車燈" aria-pressed="false">${icon('M14 5c5 0 7 3 7 7s-2 7-7 7h-1V5zM3 6l6 2M3 12h6m-6 6 6-2')}</button>
        <button type="button" class="cb-btn" id="cb-doors" aria-label="車門" title="車門" aria-pressed="false" hidden>${icon('M4 19V9l6-5h9l1 15H4zm2-9h12m-4 4h3')}</button>
        <button type="button" class="cb-btn" id="cb-jet" aria-label="噴射" title="開啟噴射" aria-pressed="false" hidden>${icon('M17 3c1 5-1 8-5 11l-4 1-2-2 1-4c3-4 6-6 10-6zM8 8l-4 1-1 4 3-1m6 1-1 4-4 1 1-3m-3 2-3 4m7-3-3 3M12 8h.01')}</button>
        <button type="button" class="cb-btn" id="cb-orbit" aria-label="360° 環繞" title="360° 環繞" aria-pressed="false">${icon('M21 10a9.2 9.2 0 1 0 .1 4M21 4v6h-6m-7 3 4-3 4 3-4 2-4-2z')}</button>
      </div>
    </div>
    <div class="speed-zone"><span class="meter-label">即時速度</span>
      <div class="speed-line"><div class="speed" id="speed-value" aria-live="off">—</div><span class="speed-unit">km/h</span></div>
      <div class="speed-meta"><div class="gps" id="gps-status" data-status="IDLE"><span class="dot" aria-hidden="true"></span><span class="gps-text" role="status">GPS 待命</span></div><span class="heading" id="heading">—</span></div>
    </div>
    <section class="radar-idle"><span class="meter-label">測速雷達</span><strong id="radar-state">待機中</strong><span id="radar-detail">開始行車後偵測前方測速點</span></section>
    <section class="approach" id="approach" hidden aria-live="polite">
      <div class="ap-main">
        <div class="ap-limit"><span class="ap-label">速限</span><span class="ap-limit-val" id="limit-value">—</span></div>
        <div class="ap-dist"><span class="ap-label">剩餘</span><span class="ap-dist-val" id="dist-value">—</span><span class="ap-unit">m</span></div>
      </div>
      <div class="ap-addr" id="addr"></div>
      <div class="ap-over" id="over-label" hidden>超速</div>
    </section>
    <div class="garage-controls">
    <details class="appearance"><summary>外觀與場景 <span id="appearance-current"></span></summary>
    <div class="carbar" id="carbar" role="group" aria-label="車輛外觀">
      <div class="cb-swatches" id="cb-colors" role="radiogroup" aria-label="車色"></div>
      <button type="button" class="cb-btn" id="cb-scene">場景</button>
      <button type="button" class="cb-btn" id="cb-time">時段</button>
    </div>
    </details>
    </div>
    <div class="nearby-hint" id="nearby-hint" hidden>附近測速點</div>
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
  };
  if (mode === 'sim') { els.badge.hidden = false; els.start.hidden = true; }

  const panel = createSettingsPanel({ el: $('#settings-panel'), store, config });
  $('#btn-settings').addEventListener('click', (event) => panel.toggle(event.currentTarget));

  // 外觀列：車款、車色、視角、車燈、場景、時段都在畫面下方，不遮住車子；與設定面板共用同一個 store。
  const bar = { model: $('#cb-model'), colors: $('#cb-colors'), view: $('#cb-view'), lights: $('#cb-lights'), doors: $('#cb-doors'), scene: $('#cb-scene'), time: $('#cb-time') };
  bar.colors.innerHTML = CAR_COLORS.map((c) => `<button type="button" role="radio" class="cb-swatch" data-color="${c.hex}" aria-label="${c.name}" title="${c.name}" style="--sw:${c.swatch || c.hex}"></button>`).join('');
  const nextOf = (list, id) => list[(list.findIndex((x) => x.id === id) + 1) % list.length].id;
  const nameOf = (list, id) => (list.find((x) => x.id === id) || list[0]).name;
  function syncBar(s) {
    $('#appearance-current').textContent = nameOf(CAR_SCENES, s.scene);
    $('#cb-model-name').textContent = nameOf(CAR_MODELS, s.model);
    bar.scene.textContent = `場景：${nameOf(CAR_SCENES, s.scene)}`;
    bar.time.textContent = `時段：${nameOf(CAR_TIMES, s.time)}`;
    bar.lights.setAttribute('aria-pressed', String(!!s.headlights));
    bar.colors.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === s.color)));
  }
  bar.model.addEventListener('click', () => store.set({ model: nextOf(CAR_MODELS, store.get().model) }));
  bar.view.addEventListener('click', () => {
    if (bar.view.disabled) return;
    setOrbit(false);
    store.set({ view: nextOf(CAR_VIEWS, store.get().view) });
  });
  bar.scene.addEventListener('click', () => store.set({ scene: nextOf(CAR_SCENES, store.get().scene) }));
  bar.time.addEventListener('click', () => store.set({ time: nextOf(CAR_TIMES, store.get().time) }));
  bar.lights.addEventListener('click', () => store.set({ headlights: !store.get().headlights }));
  bar.colors.addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) store.set({ color: b.dataset.color }); });
  syncBar(store.get());

  const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  const noop = () => {};
  const createCarStub = () => ({
    setTurn: noop, setSpeedKmh: noop, setColor: noop, setHeadlights: noop, setModel: noop,
    canPreviewJet: () => false, setJetPreview: () => false, jetPreviewActive: false,
    hasDoors: () => false, doorsOpen: false, doorsLocked: false, setDoors: () => false,
    setOrbit: noop, orbiting: false, setView: noop, setScene: noop, setTime: noop,
    setCompact: noop, setDarkMode: noop, setQuality: noop, setPaused: noop, resize: noop,
    getInfo: () => ({ paused: true, frames: 0 }), dispose: noop,
  });
  let car = createCarStub();
  let carReady = false;
  const fallback = $('#car-fallback');
  function initCar() {
    try {
      car = createCarView(els.canvas, { ...pick(store.get()), darkMode: !!dark?.matches, paused: !!store.get().minimal });
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
    jetButton.hidden = !carReady || !car.canPreviewJet();
    jetButton.setAttribute('aria-pressed', String(jetOn));
    jetButton.title = jetOn ? '關閉噴射' : '開啟噴射';
    const currentView = nameOf(CAR_VIEWS, store.get().view);
    bar.view.disabled = !carReady || viewLocked;
    bar.view.setAttribute('aria-label', viewLocked
      ? `目前為${currentView}，噴射中鎖定視角`
      : `目前為${currentView}，點按切換視角`);
    orbitButton.disabled = !carReady || viewLocked;
    orbitButton.setAttribute('aria-pressed', String(carReady && !!car.orbiting));
    const has = carReady && !!car.hasDoors();
    bar.doors.hidden = !has;
    const open = has && !!car.doorsOpen;
    const locked = has && !!car.doorsLocked; // 行駛中不能開門：按鈕停用並寫明原因，不要按了沒反應
    bar.doors.disabled = locked;
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

  function render() {
    const rawState = eng?.getState();
    const g = gpsKey(rawState);
    const state = g === 'OK' ? rawState : {
      ...rawState, speedKmh:null, headingDeg:null, focus:null, nearby:[], overspeed:false,
    };
    const settings = store.get();
    const layout = computeLayout(state, settings, config);
    appEl.className = `app layout-${layout}`;
    appEl.dataset.layout = layout;

    els.gps.dataset.status = g;
    const label = GPS_LABEL[g] || g;
    if (els.gpsText.textContent !== label) els.gpsText.textContent = label;
    $('#radar-state').textContent = g === 'OK' ? '偵測中' : g === 'IDLE' ? '待機中' : label;
    $('#radar-detail').textContent = RADAR_DETAIL[g] || '等待有效的 GPS 訊號';

    els.speed.textContent = state.speedKmh == null ? '—' : String(Math.round(state.speedKmh));
    els.speed.classList.toggle('empty', state.speedKmh == null);
    els.heading.textContent = headingText(state.headingDeg);
    try {
      car.setPaused?.(layout === 'minimal');
      car.setSpeedKmh(state.speedKmh || 0);
      if (layout !== 'normal' && car.orbiting) setOrbit(false);
      car.setCompact(layout === 'approach');
    } catch (err) {
      console.warn('3D 車模渲染更新失敗', err);
    }
    syncVehicleActions();

    const f = state.focus;
    const approaching = !!(f && f.phase === 'APPROACHING' && f.relation !== 'OPPOSITE');
    els.approach.hidden = !approaching;
    appEl.classList.toggle('has-approach', approaching);
    const over = approaching && !!state.overspeed;
    els.approach.classList.toggle('over', over);
    appEl.classList.toggle('overspeed', over);
    els.over.hidden = !over;
    if (approaching) {
      const lim = f.camera.limit;
      els.limit.textContent = lim == null ? '速限未知' : String(lim);
      els.limit.classList.toggle('unknown', lim == null);
      els.dist.textContent = String(Math.max(0, Math.round(f.distanceM / 10) * 10));
      els.addr.textContent = f.camera.address || '';
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
      if ((e.type === 'APPROACH_ALERT' || e.type === 'OVERSPEED_ALERT') && e.speechText) {
        panel.duckMusic();
        const ok = speech ? speech.speak(e.speechText) : false;
        els.voiceWarn.hidden = ok !== false ? true : false;
        e.__spoken = ok;
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
    if (speech) speech.unlock();
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
    render();
  }
  function stop() {
    running = false;
    geo?.stop(); wakeLock?.release(); speech?.cancel?.();
    clearInterval(tickTimer); tickTimer = null;
    eng?.reset(); adapterStatus = null; resetTurn(); relocating = false;
    els.start.textContent = '開始行車'; els.voiceWarn.hidden = true;
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

  store.subscribe((s) => {
    syncBar(s);
    render();
    try {
      car.setPaused?.(!!s.minimal);
      car.setModel(s.model);
      car.setColor(s.color);
      car.setHeadlights(s.headlights);
      car.setQuality(s.lowQuality ? 'low' : 'high');
      car.setView(s.view);
      car.setScene(s.scene);
      car.setTime(s.time);
      syncVehicleActions();
    } catch (err) {
      console.warn('3D 車模更新失敗', err);
    }
  });

  render();

  return {
    el: appEl,
    start, render, ingest, onFix, panel,
    get car() { return car; },
    setEngine(e) { resetTurn(); eng = e; relocating = false; render(); },
    setLastFix(f) { updateTurn(f); },
    onRender(cb) { renderCbs.push(cb); },
    onEvents(cb) { eventCbs.push(cb); },
    destroy() {
      resetTurn();
      panel.destroy();
      clearInterval(tickTimer);
      dark?.removeEventListener('change', onDarkChange);
      els.canvas.removeEventListener('webglcontextlost', onContextLost);
      els.canvas.removeEventListener('webglcontextrestored', onContextRestored);
      car?.dispose();
    },
  };
}
