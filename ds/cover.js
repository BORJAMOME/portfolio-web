/* ═══════════════════════════════════════════════
   cover.js — portada: apertura de reportaje en blanco y negro
   Dos variantes que se alternan en cada carga (la primera, al azar):
   · 7b «semitono»: barras divergentes en trama de puntos; los 10
     capítulos son las barras negras sólidas.
   · 7d «rotativa»: serie temporal de 0′ a 20′ (señal cruda + media
     móvil), área en semitono, tinta corrida y pliegue de papel prensa.
   Todo es determinista (semillas fijas): la misma variante se ve igual
   siempre. El texto y los capítulos están en el HTML; aquí solo se genera
   el gráfico y se colocan las etiquetas sobre él.
   Movimiento: una sola entrada con Web Animations (fill: backwards), así
   el estado final es el diseño estático. Con movimiento reducido, nada.
   ═══════════════════════════════════════════════ */
import { reduced } from './motion/env.js';

const W = 1280, NS = 'http://www.w3.org/2000/svg';
const f = (v) => Math.round(v * 10) / 10;
const R = (x, y, w, h) => `M${f(x)} ${f(y)}h${f(w)}V${f(y + h)}h${f(-w)}Z`;
const P = (pts) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L');

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * r()); }

// capítulos: x en el lienzo y filas escalonadas para que las etiquetas no pisen las líneas de corte
const CX = Array.from({ length: 10 }, (_, i) => 84 + i * 116);
const ROWS = [0, 1, 0, 0, 1, 2, 3, 0, 0, 1];
const rowY = (i) => 436 + ROWS[i] * 22;

/* 7b · barras divergentes en semitono */
function semitono() {
  const ST = 14, BW = 11, HS = 1.3, mid = 646, r = rng(314), g = () => gauss(r);
  const A = [150, 168, 142, 178, 160, 186, 150, 172, 164, 192];
  const ks = CX.map((x) => Math.round((x - BW / 2) / ST)), xs = [], pk = [];
  let bars = '';
  for (let k = 0; k < Math.ceil(W / ST); k++) {
    const x = k * ST, ci = ks.indexOf(k), dl = Math.round(x * 0.9);
    let v = (10 * Math.sin(k * 0.21 * 8 / ST) + g() * 11) * HS;
    ks.forEach((kk, i) => { const d = Math.abs(k - kk); if (d > 0 && d < 4) v += (A[i] - 40) * 0.35 * HS * Math.exp(-d * 0.8); });
    if (ci >= 0) {
      const h = A[ci] - 80; xs[ci] = x + BW / 2; pk[ci] = mid - h;
      bars += `<rect class="cvx-cap" data-a="grow" data-d="${dl}" x="${x}" y="${f(mid - h)}" width="${BW}" height="${f(h)}" style="transform-origin:center bottom"/>`;
      continue;
    }
    v = Math.max(-66, Math.min(100, v));
    if (v >= 0) bars += `<rect class="cvx-pos" data-a="grow" data-d="${dl}" x="${x}" y="${f(mid - v)}" width="${BW}" height="${f(v)}" style="transform-origin:center bottom"/>`;
    else bars += `<rect class="cvx-neg" data-a="grow" data-d="${dl}" x="${x}" y="${mid}" width="${BW}" height="${f(-v)}" style="transform-origin:center top"/>`;
  }
  const leads = xs.map((x, i) => `<path class="cvx-lead" data-a="fade" data-d="${Math.round(x * 0.9 + 350)}" d="M${x} ${rowY(i) - 2}L${x} ${f(pk[i] - 6)}"/>`).join('');
  const svg = `<rect class="cvx-band" x="0" y="646" width="1280" height="74"/>${bars}${leads}`
    + '<path class="cvx-axis" d="M0 646H1280"/><path class="cvx-base" d="M0 720H1280"/>';
  return { svg, xs, delay: (x) => x * 0.9 + 450, end: Math.round(W * 0.9 + 650) };
}

