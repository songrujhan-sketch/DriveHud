// DriveHUD V1.6 — 產生 sim/scenarios/01..05.json（1 Hz）
// 用法：node sim/generate-scenarios.js
// 相機座標取自 data/snapshots/npa7320-taichung.csv（警政署 7320，2026-11-20 抓取）。
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destinationPoint } from '../src/engine/geo.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'scenarios');
const T0 = Date.UTC(2026, 10, 20, 0, 0, 0); // 2026-11-20 08:00 (UTC+8)

// 決定性亂數（mulberry32），讓每次產生結果相同
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const r2 = (x) => Math.round(x * 100) / 100;

function camera({ lat, lon, bearings, bidirectional, limit, roadClass, address, region, rawDirect }) {
  const bearingKey = bearings.length ? bearings.join('-') : 'na';
  return {
    id: `npa7320|${lat.toFixed(6)}|${lon.toFixed(6)}|${bearingKey}`,
    lat, lon, bearings, bidirectional, directionKnown: bearings.length > 0,
    limit, roadClass, interval: false, source: 'npa7320',
    address, city: '臺中市', region, rawDirect,
  };
}

const FUKE = camera({
  lat: 24.186693, lon: 120.61284, bearings: [90], bidirectional: false, limit: 50, roadClass: 'urban',
  address: '西屯區福科路617號前往福林路方向中央分隔島', region: '西屯區', rawDirect: '西向東',
});
const DONGDA = camera({
  lat: 24.18653, lon: 120.60414, bearings: [0], bidirectional: false, limit: 50, roadClass: 'urban',
  address: '西屯區東大路一段450號前往西屯路三段方向', region: '西屯區', rawDirect: '南向北',
});
const FUKE_UNKNOWN = camera({
  lat: 24.186693, lon: 120.61284, bearings: [], bidirectional: false, limit: 50, roadClass: 'urban',
  address: '西屯區福科路617號前往福林路方向中央分隔島（情境③：方向設為未知）', region: '西屯區', rawDirect: '',
});
const ZHONGZHANG = camera({
  lat: 24.129442, lon: 120.619804, bearings: [0, 180], bidirectional: true, limit: 80, roadClass: 'expressway',
  address: '南屯區中彰快速道路4.8K', region: '南屯區', rawDirect: '南北雙向',
});

/**
 * 沿直線行駛產生 1 Hz fixes。
 * @param {object} o
 * @param {{lat:number,lon:number}} o.cam    參考點（相機）
 * @param {number} o.heading                 行進方向
 * @param {number} o.startBeforeM            起點在相機「之前」多少公尺（沿行進方向）
 * @param {number} o.lateralM                路徑相對相機的橫向偏移（正值 = 行進方向左側）
 * @param {number[]} o.speeds                每秒車速（m/s），長度即 fixes 數
 * @param {(i:number, base:object, rand:()=>number)=>object} [o.mutate]  逐筆調整
 */
function drive({ cam, heading, startBeforeM, lateralM = 0, speeds, seed = 1, mutate }) {
  const rand = rng(seed);
  const leftBearing = (heading + 270) % 360;
  const origin0 = destinationPoint(cam.lat, cam.lon, (heading + 180) % 360, startBeforeM);
  const origin = lateralM ? destinationPoint(origin0.lat, origin0.lon, leftBearing, lateralM) : origin0;
  const fixes = [];
  let s = 0;
  for (let i = 0; i < speeds.length; i++) {
    if (i > 0) s += (speeds[i - 1] + speeds[i]) / 2; // 梯形積分
    const p = destinationPoint(origin.lat, origin.lon, heading, s);
    // 一般 GPS 雜訊：±1 m、heading ±2°
    const jitter = destinationPoint(p.lat, p.lon, rand() * 360, rand() * 1);
    let fix = {
      t: T0 + i * 1000,
      lat: r6(jitter.lat),
      lon: r6(jitter.lon),
      speedMps: r2(speeds[i]),
      headingDeg: r2((heading + (rand() - 0.5) * 4 + 360) % 360),
      accuracyM: Math.round(5 + rand() * 4),
    };
    if (mutate) fix = mutate(i, fix, rand, { lat: p.lat, lon: p.lon, s });
    fixes.push(fix);
  }
  return fixes;
}

