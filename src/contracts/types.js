// DriveHUD V1.6 — 共用型別（JSDoc）。所有模組只透過這些型別溝通。

/**
 * @typedef {Object} Camera
 * @property {string} id             穩定 ID：`${source}|${lat.toFixed(6)}|${lon.toFixed(6)}|${bearingKey}`
 * @property {number} lat
 * @property {number} lon
 * @property {number[]} bearings     被拍車輛的前進方向（度，0=北，順時針）；雙向給兩個；未知給 []
 * @property {boolean} bidirectional
 * @property {boolean} directionKnown  bearings.length > 0
 * @property {number|null} limit     km/h；缺漏為 null
 * @property {'urban'|'expressway'|'unknown'} roadClass
 * @property {boolean} interval      區間測速（V1 僅標示）
 * @property {'npa7320'|'npa100855'} source
 * @property {string} address
 * @property {string} city
 * @property {string} region
 * @property {string} rawDirect      原始 direct 文字
 */

/**
 * @typedef {Object} Fix
 * @property {number} t              epoch ms
 * @property {number} lat
 * @property {number} lon
 * @property {number|null} speedMps  coords.speed；null 表示未提供
 * @property {number|null} headingDeg
 * @property {number} accuracyM
 */

/** @typedef {'SEARCHING'|'OK'|'POOR'|'DENIED'|'STALE'} GpsStatus */

/** @typedef {'SAME'|'OPPOSITE'|'AMBIGUOUS'} Relation */
/** @typedef {'IDLE'|'CANDIDATE'|'APPROACHING'|'PASSED'|'COOLDOWN'} Phase */

/**
 * @typedef {Object} EngineState
 * @property {GpsStatus} gps
 * @property {number|null} speedKmh      定位無效時 null（UI 顯示「—」）
 * @property {number|null} headingDeg
 * @property {boolean} stationary
 * @property {null|{camera:Camera, distanceM:number, relation:Relation, phase:Phase}} focus
 * @property {Array<{camera:Camera, distanceM:number, relation:Relation}>} nearby
 * @property {boolean} overspeed
 */

/**
 * @typedef {Object} EngineEvent
 * @property {'APPROACH_ALERT'|'NEARBY'|'OVERSPEED_ALERT'|'PASSED'|'FIX_STALE'|'FIX_VALID'|'STATIONARY'|'MOVING'|'GPS_STATUS'} type
 * @property {number} t
 * @property {Camera} [camera]
 * @property {number} [distanceM]
 * @property {number|null} [limit]
 * @property {string} [speechText]
 * @property {GpsStatus} [status]
 */

/**
 * @typedef {Object} Scenario
 * @property {string} id
 * @property {string} title
 * @property {string} expectation      預期結果（給 UI 顯示）
 * @property {Camera[]} cameras
 * @property {Fix[]} fixes
 * @property {Array<{type:string, camera?:string}>} expectedEvents
 * @property {{layout:'normal'|'minimal'|'approach', speedKmh:'number'|'null'}} expectedFinal
 */

export {};
