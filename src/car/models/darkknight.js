// 黑暗騎士（darkknight）— 原創寬體裝甲越野：高離地、方形輪眉外擴、斜切裝甲板、
// 狹縫式窗、車頂燈條、厚重前保桿與護板、大尺寸越野胎。全部為原創幾何。
import { bodyLoft, cabinLoft, regionHelpers, curve, smooth } from './kit.js';
import { makeMaterials, multiMesh, placeWheels, makeMirror, makeHeadSpot, roundBox, mesh, mirrored, merge, shapeOf, extrudeX } from './parts.js';

export const meta = { id: 'darkknight', displayName: '黑暗騎士', roofY: 1.78 };

export function build(THREE, { color = '#3a3f45' } = {}) {
  const group = new THREE.Group();
  group.name = 'darkknight';
  const M = makeMaterials(THREE, color, { rim: 0x17181b, rimMetal: 0.5, rimRough: 0.5, caliper: 0xff6a12 });
  M.paint.metalness = 0.35;
  M.paint.roughness = 0.5;
  M.paint.clearcoat = 0.6;
  M.paint.clearcoatRoughness = 0.12;
  const Z0 = -2.36, Z1 = 2.38;
  const FW = { z: 1.48, r: 0.42, w: 0.36, x: 0.93 };
  const RW = { z: -1.42, r: 0.42, w: 0.36, x: 0.93 };
  const flareAt = (z) => {
    let f = 0;
    for (const w of [FW, RW]) f = Math.max(f, smooth((0.8 - Math.abs(z - w.z)) / 0.22));
    return 0.11 * f;
  };

  const yTop = curve([[Z0, 1.0], [-2.2, 1.16], [-1.8, 1.2], [0.6, 1.2], [1.0, 1.19], [1.6, 1.17], [2.2, 1.12], [Z1, 1.0]]);
  const yBelt = curve([[Z0, 0.98], [-2.2, 1.08], [-1.8, 1.12], [1.8, 1.12], [2.2, 1.08], [Z1, 0.96]]);
  const hw = curve([[Z0, 0.9], [-2.22, 0.98], [-2.0, 1.0], [2.0, 1.0], [2.25, 0.97], [Z1, 0.86]]);
  const yBot = curve([[Z0, 0.56], [-2.0, 0.44], [2.0, 0.44], [Z1, 0.58]]);
  const doorF = 0.82, doorM = -0.42, doorR = -1.0;

  const body = bodyLoft(THREE, {
    z0: Z0, z1: Z1, step: 0.08, endR: [0.07, 0.07],
    wheels: [
      { z: FW.z, R: 0.57, y: FW.r, wellX: FW.x - FW.w / 2 - 0.06 },
      { z: RW.z, R: 0.57, y: RW.r, wellX: RW.x - RW.w / 2 - 0.06 },
    ],
    p: { yBot, hw, yBelt, yTop, n: 5, tuck: 0.12, flare: flareAt, flareTop: 0.98 },
    ns: 7, nt: 9, crease: true, splitX: [0.42],
    extraZ: [doorF - 0.005, doorF + 0.005, doorM - 0.005, doorM + 0.005, doorR - 0.005, doorR + 0.005,
      FW.z - 0.69, FW.z + 0.69, RW.z - 0.69, RW.z + 0.69],
    deform(pt, z) {
      // 側面中段斜切：下半部向內收，形成裝甲稜線
      if (pt.tag === 'side' && pt.y < 0.86) pt.x -= 0.05 * smooth((0.86 - pt.y) / 0.2);
      return pt;
    },
  });
  const R = regionHelpers(body);
  const hoodSlats = (q) => q.zr > 1.55 && q.zr < 2.0 && R.xf(q) < 0.32;
  group.add(multiMesh(THREE, body.geometry((q) => {
    if (q.cap) return q.cap === 'end' ? 'trim' : 'trim';
    if (q.tag === 'under' || q.tag === 'well') return 'under';
    if (R.isSide(q)) {
      if ([doorF, doorM, doorR].some((d) => Math.abs(q.zr - d) < 0.006) && q.y > 0.5 && q.zr > -1.1) return 'gap';
      if (q.tag === 'lip') return 'trim';
      // 輪眉外擴（貼著拱線的帶狀）與下緣護板：用段索引，邊界沿網格線不會鋸齒
      if (flareAt(q.zr) > 0.055 && R.sideIdx(q) <= 2) return 'trim';
      if (R.sideIdx(q) <= 0) return 'trim';
      return 'paint';
    }
    if (q.tag === 'seam' && q.zr > 1.0 && q.zr < 2.2) return 'gap';
    if (hoodSlats(q)) { const i = Math.floor((q.zr - 1.55) / 0.08); return i % 2 ? 'gblack' : 'paint'; }
    return 'paint';
  }, ['paint', 'under', 'gap', 'trim', 'gblack']), M));

  // ── 座艙：方正、狹縫窗、垂直後窗（封口）──
  const cab = cabinLoft(THREE, {
    z0: -2.26, z1: 0.98, step: 0.07, caps: true,
    yc: curve([[-2.26, 1.72], [-2.1, 1.77], [0.15, 1.78], [0.4, 1.7], [0.7, 1.45], [0.98, 1.16]]),
    yr: curve([[-2.26, 1.69], [-2.1, 1.74], [0.15, 1.75], [0.4, 1.67], [0.7, 1.42], [0.98, 1.14]]),
    rw: curve([[-2.26, 0.74], [-2.0, 0.8], [0.3, 0.8], [0.98, 0.84]]),
    cb: curve([[-2.26, 0.9], [-2.0, 0.95], [0.5, 0.95], [0.98, 0.92]]),
    yb: 1.1,
    ys: curve([[-2.26, 1.48], [0.0, 1.48], [0.6, 1.4], [0.98, 1.2]]),
    n: 6, bow: -0.01, nTop: 6,
    slant: (z) => -0.55 * smooth((z - 0.15) / 0.4),
  });
  const zS0 = 0.6, zS1 = -1.95;
  group.add(multiMesh(THREE, cab.geometry((q) => {
    if (q.cap) return 'gblack';
    if (q.tag === 'cabLow') return 'paint';
    if (q.tag === 'beltTrim' || q.tag === 'glass' || q.tag === 'frame') {
      if (q.zr < zS0 && q.zr > zS1) {
        if (Math.abs(q.zr - doorM) < 0.07 || Math.abs(q.zr - doorR) < 0.06) return 'gblack'; // B / C 柱
        return q.tag === 'glass' ? 'glass' : 'gblack';
      }
      return 'paint';
    }
    if (q.tag === 'rail') return 'paint';
    if (q.zr > 0.36) return 'glass';
    return 'paint';
  }, ['paint', 'glass', 'gblack']), M));
  // 後窗（封口面上的小窗）
  group.add(mesh(THREE, roundBox(THREE, 1.1, 0.2, 0.02, 0.01), M.glass, [0, 1.5, -2.27]));

  // ── 車頂：行李架 + 燈條（DRL 材質）──
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.05, 0.05, 2.0, 0.015), M.trim, [0.66, 1.81, -0.95]));
  for (const z of [-1.8, -1.2, -0.6, -0.05]) group.add(mesh(THREE, roundBox(THREE, 1.36, 0.035, 0.05, 0.012), M.trim, [0, 1.835, z]));
  group.add(mesh(THREE, roundBox(THREE, 1.2, 0.08, 0.1, 0.02), M.gblack, [0, 1.83, 0.24]));
  const bar = mesh(THREE, roundBox(THREE, 1.1, 0.035, 0.02, 0.01), M.drl, [0, 1.835, 0.296]);
  group.add(bar);

  // ── 前臉：水箱罩、方形雙頭燈、保桿、護板、拖車勾 ──
  const fz = Z1;
  group.add(mesh(THREE, roundBox(THREE, 1.06, 0.26, 0.05, 0.02), M.grille, [0, 0.8, fz - 0.01]));
  for (let i = 0; i < 4; i++) group.add(mesh(THREE, roundBox(THREE, 1.06, 0.022, 0.035, 0.008), M.gblack, [0, 0.69 + i * 0.075, fz + 0.012]));
  const heads = [];
  const drls = [];
  for (const s of [1, -1]) {
    group.add(mesh(THREE, roundBox(THREE, 0.34, 0.15, 0.06, 0.02), M.housing, [s * 0.68, 0.86, fz - 0.015]));
    for (const k of [0, 1]) {
      const x = s * (0.6 + k * 0.16);
      const em = mesh(THREE, new THREE.CircleGeometry(0.045, 16), M.head, [x, 0.865, fz + 0.017]);
      group.add(em); heads.push(em);
      group.add(mesh(THREE, new THREE.RingGeometry(0.045, 0.062, 16), M.chrome, [x, 0.865, fz + 0.016]));
    }
    const d = mesh(THREE, roundBox(THREE, 0.3, 0.018, 0.02, 0.006), M.drl, [s * 0.68, 0.94, fz + 0.012]);
    group.add(d); drls.push(d);
    group.add(mesh(THREE, roundBox(THREE, 0.35, 0.16, 0.02, 0.02), M.lens, [s * 0.68, 0.86, fz + 0.03]));
  }
  // 保桿：厚重橫桿 + 斜下護板 + 拖車勾
  group.add(mesh(THREE, roundBox(THREE, 2.04, 0.2, 0.26, 0.04), M.trim, [0, 0.58, fz + 0.04]));
  group.add(mesh(THREE, roundBox(THREE, 1.4, 0.03, 0.5, 0.01), M.darkChrome, [0, 0.46, fz - 0.05], [0.5, 0, 0]));
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.05, 0.1, 0.12, 0.015), M.caliper, [0.55, 0.52, fz + 0.18]));
  // 後保桿 + 尾燈直條
  group.add(mesh(THREE, roundBox(THREE, 2.02, 0.2, 0.24, 0.04), M.trim, [0, 0.6, Z0 - 0.03]));
  const tails = mirrored(group, () => mesh(THREE, roundBox(THREE, 0.08, 0.36, 0.03, 0.012), M.tail, [0.86, 0.86, Z0 - 0.005]));
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.12, 0.4, 0.02, 0.012), M.gblack, [0.86, 0.86, Z0 + 0.005]));

  // ── 側裙踏板、門把、裝甲螺栓 ──
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.16, 0.05, 1.7, 0.015), M.darkChrome, [0.98, 0.44, 0.03]));
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.025, 0.03, 0.16, 0.008), M.gblack, [1.0, 1.0, 0.45]));
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.025, 0.03, 0.16, 0.008), M.gblack, [1.0, 1.0, -0.62]));
  const bolts = [];
  for (const w of [FW, RW]) {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.08 + (i / 6) * 0.84);
      const g = new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6);
      g.rotateZ(Math.PI / 2);
      g.translate(1.098, w.r + Math.sin(a) * 0.63, w.z + Math.cos(a) * 0.63);
      bolts.push(g);
    }
  }
  const boltG = merge(THREE, bolts);
  mirrored(group, () => new THREE.Mesh(boltG, M.darkChrome));

  mirrored(group, () => { const m = makeMirror(THREE, M, { len: 0.24, h: 0.14, w: 0.1, arm: 0.1 }); m.position.set(0.9, 1.28, 0.58); return m; });

  const light = makeHeadSpot(THREE, group, { y: 0.86, z: 2.42 });

  const wheels = placeWheels(THREE, group, M, [
    { ...FW, radius: FW.r, width: FW.w, spokes: 6, spokeW: [0.075, 0.06], spokeT: 0.04, concave: 0.06, rimRatio: 0.6, tread: 'offroad', segments: 40, lugs: 6 },
    { ...RW, radius: RW.r, width: RW.w, spokes: 6, spokeW: [0.075, 0.06], spokeT: 0.04, concave: 0.06, rimRatio: 0.6, tread: 'offroad', segments: 40, lugs: 6 },
  ]);

  return { group, wheels, bodyMaterials: [M.paint], headlights: { meshes: heads, drl: [...drls, bar], light }, taillights: tails, meta };
}
