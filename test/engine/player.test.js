import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, createSimClock } from '../../sim/player.js';
import { createAlertEngine } from '../../src/engine/alertEngine.js';
import { CONFIG } from '../../config.js';

const sc = JSON.parse(readFileSync(new URL('../../sim/scenarios/01-same-dir-overspeed.json', import.meta.url), 'utf8'));
const factory = ({ now, cameras }) => createAlertEngine({ cameras, config: CONFIG, now });

/** 可手動推進的假 scheduler */
function fakeScheduler() {
  let q = [];
  let id = 0;
  return {
    setTimeout(fn, ms) { q.push({ id: ++id, fn, ms }); return id; },
    clearTimeout(i) { q = q.filter((x) => x.id !== i); },
    runNext() { const x = q.shift(); if (x) x.fn(); return x; },
    get pending() { return q.length; },
    get lastMs() { return q.at(-1)?.ms; },
  };
}

const alertTypes = (evs) => evs.filter((e) => e.type !== 'GPS_STATUS').map((e) => e.type);

test('play 以注入的 scheduler 逐筆推進，事件與預期一致，播完自動停止', () => {
  const sched = fakeScheduler();
  const p = createPlayer({ engine: factory, scenario: sc, speed: 4, scheduler: sched });
  const evs = [];
  const states = [];
  let ended = 0;
  p.onEvent((e) => evs.push(e));
  p.onState((s) => states.push(s));
  p.onEnd(() => ended++);
  assert.equal(p.length, sc.fixes.length);
  p.play();
  assert.equal(sched.lastMs, 250);
  while (sched.runNext());
  assert.equal(p.index, sc.fixes.length);
  assert.equal(p.playing, false);
  assert.equal(ended, 1);
  assert.equal(states.length, sc.fixes.length);
  assert.deepEqual(alertTypes(evs), sc.expectedEvents.map((e) => e.type));
  assert.equal(states.at(-1).state.focus, null);
});

test('pause 停止排程；play 繼續', () => {
  const sched = fakeScheduler();
  const p = createPlayer({ engine: factory, scenario: sc, scheduler: sched });
  p.play();
  sched.runNext(); sched.runNext();
  assert.equal(p.index, 2);
  p.pause();
  assert.equal(sched.pending, 0);
  p.play();
  sched.runNext();
  assert.equal(p.index, 3);
});

test('seek 清空引擎後安靜重播，之後的事件與從頭播放一致', () => {
  const sched = fakeScheduler();
  const p = createPlayer({ engine: factory, scenario: sc, scheduler: sched });
  const evs = [];
  p.onEvent((e) => evs.push(e.type));
  while (p.step());
  const full = alertTypes(evs.map((type) => ({ type })));
  evs.length = 0;
  p.seek(10);
  assert.equal(p.index, 10);
  assert.deepEqual(evs, [], 'seek 不觸發 onEvent');
  while (p.step());
  assert.deepEqual(alertTypes(evs.map((type) => ({ type }))), full.slice(1)); // 不含開頭的 FIX_VALID
  // seek 回 0 再播：完整一次
  evs.length = 0;
  p.seek(0);
  while (p.step());
  assert.deepEqual(alertTypes(evs.map((type) => ({ type }))), full);
});

test('傳入現成 engine + clock 也可使用；1× 與 4× 結果相同', () => {
  const results = [];
  for (const speed of [1, 4]) {
    const clock = createSimClock();
    const engine = createAlertEngine({ cameras: sc.cameras, config: CONFIG, now: clock.now });
    const sched = fakeScheduler();
    const p = createPlayer({ engine, clock, scenario: sc, speed, scheduler: sched });
    const evs = [];
    p.onEvent((e) => evs.push(e));
    p.play();
    while (sched.runNext());
    results.push(alertTypes(evs));
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], sc.expectedEvents.map((e) => e.type));
});

test('現成 engine（Date.now）且無 clock：fix.t 平移到牆上時間仍有效', () => {
  const engine = createAlertEngine({ cameras: sc.cameras, config: CONFIG });
  const p = createPlayer({ engine, scenario: sc, scheduler: fakeScheduler() });
  const evs = [];
  p.onEvent((e) => evs.push(e));
  for (let i = 0; i < 3; i++) p.step();
  assert.ok(evs.some((e) => e.type === 'FIX_VALID'));
});
