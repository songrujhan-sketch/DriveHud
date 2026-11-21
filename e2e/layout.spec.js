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
  await expect(page.locator('#cb-colors [data-color]')).toHaveCount(12);
  await page.locator('#cb-model').click();
  await expect(page.locator('#cb-model')).toHaveText('黑騎士');
  await page.locator('#cb-colors [data-color]').nth(6).click();
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

test('車門按鈕：八款車都能開關車門，換車後自動關上', async ({ page }) => {
  const errors = await openSim(page);
  await page.evaluate(() => localStorage.removeItem('drivehud.settings.v1'));
  await page.reload();
  await page.locator('.appearance summary').click();
  const view = page.locator('#cb-view');
  await view.click();
  await view.click();
  await expect(view).toHaveAccessibleName(/正側面/);
  const initialWidth = (await page.locator('#cb-model').boundingBox()).width;
  for (const name of ['女武神', '黑騎士', '阿斯拉', '豹勇士', '重騎兵', '明日之星', '馬車', '好爸爸']) {
    await expect(page.locator('#cb-model')).toHaveText(name);
    expect((await page.locator('#cb-model').boundingBox()).width).toBe(initialWidth);
    const jet = page.locator('#cb-jet');
    if (['黑騎士','阿斯拉','重騎兵','明日之星'].includes(name)) {
      await jet.click();
      await expect(view).toHaveAccessibleName(name === '阿斯拉' ? /正後方/ : /後 45°/);
    } else {
      await expect(jet).toBeHidden();
    }
    await expect(page.locator('#cb-doors')).toBeVisible();
    await expect(page.locator('#cb-doors')).toHaveText(name === '明日之星' ? '艙罩：關' : '車門：關'); // 換車後一律是關的
    await page.locator('#cb-doors').click();
    await expect(page.locator('#cb-doors')).toHaveText(name === '明日之星' ? '艙罩：開' : '車門：開');
    await expect(page.locator('#cb-doors')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#cb-model').click();
  }
  expect(errors).toEqual([]);
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
