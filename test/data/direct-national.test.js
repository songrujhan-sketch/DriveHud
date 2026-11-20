// 全國快照（2026-11-20，1,909 筆）中出現、先前無法解析的 direct 變體。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirect } from '../../src/data/direct.js';
import { CONFIG } from '../../config.js';

const cases = [
  ['南下', [180], false, false],
  ['北上', [0], false, false],
  ['南北', [0, 180], true, false],
  ['南北相向', [0, 180], true, false],
  ['東往西向', [270], false, false],
  ['南向60北向70', [0, 180], true, false],
  ['南向北(區間測速) 北向南(區間測速)', [0, 180], true, true],
  ['南北雙向兼闖紅燈', [0, 180], true, false],
  ['南北雙向兼南下闖紅燈', [0, 180], true, false],
  ['雙向兼闖紅燈', [], true, false],
  ['雙向測速', [], true, false],
  ['雙向區間測速', [], true, true],
  // 不可誤判
  ['東北', [], false, false],
  ['往大溪方向', [], false, false],
  ['單向', [], false, false],
  ['多向', [], false, false],
  ['大金往烈嶼(區間測速)', [], false, true],
];

for (const [raw, bearings, bidirectional, interval] of cases) {
  test(`parseDirect 全國變體：「${raw}」`, () => {
    const r = parseDirect(raw, CONFIG);
    assert.deepEqual(r.bearings, bearings);
    assert.equal(r.bidirectional, bidirectional);
    assert.equal(r.interval, interval);
    assert.equal(r.known, bearings.length > 0);
  });
}
