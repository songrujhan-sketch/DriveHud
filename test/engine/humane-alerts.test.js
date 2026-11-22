// V1.10 Phase 4：依車速提前、超速容忍、持續超速提醒、區間測速文案。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { radiusFor } from '../../src/engine/alertEngine.js';
import { approachText } from '../../src/engine/speech-text.js';
import { cam, line, makeEngine, run, alertTypes, CONFIG } from './helpers.js';

const A = CONFIG.alert;

describe('依車速提前提醒', () => {
  test('radiusFor：低速用固定距離，高速依 leadTimeS 放大且不超過上限', () => {
    assert.equal(radiusFor(cam({ roadClass: 'urban' }), A, 50 / 3.6), A.radiusUrbanM);
    const highway = radiusFor(cam({ roadClass: 'expressway' }), A, 110 / 3.6);
    assert.ok(Math.abs(highway - (110 / 3.6) * A.leadTimeS) < 1e-9);
    assert.ok(highway > A.radiusExpresswayM);
    assert.equal(radiusFor(cam({ roadClass: 'expressway' }), A, 300 / 3.6), A.maxRadiusM);
    assert.equal(radiusFor(cam({ roadClass: 'expressway' }), { ...A, leadTimeS: 0 }, 110 / 3.6), A.radiusExpresswayM);
  });

  test('快速道路 110 km/h：在約 12 秒前（> 300 m）語音提醒，focus 帶出使用的半徑', () => {
    const mps = 110 / 3.6;
    const { engine, clock } = makeEngine([cam({ roadClass: 'expressway', limit: 110 })]);
    const { events, states } = run(engine, clock, line({ startBeforeM: 700, mps, n: 14 }));
    const alert = events.find((e) => e.type === 'APPROACH_ALERT');
    assert.ok(alert, '應有接近提醒');
    assert.ok(alert.distanceM > A.radiusExpresswayM, `提醒距離 ${alert.distanceM.toFixed(0)} m 應大於固定 300 m`);
    assert.ok(alert.distanceM / mps >= A.leadTimeS - 1.5, '至少約 leadTimeS 秒前');
    assert.ok(Math.abs(alert.radiusM - mps * A.leadTimeS) < 1);
    const focus = states.find((s) => s.focus)?.focus;
    assert.equal(focus.radiusM, alert.radiusM);
  });
});

describe('超速容忍與持續超速提醒', () => {
  const approachAt = (kmh) => line({ startBeforeM: 260, mps: kmh / 3.6, n: 14 });

  test('容忍 +5：時速 53（速限 50）不判超速；時速 58 才判', () => {
    for (const [kmh, expectOver] of [[53, false], [58, true]]) {
      const { engine, clock } = makeEngine([cam()]);
      engine.setOptions({ overspeedToleranceKmh: 5 });
      const { events } = run(engine, clock, approachAt(kmh));
      assert.equal(events.some((e) => e.type === 'OVERSPEED_ALERT'), expectOver, `${kmh} km/h`);
    }
  });

  test('預設關閉重複提醒；開啟後持續超速每 overspeedRepeatS 秒說「請減速」', () => {
    const fixes = line({ startBeforeM: 300, mps: 70 / 3.6, n: 24 });
    const off = makeEngine([cam()]);
    assert.ok(!run(off.engine, off.clock, fixes).events.some((e) => e.type === 'OVERSPEED_REPEAT'));

    const on = makeEngine([cam()]);
    on.engine.setOptions({ overspeedRepeatS: 4 });
    const { events } = run(on.engine, on.clock, fixes);
    const first = events.find((e) => e.type === 'OVERSPEED_ALERT');
    const repeats = events.filter((e) => e.type === 'OVERSPEED_REPEAT');
    assert.ok(first);
    assert.ok(repeats.length >= 1);
    assert.equal(repeats[0].speechText, '請減速');
    assert.ok(repeats[0].t - first.t >= 4000);
    const passed = events.findIndex((e) => e.type === 'PASSED');
    assert.ok(passed > 0, '應已通過');
    assert.ok(!events.slice(passed).some((e) => e.type === 'OVERSPEED_REPEAT'), '通過後不再提醒');
  });

  test('setOptions 只接受非負有限數值', () => {
    const { engine } = makeEngine([cam()]);
    engine.setOptions({ overspeedToleranceKmh: -3, overspeedRepeatS: Number.NaN, leadTimeS: 'x' });
    assert.equal(engine.options.overspeedToleranceKmh, A.overspeedToleranceKmh);
    assert.equal(engine.options.overspeedRepeatS, A.overspeedRepeatS);
    assert.equal(engine.options.leadTimeS, A.leadTimeS);
  });
});

describe('區間測速', () => {
  test('語音改說「區間測速」', () => {
    assert.equal(approachText(300, 70, { interval: true }), '前方三百公尺有區間測速，速限七十');
    const { engine, clock } = makeEngine([cam({ interval: true, limit: 70 })]);
    const { events } = run(engine, clock, line({ startBeforeM: 260, mps: 14, n: 10 }));
    assert.match(events.find((e) => e.type === 'APPROACH_ALERT').speechText, /區間測速/);
    assert.deepEqual(alertTypes(events).slice(0, 2), ['FIX_VALID', 'APPROACH_ALERT']);
  });
});
