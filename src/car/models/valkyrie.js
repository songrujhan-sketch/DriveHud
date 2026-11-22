import { makeNozzle } from './nozzle.js?v=1.10.0';
// 女武神（valkyrie）— 原創低趴中置引擎 hypercar：
// 淚滴座艙、前葉子板高於引擎蓋的稜線、門後大型側進氣、長尾擴散器、鵝頸大尾翼。
// 全部為原創幾何，不參考任何既有車款造型或標誌。
import { bodyLoft, cabinLoft, loftDoors, loftDoorPreds, interiorMaterials, cabinInterior, regionHelpers, curve, smooth } from './kit.js?v=1.10.0';
import { band } from './loft.js?v=1.10.0';
import { makeMaterials, multiMesh, placeWheels, makeMirror, makeHeadSpot, roundBox, extrudeX, shapeOf, mesh, mirrored, merge } from './parts.js?v=1.10.0';

export const meta = { id: 'valkyrie', displayName: '女武神', roofY: 1.13 };

export function build(THREE, { color = '#c8102e' } = {}) {
  const group = new THREE.Group();
  group.name = 'valkyrie';
  const M = makeMaterials(THREE, color, { rim: 0x1c1e22, rimMetal: 0.85, rimRough: 0.3, caliper: 0xe2b21c });
  const Z0 = -2.34, Z1 = 2.3;
  const FW = { z: 1.4, r: 0.345, w: 0.27, x: 0.83 };
  const RW = { z: -1.34, r: 0.35, w: 0.33, x: 0.8 };

  // ── 側視／平面參數曲線 ──
  const yTop = curve([[Z0, 0.74], [-2.2, 0.82], [-1.9, 0.86], [-1.3, 0.86], [-0.9, 0.8], [0.0, 0.72], [0.6, 0.72], [0.9, 0.75], [1.4, 0.8], [1.8, 0.7], [2.1, 0.5], [Z1, 0.32]]);
  // 引擎蓋中央下凹（葉子板稜線高於引擎蓋），只作用在中間，不會讓輪拱頂穿出
  const bump = curve([[0.5, 0], [0.9, -0.06], [1.4, -0.12], [1.9, -0.1], [2.2, -0.06], [Z1, -0.02]]);
  const yBelt = curve([[Z0, 0.72], [-2.0, 0.8], [-1.34, 0.85], [-0.9, 0.78], [-0.5, 0.65], [0.3, 0.6], [0.85, 0.68], [1.4, 0.82], [1.8, 0.66], [2.1, 0.47], [Z1, 0.34]]);
  const hw = curve([[Z0, 0.92], [-1.9, 1.0], [-1.34, 1.03], [-1.0, 1.02], [-0.4, 0.96], [0.3, 0.95], [1.0, 0.99], [1.4, 1.02], [1.6, 1.01], [2.0, 0.94], [2.2, 0.84], [Z1, 0.68]]);
  const yBot = curve([[Z0, 0.27], [-1.95, 0.12], [1.9, 0.11], [Z1, 0.15]]);

  const doorF = 0.97, doorR = -0.18, hoodF = 2.06;
  const louvers = [];
  for (let z = -1.88; z < -1.3; z += 0.05) louvers.push(z);
  const body = bodyLoft(THREE, {
    z0: Z0, z1: Z1, step: 0.08, endR: [0.08, 0.1],
    wheels: [
      { z: FW.z, R: 0.405, y: FW.r, wellX: FW.x - FW.w / 2 - 0.05 },
      { z: RW.z, R: 0.41, y: RW.r, wellX: RW.x - RW.w / 2 - 0.05 },
    ],
    p: { yBot, hw, yBelt, yTop, n: 2.3, tuck: 0.14, bump, bumpX: 0, bumpW: 0.45 },
    ns: 7, nt: 10, splitX: [0.6],
    extraZ: [doorF - 0.005, doorF + 0.005, doorR - 0.005, doorR + 0.005, hoodF - 0.005, hoodF + 0.005, ...louvers],
    deform(pt, z) {
      // 門後側進氣：往內挖出漸深的導流槽
      if (pt.x > 0.5 && pt.tag !== 'under' && pt.tag !== 'well') {
        const u = (-0.22 - z) / 0.72; // 0 → 1 向後
        const d = 0.15 * smooth(u / 0.4) * smooth((1 - u) / 0.12) * band(pt.y, 0.27, 0.6, 0.06);
        pt.x -= d;
      }
      return pt;
    },
  });
  const R = regionHelpers(body);
  const isIntake = (q) => q.zr < -0.3 && q.zr > -0.9 && q.y > 0.3 && q.y < 0.57 && R.isSide(q);
  const bodyKey = (q) => {
    if (q.cap) return 'paint';
    if (q.tag === 'under') return 'under';
    if (q.tag === 'well') return 'under';
    const xf = R.xf(q);
    if (R.isSide(q)) {
      if (isIntake(q)) return 'grille';
      if ((Math.abs(q.zr - doorF) < 0.006 || Math.abs(q.zr - doorR) < 0.006) && q.y > 0.2) return 'gap';
      if (R.sideIdx(q) === 0 && q.tag === 'side' && q.zr > -1.0 && q.zr < 1.0) return 'carbon'; // 側裙
      return 'paint';
    }
    // 頂面
    if (q.tag === 'seam' && q.zr > 0.75 && q.zr < hoodF) return 'gap';
    if (Math.abs(q.zr - hoodF) < 0.006 && xf < 0.6) return 'gap';
    if (q.zr > 1.84 && q.zr < 2.12 && xf > 0.62 && xf < 0.97) return 'housing'; // 頭燈座
    if (q.zr < -1.3 && q.zr > -1.88 && xf < 0.5) { const i = Math.floor((q.zr + 1.88) / 0.05); return i % 2 ? 'gblack' : 'paint'; } // 引擎蓋百葉
    return 'paint';
  };
  // 車門與座艙地板在車體上挖空：門板另外掛在鉸鏈上，座艙底下的車身頂面拿掉後才看得到內裝
  const cabCb = curve([[-1.28, 0.55], [-0.9, 0.78], [-0.3, 0.86], [0.4, 0.86], [1.02, 0.78]]);
  const doorPreds = loftDoorPreds(body, { zF: doorF, zR: doorR, topXf: 0.84 });
  const cabinFloor = (q) => !q.cap && R.isTop(q) && q.zr > -0.6 && q.zr < 0.9 && q.ax < cabCb(q.zr) - 0.05;
  const bodyMesh = multiMesh(THREE, body.geometry((q) => (doorPreds.body(q) || cabinFloor(q) ? null : bodyKey(q)), ['paint', 'under', 'gap', 'grille', 'housing', 'gblack', 'carbon']), M);
  const I = interiorMaterials(THREE, 0xe2b21c);
  group.add(bodyMesh, new THREE.Mesh(bodyMesh.geometry, I.liner));

  // ── 頭燈：燈座內的發光條 + 透明燈罩 ──
  const headG = body.extract((q) => R.isTop(q) && q.zr > 1.9 && q.zr < 2.06 && R.xf(q) > 0.7 && R.xf(q) < 0.9, 0.006);
  const drlG = body.extract((q) => R.isTop(q) && q.zr > 1.86 && q.zr < 2.1 && R.xf(q) > 0.9 && R.xf(q) < 0.97, 0.005);
  const lensG = body.extract((q) => R.isTop(q) && q.zr > 1.82 && q.zr < 2.13 && R.xf(q) > 0.6 && R.xf(q) < 0.98, 0.016);
  const head = new THREE.Mesh(headG, M.head);
  const drl = new THREE.Mesh(drlG, M.drl);
  group.add(head, drl, new THREE.Mesh(lensG, M.lens));

  // ── 座艙：淚滴形，前擋／側窗／後窗分件 ──
  const cab = cabinLoft(THREE, {
    z0: -1.28, z1: 1.02, step: 0.055,
    yc: curve([[-1.28, 0.82], [-1.0, 0.97], [-0.7, 1.07], [-0.3, 1.125], [0.05, 1.11], [0.4, 0.99], [0.75, 0.8], [1.02, 0.64]]),
    yr: curve([[-1.28, 0.8], [-1.0, 0.93], [-0.7, 1.02], [-0.3, 1.07], [0.05, 1.055], [0.4, 0.94], [0.75, 0.76], [1.02, 0.62]]),
    rw: curve([[-1.28, 0.3], [-0.9, 0.42], [-0.3, 0.5], [0.3, 0.55], [0.8, 0.6], [1.02, 0.62]]),
    cb: cabCb,
    yb: (z) => yBelt(z) - 0.03,
    ys: curve([[-1.28, 0.84], [-0.8, 0.8], [0.0, 0.73], [0.8, 0.69], [1.02, 0.66]]),
    n: 2.0, bow: 0.05, nTop: 7,
    slant: (z) => -0.45 * smooth((z - 0.2) / 0.5) + 0.5 * smooth((-0.5 - z) / 0.4),
  });
  const zS0 = 0.82, zS1 = -0.92, zW = 0.12, zRw = -0.48;
  const cabKey = (q) => {
    if (q.tag === 'cabLow') return 'paint';
    if (q.tag === 'beltTrim' || q.tag === 'glass' || q.tag === 'frame') {
      if (q.zr < zS0 && q.zr > zS1) return q.tag === 'glass' ? 'glass' : 'gblack';
      return 'paint';
    }
    if (q.tag === 'rail') return 'paint';
    if (q.zr > zW) return 'glass'; // 前擋
    if (q.zr < zRw && q.zr > -1.18) return 'glass'; // 後窗（引擎窗）
    return 'carbon'; // 碳纖維車頂
  };
  const cabMesh = multiMesh(THREE, cab.geometry((q) => (doorPreds.cab(q) ? null : cabKey(q)), ['paint', 'glass', 'gblack', 'carbon']), M);
  group.add(cabMesh, new THREE.Mesh(cabMesh.geometry, I.liner));
  // 蝶翼門：鉸鏈在 A 柱根部，向前上方掀起並略為外張
  const doors = loftDoors(THREE, group, M, I, { body, cab, bodyKey, cabKey, preds: doorPreds, hinge: { point: [0.8, 0.7, doorF - 0.04], axis: [1, -0.45, 0.1], angle: 1.05 } });
  // 內裝：兩張桶形座椅、儀表台、方向盤、中央鞍座、座椅後方的引擎室隔板
  cabinInterior(THREE, group, I, {
    seats: [{ x: 0.34, z: -0.12, yBase: 0.13 }, { x: -0.34, z: -0.12, yBase: 0.13 }],
    dash: { z: 0.73, y: 0.58, w: 1.5, h: 0.12, len: 0.22 },
    wheel: { x: 0.34, y: 0.62, z: 0.55, r: 0.14 },
    console: { z: 0.15, y: 0.21, len: 0.95, w: 0.2, h: 0.16 },
    wall: { z: -0.56, w: 1.4, y0: 0.13, y1: 0.78 },
  });

  // 座艙脊線：從車頂延伸到尾部的車身色脊
  const spine = new THREE.Shape();
  spine.moveTo(-0.95, 0.8); spine.quadraticCurveTo(-1.15, 0.97, -1.45, 0.93); spine.quadraticCurveTo(-1.9, 0.9, -2.2, 0.85); spine.lineTo(-2.2, 0.8); spine.closePath();
  group.add(mesh(THREE, extrudeX(THREE, spine, 0.1, { bevel: 0.03, bevelSegments: 3, curveSegments: 10 }), M.paint));

  // ── 後視鏡 ──
  for (const d of doors) { // 後視鏡裝在門上，跟著門動
    const m = makeMirror(THREE, M, { len: 0.2, arm: 0.12 });
    m.position.set(d.sign * 0.8, 0.74, 0.42);
    m.rotation.y = d.sign * -0.1;
    if (d.sign < 0) m.scale.x = -1;
    m.position.sub(d.pivot.position);
    d.pivot.add(m);
  }

  // ── 前分流板、擴散器、尾翼、尾燈、排氣 ──
  const splitter = shapeOf(THREE, [[-0.74, 0], [0.74, 0], [0.7, 0.3], [-0.7, 0.3]]);
  const spl = new THREE.Mesh(new THREE.ExtrudeGeometry(splitter, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.008, bevelSegments: 2 }), M.carbon);
  // 前臉下方進氣格柵（跟著鼻頭斜面）
  group.add(mesh(THREE, roundBox(THREE, 1.1, 0.075, 0.04, 0.02), M.grille, [0, 0.2, 2.255], [0.55, 0, 0]));
  mirrored(group, () => mesh(THREE, roundBox(THREE, 0.32, 0.06, 0.04, 0.02), M.grille, [0.62, 0.24, 2.17], [0.5, 0.45, 0]));
  spl.rotation.x = -Math.PI / 2; spl.position.set(0, 0.1, 2.25);
  spl.material = M.gblack;
  group.add(spl);
  // 擴散器：斜板 + 6 片導流鰭
  const diff = mesh(THREE, roundBox(THREE, 1.5, 0.02, 0.62, 0.008), M.carbon, [0, 0.21, -2.07], [-0.32, 0, 0]);
  group.add(diff);
  const fins = [];
  for (let i = -2.5; i <= 2.5; i += 1) {
    const g = roundBox(THREE, 0.018, 0.16, 0.58, 0.006);
    g.rotateX(-0.32); g.translate(i * 0.26, 0.24, -2.07);
    fins.push(g);
  }
  group.add(new THREE.Mesh(merge(THREE, fins), M.carbon));
  // 尾翼：翼型擠出 + 端板 + 鵝頸支柱
  const foil = new THREE.Shape();
  foil.moveTo(0.2, 0.0); foil.bezierCurveTo(0.12, 0.05, -0.12, 0.07, -0.22, 0.035); foil.lineTo(-0.23, 0.02);
  foil.bezierCurveTo(-0.1, 0.0, 0.08, -0.02, 0.2, 0.0);
  const wing = mesh(THREE, extrudeX(THREE, foil, 1.9, { bevel: 0.008, bevelSegments: 2, curveSegments: 10 }), M.carbon, [0, 1.12, -2.06], [0.1, 0, 0]);
  group.add(wing);
  const plate = shapeOf(THREE, [[0.22, -0.12], [-0.28, -0.08], [-0.26, 0.1], [0.18, 0.06]]);
  mirrored(group, () => mesh(THREE, extrudeX(THREE, plate, 0.02, { bevel: 0.006 }), M.carbon, [0.96, 1.12, -2.06]));
  const neck = new THREE.Shape();
  neck.moveTo(0.05, 0); neck.quadraticCurveTo(0.12, 0.18, 0.02, 0.3); neck.lineTo(-0.06, 0.3); neck.quadraticCurveTo(0.0, 0.16, -0.08, 0); neck.closePath();
  mirrored(group, () => mesh(THREE, extrudeX(THREE, neck, 0.03, { bevel: 0.008, curveSegments: 8 }), M.gblack, [0.42, 0.84, -1.98]));
  // 尾燈：C 形細燈條 + 深色燈座
  const tails = [];
  const tailBack = mesh(THREE, roundBox(THREE, 1.72, 0.1, 0.03, 0.01), M.gblack, [0, 0.62, Z0 - 0.002]);
  group.add(tailBack);
  const tl = mesh(THREE, roundBox(THREE, 1.62, 0.022, 0.025, 0.008), M.tail, [0, 0.645, Z0 - 0.012]);
  group.add(tl); tails.push(tl);
  tails.push(...mirrored(group, () => mesh(THREE, roundBox(THREE, 0.022, 0.09, 0.025, 0.008), M.tail, [0.8, 0.61, Z0 - 0.012])));
  // 中央雙排氣（深色金屬管）
  for (const x of [-.102,.102]) {
    const pipe = makeNozzle(THREE,M,.078,.12);
    pipe.position.set(x,.39,Z0-.146);
    group.add(pipe);
  }

  const light = makeHeadSpot(THREE, group, { y: 0.45, z: 2.2 });

  // ── 車輪：7 細輻 + 黃色卡鉗 ──
  const wheels = placeWheels(THREE, group, M, [
    { ...FW, radius: FW.r, width: FW.w, spokes: 7, spokeW: [0.05, 0.03], concave: 0.035, rimRatio: 0.72 },
    { ...RW, radius: RW.r, width: RW.w, spokes: 7, spokeW: [0.05, 0.03], concave: 0.05, rimRatio: 0.72 },
  ]);

  return {
    group, wheels, bodyMaterials: [M.paint],
    headlights: { meshes: [head], drl: [drl], light }, taillights: tails, doors, meta,
  };
}
