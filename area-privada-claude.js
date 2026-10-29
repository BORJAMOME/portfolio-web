/* ═══════════════════════════════════════════════
   area-privada-claude.js: «Manual de Claude» dentro del área privada (#/claude, desde Portfolio)
   ─────────────────────────────────────────────────
   Manual visual que crece con cada curso de Claude Academy. Solo el MOTOR es público (claude-manual/);
   el contenido (bloques, fichas, cursos, glosario, registro) vive en la tabla public.cm_docs de Supabase
   (supabase/claude-manual.sql, RLS) y se lee tras iniciar sesión. Se publica con tools/claude-academy/publish.mjs.
   · Rutas (arg del módulo): «» inicio · temas · mapa · mapa/<id> · glosario · tema/<id>.
   · Se pinta dentro de un Shadow DOM: css/claude-manual.css (sistema de diseño de los manuales) no afecta al
     área privada ni al revés.
   · CSP estricta del área privada: sin atributos style ni scripts en línea (el estilo dinámico va por CSSOM).
   · Todo el HTML del contenido pasa por clean() (lista blanca): lo que llega de la base nunca se pinta sin sanear.
   · El progreso del lector (entendido / en estudio, respuestas del quiz) y el tema claro/oscuro: localStorage (bm_cm_*).
   Se carga la primera vez que se abre la pestaña (area-privada.js); su archivo y los módulos ES de claude-manual/ están en
   <link rel="prefetch" data-ap-module/-asset="…"> de area-privada.html (así version-assets les pone el ?v=).
   ═══════════════════════════════════════════════ */
