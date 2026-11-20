// DriveHUD V1.6 — 車模展示廳舞台：環境貼圖、背景、反射地板、接觸陰影、頭燈光斑、後處理。
// quality 'high'：EffectComposer（RenderPass → 半解析度 Bloom → OutputPass）＋ Reflector 反射地板。
// quality 'low' ：直接渲染（ACES 由 renderer 套用），地板無反射、無後處理。
import * as THREE from '../../vendor/three.module.js';
import { EffectComposer } from '../../vendor/three-addons/EffectComposer.js';
import { RenderPass } from '../../vendor/three-addons/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three-addons/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/three-addons/OutputPass.js';
import { Reflector } from '../../vendor/three-addons/Reflector.js';
import { FullScreenQuad } from '../../vendor/three-addons/Pass.js';
import { createScenery } from './scenery.js';

const FX_LAYER = 1; // 背景／陰影／光斑：不進入反射

// ── ACES 反推：讓背景經過 tone mapping 後仍是指定的 sRGB 顏色 ──
function rrt(v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081); }
function invAces(l, exposure = 1) {
  let lo = 0, hi = 64;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (rrt((m * exposure) / 0.6) < l) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** sRGB hex → 經 ACES 反推的線性 Color。 */
function displayColor(hex, exposure) {
  const c = new THREE.Color(hex); // 已轉線性
  return new THREE.Color(invAces(c.r, exposure), invAces(c.g, exposure), invAces(c.b, exposure));
}

// 場景 × 時段的外觀。env 指定車漆反射用的環境貼圖；edge（外圈收斂色）另由頁面明暗決定。
const THEMES = {
  dark: {
    top: '#0b0e12', horizon: '#1a1f26', bottom: '#060708', glow: '#2a313b', envKind: 'studio-night',
    floor: '#0d1013', floorSpot: '#1c2229', refl: 0.55, env: 1.0, hemi: 0.25, key: 1.6, rim: 1.4,
    bloom: { strength: 0.45, radius: 0.45, threshold: 1.0 }, shadow: 0.92,
  },
  light: {
    top: '#eceef1', horizon: '#dfe2e6', bottom: '#c3c9d0', glow: '#f0f2f4', envKind: 'studio-day',
    floor: '#c9cfd6', floorSpot: '#e2e6ea', refl: 0.28, env: 1.15, hemi: 0.45, key: 1.8, rim: 0.9,
    bloom: { strength: 0.3, radius: 0.4, threshold: 4.0 }, shadow: 0.78,
  },
  'mountain-day': {
    top: '#2f6fc4', horizon: '#dfeaf2', bottom: '#8b9a5b', glow: '#dfeaf2', envKind: 'outdoor-day',
    floor: '#2d3035', floorSpot: '#353a40', refl: 0.36, env: 1.05, hemi: 0.5,
    bloom: { strength: 0.25, radius: 0.4, threshold: 6.0 }, shadow: 0.8,
  },
  'mountain-night': {
    top: '#03050a', horizon: '#4a4f80', bottom: '#10160f', glow: '#2b3260', envKind: 'outdoor-night',
    floor: '#0c0e11', floorSpot: '#15191e', refl: 0.5, env: 0.95, hemi: 0.22,
    bloom: { strength: 0.45, radius: 0.45, threshold: 1.0 }, shadow: 0.9,
  },
  'city-day': {
    top: '#3f82d4', horizon: '#e0e8ee', bottom: '#9a9da2', glow: '#e0e8ee', envKind: 'outdoor-day',
    floor: '#2d3035', floorSpot: '#353a40', refl: 0.36, env: 1.05, hemi: 0.5,
    bloom: { strength: 0.25, radius: 0.4, threshold: 6.0 }, shadow: 0.8,
  },
  'city-night': {
    top: '#05060c', horizon: '#5d4f7c', bottom: '#16181c', glow: '#3a3260', envKind: 'city-night',
    floor: '#0c0e11', floorSpot: '#161a20', refl: 0.55, env: 1.0, hemi: 0.22,
    bloom: { strength: 0.5, radius: 0.5, threshold: 1.0 }, shadow: 0.9,
  },
};
const PAGE_EDGE = { dark: '#14171c', light: '#f3f5f8' }; // 與 styles/app.css 的 --bg 一致
function themeFor(scene, night) {
  if (scene === 'mountain' || scene === 'city') return THEMES[`${scene}-${night ? 'night' : 'day'}`];
  return night ? THEMES.dark : THEMES.light;
}

const EDGE_GLSL = /* glsl */`
  float edgeFade(vec2 ndc) {
    vec2 q = smoothstep(vec2(1.0), vec2(0.8), abs(ndc));
    return q.x * q.y;
  }
`;

/** 戶外 HDR 環境：天空穹頂 + 太陽（白天）或路燈、霓虹（夜晚）。車漆反射的就是這些光源。 */
function buildOutdoorEnv(renderer, kind) {
  const env = new THREE.Scene();
  const night = kind !== 'outdoor-day';
  const sky = new THREE.SphereGeometry(40, 32, 16);
  const cols = [];
  const p = sky.attributes.position;
  const top = new THREE.Color(night ? 0x03050a : 0x3f82d4).multiplyScalar(night ? 1 : 1.3);
  const hor = new THREE.Color(night ? (kind === 'city-night' ? 0x4b3f66 : 0x3a4070) : 0xe6eff5).multiplyScalar(night ? 0.6 : 1.5);
  const bot = new THREE.Color(night ? 0x050607 : 0x3a3d40);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 40;
    const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.5)) : hor.clone().lerp(bot, Math.min(1, -y * 5));
    cols.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, k, pos, tint = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0.6, 0);
    env.add(m);
  };
  if (!night) {
    panel(7, 7, 30, [14, 22, 16], 0xfff1d6); // 太陽
    panel(30, 6, 1.6, [0, 8, -30], 0xeaf2f8);
  } else {
    panel(1.6, 0.6, 26, [4.5, 7, 6], 0xffe0a8); // 路燈
    panel(1.6, 0.6, 26, [-4.5, 7, -8], 0xffe0a8);
    panel(1.6, 0.6, 20, [4.5, 7, 18], 0xffe0a8);
    if (kind === 'city-night') {
      panel(5, 2.4, 9, [16, 9, 10], 0xff3d9a);
      panel(5, 2.4, 9, [-16, 11, -12], 0x35d6ff);
      panel(3, 6, 7, [18, 12, -4], 0xffc04d);
    }
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.02);
  pm.dispose();
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt;
}

