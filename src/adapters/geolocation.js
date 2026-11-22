// GPS adapter：把 GeolocationPosition 轉成契約 Fix，並回報 GpsStatus。
import { CONFIG } from '../../config.js?v=1.10.0';

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
  let generation = 0;

  function start(onFix, onStatus) {
    stop();
    const watchGeneration = generation;
    const geo = navigatorImpl && navigatorImpl.geolocation;
    if (!geo) {
      onStatus?.('UNSUPPORTED');
      return;
    }
    onStatus?.('SEARCHING');
    watchId = geo.watchPosition(
      (pos) => {
        if (watchGeneration !== generation) return;
        const fix = toFix(pos);
        onStatus && onStatus(fix.accuracyM > config.fix.maxAccuracyM ? 'POOR' : 'OK');
        onFix && onFix(fix);
      },
      (err) => {
        if (watchGeneration !== generation) return;
        const status = {1:'DENIED', 2:'UNAVAILABLE', 3:'TIMEOUT'}[err?.code];
        onStatus?.(status || 'SEARCHING');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  function stop() {
    generation++;
    const geo = navigatorImpl && navigatorImpl.geolocation;
    if (watchId !== null && geo) geo.clearWatch(watchId);
    watchId = null;
  }

  return { start, stop };
}
