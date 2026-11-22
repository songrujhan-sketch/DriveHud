// DriveHUD V1.6 — AlertEngine（Worker A）
// 純函式風格：無 DOM、無 timer。真實 GPS 與模擬重播都只透過 pushFix() 與 tick() 餵資料。
// 規則依契約 docs/prompts-v1.6.md §1.4；所有門檻讀自 config（config.alert / config.fix）。

import { haversineM, bearingDeg, angleDiffDeg, boundingBox, normDeg } from './geo.js?v=1.10.0';
import { approachText, overspeedText, OVERSPEED_REPEAT_TEXT } from './speech-text.js?v=1.10.0';

/** 只對距離 ≤ 此值的相機做細算（先以 bounding box 預篩） */
export const SCAN_RADIUS_M = 2000;

/**
 * 車輛 heading 與相機 bearings 的方向關係。
 * @param {import('../contracts/types.js').Camera} camera
 * @param {number|null} headingDeg
 * @param {{sameDirMaxDeg:number, oppositeMinDeg:number}} alertCfg
 * @returns {'SAME'|'OPPOSITE'|'AMBIGUOUS'}
 */
export function classifyRelation(camera, headingDeg, alertCfg) {
  if (headingDeg == null || !Number.isFinite(headingDeg)) return 'AMBIGUOUS';
  const bearings = Array.isArray(camera.bearings) ? camera.bearings : [];
  if (camera.directionKnown === false || bearings.length === 0) {
    // 只寫「雙向」而沒有方位：兩個方向都拍，視為同向（仍須通過「相機在前方、持續接近」兩道條件）。
    if (camera.bidirectional === true && alertCfg.bidirectionalUnknownAxisAsSame) return 'SAME';
    return 'AMBIGUOUS';
  }
  let best = 180;
  for (const b of bearings) best = Math.min(best, angleDiffDeg(headingDeg, b));
  if (best <= alertCfg.sameDirMaxDeg) return 'SAME';
  if (best >= alertCfg.oppositeMinDeg) return 'OPPOSITE';
  return 'AMBIGUOUS';
}

/**
 * 提醒半徑：依 roadClass 的固定距離，與「依目前車速提前 leadTimeS 秒」取大者（上限 maxRadiusM）。
 * 例：市區 50 km/h → 200 m；快速道路 110 km/h × 12 s ≈ 367 m（固定 300 m 只剩約 10 秒）。
 * @param {object} camera
 * @param {object} alertCfg
 * @param {number|null} [speedMps]
 */
export function radiusFor(camera, alertCfg, speedMps = null) {
  const base = camera.roadClass === 'expressway' ? alertCfg.radiusExpresswayM
    : camera.roadClass === 'urban' ? alertCfg.radiusUrbanM : alertCfg.radiusUnknownM;
  const lead = alertCfg.leadTimeS > 0 && Number.isFinite(speedMps) && speedMps > 0 ? speedMps * alertCfg.leadTimeS : 0;
  return Math.max(base, Math.min(lead, alertCfg.maxRadiusM ?? Infinity));
}

/**
 * @param {{cameras: import('../contracts/types.js').Camera[], config: any, now?: () => number}} opts
 */
