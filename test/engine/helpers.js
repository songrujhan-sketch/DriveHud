// 測試共用：建相機、沿直線產生 fixes、以模擬時鐘執行
import { destinationPoint } from '../../src/engine/geo.js';
import { createAlertEngine } from '../../src/engine/alertEngine.js';
import { CONFIG } from '../../config.js';

export const T0 = Date.UTC(2026, 10, 20);
export const CAM_LAT = 24.186693;
export const CAM_LON = 120.61284;

export function cam(over = {}) {
  const bearings = over.bearings ?? [90];
  return {
    id: over.id ?? `test|${bearings.join('-') || 'na'}`,
    lat: CAM_LAT, lon: CAM_LON, bearings, bidirectional: false,
    directionKnown: bearings.length > 0, limit: 50, roadClass: 'urban', interval: false,
    source: 'npa7320', address: '測試', city: '臺中市', region: '西屯區', rawDirect: '',
    ...over,
  };
}

/** 沿 heading 等速通過相機，起點在相機前 startBeforeM，共 n 筆（1 Hz） */
export function line({ heading = 90, startBeforeM = 600, mps = 14, n = 80, lateralM = 0, c = { lat: CAM_LAT, lon: CAM_LON }, over } = {}) {
  let o = destinationPoint(c.lat, c.lon, (heading + 180) % 360, startBeforeM);
  if (lateralM) o = destinationPoint(o.lat, o.lon, (heading + 270) % 360, lateralM);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = destinationPoint(o.lat, o.lon, heading, mps * i);
    let f = { t: T0 + i * 1000, lat: p.lat, lon: p.lon, speedMps: mps, headingDeg: heading, accuracyM: 5 };
    if (over) f = { ...f, ...over(i, f) };
    out.push(f);
  }
  return out;
}

export function makeEngine(cameras, config = CONFIG) {
  const clock = { t: T0 };
  const engine = createAlertEngine({ cameras, config, now: () => clock.t });
  return { engine, clock };
}

/** 逐筆餵入（並呼叫 tick），回傳全部事件與每筆之後的 state */
export function run(engine, clock, fixes) {
  const events = [];
  const states = [];
  fixes.forEach((f, i) => {
    clock.t = f.t;
    for (const ev of engine.pushFix(f)) events.push({ ...ev, index: i });
    for (const ev of engine.tick()) events.push({ ...ev, index: i });
    states.push(engine.getState());
  });
  return { events, states };
}

export const alertTypes = (events) => events.filter((e) => e.type !== 'GPS_STATUS').map((e) => e.type);
export { CONFIG };
