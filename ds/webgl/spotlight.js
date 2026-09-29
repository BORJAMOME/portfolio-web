/* ═══════════════════════════════════════════════
   spotlight.js — la linterna narrativa del capítulo 05
   Cada frase dice qué mirar (data-spot en el paso); la linterna se
   desplaza hasta ahí y oscurece el resto. Mientras los paneles se
   recolocan (tamaño, posición), la luz los sigue: se mide cada frame
   solo durante ~1 s tras un cambio y después el bucle se detiene.
   Sin WebGL: no hay velo y el capítulo funciona igual (.dim ya atenúa).
   ═══════════════════════════════════════════════ */
import { createQuad } from './quad.js';
import FRAG from '../shaders/spotlight.frag.js';
import { reduced, narrow, bus } from '../motion/env.js';

const TARGETS = { bar: '.brow.hero', kpi: '.p-k2', bars: '.p-bars', annot: '.annot' };
const PAD = 8, FOLLOW_MS = 1150;

export function initSpotlight() {
  const dash = bus().DASH && bus().DASH.c05;
  if (!dash) return;
  const wrap = dash.el.parentElement;
  const canvas = document.createElement('canvas');
  canvas.className = 'ds-spot';
  canvas.setAttribute('aria-hidden', 'true');
  wrap.appendChild(canvas);
  const q = createQuad(canvas, FRAG, { dprCap: narrow() ? 1 : 1.5 });
  if (!q) { canvas.remove(); return; }

  let els = [], cur = [], k = 0, kTo = 0, until = 0, raf = 0;

  const measure = () => {
    const W = wrap.getBoundingClientRect();
    return els.map((e) => {
      const r = e.getBoundingClientRect();
      return [r.left - W.left - PAD, r.top - W.top - PAD, r.width + PAD * 2, r.height + PAD * 2];
    });
  };

  function render(t) {
    const { h, dpr } = q.resize();
    const flat = new Float32Array(12);
    cur.slice(0, 3).forEach((r, i) => {
      flat.set([r[0] * dpr, (h - r[1] - r[3]) * dpr, r[2] * dpr, r[3] * dpr], i * 4);   // y hacia arriba
    });
    const { gl, u } = q;
    gl.uniform2f(u('u_res'), canvas.width, canvas.height);
    gl.uniform4fv(u('u_r'), flat);
    gl.uniform1f(u('u_n'), Math.min(3, cur.length));
    gl.uniform1f(u('u_k'), k);
    gl.uniform1f(u('u_dpr'), dpr);
    gl.uniform1f(u('u_t'), (t || 0) * 0.001 % 100);
    q.draw();
  }

  function tick(t) {
    const rm = reduced(), a = rm ? 1 : 0.16;
    // sin objetivos: la luz se queda donde estaba mientras el velo se retira
    const to = els.length ? measure() : cur.map((r) => r.slice());
    // un foco que sobra se cierra hacia su centro en vez de desaparecer de golpe
    for (let i = to.length; i < cur.length; i++) { const c = cur[i]; to.push([c[0] + c[2] / 2, c[1] + c[3] / 2, 0, 0]); }
    let moving = false;
    cur = to.map((r, i) => {
      // un foco nuevo nace en el centro de su objetivo y se abre
      const c = cur[i] || [r[0] + r[2] / 2, r[1] + r[3] / 2, 0, 0];
      const n = c.map((v, j) => v + (r[j] - v) * a);
      if (n.some((v, j) => Math.abs(v - r[j]) > 0.4)) moving = true;
      return n;
    });
    const keep = els.length || cur.length;
    cur = cur.filter((r, i) => i < keep || r[2] > 1);
    k += (kTo - k) * (rm ? 1 : 0.12);
    if (Math.abs(kTo - k) > 0.004) moving = true;
    if (!els.length && k < 0.004) { k = 0; cur = []; }
    render(t);
    raf = (moving || performance.now() < until) ? requestAnimationFrame(tick) : 0;
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

  function apply(state) {
    if (!state || state.key !== 'c05') return;
    const spots = (state.step.dataset.spot || '').split(' ').filter(Boolean);
    els = spots.map((s) => dash.el.querySelector(TARGETS[s])).filter(Boolean);
    kTo = els.length ? 1 : 0;
    until = performance.now() + FOLLOW_MS;   // los paneles tardan ~850 ms en recolocarse
    wake();
  }

  bus().on('state', apply);
  apply(bus().state.c05);
  new ResizeObserver(() => { until = performance.now() + 100; wake(); }).observe(wrap);
}
