// direct（拍攝方向）欄位正規化。契約 §1.5。
// 回傳 { bearings, bidirectional, interval, known }；bearings 為「被拍車輛前進方向」。

const DIR = '東北|東南|西北|西南|東|西|南|北';
const BEARING = { 北: 0, 東北: 45, 東: 90, 東南: 135, 南: 180, 西南: 225, 西: 270, 西北: 315 };

const RE_FROM_TO = new RegExp(`^(?:${DIR})(?:向|往)(${DIR})$`);
const RE_GO = new RegExp(`^往(${DIR})(?:方向)?$`);
const RE_TOWARD = new RegExp(`^(${DIR})向$`);
const RE_LANE = new RegExp(`^(${DIR})(?:上|下)(?:車道|方向)$`);
const RE_BI = new RegExp(`^(${DIR})(${DIR})(?:雙向|向)$`);

function normalizeText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/\s+/g, '');
}

function flip(deg) { return (deg + 180) % 360; }

export function parseDirect(raw, config) {
  const text = normalizeText(raw);
  const interval = text.includes('區間測速');
  // 去掉括號註記（如「(區間測速)」），其餘照常解析
  const core = text.replace(/\([^)]*\)/g, '');
  const facing = config?.data?.directSemantics === 'facing';

  const result = (bearings, bidirectional) => {
    let b = [...new Set(bearings)];
    if (facing) b = b.map(flip);
    b.sort((x, y) => x - y);
    return { bearings: b, bidirectional, interval, known: b.length > 0 };
  };

  if (core === '雙向') return { bearings: [], bidirectional: true, interval, known: false };

  let m;
  if ((m = core.match(RE_FROM_TO))) return result([BEARING[m[1]]], false);
  if ((m = core.match(RE_GO))) return result([BEARING[m[1]]], false);
  if ((m = core.match(RE_TOWARD))) return result([BEARING[m[1]]], false);
  if ((m = core.match(RE_LANE))) return result([BEARING[m[1]]], false);
  if ((m = core.match(RE_BI))) return result([BEARING[m[1]], BEARING[m[2]]], true);

  // 空字串、英文、地名式（往大溪方向）等
  return { bearings: [], bidirectional: false, interval, known: false };
}
