// 最小版 parseDirect（介面同契約 §1.5），僅供 Worker A 的測試使用；正式版由 Worker C 提供於 src/data/direct.js
const DIR = { 北: 0, 東北: 45, 東: 90, 東南: 135, 南: 180, 西南: 225, 西: 270, 西北: 315 };
const DIR_RE = '(東北|東南|西北|西南|北|東|南|西)';

export function parseDirect(raw, config) {
  const text = String(raw ?? '').replace(/[（）]/g, (c) => (c === '（' ? '(' : ')')).trim();
  const interval = text.includes('區間測速');
  const core = text.replace(/\(?區間測速\)?/g, '').trim();
  let bearings = [];
  let bidirectional = false;
  let m;
  if (/^南北雙向$/.test(core)) { bearings = [0, 180]; bidirectional = true; }
  else if (/^東西雙向$/.test(core)) { bearings = [90, 270]; bidirectional = true; }
  else if (/^雙向$/.test(core)) { bidirectional = true; }
  else if ((m = core.match(new RegExp(`^${DIR_RE}[向往]${DIR_RE}$`)))) bearings = [DIR[m[2]]];
  else if ((m = core.match(new RegExp(`^往${DIR_RE}$`)))) bearings = [DIR[m[1]]];
  else if ((m = core.match(new RegExp(`^${DIR_RE}(向|[上下]車道|上方向|下方向)$`)))) bearings = [DIR[m[1]]];
  if (config?.data?.directSemantics === 'facing') bearings = bearings.map((b) => (b + 180) % 360);
  return { bearings, bidirectional, interval, known: bearings.length > 0 };
}
