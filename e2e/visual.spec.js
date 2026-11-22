// 主畫面各狀態截圖（e2e/screenshots/ui-*.png）＋版面健檢：無水平溢出、可點元件 ≥ 44px、主畫面不可捲動。
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { SHOTS } from './helpers.js';

const CAM = { limit: 50, address: '臺中市西屯區臺灣大道三段與文心路口（往市政府方向）' };
const STATES = {
  idle: null,
  driving: { gps: 'OK', speedKmh: 108, headingDeg: 45 },
  nearby: { gps: 'OK', speedKmh: 62, headingDeg: 45, nearby: [{ camera: CAM, distanceM: 240, relation: 'AMBIGUOUS' }] },
  approach: { gps: 'OK', speedKmh: 48, headingDeg: 45, focus: { phase: 'APPROACHING', relation: 'SAME', distanceM: 180, radiusM: 200, camera: CAM } },
  overspeed: { gps: 'OK', speedKmh: 128, headingDeg: 45, overspeed: true, focus: { phase: 'APPROACHING', relation: 'SAME', distanceM: 90, radiusM: 300, camera: { ...CAM, limit: 110 } } },
};

async function setState(page, st) {
  await page.evaluate((st) => {
    const s = Object.assign({ gps: 'OK', speedKmh: null, headingDeg: null, focus: null, nearby: [], overspeed: false }, st);
    window.__drivehud.app.setEngine({ getState: () => s, pushFix: () => [], tick: () => [], reset() {}, setCameras() {} });
  }, st);
}

async function audit(page) {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const small = [];
    for (const e of document.querySelectorAll('#app button, #app a, #app summary, #app input, #app [role=radio]')) {
      if (!vis(e) || e.closest('dialog:not([open])')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) small.push(`${e.id || e.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const overflow = [];
    for (const e of document.querySelectorAll('.frame *')) {
      if (!vis(e) || e.closest('dialog')) continue;
      const r = e.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.left < -1) overflow.push(`${e.id || e.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
      if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && getComputedStyle(e).textOverflow !== 'ellipsis') overflow.push(`text:${e.id || e.className}`);
    }
    const f = document.querySelector('.frame');
    const fs = (s) => { const e = document.querySelector(s); return e && vis(e) ? Math.round(parseFloat(getComputedStyle(e).fontSize)) : null; };
    return {
      layout: document.querySelector('#app').dataset.layout,
      small, overflow,
      frameScroll: f.scrollHeight - f.clientHeight,
      docScroll: document.documentElement.scrollWidth - innerWidth,
      speedFont: fs('#speed-value'),
      speedRect: (() => { const r = document.querySelector('#speed-value').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.height)]; })(),
    };
  });
}

for (const scheme of ['light', 'dark']) {
  test(`主畫面各狀態 (${scheme})`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: () => 1, clearWatch() {} } }));
    await page.goto('/?debug');
    await page.waitForFunction(() => window.__drivehud?.app.car.getInfo().frames > 0);
    const report = {};
    await page.locator('#cb-appearance').click();
    await page.waitForTimeout(300);
    report.appearance = await audit(page);
    await page.screenshot({ path: path.join(SHOTS, `ui-${info.project.name}-${scheme}-appearance.png`) });
    await page.locator('#cb-appearance').click();
    for (const [name, st] of Object.entries(STATES)) {
      if (st) {
        if (name === 'driving') await page.locator('#btn-start').click();
        await setState(page, st);
      }
      await page.waitForTimeout(500);
      report[name] = await audit(page);
      await page.screenshot({ path: path.join(SHOTS, `ui-${info.project.name}-${scheme}-${name}.png`) });
    }
    // 極簡模式：一般與接近提醒
    await page.locator('#btn-settings').click();
    await page.locator('#sp-minimal').check();
    await page.locator('#sp-close').click();
    for (const name of ['driving', 'overspeed']) {
      await setState(page, STATES[name]);
      await page.waitForTimeout(400);
      report[`minimal-${name}`] = await audit(page);
      await page.screenshot({ path: path.join(SHOTS, `ui-${info.project.name}-${scheme}-minimal-${name}.png`) });
    }
    console.log(JSON.stringify({ project: info.project.name, scheme, report }));
    // 車速：一般畫面至少 140px，且一般／附近／接近／超速時位置完全不動
    for (const name of ['driving', 'nearby', 'approach', 'overspeed']) {
      expect(report[name].speedFont, `${name} speed font`).toBeGreaterThanOrEqual(140);
      expect(report[name].speedRect, `${name} speed position`).toEqual(report.driving.speedRect);
    }
    expect(report['minimal-driving'].speedFont).toBeGreaterThanOrEqual(report.driving.speedFont);
    for (const [name, r] of Object.entries(report)) {
      expect(r.overflow, `${name} overflow`).toEqual([]);
      expect(r.small, `${name} small targets`).toEqual([]);
      expect(r.docScroll, `${name} horizontal scroll`).toBeLessThanOrEqual(0);
      expect(r.frameScroll, `${name} frame scroll`).toBeLessThanOrEqual(0);
    }
  });
}
