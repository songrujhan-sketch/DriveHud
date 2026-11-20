// DriveHUD V1.6 — 車模視圖（Worker B）
// createCarView(canvas, { model, color, headlights, darkMode, compact })
//   → { setSpeedKmh, setColor, setHeadlights, setModel, setCompact, setDarkMode, resize, dispose, getInfo }
// 固定視角：相機位於車頭左前方 45°、略高於車頂，看向車身中心；不提供旋轉。
// 背景透明（alpha:true），底色由頁面 CSS 決定。不開 shadow map；pixelRatio 上限 2。
import * as THREE from '../../vendor/three.module.js';
import { MODELS, getModel } from './models/index.js';
import { countTriangles } from './models/parts.js';

const WHEEL_RADIUS_M = 0.33; // 輪徑 0.66 m
const COMPACT_SCALE = 0.4;
const COMPACT_MS = 280;
const MAX_PIXEL_RATIO = 2;

const LIGHTING = {
  light: { hemi: 1.05, env: 1.0, key: 2.4, rim: 0.9, shadow: 'rgba(0,0,0,0.55)' },
  dark: { hemi: 0.55, env: 0.55, key: 1.7, rim: 0.7, shadow: 'rgba(0,0,0,0.85)' },
};

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 以少量幾何建立簡易攝影棚環境貼圖（只產生一次）。 */
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const skyG = new THREE.SphereGeometry(10, 16, 8);
  const cols = [];
  const p = skyG.attributes.position;
  const top = new THREE.Color(0xdfe6ee), mid = new THREE.Color(0x8a939e), bot = new THREE.Color(0x26292d);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 10;
    const c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, -y);
    cols.push(c.r, c.g, c.b);
  }
  skyG.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const a = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), panel);
  a.position.set(0, 7, 0); a.rotation.x = Math.PI / 2; env.add(a);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(3, 5), panel);
  b.position.set(7, 2, 5); b.lookAt(0, 0, 0); env.add(b);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.04);
  pm.dispose();
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt;
}

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    if (o.isLight && o.dispose) o.dispose();
  });
}

