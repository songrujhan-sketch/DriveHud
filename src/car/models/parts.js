// DriveHUD V1.6 — 車模共用幾何工具（原創低多邊形組件）
// 座標慣例：車頭朝 +Z、上方 +Y、車身左側 +X、地面 y = 0；單位公尺。

/** 以側視輪廓 [[z, y], ...]（逆時針）建立沿 X 擠出、置中的車身幾何。 */
export function sideExtrude(THREE, pts, width, { bevel = 0.04, bevelSegments = 1, curveSegments = 6 } = {}) {
  const shape = new THREE.Shape();
  pts.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  return extrudeShapeX(THREE, shape, width, { bevel, bevelSegments, curveSegments });
}

/** 已建好的 THREE.Shape（x=z 縱向, y=高度）沿 X 擠出並置中。 */
export function extrudeShapeX(THREE, shape, width, { bevel = 0.04, bevelSegments = 1, curveSegments = 6 } = {}) {
  const depth = Math.max(0.001, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments,
  });
  g.rotateY(-Math.PI / 2); // shape.x → +Z，擠出方向 → -X
  g.translate(depth / 2, 0, 0);
  return g;
}

/** 對頂點逐一變形（v 為 Vector3，原地修改），之後重算法線（低多邊形平面著色）。 */
export function deform(THREE, geom, fn) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

/** 平面收窄：z 超出 [zRear, zFront] 後，寬度往端點逐漸縮到 endScale。 */
export function planTaper(z, { zFront, zFrontEnd, frontScale, zRear, zRearEnd, rearScale }) {
  if (z > zFront) return 1 - (1 - frontScale) * smooth((z - zFront) / (zFrontEnd - zFront));
  if (z < zRear) return 1 - (1 - rearScale) * smooth((zRear - z) / (zRear - zRearEnd));
  return 1;
}

export function box(THREE, w, h, d, mat, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

/** 左右鏡像加入：fn(side) 回傳 mesh；side = +1（左, +X）或 -1（右）。 */
export function mirrored(group, fn) {
  const out = [];
  for (const side of [1, -1]) {
    const m = fn(side);
    group.add(m);
    out.push(m);
  }
  return out;
}

/** 共用材質工廠 */
export function makeMaterials(THREE, color) {
  return {
    body: new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.32 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.2, roughness: 0.65 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0c1118, metalness: 0.6, roughness: 0.08 }),
    head: new THREE.MeshStandardMaterial({ color: 0xdfe7ef, emissive: 0xf4f8ff, emissiveIntensity: 0.05, metalness: 0.1, roughness: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x3a0606, emissive: 0xff1c1c, emissiveIntensity: 0.35, metalness: 0.1, roughness: 0.3 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.0, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 0.8, roughness: 0.3 }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.5, roughness: 0.45 }),
  };
}

/**
 * 輪胎 + 輪圈。回傳的 Mesh 為輪胎（軸向 X），輪圈細節為其子物件，
 * 因此旋轉 mesh.rotation.x 即可帶動整顆輪子。
 * side：+1 表示外側朝 +X（左輪），-1 表示外側朝 -X（右輪）。
 * style：'spoke5' | 'blade' | 'aero' | 'beadlock'
 */
