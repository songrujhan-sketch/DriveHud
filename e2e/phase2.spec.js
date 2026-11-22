import { test, expect } from '@playwright/test';
import { cam, line } from '../test/engine/helpers.js';

async function mockGPS(page) {
  await page.addInitScript(() => Object.defineProperty(navigator,'geolocation',{value:{
    watchPosition(success, error) { window.testGPS = {success,error}; return 1; },
    clearWatch() {},
  }}));
}

test('定位失效即隱藏舊讀數及提醒，取得有效定位後才恢復', async ({page}) => {
  await mockGPS(page);
  await page.goto('/?debug');
  const gps = page.locator('#gps-status');
  const speed = page.locator('#speed-value');
  const approach = page.locator('#approach');
  await expect(gps).toHaveAttribute('data-status','IDLE');
  await page.locator('#btn-start').click();
  await expect(gps).toHaveAttribute('data-status','SEARCHING');

  const camera = cam();
  const fixes = line({startBeforeM:94,n:5,c:camera});
  await page.evaluate(({camera,fixes}) => {
    const {app,engine} = window.__drivehud;
    window.testApproachAlerts = 0;
    app.onEvents(events => {
      window.testApproachAlerts += events.filter(event => event.type === 'APPROACH_ALERT').length;
    });
    engine.setCameras([camera]);
    const stepMs = 500;
    const start = Date.now() - stepMs * (fixes.length - 1);
    for(const [i,fix] of fixes.entries()) window.testGPS.success({timestamp:start + i * stepMs,coords:{
      latitude:fix.lat, longitude:fix.lon, accuracy:fix.accuracyM, heading:fix.headingDeg, speed:fix.speedMps,
    }});
  },{camera,fixes});
  await expect(speed).toHaveText('50');
  await expect(approach).toBeVisible();

  for(const [code,status] of [[3,'TIMEOUT'],[2,'UNAVAILABLE'],[1,'DENIED']]) {
    await page.evaluate(code=>window.testGPS.error({code}),code);
    await expect(gps).toHaveAttribute('data-status',status);
    await expect(speed).toHaveText('—');
    await expect(page.locator('#heading')).toHaveText('—');
    await expect(approach).toBeHidden();
  }
  await page.evaluate(cam=>window.testGPS.success({timestamp:Date.now(),coords:{
    latitude:cam.lat,longitude:cam.lon-.0004,accuracy:150,heading:90,speed:16,
  }}),camera);
  await expect(gps).toHaveAttribute('data-status','POOR');
  await expect(speed).toHaveText('—');
  await expect(approach).toBeHidden();

  await page.evaluate(cam=>window.testGPS.success({timestamp:Date.now(),coords:{
    latitude:cam.lat,longitude:cam.lon-.0003,accuracy:5,heading:90,speed:16,
  }}),camera);
  await expect(gps).toHaveAttribute('data-status','OK');
  await expect(speed).toHaveText('58');
  await expect(approach).toBeVisible();
  expect(await page.evaluate(()=>window.testApproachAlerts)).toBe(1);

  await page.locator('#btn-start').click();
  await page.evaluate(()=>window.testGPS.error({code:3}));
  await expect(gps).toHaveAttribute('data-status','IDLE');
  await expect(speed).toHaveText('—');
  await expect(approach).toBeHidden();
});

test('定位 API 不可用與無 WebGL 時，儀表及設定仍能操作', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator,'geolocation',{value:undefined});
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      if(type.startsWith('webgl') || type==='experimental-webgl') return null;
      return getContext.call(this,type,...args);
    };
  });
  await page.goto('/?debug');
  await expect(page.locator('#car-fallback')).toBeVisible();
  await expect(page.locator('#cb-model')).toBeHidden();
  await page.locator('#btn-start').click();
  await expect(page.locator('#gps-status')).toHaveAttribute('data-status','UNSUPPORTED');
  await expect(page.locator('#radar-state')).toHaveText('不支援定位');
  await page.locator('#btn-settings').click();
  const panel=page.getByRole('dialog',{name:'設定'});
  await expect(panel).toBeVisible();
  await expect(page.locator('#sp-close')).toBeFocused();
  const tabStop=panel.locator('button:visible:enabled, input:visible:enabled').last();
  await page.keyboard.press('Shift+Tab');
  // Native modal may move through browser chrome before wrapping; never focus the dashboard.
  expect(await page.evaluate(()=>!document.querySelector('.frame').contains(document.activeElement))).toBe(true);
  await tabStop.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>!document.querySelector('.frame').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('#btn-settings')).toBeFocused();
});

test('WebGL 中斷與恢復時，行車儀表持續運作', async ({page}) => {
  await mockGPS(page);
  await page.goto('/?debug');
  await expect(page.locator('#app')).toHaveAttribute('data-renderer','ready');
  const extension = await page.evaluate(()=>{
    window.testContext = document.querySelector('#car-canvas').getContext('webgl2')?.getExtension('WEBGL_lose_context');
    return !!window.testContext;
  });
  test.skip(!extension,'瀏覽器無法測試 WebGL 中斷');
  await page.evaluate(()=>window.testContext.loseContext());
  await expect(page.locator('#car-fallback')).toBeVisible();
  await page.locator('#btn-start').click();
  await page.evaluate(()=>window.testGPS.success({timestamp:Date.now(),coords:{
    latitude:24.18,longitude:120.61,accuracy:4,speed:10,heading:90,
  }}));
  await expect(page.locator('#speed-value')).toHaveText('36');
  await page.evaluate(()=>window.testContext.restoreContext());
  await expect(page.locator('#app')).toHaveAttribute('data-renderer','ready');
  await expect(page.locator('#car-fallback')).toBeHidden();
  await expect(page.locator('#cb-model')).toBeVisible();
});
