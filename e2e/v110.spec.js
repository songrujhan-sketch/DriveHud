// V1.10 Phase 1：失敗狀態一定要讓駕駛知道（資料、語音、螢幕常亮），以及啟動與安全設定。
import { test, expect } from '@playwright/test';

/** 假語音：記錄要講的句子；started=false 時模擬 iOS 沒有真的發聲。 */
async function fakeSpeech(page, { started = true } = {}) {
  await page.addInitScript((started) => {
    window.testSpoken = [];
    class U { constructor(text) { this.text = text; } }
    const synth = {
      speaking: false, pending: false,
      speak(u) { if (u.text.trim()) { window.testSpoken.push(u.text); if (started) setTimeout(() => u.onstart?.(), 10); } },
      cancel() {}, getVoices: () => [], addEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true });
  }, started);
}

async function mockGeo(page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: {
    watchPosition(success, error) { window.testGPS = { success, error }; return 1; }, clearWatch() {},
  } }));
}

test('測速資料載入失敗：雷達明說未載入、開始行車時語音告知，重新載入後恢復', async ({ page }) => {
  await fakeSpeech(page);
  await mockGeo(page);
  await page.route(/\/data\/snapshots\//, (route) => route.abort());
  await page.goto('/?debug');
  const state = page.locator('#radar-state');
  await expect(state).toHaveText('測速資料未載入');
  await expect(page.locator('#app')).toHaveAttribute('data-data', 'empty');
  const retry = page.getByRole('button', { name: '重新載入測速資料' });
  await expect(retry).toBeVisible();

  await page.locator('#btn-start').click();
  await expect.poll(() => page.evaluate(() => window.testSpoken)).toContain('測速資料未載入，目前無法提醒測速');
  await expect(state).toHaveText('測速資料未載入');

  await page.unroute(/\/data\/snapshots\//);
  await retry.click();
  await expect(page.locator('#app')).toHaveAttribute('data-data', 'ready');
  await expect(retry).toBeHidden();
  await expect(state).not.toHaveText('測速資料未載入');
  expect(await page.evaluate(() => window.__drivehud.app.data.count)).toBeGreaterThan(1000);
});

test('語音沒有真的發聲時顯示「語音無法播放」', async ({ page }) => {
  await fakeSpeech(page, { started: false });
  await mockGeo(page);
  await page.goto('/?debug');
  await page.locator('#btn-start').click();
  await page.evaluate(() => window.__drivehud.app.ingest([{ type: 'APPROACH_ALERT', speechText: '前方兩百公尺有測速照相，速限五十' }]));
  await expect(page.locator('#voice-warn')).toBeVisible({ timeout: 6000 });
});

test('螢幕常亮取得失敗時提醒，停止行車後收起', async ({ page }) => {
  await mockGeo(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'wakeLock', { value: {
    request: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
  } }));
  await page.goto('/?debug');
  await expect(page.locator('#wake-warn')).toBeHidden();
  await page.locator('#btn-start').click();
  await expect(page.locator('#wake-warn')).toBeVisible();
  await expect(page.locator('#wake-warn')).toHaveText('螢幕可能自動關閉');
  await page.locator('#btn-start').click();
  await expect(page.locator('#wake-warn')).toBeHidden();
});

test('CSP 下主畫面與 3D 正常、無違規；沒有 ?debug 時不掛全域除錯物件', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('#btn-start')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-renderer', 'ready');
  await expect(page.locator('#app')).toHaveAttribute('data-data', 'ready');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => typeof window.__drivehud)).toBe('undefined');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(errors).toEqual([]);
});

