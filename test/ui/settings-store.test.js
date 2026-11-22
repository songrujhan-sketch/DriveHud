// 設定儲存：外觀列新增的視角／場景／時段欄位。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore, DEFAULT_SETTINGS, CAR_VIEWS, CAR_SCENES, CAR_TIMES } from '../../src/ui/settings.js';

const KEY = 'drivehud.settings.v1';
function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), dump: () => Object.fromEntries(m) };
}

test('預設值：前 45°、展示間、時段自動', () => {
  const s = createSettingsStore({ storage: memoryStorage() }).get();
  assert.equal(s.view, 'front');
  assert.equal(s.scene, 'studio');
  assert.equal(s.time, 'auto');
  assert.deepEqual(CAR_VIEWS.map((v) => v.id), ['front', 'head', 'side', 'rear', 'back', 'right-rear', 'top']);
  assert.deepEqual(CAR_SCENES.map((v) => v.id), ['studio', 'mountain', 'city', 'track', 'coast']);
  assert.deepEqual(CAR_TIMES.map((v) => v.id), ['auto', 'day', 'night']);
});

test('寫入後可讀回，並通知訂閱者', () => {
  const storage = memoryStorage();
  const store = createSettingsStore({ storage });
  let seen = null;
  store.subscribe((s) => { seen = s; });
  store.set({ view: 'back', scene: 'city', time: 'night', lowQuality: true });
  assert.equal(seen.view, 'back');
  const again = createSettingsStore({ storage }).get();
  assert.deepEqual({ view: again.view, scene: again.scene, time: again.time, lowQuality: again.lowQuality }, { view: 'back', scene: 'city', time: 'night', lowQuality: true });
});

test('儲存內容無效時退回預設值', () => {
  const storage = memoryStorage({ [KEY]: JSON.stringify({ view: 'sideways', scene: 'beach', time: 'dusk', model: 'valkyrie' }) });
  const s = createSettingsStore({ storage }).get();
  assert.equal(s.view, DEFAULT_SETTINGS.view);
  assert.equal(s.scene, DEFAULT_SETTINGS.scene);
  assert.equal(s.time, DEFAULT_SETTINGS.time);
});

test('舊版儲存內容（沒有新欄位）仍可載入', () => {
  const storage = memoryStorage({ [KEY]: JSON.stringify({ model: 'darkknight', headlights: true }) });
  const s = createSettingsStore({ storage }).get();
  assert.equal(s.model, 'darkknight');
  assert.equal(s.headlights, true);
  assert.equal(s.view, 'front');
});

test('V1.10：超速容忍與持續超速提醒的預設值、讀回與無效值', () => {
  const fresh = createSettingsStore({ storage: memoryStorage() }).get();
  assert.equal(fresh.toleranceKmh, 0);
  assert.equal(fresh.overspeedRepeat, true);
  const storage = memoryStorage();
  createSettingsStore({ storage }).set({ toleranceKmh: 10, overspeedRepeat: false });
  const again = createSettingsStore({ storage }).get();
  assert.equal(again.toleranceKmh, 10);
  assert.equal(again.overspeedRepeat, false);
  const bad = createSettingsStore({ storage: memoryStorage({ [KEY]: JSON.stringify({ toleranceKmh: 7, overspeedRepeat: 'yes' }) }) }).get();
  assert.equal(bad.toleranceKmh, 0);
  assert.equal(bad.overspeedRepeat, true);
});
