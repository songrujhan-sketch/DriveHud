// 黑騎士（darkknight）— 原創匿蹤楔形四輪車：多切面車身、三角形飛翼式座艙、兩側鷗翼門
// （從車頂到門檻整片掀起）、車尾倒三角排列三噴口、加大的後輪與隆起的後葉子板、雙立柱尾翼、
// 車頭為上下兩片尖葉夾著中央 V 形護板。全部為原創幾何（平面著色的多面體）。
// 座標：+Z 車頭、X 車寬（+X 為左側）、Y 向上。
import { makeMaterials, placeWheels, makeHeadSpot, roundBox, mesh, mirrored, merge, shapeOf, extrudeX } from './parts.js';

export const meta = { id: 'darkknight', displayName: '黑騎士', roofY: 1.24 };

// 中央車殼斷面 [z, 底y, 底半寬, 腰y, 腰半寬, 頂y, 頂半寬]，由車尾到車頭
const HULL = [
  [-2.3, 0.44, 0.46, 0.72, 0.62, 0.96, 0.44],
  [-1.9, 0.30, 0.56, 0.74, 0.66, 1.00, 0.52],
  [-0.9, 0.24, 0.60, 0.74, 0.66, 1.00, 0.56],
  [0.6, 0.22, 0.60, 0.70, 0.66, 0.90, 0.58],
  [1.7, 0.26, 0.54, 0.56, 0.64, 0.68, 0.48],
  [2.3, 0.30, 0.40, 0.48, 0.50, 0.60, 0.36],
];
// 座艙罩斷面 [z, 底半寬, 底y, 頂半寬, 頂y]：俯視為尖端朝前的三角形
const CANOPY = [
  [-1.6, 0.36, 0.99, 0.10, 1.03],
  [-1.0, 0.54, 0.99, 0.22, 1.20],
  [-0.45, 0.54, 0.96, 0.24, 1.24],
  [0.55, 0.34, 0.89, 0.16, 1.08],
  [1.05, 0.05, 0.80, 0.03, 0.83],
];
// 側艙的側視輪廓 [z, y]：前段（含前輪拱）與後段（含後輪拱）；中間一段是鷗翼門
const POD_F = [
  [0.57, 0.27], [0.78, 0.27], [0.94, 0.32],
  [1.22, 0.76], [1.68, 0.76], [1.96, 0.32],
  [2.06, 0.34], [2.14, 0.44], [2.08, 0.6],
  [1.72, 0.85], [1.2, 0.85], [0.62, 0.74], [0.57, 0.752],
];
const POD_R = [
  [-2.3, 0.56], [-2.2, 0.36], [-2.04, 0.34],
  [-1.7, 1.02], [-1.1, 1.02], [-0.76, 0.34],
  [-0.66, 0.27], [-0.47, 0.27], [-0.47, 1.009],
  [-1.0, 1.14], [-1.85, 1.14], [-2.3, 0.92],
];
const DOOR_Z = [0.55, -0.45]; // 鷗翼門的前緣、後緣

