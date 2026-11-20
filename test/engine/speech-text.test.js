import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approachText, overspeedText, toChineseNumber, roundDistance50 } from '../../src/engine/speech-text.js';

test('中文數字', () => {
  const cases = { 10: '十', 15: '十五', 20: '二十', 50: '五十', 60: '六十', 100: '一百', 105: '一百零五', 110: '一百一十',
    150: '一百五十', 200: '兩百', 250: '兩百五十', 300: '三百', 500: '五百', 1000: '一千', 1050: '一千零五十', 2000: '兩千', 1200: '一千兩百' };
  for (const [n, s] of Object.entries(cases)) assert.equal(toChineseNumber(Number(n)), s, `n=${n}`);
});

test('距離四捨五入到 50 m', () => {
  assert.equal(roundDistance50(288), 300);
  assert.equal(roundDistance50(274), 250);
  assert.equal(roundDistance50(275), 300);
  assert.equal(roundDistance50(10), 50);
});

test('approachText', () => {
  assert.equal(approachText(300, 60), '前方三百公尺有測速照相，速限六十');
  assert.equal(approachText(262, 50), '前方兩百五十公尺有測速照相，速限五十');
  assert.equal(approachText(495, 100), '前方五百公尺有測速照相，速限一百');
  assert.equal(approachText(300, null), '前方三百公尺有測速照相，速限未知');
});

test('overspeedText', () => {
  assert.equal(overspeedText(60), '注意，目前超速，速限六十');
  assert.equal(overspeedText(100), '注意，目前超速，速限一百');
  assert.equal(overspeedText(null), '注意，目前超速，速限未知');
});
