export function makePlume(THREE, layers) {
  const plume = new THREE.Group();
  // Draw the translucent exhaust after the reflective floor and contact shadow.
  plume.renderOrder = 5;
  plume.name = 'Jet plume';
  for (const [r,length,color,opacity] of layers) {
    const flame = new THREE.ConeGeometry(r,length,28,12,true);
    flame.rotateX(-Math.PI/2);
    flame.translate(0,0,-length/2);
    plume.add(new THREE.Mesh(flame,new THREE.ShaderMaterial({
      uniforms:{tint:{value:new THREE.Color(color)},density:{value:opacity},tick:{value:0}},
      vertexShader:`varying vec2 coords;
        varying vec3 viewPosition, viewNormal;
        uniform float tick;
        void main(){
          coords=uv;
          vec3 p=position;
          p.xy*=1.+.08*sin(uv.y*20.-tick*16.)*uv.y;
          p.x+=uv.y*uv.y*.013*sin(tick*21.+uv.y*9.);
          vec4 mv=modelViewMatrix*vec4(p,1.);
          viewPosition=-mv.xyz;
          viewNormal=normalMatrix*normal;
          gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader:`varying vec2 coords;
        varying vec3 viewPosition, viewNormal;
        uniform float density, tick;
        uniform vec3 tint;
        void main(){
          float travel=coords.y;
          float wave=.5+.5*cos(6.283*(travel*4.-tick*.9));
          float rim=abs(dot(normalize(viewNormal),normalize(viewPosition)));
          float fade=(1.-smoothstep(.28,1.,travel))*smoothstep(0.,.08,travel);
          gl_FragColor=vec4(tint*(1.35+.55*wave),density*fade*(.06+.70*rim)*(.60+.4*wave));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    })));
  }
  plume.scale.z=.001;
  plume.visible=false;
  return plume;
}
