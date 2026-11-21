export const CAMOUFLAGE = {
  '#657174': ['#273238','#4e5c58','#aeb6b0'],
  '#68734c': ['#353f33','#536346','#a8a17a'],
  '#b39a75': ['#7d6349','#a28360','#dfc9a2'],
};

export function applyCamouflage(THREE, material, palette) {
  if (material.userData.camouflage === palette) return;
  material.userData.camouflage = palette;
  material.customProgramCacheKey = () => palette ? palette.join(',') : 'drivehud-solid';
  material.onBeforeCompile = palette ? (shader) => {
    for (const [i, hex] of palette.entries()) shader.uniforms['camo'+i] = {value:new THREE.Color(hex)};
    shader.vertexShader = 'varying vec3 vCamoPosition;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      vCamoPosition=(modelMatrix*vec4(transformed,1.0)).xyz;
      #include <project_vertex>
    `);
    const coordinates = palette === CAMOUFLAGE['#657174']
      ? '(floor(vCamoPosition * 19.0) + .5) / 19.0'
      : 'vCamoPosition';
    shader.fragmentShader = `
      varying vec3 vCamoPosition;
      uniform vec3 camo0,camo1,camo2;
      float camoHash(vec3 p) { return fract(sin(dot(p,vec3(117.1,63.7,46.1)))*43758.5453); }
      float camoNoise(vec3 p) {
        vec3 i=floor(p), f=fract(p);
        f=f*f*(3.0-2.0*f);
        vec2 layers=vec2(
          mix(mix(camoHash(i),camoHash(i+vec3(1,0,0)),f.x),
              mix(camoHash(i+vec3(0,1,0)),camoHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(camoHash(i+vec3(0,0,1)),camoHash(i+vec3(1,0,1)),f.x),
              mix(camoHash(i+vec3(0,1,1)),camoHash(i+vec3(1,1,1)),f.x),f.y));
        return mix(layers.x,layers.y,f.z);
      }
    ` + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float patternValue = .76*camoNoise(${coordinates}*4.0)+.24*camoNoise(${coordinates}*10.0);
      diffuseColor.rgb=mix(diffuseColor.rgb,camo0,smoothstep(.54,.56,patternValue));
      diffuseColor.rgb=mix(diffuseColor.rgb,camo1,1.0-smoothstep(.36,.38,patternValue));
      diffuseColor.rgb=mix(diffuseColor.rgb,camo2,smoothstep(.66,.68,patternValue));
    `);
  } : THREE.Material.prototype.onBeforeCompile;
  material.needsUpdate = true;
}
