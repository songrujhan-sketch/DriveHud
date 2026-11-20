// DriveHUD V1.6 — 車模共用組件：材質、程序貼圖、輪組、燈具、後視鏡等（全部原創幾何）。
// 座標慣例：車頭朝 +Z、上方 +Y、車身左側 +X、地面 y = 0；單位公尺。

const texCache = new Map();

function canvasTex(THREE, key, size, draw, { srgb = true, repeat = 1 } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** 車漆金屬片：微小隨機法線（tangent-space normal map）。 */
function flakeNormal(THREE) {
  return canvasTex(THREE, 'flake', 128, (g, n) => {
    const img = g.createImageData(n, n);
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n * n; i++) {
      const x = rnd() * 2 - 1, y = rnd() * 2 - 1;
      img.data[i * 4] = 128 + x * 70;
      img.data[i * 4 + 1] = 128 + y * 70;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat: 5 });
}

/** 碳纖維斜紋。 */
function carbonMap(THREE) {
  return canvasTex(THREE, 'carbon', 64, (g, n) => {
    const q = n / 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const k = (x + y) % 4 < 2;
        const grd = k ? g.createLinearGradient(x * q, 0, x * q + q, 0) : g.createLinearGradient(0, y * q, 0, y * q + q);
        grd.addColorStop(0, '#16181b');
        grd.addColorStop(0.5, k ? '#34383e' : '#2a2d32');
        grd.addColorStop(1, '#121315');
        g.fillStyle = grd;
        g.fillRect(x * q, y * q, q, q);
      }
    }
  }, { repeat: 6 });
}

/** 煞車碟：通風打孔 + 深色碟帽。 */
function rotorMap(THREE) {
  return canvasTex(THREE, 'rotor', 128, (g, n) => {
    const c = n / 2;
    g.fillStyle = '#6b6f74';
    g.fillRect(0, 0, n, n);
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, '#3a3d41'); grd.addColorStop(0.42, '#3a3d41'); grd.addColorStop(0.45, '#9a9ea3');
    grd.addColorStop(0.8, '#b8bcc1'); grd.addColorStop(1, '#8a8e93');
    g.fillStyle = grd;
    g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#26282b';
    for (let i = 0; i < 30; i++) {
      for (const rr of [0.58, 0.7, 0.82]) {
        const a = (i / 30) * Math.PI * 2 + rr * 3;
        g.beginPath(); g.arc(c + Math.cos(a) * c * rr, c + Math.sin(a) * c * rr, 1.6, 0, Math.PI * 2); g.fill();
      }
    }
  });
}

/** 蜂巢網格（進氣口／水箱罩）。 */
function meshMap(THREE) {
  return canvasTex(THREE, 'honeycomb', 64, (g, n) => {
    g.fillStyle = '#050506';
    g.fillRect(0, 0, n, n);
    g.strokeStyle = '#3c4046';
    g.lineWidth = 2;
    const r = n / 8;
    for (let row = -1; row < 6; row++) {
      for (let col = -1; col < 6; col++) {
        const cx = col * r * 1.75 + (row % 2 ? r * 0.875 : 0), cy = row * r * 1.5;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.closePath(); g.stroke();
      }
    }
  }, { repeat: 14 });
}

/** 共用材質工廠（每台車一組，換車時一併 dispose）。 */
export function makeMaterials(THREE, color, { rim = 0x2b2f35, rimMetal = 0.9, rimRough = 0.28, caliper = 0xd8d8d8 } = {}) {
  const flake = flakeNormal(THREE);
  const paint = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.6, roughness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.03,
    normalMap: flake, normalScale: new THREE.Vector2(0.18, 0.18),
  });
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    paint,
    gblack: new THREE.MeshPhysicalMaterial({ color: 0x060708, metalness: 0.2, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
    trim: std({ color: 0x141518, metalness: 0.15, roughness: 0.62 }),
    under: std({ color: 0x0a0a0b, metalness: 0.0, roughness: 0.95 }),
    gap: std({ color: 0x010101, metalness: 0.0, roughness: 1.0 }),
    chrome: std({ color: 0xe6e9ee, metalness: 1.0, roughness: 0.08 }),
    darkChrome: std({ color: 0x3a3e44, metalness: 1.0, roughness: 0.22 }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbonMap(THREE), metalness: 0.35, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06 }),
    grille: std({ color: 0xffffff, map: meshMap(THREE), metalness: 0.4, roughness: 0.55 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1118, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.1 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.0, roughness: 0.02, transparent: true, opacity: 0.22, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 1.8 }),
    housing: std({ color: 0x1d2024, metalness: 1.0, roughness: 0.18 }),
    head: std({ color: 0xffffff, emissive: 0xeef4ff, emissiveIntensity: 0.1, metalness: 0.0, roughness: 0.3 }),
    drl: std({ color: 0xffffff, emissive: 0xe8f1ff, emissiveIntensity: 1.2, metalness: 0.0, roughness: 0.3 }),
    tail: std({ color: 0x2a0303, emissive: 0xff1a12, emissiveIntensity: 0.6, metalness: 0.1, roughness: 0.35 }),
    tire: std({ color: 0x151515, metalness: 0.0, roughness: 0.82 }),
    rim: std({ color: rim, metalness: rimMetal, roughness: rimRough, side: THREE.DoubleSide }),
    rimAccent: std({ color: 0x0c0d0f, metalness: 0.4, roughness: 0.35 }),
    rotor: std({ color: 0xffffff, map: rotorMap(THREE), metalness: 0.9, roughness: 0.42 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: caliper, metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }),
  };
}

