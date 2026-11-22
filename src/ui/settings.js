// 設定儲存（localStorage，全部 try/catch）與滑入式設定面板。
import { CONFIG, mountSettingsData, dataServices } from './deps.js?v=1.10.0';

export const CAR_MODELS = [
  { id: 'valkyrie', name: '女武神' },
  { id: 'darkknight', name: '黑騎士' },
  { id: 'asurada', name: '阿斯拉' },
  { id: 'rover', name: '豹勇士' },
  { id: 'tumbler', name: '重騎兵' },
  { id: 'daystar', name: '明日之星' },
  {id:'carriage',name:'馬車'},
  {id:'family',name:'休旅車'},
  { id: 'motorcycle', name: '重型機車' },
];
export const CAR_COLORS = [
  { hex: '#d32f2f', name: '赤紅' },
  { hex: '#f37639', name: '熔岩橘' },
  { hex: '#f2b705', name: '亮黃' },
  { hex: '#c9a44f', name: '金色' },
  { hex: '#82ed20', name: '亮綠' },
  { hex: '#2e9e5b', name: '森綠' },
  { hex: '#00594f', name: '深賽車綠' },
  { hex: '#1e6fd9', name: '深藍' },
  { hex: '#7a3fd1', name: '紫' },
  { hex: '#f5f5f5', name: '珍珠白' },
  { hex: '#c8d0d5', name: '銀色' },
  { hex: '#848684', name: '水泥灰' },
  { hex: '#15171a', name: '曜黑' },
  { hex: '#68734c', name: '綠色迷彩', swatch: 'conic-gradient(#68734c 25%,#353f33 0 54%,#a8a17a 0 76%,#536346 0)' },
  { hex: '#b39a75', name: '沙漠迷彩', swatch: 'conic-gradient(#b39a75 25%,#7d6349 0 54%,#dfc9a2 0 76%,#a28360 0)' },
  { hex: '#657174', name: '數位迷彩', swatch: 'conic-gradient(#657174 25%,#273238 0 50%,#aeb6b0 0 75%,#4e5c58 0) 0 0/10px 10px' },
];
export const CAR_VIEWS = [
  { id: 'front', name: '前 45°' },
  { id: 'head', name: '正面' },
  { id: 'side', name: '正側面' },
  { id: 'rear', name: '左後 45°' },
  { id: 'back', name: '正後方' },
  { id: 'right-rear', name: '右後 45°' },
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
/** 超速判定容忍（km/h）：0＝剛超過速限就提醒 */
export const TOLERANCES = [0, 5, 10];
export const DEFAULT_SETTINGS = {
  model: 'valkyrie', color: CAR_COLORS[0].hex, headlights: false, minimal: false, lowQuality: false,
  view: 'front', scene: 'studio', time: 'auto',
  toleranceKmh: 0, overspeedRepeat: true,
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
      if (TOLERANCES.includes(p.toleranceKmh)) cur.toleranceKmh = p.toleranceKmh;
      if (typeof p.overspeedRepeat === 'boolean') cur.overspeedRepeat = p.overspeedRepeat;
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
    <div class="sp-head"><h2 id="settings-title">設定</h2><button type="button" class="dh-btn" id="sp-close" aria-label="關閉設定">關閉</button></div>
    <div class="sp-body">
      <section class="sp-switches">
        <label class="sp-switch"><input type="checkbox" id="sp-music"><span>背景音樂</span></label>
        <label class="sp-volume">音量 <input id="sp-volume" aria-label="背景音樂音量" type="range" min="0" max="1" step="0.05" value="0.35"></label>
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
        <p class="sp-note">車速較快時改為依車速提前約 ${a.leadTimeS} 秒提醒（最遠 ${a.maxRadiusM} m）。</p>
      </section>
      <section><h3 id="sp-tol-title">超速提醒</h3>
        <div class="sp-chips" id="sp-tolerance" role="radiogroup" aria-labelledby="sp-tol-title">
          ${TOLERANCES.map((v) => `<button type="button" role="radio" class="chip" data-tol="${v}" aria-checked="false">${v === 0 ? '剛超過速限' : `超過 ${v} km/h`}</button>`).join('')}
        </div>
        <label class="sp-switch"><input type="checkbox" id="sp-repeat"><span>持續超速時每 ${config.ui.overspeedRepeatS} 秒提醒「請減速」</span></label>
      </section>
      <section><h3>測速資料</h3><div id="settings-data"></div></section>
    </div>`;
  const $ = (s) => el.querySelector(s);
  // 車款、車色、車燈在首頁下方的外觀列選，這裡不重複
  let audio = null, duckTimer = null;
  let playRequest = 0;
  function getMusicSrc() {
    const probe = audio || new Audio();
    const canM4a = typeof probe.canPlayType === 'function' && probe.canPlayType('audio/mp4; codecs="mp4a.40.2"') !== '';
    return new URL(canM4a ? '../../assets/night-drive.m4a' : '../../assets/night-drive.wav', import.meta.url).href;
  }
  function ensureAudio() {
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      audio.preload = 'none';
      audio.playsInline = true;
      audio.src = getMusicSrc();
    }
    return audio;
  }
  function level(duck = false) {
    if (!audio) return;
    const vol = Math.max(0, Math.min(1, Number($('#sp-volume').value) * (duck ? 0.15 : 1)));
    try { audio.volume = vol; } catch (_) { /* iOS Safari volume 為唯讀屬性 */ }
  }
  function duckMusic() {
    if (!audio || audio.paused) return;
    clearTimeout(duckTimer);
    level(true);
    const restore = () => { if (globalThis.speechSynthesis?.speaking) duckTimer = setTimeout(restore, 250); else level(false); };
    duckTimer = setTimeout(restore, 3500);
  }
  function stopMusic() {
    playRequest++;
    clearTimeout(duckTimer);
    duckTimer = null;
    if (audio) {
      try { audio.pause(); } catch (_) {}
      try { audio.currentTime = 0; } catch (_) {}
    }
  }
  $('#sp-volume').oninput = () => level(!!globalThis.speechSynthesis?.speaking);
  $('#sp-music').onchange = async (event) => {
    stopMusic();
    if (!event.target.checked) return;
    const request = playRequest;
    try {
      const player = ensureAudio();
      level(!!globalThis.speechSynthesis?.speaking);
      await player.play();
      if (request !== playRequest) {
        try { player.pause(); } catch (_) {}
        return;
      }
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
  function destroy() {
    close();
    el.removeEventListener('cancel', onCancel);
    el.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', pauseHidden);
    stopMusic();
    if (audio) {
      try { audio.removeAttribute?.('src'); } catch (_) {}
      audio = null;
    }
  }
  function sync(s) {
    $('#sp-minimal').checked = s.minimal;
    $('#sp-lowq').checked = !!s.lowQuality;
    $('#sp-repeat').checked = !!s.overspeedRepeat;
    el.querySelectorAll('[data-tol]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.tol) === s.toleranceKmh)));
  }
  $('#sp-repeat').addEventListener('change', (e) => store.set({ overspeedRepeat: e.target.checked }));
  $('#sp-tolerance').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tol]');
    if (b) store.set({ toleranceKmh: Number(b.dataset.tol) });
  });
  $('#sp-minimal').addEventListener('change', (e) => store.set({ minimal: e.target.checked }));
  $('#sp-lowq').addEventListener('change', (e) => store.set({ lowQuality: e.target.checked }));
  $('#sp-close').addEventListener('click', () => close());
  store.subscribe(sync);
  sync(store.get());

  try { mountSettingsData($('#settings-data'), { store: dataServices.store, update: dataServices.update, config }); } catch (err) { $('#settings-data').textContent = '資料區塊載入失敗'; console.warn(err); }

  let trigger = null;
  el.inert = true;
  function open(invoker = document.activeElement) {
    if (el.open) return;
    trigger = invoker;
    el.inert = false;
    el.showModal();
    el.classList.add('open');
    $('#sp-close').focus();
  }
  function close() {
    if (!el.open) return;
    el.close();
    el.classList.remove('open');
    el.inert = true;
    if (trigger?.isConnected) trigger.focus();
    trigger = null;
  }
  function onCancel(event) {
    event.preventDefault();
    close();
  }
  function onKeydown(event) {
    if (event.key === 'Escape' && el.open) {
      event.preventDefault();
      close();
    }
  }
  el.addEventListener('cancel', onCancel);
  el.addEventListener('keydown', onKeydown);
  return { open, close, duckMusic, destroy, toggle: invoker => el.open ? close() : open(invoker) };
}
