// DriveHUD V1.6 — 模擬重播（Worker A）
// 把 scenario.fixes 依 1 Hz（× speed）餵進同一個 AlertEngine。
// 用 setTimeout 驅動，可注入 scheduler 以便測試。

/**
 * 模擬時鐘：讓 engine 的 now() 等於目前重播到的 fix.t，
 * 使「定位是否過期」的判定與實際播放速度無關（1× / 4× 結果相同）。
 */
export function createSimClock(start = 0) {
  let t = start;
  return { now: () => t, set: (v) => { t = v; } };
}

const defaultScheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

/**
 * @param {object} opts
 * @param {object|function} opts.engine
 *   建議傳 factory：`({ now }) => createAlertEngine({ cameras, config, now })`，player 會注入模擬時鐘。
 *   也可傳現成 engine 物件；此時請一併傳 `clock`（並以 clock.now 建立 engine），
 *   否則 player 會把 fix.t 平移到牆上時間（Date.now() 為基準）再餵入。
 * @param {import('../src/contracts/types.js').Scenario} opts.scenario
 * @param {number} [opts.speed=1]   1 = 每秒一筆；4 = 每 250 ms 一筆
 * @param {{setTimeout:Function, clearTimeout:Function}} [opts.scheduler]
 * @param {{now:()=>number, set:(t:number)=>void}} [opts.clock]
 */
export function createPlayer({ engine, scenario, speed = 1, scheduler = defaultScheduler, clock }) {
  const fixes = scenario.fixes || [];
  let simClock = clock || null;
  let eng;
  let rebase = 0; // 無 clock 時：fix.t 平移量

  if (typeof engine === 'function') {
    simClock = simClock || createSimClock(fixes[0]?.t ?? 0);
    eng = engine({ now: simClock.now, cameras: scenario.cameras });
  } else {
    eng = engine;
    eng.setCameras(scenario.cameras || []);
  }
  if (!simClock) rebase = Date.now() - (fixes[0]?.t ?? 0);

  const eventCbs = [];
  const stateCbs = [];
  const endCbs = [];
  let index = 0;
  let timer = null;
  let playing = false;
  let curSpeed = speed;

  function feed(i, emit) {
    const raw = fixes[i];
    const fix = rebase ? { ...raw, t: raw.t + rebase } : raw;
    if (simClock) simClock.set(fix.t);
    const events = [...eng.pushFix(fix), ...eng.tick()];
    if (emit) {
      for (const ev of events) for (const cb of eventCbs) cb(ev, i);
    }
    return events;
  }

  function emitState(fix) {
    const payload = { index, length: fixes.length, fix: fix ?? null, state: eng.getState() };
    for (const cb of stateCbs) cb(payload);
  }

  /** 前進一筆；回傳本筆事件。到底回傳 null。 */
  function step() {
    if (index >= fixes.length) return null;
    const i = index;
    const events = feed(i, true);
    index = i + 1;
    emitState(fixes[i]);
    if (index >= fixes.length) {
      stop();
      for (const cb of endCbs) cb();
    }
    return events;
  }

  function schedule() {
    timer = scheduler.setTimeout(() => {
      timer = null;
      if (!playing) return;
      step();
      if (playing) schedule();
    }, 1000 / curSpeed);
  }

  function stop() {
    playing = false;
    if (timer != null) { scheduler.clearTimeout(timer); timer = null; }
  }

  function play() {
    if (playing || index >= fixes.length) return;
    playing = true;
    schedule();
  }

  function pause() { stop(); }

  /** 跳到第 i 筆（尚未餵入）：清空 engine 後安靜重播 0..i-1，不觸發 onEvent。 */
  function seek(i) {
    const wasPlaying = playing;
    stop();
    const target = Math.max(0, Math.min(fixes.length, Math.floor(i)));
    eng.setCameras([]);          // 清除所有相機狀態（含已提醒旗標）
    eng.reset();
    eng.setCameras(scenario.cameras || []);
    for (let k = 0; k < target; k++) feed(k, false);
    index = target;
    emitState(target > 0 ? fixes[target - 1] : null);
    if (wasPlaying) play();
  }

  function setSpeed(v) {
    curSpeed = v > 0 ? v : 1;
    if (playing) { stop(); play(); }
  }

  return {
    play, pause, seek, step, setSpeed,
    onEvent(cb) { eventCbs.push(cb); return () => eventCbs.splice(eventCbs.indexOf(cb) >>> 0, 1); },
    onState(cb) { stateCbs.push(cb); return () => stateCbs.splice(stateCbs.indexOf(cb) >>> 0, 1); },
    onEnd(cb) { endCbs.push(cb); return () => endCbs.splice(endCbs.indexOf(cb) >>> 0, 1); },
    get index() { return index; },
    get length() { return fixes.length; },
    get playing() { return playing; },
    get speed() { return curSpeed; },
    get engine() { return eng; },
  };
}
