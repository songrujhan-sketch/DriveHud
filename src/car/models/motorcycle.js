import { makeMaterials, makeWheel, makeHeadSpot, mesh, roundBox } from './parts.js';
import { makeNozzle } from './nozzle.js';
import { makePlume } from './plume.js';
import { makePilot } from './pilot.js';

export const meta = { id: 'motorcycle', displayName: '重型機車', roofY: 1.88 };

export function build(T, {color='#d32f2f'}={}) {
  const group=new T.Group(), M=makeMaterials(T,color,{rim:0x3e484d});
  const wheels=[];
  function shell(mat, pos, size, angle=0) {
    const part=mesh(T,new T.SphereGeometry(1,28,16),mat,pos,[angle,0,0]);
    part.scale.set(...size);
    group.add(part);
    return part;
  }
  function box(mat,pos,size,r=.025) {
    const part=mesh(T,roundBox(T,...size,r),mat,pos);
    group.add(part);
    return part;
  }
  function tube(mat, a, b, r) {
    const from=new T.Vector3(...a), to=new T.Vector3(...b), axis=to.clone().sub(from);
    const part=new T.Mesh(new T.CylinderGeometry(r,r,axis.length(),16),mat);
    part.position.copy(from).lerp(to,.5);
    part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());
    group.add(part);
  }
  for(const [z,radius,width] of [[-1.11,.405,.26],[1.19,.43,.17]]){
    const {wheel,caliper}=makeWheel(T,M,{radius,width,spokes:6,rimRatio:.77});
    wheel.position.set(0,radius,z);caliper.position.copy(wheel.position);
    wheel.userData.radius=radius;
    group.add(wheel,caliper);wheels.push(wheel);
  }
  shell(M.darkChrome,[0,.58,-.20],[.31,.31,.55]);
  shell(M.paint,[0,.97,.41],[.37,.26,.73],.10);
  shell(M.paint,[0,1.02,.88],[.43,.30,.37],-.22);
  shell(M.carbon,[0,.39,.15],[.32,.14,.63]);
  shell(M.paint,[0,.91,-.86],[.31,.15,.54],.10);
  box(M.trim,[0,1.014,-.52],[.48,.12,.63],.057);
  for(const side of [-1,1]){
    tube(M.chrome,[side*.15,.43,1.19],[side*.24,1.09,.73],.043);
    tube(M.trim,[side*.17,.48,1.16],[side*.22,.83,.91],.064);
    tube(M.darkChrome,[side*.17,.41,-1.11],[side*.29,.58,-.27],.058);
    tube(M.chrome,[side*.20,.48,-1.03],[side*.28,.87,-.63],.034);
    shell(M.paint,[side*.24,.70,.31],[.16,.24,.47],-.28);
    for(let i=0;i<4;i++) box(M.darkChrome,[side*.313,.53+i*.055,-.15],[.053,.020,.36],.008);
    tube(M.trim,[0,1.21,.56],[side*.34,1.26,.44],.025);
    tube(M.gblack,[side*.26,1.26,.44],[side*.37,1.26,.44],.034);
    tube(M.darkChrome,[side*.27,1.19,.72],[side*.46,1.34,.78],.019);
    shell(M.gblack,[side*.46,1.34,.78],[.10,.044,.065]);
    box(M.darkChrome,[side*.22,.57,-.12],[.16,.04,.27],.015);
  }
  const shield=new T.Shape();
  shield.moveTo(-.32,0);shield.quadraticCurveTo(-.33,.29,-.23,.46);
  shield.quadraticCurveTo(0,.56,.23,.46);shield.quadraticCurveTo(.33,.29,.32,0);
  shield.quadraticCurveTo(0,-.09,-.32,0);
  const glass=new T.MeshPhysicalMaterial({color:0x79afbc,transparent:true,opacity:.36,roughness:.11,metalness:.14,clearcoat:1,side:T.DoubleSide,depthWrite:false});
  const windscreen=mesh(T,new T.ShapeGeometry(shield,20),glass,[0,1.14,1.00],[-.42,0,0]);
  group.add(windscreen);
  const pilot=makePilot(T,M,{x:0,grip:.31,handY:1.16,handZ:.32,footY:.54,footZ:-.24});
  pilot.position.set(0,.10,.12);
  group.add(pilot);
  const headlights=[-1,1].map(s=>box(M.head,[s*.149,1.017,1.205],[.255,.069,.055],.026));
  const tail=box(M.tail,[0,.99,-1.385],[.32,.044,.038],.012);
  const nozzle=makeNozzle(T,M,.146,.19,true);
  nozzle.position.set(0,.72,-1.43);group.add(nozzle);
  const plume=makePlume(T,[[.118,.95,0x50d6ff,.72],[.082,.64,0xd0f6ff,1],[.058,.40,0xffffff,1]]);
  plume.position.copy(nozzle.position);group.add(plume);
  let preview=0,time=0,power=0;
  function animate(dt,speed){
    const goal=preview>0?1:T.MathUtils.clamp((speed-1)/17,0,1);
    preview=Math.max(0,preview-dt);
    time+=dt;
    power=T.MathUtils.damp(power,goal,5,dt);
    if(Math.abs(power-goal)<.004) power=goal;
    plume.visible=power>.004;
    plume.scale.z=Math.max(.001,power);
    for(const layer of plume.children) layer.material.uniforms.tick.value=time;
    return plume.visible||goal>0;
  }
  return {group,wheels,doors:[],meta,bodyMaterials:[M.paint],headlights:{meshes:headlights,drl:[],light:makeHeadSpot(T,group,{y:1.02,z:1.23})},
    taillights:[tail],animate,setJetPreview(on){preview=on?2.5:0;}};
}
