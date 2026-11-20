// 女武神（valkyrie）— 原創低趴雙座 hypercar 風格：淚滴座艙、長尾擴散器、大尾翼。
import { bodyProfile, sideExtrude, extrudeShapeX, deform, planTaper, smooth, box, mirrored, makeMaterials, makeWheel, makeHeadSpot } from './parts.js';

export const meta = { id: 'valkyrie', displayName: '女武神', roofY: 1.12 };

export function build(THREE, { color = '#c8102e' } = {}) {
  const group = new THREE.Group();
  group.name = 'valkyrie';
  const M = makeMaterials(THREE, color);
  const W = 2.0, WB = 1.36, WR = 0.33;

  // ── 下車身：側視輪廓，含兩個輪拱缺口 ──
  const top = [
    [2.28, 0.13], [2.36, 0.24], [2.3, 0.36], [1.95, 0.48], [1.45, 0.6], [0.9, 0.7],
    [0.2, 0.78], [-0.7, 0.82], [-1.5, 0.85], [-2.05, 0.82], [-2.3, 0.72], [-2.36, 0.5], [-2.3, 0.3],
    [-2.05, 0.15],
  ];
  const outline = bodyProfile(top, { wheelZ: [WB, -WB], archR: 0.41, wheelY: WR, clearance: 0.13 });
  let body = sideExtrude(THREE, outline, W, { bevel: 0.05, bevelSegments: 1 });
  body = deform(THREE, body, (v) => {
    const s = planTaper(v.z, { zFront: 1.7, zFrontEnd: 2.4, frontScale: 0.72, zRear: -1.8, zRearEnd: -2.4, rearScale: 0.9 });
    const tumble = 1 - 0.1 * smooth((v.y - 0.5) / 0.35);
    v.x *= s * tumble;
    // 前輪拱後方的側面凹槽：讓腰線收細
    if (Math.abs(v.x) > 0.8 && v.z > -0.9 && v.z < 0.8 && v.y < 0.55) v.x *= 0.95;
  });
  const bodyMesh = new THREE.Mesh(body, M.body);
  group.add(bodyMesh);

  // ── 淚滴座艙（Lathe）──
  const tear = [
    [0.0, 1.0], [0.3, 0.92], [0.5, 0.72], [0.58, 0.42], [0.56, 0.05], [0.46, -0.38], [0.3, -0.75], [0.1, -1.05], [0.0, -1.12],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const canopyG = new THREE.LatheGeometry(tear, 12);
  canopyG.rotateX(Math.PI / 2);
  canopyG.scale(1.15, 0.78, 1.12); // 寬 1.37、高 0.36（半埋入車身）、長 2.4
  const canopy = new THREE.Mesh(canopyG, M.glass);
  canopy.position.set(0, 0.7, -0.15);
  group.add(canopy);
  // 座艙脊線（車身色）延伸到尾部
  const spine = sideExtrude(THREE, [[-0.9, 0.9], [-2.1, 0.86], [-2.1, 0.8], [-0.9, 0.8]], 0.22, { bevel: 0.02 });
  group.add(new THREE.Mesh(spine, M.body));

  // ── 前分流板、側進氣口、擴散器 ──
  group.add(box(THREE, 1.7, 0.04, 0.35, M.trim, [0, 0.12, 2.2]));
  mirrored(group, (s) => box(THREE, 0.06, 0.2, 0.75, M.trim, [s * 0.93, 0.45, -0.55], [0, s * 0.12, 0]));
  group.add(box(THREE, 1.6, 0.03, 0.6, M.trim, [0, 0.2, -2.05], [-0.28, 0, 0]));
  for (let i = -2; i <= 2; i++) group.add(box(THREE, 0.025, 0.2, 0.55, M.trim, [i * 0.3, 0.2, -2.08], [-0.28, 0, 0]));

  // ── 大尾翼：翼型擠出 + 端板 + 支柱 ──
  const foil = new THREE.Shape();
  foil.moveTo(0.22, 0.0);
  foil.quadraticCurveTo(0.12, 0.06, -0.2, 0.035);
  foil.lineTo(-0.22, 0.0);
  foil.quadraticCurveTo(0.0, -0.025, 0.22, 0.0);
  const wing = new THREE.Mesh(extrudeShapeX(THREE, foil, 1.86, { bevel: 0.01, curveSegments: 4 }), M.body);
  wing.position.set(0, 1.08, -2.02);
  wing.rotation.x = 0.12;
  group.add(wing);
  mirrored(group, (s) => box(THREE, 0.025, 0.24, 0.55, M.trim, [s * 0.94, 1.04, -2.04]));
  mirrored(group, (s) => box(THREE, 0.04, 0.3, 0.08, M.trim, [s * 0.45, 0.93, -1.98], [-0.35, 0, 0]));

  // ── 燈具 ──
  const heads = mirrored(group, (s) => box(THREE, 0.44, 0.05, 0.12, M.head, [s * 0.55, 0.43, 2.14], [0.3, s * 0.5, 0]));
  const tails = [
    ...mirrored(group, (s) => box(THREE, 0.5, 0.05, 0.04, M.tail, [s * 0.5, 0.7, -2.31], [0, s * -0.12, 0])),
    box(THREE, 0.18, 0.05, 0.04, M.tail, [0, 0.62, -2.34]),
  ];
  group.add(tails[2]);
  const light = makeHeadSpot(THREE, group, { y: 0.45, z: 2.2 });

  // ── 車輪 ──
  const wheels = [];
  for (const z of [WB, -WB]) {
    for (const s of [1, -1]) {
      const w = makeWheel(THREE, M, { radius: WR, width: z > 0 ? 0.26 : 0.32, side: s, style: 'spoke5' });
      w.position.set(s * (W / 2 - 0.2), WR, z);
      group.add(w);
      wheels.push(w);
    }
  }

  return {
    group,
    wheels,
    bodyMaterials: [M.body],
    headlights: { meshes: heads, light },
    taillights: tails,
    meta,
  };
}
