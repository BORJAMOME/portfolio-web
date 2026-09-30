/* ═══════════════════════════════════════════════
   ds/main.js — capa de motion y materiales de data-storytelling.html
   El motor narrativo (data-storytelling.js) ya funciona solo; esta capa
   lo refina. Cada módulo es independiente: si uno falla, los demás siguen
   y la página sigue siendo legible.

   ds/
   ├─ main.js                 este archivo: orden de arranque
   ├─ motion/
   │  ├─ env.js               preferencias, bus, tokens de movimiento
   │  ├─ reveals.js           entradas escalonadas (ScrollTrigger.batch)
   │  ├─ numbers.js           cifras que se componen carácter a carácter
   │  ├─ progress.js          barra con capítulos + rail con avance
   │  ├─ buttons.js           imán ligero en CTAs
   │  └─ depth.js             profundidad al señalar dashboards
   ├─ cover.js               portada: gráfico de la variante (semitono / rotativa)
   ├─ chapters/
   │  ├─ hero.js              dashboard físico: entrada, tilt, cristal, respiración
   │  └─ element-test.js      test del elemento: resaltado que viaja
   ├─ materials/
   │  └─ paper.js             grano de papel procedural
   ├─ webgl/
   │  ├─ quad.js              WebGL mínimo (un triángulo + un shader)
   │  ├─ glass.js             material de cristal (hero)
   │  └─ spotlight.js         linterna narrativa (cap. 05)
   └─ shaders/                GLSL como módulos de texto
   ═══════════════════════════════════════════════ */
import { idle, whenNear } from './motion/env.js';
import { initReveals } from './motion/reveals.js';
import { initNumbers } from './motion/numbers.js';
import { initProgress } from './motion/progress.js';
import { initButtons } from './motion/buttons.js';
import { initDepth } from './motion/depth.js';
import { initHero } from './chapters/hero.js';
import { initElementTest } from './chapters/element-test.js';
import { initPaper } from './materials/paper.js';
import { initCover } from './cover.js?v=20260930d';

const safe = (name, fn) => { try { const r = fn(); if (r && r.catch) r.catch((e) => console.warn('[ds]', name, e)); } catch (e) { console.warn('[ds]', name, e); } };

// 1 · Lo que se ve en la primera pantalla
safe('cover', initCover);
safe('hero', initHero);
safe('numbers', initNumbers);
safe('progress', initProgress);

// 2 · Scroll e interacción
safe('reveals', initReveals);
safe('buttons', initButtons);
safe('depth', initDepth);
safe('element-test', initElementTest);

// 3 · Materiales cuando el navegador está libre
idle(() => safe('paper', initPaper));

// 4 · WebGL solo cuando hace falta: la linterna se carga al acercarse al capítulo 05
whenNear(document.getElementById('c05'), () => {
  import('./webgl/spotlight.js').then((m) => safe('spotlight', m.initSpotlight)).catch((e) => console.warn('[ds] spotlight', e));
}, '800px 0px');
