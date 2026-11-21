// 語音 adapter：speechSynthesis。iOS 需在使用者手勢內 unlock()。
import { CONFIG } from '../../config.js';

export function createSpeech({
  lang = CONFIG.speech.lang,
  rate = CONFIG.speech.rate,
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
} = {}) {
  const supported = !!(synth && Utterance);
  let voice = null;
  let voiceFallback = false;
  let picked = false;

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
      synth.cancel();
      const u = new Utterance(text);
      u.lang = lang;
      u.rate = rate;
      if (voice) u.voice = voice;
      synth.speak(u);
      return true;
    } catch (_) {
      return false;
    }
  }

  return {
    unlock,
    speak,
    cancel() { if (supported) synth.cancel(); },
    supported,
    get voiceFallback() { return voiceFallback; },
  };
}
