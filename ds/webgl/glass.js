/* ═══════════════════════════════════════════════
   glass.js — superficie de cristal sobre el dashboard del hero
   Dibuja solo cuando la luz se mueve: sigue al cursor con inercia y,
   en cuanto llega a su sitio, el bucle se detiene. En reposo no hay
   ni un frame de GPU (la "respiración" del hero es la sombra, en CSS).
   ═══════════════════════════════════════════════ */
import { createQuad } from './quad.js';
import FRAG from '../shaders/glass.frag.js';
import { reduced } from '../motion/env.js';

const REST = { x: 0.3, y: 0.75, i: 0.35 };   // luz de reposo: arriba-izquierda, a media intensidad

export function createGlass(wrap) {
  if (reduced()) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'ds-glass';
  canvas.setAttribute('aria-hidden', 'true');
  wrap.appendChild(canvas);
  const q = createQuad(canvas, FRAG, { dprCap: 1.25 });
  if (!q) { canvas.remove(); return null; }

  let raf = 0;
  const m = { x: REST.x, y: REST.y }, to = { x: REST.x, y: REST.y };
  let i = 0, iTo = REST.i;

  function draw(t) {
    q.resize();
    const { gl, u } = q;
    gl.uniform2f(u('u_res'), canvas.width, canvas.height);
    gl.uniform2f(u('u_m'), m.x, m.y);
    gl.uniform1f(u('u_i'), i);
    gl.uniform1f(u('u_t'), (t || 0) * 0.001 % 100);
    q.draw();
  }
  function tick(t) {
    m.x += (to.x - m.x) * 0.12; m.y += (to.y - m.y) * 0.12; i += (iTo - i) * 0.1;
    draw(t);
    const settled = Math.abs(to.x - m.x) < 0.002 && Math.abs(to.y - m.y) < 0.002 && Math.abs(iTo - i) < 0.003;
    raf = settled ? 0 : requestAnimationFrame(tick);
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

  canvas.classList.add('on');
  wake();   // una primera pasada hasta la luz de reposo, y se detiene
  new ResizeObserver(() => { draw(performance.now()); }).observe(wrap);

  return {
    /** nx, ny ∈ [-0.5, 0.5] desde el centro del dashboard */
    point(nx, ny) { to.x = nx + 0.5; to.y = 0.5 - ny; iTo = 1; wake(); },
    release() { to.x = REST.x; to.y = REST.y; iTo = REST.i; wake(); },
  };
}