/** 自製攝影棚 HDR 環境：深色漸層穹頂 + 頂部柔光箱 + 長條燈 + 側光板。 */
function buildEnv(renderer, dark) {
  const env = new THREE.Scene();
  const sky = new THREE.SphereGeometry(20, 32, 16);
  const cols = [];
  const p = sky.attributes.position;
  const top = new THREE.Color(dark ? 0x101216 : 0xc9d0d8).multiplyScalar(dark ? 1 : 1.1);
  const hor = new THREE.Color(dark ? 0x23272d : 0x9aa3ad);
  const bot = new THREE.Color(dark ? 0x050506 : 0x3a3f45);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 20;
    const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(bot, Math.min(1, -y * 4));
    cols.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, k, pos, look, tint = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(9, 2.6, dark ? 2.0 : 2.2, [0, 9, 0], [0, 0, 0]); // 頂部柔光箱
  panel(14, 0.28, dark ? 6 : 5, [2.6, 6.5, 0], [2.6, 0, 0]); // 長條燈（車漆上的線形高光）
  panel(14, 0.28, dark ? 6 : 5, [-2.6, 6.5, 0], [-2.6, 0, 0]);
  panel(4.5, 3.2, dark ? 3.2 : 2.6, [9, 3.2, 9], [0, 0.6, 0], 0xfff4e6); // 左前主光（暖）
  panel(5, 2.2, dark ? 2.4 : 2.0, [-9, 2.6, -7], [0, 0.6, 0], 0xdde8ff); // 右後輪廓光（冷）
  panel(7, 1.6, dark ? 1.8 : 1.4, [9, 1.4, -1.5], [0, 0.8, 0]); // 左側長條側光（照亮車側）
  panel(1.2, 6, dark ? 2.0 : 1.6, [-8, 3, 6], [0, 1, 0]); // 右前直立燈
  panel(1.2, 6, dark ? 1.6 : 1.4, [8, 3, -6], [0, 1, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.012);
  pm.dispose();
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt;
}

function makeBackdrop() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() }, uEdge: { value: new THREE.Color() }, uHorizonY: { value: 0.05 },
    },
    vertexShader: /* glsl */`
      varying vec2 vNdc;
      void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uBottom, uGlow, uEdge; uniform float uHorizonY;
      varying vec2 vNdc;
      ${EDGE_GLSL}
      void main() {
        float y = vNdc.y;
        vec3 c = y > uHorizonY ? mix(uHorizon, uTop, smoothstep(uHorizonY, 1.0, y)) : mix(uHorizon, uBottom, smoothstep(uHorizonY, -1.0, y));
        float g = exp(-pow(length(vec2(vNdc.x * 0.8, (y - 0.15) * 1.4)), 2.0) * 1.6);
        c = mix(c, uGlow, g * 0.55);
        // 外圈逐漸收斂到頁面底色，再淡出成透明，嵌入任何版面都不會有框線
        vec2 q2 = smoothstep(vec2(1.0), vec2(0.55), abs(vNdc));
        c = mix(uEdge, c, q2.x * q2.y);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float a = edgeFade(vNdc);
        gl_FragColor = vec4(gl_FragColor.rgb * a, a);
      }
    `,
    depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.frustumCulled = false;
  m.renderOrder = -100;
  m.layers.set(FX_LAYER);
  return m;
}