test('主程式載入失敗時，啟動畫面提供重新整理', async ({ page }) => {
  await page.route(/\/src\/ui\/main\.js/, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.boot')).toBeVisible();
  const reload = page.getByRole('link', { name: '重新整理' });
  await expect(reload).toBeHidden(); // 前幾秒只顯示「載入中」
  await expect(reload).toBeVisible({ timeout: 12_000 });
  const box = await reload.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('設定頁資料區：匯入按鈕與連結至少 44px，結果有成功／失敗樣式', async ({ page }) => {
  await page.goto('/?debug');
  await page.locator('#btn-settings').click();
  for (const sel of ['.sd-btn-import', '.sd-source', '#sp-volume']) {
    const box = await page.locator(sel).boundingBox();
    expect(box.height, sel).toBeGreaterThanOrEqual(44);
  }
  await page.locator('.sd-file').setInputFiles({ name: 'cameras.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(page.locator('.sd-result')).toHaveClass(/sd-fail/);
  await expect(page.locator('.sd-result')).toContainText('.csv');
});

test('車款清單：九款直接選、目前車款打勾、Esc 收起；切回已建過的車款不重建', async ({ page }) => {
  await page.goto('/?debug');
  await page.evaluate(() => localStorage.removeItem('drivehud.settings.v1'));
  await page.reload();
  await page.waitForFunction(() => window.__drivehud?.app.car.getInfo().frames > 0);
  const model = page.locator('#cb-model');
  await model.click();
  await expect(model).toHaveAttribute('aria-expanded', 'true');
  const radios = page.locator('#model-picker').getByRole('radio');
  await expect(radios).toHaveCount(9);
  await expect(page.locator('#model-picker').getByRole('radio', { name: '女武神' })).toHaveAttribute('aria-checked', 'true');
  for (const r of await radios.all()) expect((await r.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(page.locator('#model-picker')).toBeHidden();
  await expect(model).toBeFocused();

  await model.click();
  await page.locator('#model-picker').getByRole('radio', { name: '馬車' }).click();
  await expect(model).toHaveText('馬車');
  await page.waitForFunction(() => window.__drivehud.app.car.getInfo().model === 'carriage' && !window.__drivehud.app.car.switching);
  await model.click();
  await page.locator('#model-picker').getByRole('radio', { name: '女武神' }).click();
  // 已快取：同步切換，沒有淡出等待
  expect(await page.evaluate(() => window.__drivehud.app.car.getInfo().model)).toBe('valkyrie');
  expect(await page.evaluate(() => window.__drivehud.app.car.getInfo().cachedModels)).toEqual(expect.arrayContaining(['valkyrie', 'carriage']));
});

test('只改車色時不重設車款、場景等其他 3D 狀態', async ({ page }) => {
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__drivehud?.app.car.getInfo().frames > 0);
  await page.evaluate(() => {
    window.__calls = [];
    const car = window.__drivehud.app.car;
    for (const k of ['setModel', 'setScene', 'setTime', 'setQuality', 'setView', 'setColor']) {
      const f = car[k].bind(car);
      car[k] = (...a) => { window.__calls.push(k); return f(...a); };
    }
  });
  await page.locator('#cb-appearance').click();
  await page.getByRole('radio', { name: '深藍', exact: true }).click();
  expect(await page.evaluate(() => window.__calls)).toEqual(['setColor']);
});

test('接近提醒時 3D 畫布尺寸不變（不重新配置）且暫停繪製，結束後恢復', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: () => 1, clearWatch() {} } }));
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__drivehud?.app.car.getInfo().frames > 0);
  const size = () => page.evaluate(() => { const c = document.querySelector('#car-canvas'); return [c.width, c.height]; });
  const before = await size();
  await page.locator('#btn-start').click();
  const set = (focus) => page.evaluate((focus) => window.__drivehud.app.setEngine({ tick: () => [],
    getState: () => ({ gps: 'OK', speedKmh: 52, headingDeg: 0, nearby: [], overspeed: false, focus }) }), focus);
  await set({ phase: 'APPROACHING', relation: 'SAME', distanceM: 150, camera: { limit: 50 } });
  await expect(page.locator('#approach')).toBeVisible();
  expect(await size()).toEqual(before);
  expect(await page.evaluate(() => window.__drivehud.app.car.getInfo().paused)).toBe(true);
  await set(null);
  await expect(page.locator('#approach')).toBeHidden();
  expect(await page.evaluate(() => window.__drivehud.app.car.getInfo().paused)).toBe(false);
  expect(await size()).toEqual(before);
});

test('超速提醒設定套用到引擎；通過測速點短暫顯示「已通過」；接近時有距離進度與讀屏提示', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: () => 1, clearWatch() {} } }));
  await page.goto('/?debug');
  await page.evaluate(() => localStorage.removeItem('drivehud.settings.v1'));
  await page.reload();
  const opts = () => page.evaluate(() => window.__drivehud.engine.options);
  expect(await opts()).toMatchObject({ overspeedToleranceKmh: 0, overspeedRepeatS: 10 });
  await page.locator('#btn-settings').click();
  await page.getByRole('radio', { name: '超過 5 km/h' }).click();
  await expect(page.getByRole('radio', { name: '超過 5 km/h' })).toHaveAttribute('aria-checked', 'true');
  await page.locator('#sp-repeat').uncheck();
  expect(await opts()).toMatchObject({ overspeedToleranceKmh: 5, overspeedRepeatS: 0 });
  await page.locator('#sp-close').click();

  await page.locator('#btn-start').click();
  await page.evaluate(() => window.__drivehud.app.setEngine({ tick: () => [], setOptions() {},
    getState: () => ({ gps: 'OK', speedKmh: 52, headingDeg: 0, nearby: [], overspeed: false,
      focus: { phase: 'APPROACHING', relation: 'SAME', distanceM: 150, radiusM: 200, camera: { limit: 50, interval: true } } }) }));
  await expect(page.locator('#ap-kind')).toBeVisible();
  expect(Number(await page.locator('#ap-progress-bar').evaluate((el) => el.style.getPropertyValue('--p')))).toBeCloseTo(0.25, 2);
  await page.evaluate(() => window.__drivehud.app.ingest([{ type: 'APPROACH_ALERT', speechText: '前方一百五十公尺有區間測速，速限五十' }]));
  await expect(page.locator('#sr-alert')).toHaveText('前方一百五十公尺有區間測速，速限五十');

  await page.evaluate(() => {
    window.__drivehud.app.setEngine({ tick: () => [], getState: () => ({ gps: 'OK', speedKmh: 52, headingDeg: 0, nearby: [], overspeed: false, focus: null }) });
    window.__drivehud.app.ingest([{ type: 'PASSED' }]);
  });
  await expect(page.locator('#radar-state')).toHaveText('已通過測速點');
  await expect(page.locator('#radar-state')).toHaveText('偵測中', { timeout: 5000 });
});
