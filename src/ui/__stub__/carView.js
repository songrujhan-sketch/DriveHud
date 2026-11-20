// STUB：2D 車形。介面同 Worker B 的 createCarView。整合時由 src/car/carView.js 取代。
export function createCarView(canvas, opts = {}) {
  let { model = 'valkyrie', color = '#d32f2f', headlights = false, darkMode = false } = opts;
  let speed = 0, compact = false, angle = 0, last = performance.now(), raf = 0, alive = true;
  const ctx = canvas.getContext('2d');

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }
  function wheel(x, y, r) {
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = r * 0.12;
    for (let i = 0; i < 5; i++) {
      const a = angle + (i * 2 * Math.PI) / 5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); ctx.stroke();
    }
  }
  function frame(t) {
    if (!alive) return;
    const dt = (t - last) / 1000; last = t;
    angle += (speed / 3.6 / 0.33) * dt; // 輪徑 0.66 m
    const w = canvas.width, h = canvas.height;
    if (w < 2) { resize(); raf = requestAnimationFrame(frame); return; }
    ctx.clearRect(0, 0, w, h);
    const u = Math.min(w / 10, h / 4.2);
    ctx.save(); ctx.translate(w / 2, h / 2 + u * 0.4);
    const body = model === 'darkknight' ? '#2b2b30' : color;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(-4 * u, -0.9 * u, 8 * u, 1.5 * u, 0.4 * u); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-2 * u, -1.9 * u, 4 * u, 1.2 * u, 0.5 * u); ctx.fill();
    ctx.fillStyle = darkMode ? '#8fb7d8' : '#bfe0f5';
    ctx.beginPath(); ctx.roundRect(-1.6 * u, -1.75 * u, 3.2 * u, 0.85 * u, 0.3 * u); ctx.fill();
    ctx.fillStyle = headlights ? '#fff7b0' : '#777'; ctx.fillRect(3.7 * u, -0.5 * u, 0.4 * u, 0.3 * u);
    ctx.fillStyle = headlights ? '#ff3030' : '#733'; ctx.fillRect(-4.1 * u, -0.5 * u, 0.4 * u, 0.3 * u);
    wheel(-2.4 * u, 0.7 * u, 0.8 * u); wheel(2.4 * u, 0.7 * u, 0.8 * u);
    ctx.restore();
    raf = requestAnimationFrame(frame);
  }
  resize(); raf = requestAnimationFrame(frame);
  return {
    setSpeedKmh(v) { speed = v || 0; },
    setColor(c) { color = c; },
    setHeadlights(b) { headlights = !!b; },
    setModel(m) { model = m; },
    setCompact(b) { compact = !!b; },
    setDarkMode(b) { darkMode = !!b; },
    resize,
    dispose() { alive = false; cancelAnimationFrame(raf); },
    get compact() { return compact; },
  };
}
