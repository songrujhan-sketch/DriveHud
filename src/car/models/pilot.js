import { mesh } from './parts.js';

export function makePilot(T, M, {x=.40, grip=.14, handY=1.12, handZ=.32, footY=.94, footZ=.09, motorcycle=false}={}) {
  const pilot=new T.Group();
  const suit = new T.MeshStandardMaterial({color:0xe4e9e7,metalness:.35,roughness:.32});
  const visor = new T.MeshPhysicalMaterial({color:0x164655,metalness:.65,roughness:.12,clearcoat:1});
  const beacon = new T.MeshStandardMaterial({color:0xb4ffff,emissive:0x37c8de,emissiveIntensity:1.4});
  function ball(material,center,scale) {
    const part=mesh(T,new T.SphereGeometry(1,24,14),material,center);
    part.scale.set(...scale);
    pilot.add(part);
  }
  function rod(from,to,r,material) {
    const a=new T.Vector3(...from), b=new T.Vector3(...to);
    const axis=b.clone().sub(a);
    const part=new T.Mesh(new T.CylinderGeometry(r,r,axis.length(),14),material);
    part.position.copy(a).lerp(b,.5);
    part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());
    pilot.add(part);
  }
  ball(M.trim,[x,1.10,-.55],[.195,.23,.13]);
  ball(suit,[x,1.19,-.56],[.184,.172,.12]);
  rod([x,1.29,-.55],[x,1.42,-.53],.075,M.darkChrome);
  ball(suit,[x,1.50,-.52],[.163,.185,.164]);
  ball(visor,[x,1.515,-.459],[.157,.103,.132]);
  ball(beacon,[x,1.531,-.331],[.091,.009,.009]);
  for(const s of [-1,1]) {
    const shoulder=[x+s*.18,1.24,-.52];
    const elbow=motorcycle ? [x+s*.39,1.22,-.16] : [x+s*.235,1.02,-.19];
    const hand=[x+s*grip,handY,handZ];
    ball(suit,shoulder,[.084,.082,.08]);
    rod(shoulder,elbow,.058,M.trim);
    ball(M.darkChrome,elbow,[.061,.061,.061]);
    rod(elbow,hand,.051,suit);
    ball(M.trim,hand,[.055,.051,.06]);
    if (motorcycle) {
      const hip=[x+s*.16,.98,-.56];
      const knee=[x+s*.385,.83,-.14];
      const ankle=[x+s*.31,footY,footZ];
      ball(M.darkChrome,hip,[.083,.083,.083]);
      rod(hip,knee,.082,suit);
      ball(M.trim,knee,[.085,.087,.088]);
      ball(suit,[knee[0],knee[1]+.012,knee[2]+.054],[.072,.070,.038]);
      rod(knee,ankle,.061,M.darkChrome);
      rod([knee[0],.77,-.19],[ankle[0],footY+.065,footZ+.036],.048,suit);
      ball(M.trim,ankle,[.058,.06,.058]);
      ball(M.trim,[ankle[0],footY-.032,footZ+.054],[.073,.049,.129]);
    } else {
      rod([x+s*.09,.95,-.50],[x+s*.11,footY,footZ],.082,M.trim);
    }
    ball(M.darkChrome,[x+s*.15,1.50,-.52],[.029,.064,.064]);
  }
  return pilot;
}
