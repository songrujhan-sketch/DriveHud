// sim.html：不需 GPS。把情境的 fixes 餵進同一個 engine，並以和主畫面相同的 createApp 渲染。
import { CONFIG, createAlertEngine } from './deps.js?v=1.9.3';
import { createPlayer } from '../../sim/player.js';
import { createApp } from './app.js?v=1.9.3';
import { createSettingsStore } from './settings.js?v=1.9.3';

/** 真實情境檔已就位。 */
const USE_REAL_SCENARIOS = true;
/** sim.html 的固定情境清單（相對於 sim.html；對應 sim/scenarios/index.json）。 */
const SCENARIO_FILES = [
  './sim/scenarios/01-same-dir-overspeed.json',
  './sim/scenarios/02-opposite-skip.json',
  './sim/scenarios/03-parallel-unknown-dir.json',
  './sim/scenarios/04-red-light-drift.json',
  './sim/scenarios/05-expressway-gps-loss.json',
];
/** 找不到真實情境時的備援。相對於 sim.html。 */
const DEMO_SCENARIO_FILE = './src/ui/__stub__/scenario-demo.json';

const TRACKED = ['APPROACH_ALERT', 'NEARBY', 'OVERSPEED_ALERT', 'PASSED'];
const EVENT_LABEL = {
  APPROACH_ALERT: '接近提醒', NEARBY: '附近測速點', OVERSPEED_ALERT: '超速提醒', PASSED: '已通過',
  FIX_STALE: '定位過期', FIX_VALID: '定位恢復', STATIONARY: '停車', MOVING: '行駛', GPS_STATUS: 'GPS 狀態',
};

