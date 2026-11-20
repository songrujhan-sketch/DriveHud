// 阿斯拉（asurada）— 原創流線電動雙門跑車風格：長軸距、平滑車頂弧線、貫穿式尾燈。
import { bodyProfile, extrudeShapeX, sideExtrude, deform, planTaper, smooth, box, mirrored, makeMaterials, makeWheel, makeHeadSpot } from './parts.js';

export const meta = { id: 'asurada', displayName: '阿斯拉', roofY: 1.3 };

export function build(THREE, { color = '#e8eaed' } = {}) {
  const group = new THREE.Group();
  group.name = 'asurada';
  const M = makeMaterials(THREE, color);
  M.body.metalness = 0.45;
  M.body.roughness = 0.25;
  const W = 1.96, WB = 1.56, WR = 0.33, CL = 0.15;

  // ── 下車身：平滑弧線（以曲線取樣成點）──
  const curve = new THREE.CatmullRomCurve3([
    [2.3, 0.2], [2.44, 0.36], [2.3, 0.56], [1.7, 0.68], [0.9, 0.76], [-0.4, 0.8], [-1.6, 0.8], [-2.25, 0.74], [-2.44, 0.56], [-2.4, 0.3],
  ].map(([z, y]) => new THREE.Vector3(z, y, 0)), false, 'centripetal');
  const top = [[2.15, CL], ...curve.getPoints(18).map((p) => [p.x, p.y]), [-2.2, CL]];
  const outline = bodyProfile(top, { wheelZ: [WB, -WB], archR: 0.4, wheelY: WR, clearance: CL });
  let body = sideExtrude(THREE, outline, W, { bevel: 0.05, bevelSegments: 2 });
  body = deform(THREE, body, (v) => {
    v.x *= planTaper(v.z, { zFront: 1.6, zFrontEnd: 2.48, frontScale: 0.74, zRear: -1.7, zRearEnd: -2.48, rearScale: 0.82 });
    v.x *= 1 - 0.06 * smooth((v.y - 0.5) / 0.3);
  });
  group.add(new THREE.Mesh(body, M.body));

  // ── 溫室：單一弧線的 fastback 玻璃頂 ──
  const gh = new THREE.Shape();
  gh.moveTo(1.2, 0.74);
  gh.bezierCurveTo(0.7, 1.12, 0.2, 1.3, -0.35, 1.29);
  gh.bezierCurveTo(-1.0, 1.27, -1.6, 1.0, -2.05, 0.77);
  gh.lineTo(1.2, 0.74);
  let ghG = extrudeShapeX(THREE, gh, 1.62, { bevel: 0.04, bevelSegments: 2, curveSegments: 10 });
  ghG = deform(THREE, ghG, (v) => {
    v.x *= 1 - 0.3 * smooth((v.y - 0.75) / 0.55);
    v.x *= planTaper(v.z, { zFront: 0.6, zFrontEnd: 1.25, frontScale: 0.85, zRear: -1.3, zRearEnd: -2.1, rearScale: 0.8 });
  });
  group.add(new THREE.Mesh(ghG, M.glass));
  // ── 平整下護板、側裙 ──
  mirrored(group, (s) => box(THREE, 0.04, 0.07, 2.1, M.trim, [s * 0.96, 0.2, 0]));
  group.add(box(THREE, 1.4, 0.03, 0.45, M.trim, [0, 0.18, -2.2], [-0.2, 0, 0]));

  // ── 燈具：前後皆為貫穿式燈條 ──
  const frontBar = box(THREE, 1.42, 0.05, 0.06, M.head, [0, 0.55, 2.37], [0.25, 0, 0]);
  group.add(frontBar);
  const heads = [frontBar, ...mirrored(group, (s) => box(THREE, 0.24, 0.06, 0.06, M.head, [s * 0.7, 0.5, 2.3], [0.25, s * 0.45, 0]))];
  const rearBar = box(THREE, 1.5, 0.05, 0.05, M.tail, [0, 0.66, -2.43]);
  group.add(rearBar);
  const tails = [rearBar, ...mirrored(group, (s) => box(THREE, 0.04, 0.045, 0.25, M.tail, [s * 0.8, 0.69, -2.3], [0, s * -0.5, 0]))];
  const light = makeHeadSpot(THREE, group, { y: 0.55, z: 2.35 });

  // ── 空力輪蓋 ──
  const wheels = [];
  for (const z of [WB, -WB]) {
    for (const s of [1, -1]) {
      const w = makeWheel(THREE, M, { radius: WR, width: 0.27, side: s, style: 'aero' });
      w.position.set(s * (W / 2 - 0.17), WR, z);
      group.add(w);
      wheels.push(w);
    }
  }

  return { group, wheels, bodyMaterials: [M.body], headlights: { meshes: heads, light }, taillights: tails, meta };
}
