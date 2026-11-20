import { parseCsv } from './csv.js';

export const UNSUPPORTED_REASON_100855 =
  '此檔案是警政署 100855（槽化線／雙白線／安全帶等取締項目，無速限），不是測速照相資料，不支援匯入。請改用警政署 7320「固定式測速照相設置點」CSV。';

/** 欄位名正規化：去 BOM／空白、轉小寫 */
const key = (s) => String(s ?? '').replace(/^﻿/, '').trim();

/**
 * 判斷格式。回傳 { format: 'npa7320'|'unsupported'|'unknown', reason }
 */
export function detectFormatDetail(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { format: 'unknown', reason: '檔案是空的' };
  }
  const first = parseCsv(text.slice(0, 4000).split(/\r?\n/)[0] ?? '')[0] ?? [];
  const head = first.map(key);
  const has = (...names) => names.every((n) => head.includes(n));
  if (has('CityName', 'Latitude', 'Longitude', 'direct')) return { format: 'npa7320', reason: '' };
  if (head.some((h) => /取締項目|設備編號|科技執法種類/.test(h))) {
    return { format: 'unsupported', reason: UNSUPPORTED_REASON_100855 };
  }
  return { format: 'unknown', reason: '無法辨識檔案格式，請使用警政署 7320 官方 CSV' };
}

/** @returns {'npa7320'|'unsupported'|'unknown'} */
export function detectFormat(text) {
  return detectFormatDetail(text).format;
}

/**
 * 解析警政署 7320。第 1 列英文欄名，第 2 列中文欄名（跳過）。
 * 回傳 raw rows（物件，欄位名為英文欄名，值為字串）。
 */
export function parseNpa7320(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map(key);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    // 中文欄名列：以首欄內容判斷（「設置縣市」），並保險檢查第 2 列
    if (r[0] != null && key(r[0]) === '設置縣市') continue;
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    out.push(obj);
  }
  return out;
}
