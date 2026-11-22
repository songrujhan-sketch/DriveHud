// 語音與螢幕常亮 adapter：失敗要回報，不可靜默。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech, SPEAK_AFTER_CANCEL_MS, START_TIMEOUT_MS } from '../../src/adapters/speech.js';
import { createWakeLock } from '../../src/adapters/wakelock.js';

function fakeTimers() {
  let now = 0, id = 0;
  const q = new Map();
  return {
    set: (fn, ms) => { q.set(++id, { fn, at: now + ms }); return id; },
    clear: (i) => q.delete(i),
    advance(ms) {
      now += ms;
      for (const [i, t] of [...q].sort((a, b) => a[1].at - b[1].at)) if (t.at <= now && q.has(i)) { q.delete(i); t.fn(); }
    },
  };
}

function fakeSynth({ autoStart = true } = {}) {
  const s = {
    speaking: false, pending: false, spoken: [], cancels: 0,
    speak(u) { s.spoken.push(u); if (autoStart && u.text.trim()) { s.speaking = true; u.onstart?.(); } },
    cancel() { s.cancels++; const cur = s.spoken.at(-1); s.speaking = false; cur?.onerror?.({ error: 'interrupted' }); },
    getVoices: () => [{ lang: 'zh-TW', name: 'Meijia' }],
  };
  return s;
}
class Utt { constructor(text) { this.text = text; } }

test('語音：閒置時直接播，開始發聲回報成功', () => {
  const t = fakeTimers(), synth = fakeSynth();
  const sp = createSpeech({ synth, Utterance: Utt, setTimer: t.set, clearTimer: t.clear });
  const seen = [];
  sp.onStatus((ok) => seen.push(ok));
  assert.equal(sp.speak('前方兩百公尺有測速照相'), true);
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].voice.name, 'Meijia');
  assert.deepEqual(seen, [true]);
  t.advance(START_TIMEOUT_MS + 10);
  assert.deepEqual(seen, [true], '已開始就不會再報逾時');
});

test('語音：播報中再來新句子 → 先 cancel，稍等再播；被打斷不算失敗', () => {
  const t = fakeTimers(), synth = fakeSynth();
  const sp = createSpeech({ synth, Utterance: Utt, setTimer: t.set, clearTimer: t.clear });
  const seen = [];
  sp.onStatus((ok) => seen.push(ok));
  sp.speak('第一句');
  sp.speak('第二句');
  assert.equal(synth.cancels, 1);
  assert.equal(synth.spoken.length, 1, 'cancel 後不立刻 speak');
  t.advance(SPEAK_AFTER_CANCEL_MS);
  assert.equal(synth.spoken.length, 2);
  assert.equal(synth.spoken[1].text, '第二句');
  assert.deepEqual(seen, [true, true]);
});

test('語音：遲遲沒有開始發聲 → 回報失敗', () => {
  const t = fakeTimers(), synth = fakeSynth({ autoStart: false });
  const sp = createSpeech({ synth, Utterance: Utt, setTimer: t.set, clearTimer: t.clear });
  const seen = [];
  sp.onStatus((ok, reason) => seen.push([ok, reason]));
  sp.speak('注意，目前超速');
  t.advance(START_TIMEOUT_MS + 1);
  assert.deepEqual(seen, [[false, 'timeout']]);
});

test('語音：系統回報錯誤 → 失敗；不支援時 speak 回傳 false', () => {
  const t = fakeTimers(), synth = fakeSynth({ autoStart: false });
  const sp = createSpeech({ synth, Utterance: Utt, setTimer: t.set, clearTimer: t.clear });
  const seen = [];
  sp.onStatus((ok, reason) => seen.push([ok, reason]));
  sp.speak('測試');
  synth.spoken[0].onerror({ error: 'not-allowed' });
  assert.deepEqual(seen, [[false, 'not-allowed']]);
  assert.equal(createSpeech({ synth: null, Utterance: null }).speak('x'), false);
});

function fakeWakeNavigator({ fail = false } = {}) {
  const sentinels = [];
  return {
    sentinels,
    wakeLock: {
      async request() {
        if (fail) throw new Error('NotAllowedError');
        const handlers = [];
        const s = { released: false, addEventListener: (_, h) => handlers.push(h), async release() { s.released = true; handlers.forEach((h) => h()); } };
        sentinels.push(s);
        return s;
      },
    },
  };
}
const fakeDoc = () => ({ visibilityState: 'visible', addEventListener() {} });

test('螢幕常亮：取得成功／失敗都會通知', async () => {
  const ok = createWakeLock({ navigatorImpl: fakeWakeNavigator(), documentImpl: fakeDoc() });
  const seen = [];
  ok.onChange((s) => seen.push(s.active));
  assert.equal(await ok.request(), true);
  assert.equal(ok.active, true);
  await ok.release();
  assert.equal(ok.active, false);
  assert.deepEqual(seen, [true, false]);

  const bad = createWakeLock({ navigatorImpl: fakeWakeNavigator({ fail: true }), documentImpl: fakeDoc() });
  const badSeen = [];
  bad.onChange((s) => badSeen.push(s));
  assert.equal(await bad.request(), false);
  assert.deepEqual(badSeen, [{ active: false, wanted: true, supported: true }]);

  const none = createWakeLock({ navigatorImpl: {}, documentImpl: fakeDoc() });
  const noneSeen = [];
  none.onChange((s) => noneSeen.push(s));
  assert.equal(await none.request(), false);
  assert.deepEqual(noneSeen, [{ active: false, wanted: true, supported: false }]);
});

test('螢幕常亮：系統收回（切到背景）時通知', async () => {
  const nav = fakeWakeNavigator();
  const wl = createWakeLock({ navigatorImpl: nav, documentImpl: fakeDoc() });
  const seen = [];
  await wl.request();
  wl.onChange((s) => seen.push(s.active));
  await nav.sentinels[0].release();
  assert.deepEqual(seen, [false]);
  assert.equal(wl.active, false);
});
