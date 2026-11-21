// 設定儲存（localStorage，全部 try/catch）與滑入式設定面板。
import { CONFIG, mountSettingsData, dataServices } from './deps.js';

export const CAR_MODELS = [
  { id: 'valkyrie', name: '女武神' },
  { id: 'darkknight', name: '黑騎士' },
  { id: 'asurada', name: '阿斯拉' },
  { id: 'rover', name: '豹勇士' },
  { id: 'tumbler', name: '重騎兵' },
];
export const CAR_COLORS = [
  { hex: '#d32f2f', name: '赤紅' },
  { hex: '#1e6fd9', name: '深藍' },
  { hex: '#f5f5f5', name: '珍珠白' },
  { hex: '#f2b705', name: '亮黃' },
  { hex: '#2e9e5b', name: '森綠' },
  { hex: '#7a3fd1', name: '紫' },
  { hex: '#15171a', name: '曜黑' },
  { hex: '#82ed20', name: '亮綠' },
  { hex: '#f37639', name: '熔岩橘' },
  { hex: '#c9a44f', name: '金色' },
  { hex: '#c8d0d5', name: '銀色' },
  { hex: '#00594f', name: '深賽車綠' },
];
export const CAR_VIEWS = [
  { id: 'front', name: '前 45°' },
  { id: 'head', name: '正面' },
  { id: 'side', name: '正側面' },
  { id: 'rear', name: '後 45°' },
  { id: 'back', name: '正後方' },
  { id: 'top', name: '上方' },
];
export const CAR_SCENES = [
  { id: 'studio', name: '展示間' },
  { id: 'mountain', name: '山路' },
  { id: 'city', name: '城市' },
  { id: 'track', name: '賽車場' },
  { id: 'coast', name: '海邊' },
];
export const CAR_TIMES = [
  { id: 'auto', name: '自動' }, // 跟隨系統明暗模式
  { id: 'day', name: '白天' },
  { id: 'night', name: '夜晚' },
];
export const DEFAULT_SETTINGS = {
  model: 'valkyrie', color: CAR_COLORS[0].hex, headlights: false, minimal: false, lowQuality: false,
  view: 'front', scene: 'studio', time: 'auto',
};
const KEY = 'drivehud.settings.v1';

export function createSettingsStore({ storage } = {}) {
  let store = storage;
  if (store === undefined) { try { store = globalThis.localStorage; } catch (_) { store = null; } }
  let cur = { ...DEFAULT_SETTINGS };
  try {
    const raw = store && store.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (CAR_MODELS.some((m) => m.id === p.model)) cur.model = p.model;
      if (CAR_COLORS.some((c) => c.hex === p.color)) cur.color = p.color;
      if (typeof p.headlights === 'boolean') cur.headlights = p.headlights;
      if (typeof p.minimal === 'boolean') cur.minimal = p.minimal;
      if (typeof p.lowQuality === 'boolean') cur.lowQuality = p.lowQuality;
      if (CAR_VIEWS.some((v) => v.id === p.view)) cur.view = p.view;
      if (CAR_SCENES.some((v) => v.id === p.scene)) cur.scene = p.scene;
      if (CAR_TIMES.some((v) => v.id === p.time)) cur.time = p.time;
    }
  } catch (_) { /* 損毀或無法存取：使用預設 */ }
  const subs = [];
  return {
    get: () => ({ ...cur }),
    set(patch) {
      cur = { ...cur, ...patch };
      try { store && store.setItem(KEY, JSON.stringify(cur)); } catch (_) { /* 私密瀏覽等：忽略 */ }
      subs.forEach((f) => f({ ...cur }));
    },
    subscribe(f) { subs.push(f); },
  };
}