/* 7d · rotativa: la señal cruda y su media móvil */
function rotativa() {
  const r = rng(2026), g = () => gauss(r), T = 3000, vals = [];
  const B = [70, 86, 62, 96, 78, 102, 66, 90, 76, 108];
  for (let k = 0; k <= 640; k++) {
    const x = k * 2;
    let v = 660 + g() * 3.5 + 9 * Math.sin(x * 0.011) + 5 * Math.sin(x * 0.043 + 1);
    CX.forEach((c, i) => { v -= B[i] * Math.exp(-Math.pow((x - c) / 5, 2)); });
    vals.push(v);
  }
  for (let s = 0; s < 14; s++) { const c = r() * W, a = 10 + r() * 22; for (let k = 0; k < vals.length; k++) vals[k] -= a * Math.exp(-Math.pow((k * 2 - c) / 4, 2)); }
  const raw = P(vals.map((v, k) => [k * 2, v]));
  const smooth = P(vals.map((_, k) => { let s = 0, c = 0; for (let j = -14; j <= 14; j++) { const q = vals[k + j]; if (q !== undefined) { s += q; c++; } } return [k * 2, s / c]; }));
  const leads = CX.map((c, i) => {
    const k = Math.round(c / 2), py = Math.min(...vals.slice(k - 4, k + 5));
    return `<path class="cvx-lead" data-a="fade" data-d="${Math.round(c / W * T)}" d="M${c} ${rowY(i) - 2}L${c} ${f(py - 6)}"/>`;
  }).join('');
  const svg = `<path class="cvx-area" data-a="fade" data-d="2600" d="${raw}L1280 720L0 720Z"/>`
    + '<path class="cvx-ref" d="M0 660H1280"/>'
    + `<path class="cvx-raw" data-a="draw" pathLength="1" d="${raw}"/>`
    + `<path class="cvx-mean" data-a="draw" pathLength="1" d="${smooth}"/>`
    + leads + '<path class="cvx-base" d="M0 720H1280"/>';
  return { svg, xs: CX, delay: (x) => x / W * T + 80, end: T + 200 };
}

const DEFS = '<defs>'
  + '<pattern id="cvx-ht1" width="4.2" height="4.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="2.1" cy="2.1" r="1.25" fill="#111"/></pattern>'
  + '<pattern id="cvx-ht2" width="4.2" height="4.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="2.1" cy="2.1" r=".8" fill="#111"/></pattern>'
  // tinta corrida (7d): se aplica por CSS a los textos y, al terminar la entrada, al gráfico
  + '<filter id="cvx-ink"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="1" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G"/></filter>'
  + '</defs>';

// Primera carga: al azar. Después, cada carga enseña la otra variante (así se ven las dos).
// ?portada=7b|7d fuerza una concreta.
function pick() {
  const q = new URLSearchParams(location.search).get('portada');
  if (q === '7b' || q === '7d') return q;
  let last = null;
  try { last = localStorage.getItem('portada-variante'); } catch (e) { /* sin almacenamiento: se sortea */ }
  const p = last === '7b' ? '7d' : last === '7d' ? '7b' : (Math.random() < 0.5 ? '7b' : '7d');
  try { localStorage.setItem('portada-variante', p); } catch (e) { /* idem */ }
  return p;
}

// escritorio: el lienzo entero; móvil: solo la franja del gráfico (las etiquetas van en lista debajo)
const narrow = window.matchMedia('(max-width: 1023px)');
const VB = { wide: '0 0 1280 800', narrow: '0 520 1280 206' };

export function initCover() {
  const sec = document.getElementById('portada');
  const box = sec && sec.querySelector('.cvx-chart');
  if (!box) return;
  const v = pick(), m = v === '7b' ? semitono() : rotativa();

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'cvx-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = DEFS + m.svg;
  const fit = () => svg.setAttribute('viewBox', narrow.matches ? VB.narrow : VB.wide);
  fit(); narrow.addEventListener('change', fit);
  box.prepend(svg);

  // las etiquetas se sitúan sobre su barra o su pico
  const caps = sec.querySelectorAll('.cvx-caps li');
  caps.forEach((li, i) => { li.style.setProperty('--x', f(m.xs[i])); li.dataset.a = 'fade'; li.dataset.d = Math.round(m.delay(m.xs[i])); });
  sec.dataset.v = v;
  const page = sec.closest('.ds'); if (page) page.dataset.cover = v;   // el papel de toda la página sigue a la portada

  const done = () => sec.classList.add('is-set');
  if (reduced()) return done();
  const T0 = 400;   // un respiro tras cargar: primero se lee el titular
  sec.querySelectorAll('[data-a]').forEach((el) => {
    const k = el.dataset.a, d = T0 + (+el.dataset.d || 0);
    if (k === 'grow') el.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 650, delay: d, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
    else if (k === 'fade') el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: d, easing: 'ease-out', fill: 'backwards' });
    else if (k === 'draw') el.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 3000, delay: d, easing: 'linear', fill: 'backwards' });
  });
  // la tinta corrida del gráfico se aplica al final: filtrar mientras se anima costaría fotogramas
  setTimeout(done, T0 + m.end);
}
