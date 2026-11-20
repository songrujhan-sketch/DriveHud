import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRelation, radiusFor, createAlertEngine, SCAN_RADIUS_M } from '../../src/engine/alertEngine.js';
import { parseDirect } from '../../src/engine/__stub__/direct.js';
import { destinationPoint } from '../../src/engine/geo.js';
import { cam, line, makeEngine, run, alertTypes, CONFIG, T0, CAM_LAT, CAM_LON } from './helpers.js';

const A = CONFIG.alert;

function camFromDirect(raw) {
  const d = parseDirect(raw, CONFIG);
  return cam({ bearings: d.bearings, bidirectional: d.bidirectional, directionKnown: d.known, rawDirect: raw });
}

describe('方向關係分類（direct → SAME/OPPOSITE/AMBIGUOUS）', () => {
  const table = [
    // [direct, 車輛 heading, 預期]
    ['西向東', 90, 'SAME'],
    ['西向東', 270, 'OPPOSITE'],
    ['西向東', 0, 'AMBIGUOUS'],
    ['西向東', 130, 'SAME'],       // |Δ|=40
    ['西向東', 140, 'AMBIGUOUS'],  // |Δ|=50
    ['西向東', 220, 'AMBIGUOUS'],  // |Δ|=130
    ['南向北', 0, 'SAME'],
    ['南向北', 180, 'OPPOSITE'],
    ['北往南', 180, 'SAME'],
    ['往南', 175, 'SAME'],
    ['南向', 180, 'SAME'],
    ['北上車道', 10, 'SAME'],
    ['南下車道', 0, 'OPPOSITE'],
    ['西南向東北', 45, 'SAME'],
    ['西南向東北', 225, 'OPPOSITE'],
    ['南北雙向', 0, 'SAME'],
    ['南北雙向', 180, 'SAME'],
    ['南北雙向', 90, 'AMBIGUOUS'],
    ['東西雙向', 270, 'SAME'],
    ['南北雙向(區間測速)', 185, 'SAME'],
    ['雙向', 90, 'SAME'],          // 無方位的雙向：預設視為同向（config.alert.bidirectionalUnknownAxisAsSame）
    ['往大溪方向', 90, 'AMBIGUOUS'],
    ['', 90, 'AMBIGUOUS'],
  ];
  for (const [raw, h, want] of table) {
    test(`「${raw}」heading=${h} → ${want}`, () => {
      assert.equal(classifyRelation(camFromDirect(raw), h, A), want);
    });
  }
  test('邊界：|Δ|=45 → SAME、|Δ|=135 → OPPOSITE、|Δ|=46 → AMBIGUOUS', () => {
    const c = cam({ bearings: [90] });
    assert.equal(classifyRelation(c, 135, A), 'SAME');
    assert.equal(classifyRelation(c, 136, A), 'AMBIGUOUS');
    assert.equal(classifyRelation(c, 225, A), 'OPPOSITE');
  });
  test('heading 為 null → AMBIGUOUS；bidirectional 且 bearings=[] → 預設 SAME，關閉旗標則 AMBIGUOUS', () => {
    assert.equal(classifyRelation(cam({ bearings: [90] }), null, A), 'AMBIGUOUS');
    assert.equal(classifyRelation(cam({ bearings: [], bidirectional: true }), 90, A), 'SAME');
    assert.equal(classifyRelation(cam({ bearings: [], bidirectional: true }), 90, { ...A, bidirectionalUnknownAxisAsSame: false }), 'AMBIGUOUS');
  });
  test('directSemantics=facing 時方向反轉', () => {
    const cfg = { ...CONFIG, data: { ...CONFIG.data, directSemantics: 'facing' } };
    const d = parseDirect('西向東', cfg);
    assert.deepEqual(d.bearings, [270]);
  });
  test('radiusFor 依 roadClass', () => {
    assert.equal(radiusFor(cam({ roadClass: 'urban' }), A), A.radiusUrbanM);
    assert.equal(radiusFor(cam({ roadClass: 'expressway' }), A), A.radiusExpresswayM);
    assert.equal(radiusFor(cam({ roadClass: 'unknown' }), A), A.radiusUnknownM);
  });
});

