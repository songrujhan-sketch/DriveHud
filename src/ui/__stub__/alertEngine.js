// STUB：最小 AlertEngine，介面同契約 §1.4。整合時由 Worker A 的 src/engine/alertEngine.js 取代。
const R = 6371000, rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
function dist(a, b) {
  const dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
const diff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

export function createAlertEngine({ cameras, config, now = () => Date.now() }) {
  let cams = cameras || [];
  let st, memo;
  const fresh = () => {
    st = { gps: 'SEARCHING', speedKmh: null, headingDeg: null, stationary: false, focus: null, nearby: [], overspeed: false };
    memo = { alerted: new Set(), over: new Set(), prev: null, up: 0, overCount: 0, passed: new Set() };
  };
  fresh();
  const radiusOf = (c) => (c.roadClass === 'expressway' ? config.alert.radiusExpresswayM : config.alert.radiusUrbanM);

  function pushFix(fix) {
    const ev = [];
    const valid = fix.accuracyM <= config.fix.maxAccuracyM && now() - fix.t <= config.fix.maxAgeMs;
    const prevGps = st.gps;
    if (!valid) {
      st = { ...st, gps: 'POOR', speedKmh: null, focus: null, nearby: [], overspeed: false };
      if (prevGps !== 'POOR') ev.push({ type: 'GPS_STATUS', t: fix.t, status: 'POOR' });
      return ev;
    }
    st.gps = 'OK';
    if (prevGps !== 'OK') ev.push({ type: 'GPS_STATUS', t: fix.t, status: 'OK' });
    st.speedKmh = fix.speedMps == null ? 0 : fix.speedMps * 3.6;
    st.headingDeg = fix.headingDeg ?? st.headingDeg;
    st.stationary = st.speedKmh < config.fix.stationarySpeedMps * 3.6;
    st.focus = null; st.nearby = []; st.overspeed = false;
    if (st.stationary || st.headingDeg == null) return ev;
    let best = null;
    for (const c of cams) {
      const d = dist(fix, c);
      if (d > radiusOf(c) + config.alert.candidateBufferM) continue;
      if (diff(bearing(fix, c), st.headingDeg) > config.alert.aheadMaxDeg && !memo.alerted.has(c.id)) continue;
      let relation = 'AMBIGUOUS';
      if (c.directionKnown && c.bearings.length) {
        const m = Math.min(...c.bearings.map((b) => diff(b, st.headingDeg)));
        relation = m <= config.alert.sameDirMaxDeg ? 'SAME' : m >= config.alert.oppositeMinDeg ? 'OPPOSITE' : 'AMBIGUOUS';
      }
      if (relation === 'OPPOSITE') continue;
      if (!best || d < best.d) best = { c, d, relation };
    }
    if (!best) return ev;
    const { c, d, relation } = best;
    const inside = d <= radiusOf(c);
    if (relation === 'AMBIGUOUS') {
      if (inside) {
        st.nearby = [{ camera: c, distanceM: d, relation }];
        st.focus = { camera: c, distanceM: d, relation, phase: 'CANDIDATE' };
        if (!memo.alerted.has(c.id)) { memo.alerted.add(c.id); ev.push({ type: 'NEARBY', t: fix.t, camera: c, distanceM: d }); }
      }
      return ev;
    }
    const growing = memo.prev && memo.prev.id === c.id && d > memo.prev.d;
    memo.up = growing ? memo.up + 1 : 0;
    memo.prev = { id: c.id, d };
    if (memo.up >= config.alert.passedMinFixes) {
      if (!memo.passed.has(c.id)) { memo.passed.add(c.id); ev.push({ type: 'PASSED', t: fix.t, camera: c, distanceM: d }); }
      return ev;
    }
    if (!inside) { st.focus = { camera: c, distanceM: d, relation, phase: 'CANDIDATE' }; return ev; }
    st.focus = { camera: c, distanceM: d, relation, phase: 'APPROACHING' };
    if (!memo.alerted.has(c.id)) {
      memo.alerted.add(c.id);
      const r50 = Math.round(d / 50) * 50;
      ev.push({ type: 'APPROACH_ALERT', t: fix.t, camera: c, distanceM: d, limit: c.limit, speechText: `前方${r50}公尺有測速照相${c.limit != null ? '，速限' + c.limit : ''}` });
    }
    if (c.limit != null && st.speedKmh > c.limit + config.alert.overspeedToleranceKmh) {
      memo.overCount += 1;
      st.overspeed = memo.overCount >= config.alert.overspeedMinFixes;
      if (st.overspeed && !memo.over.has(c.id)) {
        memo.over.add(c.id);
        ev.push({ type: 'OVERSPEED_ALERT', t: fix.t, camera: c, distanceM: d, limit: c.limit, speechText: `注意，目前超速，速限${c.limit}` });
      }
    } else memo.overCount = 0;
    return ev;
  }

  return {
    pushFix,
    tick() { return []; },
    getState: () => ({ ...st }),
    setCameras(c) { cams = c; },
    reset() { fresh(); },
  };
}
