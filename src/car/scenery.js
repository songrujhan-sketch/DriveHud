import * as THREE from '../../vendor/three.module.js';

// Outdoor sets use a repeatable foreground at road scale and a stationary horizon.
// The two vertex palettes bake sun-facing facets, twilight and practical lights
// into the same buffers; switching time of day changes a single uniform.
const LENGTH=160, TAU=Math.PI*2;
const FLAT=0, ASPHALT=1, WINDOWS=2, WATER=3, CHAIN=4, CHECKS=5, RIDGE=6, NEEDLES=7, STOREFRONT=8, MEADOW=9;
const palette={
  asphalt:['#525353','#22252d'], paint:['#e3e1cd','#a3a6ad'], yellow:['#ecba44','#ac8540'],
  curb:['#b1b1a9','#40434a'], steel:['#94a4a2','#53616a'], charcoal:['#303e44','#1e242b'],
  concrete:['#c4bfb1','#555257'], turf:['#82905d','#253227'], soil:['#958475','#332e30'],
  fir:['#315948','#152823'], pine:['#45694e','#20322b'], leaf:['#72936a','#263a30'],
  bark:['#7c6c56','#29262a'], signal:['#cf593b','#a95538'], red:['#c94b39','#a94a3e'],
  white:['#ecece2','#a2afb0'], lamp:['#edeac8','#ffdf9d'], neon:['#67b5bd','#81e5eb'],
  stone:['#9c9991','#3c4245'], roof:['#728387','#44505d'], mist:['#9caebb','#36445a'],
  ocean:['#3a91a2','#1e3d55'], foam:['#c0d4ce','#637d88'], sand:['#c6b18a','#635547'],
};
const vertexShader=`
 attribute vec3 nightColor;
 attribute float surfaceKind;
 attribute float seed;
 varying vec3 tint;
 varying vec2 surfaceUv;
 varying float kind,randomSeed,distanceToEye;
 varying vec3 clip,local;
 uniform float darkness;
 void main(){
   vec4 view=modelViewMatrix*vec4(position,1.);
   gl_Position=projectionMatrix*view;clip=gl_Position.xyw;local=position;distanceToEye=-view.z;
   tint=mix(color,nightColor,darkness);surfaceUv=uv;kind=surfaceKind;randomSeed=seed;
 }
`;
const fragmentShader=`
 varying vec3 tint,clip,local;varying vec2 surfaceUv;varying float kind,randomSeed,distanceToEye;
 uniform vec3 haze;uniform float darkness,clockTime;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,313.7)))*43758.5453);}
 float field(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
 }
 void main(){
  vec3 c=tint;vec2 uv=surfaceUv;
  if(kind>.5 && kind<1.5){
    float grain=hash(floor(uv*39.));
    c*=1.+(grain-.5)*.15*(1.-smoothstep(10.,38.,distanceToEye));
    c*=1.-.085*exp(-abs(abs(uv.x)-.83)*4.);
  }else if(kind>1.5 && kind<2.5){
    vec2 cell=floor(uv),f=fract(uv);
    float room=hash(cell+randomSeed),inside=step(.10,f.x)*step(f.x,.94)*step(.16,f.y)*step(f.y,.90);
    vec3 pane=mix(vec3(.14,.18,.20),vec3(.51,.66,.73),.34+.36*f.y+.19*room);
    vec3 warm=mix(vec3(.038,.052,.072),mix(vec3(.53,.36,.20),vec3(.79,.73,.56),room),step(.64,room));
    vec3 glazing=mix(pane,warm,darkness);
    float reflected=field(vec2(local.z*.093+local.x*.12,local.y*.11+randomSeed));
    glazing+=vec3(.08,.12,.14)*(reflected-.48)*(1.-darkness);
    float transom=.25*(1.-smoothstep(.012,.04,abs(f.y-.67)));
    c=mix(c,glazing,inside)*(1.-.15*step(.82,f.x)*inside-transom*inside);
  }else if(kind>2.5 && kind<3.5){
    float distanceFromShore=abs(uv.x);
    float waves=sin(uv.x*2.6+sin(uv.y*.13)+clockTime*.82)+.52*sin(uv.x*3.8+uv.y*.25+clockTime*1.13);
    float ripples=pow(max(0.,waves/1.52),7.);
    c+=vec3(.19,.24,.21)*ripples*mix(1.,.23,darkness)*(1.-smoothstep(28.,150.,distanceToEye));
    float foam=1.-smoothstep(.1,.35,abs(mod(distanceFromShore+.34*sin(uv.y*.2)+clockTime*.27,2.25)-.61));
    c+=vec3(.35,.37,.33)*foam*(1.-smoothstep(.5,7.,distanceFromShore))*mix(1.,.22,darkness);
  }else if(kind>3.5 && kind<4.5){
    vec2 w=abs(fract(vec2(uv.x+uv.y,uv.x-uv.y)*3.25)-.5);
    if(min(w.x,w.y)>.065)discard;
  }else if(kind>4.5 && kind<5.5){
    c*=mix(.19,1.,mod(floor(uv.x)+floor(uv.y),2.));
  }
  if(kind>5.5 && kind<6.5){
    vec2 p=local.xz+local.y*vec2(.93,-.72);
    float crags=.50*field(p*.14)+.28*field(p*.39)+.16*field(p*.99)+.06*field(p*2.4);
    float terrain=.40+.23*uv.y+.83*crags;
    float seam=abs(fract(dot(p,vec2(.076,.048))+field(p*.26)*.95)-.5);
    terrain-=.12*(1.-smoothstep(.015,.13,seam));
    c*=terrain;
    float snow=smoothstep(.77,1.04,uv.x+.2*crags);
    c=mix(c,mix(vec3(.76,.82,.82),vec3(.13,.16,.19),darkness),snow*.84);
  }else if(kind>6.5 && kind<7.5){
    float leaf=field(local.xz*9.+local.y*6.);
    float bough=sin(local.y*11.+local.x*4.+local.z*1.7);
    c*=.72+.45*leaf+.13*bough;
  }else if(kind>7.5 && kind<8.5){
    vec2 f=fract(uv);
    float ref=field(vec2(uv.x*2.+randomSeed,uv.y*.55));
    vec3 glazing=mix(vec3(.06,.12,.14),vec3(.31,.43,.46),smoothstep(.07,1.,f.y)*(.36+.65*ref));
    float diagonal=smoothstep(.12,.51,f.x+.64*f.y)* (1.-smoothstep(.65,.82,f.x+.64*f.y));
    glazing+=vec3(.04,.065,.074)*diagonal;
    glazing=mix(glazing,vec3(.13,.092,.056)+vec3(.25,.17,.078)*f.y,darkness);
    float frame=max(1.-smoothstep(.009,.021,min(f.x,1.-f.x)),1.-smoothstep(.012,.032,min(f.y,1.-f.y)));
    c=mix(glazing,c,frame);
  }else if(kind>8.5){
    c*=.8+.27*field(uv*.44)+.14*field(uv*2.);
  }
  c=mix(c,haze,smoothstep(38.,340.,distanceToEye)*.65);
  vec2 edge=1.-smoothstep(vec2(.82),vec2(1.),abs(clip.xy/clip.z));
  gl_FragColor=vec4(c,edge.x*edge.y);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`;