const constant = (mps, n) => Array.from({ length: n }, () => mps);
const kmh = (v) => v / 3.6;

const scenarios = [];

// ① 同向接近並持續超速：福科路 西向東，65 km/h（速限 50）
scenarios.push({
  id: '01-same-dir-overspeed',
  title: '同向接近並持續超速',
  expectation: '福科路617號（西向東，速限50）。車輛由西往東以 65 km/h 行駛：約 200 m 前語音「前方兩百公尺有測速照相，速限五十」一次，切換接近版面；連續 3 秒超速後紅色警示並語音「注意，目前超速，速限五十」一次；通過後恢復一般版面。',
  cameras: [FUKE],
  fixes: drive({ cam: FUKE, heading: 90, startBeforeM: 700, lateralM: -5, speeds: constant(kmh(65), 72), seed: 11 }),
  expectedEvents: [
    { type: 'FIX_VALID' },
    { type: 'APPROACH_ALERT', camera: FUKE.id },
    { type: 'OVERSPEED_ALERT', camera: FUKE.id },
    { type: 'PASSED', camera: FUKE.id },
  ],
  expectedFinal: { layout: 'normal', speedKmh: 'number' },
});

// ② 反向略過：東大路 南向北的相機，車輛北往南
scenarios.push({
  id: '02-opposite-skip',
  title: '反向行駛略過',
  expectation: '東大路一段450號（南向北，速限50）。車輛由北往南以 50 km/h 行駛，方向與相機拍攝車流相反：全程不提醒、不切換版面、無語音。',
  cameras: [DONGDA],
  fixes: drive({ cam: DONGDA, heading: 180, startBeforeM: 700, lateralM: -5, speeds: constant(kmh(50), 90), seed: 22 }),
  expectedEvents: [
    { type: 'FIX_VALID' },
  ],
  expectedFinal: { layout: 'normal', speedKmh: 'number' },
});

// ③ 平行道路、方向未知：沿福科路北側 40 m 平行線西向東
scenarios.push({
  id: '03-parallel-unknown-dir',
  title: '平行道路（相機方向未知）',
  expectation: '相機同福科路617號但方向設為未知（directionKnown=false）。車輛沿福科路北側 40 m 的平行道路由西往東以 50 km/h 行駛：只在 200 m 內出現一次「附近測速點」提示（NEARBY），不播接近語音、不切換接近版面。',
  cameras: [FUKE_UNKNOWN],
  fixes: drive({ cam: FUKE_UNKNOWN, heading: 90, startBeforeM: 700, lateralM: 40, speeds: constant(kmh(50), 90), seed: 33 }),
  expectedEvents: [
    { type: 'FIX_VALID' },
    { type: 'NEARBY', camera: FUKE_UNKNOWN.id },
  ],
  expectedFinal: { layout: 'normal', speedKmh: 'number' },
});

