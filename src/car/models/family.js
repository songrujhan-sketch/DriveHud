import {bodyLoft,cabinLoft,loftDoorPreds,loftDoors,regionHelpers,cabinInterior,interiorMaterials,curve} from './kit.js';
import {mesh,makeMaterials,multiMesh,roundBox,placeWheels,makeMirror,makeHeadSpot} from './parts.js';

export const meta={id:'family',displayName:'好爸爸',roofY:1.70};

export function build(T,{color='#804235'}={}){
  const group=new T.Group(), M=makeMaterials(T,color,{rim:0xa2a7ac,caliper:0x404449});
  const I=interiorMaterials(T,0x887361);
  const box=(parent,mat,pos,dims,r=.02)=>{const m=mesh(T,roundBox(T,...dims,r),mat,pos);parent.add(m);return m;};
  const width=curve([[-2.31,.82],[-1.75,.93],[0,.94],[1.55,.96],[2.31,.81]]);
  const belt=curve([[-2.31,1.04],[-1.6,1.12],[.75,1.04],[1.6,1.03],[2.31,.87]]);
  const roof=curve([[-2.18,1.13],[-1.93,1.51],[-1.61,1.67],[-.55,1.70],[.28,1.65],[.73,1.49],[1.15,1.13]]);
  const axles=[-1.39,1.41];
  const spans=[{front:.90,rear:-.15},{front:-.16,rear:-1.18}];
  const seams=spans.flatMap(d=>[d.front,d.rear]);
  const body=bodyLoft(T,{z0:-2.31,z1:2.31,wheels:axles.map(z=>({z,R:.42,y:.36,wellX:.68})),
    endR:[.09,.13],extraZ:seams,p:{hw:width,yBot:.23,yBelt:belt,yTop:z=>belt(z)+.074,n:2.6,tuck:.12,bump:.025,bumpX:.76,bumpW:.25}});
  const cab=cabinLoft(T,{z0:-2.18,z1:1.15,yc:roof,yr:z=>roof(z)-.035,rw:.65,cb:.875,yb:z=>belt(z)-.02,ys:z=>belt(z)+.045,n:2.7,bow:.025,extraZ:seams,caps:true});
  const side=regionHelpers(body);
  const bodyKey=q=>q.tag==='well'||q.tag==='under'||(side.isSide(q)&&q.y<.40)?'trim':'paint';
  function cabKey(q){
    if(q.tag==='glass')return q.zr<-.16&&q.zr>-.25 || q.zr< -1.54 ? 'paint':'glass';
    if(q.tag==='beltTrim')return 'chrome';
    if(q.tag==='frame'||q.tag==='rail')return 'gblack';
    return (q.zr>.38 || (q.zr< -1.78 && q.zr> -2.10)) && q.tag!=='cabLow' ? 'glass':'paint';
  }
  const openings=spans.map(d=>loftDoorPreds(body,{zF:d.front,zR:d.rear,topXf:.87}));
  function shell(loft,key,skip,materials){
    const m=multiMesh(T,loft.geometry(q=>skip(q)?null:key(q),materials),M);
    group.add(m,new T.Mesh(m.geometry,I.liner));
  }
  shell(body,bodyKey,q=>openings.some(o=>o.body(q)) || (!q.cap&&side.isTop(q)&&q.zr>-1.74&&q.zr<.99&&q.ax<.84),['paint','trim']);
  shell(cab,cabKey,q=>openings.some(o=>o.cab(q)),['paint','glass','chrome','gblack']);
  const doors=[];
  for(const [i,d] of spans.entries()){
    const pair=loftDoors(T,group,M,I,{body,cab,bodyKey,cabKey,preds:openings[i],hinge:{point:[.94,.75,d.front],axis:[0,1,0],angle:-.93}});
    for(const door of pair){
      const handle=box(group,M.darkChrome,[door.sign*.94,1.005,d.rear+.16],[.035,.034,.17],.014);
      door.pivot.attach(handle);
      if(i===0){
        const mirror=makeMirror(T,M,{w:.13,h:.105,len:.22,arm:.13});
        mirror.position.set(door.sign*.86,1.14,.75);mirror.scale.x=door.sign;
        group.add(mirror);door.pivot.attach(mirror);
      }
    }
    doors.push(...pair);
  }
  cabinInterior(T,group,I,{seats:[
    ...[-.41,.41].map(x=>({x,z:-.19,yBase:.39,w:.49,back:.61,recline:.17})),
    {x:0,z:-1.30,yBase:.40,w:1.49,back:.57,recline:.16,headrests:[-.48,0,.48]}],
    dash:{w:1.55,y:.99,z:.87,h:.17,len:.32},wheel:{x:.41,y:1.02,z:.60,r:.17},
    screen:{y:1.11,z:.73},console:{w:.23,h:.26,len:.85,y:.55,z:.20}});
  const heads=[],tails=[];
  // Original tapering aperture with a bright lower edge and three recessed slats.
  const shape=new T.Shape();
  shape.moveTo(-.55,.834);shape.quadraticCurveTo(0,.868,.55,.834);
  shape.lineTo(.47,.635);shape.quadraticCurveTo(0,.508,-.47,.635);shape.closePath();
  const rim=mesh(T,new T.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelSize:.016,bevelThickness:.008,bevelSegments:3}),M.darkChrome,[0,0,2.294]);
  group.add(rim);
  const inset=mesh(T,new T.ShapeGeometry(shape),M.grille,[0,.037,2.338]);
  inset.scale.set(.94,.945,1);group.add(inset);
  for(let i=0;i<3;i++)box(group,M.gblack,[0,.666+i*.053,2.344],[.74+i*.055,.013,.015],.004);
  box(group,M.trim,[0,.40,2.286],[1.40,.11,.10],.04);
  for(const s of [-1,1]){
    const lamp=box(group,M.head,[s*.633,.833,2.293],[.347,.062,.084],.024);
    lamp.rotation.z=s*.12; heads.push(lamp);
    tails.push(box(group,M.tail,[s*.67,.976,-2.302],[.30,.068,.06],.025));
    box(group,M.chrome,[s*.64,1.673,-.66],[.034,.037,1.44]);
  }
  box(group,M.paint,[0,1.566,-1.93],[1.34,.054,.35]);
  box(group,M.darkChrome,[0,.65,-2.315],[.39,.116,.022]);
  const wheels=placeWheels(T,group,M,axles.map(z=>({z,x:.83,radius:.368,width:.226,spokes:8,rimRatio:.69})));
  return {group,wheels,doors,meta,bodyMaterials:[M.paint],headlights:{meshes:heads,drl:[],light:makeHeadSpot(T,group,{y:.83,z:2.32})},taillights:tails};
}
