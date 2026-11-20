// STUB：模擬播放器。介面對應 Worker A 的 sim/player.js（play/pause/seek/onEvent/onState + 本 stub 的 setSpeed）。
export function createPlayer({ engine, scenario, speed = 1 }) {
  let idx = 0, timer = null, mult = speed;
  const evCbs = [], stCbs = [];
  function step() {
    const f = scenario.fixes[idx];
    if (!f) { pause(); return; }
    const ev = engine.pushFix(f);
    idx += 1;
    ev.forEach((e) => evCbs.forEach((cb) => cb(e)));
    stCbs.forEach((cb) => cb(engine.getState()));
    if (idx >= scenario.fixes.length) pause();
  }
  function play() { if (!timer) timer = setInterval(step, 1000 / mult); }
  function pause() { clearInterval(timer); timer = null; }
  return {
    play, pause,
    seek(i) { idx = Math.max(0, Math.min(i, scenario.fixes.length)); },
    setSpeed(m) { mult = m; if (timer) { pause(); play(); } },
    onEvent(cb) { evCbs.push(cb); },
    onState(cb) { stCbs.push(cb); },
    get index() { return idx; },
    get playing() { return !!timer; },
  };
}
