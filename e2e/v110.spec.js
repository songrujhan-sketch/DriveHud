// V1.10 Phase 1：失敗狀態一定要讓駕駛知道（資料、語音、螢幕常亮），以及啟動與安全設定。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** 假語音：記錄要講的句子；started=false 時模擬 iOS 沒有真的發聲。 */
async function fakeSpeech(page, { started = true, throws = false } = {}) {
  await page.addInitScript(({ started, throws }) => {
    window.testSpoken = [];
    class U { constructor(text) { this.text = text; } }
    const synth = {
      speaking: false, pending: false,
      speak(u) {
        if (!u.text.trim()) return;                 // unlock 用的空白句
        if (throws) throw new Error('synth.speak failed'); // 模擬 iOS 同步丟例外
        window.testSpoken.push(u.text);
        if (started) setTimeout(() => u.onstart?.(), 10);
      },
      cancel() {}, getVoices: () => [], addEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true });
  }, { started, throws });
}

const DATA_MISSING = '測速資料未載入，目前無法提醒測速';

/**
 * 扣住內建測速快照的請求，直到測試呼叫 release(action)；action: 'continue' | 'abort' | '404'。
 * passNew() 之後新發出的請求照常放行（例如匯入時比對舊筆數），先前扣住的仍等 release；
 * release 之後的請求一律套用同一個 action（例如舊載入接著讀備援 CSV）。
 */
async function holdSnapshots(page) {
  let open, released = null, holding = true;
  const gate = new Promise((r) => { open = r; });
  const apply = (route, action) => (action === 'continue' ? route.continue()
    : action === '404' ? route.fulfill({ status: 404, body: '' }) : route.abort());
  await page.route(/\/data\/snapshots\//, async (route) => {
    if (released) return apply(route, released);
    if (holding) return apply(route, await gate);
    return route.continue();
  });
  return { release(action) { released = action; open(action); }, passNew() { holding = false; } };
}

/** 官方 CSV 的前 rows 筆，當作使用者匯入的檔案（匯入要求不少於現有筆數的一半）。 */
function officialCsv(rows) {
  const lines = readFileSync(new URL('../data/snapshots/npa7320.csv', import.meta.url), 'utf8').split(/\r?\n/);
  return Buffer.from(lines.slice(0, 2 + rows).join('\n') + '\n', 'utf8');
}
const spokenCount = (page, text) => page.evaluate((t) => window.testSpoken.filter((x) => x === t).length, text);

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

// 回歸（PR #8 審查 P1-01）：資料在背景載入期間就開始行車，之後才確定沒有資料時也要用語音告知，且同一段缺漏只講一次。
test('先開始行車、資料隨後確認為 0 筆：語音告知一次，重複更新同一異常不再播報，恢復後再失敗會重新告知', async ({ page }) => {
  await fakeSpeech(page);
  await mockGeo(page);
  const snap = await holdSnapshots(page);
  await page.goto('/?debug');
  await expect(page.locator('#app')).toHaveAttribute('data-data', 'loading');
  await page.locator('#btn-start').click();
  await page.waitForTimeout(300);
  expect(await spokenCount(page, DATA_MISSING)).toBe(0); // 載入中不誤報

  snap.release('404'); // 所有內建快照都不存在 → 0 筆
  await expect(page.locator('#app')).toHaveAttribute('data-data', 'empty');
  await expect.poll(() => spokenCount(page, DATA_MISSING)).toBe(1);

  // 同一段缺漏反覆更新（含 empty ↔ error）：不重複播報
  await page.evaluate(() => {
    const app = window.__drivehud.app;
    app.setData({ state: 'empty', count: 0 });
    app.setData({ state: 'error', count: 0 });
    app.setData({ state: 'error', count: 0 });
  });
  await page.waitForTimeout(300);
  expect(await spokenCount(page, DATA_MISSING)).toBe(1);

  // 資料恢復後又失敗：是新的一段缺漏，要再講
  await page.evaluate(() => window.__drivehud.app.setData({ state: 'ready', count: 10 }));
  await page.evaluate(() => window.__drivehud.app.setData({ state: 'error', count: 0 }));
  await expect.poll(() => spokenCount(page, DATA_MISSING)).toBe(2);
});

test('先開始行車、資料隨後載入失敗（error）：語音告知', async ({ page }) => {
  await fakeSpeech(page);
  await mockGeo(page);
  const snap = await holdSnapshots(page);
  await page.goto('/?debug');
  await page.locator('#btn-start').click();
  // 內建快照讀取在 store 內會吞掉網路錯誤（結果是 0 筆）；讀取本身丟例外時 main.js 才標 error，這裡直接送出 error 狀態。
  await page.evaluate(() => window.__drivehud.app.setData({ state: 'error', count: 0 }));
  await expect.poll(() => spokenCount(page, DATA_MISSING)).toBe(1);
  snap.release('continue');
  await expect(page.locator('#app')).toHaveAttribute('data-data', 'ready');
  expect(await spokenCount(page, DATA_MISSING)).toBe(1);
});