async function loadScenarios() {
  const out = [];
  for (const url of USE_REAL_SCENARIOS ? SCENARIO_FILES : []) {
    try {
      const r = await fetch(url);
      if (r.ok) out.push(await r.json());
    } catch (_) { /* 情境檔尚未產出：略過 */ }
  }
  if (!out.length) {
    const r = await fetch(DEMO_SCENARIO_FILE);
    const d = await r.json();
    d.__demo = true;
    out.push(d);
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const expectedTypes = (sc) => (sc.expectedEvents || []).map((e) => e.type);

async function boot() {
  const root = document.getElementById('sim-root');
  const scenarios = await loadScenarios();
  root.innerHTML = `
    <div class="sim-layout">
      <div class="sim-stage" id="stage"></div>
      <aside class="sim-panel" id="sim-panel">
        <h1>模擬測試 <small>不需 GPS</small></h1>
        <ol class="sim-list" id="sim-list"></ol>
        <div class="sim-controls">
          <button type="button" class="dh-btn primary" id="sim-play">播放</button>
          <button type="button" class="dh-btn" id="sim-pause">暫停</button>
          <button type="button" class="dh-btn" id="sim-restart">重來</button>
          <span class="sim-speed" role="group" aria-label="倍速">
            <button type="button" class="dh-btn" data-speed="1" aria-pressed="true">1×</button>
            <button type="button" class="dh-btn" data-speed="4" aria-pressed="false">4×</button>
          </span>
        </div>
        <div class="sim-progress"><progress id="sim-progress" value="0" max="1"></progress><span id="sim-progress-text">0 / 0</span></div>
        <div id="sim-status" data-state="idle">尚未開始</div>
        <div id="sim-result" data-pass="" hidden></div>
        <div id="sim-seen" data-layouts="" data-nearby="false" data-overspeed="false"></div>
        <h2>事件記錄</h2>
        <ul class="sim-log" id="event-log"></ul>
        <h2>語音記錄（模擬，不實際發聲）</h2>
        <ul class="sim-log" id="speech-log"></ul>
      </aside>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const store = createSettingsStore();
  const speechLog = [];
  const speech = {
    supported: true,
    unlock() {},
    speak(text) {
      speechLog.push(text);
      const li = document.createElement('li');
      li.dataset.speech = '';
      li.textContent = text;
      $('#speech-log').appendChild(li);
      return true;
    },
  };

  let current = 0, speedMult = 1, engine = null, player = null, simNow = 0, idx = 0;
  let layouts = new Set(), sawNearby = false, sawOver = false, evTypes = [];

  const app = createApp({ root: $('#stage'), mode: 'sim', engine: null, store, speech, autoTick: false });
  app.onRender((v) => {
    layouts.add(v.layout);
    if (v.nearbyHint) sawNearby = true;
    if (v.overspeed) sawOver = true;
    const seen = $('#sim-seen');
    seen.dataset.layouts = [...layouts].join(',');
    seen.dataset.nearby = String(sawNearby);
    seen.dataset.overspeed = String(sawOver);
  });

  function logEvents(events) {
    const log = $('#event-log');
    for (const e of events) {
      evTypes.push(e.type);
      const li = document.createElement('li');
      li.dataset.type = e.type;
      const extra = e.camera ? ` ｜ ${esc(e.camera.address || '')}` : e.status ? ` ｜ ${e.status}` : '';
      const dist = e.distanceM != null ? ` ${Math.round(e.distanceM)} m` : '';
      li.innerHTML = `<b>${e.type}</b> ${EVENT_LABEL[e.type] || ''}${dist}${extra}${e.speechText ? `<br><span class="muted">${esc(e.speechText)}</span>` : ''}`;
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
    }
  }
  app.onEvents(logEvents);

  function setStatus(state, text) {
    const s = $('#sim-status');
    s.dataset.state = state;
    s.textContent = text;
  }

  function finish(sc) {
    const exp = expectedTypes(sc).filter((t) => TRACKED.includes(t));
    const got = evTypes.filter((t) => TRACKED.includes(t));
    const pass = JSON.stringify(exp) === JSON.stringify(got);
    const r = $('#sim-result');
    r.hidden = false;
    r.dataset.pass = String(pass);
    r.innerHTML = `${pass ? '符合預期' : '與預期不符'}<br><span class="muted">預期：${exp.join(' → ') || '（無提醒）'}<br>實際：${got.join(' → ') || '（無提醒）'}</span>`;
    setStatus('done', '播放完畢');
  }

  function select(i) {
    if (player) player.pause();
    current = i;
    const sc = scenarios[i];
    simNow = sc.fixes.length ? sc.fixes[0].t : 0;
    idx = 0; layouts = new Set(); sawNearby = false; sawOver = false; evTypes = [];
    $('#event-log').innerHTML = ''; $('#speech-log').innerHTML = '';
    speechLog.length = 0;
    const r = $('#sim-result'); r.hidden = true; r.dataset.pass = '';
    const real = createAlertEngine({ cameras: sc.cameras || [], config: CONFIG, now: () => simNow });
    // 包一層：同步模擬時鐘、記錄進度，並把事件送進共用 UI。
    engine = {
      pushFix(fix) {
        simNow = fix.t; idx += 1;
        const ev = real.pushFix(fix);
        app.setLastFix(fix);
        app.ingest(ev);
        updateProgress();
        if (idx >= sc.fixes.length) finish(sc);
        return ev;
      },
      tick() { const ev = real.tick(); if (ev && ev.length) app.ingest(ev); return ev; },
      getState: () => real.getState(),
      setCameras: (c) => real.setCameras(c),
      reset: () => real.reset(),
    };
    app.setEngine(engine);
    player = createPlayer({ engine, scenario: sc, speed: speedMult });
    updateProgress();
    setStatus('ready', '就緒');
    root.querySelectorAll('#sim-list li').forEach((li, k) => li.classList.toggle('active', k === i));
  }

  function updateProgress() {
    const n = scenarios[current].fixes.length;
    const p = $('#sim-progress');
    p.max = n; p.value = idx;
    $('#sim-progress-text').textContent = `${idx} / ${n}`;
  }

  $('#sim-list').innerHTML = scenarios.map((sc, i) => `
    <li data-index="${i}"><button type="button" class="sim-item" data-index="${i}">
      <span class="sim-title">${i + 1}. ${esc(sc.title || sc.id)}</span>
      <span class="sim-exp">預期：${esc(expectedTypes(sc).join(' → ') || '無提醒')}${sc.expectedFinal && sc.expectedFinal.layout ? `；結束版面 ${esc(sc.expectedFinal.layout)}` : ''}</span>
    </button></li>`).join('');
  $('#sim-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-index]');
    if (b) select(Number(b.dataset.index));
  });
  $('#sim-play').addEventListener('click', () => {
    if (idx >= scenarios[current].fixes.length) select(current);
    player.play(); setStatus('playing', '播放中');
  });
  $('#sim-pause').addEventListener('click', () => { player.pause(); setStatus('paused', '已暫停'); });
  $('#sim-restart').addEventListener('click', () => select(current));
  root.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    speedMult = Number(b.dataset.speed);
    root.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    player.setSpeed ? player.setSpeed(speedMult) : null;
  }));

  select(0);
  window.__sim = { scenarios, select, get layouts() { return [...layouts]; } };
}
boot();
