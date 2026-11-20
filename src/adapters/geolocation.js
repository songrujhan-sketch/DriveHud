// GPS adapter：把 GeolocationPosition 轉成契約 Fix，並回報 GpsStatus。
import { CONFIG } from '../../config.js';

/** @returns {import('../contracts/types.js').Fix} */
export function toFix(pos) {
  const c = pos.coords;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    t: pos.timestamp,
    lat: c.latitude,
    lon: c.longitude,
    speedMps: num(c.speed),
    headingDeg: num(c.heading),
    accuracyM: typeof c.accuracy === 'number' ? c.accuracy : Infinity,
  };
}

export function createGeoSource({ navigatorImpl = globalThis.navigator, config = CONFIG } = {}) {
  let watchId = null;

  function start(onFix, onStatus) {
    const geo = navigatorImpl && navigatorImpl.geolocation;
    if (!geo) {
      onStatus && onStatus('DENIED'); // 無定位 API：以「權限遭拒」呈現
      return;
    }
    stop();
    onStatus && onStatus('SEARCHING');
    watchId = geo.watchPosition(
      (pos) => {
        const fix = toFix(pos);
        onStatus && onStatus(fix.accuracyM > config.fix.maxAccuracyM ? 'POOR' : 'OK');
        onFix && onFix(fix);
      },
      (err) => {
        if (err && err.code === 1) onStatus && onStatus('DENIED');
        else onStatus && onStatus('SEARCHING'); // 2 位置無法取得 / 3 逾時：繼續等待
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  function stop() {
    const geo = navigatorImpl && navigatorImpl.geolocation;
    if (watchId !== null && geo) geo.clearWatch(watchId);
    watchId = null;
  }

  return { start, stop };
}