describe('車速', () => {
  test('speedMps 有值時直接使用', () => {
    const { engine, clock } = makeEngine([]);
    const { states } = run(engine, clock, line({ n: 2, mps: 10 }));
    assert.ok(Math.abs(states[1].speedKmh - 36) < 1e-9);
  });
  test('speedMps=null 時以位移／時間估算', () => {
    const { engine, clock } = makeEngine([]);
    const fixes = line({ n: 3, mps: 20, over: () => ({ speedMps: null }) });
    const { states } = run(engine, clock, fixes);
    assert.equal(states[0].speedKmh, null); // 第一筆無前一筆可估
    assert.ok(Math.abs(states[1].speedKmh - 72) < 0.5, `got ${states[1].speedKmh}`);
  });
  test('位移 < minDisplacementM 視為 0', () => {
    const { engine, clock } = makeEngine([]);
    const fixes = line({ n: 3, mps: CONFIG.fix.minDisplacementM - 1, over: () => ({ speedMps: null }) });
    const { states } = run(engine, clock, fixes);
    assert.equal(states[2].speedKmh, 0);
  });
});

describe('heading 沿用', () => {
  test('heading=null 時在 headingHoldMs 內沿用，超過則為 null', () => {
    const { engine, clock } = makeEngine([]);
    const hold = CONFIG.fix.headingHoldMs / 1000;
    const fixes = line({ n: hold + 3, heading: 90, over: (i) => (i >= 1 ? { headingDeg: null } : {}) });
    const { states } = run(engine, clock, fixes);
    assert.equal(states[1].headingDeg, 90);
    assert.equal(states[hold].headingDeg, 90);      // 剛好 15 s
    assert.equal(states[hold + 1].headingDeg, null); // 16 s
  });
});

describe('停車', () => {
  test('連續 stationaryMinFixes 筆低速 → STATIONARY；heading 凍結；恢復 → MOVING', () => {
    const { engine, clock } = makeEngine([]);
    const fixes = line({
      n: 12, mps: 10, heading: 90,
      over: (i) => (i >= 3 && i < 9 ? { speedMps: 0.2, headingDeg: (i * 77) % 360 } : {}),
    });
    const { events, states } = run(engine, clock, fixes);
    const n = CONFIG.fix.stationaryMinFixes;
    assert.deepEqual(alertTypes(events), ['FIX_VALID', 'STATIONARY', 'MOVING']);
    assert.equal(events.find((e) => e.type === 'STATIONARY').index, 3 + n - 1);
    assert.equal(events.find((e) => e.type === 'MOVING').index, 9);
    for (let i = 3 + n - 1; i < 9; i++) {
      assert.equal(states[i].stationary, true);
      assert.equal(states[i].headingDeg, states[3 + n - 2].headingDeg, '停車中 heading 凍結');
    }
  });

  test('停車期間座標漂移不改變 phase、不產生 PASSED／重複提醒', () => {
    const c = cam();
    const { engine, clock } = makeEngine([c]);
    // 以 14 m/s 接近到相機前約 150 m，之後停 20 s 並漂移 ±8 m（含遠離方向）
    const approach = line({ n: 35, mps: 13, startBeforeM: 13 * 34 + 150 });
    const last = approach[approach.length - 1];
    const drift = [];
    for (let i = 0; i < 20; i++) {
      const p = destinationPoint(last.lat, last.lon, i % 2 ? 270 : 90, 8);
      drift.push({ t: last.t + (i + 1) * 1000, lat: p.lat, lon: p.lon, speedMps: 0.3, headingDeg: null, accuracyM: 10 });
    }
    const { events, states } = run(engine, clock, [...approach, ...drift]);
    assert.deepEqual(alertTypes(events), ['FIX_VALID', 'APPROACH_ALERT', 'STATIONARY']);
    const lastState = states[states.length - 1];
    assert.equal(lastState.focus?.phase, 'APPROACHING');
  });
});

