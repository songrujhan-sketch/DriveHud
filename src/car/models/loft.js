// DriveHUD V1.6 — 放樣（loft）曲面引擎：以沿 Z 的斷面序列建立平滑車身。
// 座標慣例：車頭 +Z、上方 +Y、車身左側 +X、地面 y = 0；單位公尺。
//
// section(z) 回傳「半邊」斷面點 [{x, y, tag}]：
//   closed=true：從底部中線 (x=0) 沿 +X 側繞到頂部中線 (x=0)，自動鏡像成封閉環。
//   closed=false：從 +X 側的起點（例如窗線）繞到頂部中線 (x=0)，鏡像成開放帶。
// tag 代表「從此點到下一點」這段的區域名稱，用來分材質。
// 斷面點數必須固定；兩點重合可做出硬折線（法線不平滑）。

/** 單調三次插值（Fritsch–Carlson），keys: [[t, v], ...] 依 t 遞增。不會過衝。 */
export function curve(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d = [];
  const m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const band = (v, a, b, f = 0.02) => smooth((v - a) / f) * smooth((b - v) / f);

/** 產生 z 取樣：基本步距 + 指定的密集點（輪拱、端點圓角、分線）。 */
export function sampleZ(z0, z1, step, extra = []) {
  const out = [];
  const n = Math.ceil((z1 - z0) / step);
  for (let i = 0; i <= n; i++) out.push(z0 + ((z1 - z0) * i) / n);
  for (const z of extra) if (z > z0 && z < z1) out.push(z);
  out.sort((a, b) => a - b);
  const res = [out[0]];
  for (const z of out) if (z - res[res.length - 1] > 0.004) res.push(z);
  if (res[res.length - 1] !== z1) res[res.length - 1] = z1;
  return res;
}

/** 輪拱附近的密集 z（依角度取樣，讓拱線圓滑）。 */
export function archZs(zc, R, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(zc + R * Math.cos(Math.PI * (i / n)));
  return out;
}

/** 端點圓角用的密集 z。 */
export function endZs(zEnd, r, dir, n = 5) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(zEnd - dir * r * (1 - Math.sin((Math.PI / 2) * (i / n))));
  return out;
}

/**
 * 建立放樣網格。
 * @returns {Loft} 物件：geometry(classify, keys) 依分類輸出多材質幾何；extract(pred, offset) 取出偏移的子曲面。
 */
