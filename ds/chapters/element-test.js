/* ═══════════════════════════════════════════════
   element-test.js — el test del elemento como herramienta
   Un solo resaltado viaja de una fila a otra: se ve de qué pregunta
   viene la decisión, no solo que "algo se ha pintado". El veredicto
   se reemplaza con un pequeño relevo y la acción se sella.
   El motor ya decide la fila (.hit); aquí solo se cuenta el cambio.
   ═══════════════════════════════════════════════ */
import { reduced } from '../motion/env.js';

export function initElementTest() {
  const table = document.querySelector('.etable');
  const picks = document.querySelectorAll('.etest .picks button');
  const verdict = document.getElementById('everdict');
  if (!table || !picks.length) return;

  // Contenedor posicionado + la barra que viaja
  const host = table.parentElement;
  host.classList.add('etest-table');
  const hl = document.createElement('span');
  hl.className = 'etable-hl';
  hl.setAttribute('aria-hidden', 'true');
  host.insertBefore(hl, table);
  table.classList.add('has-hl');

  function place() {
    const row = table.querySelector('tbody tr.hit');
    if (!row) { hl.style.opacity = '0'; return; }
    hl.style.transform = `translateY(${row.offsetTop + table.offsetTop}px)`;
    hl.style.height = row.offsetHeight + 'px';
    hl.style.opacity = '1';
    if (reduced()) return;
    const act = row.cells[row.cells.length - 1];
    act.classList.remove('stamp'); void act.offsetWidth; act.classList.add('stamp');
    if (verdict) { verdict.classList.remove('swap'); void verdict.offsetWidth; verdict.classList.add('swap'); }
  }

  // El motor escucha el clic primero; esperamos a que marque la fila.
  picks.forEach((b) => b.addEventListener('click', () => requestAnimationFrame(place)));
  window.addEventListener('resize', place);
}