test('先開始行車、資料隨後正常載入：不誤觸資料缺漏語音', async ({ page }) => {
  await fakeSpeech(page);
  await mockGeo(page);
  const snap = await holdSnapshots(page);
  await page.goto('/?debug');
  await page.locator('#btn-start').click();
  snap.release('continue');
  await expect(page.locator('#app')).toHaveAttribute('data-data', 'ready');
  await page.waitForTimeout(500);
  expect(await spokenCount(page, DATA_MISSING)).toBe(0);
  await expect(page.locator('#voice-warn')).toBeHidden();
});

// 回歸（PR #8 審查 P2-01）：初始載入還沒回來時使用者先匯入；舊請求之後成功或失敗都不能覆蓋匯入的資料。
for (const late of ['continue', 'abort']) {
  test(`初始載入晚於匯入完成（舊請求${late === 'continue' ? '成功' : '失敗'}）：保留匯入的資料與 ready 狀態`, async ({ page }) => {
    await mockGeo(page);
    const snap = await holdSnapshots(page);
    await page.goto('/?debug');
    await expect(page.locator('#app')).toHaveAttribute('data-data', 'loading');
    await page.locator('#btn-settings').click();
    snap.passNew(); // 初始載入仍被扣住；匯入自己的比對請求放行
    await page.locator('.sd-file').setInputFiles({ name: 'npa7320.csv', mimeType: 'text/csv', buffer: officialCsv(1500) });
    await expect(page.locator('.sd-result')).toHaveClass(/sd-ok/, { timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => window.__drivehud.app.data.state)).toBe('ready');
    const imported = await page.evaluate(() => window.__drivehud.app.data.count);
    expect(imported).toBeGreaterThan(1000);
    expect(imported).toBeLessThan(1600); // 與內建快照（約 1,900 筆）可以分辨

    snap.release(late); // 內建快照這時才回來（成功）或讀不到（0 筆）
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__drivehud.app.data)).toMatchObject({ state: 'ready', count: imported });
    await expect(page.locator('#app')).toHaveAttribute('data-data', 'ready');
  });
}

// 回歸（PR #8 審查 P2-03）：synth.speak() 同步丟例外時，「語音無法播放」要留著，不能被 speak() 的回傳值收起。
test('synth.speak 同步丟例外時保留「語音無法播放」警告', async ({ page }) => {
  await fakeSpeech(page, { throws: true });
  await mockGeo(page);
  await page.goto('/?debug');
  await expect(page.locator('#app')).toHaveAttribute('data-data', 'ready');
  await page.locator('#btn-start').click();
  await page.evaluate(() => window.__drivehud.app.ingest([{ type: 'APPROACH_ALERT', speechText: '前方一百公尺有測速照相，速限五十' }]));
  await expect(page.locator('#voice-warn')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('#voice-warn')).toBeVisible();
});

test('語音正常播放時不顯示「語音無法播放」', async ({ page }) => {
  await fakeSpeech(page);
  await mockGeo(page);
  await page.goto('/?debug');
  await expect(page.locator('#app')).toHaveAttribute('data-data', 'ready');
  await page.locator('#btn-start').click();
  await page.evaluate(() => window.__drivehud.app.ingest([{ type: 'APPROACH_ALERT', speechText: '前方一百公尺有測速照相，速限五十' }]));
  await expect.poll(() => page.evaluate(() => window.testSpoken)).toContain('前方一百公尺有測速照相，速限五十');
  await page.waitForTimeout(500);
  await expect(page.locator('#voice-warn')).toBeHidden();
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

test('鍵盤：車色群組只佔一個 Tab 停駐點、方向鍵換色；車款清單方向鍵移動、Enter 才換車', async ({ page }) => {
  await page.goto('/?debug');
  await page.evaluate(() => localStorage.removeItem('drivehud.settings.v1'));
  await page.reload();
  await page.waitForFunction(() => window.__drivehud?.app.car.getInfo().frames > 0);
  await page.locator('#cb-appearance').click();
  const tabbable = await page.locator('#cb-colors [role="radio"][tabindex="0"]').count();
  expect(tabbable).toBe(1);
  await page.getByRole('radio', { name: '赤紅', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '熔岩橘', exact: true })).toBeFocused();
  await expect(page.getByRole('radio', { name: '熔岩橘', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  await page.locator('#cb-model').click();
  await expect(page.locator('#model-picker').getByRole('radio', { name: '女武神' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#model-picker').getByRole('radio', { name: '黑騎士' })).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('drivehud.settings.v1')).model)).toBe('valkyrie');
  await page.keyboard.press('Enter');
  await expect(page.locator('#cb-model')).toHaveText('黑騎士');
});

test('測速資料超過 90 天：設定鈕出現提示點，資料區寫明建議更新', async ({ page }) => {
  await page.route(/\/data\/snapshots\/cameras\.json/, async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.fetchedAt = '2025-01-01T00:00:00+08:00';
    await route.fulfill({ response: res, json });
  });
  await page.goto('/?debug');
  const btn = page.locator('#btn-settings');
  await expect(btn).toHaveClass(/has-dot/);
  await expect(btn).toHaveAccessibleName(/超過 90 天/);
  await btn.click();
  await expect(page.locator('.sd-row-time .sd-value')).toContainText('建議更新');
});
