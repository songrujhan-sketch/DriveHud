// 設定頁「測速資料」區塊。純 DOM、無框架；class 皆以 sd- 開頭。
// mountSettingsData(container, { store, update }) → { refresh, destroy }
//   store:  { loadDataset(), loadBundledSnapshot?() }
//   update: { importFromFile(file) }

const SOURCE_NAMES = { npa7320: '內政部警政署 7320 固定式測速照相設置點' };

function fmtTime(iso) {
  if (!iso) return '尚未更新（使用內建快照）';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('zh-TW', { hour12: false });
}

export function mountSettingsData(container, { store, update } = {}) {
  const doc = container.ownerDocument || globalThis.document;
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  container.textContent = '';
  const root = el('section', 'sd-root');

  const dl = el('dl', 'sd-info');
  const fields = {};
  for (const [k, label] of [
    ['source', '資料來源'], ['time', '上次成功更新'], ['count', '有效筆數'],
    ['limitMissing', '速限缺漏'], ['dirUnknown', '方向未知'],
  ]) {
    const row = el('div', `sd-row sd-row-${k}`);
    row.appendChild(el('dt', 'sd-label', label));
    const dd = el('dd', 'sd-value', '—');
    fields[k] = dd;
    row.appendChild(dd);
    dl.appendChild(row);
  }
  root.appendChild(dl);

  const actions = el('div', 'sd-actions');
  const sourceLink = el('a', 'sd-source', '取得官方 CSV');
  sourceLink.href = 'https://data.gov.tw/dataset/7320';
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  const btnImport = el('button', 'sd-btn sd-btn-import', '匯入官方 CSV');
  btnImport.type = 'button';
  const fileInput = el('input', 'sd-file');
  fileInput.type = 'file';
  fileInput.accept = '.csv,text/csv';
  fileInput.hidden = true;
  actions.append(sourceLink, btnImport, fileInput);
  root.appendChild(actions);

  const result = el('p', 'sd-result', '最近一次結果：尚無');
  result.setAttribute?.('role', 'status');
  root.appendChild(result);
  container.appendChild(root);

  let destroyed = false;
  const setBusy = (busy) => { btnImport.disabled = busy; };
  const showResult = (r) => {
    result.className = `sd-result ${r.ok ? 'sd-ok' : 'sd-fail'}`;
    result.textContent = `最近一次結果：${r.ok ? '成功' : '失敗'}　${r.reason}`;
  };

  async function refresh() {
    let ds = null;
    try { ds = await store.loadDataset(); } catch { /* 讀取失敗視為無資料 */ }
    if (!ds && store.loadBundledSnapshot) {
      try { ds = await store.loadBundledSnapshot(); } catch { /* 無內建快照 */ }
    }
    if (destroyed) return;
    if (!ds) {
      fields.source.textContent = '無資料';
      fields.time.textContent = '—';
      fields.count.textContent = '0';
      fields.limitMissing.textContent = '—';
      fields.dirUnknown.textContent = '—';
      return;
    }
    const s = ds.stats || {};
    const originNote = ds.origin === 'import' ? '（匯入檔案）' : ds.origin === 'online' ? '（線上更新）' : '（內建快照）';
    fields.source.textContent = (SOURCE_NAMES[ds.source] || ds.source || '—') + originNote;
    fields.time.textContent = fmtTime(ds.fetchedAt);
    fields.count.textContent = String(s.kept ?? ds.cameras?.length ?? 0);
    fields.limitMissing.textContent = String(s.limitMissing ?? '—');
    fields.dirUnknown.textContent = String(s.directionUnknown ?? '—');
  }

  async function run(fn) {
    setBusy(true);
    result.className = 'sd-result sd-busy';
    result.textContent = '處理中…';
    try {
      const r = await fn();
      if (destroyed) return;
      showResult(r);
      if (r.ok) await refresh();
    } catch (e) {
      if (!destroyed) showResult({ ok: false, reason: String(e?.message || e) });
    } finally {
      if (!destroyed) setBusy(false);
    }
  }

  btnImport.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    run(() => update.importFromFile(file)).finally(() => { fileInput.value = ''; });
  });

  refresh();
  return { refresh, destroy() { destroyed = true; container.textContent = ''; } };
}
