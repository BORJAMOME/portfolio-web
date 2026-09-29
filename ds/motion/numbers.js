/* ═══════════════════════════════════════════════
   numbers.js — las cifras se construyen, no se cuentan
   Nada de contadores que suben de 0 a 1.572.340: eso inventa valores
   intermedios que nunca existieron. Aquí cada carácter de la cifra real
   encaja en su sitio, de izquierda a derecha, como tipos en una caja.
   · El texto accesible no cambia (aria-label en el contenedor).
   · Sin JS o con movimiento reducido: la cifra está ahí desde el principio.
   ═══════════════════════════════════════════════ */
import { reduced, bus } from './env.js';

/** Parte un nodo de texto en spans por carácter. Devuelve el contenedor preparado. */
function split(el) {
  if (el.dataset.nbDone) return el;
  const text = el.textContent;
  if (!text.trim()) return el;
  if (!el.closest('[role="img"]')) el.setAttribute('aria-label', text.trim());
  el.textContent = '';
  let i = 0;
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'nb';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.setProperty('--ci', i++);
    el.appendChild(s);
  }
  el.classList.add('nbw');
  el.dataset.nbDone = '1';
  return el;
}

/** Reinicia la animación (también al volver a un estado haciendo scroll). */
export function build(el, baseMs = 0) {
  if (!el || reduced()) return;
  split(el);
  el.style.setProperty('--nb-base', baseMs + 'ms');
  el.classList.remove('build');
  void el.offsetWidth;   // fuerza reflow: la animación vuelve a empezar
  el.classList.add('build');
}

/** Las cifras de un dashboard: el valor largo y el corto de cada KPI. */
const kpiSpans = (dashEl, which) => dashEl.querySelectorAll('.kpi .kv ' + which);

export function initNumbers() {
  if (reduced()) return;

  // 1 · Hero: al llegar, los KPIs se componen mientras el dashboard entra.
  const hero = bus().DASH && bus().DASH.hero;
  // (con portada delante, espera a que el dashboard entre en pantalla)
  const heroIn = () => kpiSpans(hero.el, '.n-l').forEach((s, i) => build(s, 700 + i * 90));
  if (hero) { if (bus().heroLive) heroIn(); else document.addEventListener('ds:herolive', heroIn, { once: true }); }

  // 2 · Cifras editoriales grandes (2,4 M€, 8,4 M€…): al entrar en pantalla.
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); build(e.target, 120); } });
  }, { threshold: 0.6 });
  document.querySelectorAll('.ds .ds-num').forEach((el) => {
    if (el.children.length) return;     // cifras compuestas con <small>/<span>: se dejan intactas
    split(el); io.observe(el);
  });

  // 3 · Dashboards que cambian de estado: cuando aparece el formato corto
  //     ("Los decimales tampoco…") o cuando los KPIs ocupan su caja (cap. 10),
  //     las cifras se vuelven a componer: el lector ve exactamente qué cambió.
  bus().on('dash', ({ flags, prev, el }) => {
    const has = (f, s) => (' ' + s + ' ').includes(' ' + f + ' ');
    if (has('short', flags) && !has('short', prev)) kpiSpans(el, '.n-s').forEach((s, i) => build(s, i * 70));
    if (has('b-kpi', flags) && !has('b-kpi', prev)) kpiSpans(el, has('short', flags) ? '.n-s' : '.n-l').forEach((s, i) => build(s, 200 + i * 90));
  });
}
