// 裝甲越野（rover）— 原創皮卡式裝甲越野：折角車身、短座艙加後斗與防滾架、折角葉子板、
// 車頂燈排、前防撞桿與絞盤、車尾備胎。由平行原型的 DH-03 移植，全部為原創幾何。
// 座標：+Z 車頭、X 車寬、Y 向上。
import { makeMaterials, placeWheels, makeMirror, makeHeadSpot, roundBox, mesh, mirrored, merge, shapeOf, extrudeX } from './parts.js';

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
    const m = mesh(THREE, extrudeX(THREE, shapeOf(THREE, pts), width, { bevel, bevelSegments: 3, curveSegments: 1 }), mat, [x, 0, 0]);
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
  slab([[-2.42, 1.08], [2.4, 1.08], [2.38, 1.14], [1.08, 1.28], [-2.34, 1.28]], 2.0, M.paint, 0.05);
  add(bx(1.56, 0.46, 2.0, M.paint, 0.02, 0.88, 0, 0.05));                          // 車門段
  slab([[1.02, 1.26], [0.46, 1.92], [-1.1, 1.92], [-1.42, 1.26]], 1.8, M.paint, 0.05); // 座艙
  slab([[-1.44, 1.26], [-1.44, 1.5], [-2.34, 1.5], [-2.34, 1.26]], 1.96, M.paint, 0.03); // 後斗側牆
  add(bx(0.86, 0.2, 1.74, M.under, -1.89, 1.36));                                   // 後斗內部
  for (const xs of [-0.6, -0.3, 0, 0.3, 0.6]) add(bx(0.82, 0.012, 0.06, M.trim, -1.89, 1.466, xs, 0.004)); // 後斗底板肋條
  slab([[1.95, 1.22], [1.15, 1.34], [0.2, 1.34], [0.2, 1.27], [1.95, 1.17]], 1.0, M.paint, 0.02); // 引擎蓋隆起
  for (const xs of [0.28, -0.28]) for (const zf of [1.2, 1.36, 1.52]) add(bx(0.1, 0.012, 0.3, M.gblack, zf, 1.335, xs, 0.004)); // 散熱柵

  // 擋風玻璃與後窗（貼在座艙的斜面上）
  add(mesh(THREE, roundBox(THREE, 1.44, 0.66, 0.03, 0.01), M.glass, [0, 1.629, 0.785], [-0.705, 0, 0]));
  add(mesh(THREE, roundBox(THREE, 1.3, 0.44, 0.03, 0.01), M.glass, [0, 1.617, -1.314], [0.451, 0, 0]));

  // 防滾架
  for (const xs of [0.86, -0.86]) slab([[-1.1, 1.92], [-1.1, 2.0], [-1.2, 2.0], [-1.52, 1.5], [-1.44, 1.5]], 0.08, M.trim, 0.01, xs);
  add(cyl(0.04, 1.72, M.trim, 'x', [0, 1.98, -1.15]));

  // ── 左右對稱的部件 ──
  const heads = [], drls = [];
  mirrored(group, () => bx(0.5, 0.4, 0.03, M.glass, -0.72, 1.6, 0.908));
  mirrored(group, () => bx(0.05, 0.64, 0.02, M.gblack, -0.4, 1.56, 0.915));        // B 柱
  for (const zf of [0.5, -0.4]) mirrored(group, () => bx(0.012, 0.42, 0.012, M.gap, zf, 0.9, 1.004, 0.002)); // 門縫
  mirrored(group, () => bx(1.56, 0.012, 0.012, M.gap, 0.02, 1.1, 1.004, 0.002));
  mirrored(group, () => bx(0.16, 0.03, 0.03, M.gblack, -0.62, 1.0, 1.012, 0.008)); // 後門把
  for (const w of [FW, RW]) {                                                       // 折角葉子板
    const z = w.z;
    const flare = extrudeX(THREE, shapeOf(THREE, [[z - 0.82, 0.96], [z - 0.56, 1.26], [z + 0.56, 1.26], [z + 0.82, 0.96], [z + 0.72, 0.96], [z + 0.5, 1.17], [z - 0.5, 1.17], [z - 0.72, 0.96]]), 0.5, { bevel: 0.015, curveSegments: 1 });
    mirrored(group, () => mesh(THREE, flare, M.trim, [0.88, 0, 0]));
  }
  mirrored(group, () => bx(1.5, 0.06, 0.26, M.trim, 0.02, 0.62, 1.04, 0.015));     // 側踏板
  mirrored(group, () => cyl(0.035, 1.5, M.darkChrome, 'z', [1.15, 0.56, 0.02]));   // 護桿
  mirrored(group, () => { const m = makeMirror(THREE, M, { len: 0.22, h: 0.14, w: 0.1, arm: 0.12 }); m.position.set(0.9, 1.4, 0.9); return m; });
  for (const s of [1, -1]) {                                                        // 頭燈與日行燈
    add(bx(0.07, 0.2, 0.32, M.housing, 2.43, 1.0, s * 0.7, 0.02));
    heads.push(add(bx(0.03, 0.14, 0.24, M.head, 2.465, 1.0, s * 0.7, 0.01)));
    drls.push(add(bx(0.02, 0.02, 0.28, M.drl, 2.47, 0.88, s * 0.7, 0.006)));
    add(bx(0.03, 0.16, 0.28, M.lens, 2.485, 1.0, s * 0.7, 0.01));
  }
  const tails = mirrored(group, () => bx(0.05, 0.24, 0.1, M.tail, -2.485, 1.16, 0.86, 0.012));
  mirrored(group, () => bx(0.07, 0.6, 0.07, M.trim, 2.56, 0.9, 0.4, 0.015));       // 防撞桿立柱
  mirrored(group, () => bx(0.22, 0.07, 0.07, M.trim, 2.46, 0.72, 0.4, 0.015));
  mirrored(group, () => bx(0.1, 0.07, 0.05, M.caliper, 2.5, 0.72, 0.62, 0.012));   // 拖車鉤
  mirrored(group, () => cyl(0.03, 1.5, M.trim, 'z', [0.74, 2.0, -0.3]));           // 車頂架

  // ── 車頭：防撞桿、護柵、絞盤、護板、保桿 ──
  add(bx(0.07, 0.07, 1.4, M.trim, 2.56, 1.16, 0, 0.015));
  add(bx(0.07, 0.07, 1.4, M.trim, 2.56, 0.66, 0, 0.015));
  for (const xs of [-0.2, 0, 0.2]) add(bx(0.05, 0.42, 0.03, M.trim, 2.52, 0.92, xs, 0.008));
  add(bx(0.06, 0.28, 1.0, M.grille, 2.43, 0.94));
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
  add(cyl(0.012, 1.1, M.trim, 'y', [-0.8, 2.47, -0.95], 6));                        // 天線
  add(cyl(0.035, 0.06, M.darkChrome, 'y', [-0.8, 1.94, -0.95], 10));
  for (const w of [FW, RW]) add(cyl(0.09, 1.7, M.darkChrome, 'x', [0, w.r, w.z]));  // 車軸

  // ── 精修細節 ──
  // 擋風玻璃框與雨刷、側窗框
  add(mesh(THREE, roundBox(THREE, 1.58, 0.76, 0.02, 0.01), M.gblack, [0, 1.621, 0.776], [-0.705, 0, 0]));
  for (const s of [1, -1]) add(mesh(THREE, roundBox(THREE, 0.5, 0.014, 0.014, 0.004), M.gblack, [s * 0.3, 1.446, 0.97], [-0.705, 0, s * 0.22]));
  mirrored(group, () => bx(0.58, 0.48, 0.02, M.gblack, -0.72, 1.6, 0.898, 0.012));
  // 裝甲側板、下緣護板、引擎蓋接縫與扣件
  mirrored(group, () => bx(0.26, 0.28, 0.025, M.paint, -0.58, 0.9, 1.01, 0.012));
  mirrored(group, () => bx(1.56, 0.09, 0.03, M.trim, 0.02, 0.7, 1.008, 0.01));
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.01, 0.006, 1.2, 0.002), M.gap, [0.82, 1.236, 1.7], [0.107, 0, 0]));
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.03, 0.02, 0.07, 0.006), M.darkChrome, [0.9, 1.24, 1.75], [0.107, 0, 0]));
  // 鉚釘：側板四角與葉子板上緣（合併成一個幾何）
  const bolts = [];
  const boltAt = (x, y, z) => { const g = new THREE.CylinderGeometry(0.016, 0.016, 0.02, 6); g.rotateZ(Math.PI / 2); g.translate(x, y, z); bolts.push(g); };
  for (const dz of [-0.09, 0.09]) for (const y of [0.79, 1.01]) boltAt(1.03, y, -0.58 + dz);
  for (const w of [FW, RW]) for (const dz of [-0.45, -0.22, 0, 0.22, 0.45]) boltAt(1.135, 1.215, w.z + dz);
  const boltG = merge(THREE, bolts);
  mirrored(group, () => new THREE.Mesh(boltG, M.darkChrome));
  // 水箱罩橫條、霧燈、絞盤導繩口與掛鉤
  for (let i = 0; i < 4; i++) add(bx(0.03, 0.02, 0.96, M.gblack, 2.47, 0.84 + i * 0.066, 0, 0.006));
  for (const s of [1, -1]) drls.push(add(cyl(0.055, 0.03, M.drl, 'z', [s * 0.78, 0.84, 2.44], 16)));
  add(bx(0.04, 0.07, 0.3, M.chrome, 2.645, 0.6, 0, 0.01));
  add(bx(0.06, 0.09, 0.04, M.caliper, 2.69, 0.55, 0, 0.012));
  // 車頂：燈排鏡片、行李架網面、防滾架探照燈
  for (let i = -2; i <= 2; i++) add(bx(0.012, 0.1, 0.25, M.lens, 0.462, 2.07, i * 0.3, 0.004));
  add(bx(1.3, 0.012, 1.4, M.grille, -0.3, 1.99));
  for (const s of [1, -1]) {
    add(cyl(0.075, 0.07, M.trim, 'z', [s * 0.45, 2.1, -1.13], 16));
    heads.push(add(cyl(0.06, 0.02, M.head, 'z', [s * 0.45, 2.1, -1.09], 16)));
  }
  // 車尾：後斗護欄、尾門面板與把手、拖車球、排氣管、擋泥板、車牌
  mirrored(group, () => cyl(0.025, 0.86, M.darkChrome, 'z', [0.95, 1.54, -1.89]));
  add(bx(0.02, 0.2, 1.5, M.paint, -2.377, 1.38, 0, 0.008));
  add(bx(0.02, 0.03, 0.2, M.gblack, -2.39, 1.44, 0, 0.006));
  add(bx(0.16, 0.06, 0.06, M.darkChrome, -2.5, 0.72, 0, 0.012));
  add(mesh(THREE, new THREE.SphereGeometry(0.035, 12, 8), M.chrome, [0, 0.78, -2.56]));
  add(cyl(0.045, 0.26, M.chrome, 'z', [-0.6, 0.62, -2.4], 14));
  mirrored(group, () => bx(0.02, 0.32, 0.4, M.under, -2.04, 0.72, 0.9, 0.006));
  add(bx(0.012, 0.12, 0.38, M.chrome, -2.446, 0.86, -0.48, 0.004));
  add(bx(0.21, 0.03, 0.31, M.gblack, -2.56, 1.3, -0.62, 0.006));                    // 油桶束帶
  // 底盤：差速器與涉水管頂蓋
  for (const w of [FW, RW]) add(mesh(THREE, new THREE.SphereGeometry(0.17, 14, 10), M.darkChrome, [0, w.r, w.z]));
  add(bx(0.14, 0.1, 0.12, M.trim, 1.02, 2.26, 0.98, 0.02));

  // ── 前車門：下門板、裝甲板、窗框與側窗連成一片，鉸鏈在門前緣，向外平開 ──
  const doors = [];
  for (const s of [1, -1]) {
    add(bx(0.84, 0.5, 0.008, M.under, 0.05, 1.01, s * 1.003, 0.002));               // 門洞（開門後才看得到）
    add(bx(0.74, 0.46, 0.012, M.under, 0.02, 1.6, s * 0.902, 0.004));
    const pivot = new THREE.Group();
    pivot.position.set(s * 1.024, 1.0, 0.48);
    const put = (m) => { m.position.sub(pivot.position); pivot.add(m); return m; };
    put(bx(0.86, 0.52, 0.022, M.paint, 0.05, 1.01, s * 1.013, 0.008));              // 下門板
    put(bx(0.72, 0.28, 0.025, M.paint, 0.07, 0.9, s * 1.034, 0.012));               // 裝甲板
    put(bx(0.86, 0.03, 0.12, M.paint, 0.05, 1.285, s * 0.964, 0.008));              // 窗台
    put(bx(0.76, 0.48, 0.02, M.gblack, 0.02, 1.6, s * 0.906, 0.012));               // 窗框
    put(bx(0.68, 0.4, 0.03, M.glass, 0.02, 1.6, s * 0.916));                        // 側窗
    put(bx(0.16, 0.03, 0.03, M.gblack, 0.24, 1.0, s * 1.036, 0.008));               // 門把
    const db = [];
    for (const dz of [-0.32, 0.32]) for (const y of [0.79, 1.01]) {
      const g = new THREE.CylinderGeometry(0.016, 0.016, 0.02, 6);
      g.rotateZ(Math.PI / 2);
      g.translate(s * 1.054, y, 0.07 + dz);
      db.push(g);
    }
    put(new THREE.Mesh(merge(THREE, db), M.darkChrome));
    group.add(pivot);
    doors.push({ pivot, axis: new THREE.Vector3(0, 1, 0), sign: -s, max: 1.05 });
  }

  const light = makeHeadSpot(THREE, group, { y: 1.0, z: 2.5 });

  const wheelOpts = { spokes: 6, spokeW: [0.08, 0.065], spokeT: 0.045, concave: 0.07, rimRatio: 0.56, tread: 'offroad', segments: 40, lugs: 6 };
  const wheels = placeWheels(THREE, group, M, [
    { ...FW, radius: FW.r, width: FW.w, ...wheelOpts },
    { ...RW, radius: RW.r, width: RW.w, ...wheelOpts },
  ]);

  return { group, wheels, bodyMaterials: [M.paint], headlights: { meshes: heads, drl: drls, light }, taillights: tails, doors, meta };
}
