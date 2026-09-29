/* ═══════════════════════════════════════════════
   hero.js — el dashboard del hero como objeto físico
   · Entrada cinematográfica: CSS puro (data-storytelling.css, dsEnter),
     empieza en la primera pintura y no depende de ninguna librería.
   · Profundidad: se inclina hasta 3° hacia el cursor; nunca rota solo.
   · Cristal: WebGL (ds/webgl/glass.js), cargado solo con ratón.
   · Respiración: con el cursor lejos, la sombra respira muy despacio.
   ═══════════════════════════════════════════════ */
import { reduced, finePointer, bus } from '../motion/env.js';
import { attachDepth } from '../motion/depth.js';

export async function initHero() {
  const dash = bus().DASH && bus().DASH.hero;
  if (!dash || reduced()) return;
  const wrap = dash.el.parentElement;

  let breatheTimer = 0;
  const rest = () => { clearTimeout(breatheTimer); breatheTimer = setTimeout(() => wrap.classList.add('breathe'), 2500); };
  // La entrada dura ~1,4 s; la respiración empieza después, nunca encima.
  setTimeout(rest, 1600);

  if (!finePointer()) return;   // táctil: entrada + respiración, sin cursor que seguir

  let glass = null;
  try { glass = (await import('../webgl/glass.js')).createGlass(wrap); } catch (e) { /* sin WebGL: sin cristal */ }

  attachDepth(wrap, {
    tilt: 3,
    onMove(nx, ny) { wrap.classList.remove('breathe'); clearTimeout(breatheTimer); glass && glass.point(nx, ny); },
    onLeave() { glass && glass.release(); rest(); },
  });
}