// 噴焰：沿噴口軸線的錐形殼，疊加混色。顏色由噴口的藍白高溫區過渡到黃、橘、暗紅，
// 亮度沿軸線有一節一節的馬赫環，邊緣依視角變薄，整體隨時間抖動。uPower 0–1 控制強度。
const FLAME_VS = /* glsl */`
  uniform float uTime, uSeed;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vUv = uv;
    float t = uv.y;
    vec3 p = position;
    p.xy *= 1.0 + 0.4 * sin(min(t * 1.7, 1.0) * 3.14159);
    float wob = sin(uTime * 23.0 + t * 9.0 + uSeed) * 0.014 + sin(uTime * 37.0 + t * 15.0 + uSeed * 2.0) * 0.009;
    p.x += wob * t; p.y += wob * 0.7 * t;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const FLAME_FS = /* glsl */`
  uniform float uTime, uPower, uHot, uSeed;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fn(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float t = vUv.y;                                   // 0 = 噴口，1 = 焰尾
    float ang = vUv.x * 12.0;
    float n = fn(vec2(ang + uSeed, t * 6.0 - uTime * 9.0)) * 0.65 + fn(vec2(ang * 2.5, t * 15.0 - uTime * 17.0)) * 0.35;
    vec3 cHot = vec3(0.45, 0.68, 1.0) * 1.5;
    vec3 cMid = vec3(1.0, 0.5, 0.1) * 1.25;
    vec3 cEnd = vec3(0.95, 0.14, 0.02) * 0.9;
    vec3 col = mix(cEnd, cMid, smoothstep(1.0, 0.3, t));
    col = mix(col, cHot, max(uHot * (1.0 - t * 0.6), pow(smoothstep(0.4, 0.0, t), 2.0)));
    float ring = pow(0.5 + 0.5 * cos(t * 30.0 - 0.8), 4.0) * (1.0 - t);   // 馬赫環
    col += vec3(1.0, 0.85, 0.6) * ring * 0.7;
    float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
    float a = (1.0 - smoothstep(0.5, 1.0, t + (n - 0.5) * 0.35)) * smoothstep(0.0, 0.05, t);
    a *= facing * (0.55 + 0.45 * n) * uPower * mix(0.7, 0.9, uHot);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function lerpKeys(K, z) {
  if (z <= K[0][0]) return K[0].slice(1);
  for (let i = 0; i < K.length - 1; i++) {
    const a = K[i], b = K[i + 1];
    if (z <= b[0]) { const t = (z - a[0]) / (b[0] - a[0]); return a.slice(1).map((v, j) => v + (b[j + 1] - v) * t); }
  }
  return K[K.length - 1].slice(1);
}
const podTop = (z) => (z >= 0.62 ? 0.74 + (0.85 - 0.74) * Math.min(1, (z - 0.62) / 0.58) : 0.74 + (1.14 - 0.74) * Math.min(1, (0.62 - z) / 1.62));

export function build(THREE, { color = '#3a3f45' } = {}) {
  const group = new THREE.Group();
  group.name = 'darkknight';
  const M = makeMaterials(THREE, color, { rim: 0x17181b, rimMetal: 0.5, rimRough: 0.5, caliper: 0xff6a12 });
  M.paint.metalness = 0.35;
  M.paint.roughness = 0.5;
  M.paint.clearcoat = 0.5;
  M.paint.clearcoatRoughness = 0.25;
  const flame = new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff6a1a, emissiveIntensity: 0.7, roughness: 0.6 });

  const FW = { z: 1.45, r: 0.35, w: 0.28, x: 0.9 };
  const RW = { z: -1.4, r: 0.48, w: 0.4, x: 0.88 };   // 後輪加大

  // ── 幾何工具：全部輸出非索引幾何，法線逐面計算，稜線保持銳利 ──
  const geo = (tris) => {
    const pos = [], uv = [];
    for (const p of tris) { pos.push(p[0], p[1], p[2]); uv.push(p[0] * 0.9 + p[2] * 0.31, p[1] * 0.9 + p[2] * 0.53); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  // 面 → 三角形；給 center 時，各面自動轉成朝外
  const fan = (V, F, center = null) => {
    const out = [];
    for (let f of F) {
      if (center) {
        const [a, b, c] = [V[f[0]], V[f[1]], V[f[2]]];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const m = [0, 1, 2].map((k) => f.reduce((s, i) => s + V[i][k], 0) / f.length - center[k]);
        if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) f = [...f].reverse();
      }
      for (let i = 1; i < f.length - 1; i++) out.push(V[f[0]], V[f[i]], V[f[i + 1]]);
    }
    return out;
  };
  // 放樣：secs = [[z, [[x, y], ...]]]，半邊斷面由下而上（x > 0），z 遞增；兩端封口
  const loftF = (secs) => {
    const k = secs[0][1].length, n = 2 * k, V = [], F = [];
    for (const [z, h] of secs) {
      for (const [x, y] of h) V.push([x, y, z]);
      for (let i = k - 1; i >= 0; i--) V.push([-h[i][0], h[i][1], z]);
    }
    for (let i = 0; i < secs.length - 1; i++) for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + ((j + 1) % n); F.push([a, b, b + n, a + n]); }
    F.push(Array.from({ length: n }, (_, j) => (secs.length - 1) * n + j));
    F.push(Array.from({ length: n }, (_, j) => n - 1 - j));
    return geo(fan(V, F));
  };
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  // 平板：pts 為外側面角點，t 為向內厚度，lift 為向外推出的距離；外側依 ref（預設車身中軸）自動判斷
  const plateG = (pts, t = 0.02, lift = 0, ref = null) => {
    const P = pts.map(V3);
    const c = P.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length);
    const n = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0])).normalize();
    const r = ref ? V3(ref) : new THREE.Vector3(0, 0.6, c.z);
    let Q = P;
    if (n.dot(c.clone().sub(r)) < 0) { n.negate(); Q = [...P].reverse(); }
    const outer = Q.map((p) => p.clone().addScaledVector(n, lift));
    const inner = outer.map((p) => p.clone().addScaledVector(n, -t));
    const V = [...outer, ...inner].map((p) => [p.x, p.y, p.z]);
    const m = Q.length;
    const F = [Array.from({ length: m }, (_, i) => i), Array.from({ length: m }, (_, i) => 2 * m - 1 - i)];
    for (let i = 0; i < m; i++) { const j = (i + 1) % m; F.push([i, i + m, j + m, j]); }
    return geo(fan(V, F));
  };
  const add = (o, parent = group) => { parent.add(o); return o; };
  const plate = (pts, mat, t, lift, ref) => new THREE.Mesh(plateG(pts, t, lift, ref), mat);
  const slab = (pts, width, mat, bevel = 0.02, x = 0) => mesh(THREE, extrudeX(THREE, shapeOf(THREE, pts), width, { bevel, bevelSegments: 1, curveSegments: 1 }), mat, [x, 0, 0]);
  const bx = (len, h, wid, mat, zf, y, xs = 0, r = 0.006, rot = [0, 0, 0]) => mesh(THREE, roundBox(THREE, wid, h, len, r, 1), mat, [xs, y, zf], rot);
  const hull = (z) => { const [yb, wb, ym, wm, yt, wt] = lerpKeys(HULL, z); return { yb, wb, ym, wm, yt, wt }; };
  const canopy = (z) => { const [wB, yB, wT, yT] = lerpKeys(CANOPY, z); return { wB, yB, wT, yT }; };
  const deckY = (z) => hull(z).yt;

  // ── 中央車殼與側艙 ──
  add(new THREE.Mesh(loftF(HULL.map(([z, yb, wb, ym, wm, yt, wt]) => [z, [[wb, yb], [wm, ym], [wt, yt]]])), M.paint));
  mirrored(group, () => slab(POD_F, 0.42, M.paint, 0.02, 0.86));
  mirrored(group, () => slab(POD_R, 0.42, M.paint, 0.02, 0.86));
  mirrored(group, () => bx(1.16, 0.6, 0.016, M.under, FW.z, 0.52, 0.668));                             // 輪拱內襯
  mirrored(group, () => bx(1.4, 0.84, 0.016, M.under, RW.z, 0.62, 0.668));
  mirrored(group, () => slab([[-0.5, 0.27], [0.6, 0.27], [0.6, 0.37], [-0.5, 0.37]], 0.44, M.trim, 0.012, 0.87)); // 門檻踏板

  // ── 座艙罩：前段玻璃、後段整流罩、車頂脊樑；中段兩側是鷗翼門 ──
  const sec = (z) => { const c = canopy(z); return [z, [[c.wB, c.yB], [c.wT, c.yT]]]; };
  add(new THREE.Mesh(loftF([sec(DOOR_Z[0]), sec(1.05)]), M.glass));
  add(new THREE.Mesh(loftF([sec(-1.6), sec(-1.0), sec(DOOR_Z[1])]), M.paint));
  add(new THREE.Mesh(loftF(DOOR_Z.slice().reverse().map((z) => { const c = canopy(z); return [z, [[c.wT, c.yT - 0.04], [c.wT, c.yT]]]; })), M.paint));
  add(plate([[0.012, 0.83, 1.05], [-0.012, 0.83, 1.05], [-0.012, 1.08, 0.55], [0.012, 1.08, 0.55]], M.gblack, 0.01, 0.006)); // 擋風玻璃中柱
  add(plate([[0.07, 1.044, -1.55], [-0.07, 1.044, -1.55], [-0.17, 1.186, -1.05], [0.17, 1.186, -1.05]], M.glass, 0.01, 0.008)); // 後窗

  // 門洞：深色地板、門檻與後隔板，開門時才看得到
  const [zA, zB] = DOOR_Z;
  const hA = hull(zA), hB = hull(zB);
  add(plate([[hA.wt, hA.yt, zA], [-hA.wt, hA.yt, zA], [-hB.wt, hB.yt, zB], [hB.wt, hB.yt, zB]], M.under, 0.006, 0.003));
  add(plate([[-0.52, 0.975, zB + 0.001], [0.52, 0.975, zB + 0.001], [0.23, 1.2, zB + 0.001], [-0.23, 1.2, zB + 0.001]], M.under, 0.006, 0, [0, 1, -3]));
  // 腰線斜面上、高度 y 處的點
  const beltPt = (h, y, z, s) => [s * (h.wt + (h.wm - h.wt) * ((h.yt - y) / (h.yt - h.ym))), y, z];
  const lowA = podTop(zA) + 0.01, lowB = podTop(zB) + 0.01;
  mirrored(group, () => plate([[hA.wt, hA.yt, zA], [hB.wt, hB.yt, zB], [hB.wm, hB.ym, zB], [hA.wm, hA.ym, zA]], M.under, 0.006, 0.003));
  mirrored(group, () => plate([[hA.wm, hA.ym, zA], [hB.wm, hB.ym, zB], [hB.wb, hB.yb, zB], [hA.wb, hA.yb, zA]], M.under, 0.006, 0.003));

  // 座椅、儀表台、方向盤（左駕）
  for (const s of [1, -1]) {
    add(bx(0.42, 0.05, 0.24, M.trim, -0.05, 0.975, s * 0.2));
    add(bx(0.07, 0.18, 0.24, M.trim, -0.33, 1.02, s * 0.2, 0.006, [-0.3, 0, 0]));
  }
  add(bx(0.1, 0.06, 0.5, M.trim, 0.47, 0.95));
  add(mesh(THREE, new THREE.TorusGeometry(0.045, 0.008, 6, 14), M.gblack, [0.2, 0.985, 0.34], [-0.35, 0, 0]));

  // ── 鷗翼門：側窗、車殼頂面、側艙上蓋與外板連成一片，鉸鏈在車頂脊樑邊緣，沿鉸鏈軸向上掀開 ──
  const doors = [];
  for (const s of [1, -1]) {
    const cA = canopy(zA), cB = canopy(zB);
    const S1 = [s * cA.wT, cA.yT, zA], S2 = [s * cB.wT, cB.yT, zB];
    const Q1 = [s * cA.wB, cA.yB, zA], Q2 = [s * cB.wB, cB.yB, zB];
    const at = (P, Q, t) => P.map((v, i) => v + (Q[i] - v) * t);
    const pivot = new THREE.Group();
    pivot.position.set(S1[0], S1[1], S1[2]);
    const put = (m) => { m.position.x -= S1[0]; m.position.y -= S1[1]; m.position.z -= S1[2]; pivot.add(m); return m; };
    put(plate([S1, S2, Q2, Q1], M.glass, 0.02, 0));                                                    // 側窗
    put(plate([S1, at(S1, S2, 0.05), at(Q1, Q2, 0.05), Q1], M.gblack, 0.01, 0.005));                   // 前後窗框
    put(plate([at(S1, S2, 0.95), S2, Q2, at(Q1, Q2, 0.95)], M.gblack, 0.01, 0.005));
    const T1 = [s * hA.wt, hA.yt, zA], T2 = [s * hB.wt, hB.yt, zB];
    put(plate([[Q1[0], hA.yt, zA], [Q2[0], hB.yt, zB], T2, T1], M.paint, 0.02, 0.012));                // 門板：車殼頂面段
    put(plate([T1, T2, beltPt(hB, lowB, zB, s), beltPt(hA, lowA, zA, s)], M.paint, 0.02, 0.012));      // 門板：腰線斜面段
    const zf = zA - 0.01, zr = zB + 0.01;
    put(plate([[s * 0.63, podTop(zf), zf], [s * 0.98, podTop(zf), zf], [s * 0.98, podTop(zr), zr], [s * 0.63, podTop(zr), zr]], M.paint, 0.03, 0)); // 門板：側艙上蓋
    put(slab([[zr + 0.02, 0.42], [zf - 0.02, 0.42], [zf - 0.02, podTop(zf - 0.02) - 0.02], [zr + 0.02, podTop(zr + 0.02) - 0.02]], 0.1, M.paint, 0.02, s * 1.02)); // 門板：外板
    put(slab([[-0.36, 0.46], [0.46, 0.46], [0.46, 0.66], [-0.36, 0.88]], 0.03, M.paint, 0.01, s * 1.085));  // 外掛裝甲板
    put(bx(0.14, 0.02, 0.02, M.gblack, -0.2, 0.92, s * 1.078, 0.004));                                   // 門把
    const db = [];
    for (const [z, y] of [[-0.3, 0.5], [-0.3, 0.8], [0.4, 0.5], [0.4, 0.62], [0.05, 0.5], [0.05, 0.7]]) {
      const g = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 6);
      g.rotateZ(Math.PI / 2);
      g.translate(s * 1.105, y, z);
      db.push(g);
    }
    put(new THREE.Mesh(merge(THREE, db), M.darkChrome));
    group.add(pivot);
    const axis = new THREE.Vector3(S2[0] - S1[0], S2[1] - S1[1], S2[2] - S1[2]).normalize();
    doors.push({ pivot, axis, sign: -s, max: 1.15 });
  }

  // ── 裝甲板：引擎蓋、車鼻、側艙外板與鉚釘 ──
  mirrored(group, () => plate([[0.08, deckY(1.62), 1.62], [0.42, deckY(1.62), 1.62], [0.5, deckY(0.72), 0.72], [0.3, deckY(0.72), 0.72], [0.08, deckY(1.12), 1.12]], M.paint, 0.02, 0.014));
  add(plate([[-0.3, deckY(2.24), 2.24], [0.3, deckY(2.24), 2.24], [0.42, deckY(1.76), 1.76], [-0.42, deckY(1.76), 1.76]], M.paint, 0.02, 0.014));
  for (let i = 0; i < 3; i++) { const z = 1.26 + i * 0.1; mirrored(group, () => bx(0.05, 0.012, 0.2, M.gblack, z, deckY(z) + 0.03, 0.28, 0.003, [0.197, 0, 0])); } // 引擎蓋散熱縫
  mirrored(group, () => slab([[-1.9, 1.12], [-0.98, 1.12], [-1.08, 1.05], [-1.72, 1.05]], 0.025, M.paint, 0.01, 1.08));
  const bolts = [];
  const boltAt = (z, y, x = 1.1) => { const g = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 6); g.rotateZ(Math.PI / 2); g.translate(x, y, z); bolts.push(g); };
  for (const [z, y] of [[-1.82, 1.085], [-1.4, 1.085], [-1.06, 1.085]]) boltAt(z, y);
  const boltG = merge(THREE, bolts);
  mirrored(group, () => new THREE.Mesh(boltG, M.darkChrome));
  // 後視鏡（稜角鏡座）
  mirrored(group, () => bx(0.03, 0.02, 0.12, M.gblack, 0.62, 0.93, 0.6));
  mirrored(group, () => bx(0.06, 0.07, 0.14, M.paint, 0.6, 0.95, 0.7, 0.012));

  // ── 車頭：上下兩片尖葉（上葉接續引擎蓋中脊，下葉貼地）、兩葉之間的中央 V 形護板、頭燈與日行燈 ──
  const NOSE = [0, 0.45, 2.2];
  add(plate([[-0.34, 0.58, 2.3], [0.34, 0.58, 2.3], [0.38, 0.33, 2.3], [-0.38, 0.33, 2.3]], M.grille, 0.01, 0.004, [0, 0.5, 0]));
  // 上葉：箭頭形薄片，頂面中央有稜線
  const UP = [[0, 0.5, 2.85], [0.48, 0.615, 2.05], [-0.48, 0.615, 2.05], [0, 0.665, 2.05], [0.48, 0.555, 2.05], [-0.48, 0.555, 2.05], [0, 0.54, 2.05]];
  add(new THREE.Mesh(geo(fan(UP, [[0, 1, 3], [0, 3, 2], [0, 4, 1], [0, 2, 5], [0, 6, 4], [0, 5, 6], [1, 4, 6, 3], [2, 3, 6, 5]], [0, 0.58, 2.3])), M.paint));
  // 下葉：貼地的箭頭形分流板
  const LO = [[0, 0.275, 2.78], [0.62, 0.3, 2.0], [-0.62, 0.3, 2.0], [0, 0.335, 2.0], [0.62, 0.255, 2.0], [-0.62, 0.255, 2.0], [0, 0.25, 2.0]];
  add(new THREE.Mesh(geo(fan(LO, [[0, 1, 3], [0, 3, 2], [0, 4, 1], [0, 2, 5], [0, 6, 4], [0, 5, 6], [1, 4, 6, 3], [2, 3, 6, 5]], [0, 0.29, 2.25])), M.paint));
  // 中央護板：左右兩片在中線相接成 V 形，各有三道散熱槽與鉚釘
  mirrored(group, () => plate([[0, 0.31, 2.46], [0.42, 0.32, 2.32], [0.38, 0.555, 2.3], [0, 0.555, 2.42]], M.paint, 0.04, 0, NOSE));
  for (const y of [0.385, 0.435, 0.485]) mirrored(group, () => bx(0.012, 0.026, 0.26, M.gblack, 2.388 - 0.16 * (y - 0.31), y, 0.21, 0.003, [0, 0.322, 0]));
  const rivets = [];
  for (const sx of [1, -1]) for (const [x, y] of [[0.05, 0.345], [0.36, 0.35], [0.05, 0.525], [0.34, 0.525]]) {
    const g = new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6);
    g.rotateX(Math.PI / 2);
    g.translate(sx * x, y, 2.462 - 0.333 * x - 0.16 * (y - 0.31));
    rivets.push(g);
  }
  add(new THREE.Mesh(merge(THREE, rivets), M.darkChrome));
  const heads = [], drls = [];
  mirrored(group, () => bx(0.04, 0.085, 0.29, M.gblack, 2.116, 0.53, 0.86));
  heads.push(...mirrored(group, () => bx(0.04, 0.05, 0.24, M.head, 2.128, 0.53, 0.86)));
  drls.push(...mirrored(group, () => bx(0.05, 0.012, 0.3, M.drl, 1.78, 0.83, 0.86, 0.003, [0.607, 0, 0])));        // 葉子板前緣的細燈條
  const light = makeHeadSpot(THREE, group, { y: 0.55, z: 2.2 });

  // ── 車尾：倒三角排列的三個噴口、尾燈、擴散器、後甲板人字形散熱縫、尾翼 ──
  add(plate([[-0.4, 0.93, -2.3], [0.4, 0.93, -2.3], [0.22, 0.47, -2.3], [-0.22, 0.47, -2.3]], M.gblack, 0.02, 0.004, [0, 0.7, 0]));
  const flames = [];
  const flameGeo = new THREE.CylinderGeometry(0.25, 1, 1, 20, 18, true); // 單位錐：底在 z=0（噴口），尖端在 z=-1
  flameGeo.translate(0, 0.5, 0);
  flameGeo.rotateX(-Math.PI / 2);
  for (const [x, y] of [[0.2, 0.79], [-0.2, 0.79], [0, 0.6]]) {
    const n = new THREE.Group();
    const bell = new THREE.CylinderGeometry(0.075, 0.12, 0.2, 20, 1, true);
    bell.rotateX(Math.PI / 2);
    n.add(new THREE.Mesh(bell, M.rim));
    n.add(mesh(THREE, new THREE.TorusGeometry(0.12, 0.012, 6, 20), M.darkChrome, [0, 0, -0.1]));
    const collar = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16);
    collar.rotateX(Math.PI / 2);
    n.add(mesh(THREE, collar, M.darkChrome, [0, 0, 0.09]));
    const core = new THREE.CircleGeometry(0.074, 20);
    core.rotateY(Math.PI);
    n.add(mesh(THREE, core, flame, [0, 0, 0.06]));
    for (const [hot, r, len] of [[0, 0.105, 1.25], [1, 0.055, 0.5]]) { // 外焰與內焰
      const f = new THREE.Mesh(flameGeo, new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uHot: { value: hot }, uSeed: { value: x * 17.0 + y * 31.0 + hot } },
        vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      f.position.z = -0.08;
      f.scale.set(r, r, 0.001);            // 建好時收到最短，才不會把車身的外框撐大
      f.visible = false;
      f.renderOrder = 5;
      n.add(f);
      flames.push({ mesh: f, len });
    }
    n.position.set(x, y, -2.41);
    group.add(n);
  }
  const tails = [
    ...mirrored(group, () => bx(0.03, 0.26, 0.05, M.tail, -2.325, 0.74, 1.01)),
    ...mirrored(group, () => bx(0.03, 0.03, 0.28, M.tail, -2.325, 0.86, 0.85)),
  ];
  for (const xs of [-0.3, -0.1, 0.1, 0.3]) add(slab([[-2.32, 0.3], [-1.95, 0.24], [-1.95, 0.3], [-2.32, 0.44]], 0.02, M.trim, 0.004, xs));
  for (const z of [-1.8, -1.94, -2.08]) mirrored(group, () => bx(0.04, 0.014, 0.32, M.gblack, z, deckY(z) + 0.006, 0.18, 0.003, [0, 0.35, 0]));
  mirrored(group, () => slab([[-2.0, 0.98], [-1.68, 0.98], [-2.1, 1.42], [-2.3, 1.42]], 0.04, M.gblack, 0.006, 0.36));
  add(slab([[-2.46, 1.42], [-2.02, 1.39], [-2.0, 1.42], [-2.44, 1.465]], 1.7, M.paint, 0.008));
  mirrored(group, () => slab([[-2.52, 1.32], [-1.98, 1.35], [-2.0, 1.52], [-2.5, 1.56]], 0.03, M.gblack, 0.006, 0.86));

  const wheelOpts = { spokes: 5, spokeW: [0.07, 0.05], spokeT: 0.035, concave: 0.05, rimRatio: 0.68, segments: 36, lugs: 5 };
  const wheels = placeWheels(THREE, group, M, [
    { ...FW, radius: FW.r, width: FW.w, ...wheelOpts },
    { ...RW, radius: RW.r, width: RW.w, ...wheelOpts },
  ]);

  // 噴焰動畫：車速超過約 5 km/h 點火，越快越長；停車後逐漸熄滅。回傳 true 表示還在變化，畫面要繼續更新
  let time = 0, power = 0, previewSeconds = 0;
  const animate = (dt, speedMps) => {
    time += dt;
    const target = previewSeconds > 0 ? 1 : speedMps > 1.5 ? Math.min(1, 0.4 + speedMps / 30) : 0;
    previewSeconds = Math.max(0, previewSeconds - dt);
    power += (target - power) * Math.min(1, dt * 3);
    if (Math.abs(target - power) < 0.004) power = target;
    for (const f of flames) {
      const u = f.mesh.material.uniforms;
      u.uTime.value = time; u.uPower.value = power;
      f.mesh.scale.z = Math.max(0.001, f.len * (0.3 + 0.7 * power));
      f.mesh.visible = power > 0.01;
    }
    flame.emissiveIntensity = 0.7 + 3 * power;
    return power > 0 || target > 0;
  };

  return { group, wheels, bodyMaterials: [M.paint], headlights: { meshes: heads, drl: drls, light }, taillights: tails, doors, animate, setJetPreview(on) { previewSeconds = on ? 2.5 : 0; }, meta };
}
