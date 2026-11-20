import test from 'node:test';
import assert from 'node:assert/strict';
import { toCamera, inferRoadClass, makeId, normalizeRows } from '../../src/data/normalize.js';

const cfg = { data: { directSemantics: 'travel' } };
const row = (o = {}) => ({
  CityName: '臺中市', RegionName: '西屯區', Address: '西屯區福科路617號前往福林路方向中央分隔島',
  Longitude: '120.61284', Latitude: '24.186693', direct: '西向東', limit: '50', ...o,
});

test('toCamera 基本欄位', () => {
  const c = toCamera(row(), 'npa7320', cfg);
  assert.equal(c.lat, 24.186693);
  assert.equal(c.lon, 120.61284);
  assert.deepEqual(c.bearings, [90]);
  assert.equal(c.directionKnown, true);
  assert.equal(c.bidirectional, false);
  assert.equal(c.limit, 50);
  assert.equal(c.roadClass, 'urban');
  assert.equal(c.interval, false);
  assert.equal(c.source, 'npa7320');
  assert.equal(c.city, '臺中市');
  assert.equal(c.region, '西屯區');
  assert.equal(c.rawDirect, '西向東');
  assert.equal(c.id, 'npa7320|24.186693|120.612840|90');
});

test('座標無效整筆丟棄', () => {
  for (const bad of [
    { Latitude: 'abc' }, { Latitude: '' }, { Longitude: '' }, { Latitude: '0' },
    { Latitude: '30' }, { Longitude: '100' }, { Longitude: '130' }, { Latitude: '20.9' },
  ]) assert.equal(toCamera(row(bad), 'npa7320', cfg), null, JSON.stringify(bad));
});

test('座標邊界值保留', () => {
  assert.ok(toCamera(row({ Latitude: '21', Longitude: '118' }), 'npa7320', cfg));
  assert.ok(toCamera(row({ Latitude: '26.5', Longitude: '122.5' }), 'npa7320', cfg));
});

test('limit 非數字 → null；含空白可解析', () => {
  assert.equal(toCamera(row({ limit: '' }), 'npa7320', cfg).limit, null);
  assert.equal(toCamera(row({ limit: '未設' }), 'npa7320', cfg).limit, null);
  assert.equal(toCamera(row({ limit: ' 60 ' }), 'npa7320', cfg).limit, 60);
  assert.equal(toCamera(row({ limit: '0' }), 'npa7320', cfg).limit, null);
  assert.equal(toCamera(row({ limit: undefined }), 'npa7320', cfg).limit, null);
});

test('以 direct 欄為準，不解析地址（地址含「（南往北方向）」但 direct 為南北雙向）', () => {
  const c = toCamera(row({ Address: '某路100號前（南往北方向）', direct: '南北雙向' }), 'npa7320', cfg);
  assert.deepEqual(c.bearings, [0, 180]);
  assert.equal(c.bidirectional, true);
});

test('direct 變體：北南雙向、東往西(區間測速)、南北雙向(區間測速)', () => {
  assert.deepEqual(toCamera(row({ direct: '北南雙向' }), 'npa7320', cfg).bearings, [0, 180]);
  const a = toCamera(row({ direct: '東往西(區間測速)' }), 'npa7320', cfg);
  assert.deepEqual([a.bearings, a.interval], [[270], true]);
  const b = toCamera(row({ direct: '南北雙向(區間測速)' }), 'npa7320', cfg);
  assert.deepEqual([b.bearings, b.bidirectional, b.interval], [[0, 180], true, true]);
});

test('雙向（無方位）→ directionKnown=false', () => {
  const c = toCamera(row({ direct: '雙向' }), 'npa7320', cfg);
  assert.deepEqual([c.bearings, c.bidirectional, c.directionKnown], [[], true, false]);
  assert.match(c.id, /\|bi$/);
});

test('inferRoadClass', () => {
  assert.equal(inferRoadClass('南屯區中彰快速道路4.8K'), 'expressway');
  assert.equal(inferRoadClass('台74線 4K'), 'expressway');
  assert.equal(inferRoadClass('臺61線 10K'), 'expressway');
  assert.equal(inferRoadClass('國道1號 170K'), 'expressway');
  assert.equal(inferRoadClass('中山高架橋'), 'expressway');
  assert.equal(inferRoadClass('西屯區福科路617號'), 'urban');
  assert.equal(inferRoadClass(''), 'unknown');
  assert.equal(inferRoadClass(undefined), 'unknown');
});

test('makeId 穩定且含方向', () => {
  const c = toCamera(row(), 'npa7320', cfg);
  assert.equal(makeId(c), c.id);
  const d = toCamera(row({ direct: '東向西' }), 'npa7320', cfg);
  assert.notEqual(c.id, d.id);
});

test('normalizeRows 計算 dropped', () => {
  const r = normalizeRows([row(), row({ Latitude: 'x' }), row({ Longitude: '' })], 'npa7320', cfg);
  assert.equal(r.cameras.length, 1);
  assert.equal(r.dropped, 2);
});
