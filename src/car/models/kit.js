// DriveHUD V1.6 — 車身／座艙放樣組裝工具（供三款原創車模共用）。
import { roundBox, mesh } from './parts.js?v=1.10.0';
import { loft, bodySection, sampleZ, archZs, endZs, endInset, insetSection, archHeight, curve, clamp01, smooth } from './loft.js?v=1.10.0';

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

/** 內裝材質：liner 只畫背面，掛在車殼與門板的同一份幾何上，車殼內側與門內側就是深色飾板。 */
export function interiorMaterials(THREE, accent = 0xd8d8d8) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    liner: std({ color: 0x141518, roughness: 0.85, metalness: 0, side: THREE.BackSide }),
    trim: std({ color: 0x1c1e22, roughness: 0.7, metalness: 0.05 }),
    seat: std({ color: 0x2c2e33, roughness: 0.6, metalness: 0 }),
    accent: std({ color: accent, roughness: 0.5, metalness: 0.1 }),
    screen: std({ color: 0x0a1420, emissive: 0x2a6cff, emissiveIntensity: 0.35, roughness: 0.3 }),
  };
}

/** 桶形座椅：原點在椅墊後緣下方的地板上，面向 +Z。w 加寬就是後座長椅。 */
export function makeSeat(THREE, I, { w = 0.44, cushion = 0.5, back = 0.62, recline = 0.42, yBase = 0.14, headrests = [0] } = {}) {
  const g = new THREE.Group();
  g.add(mesh(THREE, roundBox(THREE, w, 0.1, cushion, 0.03), I.seat, [0, yBase + 0.05, cushion / 2]));
  for (const s of [1, -1]) g.add(mesh(THREE, roundBox(THREE, 0.06, 0.13, cushion * 0.9, 0.025), I.seat, [s * (w / 2 - 0.02), yBase + 0.075, cushion / 2]));
  const b = new THREE.Group();
  b.position.set(0, yBase + 0.08, 0.04);
  b.rotation.x = -recline;
  b.add(mesh(THREE, roundBox(THREE, w, back, 0.09, 0.035), I.seat, [0, back / 2, 0]));
  for (const s of [1, -1]) b.add(mesh(THREE, roundBox(THREE, 0.06, back * 0.8, 0.13, 0.025), I.seat, [s * (w / 2 - 0.02), back * 0.45, 0.03]));
  for (const hx of headrests) {
    b.add(mesh(THREE, roundBox(THREE, 0.08, back * 0.7, 0.012, 0.004), I.accent, [hx, back * 0.5, 0.048]));   // 椅背飾條
    b.add(mesh(THREE, roundBox(THREE, 0.24, 0.14, 0.08, 0.03), I.seat, [hx, back + 0.06, 0]));              // 頭枕
  }
  g.add(b);
  return g;
}

/**
 * 座艙內裝：座椅、儀表台與儀表罩、中控螢幕、方向盤（左駕，+X 側）、中央鞍座、座椅後方隔板。
 * spec：seats [{ x, z, ...makeSeat 選項 }]、dash { z, y, w, h, len }、wheel { x, y, z, r }、
 *       console { z, y, len, w, h }、screen { y, z }、wall { z, w, y0, y1 }（可省略）。
 */
export function cabinInterior(THREE, group, I, spec) {
  for (const { x, z, ...o } of spec.seats) { const seat = makeSeat(THREE, I, o); seat.position.set(x, 0, z); group.add(seat); }
  const d = spec.dash;
  group.add(mesh(THREE, roundBox(THREE, d.w, d.h, d.len, 0.03), I.trim, [0, d.y, d.z]));
  const wh = spec.wheel;
  group.add(mesh(THREE, roundBox(THREE, 0.34, 0.07, 0.16, 0.025), I.trim, [wh.x, d.y + d.h / 2 + 0.02, d.z - 0.02]));   // 儀表罩
  const sw = new THREE.Group();
  sw.add(new THREE.Mesh(new THREE.TorusGeometry(wh.r, 0.014, 8, 24), I.trim));
  sw.add(mesh(THREE, roundBox(THREE, wh.r * 1.9, 0.03, 0.02, 0.008), I.trim));
  sw.add(mesh(THREE, roundBox(THREE, 0.07, 0.07, 0.03, 0.012), I.accent));
  const col = new THREE.CylinderGeometry(0.02, 0.025, 0.22, 10);
  col.rotateX(Math.PI / 2);
  sw.add(mesh(THREE, col, I.trim, [0, 0, 0.11]));
  sw.position.set(wh.x, wh.y, wh.z);
  sw.rotation.x = 0.35;
  group.add(sw);
  if (spec.screen) group.add(mesh(THREE, roundBox(THREE, 0.3, 0.17, 0.015, 0.006), I.screen, [0, spec.screen.y, spec.screen.z], [0.25, 0, 0]));
  const c = spec.console;
  group.add(mesh(THREE, roundBox(THREE, c.w, c.h, c.len, 0.03), I.trim, [0, c.y, c.z]));
  if (spec.wall) { const w = spec.wall; group.add(mesh(THREE, roundBox(THREE, w.w, w.y1 - w.y0, 0.03, 0.01), I.trim, [0, (w.y0 + w.y1) / 2, w.z])); }
}

/** 車門範圍的判斷式（不分左右）：車體幾何用它挖出門洞，loftDoors 用它取出門板。 */
export function loftDoorPreds(body, { zF, zR, topXf = 0.86 }) {
  const R = regionHelpers(body);
  const inZ = (q) => !q.cap && q.zr < zF - 0.006 && q.zr > zR + 0.006;
  return {
    body: (q) => inZ(q) && ((R.isSide(q) && R.sideIdx(q) >= 1) || (R.isTop(q) && R.xf(q) > topXf)),
    cab: (q) => inZ(q) && ['cabLow', 'beltTrim', 'glass', 'frame'].includes(q.tag),
  };
}

/**
 * 放樣車的車門：把門範圍內的車身與座艙曲面取出，掛在鉸鏈樞紐下（車體幾何要先用同一組判斷式挖掉）。
 * O：body, cab、bodyKey(q)／cabKey(q)（與車體相同的材質分類）、preds（loftDoorPreds 的結果）、
 *    hinge: { point: [x, y, z]（+X 側）, axis: [x, y, z], angle }。另一側自動鏡射。回傳 doors 陣列。
 */
export function loftDoors(THREE, group, M, I, O) {
  const { body, cab, bodyKey, cabKey, preds, hinge } = O;
  const doors = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * hinge.point[0], hinge.point[1], hinge.point[2]);
    const put = (g, m) => { if (!g) return; const o = new THREE.Mesh(g, m); o.position.copy(pivot.position).negate(); pivot.add(o); };
    for (const [L, pred, keyOf] of [[body, preds.body, bodyKey], [cab, preds.cab, cabKey]]) {
      const mine = (q) => q.side === s && pred(q);
      put(L.extract(mine, 0), I.liner);                                   // 門內側飾板
      const keys = new Set();
      L.extract((q) => { if (mine(q)) keys.add(keyOf(q)); return false; });
      for (const key of keys) put(L.extract((q) => mine(q) && keyOf(q) === key, 0), M[key] || M.paint);
    }
    group.add(pivot);
    doors.push({ pivot, axis: new THREE.Vector3(s * hinge.axis[0], hinge.axis[1], hinge.axis[2]).normalize(), sign: s, max: hinge.angle });
  }
  return doors;
}
