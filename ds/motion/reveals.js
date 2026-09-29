/* ═══════════════════════════════════════════════
   reveals.js — entradas escalonadas con ScrollTrigger.batch
   Cuando varios elementos entran juntos (una lista, una rejilla de
   tarjetas), aparecen en orden de lectura en vez de todos a la vez.
   Sin GSAP, el CSS (.rv-seq) hace la misma secuencia: esto solo la afina.
   ═══════════════════════════════════════════════ */
import { reduced, gsap, ScrollTrigger, DUR, EASE } from './env.js';

// Grupos que se leen en orden. `stagger` = pausa entre piezas.
const GROUPS = [
  { sel: '.rv-seq:not(.wwh) > *', stagger: 0.08 },
  { sel: '.wwh > *', stagger: 0.42 },          // WHAT · pausa · WHY · pausa · HOW
  { sel: '.gal > .gcase', stagger: 0.08 },
  { sel: '.illus > .ill', stagger: 0.07 },
  { sel: '.two-dash > div', stagger: 0.12 },
  { sel: '.scales > .scale', stagger: 0.1 },
  { sel: '.pbinav > button', stagger: 0.08 },
];

export function initReveals() {
  const g = gsap(), ST = ScrollTrigger();
  if (!g || !ST || reduced()) return;
  g.registerPlugin(ST);
  document.documentElement.classList.add('ds-gsap'); // apaga las transiciones CSS de .rv-seq

  GROUPS.forEach(({ sel, stagger }) => {
    const els = g.utils.toArray(sel);
    if (!els.length) return;
    g.set(els, { opacity: 0, y: 12 });
    ST.batch(els, {
      start: 'top 88%',
      once: true,
      onEnter: (batch) => g.to(batch, {
        opacity: 1, y: 0, duration: DUR.reveal * 1.4, ease: EASE.out,
        stagger, clearProps: 'transform',
      }),
    });
  });
}