export function loft(THREE, { zs, section, closed = true, caps = closed }) {
  const rows = zs.length;
  let half = null;
  const ringRows = [];
  for (const z of zs) {
    const h = section(z);
    if (!half) half = h.length;
    if (h.length !== half) throw new Error('loft: section point count changed at z=' + z);
    ringRows.push(h);
  }
  // 組完整環：closed → H0..Hm-1, 鏡像 Hm-2..H1；open → 鏡像 H0..Hm-2, Hm-1, Hm-2..H0（反向）
  const m = half;
  const cols = closed ? 2 * m - 2 : 2 * m - 1;
  const P = new Float32Array(rows * cols * 3);
  const segTag = []; // 每欄（段）的標籤
  const segSide = [];
  const colOfHalf = (k, side) => {
    if (closed) return side > 0 ? k : (k === 0 ? 0 : k === m - 1 ? m - 1 : 2 * m - 2 - k);
    return side > 0 ? 2 * m - 2 - k : k;
  };
  for (let i = 0; i < rows; i++) {
    const H = ringRows[i];
    for (let j = 0; j < cols; j++) {
      let p, sx;
      if (closed) {
        if (j < m) { p = H[j]; sx = 1; } else { p = H[2 * m - 2 - j]; sx = -1; }
      } else if (j < m - 1) { p = H[j]; sx = -1; } else { p = H[2 * m - 2 - j]; sx = 1; }
      const o = (i * cols + j) * 3;
      P[o] = sx * p.x; P[o + 1] = p.y; P[o + 2] = zs[i] + (p.dz || 0);
    }
  }
  // 段標籤（以第 0 列的 tag 為準；tag 在各列應一致）
  const H0 = ringRows[0];
  const nSeg = closed ? cols : cols - 1;
  for (let j = 0; j < nSeg; j++) {
    let tag, side;
    if (closed) {
      if (j < m - 1) { tag = H0[j].tag; side = 1; } else { const k = 2 * m - 2 - j; tag = H0[k - 1].tag; side = -1; }
    } else if (j < m - 1) { tag = H0[j].tag; side = -1; } else { const k = 2 * m - 2 - j; tag = H0[k - 1].tag; side = 1; }
    segTag.push(tag);
    segSide.push(side);
  }
  const idx = (i, j) => i * cols + (j % cols);

  // 以完整網格計算平滑法線
  const baseGeom = new THREE.BufferGeometry();
  baseGeom.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const allIdx = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < nSeg; j++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      allIdx.push(a, b, d, b, c, d);
    }
  }
  baseGeom.setIndex(allIdx);
  baseGeom.computeVertexNormals();
  // 檢查方向：頂部中線的法線應朝上，否則翻轉
  let flip = false;
  {
    const mid = Math.floor(rows / 2);
    const jTop = closed ? m - 1 : m - 1;
    const n = baseGeom.attributes.normal;
    if (n.getY(idx(mid, jTop)) < 0) flip = true;
  }
  if (flip) {
    for (let k = 0; k < allIdx.length; k += 3) { const t = allIdx[k + 1]; allIdx[k + 1] = allIdx[k + 2]; allIdx[k + 2] = t; }
    baseGeom.setIndex(allIdx);
    baseGeom.computeVertexNormals();
  }
  const N = baseGeom.attributes.normal.array;

  // UV：u = z（公尺），v = 沿環弧長（公尺）
  const UV = new Float32Array(rows * cols * 2);
  for (let i = 0; i < rows; i++) {
    let acc = 0;
    for (let j = 0; j < cols; j++) {
      if (j > 0) {
        const o = idx(i, j) * 3, q = idx(i, j - 1) * 3;
        acc += Math.hypot(P[o] - P[q], P[o + 1] - P[q + 1]);
      }
      UV[idx(i, j) * 2] = P[idx(i, j) * 3 + 2];
      UV[idx(i, j) * 2 + 1] = acc;
    }
  }

  function quadInfo(i, j) {
    const a = idx(i, j) * 3, c = idx(i + 1, j + 1) * 3;
    const k = closed ? (j < m - 1 ? j : 2 * m - 3 - j) : (j < m - 1 ? j : 2 * m - 3 - j);
    return {
      i, j, k, tag: segTag[j], side: segSide[j],
      x: (P[a] + P[c]) / 2, y: (P[a + 1] + P[c + 1]) / 2, z: (P[a + 2] + P[c + 2]) / 2,
      zr: (zs[i] + zs[i + 1]) / 2,
      ax: Math.abs((P[a] + P[c]) / 2),
    };
  }

  const tri = (out, a, b, c) => (flip ? out.push(a, c, b) : out.push(a, b, c));

  return {
    rows, cols, zs, P, N, closed, half: m, colOfHalf,
    /** classify(info) → key；keys 為材質鍵順序；回傳 { geometry, keys }（geometry.groups 對應 keys 索引）。 */
    geometry(classify, keys) {
      const g = new THREE.BufferGeometry();
      const pos = Array.from(P), nor = Array.from(N), uv = Array.from(UV);
      const buckets = new Map(keys.map((k) => [k, []]));
      const put = (k) => { if (!buckets.has(k)) buckets.set(k, []); return buckets.get(k); };
      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < nSeg; j++) {
          const k = classify(quadInfo(i, j));
          if (k === null) continue;
          const out = put(k);
          const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
          tri(out, a, b, d); tri(out, b, c, d);
        }
      }
      if (caps) {
        for (const [ri, dir] of [[0, -1], [rows - 1, 1]]) {
          const k = classify({ cap: dir > 0 ? 'end' : 'start', z: zs[ri], tag: 'cap', i: ri, j: -1, x: 0, y: 0, ax: 0, side: 0 });
          if (k === null) continue;
          const out = put(k);
          let cx = 0, cy = 0;
          for (let j = 0; j < cols; j++) { cx += P[idx(ri, j) * 3]; cy += P[idx(ri, j) * 3 + 1]; }
          cx /= cols; cy /= cols;
          const base = pos.length / 3;
          pos.push(cx, cy, zs[ri]); nor.push(0, 0, dir); uv.push(cx, cy);
          for (let j = 0; j < cols; j++) {
            const o = idx(ri, j) * 3;
            pos.push(P[o], P[o + 1], P[o + 2]); nor.push(0, 0, dir); uv.push(P[o], P[o + 1]);
          }
          for (let j = 0; j < cols; j++) {
            const a = base + 1 + j, b = base + 1 + ((j + 1) % cols);
            // 前端 (dir>0) 法線朝 +Z
            const t = [base, a, b];
            // 判斷方向：以 (a-center)×(b-center) 的 z 分量
            const ax = pos[a * 3] - cx, ay = pos[a * 3 + 1] - cy, bx = pos[b * 3] - cx, by = pos[b * 3 + 1] - cy;
            const cz = ax * by - ay * bx;
            if ((cz > 0) === (dir > 0)) out.push(t[0], t[1], t[2]); else out.push(t[0], t[2], t[1]);
          }
        }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const index = [];
      const order = [...buckets.keys()];
      order.forEach((k, mi) => {
        const arr = buckets.get(k);
        if (!arr.length) return;
        g.addGroup(index.length, arr.length, mi);
        for (const v of arr) index.push(v);
      });
      g.setIndex(index);
      return { geometry: g, keys: order };
    },
    /** 取出符合 pred 的子曲面，沿法線偏移 offset（公尺）；回傳 BufferGeometry（或 null）。 */
    extract(pred, offset = 0.004) {
      const map = new Map();
      const pos = [], nor = [], uv = [], index = [];
      const vert = (v) => {
        if (map.has(v)) return map.get(v);
        const n = pos.length / 3;
        pos.push(P[v * 3] + N[v * 3] * offset, P[v * 3 + 1] + N[v * 3 + 1] * offset, P[v * 3 + 2] + N[v * 3 + 2] * offset);
        nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        uv.push(UV[v * 2], UV[v * 2 + 1]);
        map.set(v, n);
        return n;
      };
      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < nSeg; j++) {
          if (!pred(quadInfo(i, j))) continue;
          const a = vert(idx(i, j)), b = vert(idx(i + 1, j)), c = vert(idx(i + 1, j + 1)), d = vert(idx(i, j + 1));
          tri(index, a, b, d); tri(index, b, c, d);
        }
      }
      if (!index.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(index);
      return g;
    },
    /** 取得 +X 側半斷面第 k 點在 z 的位置（列間線性內插）。 */
    pointAt(z, k, side = 1) {
      let i = 0;
      while (i < rows - 2 && zs[i + 1] < z) i++;
      const t = clamp01((z - zs[i]) / (zs[i + 1] - zs[i]));
      const j = colOfHalf(k, side);
      const a = idx(i, j) * 3, b = idx(i + 1, j) * 3;
      return new THREE.Vector3(P[a] + (P[b] - P[a]) * t, P[a + 1] + (P[b + 1] - P[a + 1]) * t, P[a + 2] + (P[b + 2] - P[a + 2]) * t);
    },
  };
}