export function makeWheel(THREE, mats, { radius = 0.33, width = 0.28, side = 1, style = 'spoke5', segments = 16, tread = false } = {}) {
  const r = radius, hw = width / 2, sh = Math.min(0.045, r * 0.14);
  const rimR = r * (tread ? 0.58 : 0.66);
  // 輪胎：Lathe 截面（圓角肩部）
  const prof = [
    new THREE.Vector2(rimR, -hw + 0.01),
    new THREE.Vector2(r - sh, -hw),
    new THREE.Vector2(r, -hw + sh),
    new THREE.Vector2(r, hw - sh),
    new THREE.Vector2(r - sh, hw),
    new THREE.Vector2(rimR, hw - 0.01),
  ];
  let tg = new THREE.LatheGeometry(prof, segments);
  if (tread) {
    // 塊狀胎紋：交錯的徑向段向內縮
    tg = deform(THREE, tg, (v) => {
      const rr = Math.hypot(v.x, v.z);
      if (rr > r - 0.005) {
        const a = Math.atan2(v.z, v.x);
        const k = Math.round((a / (2 * Math.PI)) * segments);
        if (k % 2 === 0) { v.x *= 0.955; v.z *= 0.955; }
      }
    });
  }
  tg.rotateZ(Math.PI / 2); // 旋轉軸 Y → X
  const tire = new THREE.Mesh(tg, mats.tire);

  const face = side * (hw - 0.03); // 輪圈外側面位置（相對輪中心）
  // 輪圈底盤（深色碟）
  const disc = new THREE.Mesh(new THREE.CircleGeometry(rimR, segments), style === 'aero' ? mats.rim : mats.rimDark);
  disc.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  disc.position.x = face - side * 0.02;
  tire.add(disc);
  // 外圈唇
  const lip = new THREE.Mesh(new THREE.RingGeometry(rimR - 0.025, rimR + 0.005, segments, 1), mats.rim);
  lip.rotation.copy(disc.rotation);
  lip.position.x = face;
  tire.add(lip);

  const spokeCount = { spoke5: 5, blade: 6, aero: 4, beadlock: 6 }[style] ?? 5;
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2;
    const len = rimR - 0.04;
    let s;
    if (style === 'aero') {
      // 低矮的弧形導流鰭：寬而薄，帶扭角
      s = new THREE.Mesh(new THREE.BoxGeometry(0.012, len * 0.85, 0.07), mats.rimDark);
      s.rotation.x = a;
      s.rotateY(0.9);
    } else if (style === 'blade') {
      s = new THREE.Mesh(new THREE.BoxGeometry(0.03, len, 0.035), mats.rim);
      s.rotation.x = a;
      s.rotateY(0.6); // 繞長軸扭轉成葉片感
    } else if (style === 'beadlock') {
      s = new THREE.Mesh(new THREE.BoxGeometry(0.04, len * 0.9, 0.07), mats.rim);
      s.rotation.x = a;
    } else {
      s = new THREE.Mesh(new THREE.BoxGeometry(0.035, len, 0.055), mats.rim);
      s.rotation.x = a;
    }
    // 讓輻條從輪轂向外延伸
    const off = new THREE.Vector3(0, len / 2, 0).applyEuler(new THREE.Euler(a, 0, 0));
    s.position.set(face - side * 0.005, off.y, off.z);
    tire.add(s);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.04, 8), mats.rim);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = face;
  tire.add(hub);
  return tire;
}

/** 前方頭燈 SpotLight（含 target），light.target 會一併加入 group。 */
export function makeHeadSpot(THREE, group, { y = 0.6, z = 2.2 } = {}) {
  const light = new THREE.SpotLight(0xf2f6ff, 0, 22, 0.55, 0.65, 1.6);
  light.position.set(0, y, z);
  light.target.position.set(0, 0, z + 8);
  group.add(light);
  group.add(light.target);
  return light;
}

export function countTriangles(object) {
  let n = 0;
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

/**
 * 組出車身側視輪廓：top 為從車頭底部經車頂到車尾底部的點（z 遞減），
 * 底邊由車尾回到車頭，並在每個 wheelZ 處挖出輪拱。
 * archStyle：'round' | 'angular'
 */
export function bodyProfile(top, { wheelZ, archR, wheelY, clearance, archStyle = 'round', archSegs = 6 }) {
  const pts = top.slice();
  const zs = wheelZ.slice().sort((a, b) => a - b);
  for (const zc of zs) {
    pts.push([zc - archR, clearance]);
    if (archStyle === 'angular') {
      const h = wheelY + archR * 0.92;
      pts.push([zc - archR * 0.98, wheelY + archR * 0.35]);
      pts.push([zc - archR * 0.62, h]);
      pts.push([zc + archR * 0.62, h]);
      pts.push([zc + archR * 0.98, wheelY + archR * 0.35]);
    } else {
      for (let i = 0; i <= archSegs; i++) {
        const t = Math.PI - (i / archSegs) * Math.PI;
        pts.push([zc + Math.cos(t) * archR, Math.max(clearance, wheelY + Math.sin(t) * archR)]);
      }
    }
    pts.push([zc + archR, clearance]);
  }
  return pts;
}
