import { mesh } from './parts.js?v=1.10.0';

// The lip lies at z=0 and the blind bore extends towards +Z.
export function makeNozzle(T, M, radius, depth, turbine = false) {
  const g = new T.Group();
  const wall = (points, material) => {
    const profile = points.map(([r,d]) => new T.Vector2(r*radius,d*depth));
    const geo = new T.LatheGeometry(profile,32);
    geo.rotateX(Math.PI/2);
    g.add(new T.Mesh(geo,material));
  };
  wall([[.91,0],[1,.025],[1,.12],[.95,1.7]], M.darkChrome);
  wall([[.82,.04],[.86,0],[.91,0],[1,.025]], M.chrome);
  wall([[.67,.94],[.75,.62],[.78,.32],[.82,.04]], M.trim);
  const face = new T.CircleGeometry(.72*radius,32);
  face.rotateY(Math.PI);
  g.add(mesh(T,face,M.under,[0,0,.93*depth]));
  const ring = (r,z) => g.add(mesh(T,new T.TorusGeometry(r*radius,.026*radius,6,32),M.darkChrome,[0,0,z*depth]));
  ring(.77,.34);
  if (turbine) {
    for (let i=0;i<9;i++) {
      const a=i*Math.PI*2/9;
      const blade=mesh(T,new T.BoxGeometry(.43*radius,.095*radius,.08*radius),M.rim,
        [.43*radius*Math.cos(a),.43*radius*Math.sin(a),.68*depth],[0,.28,a+.30]);
      g.add(blade);
    }
    g.add(mesh(T,new T.SphereGeometry(.19*radius,16,10),M.darkChrome,[0,0,.67*depth]));
  } else {
    ring(.67,.82);
    // Perforated inner baffle is recessed behind the rolled metal lip.
    for (let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      g.add(mesh(T,new T.TorusGeometry(.113*radius,.026*radius,5,12),M.darkChrome,
        [.41*radius*Math.cos(a),.41*radius*Math.sin(a),.88*depth]));
    }
  }
  return g;
}
