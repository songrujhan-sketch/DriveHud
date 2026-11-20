// DriveHUD V1.6 — 車模視圖（Worker B / B2 展示廳升級）
// createCarView(canvas, { model, color, headlights, darkMode, compact, quality })
//   → { setSpeedKmh, setColor, setHeadlights, setModel, setCompact, setDarkMode, resize, dispose, getInfo }
//   （額外：setQuality('high'|'low')，供之後 config 切換；不影響既有介面）
// 固定視角：相機位於車頭左前方 45°、略高於車頂，看向車身中心；不提供旋轉。
// quality 'high'（預設）：反射地板 + 半解析度 Bloom + ACES；'low'：關閉後處理與反射。
// 背景為展示廳漸層（四邊淡出成透明），compact 時縮成右上角小視窗；pixelRatio 上限 2。
import * as THREE from '../../vendor/three.module.js';
import { MODELS, getModel } from './models/index.js';
import { countTriangles } from './models/parts.js';
import { createStage } from './stage.js';

const WHEEL_RADIUS_M = 0.33; // 輪徑 0.66 m（以此換算角速度）
// 視角方位角（由車頭 +Z 起算、朝車身左側 +X 為正）：前 45°、後 45°、正後方
const VIEW_AZ = { front: Math.PI / 4, rear: Math.PI * 3 / 4, back: Math.PI };
const VIEW_SPEED = 3.2; // 視角轉換的角速度（rad/s）
const COMPACT_SCALE = 0.4;
const COMPACT_MS = 280;
const DOOR_MS = 700;
const MAX_PIXEL_RATIO = 2;

function disposeObject(root) {
  const mats = new Set();
  const geos = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    if (o.isLight && o.dispose) o.dispose();
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
}

