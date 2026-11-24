// 語音 adapter：speechSynthesis。iOS 需在使用者手勢內 unlock()。
// 可靠度：
// - 正在播報時才先 cancel()，並稍等一下再 speak()；iOS Safari 在 cancel() 後立刻 speak() 偶爾會吞掉新的句子。
// - 播報結果用 onStatus(cb) 回報：開始發聲 → true；出錯或逾時沒有開始 → false（顯示「語音無法播放」）。
import { CONFIG } from '../../config.js?v=1.10.0';

export const SPEAK_AFTER_CANCEL_MS = 80;
export const START_TIMEOUT_MS = 3000;
const BENIGN_ERRORS = new Set(['interrupted', 'canceled']);

export function createSpeech({
  lang = CONFIG.speech.lang,
  rate = CONFIG.speech.rate,
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  const supported = !!(synth && Utterance);
  let voice = null;
  let voiceFallback = false;
  let picked = false;
  let watch = null;
  let pendingStart = null;
  let generation = 0;
  const listeners = [];
  const report = (ok, reason) => listeners.forEach((cb) => { try { cb(ok, reason); } catch (_) { /* ignore */ } });

  function pickVoice() {
    if (!supported) return;
    const voices = synth.getVoices ? synth.getVoices() : [];
    if (!voices.length) return; // 尚未載入，下次再選
    const norm = (s) => String(s || '').replace('_', '-').toLowerCase();
    voice = voices.find((v) => norm(v.lang) === 'zh-tw') || null;
    voiceFallback = !voice;
    picked = true;
  }
  if (supported && synth.addEventListener) {
    try { synth.addEventListener('voiceschanged', pickVoice); } catch (_) { /* ignore */ }
  }
  pickVoice();

  function clearPending() {
    if (watch != null) { clearTimer(watch); watch = null; }
    if (pendingStart != null) { clearTimer(pendingStart); pendingStart = null; }
  }

  function unlock() {
    if (!supported) return false;
    try {
      const u = new Utterance(' ');
      u.volume = 0;
      u.lang = lang;
      synth.speak(u);
      return true;
    } catch (_) {
      return false;
    }
  }

  function speak(text) {
    if (!supported || !text) return false;
    try {
      if (!picked) pickVoice();
      clearPending();
      const gen = ++generation;
      const busy = !!(synth.speaking || synth.pending);
      if (busy) synth.cancel();
      const u = new Utterance(text);
      u.lang = lang;
      u.rate = rate;
      if (voice) u.voice = voice;
      let started = false;
      u.onstart = () => {
        started = true;
        if (gen === generation && watch != null) { clearTimer(watch); watch = null; }
        report(true);
      };
      u.onerror = (e) => {
        if (gen !== generation) return;
        if (watch != null) { clearTimer(watch); watch = null; }
        const reason = e && e.error ? e.error : 'error';
        if (!BENIGN_ERRORS.has(reason)) report(false, reason);
      };
      // 回傳是否成功交給系統；閒置時同步呼叫，失敗要反映在 speak() 的回傳值，
      // 否則呼叫端會拿到 true 而把剛由 report(false) 顯示的警告又收起來。
      const go = () => {
        pendingStart = null;
        if (gen !== generation) return false;
        try { synth.speak(u); } catch (_) { report(false, 'speak-threw'); return false; }
        watch = setTimer(() => {
          watch = null;
          if (gen === generation && !started) report(false, 'timeout');
        }, START_TIMEOUT_MS);
        return true;
      };
      if (busy) { pendingStart = setTimer(go, SPEAK_AFTER_CANCEL_MS); return true; } // 延後播放的結果由 onStatus 回報
      return go();
    } catch (_) {
      report(false, 'speak-threw');
      return false;
    }
  }

  return {
    unlock,
    speak,
    cancel() {
      generation++;
      clearPending();
      if (supported) synth.cancel();
    },
    /** cb(ok:boolean, reason?:string)；回傳取消訂閱函式。 */
    onStatus(cb) {
      listeners.push(cb);
      return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
    },
    supported,
    get voiceFallback() { return voiceFallback; },
  };
}
