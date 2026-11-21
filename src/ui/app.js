// DriveHUD UI 外殼：live（真實 GPS）與 sim（模擬）共用同一組元件，差別只在餵資料的來源。
import { CONFIG, createCarView } from './deps.js';
import { createSettingsPanel, CAR_MODELS, CAR_COLORS, CAR_VIEWS, CAR_SCENES, CAR_TIMES } from './settings.js';
import { estimateTurn } from '../car/turn.js';

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
      <div class="console-brand"><span class="brand-stripes" aria-hidden="true">///</span> Drive<i>HUD</i></div><span class="build-tag">V1.7</span>
      <div class="top-actions"><span class="voice-warn" id="voice-warn" hidden>語音無法播放</span>
      <button type="button" class="start-btn" id="btn-start">開始行車</button><button type="button" class="dh-btn" id="btn-settings">設定</button></div>
    </header>
    <button type="button" class="car-zone" id="cb-view" title="點按切換視角"><canvas id="car-canvas" aria-label="車輛"></canvas>
      
    </button>
    <div class="speed-zone"><span class="meter-label">即時速度</span>
      <div class="speed-line"><div class="speed" id="speed-value" aria-live="off">—</div><span class="speed-unit">km/h</span></div>
      <div class="speed-meta"><div class="gps" id="gps-status" data-status="SEARCHING"><span class="dot"></span><span class="gps-text">定位中</span></div><span class="heading" id="heading">—</span></div>
    </div>
    <section class="radar-idle"><span class="meter-label">測速雷達</span><strong id="radar-state">等待定位</strong><span id="radar-detail">開始行車後偵測前方測速點</span></section>
    <section class="approach" id="approach" hidden aria-live="polite">
      <div class="ap-main">
        <div class="ap-limit"><span class="ap-label">速限</span><span class="ap-limit-val" id="limit-value">—</span></div>
        <div class="ap-dist"><span class="ap-label">剩餘</span><span class="ap-dist-val" id="dist-value">—</span><span class="ap-unit">m</span></div>
      </div>
      <div class="ap-addr" id="addr"></div>
      <div class="ap-over" id="over-label" hidden>超速</div>
    </section>
    <div class="garage-controls">
      <button type="button" class="cb-btn" id="cb-model" title="點按切換車款">女武神</button>
    <details class="appearance"><summary>外觀與場景 <span id="appearance-current"></span></summary>
    <div class="carbar" id="carbar" role="group" aria-label="車輛外觀">
      <div class="cb-swatches" id="cb-colors" role="radiogroup" aria-label="車色"></div>
      <button type="button" class="cb-btn" id="cb-lights" aria-pressed="false">車燈</button>
      <button type="button" class="cb-btn" id="cb-doors" aria-pressed="false" hidden>車門</button>
      <button type="button" class="cb-btn" id="cb-jet" hidden>停車噴射預覽</button>
      <button type="button" class="cb-btn" id="cb-scene">場景</button>
      <button type="button" class="cb-btn" id="cb-time">時段</button>
    </div>
    </details>
    </div>
    <footer class="console-foot"><a href="./sim.html">行車模擬</a><button id="btn-data" type="button">測速資料庫</button></footer>
    <div class="nearby-hint" id="nearby-hint" hidden>附近測速點</div>
    <div class="sim-badge" id="sim-badge" hidden>模擬</div>
  </div>
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
  $('#btn-data').addEventListener('click', () => { panel.open(); $('#settings-data').scrollIntoView({block:'center'}); });
  $('#btn-settings').addEventListener('click', () => panel.toggle());

  // 外觀列：車款、車色、視角、車燈、場景、時段都在畫面下方，不遮住車子；與設定面板共用同一個 store。
  const bar = { model: $('#cb-model'), colors: $('#cb-colors'), view: $('#cb-view'), lights: $('#cb-lights'), doors: $('#cb-doors'), scene: $('#cb-scene'), time: $('#cb-time') };
  bar.colors.innerHTML = CAR_COLORS.map((c) => `<button type="button" role="radio" class="cb-swatch" data-color="${c.hex}" aria-label="${c.name}" title="${c.name}" style="--sw:${c.hex}"></button>`).join('');
  const nextOf = (list, id) => list[(list.findIndex((x) => x.id === id) + 1) % list.length].id;
  const nameOf = (list, id) => (list.find((x) => x.id === id) || list[0]).name;
  function syncBar(s) {
    $('#appearance-current').textContent = nameOf(CAR_SCENES, s.scene);
    bar.model.textContent = nameOf(CAR_MODELS, s.model);
    bar.view.setAttribute('aria-label', `目前為${nameOf(CAR_VIEWS, s.view)}，點按切換視角`);
    bar.scene.textContent = `場景：${nameOf(CAR_SCENES, s.scene)}`;
    bar.time.textContent = `時段：${nameOf(CAR_TIMES, s.time)}`;
    bar.lights.textContent = `車燈：${s.headlights ? '開' : '關'}`;
    bar.lights.setAttribute('aria-pressed', String(!!s.headlights));
    bar.colors.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === s.color)));
  }
  bar.model.addEventListener('click', () => store.set({ model: nextOf(CAR_MODELS, store.get().model) }));
  bar.view.addEventListener('click', () => store.set({ view: nextOf(CAR_VIEWS, store.get().view) }));
  bar.scene.addEventListener('click', () => store.set({ scene: nextOf(CAR_SCENES, store.get().scene) }));
  bar.time.addEventListener('click', () => store.set({ time: nextOf(CAR_TIMES, store.get().time) }));
  bar.lights.addEventListener('click', () => store.set({ headlights: !store.get().headlights }));
  bar.colors.addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) store.set({ color: b.dataset.color }); });
  syncBar(store.get());

  const dark = globalThis.matchMedia ? globalThis.matchMedia('(prefers-color-scheme: dark)') : null;
  const car = createCarView(els.canvas, { ...pick(store.get()), darkMode: !!(dark && dark.matches) });
  if (dark && dark.addEventListener) dark.addEventListener('change', (e) => car.setDarkMode(e.matches));
  // 車門：只有具備車門動作的車款才顯示；開合狀態不存檔，車速到 5 km/h 就自動關上並鎖定
  function syncDoors() {
    $('#cb-jet').hidden = !car.canPreviewJet?.();
    const has = !!(car.hasDoors && car.hasDoors());
    bar.doors.hidden = !has;
    const open = has && !!car.doorsOpen;
    const locked = has && !!car.doorsLocked; // 行駛中不能開門：按鈕停用並寫明原因，不要按了沒反應
    bar.doors.disabled = locked;
    bar.doors.textContent = locked ? '車門：行駛中鎖定' : `車門：${open ? '開' : '關'}`;
    bar.doors.setAttribute('aria-pressed', String(open));
  }
  bar.doors.addEventListener('click', () => { if (car.setDoors) car.setDoors(!car.doorsOpen); syncDoors(); });
  $('#cb-jet').addEventListener('click', () => {
    store.set({view:store.get().model === 'asurada' ? 'back' : 'rear'});
    car.previewJet();
  });
  syncDoors();
  if (globalThis.ResizeObserver) new ResizeObserver(() => car.resize()).observe(els.canvas);

  let running = mode === 'sim';
  let relocating = false;
  let adapterStatus = null; // geolocation adapter 回報的狀態（用於 DENIED）
  let previousCourse = null, turnTimeout;
  function resetTurn() {
    clearTimeout(turnTimeout); previousCourse = null; car.setTurn(0);
  }
  function updateTurn(fix) {
    const state = eng?.getState();
    if (state?.gps !== 'OK' || !(state.speedKmh >= 8) || !Number.isFinite(state.headingDeg)) {
      resetTurn(); return;
    }
    const course = { t:fix.t, heading:state.headingDeg, speed:state.speedKmh/3.6 };
    car.setTurn(estimateTurn(previousCourse,course)); previousCourse=course;
    clearTimeout(turnTimeout); turnTimeout=setTimeout(resetTurn,2500);
  }
  let tickTimer = null;
  let eng = engine;
  const renderCbs = [];
  const eventCbs = [];

  function pick(s) { return { model: s.model, color: s.color, headlights: s.headlights, quality: s.lowQuality ? 'low' : 'high', view: s.view, scene: s.scene, time: s.time }; }

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
    els.gpsText.textContent = running ? GPS_LABEL[g] || g : 'GPS 待命';
    $('#radar-state').textContent = !running ? '等待定位' : g === 'OK' ? '偵測中' : GPS_LABEL[g] || g;
    $('#radar-detail').textContent = !running ? '開始行車後偵測前方測速點' : g === 'OK' ? '掃描行進方向的固定測速點' : '等待有效的 GPS 訊號';

    els.speed.textContent = state.speedKmh == null ? '—' : String(Math.round(state.speedKmh));
    els.speed.classList.toggle('empty', state.speedKmh == null);
    els.heading.textContent = headingText(state.headingDeg);
    car.setSpeedKmh(state.speedKmh || 0);
    syncDoors();
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
    if (geo) geo.start(onFix, (s) => { adapterStatus = s; render(); });
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
    car.setModel(s.model); car.setColor(s.color); car.setHeadlights(s.headlights);
    if (car.setQuality) car.setQuality(s.lowQuality ? 'low' : 'high');
    if (car.setView) car.setView(s.view);
    if (car.setScene) car.setScene(s.scene);
    if (car.setTime) car.setTime(s.time);
    syncBar(s);
    syncDoors();
    render();
  });

  render();

  return {
    el: appEl,
    start, render, ingest, onFix, panel, car,
    setEngine(e) { resetTurn(); eng = e; relocating = false; render(); },
    setLastFix(f) { updateTurn(f); },
    onRender(cb) { renderCbs.push(cb); },
    onEvents(cb) { eventCbs.push(cb); },
    destroy() { resetTurn(); panel.destroy(); clearInterval(tickTimer); car.dispose(); },
  };
}
