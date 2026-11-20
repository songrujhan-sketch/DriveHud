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

test('設定頁：四款車、七色、車燈、提醒距離（唯讀）、#settings-data 容器、localStorage', async ({ page }, info) => {
  const errors = await openSim(page);
  await page.locator('#btn-settings').click();
  await expect(page.locator('#sp-models [data-model]')).toHaveText(['女武神', '黑暗騎士', '阿斯拉', '裝甲越野']);
  await expect(page.locator('#sp-models [data-model]')).toHaveCount(4);
  await expect(page.locator('#sp-colors [data-color]')).toHaveCount(7);
  await expect(page.locator('#sp-radius')).toContainText('300');
  await expect(page.locator('#sp-radius')).toContainText('500');
  await expect(page.locator('#settings-data')).toHaveCount(1);
  await page.locator('#sp-models [data-model="darkknight"]').click();
  await page.locator('#sp-colors [data-color]').nth(1).click();
  await page.locator('#sp-lights').check();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drivehud.settings.v1')));
  expect(saved).toMatchObject({ model: 'darkknight', headlights: true });
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-settings.png`) });
  await page.reload();
  await page.locator('#btn-settings').click();
  await expect(page.locator('#sp-models [data-model="darkknight"]')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('車門按鈕：四款車都能開關車門，換車後自動關上', async ({ page }) => {
  const errors = await openSim(page);
  await page.evaluate(() => localStorage.removeItem('drivehud.settings.v1'));
  await page.reload();
  for (const name of ['女武神', '黑暗騎士', '阿斯拉', '裝甲越野']) {
    await expect(page.locator('#cb-model')).toHaveText(`車款：${name}`);
    await expect(page.locator('#cb-doors')).toBeVisible();
    await expect(page.locator('#cb-doors')).toHaveText('車門：關'); // 換車後一律是關的
    await page.locator('#cb-doors').click();
    await expect(page.locator('#cb-doors')).toHaveText('車門：開');
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
  await expect(page.locator('#gps-status')).toContainText('定位中');
  expect(errors).toEqual([]);
});
