// DriveHUD UI 外殼：live（真實 GPS）與 sim（模擬）共用同一組元件，差別只在餵資料的來源。
import { CONFIG, createCarView } from './deps.js';
import { createSettingsPanel } from './settings.js';
import { openGoogleMaps } from '../adapters/maps.js';

export const GPS_LABEL = {
  SEARCHING: '定位中',
  OK: '定位正常',
  POOR: '訊號不佳',
  DENIED: '權限遭拒',
  STALE: '訊號不佳',
  RELOCATING: '重新定位中',
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

export const SHELL_HTML = `
<div id="app" class="app layout-normal" data-layout="normal" data-mode="live">
  <div class="frame">
    <header class="topbar">
      <div class="gps" id="gps-status" data-status="SEARCHING"><span class="dot"></span><span class="gps-text">定位中</span></div>
      <span class="voice-warn" id="voice-warn" hidden>語音無法播放</span>
      <div class="top-actions">
        <button type="button" class="dh-btn" id="btn-maps">地圖</button>
        <button type="button" class="dh-btn" id="btn-settings">設定</button>
      </div>
    </header>
    <div class="car-zone"><canvas id="car-canvas" aria-label="車輛"></canvas></div>
    <div class="speed-zone">
      <div class="speed" id="speed-value" aria-live="off">—</div>
      <div class="speed-meta"><span class="speed-unit">km/h</span><span class="heading" id="heading">—</span></div>
    </div>
    <section class="approach" id="approach" hidden aria-live="polite">
      <div class="ap-main">
        <div class="ap-limit"><span class="ap-label">速限</span><span class="ap-limit-val" id="limit-value">—</span></div>
        <div class="ap-dist"><span class="ap-label">剩餘</span><span class="ap-dist-val" id="dist-value">—</span><span class="ap-unit">m</span></div>
      </div>
      <div class="ap-addr" id="addr"></div>
      <div class="ap-over" id="over-label" hidden>超速</div>
    </section>
    <div class="nearby-hint" id="nearby-hint" hidden>附近測速點</div>
    <div class="sim-badge" id="sim-badge" hidden>模擬</div>
  </div>
  <button type="button" class="start-btn" id="btn-start">開始行車</button>
  <aside class="settings" id="settings-panel" aria-hidden="true"></aside>
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
  maps = { openGoogleMaps },
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
  $('#btn-settings').addEventListener('click', () => panel.toggle());

  const dark = globalThis.matchMedia ? globalThis.matchMedia('(prefers-color-scheme: dark)') : null;
  const car = createCarView(els.canvas, { ...pick(store.get()), darkMode: !!(dark && dark.matches) });
  if (dark && dark.addEventListener) dark.addEventListener('change', (e) => car.setDarkMode(e.matches));
  if (globalThis.ResizeObserver) new ResizeObserver(() => car.resize()).observe(els.canvas);

  let running = mode === 'sim';
  let relocating = false;
  let adapterStatus = null; // geolocation adapter 回報的狀態（用於 DENIED）
  let lastFix = null;
  let tickTimer = null;
  let eng = engine;
  const renderCbs = [];
  const eventCbs = [];

  function pick(s) { return { model: s.model, color: s.color, headlights: s.headlights, quality: s.lowQuality ? 'low' : 'high' }; }

  function gpsKey(state) {
    if (adapterStatus === 'DENIED') return 'DENIED';
    if (relocating) return 'RELOCATING';
    return (state && state.gps) || 'SEARCHING';
  }

  function render() {
    const state = eng ? eng.getState() : { gps: 'SEARCHING', speedKmh: null, headingDeg: null, focus: null, nearby: [], overspeed: false };
    const settings = store.get();
    const layout = computeLayout(state, settings, config);
    appEl.className = `app layout-${layout}`;
    appEl.dataset.layout = layout;

    const g = gpsKey(state);
    els.gps.dataset.status = g;
    els.gpsText.textContent = GPS_LABEL[g] || g;

    els.speed.textContent = state.speedKmh == null ? '—' : String(Math.round(state.speedKmh));
    els.heading.textContent = headingText(state.headingDeg);
    car.setSpeedKmh(state.speedKmh || 0);
    car.setCompact(layout === 'approach');

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
    lastFix = fix;
    if (!eng) return;
    ingest(eng.pushFix(fix));
  }

  function startTick() {
    if (tickTimer || !autoTick) return;
    tickTimer = setInterval(() => { if (eng) ingest(eng.tick()); }, 1000);
  }

  // 「開始行車」：先 speech.unlock（需在手勢內，故同步呼叫），再 wakeLock，再 geo.start。
  function start() {
    if (running) return;
    running = true;
    els.start.hidden = true;
    if (speech) speech.unlock();
    if (wakeLock) wakeLock.request();
    if (geo) geo.start(onFix, (s) => { adapterStatus = s; render(); });
    startTick();
    render();
  }
  els.start.addEventListener('click', start);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && running && mode === 'live' && eng) {
      eng.reset();
      relocating = true;
      render();
    }
  });

  $('#btn-maps').addEventListener('click', () => {
    maps.openGoogleMaps(lastFix ? { lat: lastFix.lat, lon: lastFix.lon } : null, { root: appEl });
  });

  store.subscribe((s) => {
    car.setModel(s.model); car.setColor(s.color); car.setHeadlights(s.headlights);
    if (car.setQuality) car.setQuality(s.lowQuality ? 'low' : 'high');
    render();
  });

  render();

  return {
    el: appEl,
    start, render, ingest, onFix, panel, car,
    setEngine(e) { eng = e; relocating = false; render(); },
    setLastFix(f) { lastFix = f; },
    onRender(cb) { renderCbs.push(cb); },
    onEvents(cb) { eventCbs.push(cb); },
    destroy() { clearInterval(tickTimer); car.dispose(); },
  };
}
