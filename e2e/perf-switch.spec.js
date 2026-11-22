// 車款切換效能探針（只記錄、不設門檻）：量測切換時主執行緒長任務（> 50 ms）總時間。
// 執行：E2E_PERF=1 npm run e2e -- e2e/perf-switch.spec.js
// 注意：雲端 Chromium 以軟體 GPU 繪圖，數值只適合前後版本相對比較；iPhone 實機請用 Safari Web Inspector。
import { test, expect } from '@playwright/test';

async function choose(page, name) {
  if (await page.locator('#model-picker').count()) {
    await page.locator('#cb-model').click();
    await page.locator('#model-picker').getByRole('radio', { name, exact: true }).click();
  } else {
    // V1.9 以前：車款鍵一次輪換一台
    for (let i = 0; i < 9 && (await page.locator('#cb-model-name').textContent()) !== name; i++) await page.locator('#cb-model').click();
  }
  await expect(page.locator('#cb-model')).toHaveText(name);
}

test('車款切換：長任務時間（首次建模 vs 再次切回）', async ({ page }, info) => {
  test.skip(!process.env.E2E_PERF || info.project.name !== 'portrait', '效能探針：E2E_PERF=1 時才跑（只量直向）');
  await page.goto('/?debug');
  await page.evaluate(() => localStorage.removeItem('drivehud.settings.v1'));
  await page.reload();
  await page.waitForFunction(() => window.__drivehud?.app.car.getInfo().frames > 2);
  await page.evaluate(() => {
    window.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: false });
  });
  const measure = async (label, name) => {
    await page.evaluate(() => { window.__long.length = 0; });
    await choose(page, name);
    await page.waitForTimeout(1200);
    const long = await page.evaluate(() => window.__long.slice());
    const total = Math.round(long.reduce((a, b) => a + b, 0)), max = Math.round(Math.max(0, ...long));
    console.log(`PERF ${label} → ${name}: longtask total ${total} ms, max ${max} ms, count ${long.length}`);
    return { total, max };
  };
  // 基準：只重畫一幀（切換車燈）
  await page.evaluate(() => { window.__long.length = 0; });
  await page.locator('#cb-lights').click();
  await page.waitForTimeout(1200);
  const base = await page.evaluate(() => window.__long.slice());
  console.log(`PERF baseline (one redraw): longtask total ${Math.round(base.reduce((a, b) => a + b, 0))} ms, count ${base.length}`);
  await page.locator('#cb-lights').click();
  await page.waitForTimeout(800);
  await measure('first', '阿斯拉');
  await measure('first', '馬車');
  await measure('back', '女武神');
  await measure('back', '阿斯拉');
  await measure('back', '馬車');
});
