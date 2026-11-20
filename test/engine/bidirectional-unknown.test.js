// direct 只寫「雙向」（無方位）的相機：預設視為同向，在前方且持續接近時語音提醒。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRelation } from '../../src/engine/alertEngine.js';
import { cam, line, makeEngine, run, alertTypes, CONFIG } from './helpers.js';

const biUnknown = () => cam({ id: 'bi', bearings: [], bidirectional: true, directionKnown: false, rawDirect: '雙向' });

test('只寫「雙向」：任一行進方向接近都發 APPROACH_ALERT 一次，通過後 PASSED', () => {
  for (const heading of [90, 270, 0]) {
    const { engine, clock } = makeEngine([biUnknown()]);
    const { events } = run(engine, clock, line({ heading }));
    const types = alertTypes(events);
    assert.equal(types.filter((t) => t === 'APPROACH_ALERT').length, 1, `heading ${heading}`);
    assert.ok(types.includes('PASSED'));
    assert.ok(!types.includes('NEARBY'));
  }
});

test('只寫「雙向」且超速：OVERSPEED_ALERT 一次', () => {
  const { engine, clock } = makeEngine([biUnknown()]);
  const { events } = run(engine, clock, line({ mps: 18 }));
  assert.equal(alertTypes(events).filter((t) => t === 'OVERSPEED_ALERT').length, 1);
});

test('地名式方向（非雙向、方向未知）仍只發 NEARBY', () => {
  const c = cam({ id: 'place', bearings: [], bidirectional: false, directionKnown: false, rawDirect: '往大溪方向' });
  const { engine, clock } = makeEngine([c]);
  const types = alertTypes(run(engine, clock, line()).events);
  assert.ok(types.includes('NEARBY'));
  assert.ok(!types.includes('APPROACH_ALERT'));
});

test('關閉 bidirectionalUnknownAxisAsSame 時回到 AMBIGUOUS', () => {
  const off = { ...CONFIG.alert, bidirectionalUnknownAxisAsSame: false };
  assert.equal(classifyRelation(biUnknown(), 90, off), 'AMBIGUOUS');
  assert.equal(classifyRelation(biUnknown(), 90, CONFIG.alert), 'SAME');
  assert.equal(classifyRelation(biUnknown(), null, CONFIG.alert), 'AMBIGUOUS');
});