/**
 * 通用車身斷面：底板 → 輪拱內襯 → 拱唇 → 側面 → 肩線 → 頂面。
 * p 為在此 z 已求值的參數：
 *   yBot 底板高、hw 半寬（肩線處）、yBelt 肩線高、yTop 頂面中線高、n 頂面方正度（2=圓，4=方）
 *   tuck 下緣內收比例、archY 此 z 的輪拱開口高度（無拱 = yBot）、wellX 輪拱內襯 x
 *   bump 葉子板隆起高度、bumpX 隆起位置（0..1 寬度比）、crease 肩線是否做硬折
 *   sideBulge 側面中段外凸、ns/nt 側面/頂面點數
 */
export function bodySection(p) {
  const { yBot, hw, yBelt, yTop, n = 3, tuck = 0.08, archY = yBot, wellX = hw - 0.3, bump = 0, bumpX = 0.75, bumpW = 0.16,
    crease = false, sideBulge = 0, ns = 8, nt = 12, lipR = 0.022, sideTag = 'side', topTag = 'top', splitX = [], splitW = 0.008 } = p;
  const xAt = (y) => {
    const t = clamp01((yBelt - y) / Math.max(0.05, yBelt - yBot));
    return hw * (1 - tuck * t * t) + sideBulge * Math.sin(Math.PI * clamp01(1 - t)) * 0;
  };
  const lipY = Math.min(archY + lipR, yBelt - 0.03);
  const xLip = xAt(lipY);
  const pts = [];
  pts.push({ x: 0, y: yBot, tag: 'under' });
  pts.push({ x: Math.min(wellX, xLip - lipR - 0.01), y: yBot, tag: 'well' });
  pts.push({ x: Math.min(wellX, xLip - lipR - 0.01), y: Math.max(yBot, archY - 0.002), tag: 'well' });
  pts.push({ x: xLip - lipR, y: archY, tag: 'lip' });
  for (let k = 0; k < ns; k++) {
    const t = k / (ns - 1);
    const y = lipY + (yBelt - lipY) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    pts.push({ x: xAt(y) + sideBulge * Math.sin(Math.PI * t), y, tag: sideTag });
  }
  if (crease) pts.push({ ...pts[pts.length - 1], tag: topTag });
  else pts[pts.length - 1].tag = topTag;
  const h = yTop - yBelt;
  // θ 列表：均勻 nt 段，加上分線（splitX：寬度比位置）兩側各一點
  const ths = [];
  for (let k = 1; k <= nt; k++) ths.push({ th: (Math.PI / 2) * (k / nt), tag: topTag });
  for (const sx of splitX) {
    const w = splitW / Math.max(0.3, hw);
    const a = Math.acos(Math.pow(Math.min(1, sx + w / 2), n / 2));
    const b = Math.acos(Math.pow(Math.max(0, sx - w / 2), n / 2));
    ths.push({ th: a, tag: 'seam' }, { th: b, tag: topTag });
  }
  ths.sort((p, q) => p.th - q.th);
  for (const { th, tag } of ths) {
    const c = Math.cos(th), s = Math.sin(th);
    const xf = Math.pow(c, 2 / n);
    let y = yBelt + h * Math.pow(s, 2 / n);
    y += bump * Math.exp(-(((xf - bumpX) / bumpW) ** 2));
    pts.push({ x: hw * xf, y, tag });
  }
  pts[pts.length - 1].x = 0;
  return pts;
}

