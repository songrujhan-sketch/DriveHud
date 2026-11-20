import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../src/data/csv.js';

test('基本與 CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});
test('BOM 被移除', () => {
  assert.deepEqual(parseCsv('﻿a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});
test('引號內逗號與換行', () => {
  assert.deepEqual(parseCsv('a,"x,y","l1\nl2"\n'), [['a', 'x,y', 'l1\nl2']]);
});
test('雙引號跳脫', () => {
  assert.deepEqual(parseCsv('"say ""hi""",z'), [['say "hi"', 'z']]);
});
test('空欄位與尾端逗號', () => {
  assert.deepEqual(parseCsv('a,,c,\n'), [['a', '', 'c', '']]);
});
test('檔尾空行與純空行被忽略', () => {
  assert.deepEqual(parseCsv('a\n\n\nb\n\n'), [['a'], ['b']]);
});
test('非字串回傳空陣列', () => {
  assert.deepEqual(parseCsv(undefined), []);
});