// ④ 接近後停紅燈 20 秒（座標漂移 ±8 m）再通過
{
  const cruise = kmh(48);
  const speeds = [];
  for (let i = 0; i < 30; i++) speeds.push(cruise);                 // 巡航 30 s
  for (let v = cruise - 2; v > 0; v -= 2) speeds.push(v);           // 減速約 2 m/s²
  const stopStart = speeds.length;
  for (let i = 0; i < 20; i++) speeds.push(0);                      // 停車 20 s
  const stopEnd = speeds.length;
  for (let v = 2; v < cruise; v += 2) speeds.push(v);               // 起步
  for (let i = 0; i < 50; i++) speeds.push(cruise);                 // 通過並離開
  // 停車點設在相機前 50 m（在市區提醒距離 200 m 以內）：先算停車前行駛距離
  let s = 0;
  for (let i = 1; i < stopStart; i++) s += (speeds[i - 1] + speeds[i]) / 2;
  const startBeforeM = Math.round(s + 50);
  const fixes = drive({
    cam: FUKE, heading: 90, startBeforeM, lateralM: -5, speeds, seed: 44,
    mutate(i, fix, rand, base) {
      if (i >= stopStart && i < stopEnd) {
        // 停車期間：座標漂移 ±8 m、speedMps 0–0.4、heading 不可用
        const dx = (rand() * 2 - 1) * 8, dy = (rand() * 2 - 1) * 8;
        const p1 = destinationPoint(base.lat, base.lon, 90, dx);
        const p2 = destinationPoint(p1.lat, p1.lon, 0, dy);
        return { ...fix, lat: r6(p2.lat), lon: r6(p2.lon), speedMps: r2(rand() * 0.4), headingDeg: null, accuracyM: Math.round(8 + rand() * 6) };
      }
      return fix;
    },
  });
  scenarios.push({
    id: '04-red-light-drift',
    title: '接近後停紅燈（座標漂移）',
    expectation: '福科路617號（西向東，速限50）。車輛以 48 km/h 接近，約 200 m 前提醒一次；在相機前約 50 m 停紅燈 20 秒，期間座標漂移 ±8 m：顯示停車、不重複提醒、不誤判通過；綠燈起步後通過相機才恢復一般版面。全程未超速。',
    cameras: [FUKE],
    fixes,
    expectedEvents: [
      { type: 'FIX_VALID' },
      { type: 'APPROACH_ALERT', camera: FUKE.id },
      { type: 'STATIONARY' },
      { type: 'MOVING' },
      { type: 'PASSED', camera: FUKE.id },
    ],
    expectedFinal: { layout: 'normal', speedKmh: 'number' },
  });
}

// ⑤ 快速道路雙向相機，中途 8 秒訊號不佳
{
  const n = 90;
  const outageFrom = 12, outageTo = 20; // [12, 20) 共 8 秒 accuracy=200
  const fixes = drive({
    cam: ZHONGZHANG, heading: 180, startBeforeM: 1100, lateralM: -8, speeds: constant(kmh(75), n), seed: 55,
    mutate(i, fix, rand, base) {
      if (i >= outageFrom && i < outageTo) {
        const j = destinationPoint(base.lat, base.lon, rand() * 360, rand() * 60);
        return { ...fix, lat: r6(j.lat), lon: r6(j.lon), accuracyM: 200, speedMps: null, headingDeg: null };
      }
      return fix;
    },
  });
  scenarios.push({
    id: '05-expressway-gps-loss',
    title: '快速道路雙向相機＋訊號中斷',
    expectation: '中彰快速道路4.8K（南北雙向，速限80，快速道路）。車輛南下 75 km/h；進入提醒範圍前有 8 秒定位精度 200 m：車速顯示「—」、暫停判定；恢復後在約 300 m 前提醒一次，未超速，通過後恢復一般版面。',
    cameras: [ZHONGZHANG],
    fixes,
    expectedEvents: [
      { type: 'FIX_VALID' },
      { type: 'FIX_STALE' },
      { type: 'FIX_VALID' },
      { type: 'APPROACH_ALERT', camera: ZHONGZHANG.id },
      { type: 'PASSED', camera: ZHONGZHANG.id },
    ],
    expectedFinal: { layout: 'normal', speedKmh: 'number' },
    outage: { fromIndex: outageFrom, toIndex: outageTo },
  });
}

mkdirSync(OUT, { recursive: true });
for (const sc of scenarios) {
  const file = join(OUT, `${sc.id}.json`);
  writeFileSync(file, JSON.stringify(sc, null, 1) + '\n');
  console.log(`${file}  fixes=${sc.fixes.length}`);
}
// 瀏覽器無法列目錄：提供索引給 sim.html
writeFileSync(join(OUT, 'index.json'), JSON.stringify(
  scenarios.map((sc) => ({ id: sc.id, title: sc.title, expectation: sc.expectation, file: `${sc.id}.json` })), null, 1) + '\n');
