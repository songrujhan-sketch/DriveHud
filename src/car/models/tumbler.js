import { makePlume } from './plume.js?v=1.10.0';
import { makeMaterials, makeHeadSpot, mesh, placeWheels, merge, roundBox } from './parts.js?v=1.10.0';

import { cabinInterior, interiorMaterials } from './kit.js?v=1.10.0';

export const meta = { id: 'tumbler', displayName: '重騎兵', roofY: 1.17 };

// Stations and armor outlines are retained from the first DriveHUD Tumbler.
// Station coordinates run from nose to tail; the showroom points the nose along +Z.
const hull = [
  [-2.55, .07, .24, .37], [-2.25, .70, .22, .49], [-1.72, 1.03, .20, .78],
  [-1.13, 1.06, .21, .84], [-.72, .94, .20, .76], [.38, .95, .19, .77],
  [.73, 1.08, .21, .97], [1.84, .64, .58, .99], [2.30, .52, .58, .85],
];

export function build(THREE, { color = '#393c3f' } = {}) {
  const group = new THREE.Group();
  group.name = meta.id;
  const M = makeMaterials(THREE, color, { rim: 0x45484a, rimMetal: .75, rimRough: .4, caliper: 0x584938 });
  Object.assign(M.paint, { clearcoat: .38, roughness: .41, metalness: .45 });
  const xyz = ([station, height, width]) => new THREE.Vector3(width, height, -station);
  const plates = new Map();
  const heads = [], tails = [], doors = [];
  function panel(material, points, parent = group) {
    material.side = THREE.DoubleSide;
    if (!plates.has(parent)) plates.set(parent, new Map());
    const batch = plates.get(parent);
    if (!batch.has(material)) batch.set(material, []);
    const positions = batch.get(material);
    for (let i = 1; i < points.length - 1; i++) {
      for (const p of [points[0], points[i], points[i + 1]]) {
        positions.push(...xyz(p).sub(parent.position).toArray());
      }
    }
  }
  function rod(a, b, radius, material, parent = group) {
    const start = xyz(a), end = xyz(b), axis = end.clone().sub(start);
    const part = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, axis.length(), 8), material);
    part.position.copy(start).lerp(end, .5).sub(parent.position);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
    parent.add(part);
    return part;
  }
  const wheelOptions = { spokes: 8, tread: 'offroad', lugs: 8, segments: 36, rimRatio: .65 };
  function armor(points, side, parent = group, thickness = .028, edge = .055, mat = M.paint) {
    const centroid = points[0].map((_,i)=>points.reduce((v,p)=>v+p[i],0)/points.length);
    const n = xyz(points[1]).sub(xyz(points[0])).cross(xyz(points[2]).sub(xyz(points[0]))).normalize();
    if (n.dot(xyz(side)) < 0) n.negate();
    const lift = [-n.z,n.y,n.x];
    const top = points.map(p => p.map((v,i) => THREE.MathUtils.lerp(v,centroid[i],edge)+lift[i]*thickness));
    panel(mat,top,parent);
    for(let i=0;i<points.length;i++){
      const j=(i+1)%points.length;
      panel(mat,[points[i],points[j],top[j],top[i]],parent);
    }
    return top;
  }
  // Repeated exposed fasteners share a batch for each independently moving assembly.
  const fasteners=new Map();
  function bolt(p,axis,parent=group) {
    const g=new THREE.CylinderGeometry(.014,.016,.012,6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),xyz(axis).normalize()));
    g.translate(...xyz(p).sub(parent.position).toArray());
    if (!fasteners.has(parent)) fasteners.set(parent,[]);
    fasteners.get(parent).push(g);
  }
  const wheels = placeWheels(THREE, group, M, [
    { ...wheelOptions, x: 1.02, z: 1.54, radius: .416, width: .39 },
    { ...wheelOptions, x: .84, z: -1.73, radius: .53, width: .40 },
    { ...wheelOptions, x: 1.30, z: -1.73, radius: .53, width: .40 },
  ]);
  // Raised alternating cleats sit proud of the grooved off-road tire shoulders.
  const treadCache=new Map();
  for (const w of wheels) {
    const r=w.position.y, width=r>.5?.40:.39;
    if(!treadCache.has(r)){
      const blocks=[];
      for(let i=0;i<32;i++) for(const shoulder of [-1,1]){
        const a=(i+shoulder*.17)*Math.PI/16;
        const g=new THREE.BoxGeometry(width*.47,.027,.064);
        g.rotateY(shoulder*.36); g.translate(shoulder*width*.22,r-.002,0);
        g.rotateX(a); blocks.push(g);
      }
      treadCache.set(r,merge(THREE,blocks));
    }
    w.add(new THREE.Mesh(treadCache.get(r),M.tire));
  }
  for (const s of [-1, 1]) {
    const section = ([x, w, b, h]) =>
      [[x,h+.045,0], [x,h,s*w*.72], [x,h-.12,s*w], [x,b+.12,s*w*1.015], [x,b,s*w*.80]];
    for (let i = 1; i < hull.length; i++) {
      const a = section(hull[i-1]), b = section(hull[i]);
      const cockpit = hull[i-1][0]>=-.72 && hull[i][0]<=.38;
      if(!cockpit) for (let j=0;j<4;j++) panel(j===3 ? M.trim : M.paint,[a[j],b[j],b[j+1],a[j+1]]);
      else panel(M.trim,[a[4],b[4],[b[4][0],.39,b[4][2]],[a[4][0],.39,a[4][2]]]);
      panel(M.under, [a[4],b[4],[b[4][0],b[4][1],0],[a[4][0],a[4][1],0]]);
    }
    for (const [x,r,inner,outer] of [[-1.54,.416,.85,1.255],[1.73,.53,.64,1.52]]) {
      const band = (i,w,drop = 0) => {
        const a = .13 + (Math.PI-.26)*i/7;
        return [x+(r+.092)*Math.cos(a),r+(r+.093)*Math.sin(a)-drop,s*w];
      };
      for (let i = 0; i < 7; i++) {
        armor([band(i,inner),band(i+1,inner),band(i+1,outer),band(i,outer)],[0,1,s*.1],group,.018,.045);
        if(i%2===1)bolt(band(i+.48,outer-.043,-.023),[0,1,s*.25]);
        panel(M.trim,[band(i,outer),band(i+1,outer),band(i+1,outer,.074),band(i,outer,.074)]);
      }
    }
    armor([[-2.52,.426,s*.035],[-1.65,.866,s*.79],[-.83,.825,s*.64],[-1.05,.83,s*.16]],[0,1,0]);
    panel(M.trim,[[-2.38,.448,s*.12],[-1.71,.845,s*.60],[-1.09,.835,s*.33]]);
    panel(M.trim,[[-2.20,.44,s*.66],[-1.79,.69,s*.948],[-1.92,.50,s*1.014]]);
    panel(M.trim,[[.67,.86,s*1.072],[1.21,.895,s*1.091],[1.10,.655,s*1.16],[.81,.59,s*1.15]]);
    panel(M.trim,[[-.8,.25,s],[.58,.25,s*1.07],[.48,.40,s*1.1],[-.67,.39,s*1.06]]);
    // Paired prow blades and the deeper center wedge form three distinct leading points.
    armor([[-2.43,.41,s*.69],[-2.28,.54,s*.48],[-1.73,.79,s*.78],[-1.91,.62,s*1.00]],[0,1,s*.2],group,.038);
    armor([[-2.55,.345,s*.045],[-2.32,.49,s*.18],[-2.02,.56,s*.30],[-2.14,.375,s*.38]],[0,1,s*.3],group,.045);
    for (const p of [[-2.31,.48,s*.66],[-1.86,.73,s*.82],[-1.36,.86,s*.46]]) bolt(p,[0,1,s*.2]);
    for(let i=0;i<4;i++) {
      const x=-2.05+i*.074;
      armor([[x,.59+i*.038,s*.25],[x+.031,.608+i*.038,s*.26],[x+.12,.659+i*.037,s*.49],[x+.088,.644+i*.037,s*.50]],
        [0,1,s*.1],group,.017,.12,M.gblack);
    }
    rod([-1.93,.33,s*.61],[-1.54,.416,s*.93],.035,M.darkChrome);
    rod([-.99,.41,s*.64],[-1.54,.416,s*.93],.036,M.darkChrome);
    rod([-.97,.65,s*.72],[-1.47,.41,s*.91],.049,M.trim);
    rod([-1.14,.565,s*.80],[-1.47,.41,s*.91],.028,M.chrome);
    rod([-2.48,.26,0],[-2.04,.277,s*.87],.028,M.trim);
    heads.push(rod([-2.27,.475,s*.53],[-1.82,.735,s*.90],.022,M.head));
    const A=[-.99,.813,s*.66], B=[-.27,1.139,s*.46], C=[.37,1.12,s*.46], D=[.68,.84,s*.72];
    panel(M.glass,[[-1.09,.834,0],[-.31,1.17,0],B,A]);
    panel(M.trim,[[-.31,1.17,0],[.39,1.16,0],C,B]);
    panel(M.paint,[[.39,1.16,0],[.84,1.015,0],D,C]);
    rod(A,B,.026,M.trim); rod(C,D,.032,M.trim);

    const pivot = new THREE.Group();
    pivot.position.set(s*.46,1.13,0);
    group.add(pivot);
    const beltF=[-.86,.77,s*.90], beltR=[.53,.79,s*.93], lowF=[-.67,.43,s*1.005], lowR=[.42,.45,s*1.015];
    panel(M.glass,[beltF,B,C,beltR],pivot);
    armor([beltF,beltR,lowR,lowF],[0,.1,s],pivot,.033,.045);
    const sideArmor=armor([[-.61,.48,s*1.012],[.34,.50,s*1.026],[.42,.73,s*.96],[-.35,.70,s*.98]],
      [0,.24,s],pivot,.033,.065);
    for (const p of sideArmor) bolt(p,[0,.24,s],pivot);
    // Inside the open door, a padded panel and grab handle cover the armor fasteners.
    panel(M.trim,[[-.60,.47,s*.98],[.32,.49,s*.985],[.43,.72,s*.912],[-.65,.72,s*.912]],pivot);
    rod([-.21,.60,s*.924],[.13,.61,s*.924],.022,M.gblack,pivot);
    for (const [a,b] of [[B,C],[B,beltF],[C,beltR],[beltF,beltR],[lowF,lowR]]) rod(a,b,.021,M.trim,pivot);
    rod([.22,.699,s*.963],[.39,.703,s*.963],.014,M.gblack,pivot);
    doors.push({ pivot, axis: new THREE.Vector3(0,0,1), sign: s, max: 1.70 });
    for (let i=0; i<4; i++) {
      const x=.78+i*.27;
      armor([[x,.994,s*.27],[x+.15,1.064,s*.32],[x+.24,1.058,s*.77],[x+.04,.982,s*.81]],[0,1,0],group,.025,.085,M.trim);
    }
    const lamp=mesh(THREE,new THREE.BoxGeometry(.28,.052,.035),M.tail,[s*.47,.715,-2.34]);
    group.add(lamp); tails.push(lamp);
  }
  for(const [parent,geometries] of fasteners) parent.add(new THREE.Mesh(merge(THREE,geometries),M.darkChrome));
  // A lowered floor, two bucket seats, gauges and a deep firewall are visible through the door apertures.
  const cockpit=new THREE.Group();
  cockpit.position.y=.26; group.add(cockpit);
  const inside=interiorMaterials(THREE,0x707373);
  cabinInterior(THREE,cockpit,inside,{
    seats:[{x:.34,z:-.18,w:.43,back:.46,cushion:.35,yBase:.05},{x:-.34,z:-.18,w:.43,back:.46,cushion:.35,yBase:.05}],
    dash:{z:.59,y:.49,w:1.14,h:.14,len:.19},wheel:{x:.34,y:.45,z:.41,r:.105},
    console:{w:.18,h:.19,z:.08,y:.10,len:.63},screen:{y:.56,z:.475},wall:{z:-.37,w:1.37,y0:.04,y1:.69},
  });
  cockpit.add(mesh(THREE,roundBox(THREE,1.56,.065,1.25,.02),inside.trim,[0,.018,.06]));
  for(const x of [-.61,.61])cockpit.add(mesh(THREE,roundBox(THREE,.10,.11,1.15,.02),inside.trim,[x,.10,0]));
  for(const x of [.29,.40])cockpit.add(mesh(THREE,new THREE.CircleGeometry(.04,16),inside.screen,[x,.575,.486],[0,Math.PI,0]));
  for (const [parent, batch] of plates) {
    for (const [material, coords] of batch) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
      const uv=[];
      for(let i=0;i<coords.length;i+=3) uv.push(coords[i]+coords[i+2]*.35,coords[i+1]+coords[i+2]*.60);
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      geometry.computeVertexNormals();
      parent.add(new THREE.Mesh(geometry,material));
    }
  }
  group.add(mesh(THREE,new THREE.BoxGeometry(1.16,.4,.09),M.trim,[0,.64,-2.28]));
  const nozzle=mesh(THREE,new THREE.CylinderGeometry(.32,.267,.21,32,1,true),M.darkChrome,[0,.59,-2.385],[Math.PI/2,0,0]);
  group.add(nozzle);
  // Nozzle collar, overlapping tapered petals, recessed turbine blades, and outer guard ring.
  const petals=[],vanes=[];
  for(let i=0;i<20;i++){
    const a=i*Math.PI/10;
    const petal=new THREE.BoxGeometry(.082,.025,.19);
    petal.rotateX(-.22);petal.translate(0,.288,-.005);petal.rotateZ(a);petals.push(petal);
    const vane=new THREE.BoxGeometry(.028,.128,.024);
    vane.rotateZ(.36);vane.translate(0,.145,0);vane.rotateZ(a);vanes.push(vane);
  }
  group.add(mesh(THREE,merge(THREE,petals),M.darkChrome,[0,.59,-2.405]));
  group.add(mesh(THREE,merge(THREE,vanes),M.rim,[0,.59,-2.477]));
  group.add(mesh(THREE,new THREE.TorusGeometry(.271,.014,8,32),M.darkChrome,[0,.59,-2.493]));
  group.add(mesh(THREE,new THREE.TorusGeometry(.322,.023,8,32),M.trim,[0,.59,-2.302]));
  const coreMaterial = new THREE.MeshStandardMaterial({color:0x302021,emissive:0xff722d,emissiveIntensity:0});
  group.add(mesh(THREE,new THREE.CircleGeometry(.262,32),coreMaterial,[0,.59,-2.47],[0,Math.PI,0]));
  const plume = makePlume(THREE, [[.23,.86,0xff6b21,.48],[.17,.53,0xffd887,.82],[.11,.28,0xd7eeff,1]]);
  plume.position.set(0,.59,-2.49);
  group.add(plume);
  let jetPreview=false, elapsed=0, power=0;
  function animate(dt,speedMps) {
    const target=jetPreview ? 1 : THREE.MathUtils.clamp((speedMps-1.5)/18,0,1);
    power=THREE.MathUtils.damp(power,target,5,dt);
    if (Math.abs(power-target)<.004) power=target;
    elapsed+=dt;
    plume.visible=power>.008;
    plume.scale.z=Math.max(.001,power*(.93+.07*Math.sin(elapsed*28)));
    for(const layer of plume.children) layer.material.uniforms.tick.value=elapsed;
    coreMaterial.emissiveIntensity=3*power;
    return plume.visible || target>0;
  }
  return {
    group,wheels,bodyMaterials:[M.paint],headlights:{meshes:heads,drl:[],light:makeHeadSpot(THREE,group,{y:.52,z:2.28})},
    taillights:tails,doors,animate,meta,setJetPreview(on){jetPreview=on;},
  };
}
