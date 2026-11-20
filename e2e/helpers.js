import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

export async function openSim(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/sim.html');
  await page.waitForSelector('#sim-list li');
  return errors;
}

export const scenarioCount = (page) => page.locator('#sim-list li').count();

/** 選擇第 i 條情境，4× 播到底；回傳過程資訊（出現過的版面、事件類型、預期）。 */
export async function playScenario(page, i, { shot } = {}) {
  await page.locator(`#sim-list button[data-index="${i}"]`).click();
  await page.locator('[data-speed="4"]').click();
  const expected = await page.evaluate((k) => window.__sim.scenarios[k], i)
    .then((sc) => ({ id: sc.id, types: (sc.expectedEvents || []).map((e) => e.type), finalLayout: sc.expectedFinal && sc.expectedFinal.layout }));
  await page.locator('#sim-play').click();
  // 播放期間若要抓中途畫面：等到出現指定版面
  if (shot) {
    if (expected.types.includes('APPROACH_ALERT')) await page.waitForFunction((l) => document.querySelector('#sim-seen').dataset.layouts.split(',').includes(l), shot.layout, { timeout: 90_000 }).catch(() => {});
    await page.screenshot({ path: path.join(SHOTS, `${shot.name}-mid.png`) });
  }
  await page.waitForSelector('#sim-status[data-state="done"]', { timeout: 110_000 });
  const seen = await page.locator('#sim-seen').evaluate((el) => ({
    layouts: el.dataset.layouts.split(',').filter(Boolean),
    nearby: el.dataset.nearby === 'true',
    overspeed: el.dataset.overspeed === 'true',
  }));
  const logged = await page.locator('#event-log li').evaluateAll((l) => l.map((x) => x.dataset.type));
  const speeches = await page.locator('#speech-log li').allTextContents();
  const pass = await page.locator('#sim-result').getAttribute('data-pass');
  return { expected, seen, logged, speeches, pass };
}