const FLOOR_VS = /* glsl */`
  uniform mat4 textureMatrix;
  varying vec4 vUv;
  varying vec3 vWorld;
  varying vec3 vClip;
  void main() {
    vUv = textureMatrix * vec4(position, 1.0);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    vClip = gl_Position.xyw;
  }
`;
const FLOOR_FS = /* glsl */`
  uniform vec3 color;
  uniform sampler2D tDiffuse;
  uniform vec3 uFloor, uSpot;
  uniform vec2 uCenter;
  uniform float uFade, uRefl, uTexel;
  varying vec4 vUv;
  varying vec3 vWorld;
  varying vec3 vClip;
  ${EDGE_GLSL}
  void main() {
    float d = length(vWorld.xz - uCenter);
    vec3 col = mix(uFloor, uSpot, exp(-d * d / 9.0));
    #ifdef USE_REFL
      vec4 p = vUv;
      float o = uTexel * p.w * (1.0 + d * 0.8);
      // 5 點柔化；先夾住 HDR 亮點，避免燈具反射出現顆粒
      vec3 L = vec3(1.4);
      vec3 r = min(texture2DProj(tDiffuse, p).rgb, L) * 0.4
        + min(texture2DProj(tDiffuse, p + vec4(o, 0.0, 0.0, 0.0)).rgb, L) * 0.15
        + min(texture2DProj(tDiffuse, p - vec4(o, 0.0, 0.0, 0.0)).rgb, L) * 0.15
        + min(texture2DProj(tDiffuse, p + vec4(0.0, o, 0.0, 0.0)).rgb, L) * 0.15
        + min(texture2DProj(tDiffuse, p - vec4(0.0, o, 0.0, 0.0)).rgb, L) * 0.15;
      col += r * uRefl * (1.0 - smoothstep(0.5, uFade * 0.8, d));
    #endif
    float a = (1.0 - smoothstep(uFade * 0.35, uFade, d)) * edgeFade(vClip.xy / vClip.z);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function floorUniforms() {
  return {
    color: { value: new THREE.Color() }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() },
    uFloor: { value: new THREE.Color() }, uSpot: { value: new THREE.Color() }, uCenter: { value: new THREE.Vector2() },
    uFade: { value: 9 }, uRefl: { value: 0.5 }, uTexel: { value: 0.0015 },
  };
}

function makeFloor(quality) {
  const geo = new THREE.CircleGeometry(16, 72);
  if (quality === 'high') {
    geo.rotateX(0); // Reflector 以 +Z 為法線；以物件旋轉放平
    const r = new Reflector(geo, {
      shader: { name: 'ShowroomFloor', uniforms: floorUniforms(), vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS },
      textureWidth: 512, textureHeight: 512, clipBias: 0.002, multisample: 0,
    });
    r.material.defines = { USE_REFL: '' };
    r.material.transparent = true;
    r.rotation.x = -Math.PI / 2;
    r.renderOrder = 1;
    return r;
  }
  const mat = new THREE.ShaderMaterial({ uniforms: floorUniforms(), vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, transparent: true });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/** 頭燈照地光斑貼圖：兩道從車頭向前展開的光束（v=0 在車頭端）。 */
function beamTexture() {
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = 1 - y / (H - 1); // 畫布底端 = 車頭端
    const along = Math.min(1, v / 0.06) * Math.pow(1 - v, 1.6);
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1) - 0.5;
      const w = 0.07 + 0.3 * v;
      let a = 0;
      for (const c0 of [-0.24, 0.24]) {
        const cc = c0 * (1 - 0.35 * v);
        a += Math.exp(-(((u - cc) / w) ** 2));
      }
      a = Math.min(1, a * 0.75) * along * Math.min(1, (0.5 - Math.abs(u)) / 0.12);
      const o = (y * W + x) * 4;
      img.data[o] = 255; img.data[o + 1] = 246; img.data[o + 2] = 226; img.data[o + 3] = Math.round(255 * Math.max(0, a));
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 接觸陰影：由下往上正交渲染車身「高度遮蔽」再模糊，只在換車時做一次。 */
function bakeContactShadow(renderer, group, box) {
  const W = box.max.x - box.min.x + 1.4, D = box.max.z - box.min.z + 1.4;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const size = 256;
  const rtA = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType });
  const rtB = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType });
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0, 1.6);
  cam.rotation.x = Math.PI / 2; // 朝 +Y 看；畫面右 = +X、上 = +Z
  cam.position.set(cx, -0.001, cz);
  cam.updateMatrixWorld();
  const occ = new THREE.ShaderMaterial({
    vertexShader: 'varying float vH; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vH = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'varying float vH; void main(){ float a = pow(1.0 - smoothstep(0.0, 1.3, vH), 2.2); gl_FragColor = vec4(a, a, a, a); }',
    side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const tmp = new THREE.Scene();
  tmp.overrideMaterial = occ;
  const parent = group.parent;
  tmp.add(group);
  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevTM = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rtA);
  renderer.clear();
  renderer.render(tmp, cam);
  if (parent) parent.add(group);
  // 兩輪可分離高斯模糊
  const blur = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
      void main(){ vec4 s = vec4(0.0); float w[5]; w[0]=0.227; w[1]=0.1945; w[2]=0.1216; w[3]=0.054; w[4]=0.0162;
        s += texture2D(tMap, vUv) * w[0];
        for (int i = 1; i < 5; i++) { s += texture2D(tMap, vUv + uDir * float(i)) * w[i]; s += texture2D(tMap, vUv - uDir * float(i)) * w[i]; }
        gl_FragColor = s; }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(blur);
  for (const r of [1.2, 2.6, 4.5]) {
    blur.uniforms.tMap.value = rtA.texture; blur.uniforms.uDir.value.set(r / size, 0);
    renderer.setRenderTarget(rtB); renderer.clear(); quad.render(renderer);
    blur.uniforms.tMap.value = rtB.texture; blur.uniforms.uDir.value.set(0, r / size);
    renderer.setRenderTarget(rtA); renderer.clear(); quad.render(renderer);
  }
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevColor, prevClear);
  renderer.toneMapping = prevTM;
  quad.dispose(); blur.dispose(); occ.dispose(); rtB.dispose();
  const geo = new THREE.PlaneGeometry(W, D);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const mat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: rtA.texture }, uOpacity: { value: 0.9 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tMap; uniform float uOpacity; varying vec2 vUv; void main(){ float a = texture2D(tMap, vUv).r; gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(a * 1.35, 0.0, 1.0) * uOpacity); }',
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(cx, 0.003, cz);
  m.renderOrder = 2;
  m.layers.set(FX_LAYER);
  m.userData.rt = rtA;
  return m;
}

export function createStage(renderer, { quality = 'high' } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 500);
  camera.layers.enable(FX_LAYER);

  const envCache = {};
  const hemi = new THREE.HemisphereLight(0xeef3ff, 0x202124, 0.3);
  // 不用平行光：在 clearcoat 0.03 的車漆上會形成過曝的點狀高光；主要照明來自 HDR 環境貼圖
  scene.add(hemi);

  const backdrop = makeBackdrop();
  scene.add(backdrop);
  let floor = null;
  let shadow = null;
  const beamTex = beamTexture();
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).rotateY(Math.PI), // 貼圖底端（v=0）朝車頭
    new THREE.ShaderMaterial({
      uniforms: { tMap: { value: beamTex }, uColor: { value: new THREE.Color(1.15, 1.1, 1.0) } },
      vertexShader: 'varying vec2 vUv; varying vec3 vClip; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); vClip = gl_Position.xyw; }',
      fragmentShader: `uniform sampler2D tMap; uniform vec3 uColor; varying vec2 vUv; varying vec3 vClip;
        ${EDGE_GLSL}
        void main(){ vec4 t = texture2D(tMap, vUv); float a = t.a * edgeFade(vClip.xy / vClip.z);
          gl_FragColor = vec4(uColor * t.rgb * a, 0.0); }`,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    }),
  );
  pool.position.y = 0.006;
  pool.renderOrder = 3;
  pool.visible = false;
  pool.layers.set(FX_LAYER);
  scene.add(pool);

  let composer = null, bloom = null, rt = null;
  let theme = THEMES.dark;
  let look = { scene: 'studio', night: true, pageDark: true };
  let scenery = null; // 第一次切到戶外場景時才建立
  let q = quality === 'low' ? 'low' : 'high';
  let size = { w: 1, h: 1, pr: 1 };

  function buildPipeline() {
    if (floor) { scene.remove(floor); floor.geometry.dispose(); floor.material.dispose(); floor.getRenderTarget?.().dispose(); floor = null; }
    if (composer) { composer.dispose(); rt?.dispose(); bloom?.dispose(); composer = null; bloom = null; rt = null; }
    floor = makeFloor(q);
    scene.add(floor);
    if (q === 'high') {
      rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.85);
      const setSize = bloom.setSize.bind(bloom);
      bloom.setSize = (w, h) => setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))); // 半解析度
      // 光暈只加顏色，不改 alpha（背景邊緣淡出才不會被墊黑）
      const bm = bloom.blendMaterial;
      bm.blending = THREE.CustomBlending;
      bm.blendEquation = THREE.AddEquation;
      bm.blendSrc = THREE.OneFactor; bm.blendDst = THREE.OneFactor;
      bm.blendSrcAlpha = THREE.ZeroFactor; bm.blendDstAlpha = THREE.OneFactor;
      composer.addPass(bloom);
      // OutputPass 以「反預乘 → tone mapping / sRGB → 再預乘」處理，背景邊緣半透明處才不會偏亮
      const out = new OutputPass();
      out.material.fragmentShader = out.material.fragmentShader
        .replace('gl_FragColor = texture2D( tDiffuse, vUv );', 'gl_FragColor = texture2D( tDiffuse, vUv ); float pa = clamp( gl_FragColor.a, 0.0, 1.0 ); gl_FragColor.rgb /= max( pa, 0.02 );')
        .replace(/\}\s*$/, '\tgl_FragColor.rgb *= pa;\n}');
      composer.addPass(out);
    }
    applyTheme();
    setSize(size.w, size.h, size.pr);
  }

  function applyTheme() {
    const t = theme;
    const ex = renderer.toneMappingExposure;
    const u = backdrop.material.uniforms;
    u.uTop.value.copy(displayColor(t.top, ex));
    u.uHorizon.value.copy(displayColor(t.horizon, ex));
    u.uBottom.value.copy(displayColor(t.bottom, ex));
    u.uGlow.value.copy(displayColor(t.glow, ex));
    u.uEdge.value.copy(displayColor(look.pageDark ? PAGE_EDGE.dark : PAGE_EDGE.light, ex));
    const fu = floor.material.uniforms;
    fu.uFloor.value.copy(displayColor(t.floor, ex));
    fu.uSpot.value.copy(displayColor(t.floorSpot, ex));
    fu.uRefl.value = t.refl;
    hemi.intensity = t.hemi;
    scene.environmentIntensity = t.env;
    if (shadow) shadow.material.uniforms.uOpacity.value = t.shadow;
    if (bloom) { bloom.strength = t.bloom.strength; bloom.radius = t.bloom.radius; bloom.threshold = t.bloom.threshold; }
  }

  function setSize(w, h, pr) {
    size = { w, h, pr };
    if (composer) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    }
    if (floor?.isReflector) {
      const s = Math.min(1024, Math.round(Math.max(w, h) * pr * 0.5));
      floor.getRenderTarget().setSize(s, Math.round(s * (h / w)));
      floor.material.uniforms.uTexel.value = 1.2 / s;
    }
  }

  buildPipeline();

  return {
    scene, camera,
    get quality() { return q; },
    setQuality(v) { const n = v === 'low' ? 'low' : 'high'; if (n !== q) { q = n; buildPipeline(); } },
    /** 場景（studio／mountain／city）、時段（night）與頁面明暗（pageDark，決定外圈收斂色）。 */
    setLook(next) {
      look = { ...look, ...next };
      theme = themeFor(look.scene, look.night);
      const k = theme.envKind;
      if (!envCache[k]) envCache[k] = k.startsWith('studio') ? buildEnv(renderer, k === 'studio-night') : buildOutdoorEnv(renderer, k);
      scene.environment = envCache[k].texture;
      if (look.scene !== 'studio' && !scenery) {
        scenery = createScenery({ layer: FX_LAYER, toDisplay: (hex) => displayColor(hex, renderer.toneMappingExposure) });
        scene.add(scenery.group);
      }
      if (scenery) scenery.apply(look.scene, look.night);
      if (look.scene === 'studio') backdrop.material.uniforms.uHorizonY.value = 0.05;
      applyTheme();
    },
    setDark(dark) { this.setLook({ scene: 'studio', night: !!dark, pageDark: !!dark }); },
    get outdoor() { return look.scene !== 'studio'; },
    /** 戶外場景的地平線位置（NDC y），讓天空漸層對齊 3D 地面。 */
    setHorizon(y) { if (look.scene !== 'studio') backdrop.material.uniforms.uHorizonY.value = y; },
    update(dt, speedMps) { if (scenery) scenery.update(dt, speedMps); },
    setCar(group, box) {
      if (shadow) { scene.remove(shadow); shadow.geometry.dispose(); shadow.material.dispose(); shadow.userData.rt.dispose(); }
      shadow = bakeContactShadow(renderer, group, box);
      shadow.material.uniforms.uOpacity.value = theme.shadow;
      scene.add(shadow);
      const c = box.getCenter(new THREE.Vector3());
      floor.material.uniforms.uCenter.value.set(c.x, c.z);
      const s = box.getSize(new THREE.Vector3());
      pool.scale.set(s.x * 1.25, 1, 4.6);
      pool.position.set(c.x, 0.006, box.max.z + 2.2);
    },
    setHeadlights(on) { pool.visible = on; },
    setSize,
    /** viewport：CSS 像素（原點左下）；畫面上其餘部分保持透明。 */
    render(vp) {
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.w, size.h);
      renderer.clear();
      renderer.setViewport(vp.x, vp.y, vp.w, vp.h);
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    dispose() {
      if (scenery) { scene.remove(scenery.group); scenery.dispose(); }
      if (shadow) { shadow.geometry.dispose(); shadow.material.dispose(); shadow.userData.rt.dispose(); }
      if (floor) { floor.geometry.dispose(); floor.material.dispose(); floor.getRenderTarget?.().dispose(); }
      composer?.dispose(); rt?.dispose(); bloom?.dispose();
      backdrop.geometry.dispose(); backdrop.material.dispose();
      pool.geometry.dispose(); pool.material.dispose(); beamTex.dispose();
      Object.values(envCache).forEach((e) => e.dispose());
    },
  };
}
