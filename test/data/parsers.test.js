import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNpa7320, detectFormat, detectFormatDetail } from '../../src/data/parsers.js';

const csv = readFileSync(new URL('../../data/snapshots/npa7320-taichung.csv', import.meta.url), 'utf8');

test('detectFormat 7320', () => assert.equal(detectFormat(csv), 'npa7320'));
test('detectFormat 帶 BOM + CRLF 的 7320', () => {
  assert.equal(detectFormat('﻿' + csv.replace(/\n/g, '\r\n')), 'npa7320');
});
test('detectFormat 100855 → unsupported 並給中文原因', () => {
  const t = '設備編號,型式,縣市,行政區,科技執法種類,取締項目,設置區域描述,設置地點,座標緯度,座標經度,拍攝方向,速限,管轄單位\n1,x,y,z,a,槽化線,,,24,120,,,\n';
  const d = detectFormatDetail(t);
  assert.equal(d.format, 'unsupported');
  assert.match(d.reason, /不是測速/);
  assert.equal(detectFormat(t), 'unsupported');
});
test('detectFormat 空檔與未知', () => {
  assert.equal(detectFormat(''), 'unknown');
  assert.equal(detectFormat('a,b,c\n1,2,3'), 'unknown');
  assert.equal(detectFormat(undefined), 'unknown');
});
test('parseNpa7320 跳過中文欄名列', () => {
  const rows = parseNpa7320(csv);
  assert.equal(rows.length, 192);
  assert.ok(!rows.some((r) => r.CityName === '設置縣市'));
  assert.deepEqual(Object.keys(rows[0]), ['CityName', 'RegionName', 'Address', 'DeptNm', 'BranchNm', 'Longitude', 'Latitude', 'direct', 'limit']);
  assert.equal(rows[0].Address, '中區三民路與公園路口');
  assert.equal(rows[0].direct, '北往南');
});
test('parseNpa7320 地址含逗號（引號）', () => {
  const t = 'CityName,RegionName,Address,DeptNm,BranchNm,Longitude,Latitude,direct,limit\n設置縣市,a,b,c,d,e,f,g,h\n臺中市,中區,"某路,近某口",警,,120.6,24.1,南向北,50\n';
  const rows = parseNpa7320(t);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Address, '某路,近某口');
});