/** 依 key 陣列產生多材質 Mesh。 */
export function multiMesh(THREE, { geometry, keys }, M) {
  return new THREE.Mesh(geometry, keys.map((k) => M[k] || M.paint));
}

/** 簡易幾何合併（position/normal/uv，全部轉成非索引）。 */
export function merge(THREE, geoms) {
  const pos = [], nor = [], uv = [];
  for (let g of geoms) {
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array);
    else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/** 倒角方塊（ExtrudeGeometry + bevel），置中。 */
export function roundBox(THREE, w, h, d, r = 0.01, seg = 2) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const s = new THREE.Shape();
  const x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: 1 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}

/** 側視 shape 沿 X 擠出、置中（shape.x → +Z，shape.y → +Y）。 */
export function extrudeX(THREE, shape, width, { bevel = 0.01, bevelSegments = 2, curveSegments = 8 } = {}) {
  const depth = Math.max(0.001, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments, curveSegments });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return g;
}

/** 依點列 [[x,y],...] 建 Shape。 */
export function shapeOf(THREE, pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

export function mesh(THREE, geom, mat, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
  const m = new THREE.Mesh(geom, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

/** 左右鏡像：fn(side) 回傳 Object3D（以 +X 側設計）；右側以 scale.x = -1 鏡像。 */
export function mirrored(group, fn) {
  const out = [];
  for (const side of [1, -1]) {
    const o = fn(side);
    if (side < 0 && !o.userData.noMirror) { o.position.x *= -1; o.rotation.y *= -1; o.rotation.z *= -1; o.scale.x *= -1; }
    group.add(o);
    out.push(o);
  }
  return out;
}

/**
 * 輪組：輪胎（含胎紋與側壁）、輪圈桶、5–7 輻、輪轂與螺帽、煞車碟（隨輪轉）＋ 卡鉗（不隨輪轉）。
 * 以 +X 為外側設計；右側輪由呼叫端設 scale.x = -1。
 * 回傳 { wheel, caliper }：wheel 為旋轉物件（rotation.x），caliper 為固定物件。
 */
export function makeWheel(THREE, M, {
  radius = 0.34, width = 0.28, rimRatio = 0.7, spokes = 5, spokeW = [0.06, 0.035], spokeT = 0.03, concave = 0.04,
  segments = 44, tread = 'road', twin = false, aeroCover = false, lugs = 5, caliperUp = 0.55,
} = {}) {
  const R = radius, hw = width / 2, rimR = R * rimRatio;
  const face = hw - 0.012; // 輪圈外緣平面
  const wheel = new THREE.Group();
  wheel.name = 'wheel';

  // ── 輪胎：Lathe 截面（軸向 = Y，之後轉到 X）──
  const prof = [];
  const side = (sgn) => {
    // 由胎唇到胎肩（sgn=-1 內側；+1 外側）
    const pts = [
      [rimR + 0.004, sgn * (hw - 0.02)],
      [rimR + 0.03, sgn * (hw + 0.002)],
      [rimR + (R - rimR) * 0.45, sgn * (hw + 0.012)],
      [R - 0.045, sgn * (hw + 0.006)],
      [R - 0.016, sgn * (hw - 0.012)],
      [R - 0.003, sgn * (hw - 0.032)],
    ];
    return sgn < 0 ? pts : pts.reverse();
  };
  prof.push(...side(-1));
  const grooves = tread === 'offroad' ? [-0.3, 0.0, 0.3] : [-0.28, 0.0, 0.28];
  for (const gq of grooves) {
    const gz = gq * hw * 2 * 0.5;
    prof.push([R, gz - 0.016], [R - 0.012, gz - 0.009], [R - 0.012, gz + 0.009], [R, gz + 0.016]);
  }
  prof.push(...side(1));
  let tg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  if (tread === 'offroad') {
    // 塊狀胎紋：交錯的外胎面區塊向內退
    const p = tg.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const rr = Math.hypot(v.x, v.z);
      if (rr > R - 0.02) {
        const a = Math.atan2(v.z, v.x);
        const k = Math.floor(((a / (2 * Math.PI)) + 1) * segments + 0.5) % segments;
        const half = v.y > 0 ? 1 : 0;
        if ((k + half) % 2 === 0) { const s = (rr - 0.022) / rr; v.x *= s; v.z *= s; }
        p.setXYZ(i, v.x, v.y, v.z);
      }
    }
    tg.computeVertexNormals();
  }
  tg.rotateZ(-Math.PI / 2); // 軸 Y → X
  wheel.add(new THREE.Mesh(tg, M.tire));

  // ── 輪圈桶 + 外唇 ──
  const barrel = [
    [rimR - 0.03, -hw + 0.03], [rimR - 0.005, -hw + 0.02], [rimR - 0.012, -hw + 0.05], [rimR - 0.02, face - 0.05],
    [rimR - 0.014, face - 0.02], [rimR - 0.004, face - 0.004], [rimR + 0.014, face], [rimR + 0.016, face - 0.012],
  ];
  const bg = new THREE.LatheGeometry(barrel.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  bg.rotateZ(-Math.PI / 2);
  wheel.add(new THREE.Mesh(bg, M.rim));
  // 輪圈底盤（深色，遮住輪內）
  const back = new THREE.CircleGeometry(rimR - 0.015, 24);
  back.rotateY(Math.PI / 2);
  back.translate(-hw + 0.04, 0, 0);
  wheel.add(new THREE.Mesh(back, M.under));

  // ── 輻條：擠出梯形，向內凹（concave）──
  const hubR = 0.075;
  const L = rimR - 0.012 - hubR;
  const spokeGeoms = [];
  const mkSpoke = (w0, w1, angle, tilt = 0) => {
    const s = new THREE.Shape();
    s.moveTo(-w0 / 2, 0); s.lineTo(w0 / 2, 0); s.lineTo(w1 / 2, L); s.lineTo(-w1 / 2, L); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: spokeT, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, hubR, -spokeT); // 外表面在 z=0
    g.rotateY(Math.PI / 2); // z → x（外表面 x=0），切向 → -z
    if (tilt) g.rotateY(tilt);
    // 凹面：外端在 face，輪轂端往內
    const phi = Math.atan2(concave, L);
    g.rotateZ(-phi);
    g.translate(face - 0.008 - concave * 0.15, 0, 0);
    g.rotateX(angle);
    spokeGeoms.push(g);
  };
  const [w0, w1] = spokeW;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    if (twin) {
      mkSpoke(w0 * 0.55, w1 * 0.55, a - 0.075);
      mkSpoke(w0 * 0.55, w1 * 0.55, a + 0.075);
    } else mkSpoke(w0, w1, a);
  }
  wheel.add(new THREE.Mesh(merge(THREE, spokeGeoms), M.rim));
  spokeGeoms.forEach((g) => g.dispose());

  if (aeroCover) {
    // 空力輪蓋：輻條間的深色半透明蓋板（略內凹的圓盤），提升空力感
    const cover = new THREE.LatheGeometry([
      new THREE.Vector2(hubR + 0.01, face - concave - 0.012), new THREE.Vector2(rimR * 0.6, face - concave * 0.55 - 0.012),
      new THREE.Vector2(rimR - 0.02, face - 0.02),
    ], segments);
    cover.rotateZ(-Math.PI / 2);
    wheel.add(new THREE.Mesh(cover, M.rimAccent));
  }

  // ── 輪轂、中心蓋、螺帽 ──
  const hub = new THREE.LatheGeometry([
    new THREE.Vector2(0.0, face - concave + 0.012), new THREE.Vector2(0.03, face - concave + 0.01), new THREE.Vector2(0.05, face - concave + 0.002),
    new THREE.Vector2(hubR + 0.004, face - concave - 0.01), new THREE.Vector2(hubR + 0.004, face - concave - 0.04),
  ], 20);
  hub.rotateZ(-Math.PI / 2);
  wheel.add(new THREE.Mesh(hub, M.rim));
  const lugG = [];
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2 + 0.3;
    const g = new THREE.CylinderGeometry(0.011, 0.012, 0.025, 6);
    g.rotateZ(-Math.PI / 2);
    g.translate(face - concave - 0.0, Math.cos(a) * 0.052, Math.sin(a) * 0.052);
    lugG.push(g);
  }
  wheel.add(new THREE.Mesh(merge(THREE, lugG), M.chrome));
  lugG.forEach((g) => g.dispose());

  // ── 煞車碟（隨輪轉） ──
  const rd = rimR - 0.05;
  const disc = new THREE.CylinderGeometry(rd, rd, 0.028, 40, 1);
  disc.rotateZ(-Math.PI / 2);
  const discX = face - concave - 0.07;
  disc.translate(discX, 0, 0);
  wheel.add(new THREE.Mesh(disc, M.rotor));

  // ── 卡鉗（固定，不隨輪轉）：環形扇段擠出 ──
  const cs = new THREE.Shape();
  const span = 0.62, r0 = rd - 0.065, r1 = rd + 0.014;
  cs.absarc(0, 0, r1, -span / 2, span / 2, false);
  cs.absarc(0, 0, r0, span / 2, -span / 2, true);
  cs.closePath();
  const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 8 });
  cg.translate(0, 0, -0.025);
  cg.rotateY(Math.PI / 2); // 擠出方向 → X；扇段中心朝 -Z（輪軸後方）
  cg.rotateX(caliperUp); // 往上轉
  cg.translate(discX + 0.012, 0, 0);
  const caliper = new THREE.Mesh(cg, M.caliper);
  return { wheel, caliper };
}