export function createCarView(canvas, opts = {}) {
  const state = {
    modelId: getModel(opts.model).id,
    color: opts.color || '#c8102e',
    headlights: !!opts.headlights,
    darkMode: !!opts.darkMode,
    compact: !!opts.compact,
    speedMps: 0,
    compactT: opts.compact ? 1 : 0, // 0 = 全尺寸，1 = compact
    triangles: 0,
  };

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));

  const scene = new THREE.Scene();
  const envRT = buildEnvironment(renderer);
  scene.environment = envRT.texture;

  const hemi = new THREE.HemisphereLight(0xeef3ff, 0x30302c, 1);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(5, 8, 6);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 1);
  rim.position.set(-6, 4, -7);
  scene.add(hemi, key, rim);

  // 地面柔和陰影（非 shadow map，貼圖）
  const shadowTex = radialTexture([[0, '#ffffff'], [0.55, 'rgba(255,255,255,0.65)'], [1, 'rgba(255,255,255,0)']]);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  shadow.renderOrder = -1;
  scene.add(shadow);

  // 頭燈照地光暈（開燈時顯示）
  const poolTex = radialTexture([[0, 'rgba(255,250,235,0.55)'], [0.6, 'rgba(255,250,235,0.18)'], [1, 'rgba(255,250,235,0)']]);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.01;
  pool.visible = false;
  scene.add(pool);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  let car = null; // build() 的回傳值
  let carBox = new THREE.Box3();

  function fitCamera() {
    if (!car) return;
    const center = carBox.getCenter(new THREE.Vector3());
    const roofY = carBox.max.y;
    const corners = [];
    for (const x of [carBox.min.x, carBox.max.x])
      for (const y of [carBox.min.y, carBox.max.y])
        for (const z of [carBox.min.z, carBox.max.z]) corners.push(new THREE.Vector3(x, y, z));
    // 把車頭前方的頭燈照地區也納入取景，避免 compact 時被視窗硬切
    for (const x of [carBox.min.x * 0.6, carBox.max.x * 0.6]) corners.push(new THREE.Vector3(x, 0, carBox.max.z + 1.3));
    const camY = roofY + 0.75; // 略高於車頂
    const az = Math.PI / 4; // 車頭(+Z)左側(+X) 45°
    let d = 9;
    for (let iter = 0; iter < 6; iter++) {
      camera.position.set(center.x + d * Math.sin(az), camY, center.z + d * Math.cos(az));
      camera.lookAt(center);
      camera.updateMatrixWorld();
      let ext = 0;
      for (const c of corners) {
        const p = c.clone().project(camera);
        ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y));
      }
      d *= ext / 0.86;
    }
    camera.position.set(center.x + d * Math.sin(az), camY, center.z + d * Math.cos(az));
    camera.lookAt(center);
  }

  function placeGroundFx() {
    const size = carBox.getSize(new THREE.Vector3());
    shadow.scale.set(size.x * 1.35, size.z * 1.18, 1);
    shadow.position.x = (carBox.min.x + carBox.max.x) / 2;
    shadow.position.z = (carBox.min.z + carBox.max.z) / 2;
    pool.scale.set(size.x * 1.1, 1.9, 1);
    pool.position.set(0, 0.01, carBox.max.z + 0.6);
  }

  function applyHeadlights() {
    if (!car) return;
    const on = state.headlights;
    const hm = new Set(car.headlights.meshes.map((m) => m.material));
    hm.forEach((m) => { m.emissiveIntensity = on ? 2.4 : 0.05; });
    const tm = new Set(car.taillights.map((m) => m.material));
    tm.forEach((m) => { m.emissiveIntensity = on ? 1.6 : 0.35; });
    car.headlights.light.intensity = on ? 45 : 0;
    pool.visible = on;
  }

  function applyColor() {
    if (!car) return;
    car.bodyMaterials.forEach((m) => m.color.set(state.color));
  }

  function applyDarkMode() {
    const L = state.darkMode ? LIGHTING.dark : LIGHTING.light;
    hemi.intensity = L.hemi;
    scene.environmentIntensity = L.env;
    key.intensity = L.key;
    rim.intensity = L.rim;
    const c = new THREE.Color();
    const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(L.shadow);
    c.setRGB(m[1] / 255, m[2] / 255, m[3] / 255, THREE.SRGBColorSpace);
    shadowMat.color.copy(c);
    shadowMat.opacity = parseFloat(m[4]);
  }

  function loadModel(id) {
    const def = getModel(id);
    if (car) {
      scene.remove(car.group);
      disposeObject(car.group);
    }
    car = def.build(THREE, { color: state.color });
    state.modelId = def.id;
    scene.add(car.group);
    car.group.updateMatrixWorld(true);
    carBox = new THREE.Box3().setFromObject(car.group, true);
    state.triangles = countTriangles(car.group);
    applyColor();
    applyHeadlights();
    placeGroundFx();
    fitCamera();
  }

  // ── 尺寸與 compact 視窗 ──
  let cssW = 0, cssH = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    cssW = w; cssH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
    kick();
  }

  function viewportRect() {
    const t = state.compactT;
    const e = t * t * (3 - 2 * t);
    const s = 1 - (1 - COMPACT_SCALE) * e;
    const vw = cssW * s, vh = cssH * s;
    const margin = Math.min(cssW, cssH) * 0.03 * e;
    return { x: cssW - vw - margin, y: margin, w: vw, h: vh }; // 原點左下：靠右下
  }

  // ── 動畫迴圈：畫面不可見時暫停；靜止且無變化時也停 ──
  let raf = 0, lastT = 0, dirty = true, inView = true, disposed = false;
  const pageVisible = () => typeof document === 'undefined' || !document.hidden;

  function needsFrames() {
    const target = state.compact ? 1 : 0;
    return state.speedMps > 0 || state.compactT !== target || dirty;
  }

  function frame(now) {
    raf = 0;
    if (disposed || !inView || !pageVisible()) { lastT = 0; return; }
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;

    if (car && state.speedMps > 0) {
      const omega = state.speedMps / WHEEL_RADIUS_M;
      for (const w of car.wheels) w.rotation.x = (w.rotation.x + omega * dt) % (Math.PI * 2);
    }
    const target = state.compact ? 1 : 0;
    if (state.compactT !== target) {
      const step = dt * 1000 / COMPACT_MS;
      state.compactT = target > state.compactT ? Math.min(target, state.compactT + step) : Math.max(target, state.compactT - step);
    }

    if (cssW && cssH) {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, cssW, cssH);
      renderer.clear();
      const r = viewportRect();
      renderer.setViewport(r.x, r.y, r.w, r.h);
      renderer.render(scene, camera);
    }
    dirty = false;
    if (needsFrames()) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }

  function kick() {
    dirty = true;
    if (!raf && !disposed && inView && pageVisible()) raf = requestAnimationFrame(frame);
  }

  let io = null;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      if (inView) kick();
    });
    io.observe(canvas);
  }
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
  }
  const onVis = () => { if (pageVisible()) kick(); };
  document.addEventListener('visibilitychange', onVis);

  // ── 初始化 ──
  applyDarkMode();
  loadModel(state.modelId);
  canvas.classList.toggle('car-compact', state.compact);
  resize();
  kick();

  return {
    setSpeedKmh(v) {
      const k = Number(v);
      state.speedMps = Number.isFinite(k) && k > 0 ? k / 3.6 : 0;
      kick();
    },
    setColor(hex) { state.color = hex; applyColor(); kick(); },
    setHeadlights(on) { state.headlights = !!on; applyHeadlights(); kick(); },
    setModel(id) { loadModel(id); kick(); },
    setCompact(on) {
      state.compact = !!on;
      canvas.classList.toggle('car-compact', state.compact);
      kick();
    },
    setDarkMode(on) { state.darkMode = !!on; applyDarkMode(); kick(); },
    resize,
    getInfo() {
      return { model: state.modelId, triangles: state.triangles, compact: state.compact, speedMps: state.speedMps, models: MODELS.map((m) => m.id) };
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (car) { scene.remove(car.group); disposeObject(car.group); car = null; }
      disposeObject(scene);
      shadowTex.dispose();
      poolTex.dispose();
      envRT.dispose();
      renderer.dispose();
    },
  };
}
