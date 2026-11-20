// 逐條情境以 4× 播到底，斷言版面 class 與事件文字（期望值取自各情境檔的 expectedEvents / expectedFinal）。
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { SHOTS, openSim, scenarioCount, playScenario } from './helpers.js';

test('sim.html 載入無 console error，且全程顯示「模擬」標記', async ({ page }) => {
  const errors = await openSim(page);
  await expect(page.locator('#sim-badge')).toBeVisible();
  await expect(page.locator('#sim-badge')).toHaveText('模擬');
  expect(await scenarioCount(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('逐條情境播放到底', async ({ page }, info) => {
  test.setTimeout(900_000); // 五條情境以 4× 連續播放約 2 分鐘，另留截圖與等待餘裕
  const errors = await openSim(page);
  const n = await scenarioCount(page);
  for (let i = 0; i < n; i++) {
    await test.step(`情境 ${i + 1}`, async () => {
      const r = await playScenario(page, i, { shot: { layout: 'approach', name: `${info.project.name}-s${i + 1}` } });
      const tracked = ['APPROACH_ALERT', 'NEARBY', 'OVERSPEED_ALERT', 'PASSED'];
      const want = r.expected.types.filter((t) => tracked.includes(t));
      const got = r.logged.filter((t) => tracked.includes(t));

      // 事件類型與順序
      expect(got, `情境 ${r.expected.id} 事件序列`).toEqual(want);
      await expect(page.locator('#sim-result')).toHaveAttribute('data-pass', 'true');

      // 版面：有 APPROACH_ALERT 才會出現 approach；反向 / 附近 / 停車等不得出現
      if (want.includes('APPROACH_ALERT')) expect(r.seen.layouts).toContain('approach');
      else expect(r.seen.layouts).not.toContain('approach');
      if (want.includes('NEARBY')) expect(r.seen.nearby).toBe(true);
      if (want.includes('OVERSPEED_ALERT')) expect(r.seen.overspeed).toBe(true);
      else expect(r.seen.overspeed).toBe(false);

      // 語音：只播 APPROACH_ALERT / OVERSPEED_ALERT，且每類一次
      const nSpeech = want.filter((t) => t === 'APPROACH_ALERT' || t === 'OVERSPEED_ALERT').length;
      expect(r.speeches).toHaveLength(nSpeech);
      if (want.includes('APPROACH_ALERT')) expect(r.speeches.join('|')).toContain('測速');
      if (want.includes('OVERSPEED_ALERT')) expect(r.speeches.join('|')).toContain('超速');

      // 結束版面（通過後應恢復）
      if (r.expected.finalLayout) {
        await expect(page.locator('#app')).toHaveAttribute('data-layout', r.expected.finalLayout);
      }
      // 事件記錄面板有文字
      if (want.length) await expect(page.locator('#event-log li').first()).not.toBeEmpty();

      await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-s${i + 1}-end.png`) });
    });
  }
  expect(errors).toEqual([]);
});
