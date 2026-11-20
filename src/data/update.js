// 線上更新與匯入：下載／讀取 → 偵測格式 → 解析 → 正規化 → 去重 → 驗證 → 筆數檢查 → 儲存。
// 回傳 { ok, reason, stats, fetchedAt }。任何失敗都不動舊資料。
import { CONFIG } from '../../config.js';
import { runPipeline } from './pipeline.js';
import { createStore } from './store.js';

export const CORS_REASON = '無法連線或被瀏覽器跨網域限制擋下，請改用匯入 CSV';

const fail = (reason, stats = null) => ({ ok: false, reason, stats, fetchedAt: null });

async function previousCount(store) {
  try {
    const cur = await store.loadDataset();
    if (cur?.cameras?.length) return cur.cameras.length;
  } catch { /* 無舊資料 */ }
  try {
    const b = await store.loadBundledSnapshot?.();
    if (b?.cameras?.length) return b.cameras.length;
  } catch { /* 無內建快照 */ }
  return 0;
}

async function ingest(text, { origin, fileName, store, config, now }) {
  const out = runPipeline(text, config);
  if (!out.ok) return fail(out.reason);
  const old = await previousCount(store);
  const ratio = config.data?.minAcceptRatio ?? 0.5;
  if (old > 0 && out.cameras.length < old * ratio) {
    return fail(
      `新資料只有 ${out.cameras.length} 筆，少於舊資料 ${old} 筆的 ${Math.round(ratio * 100)}%，已保留舊版`,
      out.stats,
    );
  }
  const fetchedAt = new Date(now()).toISOString();
  const dataset = { cameras: out.cameras, source: 'npa7320', origin, fetchedAt, stats: out.stats };
  if (fileName) dataset.file = fileName;
  try {
    await store.saveDataset(dataset);
  } catch (e) {
    return fail(`資料已解析但無法儲存到本機（${e?.message || e}），已保留舊版`, out.stats);
  }
  return {
    ok: true,
    reason: `已更新，共 ${out.stats.kept} 筆測速點`,
    stats: out.stats,
    fetchedAt,
  };
}

/**
 * @param {{url?:string, fetchImpl?:Function, store?:object, config?:object, now?:()=>number}} [opts]
 */
export async function updateOnline({
  url, fetchImpl = globalThis.fetch, store = createStore(), config = CONFIG, now = () => Date.now(),
} = {}) {
  const target = url ?? config.data?.sources?.npa7320;
  if (!target) return fail('尚未設定官方資料網址');
  if (typeof fetchImpl !== 'function') return fail(CORS_REASON);
  let res;
  try {
    res = await fetchImpl(target);
  } catch {
    // TypeError: Failed to fetch（CORS／離線／DNS）一律給同一個可行動的訊息
    return fail(CORS_REASON);
  }
  if (!res || !res.ok) return fail(`伺服器回應錯誤（HTTP ${res?.status ?? '?'}），已保留舊版`);
  let text;
  try { text = await res.text(); } catch { return fail('下載中斷，已保留舊版'); }
  return ingest(text, { origin: 'online', store, config, now });
}

/**
 * @param {{text:()=>Promise<string>, name?:string}} file 瀏覽器 File 或具 text() 的物件
 */
export async function importFromFile(file, {
  store = createStore(), config = CONFIG, now = () => Date.now(),
} = {}) {
  if (!file || typeof file.text !== 'function') return fail('沒有選擇檔案');
  let text;
  try { text = await file.text(); } catch { return fail('無法讀取檔案'); }
  if ((text.match(/�/g) || []).length > 5) {
    return fail('檔案編碼不是 UTF-8（出現亂碼），請使用官方下載的原始 CSV');
  }
  return ingest(text, { origin: 'import', fileName: file.name, store, config, now });
}
