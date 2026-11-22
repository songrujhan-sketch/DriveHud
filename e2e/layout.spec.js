// 版面、明暗模式、極簡模式、設定頁。
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { SHOTS, openSim, playScenario } from './helpers.js';

for (const scheme of ['light', 'dark']) {
  test.describe(`colorScheme=${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`normal 版面：車速最大、方向與 GPS 狀態 (${scheme})`, async ({ page }, info) => {
      const errors = await openSim(page);
      await page.locator('#sim-list button[data-index="0"]').click();
      await expect(page.locator('#app')).toHaveClass(/layout-normal/);
      await expect(page.locator('#speed-value')).toHaveText('—');
      await expect(page.locator('#gps-status')).toBeVisible();
      // 車速為畫面最大字
      const sizes = await page.evaluate(() => {
        const fs = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
        return { speed: fs('#speed-value'), heading: fs('#heading'), gps: fs('#gps-status'), limit: fs('#limit-value') };
      });
      expect(sizes.speed).toBeGreaterThan(sizes.heading * 3);
      expect(sizes.speed).toBeGreaterThan(sizes.gps * 3);
      const tab = await page.locator('#speed-value').evaluate((el) => getComputedStyle(el).fontVariantNumeric);
      expect(tab).toContain('tabular-nums');
      // 暗色背景判斷
      const bg = await page.locator('#app').evaluate((el) => getComputedStyle(el).backgroundColor);
      const lum = bg.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
      if (scheme === 'dark') expect(lum).toBeLessThan(60); else expect(lum).toBeGreaterThan(200);
      await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${scheme}-normal.png`) });
      expect(errors).toEqual([]);
    });
  });
}

