import test from 'node:test';
import assert from 'node:assert/strict';
import { mountSettingsData } from '../../src/ui/settings-data.js';

// 極簡假 DOM（無 jsdom 依賴）
class El {
  constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.listeners = {}; this.className = ''; this._text = ''; this.attrs = {}; this.files = null; this.value = ''; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = v; this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  click() { (this.listeners.click || []).forEach((f) => f()); }
  fire(t) { return Promise.all((this.listeners[t] || []).map((f) => f())); }
  find(cls) {
    if (this.className.split(' ').includes(cls)) return this;
    for (const c of this.children) { const r = c.find(cls); if (r) return r; }
    return null;
  }
}
const doc = { createElement: (t) => new El(t, doc) };
const flush = () => new Promise((r) => setTimeout(r, 5));

const dataset = { source: 'npa7320', origin: 'online', fetchedAt: '2026-11-20T01:00:00.000Z', cameras: [{}], stats: { kept: 1910, limitMissing: 12, directionUnknown: 191 } };

test('渲染資訊、按鈕與 class 前綴', async () => {
  const c = new El('div', doc);
  mountSettingsData(c, { store: { loadDataset: async () => dataset }, update: {}, config: {} });
  await flush();
  assert.equal(c.find('sd-row-count').find('sd-value').textContent, '1910');
  assert.equal(c.find('sd-row-limitMissing').find('sd-value').textContent, '12');
  assert.equal(c.find('sd-row-dirUnknown').find('sd-value').textContent, '191');
  assert.match(c.find('sd-row-source').find('sd-value').textContent, /警政署 7320.*線上更新/);
  assert.equal(c.find('sd-btn-update'), null);
  assert.equal(c.find('sd-btn-import').textContent, '匯入官方 CSV');
  assert.equal(c.find('sd-file').accept, '.csv,text/csv');
  assert.equal(c.find('sd-file').type, 'file');
});

test('更新失敗顯示原因', async () => {
  const c = new El('div', doc);
  const update = { importFromFile: async () => ({ ok: false, reason: '缺少必要欄位' }) };
  mountSettingsData(c, { store: { loadDataset: async () => dataset }, update });
  const input = c.find('sd-file');
  input.files = [{ name: 'invalid.csv' }];
  await input.fire('change');
  await flush();
  assert.match(c.find('sd-result').textContent, /失敗.*缺少必要欄位/);
  assert.equal(c.find('sd-btn-import').disabled, false);
});

test('匯入成功後重新整理數字', async () => {
  const c = new El('div', doc);
  let cur = null;
  const store = { loadDataset: async () => cur };
  const update = { importFromFile: async () => { cur = { ...dataset, origin: 'import', stats: { ...dataset.stats, kept: 2518 } }; return { ok: true, reason: '已更新' }; } };
  mountSettingsData(c, { store, update, config: {} });
  await flush();
  assert.equal(c.find('sd-row-count').find('sd-value').textContent, '0');
  const input = c.find('sd-file');
  input.files = [{ name: 'a.csv' }];
  await input.fire('change');
  await flush();
  assert.equal(c.find('sd-row-count').find('sd-value').textContent, '2518');
  assert.match(c.find('sd-result').textContent, /成功/);
});

test('無資料時退回內建快照', async () => {
  const c = new El('div', doc);
  const store = { loadDataset: async () => null, loadBundledSnapshot: async () => ({ ...dataset, origin: 'bundled', fetchedAt: null }) };
  mountSettingsData(c, { store, update: {}, config: {} });
  await flush();
  assert.match(c.find('sd-row-source').find('sd-value').textContent, /內建快照/);
  assert.match(c.find('sd-row-time').find('sd-value').textContent, /尚未更新/);
});
