/* ═══════════════════════════════════════════════
   depth.js — los dashboards como objetos, no como capturas
   Al señalar uno, se inclina un par de grados hacia el cursor, su
   sombra se desplaza en sentido contrario y un brillo suave sigue la luz.
   Solo en dashboards que se leen quietos: los que están cambiando de
   estado en un scroll no se mueven (el lector está mirando el cambio).
   ═══════════════════════════════════════════════ */
import { reduced, finePointer } from './env.js';

const TILT = 2.4; // grados: se percibe, no marea

/** Aplica inclinación + sombra + brillo a un elemento. Devuelve un control para el hero. */
export function attachDepth(el, { tilt = TILT, onMove, onLeave } = {}) {
  if (!el || reduced() || !finePointer()) return null;
  el.classList.add('depth');
  let raf = 0;
  const move = (e) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;   // -0.5 … 0.5
      const ny = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', (nx * tilt).toFixed(2) + 'deg');
      el.style.setProperty('--rx', (-ny * tilt).toFixed(2) + 'deg');
      el.style.setProperty('--sx', (-nx * 18).toFixed(1));     // la sombra se aleja de la luz
      el.style.setProperty('--sy', (-ny * 10).toFixed(1));
      el.style.setProperty('--mx', ((nx + 0.5) * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((ny + 0.5) * 100).toFixed(1) + '%');
      el.classList.add('is-near');
      onMove && onMove(nx, ny, e);
    });
  };
  const leave = () => {
    cancelAnimationFrame(raf);
    ['--rx', '--ry', '--sx', '--sy'].forEach((p) => el.style.removeProperty(p));
    el.classList.remove('is-near');
    onLeave && onLeave();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  return { leave };
}

export function initDepth() {
  // Dashboards y gráficos que se leen quietos (fuera de los scrollytellings)
  const quiet = ['final', 'titles', 'sales', 'a11y', 'val']
    .map((n) => document.querySelector(`[data-dash="${n}"] .dash-wrap`));
  quiet.push(document.querySelector('.exec'), document.getElementById('dyn'));
  quiet.forEach((el) => attachDepth(el));
}
