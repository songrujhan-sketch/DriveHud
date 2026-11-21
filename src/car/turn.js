// Bicycle-model visual approximation using the wrapped change in GPS course.
export function estimateTurn(last, next) {
  if (!last || !(next.speed >= 8/3.6)) return 0;
  const dt = (next.t-last.t)/1000;
  if (!(dt > 0 && dt <= 4)) return 0;
  const degrees = (next.heading-last.heading+540)%360-180;
  if (Math.abs(degrees)<2 || Math.abs(degrees/dt)>70) return 0;
  const yawRate = degrees*Math.PI/180/dt;
  return -Math.max(-.48, Math.min(.48, Math.atan(2.8*yawRate/next.speed)));
}
