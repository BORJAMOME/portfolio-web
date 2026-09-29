/* ═══════════════════════════════════════════════
   buttons.js — imán ligero en las llamadas a la acción
   El botón se inclina unos píxeles hacia el cursor: confirma que
   "esto responde" antes del clic. Máximo 6 px, solo con ratón.
   La flecha deslizante y el subrayado son CSS puro (data-storytelling.css).
   ═══════════════════════════════════════════════ */
import { reduced, finePointer } from './env.js';

const PULL = 0.22, MAX = 6;

export function initButtons() {
  if (reduced() || !finePointer()) return;
  document.querySelectorAll('.ds .btn-ds').forEach((btn) => {
    let raf = 0;
    btn.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = btn.getBoundingClientRect();
        const dx = Math.max(-MAX, Math.min(MAX, (e.clientX - (r.left + r.width / 2)) * PULL));
        const dy = Math.max(-MAX, Math.min(MAX, (e.clientY - (r.top + r.height / 2)) * PULL));
        btn.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      });
    });
    btn.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); btn.style.transform = ''; });
  });
}