/** 端點圓角：在 z 接近端點時把斷面往中心收（半徑 r），回傳收縮量 0..r。 */
export function endInset(z, z0, z1, r0, r1 = r0) {
  if (z > z1 - r1) { const e = (z - (z1 - r1)) / r1; return r1 * (1 - Math.sqrt(Math.max(0, 1 - e * e))); }
  if (z < z0 + r0) { const e = ((z0 + r0) - z) / r0; return r0 * (1 - Math.sqrt(Math.max(0, 1 - e * e))); }
  return 0;
}

/** 對斷面點套用收縮（x 向中線、y 向斷面中心）。 */
export function insetSection(pts, d) {
  if (d <= 0) return pts;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const yc = (y0 + y1) / 2, hh = Math.max(0.02, (y1 - y0) / 2);
  const ky = Math.max(0.05, 1 - d / hh);
  return pts.map((p) => ({ ...p, x: Math.max(0, p.x - d * (p.x > 0.001 ? 1 : 0)), y: yc + (p.y - yc) * ky }));
}

/** 輪拱開口高度：wheels = [{z, r, y}]。 */
export function archHeight(z, yBot, wheels) {
  let a = yBot;
  for (const w of wheels) {
    const dz = z - w.z;
    if (Math.abs(dz) < w.r) a = Math.max(a, w.y + Math.sqrt(w.r * w.r - dz * dz));
  }
  return a;
}
