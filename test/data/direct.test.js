import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirect } from '../../src/data/direct.js';

const travel = { data: { directSemantics: 'travel' } };
const facing = { data: { directSemantics: 'facing' } };

// [raw, bearings, bidirectional, interval, known]
const cases = [
  // §8.2 的 30 種實際字串
  ['北向南', [180], false, false, true],
  ['雙向', [], true, false, false],
  ['南北雙向', [0, 180], true, false, true],
  ['南向北', [0], false, false, true],
  ['東西雙向', [90, 270], true, false, true],
  ['西向東', [90], false, false, true],
  ['東向西', [270], false, false, true],
  ['往南', [180], false, false, true],
  ['往北', [0], false, false, true],
  ['北往南', [180], false, false, true],
  ['南向', [180], false, false, true],
  ['北向', [0], false, false, true],
  ['南往北', [0], false, false, true],
  ['西南向東北', [45], false, false, true],
  ['東北向西南', [225], false, false, true],
  ['西北向東南', [135], false, false, true],
  ['西往東', [90], false, false, true],
  ['東往西', [270], false, false, true],
  ['西向', [270], false, false, true],
  ['東南向西北', [315], false, false, true],
  ['往東', [90], false, false, true],
  ['南北雙向(區間測速)', [0, 180], true, true, true],
  ['東向', [90], false, false, true],
  ['東西向', [90, 270], true, false, true],
  ['南下車道', [180], false, false, true],
  ['東西雙向(區間測速)', [90, 270], true, true, true],
  ['往西', [270], false, false, true],
  ['北上車道', [0], false, false, true],
  ['往大溪方向', [], false, false, false],
  ['北上方向', [0], false, false, true],
  // 台中子集的變體
  ['北南雙向', [0, 180], true, false, true],
  ['東往西(區間測速)', [270], false, true, true],
  ['南北雙向(區間測速)', [0, 180], true, true, true],
  // 邊界
  ['', [], false, false, false],
  ['   ', [], false, false, false],
  ['two-way', [], false, false, false],
  ['North to South', [], false, false, false],
  ['南北雙向（區間測速）', [0, 180], true, true, true], // 全形括號
  ['雙向（區間測速）', [], true, true, false],
  ['雙向(區間測速)', [], true, true, false],
  ['往大溪方向(區間測速)', [], false, true, false],
  ['往南方向', [180], false, false, true],
  [' 北 向 南 ', [180], false, false, true], // 空白
  [undefined, [], false, false, false],
  [null, [], false, false, false],
  [123, [], false, false, false],
];

for (const [raw, bearings, bi, interval, known] of cases) {
  test(`parseDirect(${JSON.stringify(raw)})`, () => {
    assert.deepEqual(parseDirect(raw, travel), { bearings, bidirectional: bi, interval, known });
  });
}

test('地址含方向但 direct 為雙向時以 direct 為準（parseDirect 只看 direct）', () => {
  // 例如地址「…（南往北方向）」而 direct=南北雙向
  assert.deepEqual(parseDirect('南北雙向', travel).bearings, [0, 180]);
});

test('facing 語意：所有 bearing 反轉 180°', () => {
  assert.deepEqual(parseDirect('西向東', facing).bearings, [270]);
  assert.deepEqual(parseDirect('南向北', facing).bearings, [180]);
  assert.deepEqual(parseDirect('西南向東北', facing).bearings, [225]);
  assert.deepEqual(parseDirect('東西雙向', facing).bearings, [90, 270]);
  assert.equal(parseDirect('雙向', facing).known, false);
});

test('未傳 config 預設為 travel', () => {
  assert.deepEqual(parseDirect('西向東').bearings, [90]);
});

test('bearings 為新陣列，不共用參考', () => {
  const a = parseDirect('南北雙向', travel);
  a.bearings.push(1);
  assert.deepEqual(parseDirect('南北雙向', travel).bearings, [0, 180]);
});