function random(seed){return()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};}
const clamp=THREE.MathUtils.clamp;
const lerp=THREE.MathUtils.lerp;

export function createScenery({layer,toDisplay}){
  const root=new THREE.Group(),sets=new Map(),resources=[],colors=new Map();
  const owned=x=>(resources.push(x),x);
  function color(name){
    const k=typeof name==='string'?name:name.join('|');
    if(!colors.has(k)){
      const pair=typeof name==='string'?palette[name]:name;
      colors.set(k,pair.map(hex=>toDisplay(hex).toArray()));
    }
    return colors.get(k);
  }
  const uniforms={darkness:{value:0},clockTime:{value:0},haze:{value:new THREE.Color()}};
  const material=owned(new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,vertexColors:true,side:THREE.DoubleSide,transparent:true}));
  const sun=new THREE.Vector3(-.54,.8,.34).normalize();
  class Batch {
    constructor(){this.vertices=[];this.day=[];this.night=[];this.uv=[];this.kinds=[];this.seeds=[];}
    face(points,col,kind=FLAT,uvs=null,seed=0){
      const [a,b,c]=points.map(p=>new THREE.Vector3(...p));
      const n=b.sub(a).cross(c.sub(a)).normalize();
      if(n.y<-.1)n.negate();
      const shade=.79+.22*Math.max(0,n.dot(sun))+.05*Math.abs(n.z);
      const [day,night]=color(col);
      for(let j=1;j<points.length-1;j++)for(const i of [0,j,j+1]){
        const p=points[i];this.vertices.push(...p);
        this.day.push(...day.map(v=>v*shade));this.night.push(...night.map(v=>v*(.80+.2*shade)));
        this.uv.push(...(uvs?.[i]||[p[0],p[2]]));this.kinds.push(kind);this.seeds.push(seed);
      }
    }
    box(x,y,z,w,h,d,col,{kind=FLAT,seed=0,cell=2.3}={}){
      const point=(i,j,k)=>[x+i*w/2,y+j*h/2,z+k*d/2];
      for(const s of [-1,1]){
        this.face([point(s,-1,-1),point(s,-1,1),point(s,1,1),point(s,1,-1)],col,kind,[[0,0],[d/cell,0],[d/cell,h/3],[0,h/3]],seed);
        this.face([point(-1,-1,s),point(1,-1,s),point(1,1,s),point(-1,1,s)],col,kind,[[0,0],[w/cell,0],[w/cell,h/3],[0,h/3]],seed);
      }
      this.face([point(-1,1,-1),point(-1,1,1),point(1,1,1),point(1,1,-1)],col);
      if(y-h/2>.2)this.face([point(-1,-1,-1),point(-1,-1,1),point(1,-1,1),point(1,-1,-1)],col);
    }
    strip(x0,x1,z0,z1,y,col,kind=FLAT){
      this.face([[x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0]],col,kind);
    }
    taper(x,y,z,bottom,top,height,col,n=8){
      for(let j=0;j<n;j++){
        const p=(i,r,h)=>[x+r*Math.cos(TAU*i/n),y+h,z+r*Math.sin(TAU*i/n)];
        const a=p(j,bottom,0),b=p(j+1,bottom,0),c=p(j+1,top,height),d=p(j,top,height);
        this.face(top?[a,b,c,d]:[a,b,d],col);
        if(top)this.face([[x,y+height,z],c,d],col);
      }
    }
    mesh(){
      const g=owned(new THREE.BufferGeometry());
      for(const [key,array,size] of [['position',this.vertices,3],['color',this.day,3],['nightColor',this.night,3],['uv',this.uv,2],['surfaceKind',this.kinds,1],['seed',this.seeds,1]])
        g.setAttribute(key,new THREE.Float32BufferAttribute(array,size));
      g.computeBoundingSphere();
      const m=new THREE.Mesh(g,material);m.layers.set(layer);m.renderOrder=-45;return m;
    }
  }
  function fir(b,x,z,h,r){
    b.taper(x,0,z,h*.043,h*.019,h*.85,'bark',7);
    const leanX=(r()-.5)*h*.13,leanZ=(r()-.5)*h*.11;
    // Layered, downward drooping bough fans give each tree an irregular feathered silhouette.
    for(let tier=0;tier<7;tier++){
      const f=tier/7,base=h*(.16+.73*f),radius=h*(.235-.19*f),phase=r()*TAU;
      const cx=x+f*leanX,cz=z+f*leanZ;
      for(let j=0;j<8;j++){
        const a=phase+j*TAU/8,len=radius*(.79+.40*r()),low=base-h*(.022+.045*r());
        const tip=[cx+len*Math.cos(a),low,cz+len*Math.sin(a)];
        const at=(angle,rad,y)=>[cx+rad*Math.cos(angle),y,cz+rad*Math.sin(angle)];
        const left=at(a-.42,len*.76,base+.022*h),right=at(a+.45,len*.68,base+.028*h);
        const spine=at(a,len*.39,base+h*(.119-.055*f)),inner=[cx,base+h*.105,cz];
        b.face([spine,left,tip],j%3===0?'pine':'fir',NEEDLES);
        b.face([spine,tip,right],j%3===0?'leaf':'pine',NEEDLES);
        b.face([inner,left,spine,right], 'fir', NEEDLES);
      }
    }
    b.taper(x+leanX,h*.85,z+leanZ,h*.042,0,h*.145,'pine',7);
  }
  function ridge(b,options){
    const {radius,baseHeight,amplitude,phase,base,peak,rock,snow=false}=options;
    const count=176,rings=9;
    const row=[];
    for(let k=0;k<=rings;k++){
      const f=k/rings,ring=[];
      for(let i=0;i<count;i++){
        const a=i*TAU/count;
        const fold=.54*Math.sin(4*a+phase)+.29*Math.cos(9*a+.7*phase)+.15*Math.sin(18*a-phase)+.08*Math.sin(39*a+phase);
        const ridgeline=baseHeight+amplitude*fold;
        const rf=radius*(.74+.26*f)+7*Math.cos(5*a+phase)+3*Math.sin(9*a-f*2);
        const crease=2.8*Math.sin(17*a+phase+f*2)*Math.sin(f*Math.PI);
        ring.push([rf*Math.cos(a),(ridgeline+crease)*Math.pow(f,.86)-1,rf*Math.sin(a)]);
      }
      row.push(ring);
    }
    for(let k=0;k<rings;k++)for(let i=0;i<count;i++){
      const j=(i+1)%count,f=(k+.5)/rings;
      const a=row[k][i],b0=row[k][j],c=row[k+1][j],d=row[k+1][i];
      const uv=p=>[snow?p[1]/(baseHeight+amplitude*.48):0,p[1]/baseHeight];
      // Rock albedo varies continuously over a folded ridge; there are no cell-wide material bands.
      b.face([a,b0,c],peak,RIDGE,[uv(a),uv(b0),uv(c)]);
      b.face([a,c,d],peak,RIDGE,[uv(a),uv(c),uv(d)]);
    }
  }
  function road(b,type){
    const w=type==='track'?6.8:5.3;
    b.strip(-w,w,-80,80,-.012,'asphalt',ASPHALT);
    for(const s of [-1,1])b.strip(s*(w-.25)-.065,s*(w-.25)+.065,-80,80,.005,'paint');
    if(type==='track'){
      for(let i=0;i<16;i++){
        const z=-77+i*4.5,x=i%2?1.75:-1.75;
        b.strip(x-.8,x+.8,z,z+.11,.009,'paint');b.strip(x-.8,x-.72,z-.76,z,.009,'paint');
      }
      b.face([[-6.5,.015,28],[-6.5,.015,29],[6.5,.015,29],[6.5,.015,28]],'white',CHECKS,[[0,0],[0,2],[26,2],[26,0]]);
    }else if(type==='city'){
      for(const x of [-1.8,1.8])for(let z=-80;z<80;z+=8)b.strip(x-.06,x+.06,z,z+2.9,.008,'paint');
    }else{
      // Two-lane carriageway. Offset the centerline so the model is in its lane.
      for(const x of [-1.85,-1.63])b.strip(x-.05,x+.05,-80,80,.008,'yellow');
    }
  }
  function mountainSet(b,d,r){
    b.strip(-185,185,-80,80,-.09,'turf',MEADOW);
    ridge(d,{radius:229,baseHeight:40,amplitude:25,phase:2.1,base:['#80979b','#313d50'],peak:['#99a8ac','#404b5e'],rock:['#acb8b7','#46566a'],snow:true});
    ridge(d,{radius:118,baseHeight:15,amplitude:13,phase:3.7,base:['#526e5b','#1e302e'],peak:['#708276','#30403e'],rock:['#7d8477','#394642']});
    for(const s of [-1,1]){
      b.strip(s*5.35,s*6.6,-80,80,-.035,'soil');
      b.box(s*8.8,.61,0,.12,.19,160,'steel');
      for(let z=-78;z<80;z+=6.4){
        b.box(s*8.85,.32,z,.095,.64,.11,'charcoal');
        if((Math.round((z+78)/6.4)%3)===0)b.box(s*8.70,.61,z,.04,.10,.15,'yellow');
      }
      for(let i=0;i<43;i++)fir(b,s*(11+r()*52),-78+r()*156,3+r()*9,r);
    }
  }
  function citySet(b,d,r){
    b.strip(-195,195,-80,80,-.08,'curb');
    for(const s of [-1,1]){
      b.box(s*7.75,.085,0,4.85,.17,160,'curb');
      for(let z=-79;z<80;z+=2.5)b.strip(s*5.4,s*10,z,z+.026,.177,'roof');
      for(let z=-78;z<75;){
        const width=Math.min(9+r()*7,80-z),depth=5+r()*5,front=11+r()*1.5;
        const floors=Math.floor(2+r()*6),height=(floors+1)*3;
        const x=s*(front+depth/2),center=z+width/2;
        const stone=[['#988779','#50423f'],['#92989a','#48525a'],['#ad9f87','#594c42']][Math.floor(r()*3)];
        b.box(x,height/2,center,depth,height,width,stone,{kind:WINDOWS,seed:r()*78,cell:1.85});
        b.box(x,height+.18,center,depth+.35,.38,width+.3,'curb');
        b.box(x,height+.9,center+width*.18,depth*.55,1.45,width*.35,'roof');
        for(let floor=1;floor<=floors;floor++)b.box(s*(front-.11),floor*3+.2,center,.32,.19,width+.15,'curb');
        b.box(s*(front-.16),2.42,center,.4,.52,width*.92,r()>.5?'signal':'neon');
        for(let j=0;j<3;j++){
          const p=z+(j+.5)*width/3;
          b.box(s*(front-.22),1.27,p,.27,1.64,width*.25,['#374b53','#917950'],{kind:STOREFRONT,cell:width*.24,seed:r()*47});
          b.box(s*(front-.38),1.25,p,.045,1.7,.05,'steel');
          b.box(s*(front-.39),.45,p,.046,.08,width*.25,'roof');
          b.box(s*(front-.39),1.82,p,.05,.052,width*.25,'roof');
          if(j===1){
            b.box(s*(front-.42),1.03,p+.28,.055,.25,.027,'steel');
            b.box(s*(front-.50),.18,p,.65,.16,width*.25,'curb');
          }
        }
        // Awning with metal valance; benches, slats and cafe planter along the frontage.
        b.box(s*(front-.64),2.28,center,1.12,.09,width*.88,'roof');
        b.box(s*(front-1.17),2.16,center,.065,.18,width*.88,'curb');
        if(width>10.5){
          b.box(s*(front-1.01),.36,z+.93,.62,.68,1.38,'stone');
          b.taper(s*(front-1.01),.69,z+.93,.39,.26,.49,'leaf',8);
          for(let j=0;j<3;j++)b.box(s*(front-1.0+j*.109),.59,z+width-1.59,.088,.075,1.67,'bark');
          for(let j=0;j<2;j++)b.box(s*(front-.98),.39,z+width-2.13+j*1.12,.38,.38,.084,'charcoal');
        }
        z+=width+1.9+r()*3.6;
      }
      for(let i=0;i<11;i++){
        const z=-74+i*14,h=25+r()*38,w=6+r()*8,x=s*(31+r()*27);
        b.box(x,h/2,z,w,h,w*1.3,'roof',{kind:WINDOWS,cell:2.2,seed:r()*67});
        b.box(x,h+1.8,z,w*.7,3.6,w*.82,'steel',{kind:WINDOWS,seed:r()*16});
        if(i%4===0)b.taper(x,h+3.5,z,.20,.058,4.8,'steel');
      }
      for(let z=-74;z<80;z+=20){
        const x=s*8.25;
        b.taper(x,.16,z,.12,.074,5.8,'roof');b.box(x-s*.82,5.93,z,1.72,.10,.14,'roof');
        b.box(x-s*1.57,5.83,z,.75,.12,.38,'lamp');
        const tx=s*9.45;b.taper(tx,.16,z+5,.13,.09,2.9,'bark',7);
        b.taper(tx,2.15,z+5,1.17,1.34,1.54,'pine',9);b.taper(tx,3.69,z+5,1.34,.52,1.05,'leaf',9);
      }
    }
    for(let x=-4.8;x<4.9;x+=1.03)b.strip(x,x+.58,-58,-54.8,.013,'paint');
  }
  function trackSet(b,d,r){
    b.strip(-180,180,-80,80,-.065,'turf');
    ridge(d,{radius:210,baseHeight:12,amplitude:9,phase:.6,base:['#8da78e','#303a43'],peak:['#a5b4a2','#48525d'],rock:['#92a897','#38434e']});
    for(const s of [-1,1]){
      b.strip(s*7.05,s*9.25,-80,80,-.02,['#658e79','#324b43']);
      for(let z=-80;z<80;z+=2)b.box(s*6.98,.032,z+1,.53,.074,1.998,Math.round((z+80)/2)%2?'white':'red');
      b.box(s*11.8,.48,0,.58,.98,160,'curb');
      b.face([[s*11.8,.99,-80],[s*11.8,.99,80],[s*11.8,3.30,80],[s*11.8,3.30,-80]],'steel',CHAIN,[[0,0],[160,0],[160,2.31],[0,2.31]]);
      for(let z=-80;z<80;z+=5)b.box(s*11.8,1.6,z,.075,3.22,.08,'steel');
      for(let z=-68;z<80;z+=32){
        b.taper(s*15,0,z,.17,.095,12,'steel');
        b.box(s*15,12,z,.4,.58,3.2,'charcoal');
        for(let k=0;k<4;k++)b.box(s*14.77,12,z+k*.7-1.05,.1,.41,.52,'lamp');
      }
    }
    // Cantilevered grandstand and individual seat banks with alternating team colours.
    for(let i=0;i<7;i++){
      const x=-14-i*.94,h=.67+i*.56;
      b.box(x,h/2,0,.99,h,112,'curb');
      for(let z=-54;z<54;z+=2.65)b.box(x,h+.23,z,.53,.43,2.12,Math.floor((z+54)/15)%2?'roof':'red');
    }
    b.box(-18.2,8.3,0,10.4,.32,115,'roof');
    for(let z=-55;z<=55;z+=11){
      b.box(-22.6,4.12,z,.22,8.25,.23,'steel');b.box(-18.35,7.94,z,9,.21,.19,'steel');
    }
    for(let z=-64;z<64;z+=8){
      b.box(18.2,2.35,z,6.4,4.7,7.85,'curb');
      b.box(14.98,1.48,z,.10,2.75,6.7,'charcoal');
      for(let k=0;k<7;k++)b.box(14.90,.44+k*.35,z,.04,.065,6.6,'roof');
      b.box(14.90,3.28,z,.13,.38,7.38,'red');
    }
    b.box(18.2,5.5,-2,7.3,1.8,127,'charcoal',{kind:WINDOWS,cell:2.6,seed:23});
    b.box(18.2,6.51,-2,7.7,.26,128,'curb');
    for(const s of [-1,1])b.box(s*8.62,3.55,29,.41,7.1,.48,'steel');
    b.box(0,6.8,29,17.6,1.06,.58,'charcoal');
    for(let i=-2;i<=2;i++)b.box(i*.55,6.75,29.31,.29,.29,.06,'signal');
  }
  function coastSet(b,d,r){
    b.strip(-6.4,14.1,-80,80,-.07,'soil');
    b.strip(-155,-6.4,-80,80,-.08,'turf');
    // On the seaward side, a bluff drops to a curved strip of beach then a broad ocean.
    for(let i=0;i<32;i++){
      const z=-80+i*5,z1=z+5;
      const shore=t=>20+1.5*Math.sin(TAU*t/80)+1.1*Math.cos(TAU*t/160);
      const a=shore(z),a1=shore(z1);
      b.face([[11.8,-.06,z],[11.8,-.06,z1],[a1,-1.36,z1],[a,-1.36,z]],'stone');
      b.face([[a,-1.36,z],[a1,-1.36,z1],[a1+5,-1.87,z1],[a+5,-1.87,z]],'sand');
      b.face([[a+5,-1.87,z],[a1+5,-1.87,z1],[360,-1.87,z1],[360,-1.87,z]],'ocean',WATER,
        [[0,z],[0,z1],[360-a1-5,z1],[360-a-5,z]]);
    }
    // Inland terraces and broad wind-shaped trees shelter the road.
    for(let i=0;i<20;i++){
      const z=-80+i*8,z1=z+8;
      const h=t=>5+2.2*Math.sin(t*TAU/80)+1.6*Math.cos(t*TAU/160);
      b.face([[-9,-.05,z],[-9,-.05,z1],[-25,h(z1),z1],[-25,h(z),z]],'pine');
      b.face([[-25,h(z),z],[-25,h(z1),z1],[-57,h(z1)+3,z1],[-57,h(z)+3,z]],'turf');
    }
    for(let z=-75;z<80;z+=10){
      b.box(8.7,.42,z,.32,.85,.4,'white');b.box(8.7,.55,z,.33,.14,.41,'charcoal');
      if(z%3===0)b.box(8.7,.58,z-.21,.2,.11,.03,'yellow');
    }
    b.box(8.7,.62,0,.1,.11,160,'steel');
    for(let i=0;i<14;i++)fir(b,-10-r()*8,-76+r()*152,2.9+r()*3.7,r);
    for(let i=0;i<16;i++) {
      const x=37+r()*50,z=-77+r()*154,h=.8+r()*2.8;
      b.taper(x,-1.9,z,h*1.8,h*.65,h,'stone',7);b.taper(x,-1.9+h,z,h*.65,.16,h*.30,'soil',7);
    }
    // Striped beacon on a stone breakwater.
    b.taper(36,-1.9,-34,6,3.1,2.9,'stone',11);
    for(let i=0;i<4;i++)b.taper(36,1+i*1.45,-34,1.28-i*.11,1.17-i*.11,1.45,i%2?'red':'white',12);
    b.taper(36,6.8,-34,1.18,1.18,.2,'charcoal',14);b.taper(36,7,-34,.75,.75,.98,'lamp',10);
    b.taper(36,7.98,-34,1.1,.06,.69,'red',12);
    for(let i=0;i<3;i++){
      const x=62+i*22,z=-52+i*39;
      b.taper(x,-1.90,z,1.0,1.8,.57,'charcoal',8);
      b.face([[x,-1.36,z],[x,4.4,z],[x+.08,-1.26,z+2.4]],'white');
      b.face([[x,3.56,z-.1],[x,-1.21,z-1.89],[x,-1.23,z-.14]],'sand');
    }
    // Headlands interrupt the ocean horizon in both directions.
    for(const s of [-1,1]){
      for(let i=0;i<6;i++){
        const x=-35+i*15,z=s*(123+i*3),h=11-i*1.34;
        d.taper(x,-2,z,26-i,11-i*.8,h,'mist',11);d.taper(x,h-2,z,11-i*.8,2,h*.23,'turf',10);
      }
    }
  }
  const builders={mountain:mountainSet,city:citySet,track:trackSet,coast:coastSet};
  function getSet(id){
    if(sets.has(id))return sets.get(id);
    const b=new Batch(),d=new Batch(),group=new THREE.Group(),tiles=new THREE.Group();
    group.name=id;group.add(tiles);root.add(group);
    // The front three-quarter camera looks toward -X. Put open water behind the car.
    if(id==='coast')group.scale.x=-1;
    road(b,id);builders[id](b,d,random(17));
    const tile=b.mesh();
    for(let j=-2;j<=2;j++){const m=j===0?tile:tile.clone();m.position.z=LENGTH*j;tiles.add(m);}
    if(d.vertices.length)group.add(d.mesh());
    const set={group,tiles};sets.set(id,set);return set;
  }
  // Distant stars are one draw call. They stay fixed against the skyline.
  const starsGeo=owned(new THREE.BufferGeometry()),positions=[],r=random(49);
  for(let i=0;i<750;i++){
    const a=r()*TAU,y=.018+r()*.88,rad=270*Math.sqrt(1-y*y);positions.push(rad*Math.sin(a),270*y,rad*Math.cos(a));
  }
  starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const starsMat=owned(new THREE.PointsMaterial({color:0xd7e3ed,size:.32,transparent:true,opacity:.65,depthWrite:false}));
  const stars=new THREE.Points(starsGeo,starsMat);stars.layers.set(layer);stars.renderOrder=-65;root.add(stars);
  let current=null,travel=0;
  root.visible=false;
  return {
    group:root,
    apply(id,night){
      root.visible=Object.hasOwn(builders,id);
      if(current)current.group.visible=false;
      if(!root.visible){current=null;return;}
      current=getSet(id);current.group.visible=true;current.tiles.position.z=-travel;
      uniforms.darkness.value=night?1:0;
      const haze=night?(id==='city'?'#484355':'#344353'):(id==='coast'?'#b7d5d5':'#c6d0cb');
      uniforms.haze.value.copy(toDisplay(haze));
      stars.visible=!!night;starsMat.opacity=id==='city'?.30:.72;
    },
    update(dt,speedMps){
      if(!current)return;
      uniforms.clockTime.value=(uniforms.clockTime.value+dt)%4096;
      if(speedMps>0){travel=(travel+speedMps*dt)%LENGTH;current.tiles.position.z=-travel;}
    },
    dispose(){for(const resource of resources)resource.dispose();sets.clear();}
  };
}
