// DriveHUD V1.6 — 語音字串（繁體中文，台灣用語）
const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * 0–99999 整數轉中文數字（口語）：200→兩百、250→兩百五十、105→一百零五、10→十、110→一百一十
 * @param {number} n
 */
export function toChineseNumber(n) {
  n = Math.round(Math.abs(n));
  if (n === 0) return '零';
  if (n >= 100000) return String(n);
  const units = [[10000, '萬'], [1000, '千'], [100, '百'], [10, '十']];
  let out = '';
  let rest = n;
  let pendingZero = false;
  for (const [u, name] of units) {
    const d = Math.floor(rest / u);
    rest %= u;
    if (d === 0) {
      if (out) pendingZero = true;
      continue;
    }
    if (pendingZero) { out += '零'; pendingZero = false; }
    let digit = DIGITS[d];
    if (d === 2 && u >= 100) digit = '兩';
    if (u === 10 && d === 1 && !out) digit = ''; // 10–19 開頭唸「十X」
    out += digit + name;
  }
  if (rest > 0) {
    if (pendingZero) out += '零';
    out += DIGITS[rest];
  }
  return out;
}

/** 距離四捨五入到 50 m（最小 50 m） */
export function roundDistance50(distanceM) {
  return Math.max(50, Math.round(distanceM / 50) * 50);
}

function limitPart(limit) {
  return limit == null || !Number.isFinite(limit) ? '速限未知' : `速限${toChineseNumber(limit)}`;
}

/** 「前方三百公尺有測速照相，速限六十」；區間測速：「前方三百公尺有區間測速，速限六十」 */
export function approachText(distanceM, limit, { interval = false } = {}) {
  return `前方${toChineseNumber(roundDistance50(distanceM))}公尺有${interval ? '區間測速' : '測速照相'}，${limitPart(limit)}`;
}

/** 持續超速時的短句重複提醒 */
export const OVERSPEED_REPEAT_TEXT = '請減速';

/** 「注意，目前超速，速限六十」 */
export function overspeedText(limit) {
  return `注意，目前超速，${limitPart(limit)}`;
}
