// 裝甲越野（rover）— 原創皮卡式裝甲越野：折角車身、短座艙加後斗與防滾架、折角葉子板、
// 車頂燈排、前防撞桿與絞盤、車尾備胎。由平行原型的 DH-03 移植，全部為原創幾何。
// 座標：+Z 車頭、X 車寬、Y 向上。
import { makeMaterials, placeWheels, makeMirror, makeHeadSpot, roundBox, mesh, mirrored, shapeOf, extrudeX } from './parts.js';

export const meta = { id: 'rover', displayName: '裝甲越野', roofY: 2.0 };

export function build(THREE, { color = '#3a3f45' } = {}) {
  const group = new THREE.Group();
  group.name = 'rover';
  const M = makeMaterials(THREE, color, { rim: 0x17181b, rimMetal: 0.5, rimRough: 0.5, caliper: 0xffc400 });
  M.paint.metalness = 0.4;
  M.paint.roughness = 0.45;
  M.paint.clearcoat = 0.6;
  M.paint.clearcoatRoughness = 0.2;

  const FW = { z: 1.46, r: 0.54, w: 0.44, x: 0.9 };
  const RW = { z: -1.44, r: 0.54, w: 0.44, x: 0.9 };

  // 側視輪廓 [[z, y], ...] 沿車寬擠出
  const slab = (pts, width, mat, bevel = 0.03, x = 0) => {
    const m = mesh(THREE, extrudeX(THREE, shapeOf(THREE, pts), width, { bevel, bevelSegments: 2, curveSegments: 1 }), mat, [x, 0, 0]);
    group.add(m);
    return m;
  };
  // 方塊：len 沿車長、h 高、wid 沿車寬；位置 (zf 車長, y, xs 車寬)
  const bx = (len, h, wid, mat, zf, y, xs = 0, r = 0.01) => mesh(THREE, roundBox(THREE, wid, h, len, r), mat, [xs, y, zf]);
  const add = (o) => { group.add(o); return o; };
  const cyl = (r, len, mat, axis, pos, seg = 12) => {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    return mesh(THREE, g, mat, pos);
  };

  // ── 車身：窄的下半部讓出輪拱，上半部與車門段為全寬 ──
  slab([[-2.3, 0.66], [2.05, 0.66], [2.42, 0.9], [2.4, 1.1], [-2.42, 1.1], [-2.44, 0.96]], 1.3, M.under, 0.02);
  slab([[-2.42, 1.08], [2.4, 1.08], [2.38, 1.14], [1.08, 1.28], [-2.34, 1.28]], 2.0, M.paint, 0.035);
  add(bx(1.56, 0.46, 2.0, M.paint, 0.02, 0.88, 0, 0.035));                         // 車門段
  slab([[1.02, 1.26], [0.46, 1.92], [-1.1, 1.92], [-1.42, 1.26]], 1.8, M.paint, 0.035); // 座艙
  slab([[-1.44, 1.26], [-1.44, 1.5], [-2.34, 1.5], [-2.34, 1.26]], 1.96, M.paint, 0.03); // 後斗側牆
  add(bx(0.86, 0.2, 1.74, M.under, -1.89, 1.42));                                   // 後斗內部
  slab([[1.95, 1.22], [1.15, 1.34], [0.2, 1.34], [0.2, 1.27], [1.95, 1.17]], 1.0, M.paint, 0.02); // 引擎蓋隆起
  for (const xs of [0.28, -0.28]) for (const zf of [1.2, 1.36, 1.52]) add(bx(0.1, 0.012, 0.3, M.gblack, zf, 1.335, xs, 0.004)); // 散熱柵

  // 擋風玻璃與後窗（貼在座艙的斜面上）
  add(mesh(THREE, roundBox(THREE, 1.44, 0.66, 0.03, 0.01), M.glass, [0, 1.603, 0.755], [-0.705, 0, 0]));
  add(mesh(THREE, roundBox(THREE, 1.3, 0.44, 0.03, 0.01), M.glass, [0, 1.6, -1.278], [0.451, 0, 0]));

  // 防滾架
  for (const xs of [0.86, -0.86]) slab([[-1.1, 1.92], [-1.1, 2.0], [-1.2, 2.0], [-1.52, 1.5], [-1.44, 1.5]], 0.08, M.trim, 0.01, xs);
  add(cyl(0.04, 1.72, M.trim, 'x', [0, 1.98, -1.15]));

  // ── 左右對稱的部件 ──
  const heads = [], drls = [];
  mirrored(group, () => bx(0.68, 0.4, 0.03, M.glass, 0.02, 1.6, 0.908));           // 側窗
  mirrored(group, () => bx(0.5, 0.4, 0.03, M.glass, -0.72, 1.6, 0.908));
  mirrored(group, () => bx(0.05, 0.64, 0.02, M.gblack, -0.4, 1.56, 0.915));        // B 柱
  for (const zf of [0.5, -0.4]) mirrored(group, () => bx(0.012, 0.42, 0.012, M.gap, zf, 0.9, 1.004, 0.002)); // 門縫
  mirrored(group, () => bx(1.56, 0.012, 0.012, M.gap, 0.02, 1.1, 1.004, 0.002));
  for (const zf of [0.24, -0.62]) mirrored(group, () => bx(0.16, 0.03, 0.03, M.gblack, zf, 1.0, 1.012, 0.008)); // 門把
  for (const w of [FW, RW]) {                                                       // 折角葉子板
    const z = w.z;
    const flare = extrudeX(THREE, shapeOf(THREE, [[z - 0.82, 0.96], [z - 0.56, 1.26], [z + 0.56, 1.26], [z + 0.82, 0.96], [z + 0.72, 0.96], [z + 0.5, 1.17], [z - 0.5, 1.17], [z - 0.72, 0.96]]), 0.5, { bevel: 0.015, curveSegments: 1 });
    mirrored(group, () => mesh(THREE, flare, M.trim, [0.88, 0, 0]));
  }
  mirrored(group, () => bx(1.5, 0.06, 0.26, M.trim, 0.02, 0.62, 1.04, 0.015));     // 側踏板
  mirrored(group, () => cyl(0.035, 1.5, M.darkChrome, 'z', [1.15, 0.56, 0.02]));   // 護桿
  mirrored(group, () => { const m = makeMirror(THREE, M, { len: 0.22, h: 0.14, w: 0.1, arm: 0.12 }); m.position.set(0.9, 1.4, 0.9); return m; });
  for (const s of [1, -1]) {                                                        // 頭燈與日行燈
    add(bx(0.07, 0.2, 0.32, M.housing, 2.4, 1.0, s * 0.7, 0.02));
    heads.push(add(bx(0.03, 0.14, 0.24, M.head, 2.435, 1.0, s * 0.7, 0.01)));
    drls.push(add(bx(0.02, 0.02, 0.28, M.drl, 2.44, 0.88, s * 0.7, 0.006)));
    add(bx(0.03, 0.16, 0.28, M.lens, 2.455, 1.0, s * 0.7, 0.01));
  }
  const tails = mirrored(group, () => bx(0.05, 0.24, 0.1, M.tail, -2.45, 1.16, 0.86, 0.012));
  mirrored(group, () => bx(0.07, 0.6, 0.07, M.trim, 2.56, 0.9, 0.4, 0.015));       // 防撞桿立柱
  mirrored(group, () => bx(0.22, 0.07, 0.07, M.trim, 2.46, 0.72, 0.4, 0.015));
  mirrored(group, () => bx(0.1, 0.07, 0.05, M.caliper, 2.5, 0.72, 0.62, 0.012));   // 拖車鉤
  mirrored(group, () => cyl(0.03, 1.5, M.trim, 'z', [0.74, 2.0, -0.3]));           // 車頂架

  // ── 車頭：防撞桿、護柵、絞盤、護板、保桿 ──
  add(bx(0.07, 0.07, 1.4, M.trim, 2.56, 1.16, 0, 0.015));
  add(bx(0.07, 0.07, 1.4, M.trim, 2.56, 0.66, 0, 0.015));
  for (const xs of [-0.2, 0, 0.2]) add(bx(0.05, 0.42, 0.03, M.trim, 2.52, 0.92, xs, 0.008));
  add(bx(0.06, 0.28, 1.0, M.grille, 2.4, 0.94));
  add(bx(0.26, 0.2, 0.5, M.darkChrome, 2.5, 0.6, 0, 0.03));
  add(bx(0.6, 0.05, 1.5, M.trim, 2.2, 0.62));
  add(bx(0.3, 0.26, 2.0, M.trim, 2.28, 0.86, 0, 0.04));                             // 前保桿
  add(bx(0.28, 0.26, 2.0, M.trim, -2.3, 0.86, 0, 0.04));                            // 後保桿

  // ── 車頂燈排（隨車燈亮起）與橫桿 ──
  for (let i = -2; i <= 2; i++) heads.push(add(bx(0.07, 0.11, 0.26, M.head, 0.42, 2.07, i * 0.3, 0.012)));
  add(bx(0.1, 0.16, 1.52, M.trim, 0.37, 2.07, 0, 0.015));
  for (const zf of [0.3, -0.3, -0.9]) add(bx(0.04, 0.04, 1.52, M.trim, zf, 2.0, 0, 0.008));

  // ── 車尾與其他 ──
  add(cyl(0.48, 0.3, M.tire, 'z', [0.2, 1.3, -2.6], 28));                           // 備胎
  add(cyl(0.26, 0.32, M.rim, 'z', [0.2, 1.3, -2.6], 16));
  add(bx(0.2, 0.46, 0.3, M.paint, -2.56, 1.24, -0.62, 0.03));                       // 油桶
  add(cyl(0.05, 1.0, M.trim, 'y', [0.98, 1.74, 0.98]));                             // 涉水管
  add(cyl(0.012, 1.1, M.trim, 'y', [-0.8, 2.4, -1.3], 6));                          // 天線
  for (const w of [FW, RW]) add(cyl(0.09, 1.7, M.darkChrome, 'x', [0, w.r, w.z]));  // 車軸

  const light = makeHeadSpot(THREE, group, { y: 1.0, z: 2.5 });

  const wheelOpts = { spokes: 6, spokeW: [0.08, 0.065], spokeT: 0.045, concave: 0.07, rimRatio: 0.56, tread: 'offroad', segments: 40, lugs: 6 };
  const wheels = placeWheels(THREE, group, M, [
    { ...FW, radius: FW.r, width: FW.w, ...wheelOpts },
    { ...RW, radius: RW.r, width: RW.w, ...wheelOpts },
  ]);

  return { group, wheels, bodyMaterials: [M.paint], headlights: { meshes: heads, drl: drls, light }, taillights: tails, meta };
}
