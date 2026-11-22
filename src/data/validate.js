import { validCoord } from './normalize.js?v=1.10.0';

/**
 * 最終驗證並產生統計。
 * @param {object[]} cameras
 * @param {{total?:number, dropped?:number, deduped?:number}} [meta] 前段流程累計（total=原始列數、dropped=座標無效、deduped=去重移除）
 * @returns {{cameras: object[], stats: {total:number, kept:number, dropped:number, deduped:number, byCity:Object<string,number>, limitMissing:number, directionUnknown:number, interval:number}}}
 */
export function validate(cameras, meta = {}) {
  const kept = [];
  let invalid = 0;
  for (const c of cameras) {
    if (c && validCoord(c.lat, c.lon)) kept.push(c); else invalid++;
  }
  const byCity = {};
  let limitMissing = 0;
  let directionUnknown = 0;
  let interval = 0;
  for (const c of kept) {
    const city = c.city || '(未知)';
    byCity[city] = (byCity[city] || 0) + 1;
    if (c.limit == null) limitMissing++;
    if (!c.directionKnown) directionUnknown++;
    if (c.interval) interval++;
  }
  const dropped = (meta.dropped || 0) + invalid;
  const deduped = meta.deduped || 0;
  return {
    cameras: kept,
    stats: {
      total: meta.total ?? kept.length + dropped + deduped,
      kept: kept.length,
      dropped,
      deduped,
      byCity,
      limitMissing,
      directionUnknown,
      interval,
    },
  };
}