window.APClaude = (function () {
  'use strict';

  var P = 'bm_cm_', TTL = 5 * 60 * 1000;
  var LVL = { 1: 'Básico', 2: 'Intermedio', 3: 'Avanzado' };
  var ctx = null, cache = null, A = null, G = null, D = null;      // A: módulos ES · D: datos · G: grafo
  var host = null, root = null, lastArg = null;
  var PROG = {}, QUIZ = {};
  var temasState = { q: '', b: '', l: '', c: '' };
  var tocObs = null, qk = null, qkSel = 0, qkRes = [], qkPrev = null, listening = false;

  /* ── utilidades ── */
  function $(s, r) { return (r || root).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function plain(h) { return String(h == null ? '' : h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  function R(path) { return '#/claude' + (path ? '/' + path : ''); }
  function lsGet(k, d) { try { var v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: el manual funciona igual, sin recordar */ } }
  function fmtDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); if (!m) return esc(d || '');
    return +m[3] + ' de ' + ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+m[2] - 1] + ' de ' + m[1];
  }
  function assetUrl(name, fallback) {
    var l = document.querySelector('link[data-ap-asset="' + name + '"]');
    return new URL(l ? l.getAttribute('href') : fallback, document.baseURI).href;
  }
  function setProg(id, v) { if ((PROG[id] || 0) >= v && v !== 0) return; PROG[id] = v; lsSet('prog', PROG); }
  function setWidths(el) { $$('[data-w]', el).forEach(function (n) { n.style.width = n.getAttribute('data-w') + '%'; }); }   // CSSOM: la CSP no admite atributos de estilo

  /* ── saneado del HTML del contenido: lista blanca de etiquetas y de atributos ── */
  var ALLOW = { b: 1, strong: 1, i: 1, em: 1, u: 1, code: 1, kbd: 1, p: 1, br: 1, ul: 1, ol: 1, li: 1, sub: 1, sup: 1, blockquote: 1, pre: 1, h4: 1, table: 1, thead: 1, tbody: 1, tr: 1, th: 1, td: 1, a: 1 };
  var DROP = { script: 1, style: 1, iframe: 1, object: 1, embed: 1, svg: 1, math: 1, template: 1, noscript: 1, link: 1, meta: 1, form: 1, input: 1, button: 1, textarea: 1, select: 1, img: 1, video: 1, audio: 1 };
  function copyClean(src, dst) {
    Array.prototype.forEach.call(src.childNodes, function (n) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      if (DROP[tag]) return;
      if (!ALLOW[tag]) { copyClean(n, dst); return; }          // etiqueta desconocida: se conserva solo su texto
      var e = document.createElement(tag);
      if (tag === 'a') {
        var href = n.getAttribute('href') || '';
        if (/^https:\/\//i.test(href)) { e.setAttribute('href', href); e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener noreferrer'); }
        else if (/^#\/claude(\/|$)/.test(href)) e.setAttribute('href', href);
      }
      dst.appendChild(e); copyClean(n, e);
    });
  }
  function clean(html) {
    if (html == null) return '';
    var doc = new DOMParser().parseFromString('<!doctype html><body>' + String(html), 'text/html');
    var out = document.createElement('div'); copyClean(doc.body, out); return out.innerHTML;
  }

  /* ── datos ── */
  function lv(n) { return '<span class="lv" title="Nivel ' + (LVL[n] || '') + '">' + [1, 2, 3].map(function (i) { return '<i class="' + (i <= n ? 'on' : '') + '"></i>'; }).join('') + '</span>'; }
  function dot(id) { var p = PROG[id] || 0; return '<span class="td ' + (p ? 's' + p : '') + '" title="' + (p === 2 ? 'Lo entiendo' : p === 1 ? 'En estudio' : 'Pendiente') + '"></span>'; }
  function blockOf(t) { return G.block[t.b] || { id: t.b, n: '?', t: 'Sin bloque', s: '' }; }
  function topicLink(id) { return G.topic[id] ? '<a href="' + R('tema/' + id) + '">' + esc(G.topic[id].t) + '</a>' : esc(id); }

  function load() {
    if (cache && Date.now() - cache.at < TTL) { use(cache); return Promise.resolve(); }
    return Promise.all([
      import(assetUrl('cm-config', './claude-manual/config.js')), import(assetUrl('cm-grafo', './claude-manual/grafo.js')),
      import(assetUrl('cm-mapa', './claude-manual/mapa.js')), import(assetUrl('cm-viz', './claude-manual/viz.js')),
      ctx.api('/rest/v1/cm_docs?select=kind,pos,data&order=pos.asc&limit=5000')
    ]).then(function (r) {
      var rows = (r[4] || []).filter(function (x) { return x && x.data && typeof x.data === 'object'; });
      function of(kind) { return rows.filter(function (x) { return x.kind === kind; }).map(function (x) { return x.data; }); }
      /* Los ids acaban en atributos y en rutas: solo se admiten los de formato «slug» (los que valida tools/claude-academy/validate.mjs) */
      var OK = /^[a-z0-9]+(-[a-z0-9]+)*$/;
      var data = { BLOCKS: of('block').filter(function (b) { return OK.test(String(b.id)); }), TOPICS: of('topic').filter(function (t) { return OK.test(String(t.id)) && OK.test(String(t.b)); }),
        COURSES: of('course').filter(function (c) { return OK.test(String(c.id)); }), GLOSS: of('gloss').filter(function (g) { return g.k && OK.test(String(g.t)); }), LOG: of('log') };
      cache = { at: Date.now(), mods: { CFG: r[0], GR: r[1], MP: r[2], VZ: r[3] }, data: data, rows: rows.length };
      cache.G = r[1].build({ TOPICS: data.TOPICS, BLOCKS: data.BLOCKS, COURSES: data.COURSES, RELTYPES: r[0].RELTYPES });
      cache.IDX = buildIndex(cache);
      use(cache);
    });
  }
  function use(c) { A = c.mods; D = c.data; G = c.G; }

  /* ── búsqueda: sin tildes ni mayúsculas; deben aparecer todas las palabras, en cualquier orden ── */
  function tokens(q) { return norm(q).split(/\s+/).filter(Boolean); }
  function hit(text, toks) { return toks.every(function (w) { return text.indexOf(w) > -1; }); }
  function topicText(t) {
    return t._tx || (t._tx = norm(plain([t.t, t.q, t.one, t.key, (t.rec || []).join(' '), (t.kw || []).join(' '), (t.tags || []).join(' ')].join(' '))));
  }
  function matches(t, q) { return hit(topicText(t), tokens(q)); }
  var KORD = { 'Tema': 0, 'Curso': 1, 'Glosario': 2, 'Sección': 3 };
  function buildIndex(c) {
    var idx = [];
    c.data.TOPICS.forEach(function (t) { idx.push({ k: 'Tema', n: plain(t.t), d: t.q, h: R('tema/' + t.id), s: topicText(t) }); });
    c.data.COURSES.forEach(function (x) { idx.push({ k: 'Curso', n: plain(x.t), d: x.u || '', h: R('mapa/' + x.id), s: norm(plain(x.t)) }); });
    c.data.GLOSS.forEach(function (g) { idx.push({ k: 'Glosario', n: plain(g.k), d: g.d, h: R('tema/' + g.t), s: norm(plain(g.k + ' ' + g.d)) }); });
    [['Inicio', ''], ['Todos los temas', 'temas'], ['Mapa mental', 'mapa'], ['Glosario', 'glosario']].forEach(function (v) { idx.push({ k: 'Sección', n: v[0], d: 'Ir a la sección', h: R(v[1]), s: norm(v[0]) }); });
    return idx;
  }
  /* Resultados ordenados: el título contiene la consulta → contiene todas las palabras → el resto */
  function search(q) {
    var toks = tokens(q), nq = norm(q.trim());
    if (!toks.length) return [];
    function rank(x) { var n = norm(x.n); return n.indexOf(nq) > -1 ? 0 : hit(n, toks) ? 1 : 2; }
    return cache.IDX.filter(function (x) { return hit(x.s, toks) || hit(norm(x.n), toks); }).map(function (x, i) { return { x: x, r: rank(x), i: i }; })
      .sort(function (a, b) { return a.r - b.r || KORD[a.x.k] - KORD[b.x.k] || a.i - b.i; }).map(function (o) { return o.x; });
  }

  /* ── resaltado de código genérico (comentarios, cadenas, números) ── */
  function hl(src) {
    var out = '', i = 0, s = String(src), m;
    while (i < s.length) {
      var r = s.slice(i);
      if ((m = r.match(/^(--|\/\/|#)[^\n]*/))) { out += '<span class="c">' + esc(m[0]) + '</span>'; i += m[0].length; continue; }
      if ((m = r.match(/^\/\*[\s\S]*?\*\//))) { out += '<span class="c">' + esc(m[0]) + '</span>'; i += m[0].length; continue; }
      if ((m = r.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/))) { out += '<span class="s">' + esc(m[0]) + '</span>'; i += m[0].length; continue; }
      if ((m = r.match(/^\d+(?:[.,]\d+)?/)) && !/[\w]/.test(s[i - 1] || '')) { out += '<span class="n">' + m[0] + '</span>'; i += m[0].length; continue; }
      if ((m = r.match(/^[A-Za-z_][\w.]*/))) { out += esc(m[0]); i += m[0].length; continue; }
      out += esc(s[i]); i++;
    }
    return out;
  }

  /* ── fuentes y verificación ── */
  function srcHTML(s) {
    var K = A.CFG.SRCKINDS;
    if (typeof s === 'string') return '<li>' + clean(s) + '</li>';
    var c = s.c && G.course[s.c], link = /^https:\/\//.test(s.u || '') ? '<a href="' + esc(s.u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.t) + ' ↗</a>' : esc(s.t);
    var meta = [];
    if (c) meta.push('Curso: ' + esc(c.t));
    if (s.d) meta.push('Consultada el ' + fmtDate(s.d));
    return '<li class="ca-src"><span class="chip ' + (s.k === 'oficial' ? 'acc' : '') + '">' + esc(K[s.k] || 'Fuente') + '</span> ' + link +
      (s.rev ? ' <span class="chip ex">Revisar enlace</span>' : '') + (meta.length ? '<span class="ca-sm">' + meta.join(' · ') + '</span>' : '') + '</li>';
  }
  function srcTitle(s) { return typeof s === 'string' ? plain(s) : s.t; }
  function verChip(t) {
    var V = A.CFG.VERSTATES, v = t.ver || { e: 'pendiente' };
    return '<span class="chip ' + (v.e === 'verificado' ? 'ok' : v.e === 'interno' ? 'acc' : 'ex') + '" title="' + esc(v.n || '') + '">' + esc(V[v.e] || V.pendiente) + '</span>';
  }

  /* ═══════════ Entrada del módulo ═══════════ */
  function render(c) {
    ctx = c;
    PROG = lsGet('prog', {}); QUIZ = lsGet('quiz', {});
    return load().then(function () { return D.TOPICS.length ? paint : paintEmpty; }, function (err) {
      if (err && err.auth) throw err;
      if (err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01')) return paintSetup;
      throw err;
    });
  }
  function paintMsg(title, text) {
    ctx.view.textContent = '';
    ctx.view.appendChild(ctx.h('div', { class: 'ap-empty' }, [ctx.h('p', { class: 'ap-empty-title', text: title }), ctx.h('p', { text: text })]));
  }
  function paintSetup() { paintMsg('El manual aún no está creado', 'Ejecuta supabase/claude-manual.sql en el SQL Editor de Supabase y publica el contenido con tools/claude-academy/publish.mjs (ver claude-manual/README.md).'); }
  function paintEmpty() { paintMsg('El manual todavía no tiene contenido', 'La tabla existe pero está vacía. Publica el contenido con tools/claude-academy/publish.mjs (ver claude-manual/README.md).'); }

  var SHELL = '<a class="skip-link" href="#" data-skip>Saltar al contenido</a>' +
    '<header class="appbar"><div class="appbar-in"><a class="brand" href="' + R('') + '" aria-label="Manual de Claude, ir al inicio">Manual de Claude</a>' +
    '<nav class="topnav" aria-label="Secciones del manual"><a class="tnb" href="' + R('') + '" data-v="home">Inicio</a><a class="tnb" href="' + R('temas') + '" data-v="temas">Temas</a><a class="tnb" href="' + R('mapa') + '" data-v="mapa">Mapa mental</a><a class="tnb" href="' + R('glosario') + '" data-v="glosario">Glosario</a></nav>' +
    '<div class="appbar-r"><a class="iconbtn" href="#/portfolio">Portfolio</a>' +
    '<button class="iconbtn" id="qkBtn" type="button" aria-label="Buscar Ctrl K, un tema o un término"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><span class="qk-l">Buscar</span> <kbd>Ctrl K</kbd></button>' +
    '<button class="iconbtn" id="themeBtn" type="button" aria-label="Cambiar entre tema claro y oscuro">Oscuro</button></div></div></header>' +
    '<main id="main" tabindex="-1"><section id="view"></section></main><article id="detail" class="hidden" tabindex="-1"></article>' +
    '<footer class="foot"><span>Manual de Claude · Borja Mora Méndez · edición octubre de 2026</span><span>Manual privado: solo visible con tu sesión</span></footer>';

  function paint() {
    var M = A.CFG.MANUAL;
    ctx.view.textContent = '';
    host = document.createElement('div'); host.className = 'cm-host'; host.hidden = true;
    root = host.attachShadow({ mode: 'open' });
    var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = assetUrl('cm-css', './css/claude-manual.css');
    var show = function () { host.hidden = false; };
    link.addEventListener('load', show); link.addEventListener('error', show);
    root.appendChild(link);
    var wrap = document.createElement('div'); wrap.className = 'wrap'; wrap.innerHTML = SHELL; root.appendChild(wrap);
    var t = lsGet('theme', null); if (t) host.setAttribute('data-theme', t);
    ctx.view.appendChild(host);
    syncThemeBtn();
    $('#themeBtn').addEventListener('click', function () { var n = isDark() ? 'light' : 'dark'; host.setAttribute('data-theme', n); lsSet('theme', n); syncThemeBtn(); });
    $('#qkBtn').addEventListener('click', openQk);
    $('[data-skip]').addEventListener('click', function (e) { e.preventDefault(); $('#main').focus(); });
    if (!listening) { listening = true; document.addEventListener('keydown', onKey); }
    var parts = (ctx.arg || '').split('/'), view = parts[0] || 'home', isTopic = view === 'tema';
    host.classList.toggle('detail-open', isTopic);
    $('#detail').classList.toggle('hidden', !isTopic);
    $$('.tnb').forEach(function (a) { var on = a.dataset.v === (isTopic ? 'temas' : view); a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var v = $('#view');
    if (isTopic) renderTopic(parts[1]);
    else if (view === 'temas') renderTemas(v);
    else if (view === 'mapa') renderMapa(v, parts[1]);
    else if (view === 'glosario') renderGlosario(v);
    else renderHome(v);
    setWidths(root);
    if (ctx.arg !== lastArg) { window.scrollTo(0, 0); lastArg = ctx.arg; }
    void M;
  }
  function isDark() { var t = host.getAttribute('data-theme'); return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function syncThemeBtn() { $('#themeBtn').textContent = isDark() ? 'Claro' : 'Oscuro'; }

  /* ══ INICIO ══════════════════════════════ */
  function blocksHTML() {
    return '<div class="blocks">' + D.BLOCKS.map(function (b) {
      var ts = D.TOPICS.filter(function (t) { return t.b === b.id; }), done = ts.filter(function (t) { return PROG[t.id] === 2; }).length;
      return '<div class="bcard"><div class="bh"><span class="bn">' + esc(b.n) + '</span><div><h3>' + esc(b.t) + '</h3><p class="bs">' + clean(b.s) + '</p></div></div><ol class="bl">' +
        ts.map(function (t, i) { return '<li><a class="tlink" href="' + R('tema/' + t.id) + '"><span class="ti">' + esc(b.n) + '.' + (i + 1) + '</span><span class="tt">' + esc(t.t) + '</span>' + dot(t.id) + '</a></li>'; }).join('') +
        '</ol><div class="bp"><span>' + done + ' de ' + ts.length + ' entendidos</span><span class="bar"><i data-w="' + (ts.length ? Math.round(done / ts.length * 100) : 0) + '"></i></span></div></div>';
    }).join('') + '</div>';
  }
  function coursesHTML() {
    var K = A.CFG.SRCKINDS;
    if (!D.COURSES.length) return '<div class="ca-empty"><b>Todavía no hay ningún curso incorporado.</b><p>De momento el manual solo contiene su propia guía. Cuando se incorpore el primer curso aparecerá aquí con la fecha en que se consultó y los temas que aporta, y cada tema quedará enlazado a su lección de origen.</p></div>';
    return '<div class="cards">' + D.COURSES.map(function (c) {
      var n = (G.courseTopics[c.id] || []).length;
      return '<a class="card" href="' + R('mapa/' + c.id) + '"><div class="cb">' + esc(K[c.k] || 'Curso') + '</div><h3>' + esc(c.t) + '</h3><p class="cq">' + (c.d ? 'Consultado el ' + fmtDate(c.d) + '. ' : '') + n + (n === 1 ? ' tema' : ' temas') + '.</p></a>';
    }).join('') + '</div>';
  }
  function logHTML() {
    return '<details class="ca-log"><summary>Registro de cambios (' + D.LOG.length + ')</summary>' + D.LOG.slice().sort(function (a, b) { return String(b.d).localeCompare(String(a.d)); }).map(function (l) {
      function ids(a) { return a.map(topicLink).join(', '); }
      return '<div class="ca-lg-e"><div class="ca-lg-d">' + fmtDate(l.d) + '</div><div><b>' + clean(l.r) + '</b>' +
        (l.nuevo && l.nuevo.length ? '<p>Temas nuevos: ' + ids(l.nuevo) + '.</p>' : '') + (l.mod && l.mod.length ? '<p>Temas modificados: ' + ids(l.mod) + '.</p>' : '') +
        (l.mapa ? '<p>Mapa: ' + clean(l.mapa) + '</p>' : '') + (l.pend && l.pend.length ? '<p>Pendiente: ' + l.pend.map(clean).join(' ') + '</p>' : '') + '</div></div>';
    }).join('') + '</details>';
  }
  function renderHome(v) {
    var M = A.CFG.MANUAL, T = D.TOPICS;
    var done = T.filter(function (t) { return PROG[t.id] === 2; }).length;
    var next = T.filter(function (t) { return PROG[t.id] !== 2; })[0] || T[0];
    var started = T.some(function (t) { return PROG[t.id]; });
    var autos = { 'Temas': T.length, 'Bloques': D.BLOCKS.length, 'Cursos': D.COURSES.length, 'Relaciones': G.edges.length };
    v.innerHTML =
      '<div class="hero"><div><div class="eyebrow">Manual visual · edición ' + esc(M.edition) + '</div><h1>' + clean(M.heroTitle) + '</h1>' +
      '<p class="lead">' + esc(M.lead) + '</p>' +
      '<div class="hero-cta"><a class="btn solid" href="' + R('tema/' + next.id) + '">' + (started ? 'Seguir por «' : 'Empezar por «') + esc(plain(next.t)) + '» →</a><a class="btn" href="' + R('mapa') + '">Ver el mapa mental</a></div>' +
      '<div class="hero-stats">' + M.stats.map(function (s) { var n = s[1] === 'auto' ? (autos[s[0]] !== undefined ? autos[s[0]] : '') : s[1]; return '<div class="hs"><div class="n">' + n + '</div><div class="l">' + esc(s[0]) + '</div></div>'; }).join('') + '</div></div>' +
      '<div class="hero-art">' + A.MP.miniature(A.GR, G, 'Esquema del manual: ' + M.mapCenter + ', ' + D.BLOCKS.length + ' bloques y ' + T.length + ' temas', M.mapCenter) + '<div class="ha-cap"><span>' + esc(M.mapCenter) + '</span><span>' + done + '/' + T.length + ' entendidos</span></div></div></div>' +
      '<div class="sec-h"><h2>Cómo está pensado cada tema</h2><p>La misma secuencia en las ' + T.length + ' fichas, de lo intuitivo a lo técnico.</p></div>' +
      '<div class="howgrid">' + M.how.map(function (h, i) { return '<div class="how"><span class="hn">' + (i + 1) + '</span><div class="hk">' + esc(h[0]) + '</div><p>' + esc(h[1]) + '</p></div>'; }).join('') + '</div>' +
      '<div class="sec-h"><h2>Ruta de aprendizaje</h2><p>' + D.BLOCKS.length + (D.BLOCKS.length === 1 ? ' bloque' : ' bloques') + ' en orden. El punto verde marca lo que ya entiendes.</p></div>' + blocksHTML() +
      '<div class="sec-h"><h2>Cursos incorporados</h2><p>' + D.COURSES.length + '</p></div>' + coursesHTML() +
      '<div class="sec-h"><h2>De dónde sale este manual</h2></div><p class="lead cm-narrow">' + esc(M.sources) + '</p>' + logHTML();
  }

  /* ══ TEMAS (catálogo con búsqueda y filtros) ══ */
  function filterGroup(id, label, key, items) {
    return '<div class="filters" id="' + id + '" role="group" aria-label="' + label + '">' + items.map(function (it, i) { return '<button type="button" class="fb' + (it[0] === temasState[key] ? ' on' : '') + '" data-k="' + key + '" data-v="' + esc(it[0]) + '" aria-pressed="' + (it[0] === temasState[key]) + '">' + esc(it[1]) + '</button>'; }).join('') + '</div>';
  }
  function renderTemas(v) {
    var T = D.TOPICS;
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Catálogo</div><h2 class="th-title">Los ' + T.length + ' temas, de un vistazo</h2><p class="th-sub">Busca por concepto o con tus palabras, y filtra por bloque y nivel. Localiza tu problema en <b>«La pregunta que responde»</b>.</p></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar tema</span><input id="tq" type="search" placeholder="Buscar un concepto…" value="' + esc(temasState.q) + '"></label><span class="count" id="tcount" role="status"></span></div>' +
      '<div class="toolbar">' + filterGroup('tfb', 'Filtrar por bloque', 'b', [['', 'Todos']].concat(D.BLOCKS.map(function (b) { return [b.id, b.t]; }))) +
      filterGroup('tfl', 'Filtrar por nivel', 'l', [['', 'Todos los niveles']].concat([1, 2, 3].map(function (n) { return [String(n), LVL[n]]; }))) +
      (D.COURSES.length ? filterGroup('tfc', 'Filtrar por curso', 'c', [['', 'Todos los cursos']].concat(D.COURSES.map(function (c) { return [c.id, plain(c.t)]; }))) : '') + '</div><div class="cards" id="tcards"></div>';
    $('#tq').addEventListener('input', function (e) { temasState.q = e.target.value; drawCards(); });
    $$('.filters', v).forEach(function (g) {
      g.addEventListener('click', function (e) {
        var b = e.target.closest('.fb'); if (!b) return;
        $$('.fb', g).forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); temasState[b.dataset.k] = b.dataset.v; drawCards();
      });
    });
    drawCards();
  }
  function drawCards() {
    var list = D.TOPICS.filter(function (t) {
      return (!temasState.b || t.b === temasState.b) && (!temasState.l || String(t.lvl) === temasState.l) &&
        (!temasState.c || G.coursesOf(t.id).indexOf(temasState.c) > -1) && (!temasState.q.trim() || matches(t, temasState.q));
    });
    $('#tcount').textContent = list.length + (list.length === 1 ? ' tema' : ' temas');
    $('#tcards').innerHTML = list.length ? list.map(function (t) {
      var b = blockOf(t);
      return '<a class="card" href="' + R('tema/' + t.id) + '"><div class="cb">' + esc(b.n) + ' · ' + esc(b.t) + '</div><h3>' + esc(t.t) + '</h3><p class="cq">' + clean(t.q) + '</p><div class="cf">' + (t.tags || []).map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + '</div><div class="dmeta cm-foot">' + lv(t.lvl) + '<span>' + (LVL[t.lvl] || '') + '</span>' + dot(t.id) + '</div></a>';
    }).join('') : '<p class="lead">Ningún tema coincide con la búsqueda.</p>';
  }

  /* ══ MAPA MENTAL ═════════════════════════ */
  function renderMapa(v, sel) {
    A.MP.render(v, { G: G, GR: A.GR, MANUAL: A.CFG.MANUAL, sel: sel, kinds: A.CFG.SRCKINDS, lv: lv, href: R, clean: clean,
      prog: function (id) { return PROG[id] || 0; }, matches: matches,
      open: function (id) { location.hash = R('tema/' + id); },
      onSelect: function (id) { try { history.replaceState(history.state, '', R('mapa' + (id ? '/' + id : ''))); } catch (e) { /* sin historial: la selección sigue valiendo */ } } });
  }

  /* ══ GLOSARIO ═════════════════════════════ */
  function renderGlosario(v) {
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Glosario</div><h2 class="th-title">' + D.GLOSS.length + ' términos</h2><p class="th-sub">Cada término enlaza con el tema donde se explica.</p></div><div class="cards">' +
      D.GLOSS.slice().sort(function (a, b) { return String(a.k).localeCompare(String(b.k), 'es'); }).map(function (g) {
        return '<a class="card" href="' + R('tema/' + g.t) + '"><h3>' + esc(g.k) + '</h3><p class="cq">' + clean(g.d) + '</p></a>';
      }).join('') + '</div>';
  }

  /* ══ QUIZ Y VISUAL ═══════════════════════ */
  function quizInner(t) {
    return '<div class="qq">' + clean(t.quiz.q) + '</div><div class="qo" data-quiz="' + esc(t.id) + '">' + t.quiz.o.map(function (o, i) { return '<button type="button" data-o="' + i + '">' + clean(o) + '</button>'; }).join('') + '</div>';
  }
  function bindQuiz(rootEl, t, cb) {
    var qo = $('[data-quiz="' + t.id.replace(/"/g, '') + '"]', rootEl);
    qo.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-o]'); if (!b || qo.dataset.done) return;
      qo.dataset.done = '1';
      var i = +b.dataset.o, ok = i === t.quiz.a;
      $$('button', qo).forEach(function (x) { x.disabled = true; if (+x.dataset.o === t.quiz.a) x.classList.add('ok'); });
      if (!ok) b.classList.add('ko');
      QUIZ[t.id] = ok; lsSet('quiz', QUIZ);
      var w = document.createElement('div'); w.className = 'qw'; w.innerHTML = '<b>' + (ok ? 'Correcto.' : 'No es esa.') + '</b> ' + clean(t.quiz.w); qo.parentNode.insertBefore(w, qo.nextSibling);
      if (cb) cb(ok);
    });
  }
  function mountViz(id, hostEl, note) {
    hostEl.innerHTML = '<div class="viz"><div class="viz-h"><span class="vt">Visual</span><div class="viz-ctrl"></div></div><div class="viz-b"></div>' + (note ? '<div class="viz-n"><b>Qué debes notar:</b> ' + clean(note) + '</div>' : '') + '</div>';
    var f = { title: $('.vt', hostEl), ctrl: $('.viz-ctrl', hostEl), body: $('.viz-b', hostEl), env: { topics: D.TOPICS, reltypes: A.CFG.RELTYPES, search: search } };
    try { if (A.VZ.VIZ[id]) A.VZ.VIZ[id](f); else f.body.textContent = 'Visual no disponible.'; }
    catch (err) { f.body.textContent = 'No se pudo cargar el visual.'; if (window.console) console.error(err); }
  }

  /* ══ FICHA DE ESTUDIO (6 capítulos fijos) ═ */
  function labHTML(l) {
    function ul(a) { return '<ul>' + a.map(function (x) { return '<li>' + clean(x) + '</li>'; }).join('') + '</ul>'; }
    return '<div class="ca-lab"><dl class="ca-dl"><dt>Objetivo</dt><dd>' + clean(l.obj) + '</dd><dt>Antes de empezar</dt><dd>' + ul(l.antes || []) + '</dd></dl>' +
      '<ol class="pasos">' + (l.pasos || []).map(function (p) { return '<li>' + clean(p.h) + '<span class="ca-why"><i>Qué ocurre:</i> ' + clean(p.w) + '</span></li>'; }).join('') + '</ol>' +
      '<dl class="ca-dl"><dt>Resultado esperado</dt><dd>' + clean(l.res) + '</dd><dt>Cómo comprobarlo</dt><dd>' + clean(l.comprobar) + '</dd></dl>' +
      (l.errores && l.errores.length ? '<div class="conf">' + l.errores.map(function (c) { return '<div><h4>' + clean(c.t) + '</h4><p>' + clean(c.d) + '</p></div>'; }).join('') + '</div>' : '') +
      '<dl class="ca-dl">' + (l.variantes && l.variantes.length ? '<dt>Variantes</dt><dd>' + ul(l.variantes) + '</dd>' : '') + (l.sig ? '<dt>Siguiente paso</dt><dd>' + clean(l.sig) + '</dd>' : '') + '</dl></div>';
  }
  function ejerHTML(a) {
    return '<div class="ca-ej">' + a.map(function (x) { return '<details><summary><span class="chip acc">' + esc(x.n) + '</span> ' + clean(x.q) + '</summary><div class="dbody"><p><b>Solución explicada.</b> ' + clean(x.sol) + '</p></div></details>'; }).join('') + '</div>';
  }
  function fitHTML(t) {
    var gs = G.groups(t.id);
    return (gs.length ? gs.map(function (g) {
      return '<div class="ca-grp"><div class="ca-gl">' + esc(g.label) + '</div><ul>' + g.items.map(function (x) { return '<li>' + topicLink(x.id) + (x.w ? ' <span class="ca-w">' + clean(x.w) + '</span>' : '') + '</li>'; }).join('') + '</ul></div>';
    }).join('') : '<p class="dbody">Este tema todavía no tiene relaciones declaradas con otros.</p>') +
      '<p><a class="btn" href="' + R('mapa/' + t.id) + '">Ver en el mapa mental</a></p>';
  }
  function renderTopic(id) {
    var t = G.topic[id];
    if (!t) { location.hash = R('temas'); return; }
    if (!PROG[t.id]) setProg(t.id, 1);
    var b = blockOf(t), bt = D.TOPICS.filter(function (x) { return x.b === t.b; });
    var prev = D.TOPICS[t.i - 1], next = D.TOPICS[t.i + 1], pre = G.prereqs(t.id);
    var toc = [], body = '';
    function list(a) { return (a || []).map(function (x) { return '<li>' + clean(x) + '</li>'; }).join(''); }
    function chap(n, title, inner) { return '<section class="chap" id="c' + n + '"><div class="chap-h"><span class="chap-n">' + n + '</span><div><div class="k">Capítulo ' + n + '</div><h2>' + title + '</h2></div></div>' + inner + '</section>'; }
    function blk(sid, title, inner) { toc.push([sid, title]); return '<div class="blk" id="' + sid + '"><h3>' + title + '</h3>' + inner + '</div>'; }
    var caso = t.caso || {};

    toc.push(['ch', 'Entiéndelo']);
    body += chap(1, 'Entiéndelo',
      (pre.length ? '<div class="call warn ca-pre"><div class="ck">Antes de empezar</div><div class="dbody"><p>Conviene conocer: ' + pre.map(topicLink).join(', ') + '.</p></div></div>' : '') +
      blk('s-frase', 'En una frase', '<p class="oneliner">' + clean(t.one) + '</p>') +
      blk('s-amigo', 'Explicado como a un amigo', '<div class="call analog"><div class="ck">Analogía</div><div class="dbody"><p>' + clean(t.friend) + '</p></div></div>') +
      blk('s-pasos', 'Cómo funciona, paso a paso', '<ol class="pasos">' + list(t.steps) + '</ol>') +
      blk('s-ej', 'Un ejemplo con números', '<div class="mini"><div class="dbody">' + clean(t.ex) + '</div></div>') +
      blk('s-clave', 'La idea clave', '<div class="call good"><div class="ck">Clave</div><div class="dbody"><p>' + clean(t.key) + '</p></div></div>'));
    toc.push(['ch', 'Míralo en acción']);
    body += chap(2, 'Míralo en acción', blk('s-viz', 'Visualízalo e interactúa', '<div id="vizHost"></div>'));
    toc.push(['ch', 'Úsalo en un proyecto']);
    body += chap(3, 'Úsalo en un proyecto',
      blk('s-caso', 'Caso real', '<div class="caso"><div class="csec">' + clean(caso.sec) + '</div><div class="cq">' + clean(caso.q) + '</div><div class="dbody">' + clean(caso.html) + '</div></div>') +
      blk('s-cuando', '¿Cuándo sí y cuándo no?', '<div class="yesno"><div class="y"><div class="ck">Úsalo cuando</div><ul>' + list(t.yes) + '</ul></div><div class="n"><div class="ck">Evítalo cuando</div><ul>' + list(t.no) + '</ul></div></div>') +
      (t.lab ? blk('s-lab', 'Hazlo tú, paso a paso', labHTML(t.lab)) : '') +
      (t.ejer && t.ejer.length ? blk('s-ejer', 'Ejercicios', ejerHTML(t.ejer)) : ''));
    toc.push(['ch', 'Por dentro']);
    body += chap(4, 'Por dentro',
      (t.code && t.code.length ? blk('s-code', 'El código', t.code.map(function (c, i) { return '<div class="code"><div class="cl"><span>' + esc(c.l) + ' · ' + esc(c.t) + '</span><button type="button" data-copy="' + i + '">Copiar</button></div><pre class="dcode"><code>' + hl(c.s) + '</code></pre></div>'; }).join('')) : '') +
      blk('s-conf', 'Con qué se confunde', '<div class="conf">' + (t.conf || []).map(function (c) { return '<div><h4>' + clean(c.t) + '</h4><p>' + clean(c.d) + '</p></div>'; }).join('') + '</div>'));
    toc.push(['ch', 'Ponte a prueba']);
    body += chap(5, 'Ponte a prueba',
      blk('s-rec', 'Lo que tienes que recordar', '<div class="recall"><div class="ck">Recuerda</div><ul>' + list(t.rec) + '</ul></div>') +
      blk('s-quiz', 'Comprueba si lo has entendido', '<div class="quiz" id="topicQuiz">' + (QUIZ[t.id] !== undefined ? '<div class="qmeta"><span>Ya la respondiste: ' + (QUIZ[t.id] ? 'correcta' : 'fallada') + '</span><button type="button" class="vbtn" id="qRetry">Responder de nuevo</button></div>' : '') + quizInner(t) + '</div>'));
    toc.push(['ch', 'Nivel profesional']);
    body += chap(6, 'Nivel profesional',
      blk('s-pro', 'Para cuando ya lo tengas claro', '<ul class="pro">' + (t.pro || []).map(function (p) { return '<li><span class="pk">' + clean(p.k) + '</span>' + clean(p.t) + '</li>'; }).join('') + '</ul>') +
      blk('s-encaja', 'Dónde encaja', fitHTML(t)) +
      blk('s-src', 'De dónde sale', '<ul class="ca-srcs">' + (t.src || []).map(srcHTML).join('') + '</ul><p class="ca-ver">' + verChip(t) + (t.ver && t.ver.d ? ' Contrastado el ' + fmtDate(t.ver.d) + '.' : '') + (t.ver && t.ver.n ? ' ' + esc(t.ver.n) : '') + (t.upd ? ' <span class="ca-sm">Ficha revisada el ' + fmtDate(t.upd) + '.</span>' : '') + '</p>'));

    var tocHTML = '<div class="tt">En este tema</div><ol>' + toc.map(function (x) { return x[0] === 'ch' ? '<li class="ch">' + x[1] + '</li>' : '<li><a href="' + R('tema/' + t.id) + '" data-sec="' + x[0] + '">' + x[1] + '</a></li>'; }).join('') + '</ol><div class="tprog"><div class="l">Tu progreso: <span id="progLbl"></span></div><button type="button" class="pbtn" id="progBtn"></button></div>';

    $('#detail').innerHTML = '<div class="dtop"><a class="dback" href="' + R('temas') + '">← Temas</a><span class="sep">/</span><span>' + esc(b.n) + ' · ' + esc(b.t) + '</span><span class="sep">/</span><span>Tema ' + esc(b.n) + '.' + (bt.indexOf(t) + 1) + '</span></div>' +
      '<div class="dhero"><div><h1>' + esc(t.t) + '</h1><div class="dmeta"><span class="chip acc">' + esc(b.t) + '</span><span class="chip">' + lv(t.lvl) + ' ' + (LVL[t.lvl] || '') + '</span>' + (t.tags || []).map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + '</div><p class="dhero-q">' + clean(t.q) + '</p></div>' +
      '<div class="dfacts"><h4>Ficha rápida</h4><dl><dt>Bloque</dt><dd>' + esc(b.n) + ' · ' + esc(b.t) + '</dd><dt>Nivel</dt><dd>' + (LVL[t.lvl] || '') + '</dd><dt>Código</dt><dd>' + (t.code && t.code.length ? 'Sí' : 'Sin código') + '</dd><dt>Contenido</dt><dd>' + verChip(t) + '</dd><dt>Fuente</dt><dd>' + esc((t.src || []).length ? srcTitle(t.src[0]) : '—') + '</dd></dl></div></div>' +
      '<div class="study"><nav class="stoc" aria-label="Índice del tema">' + tocHTML + '</nav><div class="smain">' + body +
      '<nav class="dnav" aria-label="Tema anterior y siguiente">' + (prev ? '<a href="' + R('tema/' + prev.id) + '"><span class="nk">← Anterior</span><span class="nt">' + esc(prev.t) + '</span></a>' : '<span></span>') + (next ? '<a class="nx" href="' + R('tema/' + next.id) + '"><span class="nk">Siguiente →</span><span class="nt">' + esc(next.t) + '</span></a>' : '') + '</nav></div></div>';

    function onQuiz(ok) { if (ok) setProg(t.id, 2); syncProgBtn(t); }
    mountViz(t.viz, $('#vizHost'), t.vizNote);
    bindQuiz($('#topicQuiz'), t, onQuiz);
    var rt = $('#qRetry'); if (rt) rt.addEventListener('click', function () { var h = $('#topicQuiz'); h.innerHTML = quizInner(t); bindQuiz(h, t, onQuiz); });
    $$('[data-copy]', $('#detail')).forEach(function (bt) { bt.addEventListener('click', function () { var src = t.code[+bt.dataset.copy].s; if (navigator.clipboard) navigator.clipboard.writeText(src).then(function () { bt.textContent = 'Copiado'; setTimeout(function () { bt.textContent = 'Copiar'; }, 1500); }); }); });
    $$('.stoc a[data-sec]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var el = $('#' + a.dataset.sec); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
    $('#progBtn').addEventListener('click', function () { PROG[t.id] = PROG[t.id] === 2 ? 1 : 2; lsSet('prog', PROG); syncProgBtn(t); });
    syncProgBtn(t);
    if (tocObs) tocObs.disconnect();
    if ('IntersectionObserver' in window) {
      tocObs = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) { $$('.stoc a').forEach(function (a) { a.classList.toggle('on', a.dataset.sec === en.target.id); }); } }); }, { rootMargin: '-90px 0px -70% 0px' });
      $$('.blk', $('#detail')).forEach(function (s) { tocObs.observe(s); });
    }
  }
  function syncProgBtn(t) {
    var p = PROG[t.id] || 0, bt = $('#progBtn'), l = $('#progLbl'); if (!bt) return;
    l.textContent = p === 2 ? 'Lo entiendo' : 'En estudio';
    bt.textContent = p === 2 ? 'Marcar como en estudio' : 'Lo entiendo';
    bt.classList.toggle('on', p === 2);
  }

  /* ══ BUSCADOR (Ctrl K  o  /) ═════════════ */
  function openQk() {
    if (qk || !root) return;
    qkPrev = root.activeElement;
    qk = document.createElement('div'); qk.className = 'qk';
    qk.innerHTML = '<div class="qk-box" role="dialog" aria-modal="true" aria-label="Buscar en el manual"><input type="text" placeholder="Busca un tema o dilo con tus palabras…" aria-label="Buscar" autocomplete="off"><div class="qk-res" role="listbox"></div><div class="qk-foot"><span>↑ ↓ para moverte</span><span>Intro para abrir</span><span>Esc para cerrar</span></div></div>';
    root.appendChild(qk);
    var inp = $('input', qk);
    inp.addEventListener('input', function () { qkSel = 0; drawQk(inp.value); });
    qk.addEventListener('click', function (e) { if (e.target === qk) closeQk(); var it = e.target.closest('.qk-it'); if (it) { var h = it.dataset.h; closeQk(); location.hash = h; } });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); qkSel = Math.min(qkSel + 1, qkRes.length - 1); drawQk(inp.value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); qkSel = Math.max(qkSel - 1, 0); drawQk(inp.value); }
      else if (e.key === 'Enter' && qkRes[qkSel]) { var h = qkRes[qkSel].h; closeQk(); location.hash = h; }
      else if (e.key === 'Escape') { closeQk(); }
    });
    drawQk(''); inp.focus();
  }
  function closeQk() { if (!qk) return; qk.remove(); qk = null; if (qkPrev && qkPrev.focus) qkPrev.focus(); }
  function drawQk(q) {
    qkRes = q.trim() ? search(q).slice(0, 30) : cache.IDX.filter(function (x) { return x.k === 'Sección' || x.k === 'Tema'; }).slice(0, 12);
    $('.qk-res', qk).innerHTML = qkRes.length ? qkRes.map(function (x, i) { return '<button type="button" class="qk-it' + (i === qkSel ? ' on' : '') + '" role="option" aria-selected="' + (i === qkSel) + '" data-h="' + esc(x.h) + '"><span class="qi">' + esc(x.k) + '</span><span class="qt"><span class="qn">' + esc(x.n) + '</span><span class="qd">' + esc(plain(x.d)) + '</span></span></button>'; }).join('') : '<div class="qk-empty">Sin resultados. Prueba con una palabra más corta o con un sinónimo.</div>';
  }
  function onKey(e) {
    if (!host || !host.isConnected) return;                    // otra pestaña del área privada: no es asunto del manual
    var t = (e.composedPath && e.composedPath()[0]) || e.target, typing = t && /^(input|textarea|select)$/i.test(t.tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); qk ? closeQk() : openQk(); }
    else if (e.key === '/' && !qk && !typing) { e.preventDefault(); openQk(); }
  }

  return { render: render };
})();