export function createAlertEngine({ cameras, config, now = () => Date.now() }) {
  // 可由使用者調整的項目（超速容忍、持續超速提醒）用 setOptions 覆寫；其餘沿用 config。
  let A = { ...config.alert };
  const F = config.fix;

  let cams = Array.isArray(cameras) ? cameras.slice() : [];
  /** @type {Map<string, any>} 非 IDLE 的相機狀態 */
  let states = new Map();
  let s;

  function freshFixState() {
    return {
      gps: /** @type {import('../contracts/types.js').GpsStatus} */ ('SEARCHING'),
      valid: false,
      lastValid: null,      // {t, lat, lon}
      speedMps: null,
      headingDeg: null,
      lastHeadingT: -Infinity,
      stationary: false,
      slowCount: 0,
    };
  }
  s = freshFixState();

  function setGps(status, t, events) {
    if (s.gps !== status) {
      s.gps = status;
      events.push({ type: 'GPS_STATUS', t, status });
    }
  }

  function camEvent(type, t, st, extra = {}) {
    return { type, t, camera: st.camera, distanceM: st.distanceM, limit: st.camera.limit ?? null, ...extra };
  }

  function newCamState(camera) {
    return {
      camera,
      phase: 'CANDIDATE',
      distanceM: Infinity,  // 顯示用（每筆有效定位都更新）
      refDistM: null,       // 判定用（停車／慢速時不更新）
      closing: 0,
      receding: 0,
      overCount: 0,
      relation: 'AMBIGUOUS',
      ahead: false,
      approachAlerted: false,
      overspeedAlerted: false,
      lastOverspeedT: null,
      alertRadiusM: null,
      nearbyEmitted: false,
    };
  }

  function evaluateCameras(fix, canTransition, events) {
    const t = fix.t;
    const box = boundingBox(fix.lat, fix.lon, SCAN_RADIUS_M);
    const inBox = [];
    for (const cam of cams) {
      if (cam.lat < box.minLat || cam.lat > box.maxLat || cam.lon < box.minLon || cam.lon > box.maxLon) continue;
      const d = haversineM(fix.lat, fix.lon, cam.lat, cam.lon);
      if (d <= SCAN_RADIUS_M) inBox.push({ cam, d });
    }
    inBox.sort((a, b) => a.d - b.d);
    const seen = new Set();
    const heading = s.headingDeg;

    for (const { cam, d } of inBox) {
      const radius = radiusFor(cam, A, s.speedMps);
      const zone = radius + A.candidateBufferM;
      let st = states.get(cam.id);
      if (!st) {
        if (d > zone || !canTransition) continue;      // 仍為 IDLE
        st = newCamState(cam);
        states.set(cam.id, st);
      }
      seen.add(cam.id);
      st.camera = cam;
      st.distanceM = d;

      if (!canTransition) continue;                       // 停車／慢速：凍結 phase 與計數

      st.relation = classifyRelation(cam, heading, A);
      st.ahead = heading == null
        ? true
        : angleDiffDeg(bearingDeg(fix.lat, fix.lon, cam.lat, cam.lon), heading) <= A.aheadMaxDeg;

      if (st.refDistM != null) {
        if (d < st.refDistM) { st.closing++; st.receding = 0; }
        else if (d > st.refDistM) { st.receding++; st.closing = 0; }
      }
      st.refDistM = d;

      if (st.phase === 'CANDIDATE') {
        const inRadius = d <= radius;
        if (st.nearbyEmitted && st.receding >= A.passedMinFixes) {
          st.phase = 'COOLDOWN';                          // 附近測速點已通過：安靜進入冷卻
        } else if (d > zone) {
          if (st.nearbyEmitted) st.phase = 'COOLDOWN';
          else { states.delete(cam.id); seen.delete(cam.id); }
        } else if (inRadius && st.ahead && st.closing >= A.approachMinFixes) {
          if (st.relation === 'SAME' && !st.approachAlerted) {
            st.phase = 'APPROACHING';
            st.approachAlerted = true;
            st.overCount = 0;
            st.alertRadiusM = radius;
            events.push(camEvent('APPROACH_ALERT', t, st, { radiusM: radius, speechText: approachText(d, cam.limit ?? null, { interval: !!cam.interval }) }));
          } else if (st.relation === 'AMBIGUOUS' && !st.nearbyEmitted) {
            st.nearbyEmitted = true;
            events.push(camEvent('NEARBY', t, st));
          }
        }
      }

      if (st.phase === 'APPROACHING') {
        if (st.receding >= A.passedMinFixes) {
          st.phase = 'PASSED';
          events.push(camEvent('PASSED', t, st));
          st.phase = 'COOLDOWN';                          // PASSED 為瞬時事件；focus 隨即為 null
          st.overCount = 0;
        } else {
          const limit = cam.limit;
          const kmh = s.speedMps * 3.6;
          if (limit != null && Number.isFinite(limit) && kmh > limit + A.overspeedToleranceKmh) st.overCount++;
          else st.overCount = 0;
          if (limit != null && st.overCount >= A.overspeedMinFixes && !st.overspeedAlerted) {
            st.overspeedAlerted = true;
            st.lastOverspeedT = t;
            events.push(camEvent('OVERSPEED_ALERT', t, st, { speechText: overspeedText(limit) }));
          } else if (st.overspeedAlerted && st.overCount >= A.overspeedMinFixes && A.overspeedRepeatS > 0
            && t - st.lastOverspeedT >= A.overspeedRepeatS * 1000) {
            // 仍在超速：每 overspeedRepeatS 秒短句提醒一次（預設關閉，由設定開啟）
            st.lastOverspeedT = t;
            events.push(camEvent('OVERSPEED_REPEAT', t, st, { speechText: OVERSPEED_REPEAT_TEXT }));
          }
        }
      }

      if (st.phase === 'COOLDOWN' && d > A.cooldownM) {
        states.delete(cam.id);
        seen.delete(cam.id);
      }
    }

    // 超出掃描範圍的狀態一律回 IDLE
    for (const id of [...states.keys()]) if (!seen.has(id)) states.delete(id);
  }

  function pushFix(fix) {
    /** @type {any[]} */
    const events = [];
    const t = fix.t;
    const age = now() - t;
    const accOk = Number.isFinite(fix.accuracyM) && fix.accuracyM <= F.maxAccuracyM;
    const fresh = age <= F.maxAgeMs;
    const coordsOk = Number.isFinite(fix.lat) && Number.isFinite(fix.lon);

    if (!(accOk && fresh && coordsOk)) {
      setGps(!fresh ? 'STALE' : 'POOR', t, events);
      if (s.valid) {
        s.valid = false;
        events.push({ type: 'FIX_STALE', t });
      }
      s.speedMps = null;
      return events;                                      // 暫停所有判定
    }

    setGps('OK', t, events);
    if (!s.valid) {
      s.valid = true;
      events.push({ type: 'FIX_VALID', t });
    }

    // 車速
    let mps = null;
    if (fix.speedMps != null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0) {
      mps = fix.speedMps;
    } else if (s.lastValid && t > s.lastValid.t) {
      const disp = haversineM(s.lastValid.lat, s.lastValid.lon, fix.lat, fix.lon);
      mps = disp < F.minDisplacementM ? 0 : disp / ((t - s.lastValid.t) / 1000);
    }
    s.speedMps = mps;

    // 停車判定
    const slow = mps != null && mps < F.stationarySpeedMps;
    if (slow) s.slowCount++;
    else if (mps != null) s.slowCount = 0;
    if (!s.stationary && s.slowCount >= F.stationaryMinFixes) {
      s.stationary = true;
      events.push({ type: 'STATIONARY', t });
    } else if (s.stationary && mps != null && !slow) {
      s.stationary = false;
      s.lastHeadingT = t;                                 // 解除凍結後重新起算沿用時限
      events.push({ type: 'MOVING', t });
    }

    // heading
    if (!s.stationary) {
      if (fix.headingDeg != null && Number.isFinite(fix.headingDeg) && fix.headingDeg >= 0) {
        s.headingDeg = normDeg(fix.headingDeg);
        s.lastHeadingT = t;
      } else if (s.headingDeg != null && t - s.lastHeadingT <= F.headingHoldMs) {
        // 沿用最後有效 heading
      } else {
        s.headingDeg = null;
      }
    }

    s.lastValid = { t, lat: fix.lat, lon: fix.lon };

    const canTransition = !s.stationary && mps != null && !slow;
    evaluateCameras(fix, canTransition, events);
    return events;
  }

  function tick() {
    const events = [];
    if (s.valid && s.lastValid && now() - s.lastValid.t > F.maxAgeMs) {
      s.valid = false;
      s.speedMps = null;
      const t = now();
      setGps('STALE', t, events);
      events.push({ type: 'FIX_STALE', t });
    }
    return events;
  }

  function focusState() {
    let best = null;
    for (const st of states.values()) {
      if (st.phase !== 'APPROACHING') continue;
      if (!best || st.distanceM < best.distanceM) best = st;
    }
    return best;
  }

  function getState() {
    const f = focusState();
    const nearby = [];
    for (const st of states.values()) {
      if (st.phase === 'CANDIDATE' && st.nearbyEmitted) {
        nearby.push({ camera: st.camera, distanceM: st.distanceM, relation: st.relation });
      }
    }
    nearby.sort((a, b) => a.distanceM - b.distanceM);
    const speedKmh = s.valid && s.speedMps != null ? s.speedMps * 3.6 : null;
    return {
      gps: s.gps,
      speedKmh,
      headingDeg: s.headingDeg,
      stationary: s.stationary,
      focus: f ? { camera: f.camera, distanceM: f.distanceM, relation: f.relation, phase: f.phase, radiusM: f.alertRadiusM } : null,
      nearby,
      overspeed: !!(s.valid && f && f.camera.limit != null && f.overCount >= A.overspeedMinFixes),
    };
  }

  function setCameras(next) {
    cams = Array.isArray(next) ? next.slice() : [];
    const ids = new Set(cams.map((c) => c.id));
    for (const id of [...states.keys()]) if (!ids.has(id)) states.delete(id);
  }

  function reset() {
    s = freshFixState();
    // 保留各相機的「已提醒」旗標與 phase，避免返回頁面後重複播報；清除距離歷史與計數
    for (const st of states.values()) {
      st.refDistM = null;
      st.closing = 0;
      st.receding = 0;
      st.overCount = 0;
    }
  }

  /** 除錯／模擬用：目前非 IDLE 相機的內部狀態 */
  function getDebug() {
    return [...states.values()].map((st) => ({
      id: st.camera.id, phase: st.phase, distanceM: st.distanceM, relation: st.relation,
      ahead: st.ahead, closing: st.closing, receding: st.receding, overCount: st.overCount,
    }));
  }

  /** 使用者設定：{ overspeedToleranceKmh, overspeedRepeatS, leadTimeS }；只接受有限數值。 */
  function setOptions(patch = {}) {
    const next = { ...A };
    for (const k of ['overspeedToleranceKmh', 'overspeedRepeatS', 'leadTimeS']) {
      if (Number.isFinite(patch[k]) && patch[k] >= 0) next[k] = patch[k];
    }
    A = next;
  }

  return { pushFix, tick, getState, setCameras, reset, getDebug, setOptions, get options() { return { ...A }; } };
}