test('極簡模式（手動）優先於 approach；關閉後恢復', async ({ page }, info) => {
  await openSim(page);
  await page.locator('#btn-settings').click();
  await expect(page.locator('#settings-panel')).toHaveClass(/open/);
  await page.locator('#sp-minimal').check();
  await page.locator('#sp-close').click();
  await expect(page.locator('#app')).toHaveClass(/layout-minimal/);
  await expect(page.locator('.car-zone')).toBeHidden();
  const r = await playScenario(page, 0);
  expect(r.seen.layouts).toEqual(['minimal']);
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-minimal.png`) });
  // 關閉極簡
  await page.locator('#btn-settings').click();
  await page.locator('#sp-minimal').uncheck();
  await page.locator('#sp-close').click();
  await expect(page.locator('#app')).toHaveClass(/layout-normal/);
});

test('設定頁只留極簡、低畫質、提醒距離與資料；車款、車色、車燈在外觀列選並存入 localStorage', async ({ page }, info) => {
  const errors = await openSim(page);
  await page.evaluate(() => localStorage.removeItem('drivehud.settings.v1'));
  await page.reload();
  await expect(page.locator('#cb-model')).toBeVisible();
  await expect(page.locator('#cb-colors')).toBeHidden();
  await page.locator('.appearance summary').click();
  await expect(page.locator('#cb-colors [data-color]')).toHaveCount(16);
  await page.locator('#cb-model').click();
  await expect(page.locator('#cb-model')).toHaveText('黑騎士');
  await page.getByRole('radio', {name:'曜黑',exact:true}).click();
  await page.locator('#cb-lights').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drivehud.settings.v1')));
  expect(saved).toMatchObject({ model: 'darkknight', color: '#15171a', headlights: true });
  await page.locator('#btn-settings').click();
  await expect(page.locator('#sp-models, #sp-colors, #sp-lights')).toHaveCount(0);
  await expect(page.locator('#sp-minimal')).toHaveCount(1);
  await expect(page.locator('#sp-lowq')).toHaveCount(1);
  await expect(page.locator('#sp-radius li')).toHaveText(['市區：200 m', '快速道路：300 m', '道路類型未知：300 m']);

  await expect(page.locator('#settings-data')).toHaveCount(1);
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-settings.png`) });
  await page.reload();
  await expect(page.locator('#cb-model')).toHaveText('黑騎士');
  await expect(page.locator('#cb-lights')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('車門按鈕：九款車都能開關車門，換車後自動關上', async ({ page }) => {
  const errors = await openSim(page);
  await page.evaluate(() => localStorage.removeItem('drivehud.settings.v1'));
  await page.reload();
  await page.locator('.appearance summary').click();
  const view = page.locator('#cb-view');
  await view.click();
  await view.click();
  await expect(view).toHaveAccessibleName(/正側面/);
  const initialWidth = (await page.locator('#cb-model').boundingBox()).width;
  for (const name of ['女武神', '黑騎士', '阿斯拉', '豹勇士', '重騎兵', '明日之星', '馬車', '休旅車']) {
    await expect(page.locator('#cb-model')).toHaveText(name);
    expect((await page.locator('#cb-model').boundingBox()).width).toBe(initialWidth);
    const jet = page.locator('#cb-jet');
    if (['黑騎士','阿斯拉','重騎兵','明日之星'].includes(name)) {
      await jet.click();
      await expect(view).toHaveAccessibleName(/左後 45°/);
    } else {
      await expect(jet).toBeHidden();
    }
    await expect(page.locator('#cb-doors')).toBeVisible();
    await expect(page.locator('#cb-doors')).toHaveAccessibleName(name === '明日之星' ? '艙罩：關' : '車門：關'); // 換車後一律是關的
    await page.locator('#cb-doors').click();
    await expect(page.locator('#cb-doors')).toHaveAccessibleName(name === '明日之星' ? '艙罩：開' : '車門：開');
    await expect(page.locator('#cb-doors')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#cb-model').click();
  }
  await expect(page.locator('#cb-model')).toHaveText('重型機車');
  await expect(page.locator('#cb-doors')).toBeHidden();
  await page.locator('#cb-jet').click();
  await expect(view).toHaveAccessibleName(/後 45°/);
  expect(errors).toEqual([]);
});

test('停車噴射持續開啟，固定視角鎖左後，環繞時保留鏡頭', async ({page}) => {
  await page.goto('/');
  const model = page.locator('#cb-model');
  const view = page.locator('#cb-view');
  const orbit = page.locator('#cb-orbit');
  const jet = page.locator('#cb-jet');
  await model.click();
  await model.click();
  await expect(model).toHaveText('阿斯拉');

  await jet.click();
  await expect(jet).toHaveAttribute('aria-pressed', 'true');
  await expect(view).toHaveAccessibleName(/左後 45°.*鎖定/);
  await expect(view).toBeDisabled();
  await expect(orbit).toBeDisabled();
  await page.waitForFunction(() => window.__drivehud.app.car.getInfo().azimuth === Math.PI * 3 / 4);

  // The former preview timed out after 2.5 seconds.
  await page.waitForTimeout(3100);
  await expect(jet).toHaveAttribute('aria-pressed', 'true');
  await jet.click();
  await expect(view).toBeEnabled();
  await view.click();
  await expect(view).toHaveAccessibleName(/正後方/);

  await orbit.click();
  const viewName = await view.getAttribute('aria-label');
  await jet.click();
  await expect(orbit).toHaveAttribute('aria-pressed', 'true');
  await expect(view).toHaveAttribute('aria-label', viewName);
  const angle = await page.evaluate(() => window.__drivehud.app.car.getInfo().azimuth);
  await page.waitForFunction(previous => window.__drivehud.app.car.getInfo().azimuth !== previous, angle);
  await jet.click();
  await expect(jet).toHaveAttribute('aria-pressed', 'false');
  await expect(orbit).toHaveAttribute('aria-pressed', 'true');
});

test('圖示列固定，環繞可啟停，外觀只保留車色、場景與時段', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cb-orbit')).toHaveAttribute('aria-pressed', 'false');
  const oldAngle = await page.evaluate(() => window.__drivehud.app.car.getInfo().azimuth);
  await page.locator('#cb-orbit').click();
  await expect(page.locator('#cb-orbit')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForFunction(angle => Math.abs(window.__drivehud.app.car.getInfo().azimuth - angle) > .18, oldAngle);
  await page.locator('#cb-orbit').click();
  await expect(page.locator('#cb-orbit')).toHaveAttribute('aria-pressed', 'false');
  await page.waitForFunction(angle => window.__drivehud.app.car.getInfo().azimuth === angle, oldAngle);

  const ids = ['#cb-model', '#cb-lights', '#cb-doors', '#cb-jet', '#cb-orbit'];
  const positions = () => page.evaluate(selectors => selectors.map(s => document.querySelector(s).getBoundingClientRect().x), ids);
  const before = await positions();
  await expect(page.locator('#cb-jet')).toBeHidden();
  await page.locator('#cb-model').click();
  await expect(page.locator('#cb-jet')).toBeVisible();
  expect(await positions()).toEqual(before);
  await page.locator('.appearance summary').click();
  await expect(page.locator('#carbar > *')).toHaveCount(3);
  expect(await positions()).toEqual(before);
});

test('新版資源與車款圖示在一般畫面及接近提醒時可用', async ({page}) => {
  const staleAssets = [];
  await page.route(/\/(?:app\.css|main\.js|app\.js|deps\.js|settings\.js|carView\.js)$/, route => {
    staleAssets.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => Object.defineProperty(navigator,'geolocation',{value:{
    watchPosition: () => 1, clearWatch() {},
  }}));
  await page.goto('/');
  const model = page.locator('#cb-model');
  await expect(page.locator('.build-tag')).toHaveText('V1.9');
  await expect(model.locator('svg')).toBeVisible();
  await model.click();
  await expect(model).toHaveText('黑騎士');

  await page.locator('#btn-start').click();
  await page.evaluate(() => window.__drivehud.app.setEngine({
    tick: () => [],
    getState: () => ({gps:'OK', speedKmh:45, headingDeg:0, nearby:[], overspeed:false,
      focus:{phase:'APPROACHING', relation:'SAME', distanceM:100, camera:{limit:50}}}),
  }));
  await expect(page.locator('#app')).toHaveClass(/layout-approach/);
  await expect(page.locator('#speed-value')).toHaveText('45');
  await expect(page.locator('#limit-value')).toHaveText('50');
  await expect(model.locator('svg')).toBeVisible();
  await model.click();
  await expect(model).toHaveText('阿斯拉');
  expect(staleAssets).toEqual([]);
});

test('窄視窗展開外觀時，速度數值、單位、GPS 與雷達內容仍完整可見', async ({ page }, info) => {
  await page.setViewportSize(info.project.name === 'portrait'
    ? {width: 393, height: 620}
    : {width: 852, height: 310});
  await page.goto('/');
  await expect(page.locator('#gps-status')).toContainText('GPS 待命');

  await page.waitForFunction(() => window.__drivehud?.app.car.getInfo().frames > 0);
  const readouts = ['#speed-value', '.speed-unit', '#gps-status', '#radar-state', '#radar-detail'];
  const positions = () => page.locator('.frame').evaluate((frame, selectors) => {
    const viewport = frame.getBoundingClientRect();
    return selectors.map(selector => {
      const el = frame.querySelector(selector);
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { top: rect.top, bottom: rect.bottom, visible: viewport.top <= rect.top &&
        viewport.bottom >= rect.bottom && el.contains(hit) };
    });
  }, readouts);

  const before = await positions();
  await page.locator('.appearance summary').click();
  await expect(page.locator('#cb-colors')).toBeVisible();
  const after = await positions();
  const menu = await page.locator('.appearance').boundingBox();

  for (const [index, rect] of after.entries()) {
    expect(rect.visible, readouts[index]).toBe(true);
    expect(rect.bottom, readouts[index]).toBeLessThanOrEqual(menu.y);
    expect(Math.abs(rect.top - before[index].top), readouts[index]).toBeLessThanOrEqual(2);
  }
});

test('主畫面模板可載入且無 console error（開始行車按鈕存在）', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/src/ui/index.template.html');
  await expect(page.locator('#btn-start')).toBeVisible();
  await expect(page.locator('#gps-status')).toContainText('GPS 待命');
  expect(errors).toEqual([]);
});
