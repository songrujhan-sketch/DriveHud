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
// 視角方位角（由車頭 +Z 起算、朝車身左側 +X 為正）：前 45°、正面、後 45°、正後方、上方（由左側上方俯視）
const VIEW_AZ = { front: Math.PI / 4, head: 0, side: Math.PI / 2, rear: Math.PI * 3 / 4, back: Math.PI, top: Math.PI / 2 };
const VIEW_EL = { top: 1 };          // 俯視程度 0–1，沒列的視角是 0
const TOP_ELEV = 1.36;               // 俯視的仰角（約 78°；不到 90° 才有穩定的畫面上方）
const EL_SPEED = 2.2;                // 俯視程度的變化速度（1/s）
const VIEW_SPEED = 3.2; // 視角轉換的角速度（rad/s）
const COMPACT_SCALE = 0.4;
const COMPACT_MS = 280;
const DOOR_MS = 700;
const DOOR_LOCK_MPS = 5 / 3.6; // 車速到 5 km/h 才鎖門；低於這個值視為停車（GPS 靜止時也會回報零星的小車速）
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
    scene: ['studio', 'mountain', 'city', 'track', 'coast'].includes(opts.scene) ? opts.scene : 'studio',
    time: ['auto', 'day', 'night'].includes(opts.time) ? opts.time : 'auto',
    az: VIEW_AZ[opts.view] != null ? VIEW_AZ[opts.view] : VIEW_AZ.front,
    el: VIEW_EL[opts.view] || 0,
    speedMps: 0, turn: 0, turnTarget: 0,
    doorsOpen: false,
    doorT: 0, // 0 = 關，1 = 全開
    fx: false, // 車模自己的動畫（例如噴焰）還沒結束
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

  // A longitudinal silhouette avoids framing empty corners of a tall antenna or a long horse team.
  let outline=[];
  function captureOutline() {
    const bins=Array.from({length:20},()=>new THREE.Box3());
    const v=new THREE.Vector3(),length=Math.max(.01,carBox.max.z-carBox.min.z);
    car.group.updateMatrixWorld(true);
    car.group.traverseVisible(m=>{
      const pos=m.geometry?.attributes.position;
      if(!pos) return;
      for(let i=0;i<pos.count;i++){
        v.fromBufferAttribute(pos,i).applyMatrix4(m.matrixWorld);
        const bin=Math.min(19,Math.max(0,Math.floor(20*(v.z-carBox.min.z)/length)));
        bins[bin].expandByPoint(v);
      }
    });
    const points=[];
    for(const b of bins) if(!b.isEmpty()){
      for(const x of [b.min.x,b.max.x]) for(const y of [b.min.y,b.max.y]) for(const z of [b.min.z,b.max.z]) points.push(new THREE.Vector3(x,y,z));
    }
    return points;
  }
  const subjectBounds=new THREE.Box3();
  function fitCamera() {
    if (!car) return;
    const corners = outline;
    const frameBox=subjectBounds.setFromPoints(corners);
    const exhaust=car.meta?.id==='darkknight' ? 1.25 : .9;
    if(car.setJetPreview && (state.speedMps>0 || state.fx)) frameBox.min.z-=exhaust;
    if(stage.outdoor) stage.setSubjectBounds(frameBox.clone().expandByScalar(.45));
    const center = frameBox.getCenter(new THREE.Vector3());
    const az = state.az;
    const target = center.clone();
    const e = state.el * state.el * (3 - 2 * state.el);
    const elevation=THREE.MathUtils.lerp(stage.outdoor ? .105 : .17,TOP_ELEV,e);
    const back=new THREE.Vector3(Math.sin(az)*Math.cos(elevation),Math.sin(elevation),Math.cos(az)*Math.cos(elevation));
    const right=new THREE.Vector3(back.z,0,-back.x).normalize(), up=new THREE.Vector3().crossVectors(back,right);
    const v=new THREE.Vector3(), tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const tanX=tanY*camera.aspect;
    // Fit the projected span, not its distance from a guessed screen centre.
    // Cap landscape width by canvas height so a wide low car cannot dwarf an SUV.
    const horizontal=Math.min(.82,1.09/camera.aspect), vertical=.83;
    const projected=corners.map(p=>{
      v.copy(p).sub(target);
      return [v.dot(right)/tanX,v.dot(up)/tanY,v.dot(back)];
    });
    if(car.setJetPreview) {
      v.set(center.x,.55,frameBox.min.z).sub(target);
      projected.push([v.dot(right)/tanX,v.dot(up)/tanY,v.dot(back)]);
    }
    function span(distance){
      let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
      for(const [x,y,z] of projected){
        const depth=Math.max(.001,distance-z);
        left=Math.min(left,x/depth);right=Math.max(right,x/depth);
        bottom=Math.min(bottom,y/depth);top=Math.max(top,y/depth);
      }
      return {left,right,bottom,top};
    }
    let near=Math.max(...projected.map(p=>p[2]))+.02;
    let far=near+frameBox.getSize(v).length()*(2+1/Math.min(horizontal*tanX,vertical*tanY));
    for(let i=0;i<15;i++){
      const mid=(near+far)/2,b=span(mid);
      if(b.right-b.left>2*horizontal || b.top-b.bottom>2*vertical) near=mid;
      else far=mid;
    }
    camera.position.copy(target).addScaledVector(back,far);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const bounds=span(far);
    camera.projectionMatrix.elements[8]=(bounds.left+bounds.right)/2;
    camera.projectionMatrix.elements[9]=(bounds.bottom+bounds.top)/2;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    if (stage.outdoor) { // 地平線：沿視線水平方向極遠處、高度 0 的點
      const f = new THREE.Vector3(target.x - camera.position.x, 0, target.z - camera.position.z).normalize();
      const h = new THREE.Vector3(camera.position.x + f.x * 5000, 0, camera.position.z + f.z * 5000).project(camera);
      stage.setHorizon(Math.min(h.y, 4)); // 俯視時地平線在畫面上方之外
    }
  }

  function applyHeadlights() {
    if (!car) return;
    const on = state.headlights;
    new Set(car.headlights.meshes.map((m) => m.material)).forEach((m) => { m.emissiveIntensity = on ? (car.headlights.emission ?? 7) : 0.08; });
    new Set((car.headlights.drl || []).map((m) => m.material)).forEach((m) => { m.emissiveIntensity = on ? 5.0 : 1.4; });
    new Set(car.taillights.map((m) => m.material)).forEach((m) => { m.emissiveIntensity = on ? 4.0 : 0.7; });
    for (const spot of car.headlights.spots || [car.headlights.light]) {
      spot.intensity = on ? (car.headlights.intensity ?? (car.headlights.beam ? 70 : 40)) : 0;
    }
    stage.setHeadlights(on && car.headlights.roadBeam !== false);
  }

  function applyDoors() {
    if (!car || !car.doors) return;
    const e = state.doorT * state.doorT * (3 - 2 * state.doorT);
    for (const d of car.doors) d.pivot.quaternion.setFromAxisAngle(d.axis, d.sign * d.max * e);
  }

  function applyColor() {
    if (!car) return;
    const metallic = ['#c9a44f', '#c8d0d5'].includes(state.color);
    car.bodyMaterials.forEach((m) => {
      m.color.set(state.color);
      m.userData.baseMetalness ??= m.metalness;
      m.userData.baseRoughness ??= m.roughness;
      m.metalness = metallic ? Math.max(.78, m.userData.baseMetalness) : m.userData.baseMetalness;
      m.roughness = metallic ? Math.min(.27, m.userData.baseRoughness) : m.userData.baseRoughness;
    });
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
    outline=captureOutline();
    for(const d of car.doors || []) d.pivot.quaternion.setFromAxisAngle(d.axis,d.sign*d.max);
    outline.push(...captureOutline());
    if(car.framingBounds) outline.push(car.framingBounds.max.clone(),car.framingBounds.min.clone());
    applyDoors();
    car.group.updateMatrixWorld(true);
    state.triangles = countTriangles(car.group);
    applyColor();
    applyHeadlights();
    stage.setCar(car.group, carBox, car.headlights);
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
    return state.turn !== state.turnTarget || state.speedMps > 0 || state.fx || state.compactT !== target || state.az !== VIEW_AZ[state.view] || state.el !== (VIEW_EL[state.view] || 0) || state.doorT !== (state.doorsOpen ? 1 : 0) || dirty;
  }

  function frame(now) {
    raf = 0;
    if (disposed || !inView || !pageVisible()) { lastT = 0; return; }
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;

    if (car && state.speedMps > 0) {
      for (const w of car.wheels) w.rotation.x = (w.rotation.x + state.speedMps * dt / (w.userData.radius || WHEEL_RADIUS_M)) % (Math.PI * 2);
    }
    state.turn = THREE.MathUtils.damp(state.turn,state.turnTarget,6,dt);
    if (Math.abs(state.turn-state.turnTarget)<.001) state.turn=state.turnTarget;
    for (const w of car.wheels) if(w.position.z>0) {
      w.rotation.order='YXZ'; w.rotation.y=state.turn;
    }
    car.group.rotation.y=state.turn*.20;
    const azTarget = VIEW_AZ[state.view], elTarget = VIEW_EL[state.view] || 0;
    if (state.az !== azTarget || state.el !== elTarget) { // 視角轉換
      const step = VIEW_SPEED * dt, diff = azTarget - state.az;
      state.az = Math.abs(diff) <= step ? azTarget : state.az + Math.sign(diff) * step;
      const es = EL_SPEED * dt, ed = elTarget - state.el;
      state.el = Math.abs(ed) <= es ? elTarget : state.el + Math.sign(ed) * es;
      fitCamera();
    }
    const doorTarget = state.doorsOpen ? 1 : 0;
    if (car && car.doors && state.doorT !== doorTarget) { // 車門開合
      const step = dt * 1000 / DOOR_MS;
      state.doorT = doorTarget > state.doorT ? Math.min(1, state.doorT + step) : Math.max(0, state.doorT - step);
      applyDoors();
    }
    stage.update(dt, state.speedMps);
    const wasAnimating=state.fx;
    state.fx = !!(car && car.animate && car.animate(dt, state.speedMps));
    if(wasAnimating!==state.fx && car?.setJetPreview) fitCamera();
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
    setTurn(angle) { state.turnTarget=angle; kick(); },
    setSpeedKmh(v) {
      const k = Number(v);
      state.speedMps = Number.isFinite(k) && k > 0 ? k / 3.6 : 0;
      if (state.speedMps > 0) car?.setJetPreview?.(false);
      if (state.speedMps >= DOOR_LOCK_MPS) state.doorsOpen = false; // 開始行駛就關門
      kick();
    },
    setColor(hex) { state.color = hex; applyColor(); kick(); },
    setHeadlights(on) { state.headlights = !!on; applyHeadlights(); kick(); },
    setModel(id) { if (getModel(id).id === state.modelId) return; loadModel(id); kick(); },
    canPreviewJet() { return !!car?.setJetPreview && state.speedMps === 0; },
    previewJet() { if(car?.setJetPreview && state.speedMps === 0){ car.setJetPreview(true); kick(); } },
    hasDoors() { return !!(car && car.doors && car.doors.length); },
    get doorsOpen() { return state.doorsOpen; },
    get doorsLocked() { return state.speedMps >= DOOR_LOCK_MPS; },
    setDoors(open) {
      state.doorsOpen = !!open && !!(car && car.doors && car.doors.length) && state.speedMps < DOOR_LOCK_MPS;
      kick();
      return state.doorsOpen;
    },
    setView(v) { if (VIEW_AZ[v] != null && v !== state.view) { state.view = v; kick(); } },
    setScene(s) { if (['studio', 'mountain', 'city', 'track', 'coast'].includes(s) && s !== state.scene) { state.scene = s; applyDarkMode(); kick(); } },
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
      if (car) stage.setCar(car.group, carBox, car.headlights);
      kick();
    },
    resize,
    getInfo() {
      return {
        model: state.modelId, triangles: state.triangles, compact: state.compact, speedMps: state.speedMps,
        steeringRad: state.turn, models: MODELS.map((m) => m.id), quality: state.quality, view: state.view, scene: state.scene, time: state.time, frames, ...lastStats,
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