export function createCarView(canvas, opts = {}) {
  const state = {
    modelId: getModel(opts.model).id,
    color: opts.color || '#c8102e',
    headlights: !!opts.headlights,
    darkMode: !!opts.darkMode,
    compact: !!opts.compact,
    quality: opts.quality === 'low' ? 'low' : 'high',
    view: VIEW_AZ[opts.view] != null ? opts.view : 'front',
    scene: ['studio', 'mountain', 'city'].includes(opts.scene) ? opts.scene : 'studio',
    time: ['auto', 'day', 'night'].includes(opts.time) ? opts.time : 'auto',
    az: VIEW_AZ[opts.view] != null ? VIEW_AZ[opts.view] : VIEW_AZ.front,
    speedMps: 0,
    doorsOpen: false,
    doorT: 0, // 0 = 關，1 = 全開
    compactT: opts.compact ? 1 : 0, // 0 = 全尺寸，1 = compact
    triangles: 0,
  };

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.info.autoReset = false; // 一幀含多個 pass：手動歸零，getInfo 才是整幀統計

  const stage = createStage(renderer, { quality: state.quality });
  const { scene, camera } = stage;
  let car = null; // build() 的回傳值
  let carBox = new THREE.Box3();

  function fitCamera() {
    if (!car) return;
    const center = carBox.getCenter(new THREE.Vector3());
    const size = carBox.getSize(new THREE.Vector3());
    const corners = [];
    for (const x of [carBox.min.x, carBox.max.x])
      for (const y of [0, carBox.max.y])
        for (const z of [carBox.min.z, carBox.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const camY = stage.outdoor ? carBox.max.y * 0.95 : carBox.max.y + 0.45; // 展示間略高於車頂；戶外壓低，讓出天空
    const az = state.az;
    const target = new THREE.Vector3(center.x, size.y * 0.36, center.z + size.z * 0.04);
    let d = 9;
    const place = () => {
      camera.position.set(target.x + d * Math.sin(az), camY, target.z + d * Math.cos(az));
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };
    for (let iter = 0; iter < 8; iter++) {
      place();
      let ex = 0, ey = 0;
      for (const c of corners) {
        const p = c.clone().project(camera);
        ex = Math.max(ex, Math.abs(p.x));
        ey = Math.max(ey, Math.abs(p.y));
      }
      // 車輛偏大：水平佔 90%、垂直佔 78%（下方留給地面反射）；戶外縮小一些，留出場景
      d *= Math.max(ex / (stage.outdoor ? 0.78 : 0.9), ey / (stage.outdoor ? 0.6 : 0.78));
    }
    place();
    if (stage.outdoor) { // 地平線：沿視線水平方向極遠處、高度 0 的點
      const f = new THREE.Vector3(target.x - camera.position.x, 0, target.z - camera.position.z).normalize();
      const h = new THREE.Vector3(camera.position.x + f.x * 5000, 0, camera.position.z + f.z * 5000).project(camera);
      stage.setHorizon(h.y);
    }
  }

  function applyHeadlights() {
    if (!car) return;
    const on = state.headlights;
    new Set(car.headlights.meshes.map((m) => m.material)).forEach((m) => { m.emissiveIntensity = on ? 7.0 : 0.08; });
    new Set((car.headlights.drl || []).map((m) => m.material)).forEach((m) => { m.emissiveIntensity = on ? 5.0 : 1.4; });
    new Set(car.taillights.map((m) => m.material)).forEach((m) => { m.emissiveIntensity = on ? 4.0 : 0.7; });
    car.headlights.light.intensity = on ? 40 : 0;
    stage.setHeadlights(on);
  }

  function applyDoors() {
    if (!car || !car.doors) return;
    const e = state.doorT * state.doorT * (3 - 2 * state.doorT);
    for (const d of car.doors) d.pivot.quaternion.setFromAxisAngle(d.axis, d.sign * d.max * e);
  }

  function applyColor() {
    if (!car) return;
    car.bodyMaterials.forEach((m) => m.color.set(state.color));
  }

  // 時段「自動」跟隨頁面明暗；頁面明暗另外決定畫面外圈的收斂色
  function applyDarkMode() {
    const night = state.time === 'auto' ? state.darkMode : state.time === 'night';
    stage.setLook({ scene: state.scene, night, pageDark: state.darkMode });
    fitCamera();
  }

  function loadModel(id) {
    const def = getModel(id);
    if (car) {
      scene.remove(car.group);
      disposeObject(car.group);
    }
    car = def.build(THREE, { color: state.color });
    state.doorsOpen = false;
    state.doorT = 0;
    state.modelId = def.id;
    scene.add(car.group);
    car.group.updateMatrixWorld(true);
    carBox = new THREE.Box3().setFromObject(car.group, true);
    state.triangles = countTriangles(car.group);
    applyColor();
    applyHeadlights();
    stage.setCar(car.group, carBox);
    fitCamera();
  }

  // ── 尺寸與 compact 視窗 ──
  let cssW = 0, cssH = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    cssW = w; cssH = h;
    stage.setSize(w, h, pr);
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
    return state.speedMps > 0 || state.compactT !== target || state.az !== VIEW_AZ[state.view] || state.doorT !== (state.doorsOpen ? 1 : 0) || dirty;
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
    const azTarget = VIEW_AZ[state.view];
    if (state.az !== azTarget) { // 視角轉換
      const step = VIEW_SPEED * dt, diff = azTarget - state.az;
      state.az = Math.abs(diff) <= step ? azTarget : state.az + Math.sign(diff) * step;
      fitCamera();
    }
    const doorTarget = state.doorsOpen ? 1 : 0;
    if (car && car.doors && state.doorT !== doorTarget) { // 車門開合
      const step = dt * 1000 / DOOR_MS;
      state.doorT = doorTarget > state.doorT ? Math.min(1, state.doorT + step) : Math.max(0, state.doorT - step);
      applyDoors();
    }
    stage.update(dt, state.speedMps);
    const target = state.compact ? 1 : 0;
    if (state.compactT !== target) {
      const step = dt * 1000 / COMPACT_MS;
      state.compactT = target > state.compactT ? Math.min(target, state.compactT + step) : Math.max(target, state.compactT - step);
    }

    if (cssW && cssH) {
      renderer.info.reset();
      stage.render(viewportRect());
      lastStats = { drawCalls: renderer.info.render.calls, frameTriangles: renderer.info.render.triangles };
    }
    frames++;
    dirty = false;
    if (needsFrames()) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }
  let frames = 0;
  let lastStats = { drawCalls: 0, frameTriangles: 0 };

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
      if (state.speedMps > 0) state.doorsOpen = false; // 車子一動就關門
      kick();
    },
    setColor(hex) { state.color = hex; applyColor(); kick(); },
    setHeadlights(on) { state.headlights = !!on; applyHeadlights(); kick(); },
    setModel(id) { if (getModel(id).id === state.modelId) return; loadModel(id); kick(); },
    hasDoors() { return !!(car && car.doors && car.doors.length); },
    get doorsOpen() { return state.doorsOpen; },
    setDoors(open) {
      state.doorsOpen = !!open && !!(car && car.doors && car.doors.length) && state.speedMps === 0;
      kick();
      return state.doorsOpen;
    },
    setView(v) { if (VIEW_AZ[v] != null && v !== state.view) { state.view = v; kick(); } },
    setScene(s) { if (['studio', 'mountain', 'city'].includes(s) && s !== state.scene) { state.scene = s; applyDarkMode(); kick(); } },
    setTime(t) { if (['auto', 'day', 'night'].includes(t) && t !== state.time) { state.time = t; applyDarkMode(); kick(); } },
    setCompact(on) {
      state.compact = !!on;
      canvas.classList.toggle('car-compact', state.compact);
      kick();
    },
    setDarkMode(on) { state.darkMode = !!on; applyDarkMode(); kick(); },
    setQuality(v) {
      state.quality = v === 'low' ? 'low' : 'high';
      stage.setQuality(state.quality);
      if (car) stage.setCar(car.group, carBox);
      kick();
    },
    resize,
    getInfo() {
      return {
        model: state.modelId, triangles: state.triangles, compact: state.compact, speedMps: state.speedMps,
        models: MODELS.map((m) => m.id), quality: state.quality, view: state.view, scene: state.scene, time: state.time, frames, ...lastStats,
      };
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (car) { scene.remove(car.group); disposeObject(car.group); car = null; }
      stage.dispose();
      disposeObject(scene);
      renderer.dispose();
    },
  };
}
