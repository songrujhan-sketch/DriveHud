// 文字 → 統計後的資料集：detectFormat → parse → normalize → dedupe → validate
import { detectFormatDetail, parseNpa7320 } from './parsers.js?v=1.10.0';
import { normalizeRows } from './normalize.js?v=1.10.0';
import { dedupe } from './dedupe.js?v=1.10.0';
import { validate } from './validate.js?v=1.10.0';

/** @returns {{ok:true, format:string, cameras:object[], stats:object} | {ok:false, reason:string}} */
export function runPipeline(text, config) {
  const { format, reason } = detectFormatDetail(text);
  if (format !== 'npa7320') return { ok: false, reason };
  const rows = parseNpa7320(text);
  if (rows.length === 0) return { ok: false, reason: '檔案內沒有任何資料列' };
  const { cameras: norm, dropped } = normalizeRows(rows, 'npa7320', config);
  const { cameras: uniq, removed } = dedupe(norm, config);
  const { cameras, stats } = validate(uniq, { total: rows.length, dropped, deduped: removed });
  if (cameras.length === 0) return { ok: false, reason: '解析後沒有任何有效的測速點（座標皆無效）' };
  return { ok: true, format, cameras, stats };
}
