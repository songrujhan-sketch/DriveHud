// 五條模擬情境：事件類型與順序完全一致（比對時忽略 GPS_STATUS）、每類事件最多一次、通過後 focus=null
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAlertEngine } from '../../src/engine/alertEngine.js';
import { CONFIG } from '../../config.js';

const DIR = new URL('../../sim/scenarios/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', DIR), 'utf8'));
const load = (file) => JSON.parse(readFileSync(new URL(file, DIR), 'utf8'));

const ONCE_TYPES = ['APPROACH_ALERT', 'OVERSPEED_ALERT', 'PASSED', 'NEARBY'];
const LAYOUT = (state) => (state.focus ? 'approach' : 'normal'); // 引擎角度的版面（minimal 為使用者手動）

function play(sc) {
  let clock = sc.fixes[0].t;
  const engine = createAlertEngine({ cameras: sc.cameras, config: CONFIG, now: () => clock });
  const events = [];
  const states = [];
  sc.fixes.forEach((f, i) => {
    clock = f.t;
    for (const ev of [...engine.pushFix(f), ...engine.tick()]) events.push({ ...ev, index: i });
    states.push(engine.getState());
  });
  return { events, states, engine };
}

test('index.json 列出 5 條情境', () => {
  assert.equal(index.length, 5);
  assert.deepEqual(index.map((x) => x.id.slice(0, 2)), ['01', '02', '03', '04', '05']);
});

for (const entry of index) {
  describe(`情境 ${entry.id}：${entry.title}`, () => {
    const sc = load(entry.file);
    const { events, states } = play(sc);
    const got = events.filter((e) => e.type !== 'GPS_STATUS');

    test('格式：1 Hz、欄位齊全、有中文說明', () => {
      assert.ok(sc.title && sc.expectation && sc.expectedFinal && Array.isArray(sc.expectedEvents));
      for (let i = 1; i < sc.fixes.length; i++) assert.equal(sc.fixes[i].t - sc.fixes[i - 1].t, 1000);
      for (const f of sc.fixes) {
        for (const k of ['t', 'lat', 'lon', 'speedMps', 'headingDeg', 'accuracyM']) assert.ok(k in f, k);
      }
      for (const c of sc.cameras) assert.equal(c.directionKnown, c.bearings.length > 0);
    });

    test('事件類型與順序完全一致', () => {
      assert.deepEqual(got.map((e) => e.type), sc.expectedEvents.map((e) => e.type));
      sc.expectedEvents.forEach((exp, i) => {
        if (exp.camera) assert.equal(got[i].camera?.id, exp.camera, `第 ${i} 個事件的相機`);
      });
    });

    test('同一次接近每類提醒事件最多一次', () => {
      for (const type of ONCE_TYPES) {
        const perCam = new Map();
        for (const e of got.filter((x) => x.type === type)) perCam.set(e.camera.id, (perCam.get(e.camera.id) ?? 0) + 1);
        for (const [id, n] of perCam) assert.ok(n <= 1, `${type} ${id} 出現 ${n} 次`);
      }
    });

    test('結束狀態：focus=null、版面與車速型別符合 expectedFinal', () => {
      const last = states.at(-1);
      assert.equal(last.focus, null);
      assert.equal(last.overspeed, false);
      assert.equal(LAYOUT(last), sc.expectedFinal.layout);
      assert.equal(last.speedKmh === null ? 'null' : typeof last.speedKmh, sc.expectedFinal.speedKmh);
    });

    test('PASSED 之後 focus=null', () => {
      const p = got.find((e) => e.type === 'PASSED');
      if (p) for (let i = p.index; i < states.length; i++) assert.equal(states[i].focus, null);
    });
  });
}

describe('情境細節', () => {
  test('① 接近語音與超速語音內容；超速期間 state.overspeed=true', () => {
    const { events, states } = play(load('01-same-dir-overspeed.json'));
    const a = events.find((e) => e.type === 'APPROACH_ALERT');
    const o = events.find((e) => e.type === 'OVERSPEED_ALERT');
    assert.equal(a.speechText, '前方一百公尺有測速照相，速限五十');
    assert.equal(o.speechText, '注意，目前超速，速限五十');
    assert.equal(states[o.index].overspeed, true);
    assert.equal(states[a.index].focus.phase, 'APPROACHING');
    assert.equal(states[a.index].focus.relation, 'SAME');
  });

  test('② 反向全程 focus 與 nearby 皆空', () => {
    const { states } = play(load('02-opposite-skip.json'));
    assert.ok(states.every((s) => s.focus === null && s.nearby.length === 0));
  });

  test('③ NEARBY 時列入 nearby、focus 仍為 null', () => {
    const { events, states } = play(load('03-parallel-unknown-dir.json'));
    const n = events.find((e) => e.type === 'NEARBY');
    assert.equal(states[n.index].nearby.length, 1);
    assert.equal(states[n.index].nearby[0].relation, 'AMBIGUOUS');
    assert.ok(states.every((s) => s.focus === null));
  });

  test('④ 停車期間維持 APPROACHING 與 stationary=true，且停車樣本含 ±8 m 漂移', () => {
    const sc = load('04-red-light-drift.json');
    const { events, states } = play(sc);
    const s0 = events.find((e) => e.type === 'STATIONARY').index;
    const s1 = events.find((e) => e.type === 'MOVING').index;
    assert.ok(s1 - s0 >= 17, '停車約 20 秒');
    for (let i = s0; i < s1; i++) {
      assert.equal(states[i].stationary, true);
      assert.equal(states[i].focus?.phase, 'APPROACHING');
    }
    const stopped = sc.fixes.filter((f) => f.speedMps < 1);
    const lats = stopped.map((f) => f.lat);
    const spreadM = (Math.max(...lats) - Math.min(...lats)) * 111000;
    assert.ok(spreadM > 6 && spreadM <= 16.5, `漂移幅度 ${spreadM.toFixed(1)} m`);
  });

  test('⑤ 訊號不佳 8 秒期間 speedKmh=null、gps=POOR；恢復後於 200 m 內提醒', () => {
    const sc = load('05-expressway-gps-loss.json');
    const { events, states } = play(sc);
    const { fromIndex, toIndex } = sc.outage;
    assert.equal(toIndex - fromIndex, 8);
    for (let i = fromIndex; i < toIndex; i++) {
      assert.equal(states[i].speedKmh, null);
      assert.equal(states[i].gps, 'POOR');
    }
    assert.notEqual(states[toIndex].speedKmh, null);
    const a = events.find((e) => e.type === 'APPROACH_ALERT');
    assert.ok(a.index > toIndex && a.distanceM <= CONFIG.alert.radiusExpresswayM);
    assert.equal(a.speechText, '前方兩百公尺有測速照相，速限八十');
  });
});