export function createSettingsPanel({ el, store, config = CONFIG }) {
  const a = config.alert;
  el.innerHTML = `
    <div class="sp-head"><h2>設定</h2><button type="button" class="dh-btn" id="sp-close">關閉</button></div>
    <div class="sp-body">
      <section class="sp-switches">
        <label class="sp-switch"><input type="checkbox" id="sp-music"><span>背景音樂</span></label>
        <label>音量 <input id="sp-volume" type="range" min="0" max="1" step="0.05" value="0.35"></label>
        <small role="status" id="music-status"></small>
        <label class="sp-switch"><input type="checkbox" id="sp-minimal"><span>極簡模式（隱藏車模）</span></label>
        <label class="sp-switch"><input type="checkbox" id="sp-lowq"><span>車模低畫質（卡頓或發熱時開啟）</span></label>
      </section>
      <section><h3>提醒距離</h3>
        <ul class="sp-readout" id="sp-radius">
          <li>市區：<b>${a.radiusUrbanM}</b> m</li>
          <li>快速道路：<b>${a.radiusExpresswayM}</b> m</li>
          <li>道路類型未知：<b>${a.radiusUnknownM}</b> m</li>
        </ul>
      </section>
      <section><h3>測速資料</h3><div id="settings-data"></div></section>
    </div>`;
  const $ = (s) => el.querySelector(s);
  // 車款、車色、車燈在首頁下方的外觀列選，這裡不重複
  let audioContext, gain, source, bufferPromise, duckTimer;
  let playRequest = 0;
  function level(duck = false) {
    if (!gain) return;
    gain.gain.setTargetAtTime(Number($('#sp-volume').value) * (duck ? .15 : 1), audioContext.currentTime, .08);
  }
  function duckMusic() {
    if (!source) return;
    clearTimeout(duckTimer); level(true);
    const restore = () => { if (globalThis.speechSynthesis?.speaking) duckTimer = setTimeout(restore, 250); else level(); };
    duckTimer = setTimeout(restore, 3500);
  }
  function stopMusic() {
    playRequest++;
    clearTimeout(duckTimer);
    if (source) {
      source.stop();
      source.disconnect();
      source = null;
    }
  }
  $('#sp-volume').oninput = () => level(!!globalThis.speechSynthesis?.speaking);
  $('#sp-music').onchange = async (event) => {
    stopMusic();
    if (!event.target.checked) return;
    const request = playRequest;
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gain = audioContext.createGain();
        gain.connect(audioContext.destination);
      }
      const resumed = audioContext.resume();
      bufferPromise ??= fetch(new URL('../../assets/night-drive.wav', import.meta.url))
        .then(response => { if (!response.ok) throw Error('audio'); return response.arrayBuffer(); })
        .then(bytes => audioContext.decodeAudioData(bytes))
        .catch(error => { bufferPromise = null; throw error; });
      const [buffer] = await Promise.all([bufferPromise, resumed]);
      if (request !== playRequest) return;
      source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      level(!!globalThis.speechSynthesis?.speaking);
      source.start();
      $('#music-status').textContent = '';
    } catch {
      if (request !== playRequest) return;
      stopMusic();
      $('#sp-music').checked = false;
      $('#music-status').textContent = '音樂未能播放，請再試一次';
    }
  };
  function pauseHidden() { if (document.hidden) { stopMusic(); $('#sp-music').checked = false; } }
  document.addEventListener('visibilitychange', pauseHidden);
  function destroy() { document.removeEventListener('visibilitychange', pauseHidden); stopMusic(); audioContext?.close(); }
  function sync(s) {
    $('#sp-minimal').checked = s.minimal;
    $('#sp-lowq').checked = !!s.lowQuality;
  }
  $('#sp-minimal').addEventListener('change', (e) => store.set({ minimal: e.target.checked }));
  $('#sp-lowq').addEventListener('change', (e) => store.set({ lowQuality: e.target.checked }));
  $('#sp-close').addEventListener('click', () => close());
  store.subscribe(sync);
  sync(store.get());

  try { mountSettingsData($('#settings-data'), { store: dataServices.store, update: dataServices.update, config }); } catch (err) { $('#settings-data').textContent = '資料區塊載入失敗'; console.warn(err); }

  function open() { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
  function close() { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
  return { open, close, duckMusic, destroy, toggle: () => (el.classList.contains('open') ? close() : open()) };
}