/** 後視鏡：水滴形殼體（車身色）+ 鏡面 + 支臂。以 +X 側設計。 */
export function makeMirror(THREE, M, { len = 0.2, h = 0.085, w = 0.11, arm = 0.1, armMat } = {}) {
  const g = new THREE.Group();
  const shell = new THREE.SphereGeometry(1, 14, 10);
  shell.scale(len / 2, h / 2, w / 2);
  // 前緣圓、後緣平：把 z<0 的半邊壓扁
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) p.setZ(i, p.getZ(i) * 0.35);
  shell.computeVertexNormals();
  const housing = new THREE.Mesh(shell, M.paint);
  housing.position.set(arm + len * 0.42, 0, 0);
  g.add(housing);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(1, 16), M.chrome);
  glass.scale.set(len * 0.44, h * 0.42, 1);
  glass.rotation.y = Math.PI;
  glass.position.set(arm + len * 0.42, 0, -w * 0.16);
  g.add(glass);
  const armM = new THREE.Mesh(roundBox(THREE, arm + 0.04, 0.022, 0.045, 0.008), armMat || M.gblack);
  armM.position.set(arm / 2, -0.012, 0);
  g.add(armM);
  return g;
}

/** 前方頭燈 SpotLight（含 target），light.target 會一併加入 group。 */
export function makeHeadSpot(THREE, group, { y = 0.6, z = 2.2 } = {}) {
  const light = new THREE.SpotLight(0xf2f6ff, 0, 18, 0.62, 0.7, 1.4);
  light.position.set(0, y, z);
  light.target.position.set(0, 0, z + 6);
  group.add(light);
  group.add(light.target);
  return light;
}

export function countTriangles(object) {
  let n = 0;
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.visible) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

/** 放置 4 輪與卡鉗；wheels: [{z, x, ...opts}]。回傳旋轉陣列。 */
export function placeWheels(THREE, group, M, defs) {
  const wheels = [];
  const cache = new Map();
  for (const d of defs) {
    const key = JSON.stringify({ ...d, x: 0, z: 0 });
    let proto = cache.get(key);
    if (!proto) { proto = makeWheel(THREE, M, d); cache.set(key, proto); }
    for (const s of [1, -1]) {
      const w = proto.wheel.clone(); // 共享幾何
      w.position.set(s * d.x, d.radius, d.z);
      if (s < 0) w.scale.x = -1;
      group.add(w);
      wheels.push(w);
      const c = proto.caliper.clone();
      c.position.copy(w.position);
      if (s < 0) c.scale.x = -1;
      // 前輪卡鉗在輪軸後上方、後輪在前上方（以 z 鏡像）
      if (d.z < 0) c.scale.z = -1;
      group.add(c);
    }
  }
  return wheels;
}
