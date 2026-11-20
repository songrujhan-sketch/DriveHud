// DriveHUD V1.6 — 車身／座艙放樣組裝工具（供三款原創車模共用）。
import { loft, bodySection, sampleZ, archZs, endZs, endInset, insetSection, archHeight, curve, clamp01, smooth } from './loft.js';

const val = (v, z) => (typeof v === 'function' ? v(z) : v);

/**
 * 車身放樣。S：
 *   z0, z1（車尾、車頭）、step、endR [r尾, r頭]
 *   wheels: [{ z, R（拱半徑）, y（輪心高）, wellX }]
 *   p: { yBot, hw, yBelt, yTop, n, tuck, bump, bumpX, flare, flareTop } — 數值或 z 的函式
 *   ns, nt, splitX, crease, extraZ, deform(pt, z, k)
 */
export function bodyLoft(THREE, S) {
  const { z0, z1, step = 0.07, endR = [0.08, 0.1], wheels, p, ns = 7, nt = 10, splitX = [], crease = false, extraZ = [], deform } = S;
  const extra = [...extraZ];
  for (const w of wheels) extra.push(...archZs(w.z, w.R, 14));
  extra.push(...endZs(z1, endR[1], 1, 5), ...endZs(z0, endR[0], -1, 5));
  const zs = sampleZ(z0, z1, step, extra);
  const K = { side0: 4, top0: 4 + ns - 1 + (crease ? 1 : 0) };
  const section = (z) => {
    const q = {};
    for (const k of Object.keys(p)) q[k] = val(p[k], z);
    const yBot = q.yBot;
    const archWheels = wheels.map((w) => ({ z: w.z, r: w.R, y: w.y }));
    const archY = archHeight(z, yBot, archWheels);
    let near = wheels[0];
    for (const w of wheels) if (Math.abs(z - w.z) < Math.abs(z - near.z)) near = w;
    let pts = bodySection({ ...q, archY, wellX: near.wellX, ns, nt, splitX, crease });
    if (q.flare) {
      const ft = q.flareTop ?? q.yBelt - 0.08;
      pts = pts.map((pt, k) => (k >= K.side0 && k < K.top0 ? { ...pt, x: pt.x + q.flare * (1 - smooth((pt.y - (ft - 0.06)) / 0.08)) } : pt));
      // 唇邊同步外推
      pts[3] = { ...pts[3], x: pts[3].x + q.flare };
    }
    if (deform) pts = pts.map((pt, k) => deform({ ...pt }, z, k, q) || pt);
    const d = endInset(z, z0, z1, endR[0], endR[1]);
    return insetSection(pts, d);
  };
  const L = loft(THREE, { zs, section, closed: true, caps: true });
  L.K = K;
  L.param = (name, z) => val(p[name], z);
  return L;
}

/**
 * 座艙（溫室）放樣：開放帶，從窗線下緣（藏在車身內）繞過車頂。
 * C：z0, z1、step、yc（頂中線高）、yr（車頂邊高）、rw（車頂邊半寬）、cb（基部半寬）、yb（基部高）、
 *    ys（側窗下緣高）、n（車頂方正度）、bow（側窗外凸）、nTop、caps
 * 段標籤：cabLow, beltTrim, glass×3, frame, rail, top…
 */
export function cabinLoft(THREE, C) {
  const { z0, z1, step = 0.05, n = 2.2, bow = 0.02, nTop = 7, caps = false, extraZ = [], slant } = C;
  const zs = sampleZ(z0, z1, step, extraZ);
  const section = (z) => {
    const yb = val(C.yb, z), cb = val(C.cb, z), rw = val(C.rw, z);
    const yc = Math.max(val(C.yc, z), yb + 0.002);
    const yr = Math.min(yc, Math.max(val(C.yr, z), yb + 0.001));
    const H = yr - yb;
    const ys = Math.min(Math.max(val(C.ys, z), yb + H * 0.25), yb + H * 0.8);
    const xAt = (y) => { const t = clamp01((y - yb) / Math.max(1e-4, H)); return cb + (rw - cb) * t + bow * Math.sin(Math.PI * t); };
    const ys2 = Math.min(ys + 0.0, yr - 0.03);
    const yTopG = Math.max(ys2 + 0.01, yr - 0.022);
    const sideYs = [yb, Math.max(yb, ys2 - 0.018), ys2, ys2 + (yTopG - ys2) * 0.4, ys2 + (yTopG - ys2) * 0.75, yTopG, yr];
    const tags = ['cabLow', 'beltTrim', 'glass', 'glass', 'glass', 'frame', 'rail'];
    const pts = sideYs.map((y, i) => ({ x: xAt(y), y, tag: tags[i] }));
    // 車頂：超橢圓，第一段為窄車頂邊條
    const h = yc - yr;
    const railW = Math.min(0.06, rw * 0.2);
    const xs = [rw - railW];
    for (let k = 1; k <= nTop; k++) xs.push((rw - railW) * (1 - k / nTop));
    for (const x of xs) {
      const xf = clamp01(x / Math.max(1e-4, rw));
      const y = yr + h * Math.pow(Math.max(0, 1 - Math.pow(xf, n)), 1 / n);
      pts.push({ x, y, tag: 'top' });
    }
    pts[pts.length - 1].x = 0;
    if (slant) {
      // 讓側窗前後緣傾斜：每點依高度在 z 方向位移
      const s = slant(z);
      for (const pt of pts) pt.dz = s * (pt.y - ys);
    }
    return pts;
  };
  const L = loft(THREE, { zs, section, closed: false, caps });
  return L;
}

export { curve, smooth, clamp01 };

/** 以 xf（相對半寬）判斷頂面欄位，依 k 判斷側面段。 */
export function regionHelpers(L) {
  return {
    xf: (q) => q.ax / Math.max(0.05, L.param('hw', q.zr)),
    isSide: (q) => q.tag === 'side' || q.tag === 'lip',
    isTop: (q) => q.tag === 'top' || q.tag === 'seam',
    sideIdx: (q) => q.k - L.K.side0, // 0 = 最下段
    topIdx: (q) => q.k - L.K.top0, // 0 = 肩線外側
  };
}
