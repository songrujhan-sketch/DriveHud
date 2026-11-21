import { curve } from './loft.js';
import {mesh,roundBox,makeMaterials,merge} from './parts.js';

export const meta={id:'carriage',displayName:'馬車',roofY:2.75};
export function build(T,{color='#304850'}={}){
  const group=new T.Group(),M=makeMaterials(T,color),doors=[],wheels=[],lamps=[],lanternLights=[];
  const mat=(color,metalness=0,roughness=.68)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const gold=mat(0xcda557,.72,.29),wood=mat(0x40231b),leather=mat(0x30231f),velvet=mat(0x7b2936);
  const ivory=mat(0xeee8db),mane=mat(0xc5bdb0),hoof=mat(0x635953),coat=mat(0x18242b);
  const globe=mat(0xffe1a4,.1,.25);globe.emissive.setHex(0xffbc62);
  const glass=new T.MeshPhysicalMaterial({color:0xa1c7c9,transparent:true,opacity:.27,roughness:.13,depthWrite:false});
  const sphere=new T.SphereGeometry(1,20,14);
  function egg(g,m,x,y,z,w,h,l,tilt=0){
    const part=mesh(T,sphere,m,[x,y,z],[tilt,0,0]);
    part.scale.set(w,h,l);g.add(part);return part;
  }
  function block(g,m,x,y,z,w,h,l,r=.025){
    const part=mesh(T,roundBox(T,w,h,l,r),m,[x,y,z]);g.add(part);return part;
  }
  function rod(g,m,a,b,r,r2=r){
    const u=new T.Vector3(...a),v=new T.Vector3(...b),axis=v.clone().sub(u);
    const part=new T.Mesh(new T.CylinderGeometry(r2,r,axis.length(),10),m);
    part.position.copy(u).lerp(v,.5);part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());
    g.add(part);return part;
  }
  function cord(g,m,coords,r){
    const path=new T.CatmullRomCurve3(coords.map(v=>new T.Vector3(...v)));
    g.add(new T.Mesh(new T.TubeGeometry(path,20,r,6,false),m));
  }
  // Batch the rigid coat, harness and trim before instancing the four horses.
  function pack(g){
    const byMaterial=new Map();
    for(const o of [...g.children]){
      if(!o.isMesh)continue;
      o.updateMatrix();const geo=o.geometry.clone().applyMatrix4(o.matrix);
      if(!byMaterial.has(o.material))byMaterial.set(o.material,[]);
      byMaterial.get(o.material).push(geo);g.remove(o);
    }
    for(const [m,geos] of byMaterial) g.add(new T.Mesh(merge(T,geos),m));
  }
  const horse=new T.Group();
  egg(horse,ivory,0,1.23,-.05,.275,.37,.71);
  egg(horse,ivory,0,1.25,-.48,.28,.335,.35);
  egg(horse,ivory,0,1.29,.39,.255,.41,.31,.09);
  egg(horse,ivory,0,1.62,.55,.172,.46,.237,.46);
  egg(horse,mane,0,1.70,.418,.098,.41,.145,.48);
  const muzzle=mat(0xbeb6ae,.03,.63), eye=mat(0x211b19,.07,.23), earInner=mat(0xb3928c);
  // The skull tapers from the poll and cheek to a broad, rounded muzzle.
  const headProfiles=[
    [.61,1.97,.015,.018],[.68,1.989,.109,.158],[.78,1.959,.154,.198],
    [.88,1.909,.133,.174],[.98,1.848,.103,.134],
    [1.085,1.798,.097,.105],[1.167,1.771,.107,.084],[1.221,1.766,.085,.066],
    [1.248,1.775,.005,.007],
  ];
  const profile=[1,2,3].map(i=>curve(headProfiles.map(row=>[row[0],row[i]])));
  const facial=new T.BufferGeometry(), positions=[], indices=[], tones=[];
  const rows=26, sides=24;
  for(let row=0;row<=rows;row++){
    const z=.61+.638*row/rows;
    const [y,w,h]=profile.map(sample=>sample(z));
    for(let j=0;j<=sides;j++){
      const angle=2*Math.PI*j/sides;
      positions.push(w*Math.cos(angle),y+h*Math.sin(angle),z);
      const fade=T.MathUtils.smoothstep(z,1.075,1.23)*(.66+.32*Math.max(0,-Math.sin(angle)));
      tones.push(...ivory.color.clone().lerp(muzzle.color,fade).toArray());
      if(row<rows && j<sides){
        const i=row*(sides+1)+j,k=i+sides+1;
        indices.push(i,i+1,k,i+1,k+1,k);
      }
    }
  }
  facial.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  facial.setAttribute('color',new T.Float32BufferAttribute(tones,3));
  facial.setIndex(indices);
  facial.computeVertexNormals();
  const facialMat=mat(0xffffff);facialMat.vertexColors=true;
  // Leave vertex colours on this mesh; the rigid harness batch uses position/normal/UV only.
  const headMesh=new T.Mesh(facial,facialMat);
  const faceDetails=new T.Group();faceDetails.add(headMesh);horse.add(faceDetails);
  for(const s of [-1,1]){
    const ear=egg(horse,ivory,s*.086,2.193,.715,.047,.125,.045,-.16);
    ear.rotation.z=-s*.22;
    const inside=egg(horse,earInner,s*.101,2.208,.744,.027,.084,.018,-.16);
    inside.rotation.z=-s*.22;
    egg(horse,ivory,s*.132,2.025,.838,.027,.046,.055,-.36);
    egg(horse,eye,s*.151,2.034,.846,.014,.025,.033,-.34);
    egg(horse,muzzle,s*.090,1.805,1.179,.033,.038,.052,-.47);
    const nostril=egg(horse,eye,s*.107,1.811,1.195,.012,.024,.033,-.54);
    nostril.rotation.y=s*.35;
    cord(horse,muzzle,[[s*.094,1.743,1.109],[s*.104,1.724,1.172],[s*.084,1.723,1.221]],.006);
    cord(horse,leather,[[s*.111,2.081,.716],[s*.141,1.955,.851],[s*.104,1.783,1.086]],.013);
    egg(horse,gold,s*.105,1.783,1.09,.014,.025,.025);
    cord(horse,leather,[[s*.15,1.78,.57],[s*.246,1.42,.50],[s*.23,1.09,.28]],.035);
    egg(horse,gold,s*.248,1.37,.48,.023,.044,.041);
    cord(horse,leather,[[s*.16,1.43,.49],[s*.278,1.34,-.10],[s*.261,1.29,-.63]],.024);
  }
  cord(horse,leather,[[-.12,1.855,1.04],[0,1.88,1.09],[.12,1.855,1.04]],.015);
  egg(horse,mane,0,.984,-.79,.112,.42,.118,.28);
  pack(horse);
  const legs=[];
  for(const s of [-1,1]) for(const front of [false,true]){
    const leg=new T.Group();leg.name='leg';leg.position.set(s*.164,1.16,front?.42:-.48);
    const knee=front ? [.0,-.49,.04] : [.0,-.46,.16];
    const hock=front ? [.0,-.79,.005] : [.0,-.76,-.09];
    rod(leg,ivory,[0,.05,0],knee,.108,.063);
    rod(leg,ivory,knee,hock,.061,.042);
    egg(leg,ivory,...knee,.065,.074,.065);
    rod(leg,ivory,hock,[0,-1.05,.015],.039,.043);
    egg(leg,hoof,0,-1.104,.047,.061,.057,.091);
    pack(leg);horse.add(leg);
  }
  for(const [pair,z] of [[0,.64],[1,2.91]])for(const s of [-1,1]){
    const animal=horse.clone(true);animal.position.set(s*.51,0,z);group.add(animal);
    animal.children.filter(o=>o.name==='leg').forEach((joint,i)=>legs.push({joint,phase:(i===0||i===3?0:Math.PI)+pair*.73+s*.43}));
    // Driving reins lead back from each bit to the driver's hands.
    const x=s*.51;
    cord(group,leather,[[x+s*.106,1.783,z+1.09],[x+s*.22,1.48,z+.04],[s*.58,1.40,-.25],[s*.13,1.81,-1.18]],.009);
    cord(group,leather,[[x+s*.22,1.29,z+.3],[x+s*.22,1.15,z-.70],[s*.69,1.02,pair?.60:-1.1]],.021);
  }
  const cab=-2.70;
  // Lacquered enclosed saloon, contrasting roof, leather luggage trunk and coachman's box.
  // Usable floor at .90 m; the centre aisle is clear down to the door sill.
  block(group,wood,0,.80,cab,1.64,.14,2.27,.055);
  block(group,wood,0,.875,cab,1.58,.05,2.20,.018);
  for(const end of [-1.06,1.06]){
    block(group,M.paint,0,1.31,cab+end,1.64,.82,.10,.05);
    block(group,glass,0,2.11,cab+end,1.46,.74,.045);
    for(const x of [-.77,.77])block(group,wood,x,2.12,cab+end,.08,.82,.10,.018);
    block(group,gold,0,1.75,cab+end,1.62,.027,.11,.008);
  }
  for(const s of [-1,1]){
    for(const z of [-.82,.82]){
      block(group,M.paint,s*.80,1.34,cab+z,.08,.85,.47,.03);
      block(group,glass,s*.80,2.12,cab+z,.044,.72,.43);
      block(group,wood,s*.80,2.13,cab+z+Math.sign(z)*.20,.07,.80,.06);
      block(group,gold,s*.843,1.66,cab+z,.018,.019,.43,.005);
    }
    // Each inward-facing bench has two independent cushions and backrests.
    block(group,wood,0,1.075,cab+s*.73,1.44,.35,.49,.035);
    for(const x of [-.36,.36]){
      block(group,velvet,x,1.30,cab+s*.73,.704,.12,.51,.053);
      const back=block(group,velvet,x,1.58,cab+s*.966,.704,.50,.12,.055);
      back.rotation.x=s*.10;
    }
    const door=new T.Group();door.position.set(s*.82,.92,cab+.58);
    block(door,M.paint,0,.415,-.58,.073,.82,1.15,.036);
    block(door,glass,0,1.20,-.58,.032,.73,1.08);
    for(const z of [-1.13,-.03])block(door,wood,0,1.20,z,.071,.80,.048,.012);
    for(const y of [.82,1.59])block(door,gold,0,y,-.58,.079,.032,1.15,.008);
    block(door,gold,s*.055,.69,-.96,.047,.038,.13,.012);
    egg(door,gold,s*.047,.47,-.58,.014,.058,.041);
    group.add(door);doors.push({pivot:door,axis:new T.Vector3(0,1,0),sign:-s,max:1.12});
    block(group,wood,s*.93,.58,cab,.40,.068,1.10);
    cord(group,wood,[[s*.88,.59,cab-1.15],[s*.88,.83,cab-.82],[s*.88,.83,cab+.60],[s*.88,.76,cab+.92]],.047);
  }
  block(group,leather,0,2.59,cab,1.74,.16,2.34,.077);
  block(group,gold,0,2.52,cab,1.68,.033,2.27,.014);
  block(group,wood,0,1.14,-1.34,1.12,.18,.63);
  block(group,leather,0,1.38,-1.49,.98,.21,.46,.08);
  for(const side of [-1,1]){
    cord(group,gold,[[side*.68,2.67,-3.65],[side*.68,2.75,-3.57],[side*.68,2.75,-3.04],[side*.68,2.67,-2.96]],.018);
  }
  block(group,leather,0,1.20,-3.88,1.17,.41,.37,.07);
  for(const x of [-.38,.38])block(group,gold,x,1.20,-4.073,.040,.34,.022);
  egg(group,coat,0,1.74,-1.48,.21,.30,.15);
  egg(group,mat(0xdce3e4,.32,.32),0,2.12,-1.46,.126,.147,.125);
  const face=mat(0x173b49,.64,.18);
  egg(group,face,0,2.137,-1.371,.116,.086,.07);
  const faceLight=mat(0xb8e9ed,.15,.23);
  faceLight.emissive.setHex(0x34bbd2);
  for(const side of [-1,1]){
    block(group,faceLight,side*.042,2.15,-1.306,.061,.015,.006,.002);
    egg(group,M.darkChrome,side*.116,2.126,-1.458,.024,.047,.044);
  }
  block(group,M.darkChrome,0,2.078,-1.348,.116,.031,.048,.013);
  block(group,coat,0,2.254,-1.46,.36,.04,.30);
  block(group,coat,0,2.345,-1.46,.236,.16,.22,.04);
  for(const s of [-1,1]){
    rod(group,coat,[s*.16,1.87,-1.48],[s*.19,1.65,-1.31],.072);
    rod(group,coat,[s*.19,1.65,-1.31],[s*.13,1.81,-1.18],.055);
    rod(group,coat,[s*.12,1.48,-1.40],[s*.15,1.34,-1.04],.09);
    rod(group,leather,[s*.15,1.34,-1.04],[s*.15,1.01,-1.04],.072);
    rod(group,gold,[s*.74,1.76,-1.78],[s*.90,1.88,-1.78],.029);
    const lantern = new T.PointLight(0xffb665,0,1.85,2);
    lantern.position.set(s*.90,1.99,-1.78);
    group.add(lantern);
    lanternLights.push(lantern);
    lamps.push(block(group,globe,s*.90,1.99,-1.78,.16,.23,.16));
    block(group,wood,s*.90,2.135,-1.78,.21,.06,.21);
    for(const dx of [-.078,.078])rod(group,gold,[s*.90+dx,1.88,-1.70],[s*.90+dx,2.105,-1.70],.012);
  }
  rod(group,wood,[0,.81,-1.62],[0,.94,2.83],.041);
  for(const [z,radius] of [[-3.53,.64],[-1.70,.47]]){
    rod(group,wood,[-.89,radius,z],[.89,radius,z],.075);
    for(const s of [-1,1]){
      const wheel=new T.Group();wheel.position.set(s*.91,radius,z);
      for(const [r,thickness,m] of [[radius-.033,.036,M.trim],[radius-.072,.046,wood],[radius-.09,.014,gold]]){
        wheel.add(mesh(T,new T.TorusGeometry(r,thickness,8,44),m,[0,0,0],[0,Math.PI/2,0]));
      }
      for(let i=0;i<14;i++){
        const a=i*Math.PI/7;rod(wheel,wood,[0,0,0],[0,(radius-.09)*Math.cos(a),(radius-.09)*Math.sin(a)],.027,.018);
      }
      egg(wheel,gold,0,0,0,.096,.091,.091);pack(wheel);
      group.add(wheel);wheel.userData.radius=radius;wheels.push(wheel);
    }
  }
  pack(group);
  let cycle=0,amplitude=0;
  function animate(dt,speed){
    const target=Math.min(1,speed/2.5);
    amplitude=T.MathUtils.damp(amplitude,target,7,dt);
    if(amplitude<.001&&target===0)amplitude=0;
    cycle=(cycle+dt*Math.min(10,speed*2.7))%(2*Math.PI);
    for(const {joint,phase} of legs)joint.rotation.x=.27*amplitude*Math.sin(cycle+phase);
    return amplitude>0;
  }
  return {group,doors,wheels,bodyMaterials:[M.paint],headlights:{meshes:lamps,drl:[],spots:lanternLights,intensity:2.3,emission:1.1,roadBeam:false},taillights:[],animate,meta};
}