describe('提醒與超速', () => {
  test('同向通過：APPROACH_ALERT 與 PASSED 各一次，speechText 正確，通過後 focus=null', () => {
    const c = cam();
    const { engine, clock } = makeEngine([c]);
    const { events, states } = run(engine, clock, line({ n: 90, mps: 13 }));
    assert.deepEqual(alertTypes(events), ['FIX_VALID', 'APPROACH_ALERT', 'PASSED']);
    const a = events.find((e) => e.type === 'APPROACH_ALERT');
    assert.ok(a.distanceM <= A.radiusUrbanM);
    assert.equal(a.speechText, '前方三百公尺有測速照相，速限五十');
    assert.equal(a.camera.id, c.id);
    assert.equal(states.at(-1).focus, null);
  });

  test('相機不在前方（夾角 > aheadMaxDeg）→ 不提醒', () => {
    // 路徑在相機北側 400 m 平行通過：進入半徑時相機方位與 heading 夾角大
    const c = cam({ bearings: [90] });
    const { engine, clock } = makeEngine([c]);
    const { events } = run(engine, clock, line({ n: 90, mps: 13, lateralM: 290 }));
    assert.deepEqual(alertTypes(events), ['FIX_VALID']);
  });

  test('超速：連續 overspeedMinFixes 筆 → OVERSPEED_ALERT 一次、state.overspeed=true', () => {
    const c = cam({ limit: 50 });
    const { engine, clock } = makeEngine([c]);
    const { events, states } = run(engine, clock, line({ n: 80, mps: 70 / 3.6 }));
    assert.deepEqual(alertTypes(events), ['FIX_VALID', 'APPROACH_ALERT', 'OVERSPEED_ALERT', 'PASSED']);
    const a = events.find((e) => e.type === 'APPROACH_ALERT');
    const o = events.find((e) => e.type === 'OVERSPEED_ALERT');
    assert.equal(o.index - a.index, A.overspeedMinFixes - 1);
    assert.equal(o.speechText, '注意，目前超速，速限五十');
    assert.equal(states[o.index].overspeed, true);
    assert.equal(states[o.index - 1].overspeed, false);
    assert.equal(states.at(-1).overspeed, false);
  });

  test('limit=null → 不判定超速，接近語音為「速限未知」', () => {
    const c = cam({ limit: null });
    const { engine, clock } = makeEngine([c]);
    const { events, states } = run(engine, clock, line({ n: 80, mps: 120 / 3.6 }));
    assert.deepEqual(alertTypes(events), ['FIX_VALID', 'APPROACH_ALERT', 'PASSED']);
    assert.match(events.find((e) => e.type === 'APPROACH_ALERT').speechText, /速限未知$/);
    assert.ok(states.every((s) => s.overspeed === false));
  });

  test('反向 → 不提醒；方向未知 → NEARBY 一次並列入 nearby', () => {
    {
      const { engine, clock } = makeEngine([cam({ bearings: [270] })]);
      const { events, states } = run(engine, clock, line({ n: 90, mps: 13 }));
      assert.deepEqual(alertTypes(events), ['FIX_VALID']);
      assert.ok(states.every((s) => s.focus === null && s.nearby.length === 0));
    }
    {
      const { engine, clock } = makeEngine([cam({ bearings: [] })]);
      const { events, states } = run(engine, clock, line({ n: 90, mps: 13 }));
      assert.deepEqual(alertTypes(events), ['FIX_VALID', 'NEARBY']);
      const i = events.find((e) => e.type === 'NEARBY').index;
      assert.equal(states[i].nearby.length, 1);
      assert.equal(states[i].focus, null);
      assert.equal(states.at(-1).nearby.length, 0);
    }
  });

  test('冷卻：通過後在 cooldownM 內迴轉再接近不重複提醒；離開 cooldownM 後再接近會重新提醒', () => {
    const c = cam({ bearings: [90, 270], bidirectional: true });
    const { engine, clock } = makeEngine([c]);
    const v = 13;
    const goBack = (nGo) => {
      const go = line({ n: nGo, mps: v, startBeforeM: 400 });
      const east = v * (nGo - 1) - 400;                                  // 通過後位於相機東方的距離
      const back = line({ n: 80, mps: v, heading: 270, startBeforeM: east })
        .map((f, i) => ({ ...f, t: go.at(-1).t + (i + 1) * 1000 }));
      return { fixes: [...go, ...back], east };
    };
    const g1 = goBack(50);
    assert.ok(g1.east < A.cooldownM);
    const r1 = run(engine, clock, g1.fixes);
    assert.deepEqual(alertTypes(r1.events), ['FIX_VALID', 'APPROACH_ALERT', 'PASSED']);

    const { engine: e2, clock: c2 } = makeEngine([c]);
    const g2 = goBack(70);
    assert.ok(g2.east > A.cooldownM);
    const r2 = run(e2, c2, g2.fixes);
    assert.deepEqual(alertTypes(r2.events), ['FIX_VALID', 'APPROACH_ALERT', 'PASSED', 'APPROACH_ALERT', 'PASSED']);
  });
});

