/* ═══════════════════════════════════════════════
   env.js — lo que todos los módulos necesitan saber
   antes de mover un solo píxel.
   ═══════════════════════════════════════════════ */

const mq = (q) => window.matchMedia(q);

/** Preferencia de movimiento reducido. Se lee en cada uso: puede cambiar en vivo. */
export const reduced = () => mq('(prefers-reduced-motion: reduce)').matches;

/** Puntero preciso (ratón/trackpad). Sin él no hay hover ni cursor: nada de tilt ni imán. */
export const finePointer = () => mq('(hover: hover) and (pointer: fine)').matches;

/** Pantallas estrechas: menos calidad GPU, menos efectos. */
export const narrow = () => mq('(max-width: 860px)').matches;

/** GSAP y ScrollTrigger vienen de CDN. Si no cargaron, cada módulo tiene su plan B. */
export const gsap = () => window.gsap || null;
export const ScrollTrigger = () => window.ScrollTrigger || null;

/** Bus del motor (data-storytelling.js). Siempre existe si el motor arrancó. */
export const bus = () => window.DSBus || { on() {}, state: {}, DASH: {} };

/** Tokens del sistema de movimiento (espejo de las variables CSS). */
export const DUR = { micro: 0.15, ui: 0.25, reveal: 0.45, narr: 0.7 };
export const EASE = { out: 'expo.out', inOut: 'power2.inOut', in: 'power2.in' };

/** Ejecuta fn cuando el navegador esté libre (sin competir con la primera pintura). */
export const idle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 200));

/** Observa una vez: llama a fn cuando el elemento se acerca al viewport. */
export function whenNear(el, fn, rootMargin = '400px 0px') {
  if (!el) return;
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
  }, { rootMargin });
  io.observe(el);
}
