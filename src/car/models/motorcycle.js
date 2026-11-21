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
  function facets(material, sections) {
    const positions=[];
    const rings=sections.map(([z,w,low,high])=>[
      [-w*.58,low,z],[w*.58,low,z],[w,low+(high-low)*.38,z],[w*.71,high,z],
      [-w*.71,high,z],[-w,low+(high-low)*.38,z],
    ]);
    function triangle(a,b,c){positions.push(...a,...b,...c);}
    for(let i=0;i<rings.length-1;i++) for(let j=0;j<6;j++){
      const a=rings[i],b=rings[i+1],k=(j+1)%6;
      triangle(a[j],a[k],b[j]);triangle(a[k],b[k],b[j]);
    }
    const front=rings.at(-1),rear=rings[0];
    for(let i=1;i<5;i++){triangle(front[0],front[i],front[i+1]);triangle(rear[0],rear[i+1],rear[i]);}
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.computeVertexNormals();
    group.add(new T.Mesh(geometry,material));
  }
  shell(M.darkChrome,[0,.58,-.20],[.31,.31,.55]);
  facets(M.paint,[[-.66,.21,.77,1.02],[-.31,.33,.64,1.19],[.27,.43,.64,1.24],
    [.72,.40,.66,1.25],[1.12,.34,.80,1.25],[1.49,.105,.98,1.12],[1.55,.025,1.04,1.08]]);
  facets(M.carbon,[[-.59,.16,.30,.49],[-.19,.31,.29,.54],[.62,.35,.34,.62],[1.05,.14,.53,.63]]);
  facets(M.paint,[[-1.55,.15,.87,.93],[-1.22,.27,.86,1.08],[-.76,.26,.88,1.09],[-.52,.20,.89,1.01]]);
  facets(M.paint,[[.90,.058,.76,.80],[1.03,.11,.79,.88],[1.25,.12,.80,.88],[1.55,.09,.73,.78],[1.59,.046,.72,.75]]);
  box(M.trim,[0,1.007,-.52],[.42,.105,.65],.047);
  for(const side of [-1,1]){
    tube(M.chrome,[side*.15,.43,1.19],[side*.24,1.09,.73],.043);
    tube(M.trim,[side*.17,.48,1.16],[side*.22,.83,.91],.064);
    tube(M.darkChrome,[side*.17,.41,-1.11],[side*.29,.58,-.27],.058);
    tube(M.chrome,[side*.20,.48,-1.03],[side*.28,.87,-.63],.034);
    const intake=box(M.grille,[side*.337,.783,.58],[.13,.163,.39],.028);
    intake.rotation.y=-side*.24;
    const blade=box(M.carbon,[side*.37,.682,.50],[.14,.03,.48],.012);
    blade.rotation.y=-side*.29;
    tube(M.darkChrome,[side*.21,.52,.10],[side*.30,.60,-.51],.058);
    tube(M.darkChrome,[side*.30,.60,-.51],[side*.32,.76,-1.47],.069);
    tube(M.gblack,[side*.314,.687,-1.02],[side*.32,.76,-1.49],.116);
    for(const z of [-1.18,-.96])box(M.chrome,[side*.392,.723,z],[.03,.04,.09],.008);
    for(let i=0;i<4;i++) box(M.darkChrome,[side*.313,.53+i*.055,-.15],[.053,.020,.36],.008);
    tube(M.trim,[0,1.21,.56],[side*.34,1.26,.44],.025);
    tube(M.gblack,[side*.26,1.26,.44],[side*.37,1.26,.44],.034);
    tube(M.darkChrome,[side*.27,1.19,.72],[side*.46,1.34,.78],.019);
    shell(M.gblack,[side*.46,1.34,.78],[.10,.044,.065]);
    box(M.darkChrome,[side*.31,.564,-.36],[.19,.04,.27],.015);
  }
  const shield=new T.Shape();
  shield.moveTo(-.32,0);shield.quadraticCurveTo(-.33,.29,-.23,.46);
  shield.quadraticCurveTo(0,.56,.23,.46);shield.quadraticCurveTo(.33,.29,.32,0);
  shield.quadraticCurveTo(0,-.09,-.32,0);
  const glass=new T.MeshPhysicalMaterial({color:0x79afbc,transparent:true,opacity:.36,roughness:.11,metalness:.14,clearcoat:1,side:T.DoubleSide,depthWrite:false});
  const windscreen=mesh(T,new T.ShapeGeometry(shield,20),glass,[0,1.14,1.00],[-.42,0,0]);
  group.add(windscreen);
  const pilot=makePilot(T,M,{x:0,grip:.31,handY:1.16,handZ:.32,footY:.55,footZ:-.53,motorcycle:true});
  pilot.position.set(0,.10,.12);
  group.add(pilot);
  const headlights=[];
  for(const side of [-1,1]){
    const housing=box(M.housing,[side*.187,1.09,1.366],[.25,.165,.118],.025);
    housing.rotation.set(0,side*.47,side*.16);
    const light=box(M.head,[side*.197,1.10,1.423],[.200,.107,.041],.025);
    light.rotation.copy(housing.rotation);
    headlights.push(light);
  }
  const tail=box(M.tail,[0,.99,-1.385],[.32,.044,.038],.012);
  const plumes=[];
  for(const side of [-1,1]){
    const nozzle=makeNozzle(T,M,.115,.17,true);
    nozzle.position.set(side*.32,.76,-1.56);
    group.add(nozzle);
    const plume=makePlume(T,[[.096,.84,0x50d6ff,.72],[.066,.56,0xd0f6ff,1],[.046,.34,0xffffff,1]]);
    plume.position.copy(nozzle.position);
    group.add(plume);
    plumes.push(plume);
  }
  let preview=0,time=0,power=0;
  function animate(dt,speed){
    const goal=preview>0?1:T.MathUtils.clamp((speed-1)/17,0,1);
    preview=Math.max(0,preview-dt);
    time+=dt;
    power=T.MathUtils.damp(power,goal,5,dt);
    if(Math.abs(power-goal)<.004) power=goal;
    for (const plume of plumes) {
      plume.visible=power>.004;
      plume.scale.z=Math.max(.001,power);
      for(const layer of plume.children) layer.material.uniforms.tick.value=time;
    }
    return power>.004 || goal>0;
  }
  return {group,wheels,doors:[],meta,bodyMaterials:[M.paint],headlights:{meshes:headlights,drl:[],light:makeHeadSpot(T,group,{y:1.10,z:1.46})},
    taillights:[tail],animate,setJetPreview(on){preview=on?2.5:0;}};
}