describe('定位有效性', () => {
  test('accuracy 過大 → FIX_STALE、speedKmh=null、GPS_STATUS=POOR；恢復 → FIX_VALID', () => {
    const { engine, clock } = makeEngine([]);
    const fixes = line({ n: 6, over: (i) => (i === 2 || i === 3 ? { accuracyM: 200 } : {}) });
    const { events, states } = run(engine, clock, fixes);
    assert.deepEqual(events.map((e) => e.type),
      ['GPS_STATUS', 'FIX_VALID', 'GPS_STATUS', 'FIX_STALE', 'GPS_STATUS', 'FIX_VALID']);
    assert.deepEqual(events.filter((e) => e.type === 'GPS_STATUS').map((e) => e.status), ['OK', 'POOR', 'OK']);
    assert.equal(states[2].speedKmh, null);
    assert.equal(states[3].gps, 'POOR');
    assert.notEqual(states[4].speedKmh, null);
  });

  test('tick：超過 maxAgeMs 沒有新定位 → FIX_STALE、gps=STALE、speedKmh=null', () => {
    const { engine, clock } = makeEngine([]);
    const fixes = line({ n: 2 });
    run(engine, clock, fixes);
    clock.t = fixes[1].t + CONFIG.fix.maxAgeMs;
    assert.deepEqual(engine.tick(), []);
    clock.t += 1;
    const ev = engine.tick();
    assert.deepEqual(ev.map((e) => e.type), ['GPS_STATUS', 'FIX_STALE']);
    assert.equal(engine.getState().speedKmh, null);
    assert.equal(engine.getState().gps, 'STALE');
    assert.deepEqual(engine.tick(), [], 'FIX_STALE 只發一次');
  });

  test('pushFix 的 t 太舊 → 視為無效（STALE）', () => {
    const { engine, clock } = makeEngine([]);
    clock.t = T0 + 10000;
    const ev = engine.pushFix({ t: T0, lat: CAM_LAT, lon: CAM_LON, speedMps: 10, headingDeg: 0, accuracyM: 5 });
    assert.deepEqual(ev.map((e) => e.type), ['GPS_STATUS']);
    assert.equal(engine.getState().gps, 'STALE');
    assert.equal(engine.getState().speedKmh, null);
  });

  test('reset → SEARCHING、speedKmh=null；已提醒的相機不重複提醒', () => {
    const c = cam();
    const { engine, clock } = makeEngine([c]);
    const fixes = line({ n: 90, mps: 13 });
    const r1 = run(engine, clock, fixes.slice(0, 35));
    assert.deepEqual(alertTypes(r1.events), ['FIX_VALID', 'APPROACH_ALERT']);
    engine.reset();
    assert.equal(engine.getState().gps, 'SEARCHING');
    assert.equal(engine.getState().speedKmh, null);
    const r2 = run(engine, clock, fixes.slice(35));
    assert.deepEqual(alertTypes(r2.events), ['FIX_VALID', 'PASSED']);
  });
});

describe('效能與資料更新', () => {
  test('2,000 台相機、每筆 fix 只細算 2 km 內者', () => {
    const many = [];
    for (let i = 0; i < 2000; i++) {
      const p = destinationPoint(CAM_LAT, CAM_LON, (i * 137.5) % 360, 500 + (i % 400) * 250);
      many.push(cam({ id: `m${i}`, lat: p.lat, lon: p.lon }));
    }
    const { engine, clock } = makeEngine(many);
    const fixes = line({ n: 300, mps: 20 });
    const t0 = performance.now();
    run(engine, clock, fixes);
    const ms = (performance.now() - t0) / fixes.length;
    assert.ok(ms < 5, `每筆 ${ms.toFixed(2)} ms`);
    assert.ok(engine.getDebug().every((d) => d.distanceM <= SCAN_RADIUS_M));
  });

  test('setCameras：移除的相機狀態清除', () => {
    const c = cam();
    const { engine, clock } = makeEngine([c]);
    run(engine, clock, line({ n: 35, mps: 13 }));
    assert.equal(engine.getState().focus?.camera.id, c.id);
    engine.setCameras([]);
    assert.equal(engine.getState().focus, null);
  });

  test('createAlertEngine 預設 now=Date.now 可用', () => {
    const e = createAlertEngine({ cameras: [], config: CONFIG });
    const ev = e.pushFix({ t: Date.now(), lat: CAM_LAT, lon: CAM_LON, speedMps: 1, headingDeg: 0, accuracyM: 5 });
    assert.ok(ev.some((x) => x.type === 'FIX_VALID'));
  });
});
