/* ═══════════════════════════════════════════════
   progress.js — orientación: barra de progreso + rail de capítulos
   · La barra marca dónde empieza cada capítulo (pequeñas muescas):
     no solo "cuánto llevo", también "en qué parte del libro estoy".
   · Se engrosa un poco mientras hay scroll y vuelve a su grosor en reposo.
   · En el rail, la marca del capítulo activo crece con el avance dentro de él.
   Un solo listener pasivo + un rAF: nada se calcula si nada se mueve.
   ═══════════════════════════════════════════════ */
import { reduced } from './env.js';

export function initProgress() {
  const bar = document.getElementById('progressBar');
  const chapters = [...document.querySelectorAll('.ds .chapter')];
  const links = [...document.querySelectorAll('#chRail a')];
  if (!bar || !chapters.length) return;

  // Muescas de capítulo encima de la barra
  const ticks = document.createElement('div');
  ticks.className = 'ds-ticks';
  ticks.setAttribute('aria-hidden', 'true');
  chapters.forEach(() => ticks.appendChild(document.createElement('i')));
  document.body.appendChild(ticks);
  const tickEls = [...ticks.children];

  let tops = [], bottoms = [], max = 1;
  function measure() {
    const y = window.scrollY;
    max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    tops = chapters.map((c) => c.getBoundingClientRect().top + y);
    bottoms = chapters.map((c) => c.getBoundingClientRect().bottom + y);
    tickEls.forEach((t, i) => { t.style.left = (Math.min(1, tops[i] / max) * 100) + '%'; });
  }

  let lastY = window.scrollY, idleTimer = 0, ticking = false, thick = false;
  const lastCp = new WeakMap();
  function frame() {
    ticking = false;
    const y = window.scrollY;
    // grosor dinámico: fino en reposo, un punto más presente mientras se avanza
    if (!reduced() && Math.abs(y - lastY) > 2) {
      if (!thick) { bar.style.setProperty('--th', '1'); thick = true; }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { bar.style.setProperty('--th', '.67'); thick = false; }, 260);
    }
    lastY = y;
    tickEls.forEach((t, i) => { const on = y + 1 >= tops[i]; if (t._on !== on) { t._on = on; t.classList.toggle('past', on); } });
    // avance dentro del capítulo activo → marca del rail
    links.forEach((a, i) => {
      if (a.getAttribute('aria-current') !== 'step') return;
      const mid = y + innerHeight * 0.5;
      const p = (mid - tops[i]) / Math.max(1, bottoms[i] - tops[i]);
      const cp = Math.round(Math.max(0, Math.min(1, p)) * 50) / 50;   // 2 % de resolución: basta para el ojo
      if (lastCp.get(a) !== cp) { lastCp.set(a, cp); a.style.setProperty('--cp', cp); }
    });
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };

  measure(); frame();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measure(); onScroll(); });
  // fuentes, gráficos generados y galerías cambian la altura después de cargar
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); onScroll(); }).observe(document.querySelector('main.ds'));
}
