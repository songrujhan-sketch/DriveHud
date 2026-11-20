// 阿斯拉（asurada）— 原創流線電動雙門跑車：長軸距、單弧 fastback 全景玻璃頂、
// 前後貫穿式燈條、封閉式前臉、隱藏式門把、空力輪蓋。全部為原創幾何。
import { bodyLoft, cabinLoft, regionHelpers, curve, smooth } from './kit.js';
import { makeMaterials, multiMesh, placeWheels, makeMirror, makeHeadSpot, roundBox, mesh, mirrored } from './parts.js';

export const meta = { id: 'asurada', displayName: '阿斯拉', roofY: 1.3 };

export function build(THREE, { color = '#e8eaed' } = {}) {
  const group = new THREE.Group();
  group.name = 'asurada';
  const M = makeMaterials(THREE, color, { rim: 0xb9bec5, rimMetal: 0.95, rimRough: 0.2, caliper: 0x1f6fff });
  const Z0 = -2.42, Z1 = 2.42;
  const FW = { z: 1.55, r: 0.35, w: 0.255, x: 0.83 };
  const RW = { z: -1.5, r: 0.35, w: 0.275, x: 0.82 };

  const yTop = curve([[Z0, 0.8], [-2.25, 0.87], [-1.9, 0.87], [-1.0, 0.82], [0.0, 0.78], [0.9, 0.8], [1.55, 0.82], [1.9, 0.72], [2.2, 0.6], [Z1, 0.46]]);
  const bump = curve([[0.7, 0], [1.1, -0.04], [1.55, -0.07], [2.0, -0.06], [Z1, -0.02]]);
  const yBelt = curve([[Z0, 0.72], [-2.2, 0.8], [-1.5, 0.85], [-0.8, 0.78], [0.4, 0.73], [1.0, 0.76], [1.55, 0.82], [1.95, 0.7], [2.2, 0.56], [Z1, 0.42]]);
  const hw = curve([[Z0, 0.82], [-2.15, 0.95], [-1.5, 0.99], [-0.6, 0.96], [0.5, 0.95], [1.55, 0.98], [2.0, 0.94], [2.3, 0.82], [Z1, 0.62]]);
  const yBot = curve([[Z0, 0.24], [-2.0, 0.14], [2.0, 0.14], [Z1, 0.2]]);
  const doorF = 1.0, doorR = -0.62, tailZ = -2.32;

  const body = bodyLoft(THREE, {
    z0: Z0, z1: Z1, step: 0.066, endR: [0.12, 0.14],
    wheels: [
      { z: FW.z, R: 0.405, y: FW.r, wellX: FW.x - FW.w / 2 - 0.05 },
      { z: RW.z, R: 0.405, y: RW.r, wellX: RW.x - RW.w / 2 - 0.05 },
    ],
    p: { yBot, hw, yBelt, yTop, n: 2.2, tuck: 0.13, bump, bumpX: 0, bumpW: 0.42 },
    ns: 7, nt: 10, splitX: [],
    extraZ: [doorF - 0.005, doorF + 0.005, doorR - 0.005, doorR + 0.005, 2.24, 2.27, 2.3, 2.315, 2.395, tailZ, -2.35],
    deform(pt, z) {
      // 側面下緣的凹面腰線（光影層次）
      if (pt.tag === 'side' && pt.y > 0.3 && pt.y < 0.55 && z > -1.0 && z < 1.1) pt.x -= 0.025 * Math.sin(Math.PI * (pt.y - 0.3) / 0.25) * smooth((1.1 - z) / 0.3) * smooth((z + 1.0) / 0.3);
      return pt;
    },
  });
  const R = regionHelpers(body);
  group.add(multiMesh(THREE, body.geometry((q) => {
    if (q.cap) return q.cap === 'end' ? 'gblack' : 'paint';
    if (q.tag === 'under' || q.tag === 'well') return 'under';
    if (R.isSide(q)) {
      if ((Math.abs(q.zr - doorF) < 0.006 || Math.abs(q.zr - doorR) < 0.006) && q.y > 0.22) return 'gap';
      if (R.sideIdx(q) === 0 && q.tag === 'side' && q.zr > -1.05 && q.zr < 1.1) return 'gblack';
      if (q.zr < tailZ && q.y > 0.55) return 'housing'; // 尾燈條座
      return 'paint';
    }
    if (q.zr > 2.24 && q.zr < 2.27) return 'housing'; // 前燈條座
    if (R.isTop(q) && q.zr > 2.3 && q.zr < 2.41 && R.topIdx(q) >= 3 && R.topIdx(q) <= 7) return 'housing'; // 主燈座
    if (q.zr < tailZ) return 'housing';
    return 'paint';
  }, ['paint', 'under', 'gap', 'gblack', 'housing']), M));

  // ── 前後貫穿燈條（由車身曲面偏移取出，自然包覆轉角）──
  const frontBar = new THREE.Mesh(body.extract((q) => R.isTop(q) && q.zr > 2.24 && q.zr < 2.27, 0.004), M.drl);
  // 主燈：燈條下方、鼻頭轉角的細長燈眼（由曲面偏移取出）
  const headZone = (q) => R.isTop(q) && q.zr > 2.315 && q.zr < 2.395 && R.topIdx(q) >= 4 && R.topIdx(q) <= 6;
  const head = new THREE.Mesh(body.extract(headZone, 0.004), M.head);
  const heads = [head];
  group.add(frontBar, head, new THREE.Mesh(body.extract((q) => R.isTop(q) && q.zr > 2.3 && q.zr < 2.41 && R.topIdx(q) >= 3 && R.topIdx(q) <= 7, 0.012), M.lens));
  const tailBar = new THREE.Mesh(body.extract((q) => (R.isSide(q) || R.isTop(q)) && q.zr < tailZ && q.zr > -2.4 && q.y > 0.64 && q.y < 0.76, 0.004), M.tail);
  group.add(tailBar);
  // 前臉下方進氣（封閉式前臉僅留下格柵）
  group.add(mesh(THREE, roundBox(THREE, 1.0, 0.08, 0.04, 0.03), M.grille, [0, 0.27, 2.36], [0.3, 0, 0]));

  // ── 座艙：fastback 全景玻璃頂 ──
  const cab = cabinLoft(THREE, {
    z0: -2.12, z1: 1.06, step: 0.055,
    yc: curve([[-2.12, 0.84], [-1.8, 0.96], [-1.3, 1.13], [-0.7, 1.27], [-0.2, 1.3], [0.3, 1.2], [0.7, 0.98], [1.06, 0.74]]),
    yr: curve([[-2.12, 0.82], [-1.8, 0.92], [-1.3, 1.07], [-0.7, 1.2], [-0.2, 1.23], [0.3, 1.14], [0.7, 0.94], [1.06, 0.72]]),
    rw: curve([[-2.12, 0.5], [-1.4, 0.53], [-0.3, 0.57], [0.6, 0.6], [1.06, 0.62]]),
    cb: curve([[-2.12, 0.74], [-1.5, 0.86], [0.0, 0.86], [0.8, 0.84], [1.06, 0.8]]),
    yb: (z) => yBelt(z) - 0.02,
    ys: curve([[-2.12, 0.84], [-1.3, 0.83], [0.0, 0.79], [1.06, 0.74]]),
    n: 2.0, bow: 0.06, nTop: 7,
    slant: (z) => -0.5 * smooth((z - 0.25) / 0.45) + 0.7 * smooth((-1.0 - z) / 0.4),
  });
  const zS0 = 0.9, zS1 = -1.42;
  group.add(multiMesh(THREE, cab.geometry((q) => {
    if (q.tag === 'cabLow') return 'paint';
    if (q.tag === 'beltTrim' || q.tag === 'glass' || q.tag === 'frame') {
      if (q.zr < zS0 && q.zr > zS1) {
        if (Math.abs(q.zr + 0.4) < 0.035) return 'gblack'; // 隱藏式 B 柱
        if (q.tag === 'beltTrim') return 'chrome';
        return q.tag === 'glass' ? 'glass' : 'gblack';
      }
      return 'paint';
    }
    if (q.tag === 'rail') return 'gblack';
    if (q.zr < -1.96) return 'paint';
    return 'glass'; // 前擋 → 車頂 → 後窗 一體玻璃
  }, ['paint', 'glass', 'gblack', 'chrome']), M));

  // ── 隱藏式門把、後視鏡（小型）、尾部小鴨尾、擴散器 ──
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.015, 0.022, 0.2, 0.008), M.chrome, [0.945, 0.69, 0.25]));
  mirrored(group, () => { const m = makeMirror(THREE, M, { len: 0.17, h: 0.075, w: 0.09, arm: 0.11 }); m.position.set(0.8, 0.82, 0.62); m.rotation.y = -0.1; return m; });
  group.add(mesh(THREE, roundBox(THREE, 1.5, 0.025, 0.5, 0.01), M.gblack, [0, 0.21, -2.18], [-0.22, 0, 0]));
  for (let i = -1.5; i <= 1.5; i += 1) group.add(mesh(THREE, roundBox(THREE, 0.016, 0.09, 0.45, 0.006), M.gblack, [i * 0.28, 0.24, -2.18], [-0.22, 0, 0]));

  const light = makeHeadSpot(THREE, group, { y: 0.5, z: 2.35 });

  const wheels = placeWheels(THREE, group, M, [
    { ...FW, radius: FW.r, width: FW.w, spokes: 5, spokeW: [0.075, 0.055], concave: 0.03, rimRatio: 0.74, aeroCover: true },
    { ...RW, radius: RW.r, width: RW.w, spokes: 5, spokeW: [0.075, 0.055], concave: 0.03, rimRatio: 0.74, aeroCover: true },
  ]);

  return { group, wheels, bodyMaterials: [M.paint], headlights: { meshes: heads, drl: [frontBar], light }, taillights: [tailBar], meta };
}
