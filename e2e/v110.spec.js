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
