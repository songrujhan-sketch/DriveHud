// DriveHUD V1.6 — 戶外場景：山路與城市（白天／夜晚）。
// 全部物件放在 FX 圖層（不進入地板反射），材質不受光、顏色固定，邊緣與展示廳背景一起淡出成透明。
// 座標與車模一致：+Z 車頭、+X 車身左側、Y 向上；道路沿 Z 軸。
import * as THREE from '../../vendor/three.module.js';

const ROAD_W = 11;
const DASH_SPAN = 120;
const DASH_GAP = 10;

const EDGE_GLSL = 'float dhEdge(vec2 ndc){ vec2 q = smoothstep(vec2(1.0), vec2(0.8), abs(ndc)); return q.x * q.y; }';
/** 讓內建材質在畫面四邊淡出（與背景、地板的 edgeFade 一致）。 */
function fade(mat) {
  mat.transparent = true;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDhClip;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDhClip = gl_Position.xyw;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDhClip;\n${EDGE_GLSL}`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= dhEdge(vDhClip.xy / vDhClip.z);');
  };
  return mat;
}
const basic = (opts = {}) => fade(new THREE.MeshBasicMaterial(opts));

function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** 低多邊形山：把面法線對光的明暗直接烤進頂點色，材質不需要燈光。 */
function mountainGeometry(base, h, seg) {
  const g = new THREE.ConeGeometry(base, h, seg, 1).toNonIndexed();
  g.computeVertexNormals();
  const n = g.attributes.normal, cols = [];
  const L = new THREE.Vector3(-0.5, 0.7, 0.5).normalize();
  for (let i = 0; i < n.count; i++) {
    const k = 0.72 + 0.4 * Math.max(0, n.getX(i) * L.x + n.getY(i) * L.y + n.getZ(i) * L.z);
    cols.push(k, k, k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

function windowTexture(seed, lit) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = lit ? '#0b0d12' : '#98a2b0';
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const on = r() < 0.42, cool = r() < 0.3, alt = r() < 0.5;
    x.fillStyle = lit ? (on ? (cool ? '#cfe6ff' : '#ffdca6') : '#05070a') : (alt ? '#5d7fa6' : '#7397bf');
    x.fillRect(i * 16 + 3, j * 16 + 3, 10, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.22, 'rgba(255,214,150,0.5)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {{ layer:number, toDisplay:(hex:string)=>THREE.Color }} opts toDisplay：把想顯示的 sRGB 顏色反推成 tone mapping 前的線性色
 */
export function createScenery({ layer, toDisplay }) {
  const root = new THREE.Group();
  const outdoor = new THREE.Group(), mountain = new THREE.Group(), city = new THREE.Group();
  root.add(outdoor, mountain, city);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const flat = (w, d, m, x, y, z, order = -50) => {
    const o = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)), m);
    o.position.set(x, y, z); o.renderOrder = order; return o;
  };

  // ── 共用：路面、邊線、車道線（隨車速向後流動）──
  const mRoad = keep(basic()), mLine = keep(basic({ color: 0xffffff }));
  outdoor.add(flat(ROAD_W, 440, mRoad, 0, -0.012, 0));
  for (const s of [1, -1]) outdoor.add(flat(0.15, 440, mLine, s * (ROAD_W / 2 - 0.3), 0.004, 0, -40));
  const dashGeo = keep(new THREE.PlaneGeometry(0.12, 4).rotateX(-Math.PI / 2));
  const dashes = [];
  for (const x of [-1.8, 1.8]) for (let i = 0; i < DASH_SPAN / DASH_GAP; i++) {
    const d = new THREE.Mesh(dashGeo, mLine);
    d.position.set(x, 0.004, -DASH_SPAN / 2 + i * DASH_GAP); d.renderOrder = -40;
    outdoor.add(d); dashes.push(d);
  }
  const mStar = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
  const stars = new THREE.Group();
  {
    const r = rng(11), g = keep(new THREE.PlaneGeometry(0.7, 0.7));
    for (let i = 0; i < 80; i++) {
      const a = r() * Math.PI * 2, y = 22 + r() * 120, st = new THREE.Mesh(g, mStar);
      st.position.set(Math.cos(a) * 230, y, Math.sin(a) * 230); st.lookAt(0, y, 0); st.renderOrder = -60; stars.add(st);
    }
  }
  outdoor.add(stars);

  // ── 山路：草地、路肩、兩圈遠山 ──
  const mGrass = keep(basic()), mShoulder = keep(basic());
  const mFar = keep(basic({ vertexColors: true })), mNear = keep(basic({ vertexColors: true }));
  for (const s of [1, -1]) {
    mountain.add(flat(220, 440, mGrass, s * (110 + ROAD_W / 2), -0.02, 0));
    mountain.add(flat(1.2, 440, mShoulder, s * (ROAD_W / 2 + 0.6), -0.015, 0));
  }
  {
    const r = rng(7);
    const ring = (R, n, hMin, hMax, m, gap) => {
      for (let i = 0; i < n; i++) {
        const a = (i + r() * 0.6) / n * Math.PI * 2;
        if (gap && Math.abs(Math.cos(a)) < gap) continue; // 道路正前、正後方留空
        const h = hMin + r() * (hMax - hMin), b = h * (1.6 + r() * 1.2);
        const c = new THREE.Mesh(keep(mountainGeometry(b, h, 5 + Math.floor(r() * 3))), m);
        c.position.set(Math.cos(a) * (R + r() * 14), h / 2 - 0.5, Math.sin(a) * (R + r() * 14));
        c.rotation.y = r() * 6; c.scale.z = 0.8 + r() * 0.7; c.renderOrder = -55;
        mountain.add(c);
      }
    };
    ring(165, 64, 9, 24, mFar, 0);
    ring(120, 34, 3, 9, mNear, 0.12);
  }

  // ── 城市：人行道、路緣、沿街與後排大樓、路燈 ──
  const mPave = keep(basic()), mCurb = keep(basic());
  const tiers = [[14, 22], [18, 44], [24, 80]].map((rep, k) => {
    const day = keep(windowTexture(31 + k * 17, false)), night = keep(windowTexture(31 + k * 17, true));
    day.repeat.set(rep[0] / 4, rep[1] / 4); night.repeat.set(rep[0] / 4, rep[1] / 4);
    return { day, night, mat: keep(basic({ map: day })) };
  });
  const mPole = keep(basic()), mLamp = keep(basic());
  const glowTex = keep(glowTexture());
  const mGlow = keep(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  {
    const r = rng(23);
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), m); o.position.set(x, y, z); o.renderOrder = -50; return o; };
    for (const s of [1, -1]) {
      city.add(flat(220, 440, mPave, s * (110 + ROAD_W / 2 + 0.3), 0.12, 0));
      city.add(box(0.3, 0.16, 440, mCurb, s * (ROAD_W / 2 + 0.15), 0.06, 0));
      for (let z = -200; z < 200;) {
        const w = 14 + r() * 16, d = 14 + r() * 12, tier = r() < 0.3 ? 2 : r() < 0.6 ? 1 : 0, h = [14, 30, 56][tier] * (0.7 + r() * 0.7);
        city.add(box(d, h, w, tiers[tier].mat, s * (ROAD_W / 2 + 14 + d / 2 + r() * 8), h / 2, z + w / 2));
        z += w + 3 + r() * 6;
      }
      for (let k = 0; k < 14; k++) {
        const w2 = 18 + r() * 20, h2 = 50 + r() * 70;
        city.add(box(w2, h2, w2, tiers[2].mat, s * (75 + r() * 40), h2 / 2, -190 + k * 29 + r() * 10));
      }
      for (let lz = -90; lz <= 90; lz += 30) {
        const z = lz + s * 6, x = s * (ROAD_W / 2 + 1);
        city.add(box(0.16, 7, 0.16, mPole, x, 3.5, z));
        city.add(box(2.2, 0.1, 0.12, mPole, x - s * 1.1, 7, z));
        city.add(box(0.7, 0.08, 0.3, mLamp, x - s * 2, 6.94, z));
        const g = new THREE.Sprite(mGlow); g.scale.set(2.6, 2.6, 1); g.position.set(x - s * 2, 6.9, z); g.renderOrder = -30; city.add(g);
      }
    }
  }

  root.traverse((o) => { o.layers.set(layer); });
  root.visible = false;

  const PALETTE = {
    day: {
      road: '#2d3035', line: 0.92, grass: '#8b9a5b', shoulder: '#6f6a5e', far: '#8fa3ba', near: '#6f8262',
      pave: '#9a9da2', curb: '#7c8086', bld: 1.5, pole: '#6c7078', lamp: '#d9d6cc', glow: 0, stars: 0,
    },
    night: {
      road: '#0c0e11', line: 0.7, grass: '#10160f', shoulder: '#1a1a18', far: '#161d30', near: '#0c111c',
      pave: '#16181c', curb: '#22252b', bld: 1.7, pole: '#23262c', lamp: '#fff1d0', glow: 0.9, stars: 0.85,
    },
  };

  return {
    group: root,
    /** scene：'studio' | 'mountain' | 'city' */
    apply(scene, night) {
      const out = scene !== 'studio';
      root.visible = out;
      if (!out) return;
      mountain.visible = scene === 'mountain';
      city.visible = scene === 'city';
      const p = night ? PALETTE.night : PALETTE.day;
      mRoad.color.copy(toDisplay(p.road));
      mLine.color.setScalar(1).multiplyScalar(night ? 0.8 : 1.6); mLine.opacity = p.line;
      mGrass.color.copy(toDisplay(p.grass)); mShoulder.color.copy(toDisplay(p.shoulder));
      mFar.color.copy(toDisplay(p.far)); mNear.color.copy(toDisplay(p.near));
      mPave.color.copy(toDisplay(p.pave)); mCurb.color.copy(toDisplay(p.curb));
      mPole.color.copy(toDisplay(p.pole)); mLamp.color.copy(toDisplay(p.lamp)).multiplyScalar(night ? 3 : 1);
      for (const t of tiers) { t.mat.map = night ? t.night : t.day; t.mat.color.setScalar(p.bld); t.mat.needsUpdate = true; }
      mGlow.opacity = p.glow;
      mStar.opacity = scene === 'city' ? p.stars * 0.4 : p.stars;
      stars.visible = p.stars > 0;
    },
    /** 車道線隨車速向車尾方向流動。 */
    update(dt, speedMps) {
      if (!root.visible || !(speedMps > 0)) return;
      for (const d of dashes) {
        d.position.z -= speedMps * dt;
        if (d.position.z < -DASH_SPAN / 2) d.position.z += DASH_SPAN;
      }
    },
    dispose() { disposables.forEach((x) => x.dispose()); },
  };
}
