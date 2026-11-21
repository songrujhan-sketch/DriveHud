import { makeMaterials, mesh, roundBox, makeHeadSpot } from './parts.js';
import { interiorMaterials, cabinInterior } from './kit.js';
import { makeNozzle } from './nozzle.js';
import { makePlume } from './plume.js';

export const meta = { id:'daystar', displayName:'明日之星', roofY:1.64 };

export function build(T, {color='#c8d0d5'}={}) {
  const group = new T.Group();
  group.name = 'daystar';
  const M = makeMaterials(T,color);
  const I = interiorMaterials(T,0x177988);
  const suit = new T.MeshStandardMaterial({color:0xe4e9e7,metalness:.35,roughness:.32});
  const visor = new T.MeshPhysicalMaterial({color:0x164655,metalness:.65,roughness:.12,clearcoat:1});
  const beacon = new T.MeshStandardMaterial({color:0xb4ffff,emissive:0x37c8de,emissiveIntensity:1.4});
  const hull = new T.Group();
  group.add(hull);
  const ball = (parent,material,center,scale) => {
    const part=mesh(T,new T.SphereGeometry(1,28,18),material,center);
    part.scale.set(...scale);
    parent.add(part);
    return part;
  };
  const box = (parent,material,center,size,r=.025) => {
    const part=mesh(T,roundBox(T,...size,r),material,center);
    parent.add(part);
    return part;
  };
  const rod = (parent,a,b,r,material) => {
    const from=new T.Vector3(...a), to=new T.Vector3(...b), axis=to.clone().sub(from);
    const part=new T.Mesh(new T.CylinderGeometry(r,r,axis.length(),14),material);
    part.position.copy(from).lerp(to,.5);
    part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());
    parent.add(part);
  };
  // Smooth elliptical sections sweep aft from the nose into two engine nacelles.
  function fuselage(sections,material) {
    const n=32, vertices=[], indices=[];
    for (const [z,x,y,w,h] of sections) {
      for(let j=0;j<=n;j++) {
        const angle=2*Math.PI*j/n;
        vertices.push(x+w*Math.cos(angle),y+h*Math.sin(angle),z);
      }
    }
    for(let i=0;i<sections.length-1;i++) for(let j=0;j<n;j++) {
      const a=i*(n+1)+j,b=a+n+1;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    hull.add(new T.Mesh(geometry,material));
  }
  function foil(outline,height,thickness,material) {
    const shape=new T.Shape(outline.map(([x,z])=>new T.Vector2(x,z)));
    shape.closePath();
    const geo=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSize:.017,bevelThickness:.012,bevelSegments:2});
    geo.rotateX(Math.PI/2);
    hull.add(mesh(T,geo,material,[0,height,0]));
  }
  ball(hull,M.carbon,[0,.61,0],[1.04,.21,2.05]);
  fuselage([[-.02,0,.78,.02,.025],[.54,0,.83,.89,.19],[1.08,0,.9,.85,.28],
    [1.63,0,.88,.66,.21],[2.10,0,.81,.35,.11],[2.38,0,.80,.025,.022]],M.paint);
  box(hull,I.trim,[0,.76,-.22],[1.57,.13,1.63]);
  const heads=[],tails=[],doors=[],jets=[];
  function nozzle(x,y,z,r,down=false) {
    const g=makeNozzle(T,M,r,r*1.12,true);
    g.position.set(x,y,z);
    if(down) g.rotation.x=-Math.PI/2;
    hull.add(g);
    const fire=makePlume(T,[[r*.84,r*(down?1.8:4.8),0x6bd7ff,.65],[r*.61,r*(down?1.3:3.4),0xe3ffff,.92]]);
    fire.position.copy(g.position);
    fire.rotation.copy(g.rotation);
    hull.add(fire);
    jets.push({fire,down});
  }
  for(const sign of [-1,1]) {
    const pod=[[-2.05,.80,.83,.17,.17],[-1.77,.83,.86,.29,.29],[-1.32,.85,.87,.33,.34],
      [-.79,.91,.83,.23,.24],[-.45,.96,.81,.17,.16],[.26,.97,.80,.15,.15],
      [.95,.91,.85,.23,.23],[1.51,.78,.86,.24,.20],[1.96,.66,.84,.14,.10],[2.20,.59,.83,.008,.012]];
    fuselage(pod.map(([z,x,y,w,h])=>[z,x*sign,y,w,h]),M.paint);
    foil([[.94,-.5],[1.63,-1.30],[1.52,-1.34],[.88,-.99]].map(([x,z])=>[x*sign,z]),.82,.045,M.carbon);
    rod(hull,[sign*.67,.94,-1.45],[sign*.71,1.34,-1.84],.037,M.darkChrome);
    rod(hull,[sign*.58,.94,-.95],[sign*.58,1.30,-1.10],.045,M.chrome);
    rod(hull,[sign*.58,1.30,-1.10],[sign*.29,1.30,-1.10],.045,M.chrome);
    heads.push(ball(hull,M.head,[sign*.72,.926,1.79],[.095,.027,.18]));
    tails.push(box(hull,M.tail,[sign*.80,1.03,-1.98],[.25,.026,.04],.01));
    nozzle(sign*.80,.83,-2.12,.175);
    for(const z of [-1.12,1.12]) nozzle(sign*.78,.53,z,.18,true);
    const pivot=new T.Group(); pivot.position.set(sign*.86,.86,.48);
    box(pivot,M.paint,[sign*.027,.09,-.54],[.15,.20,1.07],.065);
    box(pivot,I.trim,[0,.19,-.54],[.14,.032,.95],.014);
    hull.add(pivot);
    doors.push({pivot,axis:new T.Vector3(0,1,0),sign:-sign,max:.90});
  }
  foil([[-1.2,-2.11],[-.82,-1.85],[0,-1.68],[.82,-1.85],[1.2,-2.11],[1.17,-2.18],[0,-1.95],[-1.17,-2.18]],1.37,.055,M.paint);
  cabinInterior(T,hull,I,{
    seats:[-.40,.40].map(x=>({x,z:-.82,yBase:.84,w:.48,back:.52,recline:.24})),
    dash:{w:1.47,y:1.01,z:.61,h:.16,len:.21},wheel:{x:.4,y:1.12,z:.34,r:.15},
    console:{w:.18,h:.18,len:.92,y:.90,z:-.10},screen:{y:1.14,z:.51}
  });
  // Articulated driver: both hands meet the wheel, passenger seat stays empty.
  const x=.40;
  ball(hull,M.trim,[x,1.10,-.55],[.195,.23,.13]);
  ball(hull,suit,[x,1.19,-.56],[.184,.172,.12]);
  rod(hull,[x,1.29,-.55],[x,1.42,-.53],.075,M.darkChrome);
  ball(hull,suit,[x,1.50,-.52],[.163,.185,.164]);
  ball(hull,visor,[x,1.515,-.459],[.157,.103,.132]);
  ball(hull,beacon,[x,1.531,-.331],[.091,.009,.009]);
  for(const s of [-1,1]) {
    const shoulder=[x+s*.18,1.24,-.52], elbow=[x+s*.235,1.02,-.19], hand=[x+s*.14,1.12,.32];
    ball(hull,suit,shoulder,[.084,.082,.08]);
    rod(hull,shoulder,elbow,.058,M.trim);
    ball(hull,M.darkChrome,elbow,[.061,.061,.061]);
    rod(hull,elbow,hand,.051,suit);
    ball(hull,M.trim,hand,[.055,.051,.06]);
    rod(hull,[x+s*.09,.95,-.50],[x+s*.11,.94,.09],.082,M.trim);
    ball(hull,M.darkChrome,[x+s*.15,1.50,-.52],[.029,.064,.064]);
  }
  let elapsed=0,preview=0;
  function animate(dt,speed) {
    elapsed+=dt;
    preview=Math.max(0,preview-dt);
    const power=preview>0 ? 1 : Math.min(1,speed/16);
    hull.position.y=.018*Math.sin(elapsed*2.1);
    for(const {fire,down} of jets) {
      fire.visible=down || power>.01;
      fire.scale.z=down ? .57+.09*Math.sin(elapsed*4) : Math.max(.001,power);
      for(const layer of fire.children) layer.material.uniforms.tick.value=elapsed;
    }
    return true;
  }
  return {group,wheels:[],doors,bodyMaterials:[M.paint],headlights:{meshes:heads,drl:[],light:makeHeadSpot(T,hull,{y:.91,z:2.05})},
    taillights:tails,animate,setJetPreview(on){preview=on?2.5:0;},meta};
}
