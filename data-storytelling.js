/* ═══════════════════════════════════════════════
   data-storytelling.js — manual interactivo
   Arquitectura: cada visual es una máquina de estados.
   El scroll (IntersectionObserver) solo elige el estado;
   CSS se encarga de la transición. Sin scroll-jacking,
   sin cálculos por píxel. Se puede avanzar, retroceder y saltar.
   ═══════════════════════════════════════════════ */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  var MOBILE = window.matchMedia('(max-width: 860px)');
  var root = document.querySelector('main.ds');
  if (!root) return;
  root.classList.remove('no-js');

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function later(fn, ms) { return setTimeout(fn, RM.matches ? 0 : ms); }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function fmtEs(n, d) { return n.toLocaleString('es-ES', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }

  /* Bus mínimo: los módulos de ds/ (motion, webgl) escuchan cambios de estado
     sin acoplarse al motor. `state` guarda el último estado por visual, porque
     los módulos cargan después y necesitan saber dónde está cada uno. */
  var BUS = window.DSBus = window.DSBus || { h: {}, state: {} };
  BUS.on = function (ev, fn) { (BUS.h[ev] = BUS.h[ev] || []).push(fn); };
  BUS.emit = function (ev, d) { (BUS.h[ev] || []).forEach(function (fn) { try { fn(d); } catch (e) { console.error(e); } }); };

  var COL = {
    g1: '#BDBDBD', g2: '#DCDCDC', grid: '#E8E8E8', ink: '#111111', gr: '#6B5CA5', w: '#FFFFFF', wash: '#F0EEF6', bg: '#FBFBFB',
    c1: '#4472C4', c2: '#ED7D31', c3: '#A5A5A5', c4: '#FFC000', c5: '#70AD47', red: '#a3223e'
  };

  /* ═══ DATOS SINTÉTICOS — un solo universo: un retailer, Q4 2025 ═══ */
  var MONTHS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  var SERIES = [ // ventas mensuales por canal, k€ (últimos 12 meses)
    { n: 'Online', v: [36, 38, 41, 44, 47, 50, 52, 54, 57, 60, 63, 68] },
    { n: 'Tiendas', v: [44, 41, 43, 42, 44, 40, 39, 38, 43, 45, 48, 53] },
    { n: 'Marketplace', v: [14, 14, 15, 15, 15, 16, 16, 16, 16, 17, 18, 18] },
    { n: 'Mayorista', v: [11, 10, 11, 11, 11, 10, 10, 10, 11, 11, 12, 12] },
    { n: 'Franquicias', v: [5, 5, 6, 5, 6, 6, 5, 6, 6, 7, 7, 7] }
  ];
  var GROWTH = [ // crecimiento Q4 2025 vs Q4 2024 por canal
    { n: 'Online', l: '221.450,00 €', s: '+221 k€', v: 221.45, hero: 1 },
    { n: 'Marketplace', l: '38.120,00 €', s: '+38 k€', v: 38.12 },
    { n: 'Tiendas propias', l: '26.310,00 €', s: '+26 k€', v: 26.31 },
    { n: 'Mayorista', l: '12.040,00 €', s: '+12 k€', v: 12.04 },
    { n: 'Franquicias', l: '8.160,00 €', s: '+8 k€', v: 8.16 },
    { n: 'Outlet', l: '−1.960,00 €', s: '−2 k€', v: -1.96 }
  ];
  var Q4 = [ // ventas Q4 por canal, k€
    { n: 'Online', a: 447, b: 668, hero: 1 }, { n: 'Tiendas', a: 526, b: 552 }, { n: 'Marketplace', a: 137, b: 175 },
    { n: 'Mayorista', a: 98, b: 110 }, { n: 'Franquicias', a: 37, b: 45 }, { n: 'Outlet', a: 24, b: 22 }
  ];
  var CATS = [
    { n: 'Moda', v: 24 }, { n: 'Hogar', v: 18 }, { n: 'Electrónica', v: 15 }, { n: 'Belleza', v: 12 },
    { n: 'Deporte', v: 10 }, { n: 'Juguetes', v: 9 }, { n: 'Libros', v: 7 }, { n: 'Otros', v: 5 }
  ];

  /* ═══ FUENTES ═══ */
  var SRC = {
    franconeri: { k: 'Investigación', cite: 'The Science of Visual Data Communication: What Works', meta: 'Franconeri, Padilla, Shah, Zacks y Hullman · 2021 · Psychological Science in the Public Interest', t: 'Revisión de la evidencia sobre cómo percibimos gráficos: qué atrae la atención antes de leer, qué comparaciones son precisas y cuáles engañan.', url: 'https://doi.org/10.1177/15291006211051956' },
    cleveland: { k: 'Investigación', cite: 'Graphical Perception', meta: 'Cleveland y McGill · 1984 · Journal of the American Statistical Association', t: 'Los experimentos clásicos: juzgamos mejor posición y longitud sobre una base común que ángulos o áreas.', url: 'https://doi.org/10.1080/01621459.1984.10478080' },
    cowan: { k: 'Investigación', cite: 'The Magical Number 4 in Short-Term Memory', meta: 'Nelson Cowan · 2001 · Behavioral and Brain Sciences', t: 'La memoria a corto plazo retiene pocos bloques de información a la vez. El número exacto depende de la tarea: por eso lo trato como orientación, no como regla.', url: 'https://doi.org/10.1017/S0140525X01003922' },
    segel: { k: 'Investigación', cite: 'Narrative Visualization: Telling Stories with Data', meta: 'Segel y Heer · 2010 · IEEE Transactions on Visualization and Computer Graphics', t: 'Describe el equilibrio entre una lectura guiada por el autor y una exploración libre, y los patrones que lo resuelven.', url: 'https://doi.org/10.1109/TVCG.2010.179' },
    ajani: { k: 'Investigación', cite: 'Declutter and Focus', meta: 'Ajani, Lee, Xiong, Knaflic, Kemper y Franconeri · 2021 · IEEE TVCG', t: 'Evaluación empírica: los gráficos limpios y con foco se perciben como más claros y profesionales, y su mensaje se recuerda mejor.', url: 'https://doi.org/10.1109/TVCG.2021.3068337' },
    hullman: { k: 'Investigación', cite: 'Visualization Rhetoric: Framing Effects in Narrative Visualization', meta: 'Hullman y Diakopoulos · 2011 · IEEE TVCG', t: 'Cómo las decisiones de diseño (encuadre, omisiones, anotaciones, forma de mostrar la incertidumbre) cambian la interpretación de los mismos datos.', url: 'https://doi.org/10.1109/TVCG.2011.255' },
    mslearn: { k: 'Fuente', cite: 'Diseño de informes de Power BI para accesibilidad', meta: 'Microsoft Learn · documentación de Power BI', t: 'Orden de tabulación, texto alternativo, contraste, no depender solo del color y navegación con teclado dentro de los informes.', url: 'https://learn.microsoft.com/es-es/power-bi/create-reports/desktop-accessibility-overview' },
    ibcs: { k: 'Fuente', cite: 'International Business Communication Standards (IBCS)', meta: 'IBCS Association', t: 'Estándar para informes de negocio organizado en siete reglas: SAY, UNIFY, CONDENSE, CHECK, EXPRESS, SIMPLIFY, STRUCTURE.', url: 'https://www.ibcs.com/' },
    swd: { k: 'Ver referencia', cite: 'Storytelling with Data', meta: 'Cole Nussbaumer Knaflic · 2015 · Wiley', t: 'La historia en tres minutos, la gran idea, la diferencia entre explorar y explicar y la estructura Bing, Bang, Bongo.', url: 'https://www.storytellingwithdata.com/books' }
  };
  $$('details.src[data-src]').forEach(function (d) {
    var s = SRC[d.dataset.src]; if (!s) return;
    d.innerHTML = '<summary>' + s.k + '</summary><div class="src-b"><span class="kind">' + (s.k === 'Investigación' ? 'Evidencia' : 'Referencia') + '</span><cite>' + s.cite + '</cite><span class="meta">' + s.meta + '</span>' + s.t + ' <a href="' + s.url + '" target="_blank" rel="noopener noreferrer">Abrir fuente ↗</a></div>';
  });
  var refs = $('#refsList');
  if (refs) Object.keys(SRC).forEach(function (k) {
    var s = SRC[k], li = document.createElement('li');
    li.innerHTML = '<b>' + s.cite + '</b><br><span class="ds-muted">' + s.meta + '</span><br><a href="' + s.url + '" target="_blank" rel="noopener noreferrer">' + s.url.replace(/^https?:\/\//, '') + '</a>';
    refs.appendChild(li);
  });

  /* ═══════════════════════════════════════════
     EL DASHBOARD PACIENTE
     ═══════════════════════════════════════════ */
  var FINAL = 'flat lessgrid gray focus direct short dim prio story annot-on rec navs';

  function lineSVG() {
    // ymax leaves headroom above the tallest series so lines never touch the plot's top edge
    var ymax = 300, YT = 4, YB = 2, gl = '', paths = '', dls = '';
    function py(v) { return YT + (1 - v / ymax) * (100 - YT - YB); }
    [0, 60, 120, 180, 240, 300].forEach(function (g) {
      gl += '<line class="gl' + (g % 120 ? ' minor' : '') + '" x1="0" x2="100" y1="' + py(g) + '" y2="' + py(g) + '"/>';
    });
    SERIES.slice(0, 4).forEach(function (s, i) {
      var d = s.v.map(function (v, m) { return (m ? 'L' : 'M') + (m / 11 * 100).toFixed(2) + ' ' + py(v * 3.5).toFixed(2); }).join(' ');
      var hero = i === 0 ? ' hero' : '';
      paths += '<path class="ln' + hero + '" style="stroke:var(--dc' + (i + 1) + ')" d="' + d + '"/>';
      var last = s.v[11] * 3.5;
      dls += '<span class="dl' + hero + '" style="top:' + py(last) + '%">' + s.n + '</span>';
    });
    var yl = [300, 240, 180, 120, 60, 0].map(function (v) { return '<span>' + v + ' k€</span>'; }).join('');
    return '<div class="lineplot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + gl + paths + '</svg>' + dls +
      '<div class="yax">' + yl + '</div>' +
      '<div class="xax">' + ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</div></div>';
  }

  function dashHTML() {
    var BARMAX = 280; // axis max a bit above the largest bar so its label always has room to breathe
    var rows = GROWTH.map(function (b, i) {
      var w = Math.abs(b.v) / BARMAX * 96, top = 2 + i * 16.2;
      return '<div class="brow' + (b.hero ? ' hero' : '') + '" style="top:' + top + '%"><span class="bl">' + b.n + '</span>' +
        '<span class="bar' + (b.v < 0 ? ' neg' : '') + '" style="--c:var(--dc' + (i + 1) + ');width:' + w + '%"></span>' +
        '<span class="bv" style="left:calc(' + (b.v < 0 ? 1.5 : 1.5 + w) + '% + .5em)"><span class="n-l">' + b.l + '</span><span class="n-s">' + b.s + '</span></span></div>';
    }).join('');
    var legB = GROWTH.map(function (b, i) { return '<span><i style="background:var(--dc' + (i + 1) + ')"></i>' + b.n + '</span>'; }).join('');
    var legL = SERIES.slice(0, 4).map(function (s, i) { return '<span><i style="background:var(--dc' + (i + 1) + ')"></i>' + s.n + '</span>'; }).join('');
    var off = 0;
    var donut = CATS.map(function (c, i) { var s = '<circle cx="21" cy="21" r="15.915" pathLength="100" stroke-dasharray="' + c.v + ' ' + (100 - c.v) + '" stroke-dashoffset="' + (-off) + '" style="stroke:var(--dc' + (i + 1) + ')"/>'; off += c.v; return s; }).join('');
    var legD = CATS.map(function (c, i) { return '<span><i style="background:var(--dc' + (i + 1) + ')"></i>' + c.n + ' (' + c.v + ',00 %)</span>'; }).join('');
    function kpi(cls, l, vl, vs, sl, ss) {
      return '<div class="pn kpi ' + cls + '"><div class="pb"><span class="kl">' + l + '</span><span class="kv"><span class="n-l">' + vl + '</span><span class="n-s">' + vs + '</span></span><span class="ks"><span class="n-l">' + sl + '</span><span class="n-s">' + ss + '</span></span></div></div>';
    }
    return '<div class="cam">' +
      '<div class="pn p-head"><span class="brand"></span><div class="tt"><span class="t-d">Dashboard comercial</span><span class="t-c">Ventas Q4 por canal</span><span class="t-q">¿Qué canal explica el crecimiento del Q4?</span><span class="t-s">El canal online ya concentra la mayor parte del crecimiento</span></div>' +
      '<div class="slicers"><span class="slc">Año: 2025</span><span class="slc">Trimestre: Q4</span><span class="slc">Región: Todas</span><span class="slc">Canal: Todos</span></div>' +
      '<div class="navtabs"><span class="on">Resumen</span><span>Análisis</span><span>Hallazgo</span><span>Recomendación</span></div></div>' +
      kpi('p-k1', 'Ventas Q4', '1.572.340,00 €', '1,57 M€', 'Q4 2024: 1.268.220,00 €', 'Q4 2024: 1,27 M€') +
      kpi('p-k2', 'Crecimiento', '+23,98 %', '+24 %', '▲ 304.120,00 € vs. Q4 2024', '+304 k€ vs. Q4 2024') +
      kpi('p-k3', 'Pedidos', '12.480', '12.480', '▲ 8,21 % vs. Q4 2024', '+8 % vs. Q4 2024') +
      kpi('p-k4', 'Ticket medio', '125,99 €', '126 €', '▲ 14,52 % vs. Q4 2024', '+15 % vs. Q4 2024') +
      '<div class="pn p-bars"><div class="ph"><div class="tt"><span class="t-d">Crecimiento vs. Q4 2024 por canal (€)</span><span class="t-s">Online explica 221 k€ de los 304 k€ de crecimiento</span></div></div><div class="pb"><div class="legend">' + legB + '</div>' +
      '<div class="bars"><div class="gridv minor"></div><div class="gridv"></div><div class="zero"></div>' + rows + '</div>' +
      '<div class="axis-x"><span>0 €</span><span>70.000 €</span><span>140.000 €</span><span>210.000 €</span><span>280.000 €</span></div></div></div>' +
      '<div class="pn p-line"><div class="ph"><div class="tt"><span class="t-d">Ventas mensuales por canal (€)</span><span class="t-s">Online vende más que las tiendas desde abril</span></div></div><div class="pb">' + lineSVG() + '<div class="legend">' + legL + '</div></div></div>' +
      '<div class="pn p-donut"><div class="ph"><div class="tt"><span class="t-d">Ventas por categoría (%)</span><span class="t-s">Moda y hogar: 42 % de las ventas</span></div></div><div class="pb"><div class="donut"><svg viewBox="0 0 42 42" aria-hidden="true">' + donut + '</svg></div><div class="legend">' + legD + '</div>' +
      '<div class="donut-dl"><b>Moda</b> 24 % · <b>Hogar</b> 18 %<br>Electrónica 15 % · resto 43 %</div></div></div>' +
      '<div class="pn p-rec"><div class="pb"><span class="rk keep">Qué propongo</span><span class="rt keep">Mover un 15 % del presupuesto de captación a online en el Q1 y medir el efecto en 8 semanas.</span></div></div>' +
      '<svg class="annot-svg" viewBox="0 0 160 110" preserveAspectRatio="none" aria-hidden="true"><path class="a-def" pathLength="1" d="M56 60.5 L70 51.7"/><path class="a-pri" pathLength="1" d="M57.6 48.4 L83.2 35.8"/></svg>' +
      '<div class="annot"><span class="ak">Anotación</span><b>Online aporta +221 k€:</b> el 73 % de todo el crecimiento del trimestre.</div>' +
      '</div>' +
      '<span class="kbd-n" style="left:2%;top:3%">1</span><span class="kbd-n" style="left:2.5%;top:17%">2</span><span class="kbd-n" style="left:61%;top:17%">3</span><span class="kbd-n" style="left:61%;top:38%">4</span><span class="kbd-n" style="left:81%;top:38%">5</span><span class="kbd-n" style="left:61%;top:52%">6</span><span class="kbd-n" style="left:61%;top:79%">7</span>' +
      '<div class="alt-cap"><code>alt</code> “Crecimiento del Q4 2025 frente al Q4 2024 por canal. Online aporta 221 k€ de los 304 k€ totales (73 %). Marketplace suma 38 k€ y tiendas 26 k€; outlet cae 2 k€.”</div>' +
      '<div class="contrast-chips"><span class="cchip"><i style="background:#111"></i><b>18,2:1</b><em>texto principal</em></span><span class="cchip"><i style="background:#5a5a5a"></i><b>6,7:1</b><em>texto secundario</em></span><span class="cchip"><i style="background:#4A3E79"></i><b>9,0:1</b><em>acento en texto pequeño</em></span><span class="cchip"><i style="background:#6B5CA5"></i><b>5,5:1</b><em>acento: barras y texto grande</em></span><span class="cchip"><i style="background:#BDBDBD"></i><b>1,8:1</b><em>gris: contexto, nunca texto</em></span></div>' +
      '';
  }

  /* Plano (blueprint) del capítulo 10: la retícula y las cajas del layout final,
     dibujadas antes de que exista un solo dato. Coordenadas = layout .prio. */
  var BP_BOXES = [
    { x: 1.5, y: 2, w: 97, h: 12, lb: 'Título · la pregunta', f: 'b-head' },
    { x: 1.5, y: 16, w: 57, h: 82, lb: 'Visual principal', dim: '57 % del ancho', hero: 1, f: 'b-main' },
    { x: 60, y: 16, w: 38.5, h: 19, lb: 'KPI principal', f: 'b-kpi' },
    { x: 60, y: 37, w: 19, h: 12, lb: 'KPI', f: 'b-kpi' },
    { x: 80, y: 37, w: 18.5, h: 12, lb: 'KPI', f: 'b-kpi' },
    { x: 60, y: 51, w: 38.5, h: 25, lb: 'Contexto', f: 'b-sec' },
    { x: 60, y: 78, w: 38.5, h: 20, lb: 'Acción', f: 'rec' },
    { x: 27, y: 44, w: 27, h: 11, lb: 'Anotación', note: 1, f: 'b-main' }
  ];
  function blueprintHTML() {
    var h = '<div class="bp" aria-hidden="true"><div class="bp-grid">', c;
    for (c = 1; c < 12; c++) h += '<i class="bp-v" style="left:' + (c * 100 / 12).toFixed(3) + '%;--d:' + (c * 32) + 'ms"></i>';
    for (c = 1; c < 8; c++) h += '<i class="bp-h" style="top:' + (c * 12.5) + '%;--d:' + (c * 40) + 'ms"></i>';
    h += '</div><div class="bp-wire">';
    BP_BOXES.forEach(function (b, i) {
      h += '<div class="bp-box' + (b.hero ? ' hero' : '') + (b.note ? ' note' : '') + '" data-f="' + b.f + '" style="left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%;height:' + b.h + '%;--d:' + (i * 110) + 'ms">' +
        '<i class="e t"></i><i class="e r"></i><i class="e b"></i><i class="e l"></i>' +
        '<span class="bp-lb">' + b.lb + '</span>' + (b.dim ? '<span class="bp-dim">' + b.dim + '</span>' : '') + '</div>';
    });
    return h + '</div></div>';
  }

  var DASH = {};
  function makeDash(host) {
    var name = host.dataset.dash;
    var wrap = document.createElement('div'); wrap.className = 'dash-wrap';
    var el = document.createElement('div');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Dashboard de ventas del Q4 2025 (datos ficticios). Conclusión: el canal online aporta 221 mil euros de los 304 mil de crecimiento, el 73 %.');
    el.innerHTML = dashHTML();
    wrap.appendChild(el); host.appendChild(wrap);
    var api = { el: el, name: name, base: '', extra: '', set: function (flags) {
      var prev = api.base;
      api.base = flags || '';
      el.className = 'dash ' + api.base + (api.extra ? ' ' + api.extra : '');
      BUS.emit('dash', { name: name, flags: api.base, prev: prev, el: el, wrap: wrap });
    } };
    $$('.cam > .pn', el).forEach(function (p, i) { p.style.setProperty('--pi', i); });
    if (name === 'c10') $('.cam', el).insertAdjacentHTML('afterbegin', blueprintHTML());
    var init = { hero: '', c04: '', c05: 'flat lessgrid gray direct short', c08: 'flat lessgrid gray direct short dim desc', c10: 'empty', final: FINAL, titles: FINAL, sales: FINAL, a11y: FINAL, val: FINAL + ' titles' };
    api.set(init[name] != null ? init[name] : FINAL);
    DASH[name] = api;
    BUS.DASH = DASH;
    return api;
  }
  $$('[data-dash]').forEach(makeDash);

  /* ═══════════════════════════════════════════
     STAGE: motor de marcas con continuidad (morph)
     Cada marca es un <div>; un estado es una lista de
     {x,y,w,h} o {cx,cy,s} en fracciones del escenario.
     ═══════════════════════════════════════════ */
  var ANCH = { l: 'translate(0,-50%)', r: 'translate(-100%,-50%)', c: 'translate(-50%,-50%)', lt: 'none', rt: 'translate(-100%,0)', ct: 'translate(-50%,0)', cb: 'translate(-50%,-100%)', lb: 'translate(0,-100%)' };

  function Stage(el, n, opt) {
    opt = opt || {};
    var marks = [], last = [], cur = [], L = {}, P = {};
    for (var i = 0; i < n; i++) {
      var m = document.createElement('div');
      m.className = 'mk' + (opt.blk && opt.blk[i] != null ? ' blk' : '');
      if (opt.blk && opt.blk[i] != null) m.innerHTML = opt.blk[i];
      m.style.opacity = 0;
      el.appendChild(m); marks.push(m);
    }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ov'); svg.setAttribute('aria-hidden', 'true');
    var SW = 0, SH = 0;
    function px(d) {
      var cmd = '', k = 0;
      return d.replace(/([MLHVZ])|(-?\d*\.?\d+)/g, function (m, c, n) {
        if (c) { cmd = c; k = 0; return c; }
        var v = +n, isX = cmd === 'H' || (cmd !== 'V' && k % 2 === 0); k++;
        return (isX ? v * SW / 100 : v * SH / 100).toFixed(1) + ' ';
      });
    }
    function sizeSvg() {
      SW = el.clientWidth; SH = el.clientHeight;
      svg.setAttribute('viewBox', '0 0 ' + SW + ' ' + SH);
      Object.keys(P).forEach(function (k) { if (P[k]._d) P[k].setAttribute('d', px(P[k]._d)); });
    }
    el.appendChild(svg);

    function paint() {
      var W = el.clientWidth, H = el.clientHeight; if (!W) return;
      if (W !== SW || H !== SH) sizeSvg();
      marks.forEach(function (m, i) {
        var s = cur[i];
        if (!s) { s = Object.assign({ cx: .5, cy: .5, s: 0 }, last[i] || {}, { o: 0 }); } else last[i] = s;
        var x, y, w, h;
        if (s.s != null) { w = h = s.s * W; x = s.cx * W - w / 2; y = s.cy * H - h / 2; }
        else { x = s.x * W; y = s.y * H; w = s.w * W; h = s.h * H; }
        m.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        m.style.width = Math.max(0, w).toFixed(1) + 'px'; m.style.height = Math.max(0, h).toFixed(1) + 'px';
        m.style.backgroundColor = COL[s.c || 'g1'] || s.c;
        m.style.opacity = s.o == null ? 1 : s.o;
        m.style.borderRadius = s.r == null ? '0' : (typeof s.r === 'number' ? s.r + 'px' : s.r);
        m.style.boxShadow = s.bd || 'none';
        m.style.borderColor = s.bc ? (COL[s.bc] || s.bc) : 'transparent';
        m.style.transitionDelay = s.dl ? s.dl + 'ms' : '';
      });
    }
    function labels(arr) {
      var keep = {};
      (arr || []).forEach(function (l) {
        keep[l.k] = 1;
        var e = L[l.k], fresh = !e;
        if (fresh) { e = document.createElement('div'); el.appendChild(e); L[l.k] = e; }
        e.className = 'lb ' + (l.c || '') + (fresh ? ' off' : '');
        if (e._t !== l.t) { e.innerHTML = l.t; e._t = l.t; }
        e.style.left = (l.x * 100) + '%'; e.style.top = (l.y * 100) + '%';
        e.style.transform = ANCH[l.a || 'l'];
        e.style.width = l.mw ? (l.mw * 100) + '%' : '';
        if (fresh) requestAnimationFrame(function () { requestAnimationFrame(function () { e.classList.remove('off'); }); });
      });
      Object.keys(L).forEach(function (k) { if (!keep[k]) L[k].classList.add('off'); });
    }
    function paths(arr) {
      var keep = {};
      (arr || []).forEach(function (p) {
        keep[p.k] = 1;
        var e = P[p.k];
        if (!e) { e = document.createElementNS(NS, 'path'); svg.appendChild(e); P[p.k] = e; e._on = false; }
        var wasOff = !e._on;
        if (e._d !== p.d || e._w !== SW) { e._d = p.d; e._w = SW; e.setAttribute('d', px(p.d)); }
        e.style.transitionDelay = p.dl ? p.dl + 'ms' : '';
        if (p.draw) {
          e.setAttribute('pathLength', '1');
          if (wasOff) {
            e.setAttribute('class', (p.c || 'p-line') + ' draw');
            void e.getBoundingClientRect();
            requestAnimationFrame(function () { e.classList.add('on'); });
          } else e.setAttribute('class', (p.c || 'p-line') + ' draw on');
        } else { e.removeAttribute('pathLength'); e.setAttribute('class', p.c || 'p-line'); }
        e._on = true;
      });
      Object.keys(P).forEach(function (k) { if (!keep[k]) { P[k].classList.add('off'); P[k]._on = false; } });
    }
    if (window.ResizeObserver) new ResizeObserver(paint).observe(el);
    return {
      el: el, marks: marks,
      set: function (specs, lbs, pts) { cur = specs || []; paint(); labels(lbs); paths(pts); }
    };
  }
  function poly(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + (p[0] * 100).toFixed(2) + ' ' + (p[1] * 100).toFixed(2); }).join(' '); }
  function rect(x, y, w, h) { x *= 100; y *= 100; w *= 100; h *= 100; return 'M' + x + ' ' + y + 'H' + (x + w) + 'V' + (y + h) + 'H' + x + 'Z'; }

  /* ═══════════════════════════════════════════
     VISUALES (cada uno: init → { set(estado) })
     ═══════════════════════════════════════════ */
  var VIZ = {};

  /* 01 · Explorar → explicar */
  VIZ.explore = function (viz) {
    var st = Stage($('.stage', viz), 60), R = rng(7), rnd = [];
    for (var i = 0; i < 60; i++) rnd.push([.06 + R() * .86, .1 + R() * .78]);
    var tags = $$('.mode-tag span', viz);
    var X0 = .07, X1 = .82, Y0 = .14, Y1 = .86, YM = 70;
    function px(m) { return X0 + m / 11 * (X1 - X0); }
    function py(v) { return Y1 - v / YM * (Y1 - Y0); }
    var ccol = ['c1', 'c2', 'c3', 'c4', 'c5'];
    return {
      set: function (k) {
        tags[0].className = (k === 'e1' || k === 'e2') ? 'on' : '';
        tags[1].className = (k === 'e1' || k === 'e2') ? '' : (k === 'e5' ? 'on g' : 'on');
        var specs = [], lb = [], pt = [];
        SERIES.forEach(function (s, si) {
          s.v.forEach(function (v, m) {
            var i = si * 12 + m, sp = { s: .02, r: '50%', c: ccol[si], o: .9 };
            if (k === 'e1') { sp.cx = rnd[i][0]; sp.cy = rnd[i][1]; }
            else if (k === 'e2') { sp.cx = .12 + si * .185 + (m % 3 - 1) * .038; sp.cy = .4 + (Math.floor(m / 3) - 1.5) * .07; }
            else { sp.cx = px(m); sp.cy = py(v); sp.s = .016; }
            if (k === 'e4' || k === 'e5') { sp.c = si === 0 ? 'gr' : 'g2'; sp.o = 1; if (si === 0) sp.s = .019; }
            if (k === 'e3') sp.c = 'g1';
            specs.push(sp);
          });
          if (k === 'e2') lb.push({ k: 'cl' + si, x: .12 + si * .185, y: .64, t: s.n, a: 'ct' });
          if (k === 'e3' || k === 'e4' || k === 'e5') {
            var hero = si === 0 && k !== 'e3';
            pt.push({ k: 'ln' + si, d: poly(s.v.map(function (v, m) { return [px(m), py(v)]; })), c: hero ? 'p-green' : (k === 'e3' ? 'p-line' : 'p-faint'), draw: true });
            lb.push({ k: 'el' + si, x: X1 + .015, y: py(s.v[11]), t: s.n, a: 'l', c: hero ? 'grn' : '' });
          }
        });
        if (k === 'e1') { lb.push({ k: 'ax1', x: .95, y: .95, t: 'Ticket medio →', a: 'r', c: 'cap' }); lb.push({ k: 'ax2', x: .02, y: .04, t: '↑ Pedidos', a: 'lt', c: 'cap' }); }
        if (k === 'e2') lb.push({ k: 'ax3', x: .02, y: .04, t: 'Agrupado por canal', a: 'lt', c: 'cap' });
        if (k === 'e3' || k === 'e4' || k === 'e5') {
          lb.push({ k: 'm0', x: px(0), y: .92, t: 'Ene', a: 'ct', c: 'cap' });
          lb.push({ k: 'm11', x: px(11), y: .92, t: 'Dic', a: 'ct', c: 'cap' });
          lb.push({ k: 'yk', x: .0, y: .04, t: 'Ventas mensuales, k€', a: 'lt', c: 'cap' });
          pt.push({ k: 'base', d: poly([[X0, Y1], [X1, Y1]]), c: 'p-grid' });
        }
        if (k === 'e5') {
          lb.push({ k: 'ttl', x: .0, y: .11, t: 'Online crece cada mes y desde abril vende más que las tiendas', a: 'lt', c: 'big wrap', mw: .72 });
          lb.push({ k: 'ann', x: px(3) + .02, y: py(44) + .12, t: '<b>Abril</b>: online supera a las tiendas por primera vez', a: 'lt', c: 'ann', mw: .3 });
          pt.push({ k: 'annl', d: poly([[px(3), py(44) + .02], [px(3) + .015, py(44) + .11]]), c: 'p-ink', draw: true });
        }
        st.set(specs, lb, pt);
      }
    };
  };

  /* 02 · Contexto */
  VIZ.brief = function (viz) {
    var b = $('.brief', viz);
    return { set: function (k) { b.dataset.s = k; } };
  };

  /* 02 · Gran idea: mismo gráfico, otro título */
  function buildTChart(fig) {
    var gb = $('.gb', fig), max = 700;
    gb.innerHTML = Q4.map(function (c) {
      return '<span class="gl' + (c.hero ? ' hero' : '') + '">' + c.n + '</span><span class="gt' + (c.hero ? ' hero' : '') + '"><span class="b24" style="width:' + (c.a / max * 88) + '%"></span><span class="b25" style="width:' + (c.b / max * 88) + '%"><span>' + c.b + '</span></span></span>';
    }).join('');
    $$('.gt.hero', gb).forEach(function (g) { g.classList.add('hero'); });
  }
  VIZ.tchart = function (viz) {
    var f = $('[data-tchart]', viz); buildTChart(f);
    return { set: function (k) { f.classList.toggle('after', k === 'b'); } };
  };

  /* 03 · Laboratorio perceptivo */
  VIZ.lab = function (viz) {
    var st = Stage($('.stage', viz), 20), R = rng(21), rnd = [];
    for (var i = 0; i < 20; i++) rnd.push([.1 + R() * .8, .12 + R() * .74]);
    var H = 13;
    var ITEMS = ['Ventas', 'Ticket medio', 'Margen', 'Devoluciones', 'Clientes nuevos', 'Recurrencia', 'Plazo de entrega', 'NPS'];
    var GROUPS = ['Ingresos', 'Rentabilidad', 'Clientes', 'Servicio'];
    var SHUF = [0, 2, 4, 6, 1, 3, 5, 7];
    function grid(i) { return { cx: .18 + (i % 5) * .16, cy: .18 + Math.floor(i / 5) * .21 }; }
    /* Laboratorio: en los estados preatentivos, tamaño y posición el lector
       elige cuál de los 20 cuadrados es el protagonista y ve el principio con
       su propia elección. Los cuadrados se vuelven botones solo mientras sirve. */
    var cur = 'p1', LIVE = /^(p1|p2|p3|s1|o1|o2|o3)$/, hint = viz.querySelector('.lab-hint');
    function pick(i) { if (!LIVE.test(cur) || i < 0) return; H = i; api.set(cur); }
    st.el.addEventListener('click', function (e) { pick(st.marks.indexOf(e.target)); });
    st.el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var i = st.marks.indexOf(e.target); if (i < 0) return;
      e.preventDefault(); pick(i);
    });
    var api = {
      set: function (k) {
        cur = k;
        var live = LIVE.test(k);
        viz.classList.toggle('lab-live', live);
        st.marks.forEach(function (m, i) {
          if (live) { m.tabIndex = 0; m.setAttribute('role', 'button'); m.setAttribute('aria-label', 'Cuadrado ' + (i + 1) + (i === H ? ', protagonista' : '')); }
          else { m.removeAttribute('tabindex'); m.removeAttribute('role'); m.removeAttribute('aria-label'); }
        });
        if (hint) hint.hidden = !live;
        var sp = [], lb = [], pt = [];
        for (var i = 0; i < 20; i++) {
          var g = grid(i), s = { cx: g.cx, cy: g.cy, s: .075, c: 'g1' };
          if (k === 'p2' && i === H) s.c = 'gr';
          if (k === 'p3') { s.c = i === H ? 'gr' : 'g2'; }
          if (k === 's1' && i === H) s.s = .16;
          if (k === 'o1') { s.cx = rnd[i][0]; s.cy = rnd[i][1]; s.s = .06; if (i === H) s.c = 'ink'; }
          if (k === 'o2') { s.cx = .1 + (i % 10) * .089; s.cy = i < 10 ? .42 : .58; s.s = .06; if (i === H) s.c = 'ink'; }
          if (k === 'o3') {
            if (i === H) { s.cx = .2; s.cy = .27; s.s = .2; s.c = 'gr'; }
            else { var j = i < H ? i : i - 1; s.cx = .07 + j * .0478; s.cy = .82; s.s = .036; s.c = 'g1'; }
          }
          if (k === 'm1' || k === 'm2' || k === 'm3') {
            if (i >= 8) { s.o = 0; s.cx = .5; s.cy = .5; s.s = .02; }
            else {
              var p = SHUF.indexOf(i), w = .2, h = .17;
              var x, y;
              if (k === 'm1') { x = .05 + (p % 4) * .228; y = .25 + Math.floor(p / 4) * .3; }
              else if (k === 'm2') { x = .05 + Math.floor(i / 2) * .228; y = .25 + (i % 2) * .22; }
              else {
                if (i === 0) { x = .05; y = .12; w = .52; h = .54; }
                else if (i === 1) { x = .05; y = .7; w = .52; h = .1; }
                else { var gi = Math.floor(i / 2) - 1; x = .63 + (i % 2) * .165; y = .2 + gi * .22; w = .155; h = .14; }
              }
              s = { x: x, y: y, w: w, h: h, c: (k === 'm3' && i === 0) ? 'gr' : 'g2' };
              var lbl = ITEMS[i];
              if (k === 'm3' && i === 0) lb.push({ k: 'it0', x: x + .03, y: y + .06, t: 'Ventas<br><span style="font-size:.5em">+24 % vs. Q4</span>', a: 'lt', c: 'huge wht', mw: .5 });
              else if (k === 'm3' && i === 1) lb.push({ k: 'it1', x: x + .02, y: y + h / 2, t: 'Ticket medio · 126 €', a: 'l', c: 'ink' });
              else lb.push({ k: 'it' + i, x: x + w / 2, y: y + h / 2, t: lbl, a: 'c', c: k === 'm3' ? '' : 'ink' });
            }
          }
          sp.push(s);
        }
        if (k === 'm1' || k === 'm2' || k === 'm3') {
          lb.push({ k: 'cnt', x: .05, y: .06, t: k === 'm1' ? '8 métricas' : (k === 'm2' ? '4 grupos' : '1 idea principal + contexto'), a: 'lt', c: 'cap' });
        }
        if (k === 'm2') GROUPS.forEach(function (g, gi) {
          lb.push({ k: 'g' + gi, x: .05 + gi * .228 + .1, y: .19, t: g, a: 'cb', c: 'cap' });
          pt.push({ k: 'rg' + gi, d: rect(.035 + gi * .228, .22, .23, .47), c: 'rg' });
        });
        if (k === 'm3') GROUPS.slice(1).forEach(function (g, gi) { lb.push({ k: 'g' + (gi + 1), x: .63, y: .185 + gi * .22, t: g, a: 'lb', c: 'cap' }); });
        if (k === 'o3') lb.push({ k: 'o3l', x: .33, y: .27, t: 'Aquí empieza la lectura', a: 'l', c: 'grn' });
        st.set(sp, lb, pt);
      }
    };
    return api;
  };

  /* 03 · Comparación */
  VIZ.cmp = function (viz) {
    var st = Stage($('.stage', viz), 3);
    return {
      set: function (k) {
        var A, B, D, lb = [], pt = [];
        if (k === 'c1') {
          A = { x: .12, y: .38, w: .14, h: .42 }; B = { x: .7, y: .1, w: .14, h: .525 };
        } else {
          A = { x: .32, y: .43, w: .16, h: .42 }; B = { x: .52, y: .325, w: .16, h: .525 };
          pt.push({ k: 'base', d: poly([[.22, .85], [.8, .85]]), c: 'p-ink' });
        }
        A.c = 'g1'; B.c = 'g1';
        D = { x: B.x, y: B.y, w: B.w, h: .105, c: 'gr', o: k === 'c3' ? 1 : 0 };
        lb.push({ k: 'va', x: A.x + A.w / 2, y: A.y - .03, t: '1,2 M€', a: 'cb', c: 'big' });
        lb.push({ k: 'vb', x: B.x + B.w / 2, y: B.y - .03, t: '1,5 M€', a: 'cb', c: 'big' });
        lb.push({ k: 'na', x: A.x + A.w / 2, y: A.y + A.h + .03, t: 'Región A', a: 'ct' });
        lb.push({ k: 'nb', x: B.x + B.w / 2, y: B.y + B.h + .03, t: 'Región B', a: 'ct' });
        if (k === 'c3') {
          pt.push({ k: 'dl', d: poly([[A.x, A.y], [B.x + B.w + .02, A.y]]), c: 'p-dash' });
          lb.push({ k: 'diff', x: B.x + B.w + .03, y: B.y + .052, t: '+300 k€', a: 'l', c: 'big grn' });
        }
        st.set([A, B, D], lb, pt);
      }
    };
  };

  /* 03 · Gestalt */
  VIZ.gestalt = function (viz) {
    var st = Stage($('.stage', viz), 20), R = rng(3), rnd = [];
    for (var i = 0; i < 20; i++) rnd.push([.1 + R() * .8, .1 + R() * .8]);
    var CL = [[.22, .3], [.72, .26], [.3, .72], [.76, .7]], OFF = [[0, 0], [-.06, -.05], [.06, -.05], [-.05, .07], [.05, .07]];
    function g(i) { return [.2 + (i % 5) * .15, .2 + Math.floor(i / 5) * .2]; }
    return {
      set: function (k) {
        var sp = [], pt = [];
        for (var i = 0; i < 20; i++) {
          var p = k === 'g1' ? rnd[i] : (k === 'g2' ? [CL[Math.floor(i / 5)][0] + OFF[i % 5][0], CL[Math.floor(i / 5)][1] + OFF[i % 5][1] * 1.3] : g(i));
          var c = 'g1', dl = 0;
          if (k === 'g3' && (i % 5 === 1 || i % 5 === 3)) c = 'ink';
          if (k === 'g2') dl = Math.floor(i / 5) * 110 + (i % 5) * 30;   // cada grupo se reúne después del anterior
          if (k === 'g3') dl = (i % 5) * 90;                              // el color recorre las columnas como una ola
          sp.push({ cx: p[0], cy: p[1], s: .045, r: '50%', c: c, dl: dl });
        }
        if (k === 'g4') {   // la región se dibuja: primero el contorno, después el fondo
          pt.push({ k: 'r1', d: rect(.13, .12, .74, .36), c: 'rg', draw: true });
          pt.push({ k: 'r2', d: rect(.13, .52, .74, .36), c: 'rg', draw: true, dl: 260 });
        }
        if (k === 'g5') {   // las conexiones aparecen una a una
          for (var r = 0; r < 4; r++) {
            var a = g(r * 5), b = g(r * 5 + 1), c2 = g(r * 5 + 3), d = g(r * 5 + 4);
            pt.push({ k: 'l' + r + 'a', d: poly([a, b]), c: 'p-ink', draw: true, dl: r * 120 });
            pt.push({ k: 'l' + r + 'b', d: poly([c2, d]), c: 'p-ink', draw: true, dl: r * 120 + 60 });
          }
          pt.push({ k: 'lv', d: poly([g(2), g(17)]), c: 'p-ink', draw: true, dl: 560 });
        }
        st.set(sp, [], pt);
      }
    };
  };

  /* 04 · Supercategorías */
  VIZ.super = function (viz) {
    var FAM = [
      { n: 'Moda', c: [['Camisetas', 62], ['Calzado', 55], ['Pantalones', 48], ['Vestidos', 40], ['Accesorios', 30]] },
      { n: 'Hogar', c: [['Textil', 44], ['Menaje', 38], ['Decoración', 36], ['Muebles', 30], ['Iluminación', 22]] },
      { n: 'Electrónica', c: [['Móviles', 52], ['Audio', 34], ['Informática', 26], ['Smart home', 20], ['Cables', 18]] },
      { n: 'Otros', c: [['Belleza', 40], ['Deporte', 36], ['Juguetes', 30], ['Libros', 22], ['Mascotas', 18]] }
    ];
    var st = Stage($('.stage', viz), 20), R = rng(11), order = [];
    for (var i = 0; i < 20; i++) order.push(i);
    order.sort(function () { return R() - .5; });
    var BOT = .84;
    return {
      set: function (k) {
        var sp = [], lb = [], pt = [];
        FAM.forEach(function (f, fi) {
          var tot = f.c.reduce(function (a, c) { return a + c[1]; }, 0), acc = 0;
          f.c.forEach(function (c, ci) {
            var i = fi * 5 + ci, s;
            if (k === 'u1') {
              var p = order.indexOf(i), h = c[1] / 62 * .6;
              s = { x: .05 + p * .0455, y: BOT - h, w: .034, h: h, c: 'g1' };
            } else if (k === 'u2' || fi > 0) {
              var col = k === 'u2' ? .1 + fi * .215 : .06 + (fi - 1) * .15;
              var w = k === 'u2' ? .13 : .1, hh = c[1] / 250 * .66;
              acc += hh;
              s = { x: col, y: BOT - acc, w: w, h: hh, c: 'g1', bd: 'inset 0 -1px 0 #fff' };
              if (ci === 0) {
                lb.push({ k: 'fn' + fi, x: col + w / 2, y: BOT + .03, t: f.n, a: 'ct', c: 'ink' });
                lb.push({ k: 'ft' + fi, x: col + w / 2, y: BOT - tot / 250 * .66 - .025, t: tot + ' k€', a: 'cb' });
              }
            } else {
              var hx = c[1] / 62 * .52;
              s = { x: .52 + ci * .092, y: BOT - hx, w: .07, h: hx, c: 'gr' };
              lb.push({ k: 'cn' + ci, x: .52 + ci * .092 + .035, y: BOT + .03, t: c[0], a: 'ct', c: '' });
              lb.push({ k: 'cv' + ci, x: .52 + ci * .092 + .035, y: BOT - hx - .02, t: c[1], a: 'cb', c: 'grn' });
            }
            sp.push(s);
          });
        });
        if (k === 'u1') lb.push({ k: 'u1l', x: .05, y: .08, t: '20 subcategorías · ventas Q4, k€', a: 'lt', c: 'cap' });
        if (k === 'u2') lb.push({ k: 'u1l', x: .05, y: .08, t: '4 familias · ventas Q4, k€', a: 'lt', c: 'cap' });
        if (k === 'u3') {
          lb.push({ k: 'u1l', x: .05, y: .08, t: 'Familias', a: 'lt', c: 'cap' });
          lb.push({ k: 'mh', x: .52, y: .08, t: 'Moda · 235 k€, en detalle', a: 'lt', c: 'grn' });
          pt.push({ k: 'sep', d: poly([[.49, .1], [.49, .9]]), c: 'p-grid' });
        }
        st.set(sp, lb, pt);
      }
    };
  };

  /* 05 · Accesibilidad del color (toggle) */
  VIZ.cacc = function (viz) {
    var stEl = $('.stage', viz), st = Stage(stEl, 0);
    var S = [{ n: 'Online', v: SERIES[0].v, c: '#E07B39' }, { n: 'Tiendas', v: SERIES[1].v, c: '#4F9A4A' }, { n: 'Marketplace', v: [20, 22, 21, 24, 23, 25, 27, 26, 28, 30, 29, 31], c: '#6A7FD1' }];
    var NOTE = {
      a: 'Con color, la leyenda funciona. Si distingues bien esos tres colores.',
      b: 'En escala de grises, tres líneas casi iguales: la leyenda ya no sirve de nada.',
      c: 'Con etiquetas directas y trazos distintos, el significado no depende del color.'
    };
    var note = $('[data-tgl-note="cacc"]');
    function px(m) { return .06 + m / 11 * .74; }
    function py(v) { return .88 - v / 72 * .72; }
    return {
      set: function (k) {
        stEl.classList.toggle('gs', k !== 'a');
        var pt = [], lb = [];
        S.forEach(function (s, i) {
          pt.push({ k: 's' + i, d: poly(s.v.map(function (v, m) { return [px(m), py(v)]; })), c: 'p-c' + i + (k === 'c' ? ' p-dash' + i : '') });
          if (k === 'c') lb.push({ k: 'd' + i, x: px(11) + .02, y: py(s.v[11]), t: s.n, a: 'l', c: 'ink' });
          else lb.push({ k: 'g' + i, x: .06 + i * .2, y: .05, t: '<i style="display:inline-block;width:10px;height:10px;margin-right:6px;background:' + s.c + '"></i>' + s.n, a: 'lt' });
        });
        pt.push({ k: 'b', d: poly([[.06, .88], [.8, .88]]), c: 'p-grid' });
        st.set([], lb, pt);
        if (note) note.textContent = NOTE[k];
      }
    };
  };

  /* 05 · Regla del 10 % (toggle) */
  VIZ.ten = function (viz) {
    var st = Stage($('.stage', viz), 10), V = [42, 38, 35, 33, 31, 30, 28, 26, 24, 21], H = 3;
    var N = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao', 'Málaga', 'Zaragoza', 'Murcia', 'Palma', 'Vigo'];
    return {
      set: function (k) {
        var lb = [];
        var sp = V.map(function (v, i) {
          var h = v / 42 * .7, x = .05 + i * .092;
          var on = k === 'a' || i === H;
          lb.push({ k: 'v' + i, x: x + .035, y: .85 - h - .02, t: v + ' %', a: 'cb', c: on ? (k === 'a' ? 'ink' : 'grn') : '' });
          if (k === 'b' && i === H) lb.push({ k: 'n', x: x + .035, y: .85 - h - .09, t: N[i], a: 'cb', c: 'grn' });
          return { x: x, y: .85 - h, w: .07, h: h, c: on ? 'gr' : 'g1' };
        });
        lb.push({ k: 'cap', x: .05, y: .96, t: 'Crecimiento por tienda', a: 'lb', c: 'cap' });
        st.set(sp, lb, [{ k: 'b', d: poly([[.04, .85], [.97, .85]]), c: 'p-ink' }]);
      }
    };
  };

  /* 06 · Selector de tarea */
  function buildTask() {
    var box = $('#task'); if (!box) return;
    var st = Stage($('.stage', box), 40), R = rng(42), timer;
    var COPY = {
      trend: ['Si quiero ver cómo cambia algo, empiezo pensando en una línea.', 'Línea'],
      cmp: ['Si quiero comparar, una longitud sencilla suele hacer mejor el trabajo.', 'Barras'],
      rank: ['Cuando la posición importa, ordenar forma parte del mensaje.', 'Barras ordenadas'],
      dist: ['Cuando quiero saber cómo se reparten los valores, necesito ver la distribución.', 'Puntos → histograma'],
      rel: ['Cuando quiero ver cómo se relacionan dos variables, necesito verlas en el mismo espacio.', 'Dispersión'],
      part: ['Cuando quiero explicar cómo se forma un total, busco una representación que mantenga clara esa estructura.', 'Total → componentes']
    };
    var V = SERIES[0].v, MN = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    var tick = [], units = [];
    for (var i = 0; i < 40; i++) {
      var t = 125 + (R() + R() + R() - 1.5) * 70 + (R() < .12 ? 55 : 0);
      t = Math.max(42, Math.min(218, t)); tick.push(t);
      units.push(Math.max(1, Math.min(8, t / 27 + (R() - .5) * 2.2)));
    }
    var X0 = .07, X1 = .95, Y0 = .12, Y1 = .84;
    function hx(m) { return X0 + (m + .5) / 12 * (X1 - X0); }
    function tx(v) { return X0 + (v - 40) / 180 * (X1 - X0); }
    function strip() {
      return tick.map(function (t, i) { return { cx: tx(t), cy: .5 + (R() - .5) * .14, s: .022, r: '50%', c: 'ink', o: .75 }; });
    }
    function draw(t, phase) {
      var sp = [], lb = [], pt = [];
      if (t === 'trend' || t === 'cmp' || t === 'rank') {
        var ord = V.map(function (v, m) { return m; });
        if (t === 'rank') ord.sort(function (a, b) { return V[b] - V[a]; });
        V.forEach(function (v, m) {
          var slot = ord.indexOf(m), x = hx(slot), y = Y1 - v / 72 * (Y1 - Y0);
          if (t === 'trend') sp[m] = { cx: hx(m), cy: y, s: .016, r: '50%', c: 'ink' };
          else sp[m] = { x: x - .025, y: y, w: .05, h: Y1 - y, c: (t === 'rank' && slot === 0) ? 'gr' : 'g1' };
          lb.push({ k: 'm' + m, x: t === 'trend' ? hx(m) : x, y: Y1 + .035, t: MN[m], a: 'ct', c: 'cap' });
          if (t === 'rank') lb.push({ k: 'rv' + m, x: x, y: y - .02, t: v, a: 'cb', c: slot === 0 ? 'grn' : '' });
        });
        if (t === 'trend') { pt.push({ k: 'ln', d: poly(V.map(function (v, m) { return [hx(m), Y1 - v / 72 * (Y1 - Y0)]; })), c: 'p-ink2', draw: true }); lb.push({ k: 'end', x: hx(11) - .01, y: Y1 - 68 / 72 * (Y1 - Y0) - .05, t: '68 k€', a: 'cb', c: 'ink' }); }
        pt.push({ k: 'base', d: poly([[X0, Y1], [X1, Y1]]), c: 'p-grid' });
        lb.push({ k: 'cap', x: X0, y: .03, t: t === 'rank' ? 'Ventas online por mes, ordenadas, k€' : 'Ventas online por mes, k€', a: 'lt', c: 'cap' });
      } else if (t === 'dist' || t === 'rel') {
        if (phase === 0) { sp = strip(); lb.push({ k: 'cap', x: X0, y: .03, t: 'Ticket de 40 pedidos', a: 'lt', c: 'cap' }); }
        else if (t === 'dist') {
          var cnt = {}, bins = {}, top = 0, mb = 0;
          tick.forEach(function (v) { var b = Math.min(8, Math.floor((v - 40) / 20)); cnt[b] = (cnt[b] || 0) + 1; if (cnt[b] > top) { top = cnt[b]; mb = b; } });
          var stp = (Y1 - Y0 - .08) / top;
          tick.forEach(function (v, i) {
            var b = Math.min(8, Math.floor((v - 40) / 20)), n = bins[b] = (bins[b] || 0) + 1;
            sp[i] = { x: tx(40 + b * 20) + .004, y: Y1 - n * stp, w: (X1 - X0) / 9 - .008, h: stp - .008, c: b === mb ? 'gr' : 'g1' };
          });
          lb.push({ k: 'cap', x: X0, y: .03, t: 'Pedidos por tramo de ticket', a: 'lt', c: 'cap' });
          lb.push({ k: 'mode', x: tx(50 + mb * 20), y: Y1 - top * stp - .02, t: 'lo más frecuente: ' + (40 + mb * 20) + '–' + (60 + mb * 20) + ' €', a: 'cb', c: 'grn' });
          pt.push({ k: 'base', d: poly([[X0, Y1], [X1, Y1]]), c: 'p-grid' });
        } else {
          tick.forEach(function (v, i) { sp[i] = { cx: X0 + (units[i] - 1) / 7 * (X1 - X0), cy: Y1 - (v - 40) / 180 * (Y1 - Y0), s: .02, r: '50%', c: 'ink', o: .8 }; });
          lb.push({ k: 'cap', x: X0, y: .03, t: '↑ Ticket', a: 'lt', c: 'cap' });
          lb.push({ k: 'cap2', x: X1, y: Y1 + .06, t: 'Unidades por pedido →', a: 'rt', c: 'cap' });
          pt.push({ k: 'trend', d: poly([[X0, Y1 - .05], [X1, Y0 + .06]]), c: 'p-dash', draw: true });
          pt.push({ k: 'base', d: poly([[X0, Y1], [X1, Y1]]), c: 'p-grid' });
          pt.push({ k: 'yax', d: poly([[X0, Y0], [X0, Y1]]), c: 'p-grid' });
        }
        if (t === 'dist' || phase === 0) ['40', '100', '160', '220'].forEach(function (v) { lb.push({ k: 'x' + v, x: tx(+v), y: Y1 + .035, t: v + ' €', a: 'ct', c: 'cap' }); });
      } else if (t === 'part') {
        var tot = 1572, acc = X0, parts = Q4.map(function (c) { return c.b; });
        parts.forEach(function (v, i) {
          var w = v / tot * (X1 - X0), gap = phase ? .006 : 0;
          sp[i] = { x: acc + gap / 2, y: phase ? .42 : .4, w: w - gap, h: phase ? .16 : .2, c: phase && i === 0 ? 'gr' : 'g1', bd: phase ? 'none' : 'inset -1px 0 0 #fff' };
          if (phase && i < 2) lb.push({ k: 'p' + i, x: acc + w / 2, y: .62, t: Q4[i].n + '<br><b>' + Math.round(v / tot * 100) + ' %</b>', a: 'ct', c: i === 0 ? 'grn wrap' : 'ink wrap' });
          acc += w;
        });
        if (phase) lb.push({ k: 'p2', x: acc - (X1 - X0) * (352 / 1572) / 2, y: .62, t: 'Resto de canales<br><b>22 %</b>', a: 'ct', c: 'wrap' });
        lb.push({ k: 'ptot', x: X0, y: .3, t: 'Total Q4 · 1,57 M€', a: 'lb', c: 'big' });
      }
      for (var j = 0; j < 40; j++) if (!sp[j]) sp[j] = undefined;
      st.set(sp, lb, pt);
    }
    var q = $('.tq', box), tk = $('.tk', box), btns = $$('.seg button', box);
    function choose(t) {
      clearTimeout(timer);
      btns.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.t === t ? 'true' : 'false'); });
      q.textContent = COPY[t][0]; tk.textContent = COPY[t][1];
      if (t === 'dist' || t === 'rel' || t === 'part') {
        if (RM.matches) return draw(t, 1);
        draw(t, 0); timer = setTimeout(function () { draw(t, 1); }, 900);
      } else draw(t);
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { choose(b.dataset.t); }); });
    choose('trend');
  }

  /* 06 · Guess → reveal */
  function buildGuess() {
    var box = $('#guess'); if (!box) return;
    var stEl = $('.stage', box), st = Stage(stEl, 5);
    var D = [['Centro', 468], ['Este', 421], ['Norte', 412], ['Sur', 395], ['Oeste', 377]], PIEC = ['c1', 'c2', 'c3', 'c4', 'c5'];
    var pie = document.createElementNS(NS, 'svg');
    pie.setAttribute('viewBox', '0 0 160 100'); pie.setAttribute('class', 'pie');
    pie.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;transition:opacity .5s ease,transform .7s cubic-bezier(.65,0,.35,1);transform-origin:35% 50%';
    var tot = D.reduce(function (a, d) { return a + d[1]; }, 0), a0 = -Math.PI / 2, html = '';
    var order = [2, 0, 3, 1, 4];
    order.forEach(function (idx, j) {
      var a1 = a0 + D[idx][1] / tot * Math.PI * 2, r = 40, cx = 56, cy = 50;
      html += '<path d="M' + cx + ' ' + cy + ' L' + (cx + r * Math.cos(a0)) + ' ' + (cy + r * Math.sin(a0)) + ' A' + r + ' ' + r + ' 0 0 1 ' + (cx + r * Math.cos(a1)) + ' ' + (cy + r * Math.sin(a1)) + ' Z" fill="' + COL[PIEC[j]] + '" stroke="#fff" stroke-width=".8"/>';
      html += '<rect x="112" y="' + (22 + j * 12) + '" width="6" height="6" fill="' + COL[PIEC[j]] + '"/><text x="121" y="' + (27.5 + j * 12) + '" font-size="6.5" fill="#444" font-family="Plus Jakarta Sans,sans-serif">' + D[idx][0] + '</text>';
      a0 = a1;
    });
    pie.innerHTML = html; stEl.insertBefore(pie, stEl.firstChild);
    function bars(show) {
      var lb = [];
      var sp = D.map(function (d, i) {
        var w = show ? d[1] / 468 * .66 : 0, y = .14 + i * .155;
        if (show) { lb.push({ k: 'n' + i, x: .2, y: y + .05, t: d[0], a: 'r', c: 'ink' }); lb.push({ k: 'v' + i, x: .22 + w + .015, y: y + .05, t: d[1] + ' k€', a: 'l', c: i === 0 ? 'grn' : '' }); }
        return { x: .22, y: y, w: w, h: .1, c: i === 0 ? 'gr' : 'g1', o: show ? 1 : 0 };
      });
      st.set(sp, lb, show ? [{ k: 'b', d: poly([[.22, .1], [.22, .9]]), c: 'p-ink' }] : []);
    }
    bars(false);
    var fb = $('.fb', box), bt = $$('.opts button', box);
    var MSG = {
      pie: 'Es la elección más habitual. Intenta decir, solo con los ángulos, si vende más el Norte o el Este.',
      bar: 'Buena elección. Longitudes alineadas sobre una misma base: la comparación más precisa.',
      line: 'La línea sugiere una secuencia entre regiones que no existe. La reservo para el tiempo.'
    };
    bt.forEach(function (b) {
      b.addEventListener('click', function () {
        bt.forEach(function (x) { x.disabled = true; x.classList.toggle('right', x.dataset.g === 'bar'); x.classList.toggle('picked', x === b); });
        fb.innerHTML = '<p>' + MSG[b.dataset.g] + '</p>';
        later(function () {
          fb.innerHTML += '<p class="ds-h3" style="margin-top:14px">La tarea era comparar.</p><p>Cinco valores parecidos: en la tarta se confunden; en barras ordenadas se leen. <button type="button" class="btn-ds ghost" style="padding:8px 12px;font-size:11px;margin-left:6px" data-retry>Repetir</button></p>';
          pie.style.opacity = 0; pie.style.transform = 'scale(.6)';
          later(function () { bars(true); }, 250);
          var r = $('[data-retry]', fb);
          r.addEventListener('click', function () {
            bt.forEach(function (x) { x.disabled = false; x.classList.remove('right', 'picked'); });
            fb.innerHTML = ''; pie.style.opacity = 1; pie.style.transform = 'none'; bars(false); bt[0].focus();
          });
        }, 1100);
      });
    });
  }

  /* 07 · Construir el lienzo */
  VIZ.canvas = function (viz) {
    var mini = function (hero) { var h = [.8, .55, .45, .35, .25], s = ''; h.forEach(function (v, i) { s += '<i style="position:absolute;bottom:0;left:' + (i * 19 + 2) + '%;width:14%;height:' + (v * 100) + '%;background:' + (hero && i === 0 ? '#6B5CA5' : '#DCDCDC') + '"></i>'; }); return '<div style="position:relative;flex:1;margin-top:.6em">' + s + '</div>'; };
    var BL = [
      '<span class="lb cap" style="position:static;opacity:1">Título</span><span style="font-family:Newsreader,serif;font-size:1.45em;line-height:1.1;margin-top:.15em">El canal online ya concentra el crecimiento</span>',
      '<span class="lb cap" style="position:static;opacity:1">KPI</span><span style="font-family:Newsreader,serif;font-size:2.6em;line-height:1;margin-top:.2em;color:#4A3E79">+24 %</span><span style="font-size:.9em;color:#5a5a5a">vs. Q4 2024</span>',
      '<span class="lb cap" style="position:static;opacity:1">Visual principal</span>' + mini(true),
      '<span class="lb cap" style="position:static;opacity:1">Detalle</span>' + mini(false),
      '<span class="lb cap" style="position:static;opacity:1">Detalle</span>' + mini(false),
      '<span class="lb cap" style="position:static;opacity:1">Segmentador</span><span style="font-size:.95em;margin-top:.2em">Canal: Todos ▾</span>'
    ];
    var st = Stage($('.stage', viz), 6, { blk: BL });
    var M = .05, G = .02, CW = (.9 - 11 * G) / 12;
    function cx(c) { return M + c * (CW + G); }
    function sw(n) { return n * CW + (n - 1) * G; }
    var gridP = [];
    for (var c = 0; c < 12; c++) gridP.push({ k: 'gc' + c, d: rect(cx(c), .03, CW, .94), c: 'rg' });
    var MESSY = [{ x: .07, y: .06, w: .58, h: .1 }, { x: .08, y: .21, w: .24, h: .2 }, { x: .36, y: .19, w: .58, h: .43 }, { x: .06, y: .67, w: .3, h: .26 }, { x: .4, y: .69, w: .27, h: .24 }, { x: .71, y: .7, w: .23, h: .11 }];
    var SNAP = [{ x: cx(0), y: .06, w: sw(8), h: .1 }, { x: cx(0), y: .2, w: sw(3), h: .2 }, { x: cx(3), y: .2, w: sw(9), h: .42 }, { x: cx(0), y: .68, w: sw(4), h: .26 }, { x: cx(4), y: .68, w: sw(4), h: .26 }, { x: cx(8), y: .68, w: sw(4), h: .1 }];
    var DIST = [{ x: cx(0), y: .05, w: sw(8), h: .1 }, { x: cx(0), y: .19, w: sw(3), h: .44 }, { x: cx(3), y: .19, w: sw(9), h: .44 }, { x: cx(0), y: .67, w: sw(4), h: .28 }, { x: cx(4), y: .67, w: sw(4), h: .28 }, { x: cx(8), y: .67, w: sw(4), h: .12 }];
    var SHOW = { k0: 0, k1: 0, k2: 1, k3: 2, k4: 3, k5: 5, k6: 6, k7: 6, k8: 6, k9: 6 };
    return {
      set: function (k) {
        var n = SHOW[k], L = k === 'k7' ? SNAP : (k === 'k8' || k === 'k9') ? DIST : MESSY;
        var sp = L.map(function (p, i) { return Object.assign({ c: 'w', bc: 'grid', o: i < n ? 1 : 0 }, p); });
        var pt = [];
        if (k !== 'k0' && k !== 'k9') pt = pt.concat(gridP);
        if (n >= 6) {
          var r = L[4], s = L[5];
          pt.push({ k: 'reg', d: rect(r.x - .012, Math.min(r.y, s.y) - .015, s.x + s.w - r.x + .024, Math.max(r.y + r.h, s.y + s.h) - Math.min(r.y, s.y) + .03), c: 'rg rg-g' });
        }
        var lb = [];
        if (k === 'k0') lb.push({ k: 'e', x: .5, y: .5, t: 'lienzo vacío', a: 'c', c: 'cap' });
        if (k === 'k8') lb.push({ k: 'gut', x: .97, y: .17, t: '↕ mismo espacio entre filas', a: 'r', c: 'cap grn' });
        st.set(sp, lb, pt);
      }
    };
  };

  /* 07 · 8 puntos y espacio en blanco (toggles CSS) */
  VIZ.spc = function (viz) { var e = $('.spc', viz); return { set: function (k) { e.dataset.s = k; } }; };
  VIZ.ws = function (viz) { var e = $('.ws', viz); return { set: function (k) { e.dataset.s = k; } }; };

  /* 08 · Anotación */
  VIZ.annot = function (viz) {
    var st = Stage($('.stage', viz), 1);
    var D = [2.1, 2.0, 2.2, 2.1, 2.3, 2.2, 2.1, 2.2, 2.3, 2.2, 2.1, 2.3, 2.3, 2.9, 3.1, 3.2, 3.3, 3.2, 3.4, 3.3, 3.5, 3.4, 3.5, 3.6];
    function px(i) { return .08 + i / 23 * .86; }
    function py(v) { return .86 - (v - 1.5) / 2.5 * .72; }
    var line = poly(D.map(function (v, i) { return [px(i), py(v)]; }));
    return {
      set: function (k) {
        var n = +k.slice(1), lb = [], pt = [{ k: 'l', d: line, c: 'p-line2' }, { k: 'b', d: poly([[.08, .86], [.94, .86]]), c: 'p-grid' }];
        lb.push({ k: 'y1', x: .06, y: py(3.5), t: '3,5 %', a: 'r', c: 'cap' });
        lb.push({ k: 'y2', x: .06, y: py(2), t: '2,0 %', a: 'r', c: 'cap' });
        lb.push({ k: 'x1', x: px(0), y: .9, t: 'S1', a: 'ct', c: 'cap' });
        lb.push({ k: 'x2', x: px(23), y: .9, t: 'S24', a: 'ct', c: 'cap' });
        lb.push({ k: 'cap', x: .08, y: .02, t: 'Conversión semanal de la tienda online', a: 'lt', c: 'cap' });
        if (n >= 3) pt.push({ k: 'c', d: poly([[px(13) - .005, py(2.9) - .03], [.44, .2], [.5, .2]]), c: 'p-ink', draw: true });
        if (n >= 4) lb.push({ k: 'a', x: .51, y: .2, t: '<b>Semana 14 · 2,3 % → 2,9 %</b><br>El cambio coincide con el lanzamiento del nuevo onboarding.', a: 'l', c: 'ann', mw: .42 });
        st.set([{ cx: px(13), cy: py(2.9), s: .024, r: '50%', c: 'gr', o: n >= 2 ? 1 : 0 }], lb, pt);
      }
    };
  };

  /* 08 · Etiquetas directas (toggle) */
  VIZ.dlab = function (viz) {
    var stEl = $('.stage', viz), st = Stage(stEl, 0), C = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000'];
    function px(m) { return .06 + m / 11 * .72; }
    function py(v) { return .82 - v / 72 * .74; }
    return {
      set: function (k) {
        var pt = [], lb = [];
        SERIES.slice(0, 4).forEach(function (s, i) {
          pt.push({ k: 's' + i, d: poly(s.v.map(function (v, m) { return [px(m), py(v)]; })), c: 'p-l' + i });
          if (k === 'a') lb.push({ k: 'g' + i, x: .06 + i * .2, y: .95, t: '<i style="display:inline-block;width:10px;height:10px;margin-right:6px;background:' + C[i] + '"></i>' + s.n, a: 'l' });
          if (k === 'c') lb.push({ k: 'd' + i, x: px(11) + .02, y: py(s.v[11]) + (i === 3 ? .025 : i === 2 ? -.02 : 0), t: s.n, a: 'l', c: 'ink' });
        });
        st.set([], lb, pt);
      }
    };
  };

  /* 08 · Título dinámico (simula la medida DAX) */
  function buildDyn() {
    var box = $('#dyn'); if (!box) return;
    var R = [['el Norte', -6], ['el Centro', 4], ['el Sur', -11], ['el Este', 9]], t = $('.dyn-t', box), v = $('.dyn-v', box), b = $$('button', box);
    function draw(i) {
      var r = R[i], up = r[1] >= 0;
      t.innerHTML = 'Las ventas d' + r[0].replace('el ', 'el ') + ' ' + (up ? 'crecen' : 'caen') + ' un <span style="color:' + (up ? 'var(--green-ink)' : 'var(--red)') + '">' + Math.abs(r[1]) + ' %</span> frente al año pasado';
      v.innerHTML = R.map(function (x, j) {
        var w = Math.abs(x[1]) / 12 * 45;
        return '<div style="display:grid;grid-template-columns:70px 1fr;align-items:center;height:22px;font-size:13px;color:' + (i === j ? 'var(--ink)' : 'var(--muted)') + ';font-weight:' + (i === j ? 700 : 400) + '"><span>' + x[0].replace('el ', '') + '</span><span style="position:relative;height:12px"><i style="position:absolute;top:0;height:100%;left:' + (x[1] < 0 ? 50 - w : 50) + '%;width:' + w + '%;background:' + (i === j ? (x[1] < 0 ? 'var(--red)' : 'var(--green)') : 'var(--g2)') + ';transition:all .4s"></i><i style="position:absolute;left:50%;top:-4px;bottom:-4px;width:1px;background:#999"></i></span></div>';
      }).join('');
      b.forEach(function (x, j) { x.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
    }
    b.forEach(function (x, j) { x.addEventListener('click', function () { draw(j); }); });
    draw(0);
  }

  /* 09 · Historia en tres actos */
  VIZ.churn = function (viz) {
    var K = [['Clientes activos', '48.200'], ['Abandono anual', '18 %'], ['Coste anual', '2,4 M€']];
    var BLK = K.map(function (k) { return '<span class="lb cap" style="position:static;opacity:1">' + k[0] + '</span><span style="font-family:Newsreader,serif;font-size:2.3em;line-height:1.05">' + k[1] + '</span>'; });
    var BANDS = [['0–30 d', 24], ['31–60', 21], ['61–90', 16], ['91–180', 14], ['181–365', 13], ['> 1 año', 12]];
    var blk = BLK.concat([null, null, null, null, null, null, '<span class="lb cap" style="position:static;opacity:1;color:#4A3E79">Qué propongo</span><span style="font-family:Newsreader,serif;font-size:1.5em;line-height:1.2;margin-top:.4em">Rediseñar los primeros 90 días: llamada de bienvenida en la semana 2 y revisión en la semana 6.</span><span style="margin-top:.8em;font-size:1em;color:#5a5a5a">Potencial: unos 0,7 M€ al año si reducimos a la mitad las bajas tempranas. Lo mediremos en 8 semanas.</span>']);
    var st = Stage($('.stage', viz), 10, { blk: blk });
    return {
      set: function (k) {
        var n = +k.slice(1), sp = [], lb = [], pt = [];
        K.forEach(function (x, i) {
          if (n === 1) sp.push({ x: .03 + i * .325, y: .05, w: .3, h: .22, c: 'w', bc: 'grid' });
          else sp.push({ x: .03 + i * .2, y: .02, w: .19, h: .12, c: 'w', bc: 'grid', o: MOBILE.matches ? 0 : .4 });
        });
        var M = MOBILE.matches;
        var area = n === 1 ? { x: .1, y: .5, w: .8, h: .32 } : n === 4 ? (M ? { x: .04, y: .1, w: .92, h: .34 } : { x: .06, y: .26, w: .42, h: .56 }) : (M ? { x: .04, y: .4, w: .92, h: .44 } : { x: .08, y: .24, w: .88, h: .6 });
        var step = area.w / 6;
        BANDS.forEach(function (b, i) {
          var h = b[1] / 24 * area.h, x = area.x + i * step + step * .15, w = step * .7, y = area.y + area.h - h;
          sp.push({ x: x, y: y, w: w, h: h, c: (n >= 3 && i < 3) ? 'gr' : 'g1' });
          lb.push({ k: 'bn' + i, x: x + w / 2, y: area.y + area.h + .02, t: b[0], a: 'ct', c: n === 1 ? 'cap' : '' });
          lb.push({ k: 'bv' + i, x: x + w / 2, y: y - .015, t: b[1] + ' %', a: 'cb', c: (n >= 3 && i < 3) ? 'grn' : '' });
        });
        sp.push(M ? { x: .04, y: .56, w: .92, h: .42, c: 'wash', bc: 'gr', o: n === 4 ? 1 : 0 } : { x: .53, y: .3, w: .43, h: .4, c: 'wash', bc: 'gr', o: n === 4 ? 1 : 0 });
        lb.push({ k: 'cap', x: area.x, y: area.y - (n === 1 ? .07 : .08), t: 'Bajas por antigüedad del cliente, % del total', a: 'lb', c: 'cap' });
        if (n === 2 || n === 3) {
          var x0 = area.x + step * .1, x1 = area.x + step * 2.9, yb = area.y + area.h - area.h - .02;
          pt.push({ k: 'br', d: poly([[x0, yb + .02], [x0, yb], [x1, yb], [x1, yb + .02]]), c: 'p-ink', draw: true });
          lb.push({ k: 'brl', x: (x0 + x1) / 2, y: yb - .015, t: 'Primeros 90 días', a: 'cb', c: n === 3 ? 'grn' : 'ink' });
        }
        if (n === 3) lb.push({ k: 'ann', x: M ? .04 : area.x + step * 3.3, y: M ? .17 : area.y + .08, t: '<b>El 61 % de las bajas</b> ocurre antes del día 90. El problema está en la entrada, no en la permanencia.', a: 'lt', c: 'ann2', mw: M ? .92 : .42 });
        st.set(sp, lb, pt);
      }
    };
  };

  /* Cierre · zoom out */
  function buildMosaic() {
    var m = $('#mosaic'); if (!m) return;
    var T = [
      ['01', 'Fundamentos', [[10, 20, 6, 6], [40, 60, 6, 6], [70, 30, 6, 6], [25, 45, 6, 6], [55, 15, 6, 6], [80, 70, 6, 6, 'g']], '1 / 1', ''],
      ['02', 'Contexto', [[0, 10, 70, 8], [0, 35, 90, 8], [0, 60, 55, 8], [0, 85, 80, 8, 'g']], '1 / 2', ''],
      ['03', 'Percepción', [[0, 0, 18, 28], [27, 0, 18, 28], [54, 0, 18, 28, 'g'], [0, 45, 18, 28], [27, 45, 18, 28], [54, 45, 18, 28]], '1 / 3', ''],
      ['04', 'Reducir el ruido', [[0, 0, 100, 14, 'k'], [0, 30, 80, 12, 'g'], [0, 52, 30, 12], [0, 74, 20, 12]], '1 / 4', 'Aquí eliminamos ruido.'],
      ['09', 'Construir la historia', [[0, 60, 14, 40, 'g'], [20, 50, 14, 50, 'g'], [40, 70, 14, 30, 'g'], [60, 80, 14, 20], [80, 82, 14, 18]], '2 / 1', 'Aquí construimos una historia.', 'z2'],
      ['10', 'Juntar las piezas', [[0, 0, 60, 12, 'k'], [0, 24, 55, 70, 'g'], [62, 24, 38, 30], [62, 60, 38, 34]], '2 / 4', '', 'z1'],
      ['08', 'El texto', [[0, 0, 90, 16, 'k'], [0, 30, 100, 2], [40, 32, 6, 30, 'g'], [52, 40, 40, 10, 'k']], '3 / 1', 'Aquí anotamos el dato.'],
      ['07', 'Componer', [[0, 0, 60, 14], [0, 22, 30, 36, 'g'], [36, 22, 64, 36], [0, 66, 47, 34], [53, 66, 47, 34]], '3 / 2', 'Aquí usamos jerarquía.'],
      ['06', 'Elegir el visual', [[0, 70, 12, 30], [18, 50, 12, 50], [36, 30, 12, 70, 'g'], [54, 55, 12, 45], [72, 62, 12, 38]], '3 / 3', 'Aquí cambiamos la representación.'],
      ['05', 'Dirigir la atención', [[0, 20, 80, 12, 'g'], [0, 42, 40, 12], [0, 64, 28, 12], [0, 86, 18, 12]], '3 / 4', 'Aquí dirigimos la atención.']
    ];
    var html = T.map(function (t) {
      var inner = t[2].map(function (r) { return '<i class="' + (r[4] || '') + '" style="left:' + r[0] + '%;top:' + r[1] + '%;width:' + r[2] + '%;height:' + r[3] + '%"></i>'; }).join('');
      return '<a class="tile ' + (t[5] || '') + '" href="#c' + t[0] + '" style="grid-area:' + t[3] + '" tabindex="-1"><span class="m-n">' + t[0] + '</span><span class="m-v">' + inner + '</span><span class="m-t">' + t[1] + '</span>' + (t[4] ? '<span class="flag">' + t[4] + '</span>' : '') + '</a>';
    }).join('');
    m.innerHTML = html + '<div class="tile main"><div class="viz" data-dash="mosaic"></div></div>';
    makeDash($('[data-dash="mosaic"]', m)).set(FINAL);
  }
  buildMosaic();
  VIZ.mosaic = function (viz) {
    var w = $('.mosaic-wrap', viz), mo = $('.mosaic', viz);
    var OR = { 0: '50% 50%', 1: '64% 50%', 2: '50% 50%', 3: '50% 50%', 4: '50% 50%' };
    return { set: function (k) { w.dataset.z = k; mo.style.transformOrigin = OR[k]; } };
  };

  /* dash dentro de un scrolly */
  VIZ.dash = function (viz) {
    var host = viz.dataset.dash ? viz : $('[data-dash]', viz), d = DASH[host.dataset.dash];
    var ledger = viz.parentNode.querySelector('.noise-ledger');
    var items = ledger ? $$('li[data-f]', ledger) : [], count = ledger ? $('.nl-count', ledger) : null;
    return { set: function (k, step) {
      var flags = step.dataset.flags || '';
      d.set(flags);
      if (!ledger) return;
      var out = 0, f = ' ' + flags + ' ';
      items.forEach(function (li) { var on = f.indexOf(' ' + li.dataset.f + ' ') > -1; li.classList.toggle('is-out', on); if (on) out++; });
      if (count) count.textContent = out ? out + ' de ' + items.length + ' fuera' : items.length + ' fuentes de ruido';
    } };
  };

  /* ═══════════════════════════════════════════
     SCROLLYTELLING: el scroll elige el estado
     ═══════════════════════════════════════════ */
  $$('.scrolly').forEach(function (sc) {
    var fn = VIZ[sc.dataset.viz]; if (!fn) return;
    var viz = fn($('.sc-visual .viz', sc), sc);
    var steps = $$('.step', sc), current = null;
    function activate(step) {
      if (step === current) return;
      current = step;
      steps.forEach(function (s) { s.classList.toggle('is-active', s === step); });
      viz.set(step.dataset.s || '', step);
      var dh = $('.sc-visual [data-dash]', sc), key = dh ? dh.dataset.dash : sc.dataset.viz;
      var payload = { key: key, viz: sc.dataset.viz, s: step.dataset.s || '', flags: step.dataset.flags || '', step: step, scrolly: sc };
      BUS.state[key] = payload;
      BUS.emit('state', payload);
    }
    activate(steps[0]);
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) activate(e.target); });
    }, { rootMargin: MOBILE.matches ? '-62% 0px -32% 0px' : '-48% 0px -48% 0px' });
    steps.forEach(function (s) { io.observe(s); });
  });

  /* toggles con autoplay (una vez, al entrar en pantalla) */
  $$('.tgl[data-viz]').forEach(function (t) {
    var fn = VIZ[t.dataset.viz]; if (!fn) return;
    var viz = fn(t), seq = (t.dataset.auto || '').split(','), btns = $$('[data-tgl-for="' + t.id + '"] button'), touched = false, timers = [];
    function set(k) { viz.set(k); btns.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.s === k ? 'true' : 'false'); }); }
    btns.forEach(function (b) { b.addEventListener('click', function () { touched = true; timers.forEach(clearTimeout); set(b.dataset.s); }); });
    set(seq[0]);
    if (RM.matches || seq.length < 2) return;
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; io.disconnect();
      seq.slice(1).forEach(function (k, i) { timers.push(setTimeout(function () { if (!touched) set(k); }, 1400 * (i + 1))); });
    }, { threshold: .6 });
    io.observe(t);
  });

  /* ═══ REVEALS ═══ */
  var rio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target; rio.unobserve(el);
      var d = +(el.dataset.delay || 0);
      if (d && !RM.matches) el.style.transitionDelay = d + 'ms';
      el.classList.add('in');
      if (el.dataset.reveal && el.dataset.reveal !== '') later(function () { el.classList.add(el.dataset.reveal); }, 900);
      if (el.hasAttribute('data-timer')) countdown(el);
    });
  }, { threshold: .3 });
  $$('.rv, .rv-up, .rv-seq, [data-reveal], [data-timer]').forEach(function (el) { rio.observe(el); });
  function countdown(el) {
    var tv = $('.tv', el), t0 = performance.now(), dur = 9000;
    if (RM.matches) { tv.textContent = '3:00'; return; }
    (function tick(now) {
      var left = Math.max(0, 180 - Math.floor((now - t0) / dur * 180));
      tv.textContent = Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2);
      if (left > 0) requestAnimationFrame(tick);
    })(t0);
  }

  /* ═══ NAVEGACIÓN DE CAPÍTULOS ═══ */
  var rail = $('#chRail'), links = rail ? $$('a', rail) : [], chapters = $$('.chapter');
  var cio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var idx = chapters.indexOf(e.target);
      chapters.forEach(function (c, i) { c.classList.toggle('is-current', i === idx); });
      links.forEach(function (a, i) {
        if (i === idx) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
        a.classList.toggle('past', i < idx);
      });
    });
  }, { rootMargin: '-45% 0px -54% 0px' });
  chapters.forEach(function (c) { cio.observe(c); });
  var hero = $('#hero'), cierre = $('#galeria');
  if (rail && hero) {
    new IntersectionObserver(function (es) { rail.classList.toggle('show', !es[0].isIntersecting); }, { threshold: 0, rootMargin: '0px 0px -100% 0px' }).observe(hero);
  }
  if (cierre) new IntersectionObserver(function (es) {
    if (es[0].isIntersecting || es[0].boundingClientRect.top < 0) { links.forEach(function (a) { a.classList.add('past'); a.removeAttribute('aria-current'); }); }
  }, { rootMargin: '0px 0px -50% 0px' }).observe(cierre);

  /* ═══ COMPONENTES ═══ */
  // diccionario
  var WORDS = [
    'comparar · evaluar · identificar · entender · revisar · detectar · evidenciar',
    'priorizar · ajustar · optimizar · reducir · aumentar · corregir · mejorar · decidir',
    'tendencia · crecimiento · caída · variación · anomalía · distribución · relación · estabilidad · impacto',
    'contexto · causa · evolución · consecuencia · implicación · conclusión · recomendación',
    'rango · variabilidad · probabilidad · magnitud · evidencia · incertidumbre',
    'seleccionar · filtrar · limpiar · expandir · contraer · actualizar · restablecer'
  ];
  var tabs = $$('.tabs [role="tab"]'), dw = $('#dw');
  function tab(i, focus) {
    tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
    dw.setAttribute('aria-labelledby', ''); dw.innerHTML = WORDS[i].split(' · ').map(function (w) { return '<span>' + w + '</span>'; }).join('');
    if (focus) tabs[i].focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { tab(i); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); tab((i + 1) % tabs.length, 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); tab((i - 1 + tabs.length) % tabs.length, 1); }
    });
  });
  if (dw) tab(0);

  // test del elemento
  var picks = $$('.etest .picks button'), etab = $('.etable'), ev = $('#everdict');
  picks.forEach(function (b) {
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-pressed') !== 'true';
      picks.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      $$('tbody tr', etab).forEach(function (r) { r.classList.remove('hit'); });
      etab.classList.toggle('picking', on);
      if (on) {
        b.setAttribute('aria-pressed', 'true');
        var row = $$('tbody tr', etab)[+b.dataset.row]; row.classList.add('hit');
        ev.innerHTML = '<b>' + row.cells[1].textContent + '.</b> ' + b.dataset.v;
      } else ev.textContent = '';
    });
  });

  // validar antes de publicar
  var VAL = {
    h: ['titles', 'Leo solo los títulos. Si juntos cuentan la historia, voy bien.'],
    v: ['', 'Compruebo si cada visual realmente respalda lo que afirma su título.'],
    i: ['notitles', 'Miro el dashboard e intento explicar la historia sin leer los títulos.'],
    e: ['', 'Se lo enseño a alguien que no participó en el análisis y pregunto: “¿Qué entiendes que está pasando?”']
  };
  var valB = $$('#valSeg button'), valT = $('#valTxt');
  function val(m) {
    if (!DASH.val) return;
    DASH.val.set(FINAL + ' ' + VAL[m][0]); valT.textContent = VAL[m][1];
    valB.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false'); });
  }
  valB.forEach(function (b) { b.addEventListener('click', function () { val(b.dataset.m); }); });
  if (valT) val('h');

  // navegación Power BI
  var pbi = $$('.pbinav button');
  pbi.forEach(function (b) { b.addEventListener('click', function () { pbi.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }); });

  // réplica de la transformación
  var SEQ = ['', 'flat lessgrid', 'flat lessgrid gray direct short', 'flat lessgrid gray direct short focus dim', 'flat lessgrid gray direct short focus dim zoom', 'flat lessgrid gray direct short focus dim prio', 'flat lessgrid gray direct short focus dim prio story', 'flat lessgrid gray direct short focus dim prio story annot-on', FINAL];
  var rb = $('#replayBtn'), rl = $$('#replayLog li'), rTimers = [];
  if (rb) rb.addEventListener('click', function () {
    rTimers.forEach(clearTimeout); rTimers = [];
    var d = DASH.final;
    if (RM.matches) { d.set(FINAL); rl.forEach(function (l) { l.classList.add('on'); }); return; }
    SEQ.forEach(function (f, i) {
      rTimers.push(setTimeout(function () {
        d.set(f); rl.forEach(function (l, j) { l.classList.toggle('on', j === i); });
      }, i * 420));
    });
    rTimers.push(setTimeout(function () { rl.forEach(function (l) { l.classList.remove('on'); }); rl[rl.length - 1].classList.add('on'); }, SEQ.length * 420 + 200));
  });

  // prueba de cierre: solo títulos
  var tb = $('#titlesBtn');
  if (tb) tb.addEventListener('click', function () {
    var on = tb.getAttribute('aria-pressed') !== 'true';
    tb.setAttribute('aria-pressed', on ? 'true' : 'false');
    tb.textContent = on ? 'Mostrar los gráficos' : 'Ocultar los gráficos';
    DASH.titles.set(FINAL + (on ? ' titles' : ''));
  });

  // pruebas de accesibilidad
  var AEXP = {
    gs: 'En escala de grises, el protagonista sigue destacando: contraste de luminosidad (el acento es mucho más oscuro que el gris claro), posición y etiqueta en negrita.',
    nocolor: 'Sin el color de marca, la jerarquía la sostienen la posición, el tamaño, el peso de las etiquetas y la anotación. El mensaje sigue ahí.',
    contrast: 'El color de marca sobre este fondo da 5,5:1: suficiente incluso para texto pequeño. Para las etiquetas más diminutas uso además una variante todavía más oscura (9,0:1), por margen de seguridad.',
    kbd: 'Un orden de tabulación que sigue la lectura: título, protagonista, KPI principal, contexto y recomendación. En Power BI se ajusta en el panel de selección.',
    alt: 'El texto alternativo describe la conclusión y las cifras clave, no el tipo de gráfico. “Gráfico de barras” no le sirve a nadie.'
  };
  var ab = $$('.a11y .tests button'), aexp = $('#aexp');
  ab.forEach(function (b) {
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-pressed') !== 'true';
      ab.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); $('.tr', x).textContent = 'Probar'; });
      if (on) { b.setAttribute('aria-pressed', 'true'); $('.tr', b).textContent = 'Activa'; }
      DASH.a11y.extra = on ? b.dataset.a : ''; DASH.a11y.set(FINAL);
      aexp.textContent = on ? AEXP[b.dataset.a] : 'Elige una prueba. Todas se aplican sobre el mismo dashboard.';
    });
  });

  /* ═══ GALERÍA E ILUSIONES (SVG) ═══ */
  function svg(inner, label) { return '<svg class="cv" viewBox="0 0 400 240" role="img" aria-label="' + label + '">' + inner + '</svg>'; }
  function t(x, y, s, cls, anchor, size) { return '<text x="' + x + '" y="' + y + '"' + (cls ? ' class="' + cls + '"' : '') + (anchor ? ' text-anchor="' + anchor + '"' : '') + (size ? ' style="font-size:' + size + 'px"' : '') + '>' + s + '</text>'; }
  function r(x, y, w, h, f, extra) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"' + (extra || '') + '/>'; }
  function pl(pts, stroke, w, extra) { return '<polyline fill="none" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"' + (extra || '') + '/>'; }
  var OFF = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E'];
  var G1 = '#BDBDBD', G2 = '#DCDCDC', GR = '#6B5CA5', INK = '#111';

  function pie(vals, cx, cy, rad, cols) {
    var tot = vals.reduce(function (a, b) { return a + b; }, 0), a0 = -Math.PI / 2, s = '';
    vals.forEach(function (v, i) {
      var a1 = a0 + v / tot * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
      s += '<path d="M' + cx + ' ' + cy + 'L' + (cx + rad * Math.cos(a0)).toFixed(1) + ' ' + (cy + rad * Math.sin(a0)).toFixed(1) + 'A' + rad + ' ' + rad + ' 0 ' + large + ' 1 ' + (cx + rad * Math.cos(a1)).toFixed(1) + ' ' + (cy + rad * Math.sin(a1)).toFixed(1) + 'Z" fill="' + cols[i % cols.length] + '" stroke="#fff" stroke-width="1.5"/>';
      a0 = a1;
    });
    return s;
  }
  function hbars(items, x0, y0, rowH, maxW, maxV, hero, fmt) {
    return items.map(function (it, i) {
      var y = y0 + i * rowH, w = it[1] / maxV * maxW, c = i === hero ? GR : G1;
      return t(x0 - 8, y + rowH * .55, it[0], 'ink', 'end') + r(x0, y + rowH * .15, w, rowH * .62, c) + t(x0 + w + 6, y + rowH * .6, fmt ? fmt(it[1]) : it[1], i === hero ? 't-grn' : '');
    }).join('');
  }
  function lines(series, cols, x0, x1, y0, y1, maxV, widths) {
    return series.map(function (s, i) {
      return pl(s.map(function (v, m) { return [x0 + m / (s.length - 1) * (x1 - x0), y1 - v / maxV * (y1 - y0)]; }), cols[i], widths ? widths[i] : 2);
    }).join('');
  }
  var SP = [[20, 24, 26, 25, 30, 33, 35], [28, 26, 24, 27, 25, 22, 21], [15, 19, 17, 22, 20, 24, 23], [30, 29, 31, 28, 30, 29, 32], [10, 14, 18, 16, 21, 25, 31], [22, 20, 23, 21, 19, 20, 18]];
  var SPN = ['Online', 'Tiendas', 'Marketplace', 'Mayorista', 'App', 'Outlet'];

  var CASES = [
    ['01', 'Tarta con muchas porciones → barras ordenadas', 'No cambié los datos. Cambié la forma de compararlos.',
      function () { var v = CATS.map(function (c) { return c.v; }); return svg(pie(v, 110, 125, 88, OFF) + CATS.map(function (c, i) { return r(236, 34 + i * 23, 10, 10, OFF[i]) + t(252, 43 + i * 23, c.n); }).join(''), 'Tarta de ocho categorías con leyenda'); },
      function () { return svg(t(24, 26, 'Ventas por categoría, %', 't-ttl') + hbars(CATS.map(function (c) { return [c.n, c.v]; }), 110, 36, 24.5, 240, 24, 0, function (v) { return v + ' %'; }), 'Barras ordenadas: Moda 24 %, Hogar 18 %, Electrónica 15 %…'); }],
    ['02', 'Eje truncado → base 0', 'Cuando la barra representa magnitud por longitud, la base 0 ayuda a evitar exageraciones visuales.',
      function () { var V = [[2023, 96], [2024, 98], [2025, 101]]; return svg(t(24, 26, 'Clientes, miles · eje desde 95', 't-ttl') + V.map(function (d, i) { var h = (d[1] - 95) / 6 * 170; return r(80 + i * 100, 210 - h, 60, h, OFF[0]) + t(110 + i * 100, 204 - h, d[1], 'ink', 'middle') + t(110 + i * 100, 228, d[0], '', 'middle'); }).join('') + '<line class="ax" x1="60" x2="370" y1="210" y2="210"/>' + t(52, 214, '95', '', 'end'), 'Barras con eje truncado que exageran la diferencia'); },
      function () { var V = [[2023, 96], [2024, 98], [2025, 101]]; return svg(t(24, 26, 'Clientes, miles · base 0', 't-ttl') + V.map(function (d, i) { var h = d[1] / 101 * 170; return r(80 + i * 100, 210 - h, 60, h, i === 2 ? GR : G1) + t(110 + i * 100, 204 - h, d[1], i === 2 ? 't-grn' : 'ink', 'middle') + t(110 + i * 100, 228, d[0], '', 'middle'); }).join('') + '<line class="ax" x1="60" x2="370" y1="210" y2="210"/>' + t(52, 214, '0', '', 'end'), 'Las mismas barras con base 0: el crecimiento es modesto'); }],
    ['03', '3D → plano', 'Si la tercera dimensión no representa un dato, prefiero no introducirla.',
      function () { var V = [62, 48, 55, 40]; return svg(t(24, 26, 'Ventas por región', 't-ttl') + V.map(function (v, i) { var h = v * 2.6, x = 60 + i * 80, y = 210 - h; return '<path d="M' + x + ' ' + y + 'l16 -12h48l-16 12z" fill="#8fb0e6"/><path d="M' + (x + 48) + ' ' + y + 'l16 -12v' + h + 'l-16 12z" fill="#2f5597"/>' + r(x, y, 48, h, OFF[0]); }).join('') + '<path d="M50 210 l20 -14 h320" fill="none" stroke="#bbb"/>', 'Barras en 3D con perspectiva'); },
      function () { var V = [62, 48, 55, 40], N = ['Norte', 'Sur', 'Este', 'Oeste']; return svg(t(24, 26, 'Ventas por región, k€', 't-ttl') + V.map(function (v, i) { var h = v * 2.6, x = 60 + i * 80; return r(x, 210 - h, 52, h, i === 0 ? GR : G1) + t(x + 26, 204 - h, v, i === 0 ? 't-grn' : 'ink', 'middle') + t(x + 26, 228, N[i], '', 'middle'); }).join('') + '<line class="ax" x1="50" x2="380" y1="210" y2="210"/>', 'Las mismas barras en plano, con etiquetas'); }],
    ['04', 'Líneas espagueti → una protagonista', 'No necesito seis protagonistas.',
      function () { return svg(t(24, 26, 'Ventas por canal', 't-ttl') + lines(SP, OFF, 30, 320, 40, 210, 36) + SPN.map(function (n, i) { return r(330, 50 + i * 20, 9, 9, OFF[i]) + t(344, 58 + i * 20, n); }).join(''), 'Seis líneas de colores cruzadas'); },
      function () { return svg(t(24, 26, 'App ya es el canal que más crece', 't-ttl') + lines(SP.filter(function (s, i) { return i !== 4; }), [G2], 30, 320, 40, 210, 36) + lines([SP[4]], [GR], 30, 320, 40, 210, 36, [3]) + t(328, 210 - 31 / 36 * 170 + 4, 'App', 't-grn'), 'Cinco líneas grises y una destacada: App'); }],
    ['04B', 'Líneas espagueti → pequeños múltiplos', 'A veces separar las series hace que compararlas sea más fácil que superponerlas.',
      function () { return svg(t(24, 26, 'Ventas por canal', 't-ttl') + lines(SP, OFF, 30, 320, 40, 210, 36) + SPN.map(function (n, i) { return r(330, 50 + i * 20, 9, 9, OFF[i]) + t(344, 58 + i * 20, n); }).join(''), 'Seis líneas de colores cruzadas'); },
      function () { return svg(SP.map(function (s, i) { var cx = 20 + (i % 3) * 126, cy = 20 + Math.floor(i / 3) * 110; return lines(SP.filter(function (x, j) { return j !== i; }), [G2], cx, cx + 110, cy + 20, cy + 90, 36, [1]) + lines([s], [i === 4 ? GR : INK], cx, cx + 110, cy + 20, cy + 90, 36, [2]) + t(cx, cy + 10, SPN[i], i === 4 ? 't-grn' : 'ink'); }).join(''), 'Seis paneles pequeños, uno por canal'); }],
    ['05', 'Doble eje → base común', 'Cuando la comparación importa, una referencia común puede ser más clara que dos escalas independientes.',
      function () { var A = [4.1, 4.2, 4.3, 4.5, 4.6, 4.8], B = [120, 150, 190, 240, 300, 360]; return svg(t(24, 26, 'Ventas (M€) y visitas web (miles)', 't-ttl') + pl(A.map(function (v, i) { return [50 + i * 60, 210 - (v - 4) / 1 * 170]; }), OFF[0], 2.5) + pl(B.map(function (v, i) { return [50 + i * 60, 210 - (v - 100) / 280 * 170]; }), OFF[1], 2.5) + t(40, 44, '5,0', '', 'end') + t(40, 214, '4,0', '', 'end') + t(360, 44, '380', '') + t(360, 214, '100', ''), 'Dos líneas con escalas distintas que parecen cruzarse'); },
      function () { var A = [4.1, 4.2, 4.3, 4.5, 4.6, 4.8], B = [120, 150, 190, 240, 300, 360]; function ix(a) { return a.map(function (v) { return v / a[0] * 100; }); } var a = ix(A), b = ix(B); return svg(t(24, 26, 'Índice, enero = 100', 't-ttl') + '<line class="gr" x1="50" x2="350" y1="' + (210 - (100 - 90) / 230 * 170) + '" y2="' + (210 - (100 - 90) / 230 * 170) + '"/>' + pl(a.map(function (v, i) { return [50 + i * 60, 210 - (v - 90) / 230 * 170]; }), G1, 2.5) + pl(b.map(function (v, i) { return [50 + i * 60, 210 - (v - 90) / 230 * 170]; }), GR, 3) + t(356, 210 - (b[5] - 90) / 230 * 170 + 4, 'Visitas ×3', 't-grn') + t(356, 210 - (a[5] - 90) / 230 * 170 + 4, 'Ventas +17 %', 'ink'), 'Ambas series indexadas a 100: las visitas se triplican, las ventas suben un 17 %'); }],
    ['06', 'Leyenda → etiqueta directa', 'La etiqueta vive donde ocurre la lectura.',
      function () { return svg(t(24, 26, 'Ventas por canal', 't-ttl') + lines(SP.slice(0, 3), OFF, 30, 360, 50, 190, 36) + ['Online', 'Tiendas', 'Marketplace'].map(function (n, i) { return r(40 + i * 110, 216, 9, 9, OFF[i]) + t(54 + i * 110, 224, n); }).join(''), 'Tres líneas con la leyenda debajo'); },
      function () { return svg(t(24, 26, 'Ventas por canal', 't-ttl') + lines(SP.slice(0, 3), [INK, G1, G1], 30, 300, 50, 190, 36, [2.5, 2, 2]) + t(306, 190 - 35 / 36 * 140 + 4, 'Online', 'ink') + t(306, 121, 'Tiendas') + t(306, 97, 'Marketplace'), 'Tres líneas con la etiqueta al final de cada una'); }],
    ['07', 'Arcoíris → gris + énfasis', 'El color recupera significado cuando deja de estar en todas partes.',
      function () { var V = [38, 34, 31, 29, 25, 22, 18, 15], RB = ['#e6194b', '#f58231', '#ffe119', '#bfef45', '#3cb44b', '#42d4f4', '#4363d8', '#911eb4']; return svg(t(24, 26, 'Margen por familia, %', 't-ttl') + V.map(function (v, i) { var h = v * 4.5; return r(36 + i * 44, 210 - h, 32, h, RB[i]); }).join(''), 'Ocho barras de colores del arcoíris'); },
      function () { var V = [38, 34, 31, 29, 25, 22, 18, 15]; return svg(t(24, 26, 'Solo Hogar mejora su margen este trimestre', 't-ttl') + V.map(function (v, i) { var h = v * 4.5; return r(36 + i * 44, 210 - h, 32, h, i === 3 ? GR : G1) + (i === 3 ? t(52 + i * 44, 202 - h, v + ' %', 't-grn', 'middle') : ''); }).join(''), 'Ocho barras grises y una destacada'); }],
    ['08', 'Tabla densa → barras de datos', 'La cifra mantiene la precisión. La forma ayuda a detectar el patrón.',
      function () { var D = [['Madrid', '412.300', '8,2 %'], ['Barcelona', '388.120', '6,9 %'], ['Valencia', '201.440', '4,1 %'], ['Sevilla', '176.900', '12,4 %'], ['Bilbao', '142.310', '3,3 %'], ['Málaga', '131.050', '9,8 %']]; return svg(t(24, 26, 'Tienda', 't-ttl') + t(230, 26, 'Ventas €', 't-ttl', 'end') + t(330, 26, 'Var.', 't-ttl', 'end') + D.map(function (d, i) { var y = 56 + i * 30; return '<line class="gr" x1="20" x2="380" y1="' + (y + 10) + '" y2="' + (y + 10) + '"/>' + t(24, y, d[0], 'ink') + t(230, y, d[1], '', 'end') + t(330, y, d[2], '', 'end'); }).join(''), 'Tabla con seis filas de cifras'); },
      function () { var D = [['Madrid', '412.300', 8.2], ['Barcelona', '388.120', 6.9], ['Valencia', '201.440', 4.1], ['Sevilla', '176.900', 12.4], ['Bilbao', '142.310', 3.3], ['Málaga', '131.050', 9.8]]; return svg(t(24, 26, 'Tienda', 't-ttl') + t(210, 26, 'Ventas €', 't-ttl', 'end') + t(240, 26, 'Var.', 't-ttl') + D.map(function (d, i) { var y = 56 + i * 30, w = d[2] / 12.4 * 100; return '<line class="gr" x1="20" x2="380" y1="' + (y + 10) + '" y2="' + (y + 10) + '"/>' + t(24, y, d[0], 'ink') + t(210, y, d[1], '', 'end') + r(240, y - 10, w, 12, i === 3 ? GR : G1) + t(246 + w, y, fmtEs(d[2], 1) + ' %', i === 3 ? 't-grn' : ''); }).join(''), 'La misma tabla con barras en la columna de variación; Sevilla destaca'); }],
    ['09', 'KPI suelto → KPI con contexto', 'El número deja de estar huérfano.',
      function () { return svg(t(200, 60, 'Clientes satisfechos', 'ink', 'middle', 14) + '<text x="200" y="150" text-anchor="middle" style="font-family:Newsreader,serif;font-size:84px;fill:#111">84 %</text>', 'KPI de 84 % sin contexto'); },
      function () { var S = [71, 73, 72, 75, 74, 77, 79, 84]; return svg(t(40, 60, 'Clientes satisfechos', 'ink', '', 14) + '<text x="40" y="140" style="font-family:Newsreader,serif;font-size:72px;fill:#111">84 %</text>' + t(40, 172, '+9 pp vs. Q4', 't-grn', '', 15) + t(40, 194, 'objetivo: 80 %', '', '', 12) + pl(S.map(function (v, i) { return [250 + i * 17, 170 - (v - 68) * 5.5]; }), G1, 2) + '<circle cx="' + (250 + 7 * 17) + '" cy="' + (170 - 16 * 5.5) + '" r="4.5" fill="' + GR + '"/>' + '<line x1="245" x2="375" y1="' + (170 - 12 * 5.5) + '" y2="' + (170 - 12 * 5.5) + '" stroke="#999" stroke-dasharray="3 3"/>', 'KPI de 84 % con comparación, objetivo y evolución'); }],
    ['10', 'Orden alfabético → orden por valor', 'Cuando la pregunta es “¿quién tiene más?”, el orden forma parte de la respuesta.',
      function () { var D = [['Almería', 18], ['Bilbao', 31], ['Cádiz', 12], ['Girona', 22], ['León', 9], ['Murcia', 27], ['Toledo', 15]]; return svg(t(24, 26, 'Pedidos por ciudad, miles', 't-ttl') + hbars(D, 90, 34, 28, 250, 31, -1), 'Barras en orden alfabético'); },
      function () { var D = [['Bilbao', 31], ['Murcia', 27], ['Girona', 22], ['Almería', 18], ['Toledo', 15], ['Cádiz', 12], ['León', 9]]; return svg(t(24, 26, 'Pedidos por ciudad, miles', 't-ttl') + hbars(D, 90, 34, 28, 250, 31, 0), 'Barras ordenadas de mayor a menor; Bilbao primero'); }]
  ];
  var gal = $('#gal');
  if (gal) {
    gal.innerHTML = CASES.map(function (c, i) {
      return '<article class="gcase"><div class="ba" style="--p:50%"><div class="ba-l ba-before">' + c[3]() + '</div><div class="ba-l ba-after">' + c[4]() + '</div><div class="ba-line"></div><span class="ba-tag l">Antes</span><span class="ba-tag r">Después</span>' +
        '<input type="range" min="0" max="100" value="50" aria-label="Comparar antes y después: ' + c[1] + '"></div><h3><span class="gn">' + c[0] + '</span>' + c[1] + '</h3><p>' + c[2] + '</p></article>';
    }).join('');
    $$('.ba', gal).forEach(function (b) {
      var inp = $('input', b);
      inp.addEventListener('input', function () { b.style.setProperty('--p', inp.value + '%'); });
    });
  }

  var ILL = [
    ['Base 0', 'Madrid y Barcelona venden casi lo mismo. El eje truncado dice otra cosa.',
      function () { return '<svg class="cv st-a" viewBox="0 0 320 200">' + r(70, 40, 70, 140, OFF[0]) + r(180, 133, 70, 47, OFF[1]) + t(105, 34, '102', 'ink', 'middle') + t(215, 127, '98', 'ink', 'middle') + t(105, 196, 'Madrid', '', 'middle') + t(215, 196, 'Barcelona', '', 'middle') + t(40, 184, '96', '', 'end') + '<line class="ax" x1="46" x2="300" y1="180" y2="180"/></svg>'; },
      function () { return '<svg class="cv st-b" viewBox="0 0 320 200">' + r(70, 40, 70, 140, G1) + r(180, 45.5, 70, 134.5, G1) + t(105, 34, '102', 'ink', 'middle') + t(215, 40, '98', 'ink', 'middle') + t(105, 196, 'Madrid', '', 'middle') + t(215, 196, 'Barcelona', '', 'middle') + t(40, 184, '0', '', 'end') + '<line class="ax" x1="46" x2="300" y1="180" y2="180"/></svg>'; }],
    ['Doble eje', 'Con dos escalas, el cruce de las líneas lo decide quien elige los ejes.',
      function () { return '<svg class="cv st-a" viewBox="0 0 320 200">' + pl([[30, 160], [90, 140], [150, 110], [210, 90], [270, 60]], OFF[0], 2.5) + pl([[30, 40], [90, 70], [150, 105], [210, 130], [270, 150]], OFF[1], 2.5) + t(26, 44, '800', '', 'end') + t(294, 44, '12', '') + t(26, 164, '600', '', 'end') + t(294, 164, '9', '') + '</svg>'; },
      function () { return '<svg class="cv st-b" viewBox="0 0 320 200">' + t(20, 20, 'Índice, inicio = 100') + pl([[30, 120], [90, 110], [150, 96], [210, 86], [270, 72]], GR, 2.5) + pl([[30, 120], [90, 126], [150, 132], [210, 136], [270, 140]], G1, 2.5) + '<line class="gr" x1="30" x2="290" y1="120" y2="120"/>' + t(276, 70, '+33', 't-grn') + t(276, 144, '−14', '') + '</svg>'; }],
    ['Tarta → barras', 'Cinco porciones parecidas. Los ángulos no dejan ordenarlas.',
      function () { return '<svg class="cv st-a" viewBox="0 0 320 200">' + pie([22, 21, 20, 19, 18], 160, 100, 80, OFF) + '</svg>'; },
      function () { return '<svg class="cv st-b" viewBox="0 0 320 200">' + hbars([['A', 22], ['B', 21], ['C', 20], ['D', 19], ['E', 18]], 50, 12, 35, 220, 22, 0, function (v) { return v + ' %'; }) + '</svg>'; }],
    ['Burbujas → longitud', 'La burbuja B representa el doble que la A. ¿Lo parece?',
      function () { return '<svg class="cv st-a" viewBox="0 0 320 200"><circle cx="100" cy="110" r="36" fill="' + OFF[0] + '"/><circle cx="215" cy="110" r="51" fill="' + OFF[1] + '"/>' + t(100, 190, 'A · 20', '', 'middle') + t(215, 190, 'B · 40', '', 'middle') + '</svg>'; },
      function () { return '<svg class="cv st-b" viewBox="0 0 320 200">' + hbars([['B', 40], ['A', 20]], 50, 50, 50, 220, 40, 0) + '</svg>'; }],
    ['Apiladas → comparación directa', '¿Crece el segmento del medio? Sin base común, cuesta decirlo.',
      function () { var D = [[40, 30, 20], [35, 34, 28], [45, 29, 22], [38, 36, 30]]; return '<svg class="cv st-a" viewBox="0 0 320 200">' + D.map(function (d, i) { var y = 180, x = 40 + i * 68, s = ''; d.forEach(function (v, j) { var h = v * 1.6; y -= h; s += r(x, y, 44, h, OFF[j], ' stroke="#fff"'); }); return s + t(x + 22, 196, '202' + (2 + i), '', 'middle'); }).join('') + '</svg>'; },
      function () { var D = [30, 34, 29, 36]; return '<svg class="cv st-b" viewBox="0 0 320 200">' + t(20, 20, 'Solo el segmento del medio') + D.map(function (v, i) { var h = v * 4, x = 40 + i * 68; return r(x, 180 - h, 44, h, i === 3 ? GR : G1) + t(x + 22, 174 - h, v, i === 3 ? 't-grn' : 'ink', 'middle') + t(x + 22, 196, '202' + (2 + i), '', 'middle'); }).join('') + '</svg>'; }]
  ];
  var il = $('#illus');
  if (il) {
    il.innerHTML = ILL.map(function (c, i) {
      return '<div class="ill"><h4>' + c[0] + '</h4><div class="ill-v" role="img" aria-label="' + c[1] + '">' + c[2]() + c[3]() + '</div><p>' + c[1] + '</p><div class="seg" role="group" aria-label="' + c[0] + '"><button type="button" aria-pressed="true" data-f="0">Engañoso</button><button type="button" aria-pressed="false" data-f="1" class="g">Honesto</button></div></div>';
    }).join('');
    $$('.ill', il).forEach(function (card) {
      var bs = $$('button', card);
      bs.forEach(function (b) { b.addEventListener('click', function () { card.classList.toggle('fixed', b.dataset.f === '1'); bs.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }); });
    });
  }

  // dashboard ejecutivo (abandono)
  var ex = $('#execSvg');
  if (ex) {
    var CH = [38, 39, 37, 40, 52, 58, 61, 62, 60, 63];
    var pts = CH.map(function (v, i) { return [20 + i * 38, 140 - (v - 30) * 3.4]; });
    ex.innerHTML = '<line class="gr" x1="20" x2="380" y1="140" y2="140"/>' + pl(pts.slice(0, 5), G1, 2.5) + pl(pts.slice(4), GR, 3) +
      '<circle cx="' + pts[4][0] + '" cy="' + pts[4][1] + '" r="5" fill="' + GR + '"/><line x1="' + (pts[4][0] + 5) + '" x2="' + (pts[4][0] + 26) + '" y1="' + (pts[4][1] + 4) + '" y2="' + (pts[4][1] + 26) + '" stroke="#111"/>' +
      t(pts[4][0] + 30, pts[4][1] + 32, 'Mayo: cambia el proceso de alta', 'ink') + t(20, 12, '% de bajas antes del día 90') + t(380, pts[9][1] - 8, '63 %', 't-grn', 'end');
  }

  // email del CTA final (misma construcción que el nav)
  var mb = $('#dsMailBtn'), nb = document.getElementById('navEmailBtn');
  if (mb && nb) {
    var syncMail = function () { if (nb.href && nb.getAttribute('href') !== '#') mb.href = nb.href; };
    syncMail(); new MutationObserver(syncMail).observe(nb, { attributes: true, attributeFilter: ['href'] });
  }

  buildTask(); buildGuess(); buildDyn();

  /* scroll cue: recede as soon as the reader actually starts moving, not only once it scrolls off-screen */
  (function () {
    var cue = document.querySelector('.scroll-cue'); if (!cue) return;
    var shown = true;
    function onScroll() {
      var past = window.scrollY > 28;
      if (past === !shown) return;
      cue.classList.toggle('sc-hide', past);
      shown = !past;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  })();
})();
