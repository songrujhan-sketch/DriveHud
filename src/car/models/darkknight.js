// 黑暗騎士（darkknight）— 原創寬體裝甲越野風格：高離地、大輪胎、稜角裝甲板、低矮座艙。
import { bodyProfile, sideExtrude, deform, planTaper, smooth, box, mirrored, makeMaterials, makeWheel, makeHeadSpot } from './parts.js';

export const meta = { id: 'darkknight', displayName: '黑暗騎士', roofY: 1.62 };

export function build(THREE, { color = '#3a3f45' } = {}) {
  const group = new THREE.Group();
  group.name = 'darkknight';
  const M = makeMaterials(THREE, color);
  M.body.metalness = 0.25;
  M.body.roughness = 0.5;
  const W = 2.12, WB = 1.45, WR = 0.4, CL = 0.46;

  // ── 下車身：稜角輪廓、六角形輪拱 ──
  const top = [
    [2.18, CL + 0.02], [2.36, 0.68], [2.38, 0.98], [2.2, 1.1], [1.0, 1.18], [0.75, 1.2],
    [-1.9, 1.2], [-2.3, 1.12], [-2.36, 0.62], [-2.15, CL],
  ];
  const outline = bodyProfile(top, { wheelZ: [WB, -WB], archR: 0.56, wheelY: WR, clearance: CL, archStyle: 'angular' });
  let body = sideExtrude(THREE, outline, W, { bevel: 0.035, bevelSegments: 1 });
  body = deform(THREE, body, (v) => {
    v.x *= planTaper(v.z, { zFront: 1.95, zFrontEnd: 2.4, frontScale: 0.9, zRear: -2.0, zRearEnd: -2.4, rearScale: 0.94 });
    // 上緣斜切：側面上 1/3 向內收，形成裝甲稜線
    v.x *= 1 - 0.07 * smooth((v.y - 0.92) / 0.28);
  });
  group.add(new THREE.Mesh(body, M.body));

  // ── 低矮座艙：梯形側視，上窄下寬 ──
  let cab = sideExtrude(THREE, [[0.72, 1.2], [0.18, 1.6], [-1.15, 1.62], [-1.55, 1.2]], 1.78, { bevel: 0.03 });
  cab = deform(THREE, cab, (v) => { v.x *= 1 - 0.16 * smooth((v.y - 1.2) / 0.42); });
  group.add(new THREE.Mesh(cab, M.body));
  // 窗：狹長的縫隙式擋風與側窗
  group.add(box(THREE, 1.3, 0.13, 0.03, M.glass, [0, 1.42, 0.47], [-0.63, 0, 0]));
  mirrored(group, (s) => box(THREE, 0.03, 0.12, 1.2, M.glass, [s * 0.82, 1.43, -0.42], [0, 0, s * -0.33]));
  // 車頂護架
  mirrored(group, (s) => box(THREE, 0.06, 0.05, 1.5, M.trim, [s * 0.6, 1.66, -0.5]));

  // ── 裝甲板：引擎蓋斜板、側裙板、肩部護板 ──
  group.add(box(THREE, 1.7, 0.06, 1.05, M.body, [0, 1.2, 1.55], [0.1, 0, 0]));
  group.add(box(THREE, 0.5, 0.04, 0.7, M.trim, [0, 1.24, 1.45], [0.1, 0, 0]));
  mirrored(group, (s) => box(THREE, 0.06, 0.32, 1.6, M.body, [s * 1.07, 0.78, 0], [0, 0, s * 0.12]));
  mirrored(group, (s) => box(THREE, 0.05, 0.18, 1.2, M.trim, [s * 1.03, 0.55, 0], [0, 0, s * -0.25]));
  // 稜角輪眉
  for (const z of [WB, -WB]) {
    mirrored(group, (s) => box(THREE, 0.2, 0.06, 1.15, M.trim, [s * 1.0, WR + 0.56, z], [0, 0, s * 0.35]));
  }

  // ── 前保桿／護板／水箱罩 ──
  group.add(box(THREE, 2.0, 0.2, 0.22, M.trim, [0, 0.62, 2.36]));
  group.add(box(THREE, 1.5, 0.05, 0.6, M.trim, [0, 0.47, 2.1], [0.45, 0, 0]));
  for (let i = 0; i < 3; i++) group.add(box(THREE, 0.9, 0.035, 0.03, M.trim, [0, 0.82 + i * 0.07, 2.39]));
  group.add(box(THREE, 2.0, 0.2, 0.2, M.trim, [0, 0.62, -2.36]));

  // ── 燈具：每側兩顆方燈；後方直立燈條 ──
  const heads = [];
  for (const s of [1, -1]) {
    for (const k of [0, 1]) {
      const m = box(THREE, 0.16, 0.12, 0.05, M.head, [s * (0.66 + k * 0.2), 0.94, 2.36]);
      group.add(m);
      heads.push(m);
    }
  }
  const tails = mirrored(group, (s) => box(THREE, 0.08, 0.38, 0.04, M.tail, [s * 0.94, 0.88, -2.37]));
  const light = makeHeadSpot(THREE, group, { y: 0.94, z: 2.4 });

  // ── 大輪胎（塊狀胎紋）──
  const wheels = [];
  for (const z of [WB, -WB]) {
    for (const s of [1, -1]) {
      const w = makeWheel(THREE, M, { radius: WR, width: 0.36, side: s, style: 'beadlock', segments: 16, tread: true });
      w.position.set(s * (W / 2 - 0.08), WR, z);
      group.add(w);
      wheels.push(w);
    }
  }

  return { group, wheels, bodyMaterials: [M.body], headlights: { meshes: heads, light }, taillights: tails, meta };
}
