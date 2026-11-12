/* ═══════════════════════════════════════════════
   area-privada-estudio.js: «Manual de estudio» dentro del área privada (#/estudio, desde Portfolio)
   ─────────────────────────────────────────────────
   Manual de libro: cada capítulo con su texto completo y recuadros «En sencillo», más indicadores y glosario.
   Solo el MOTOR es público. El contenido (título incluido) vive en la tabla public.me_docs de Supabase
   (supabase/manual-estudio.sql, RLS) y se lee tras iniciar sesión. Se publica con tools/manual-estudio/publish.mjs
   desde una carpeta local que no está en el repositorio.
   · Rutas (arg del módulo): «» inicio · temas · indicadores · indicadores/<id> · glosario · tema/<id> · tema/<id>/<ancla>.
   · Se pinta dentro de un Shadow DOM con css/claude-manual.css (sistema de diseño de los manuales) y css/manual-estudio.css.
   · CSP estricta: sin atributos style ni scripts en línea (los anchos de las barras van por CSSOM).
   · Todo el HTML del contenido pasa por clean() (lista blanca de etiquetas, atributos y enlaces).
   · Progreso y tema claro/oscuro: localStorage (bm_me_*).
   ═══════════════════════════════════════════════ */
window.APEstudio = (function () {
  'use strict';

  var P = 'bm_me_', TTL = 5 * 60 * 1000;
  var ctx = null, cache = null, D = null;
  var host = null, root = null, lastArg = null;
  var PROG = {};
  var temasState = { q: '' }, glosState = { q: '', f: '' }, indState = { q: '', f: '', m: 'fichas' };
  var tocObs = null, qk = null, qkSel = 0, qkRes = [], qkPrev = null, listening = false;
  var nf = new Intl.NumberFormat('es-ES');

  /* ── utilidades ── */
  function $(s, r) { return (r || root).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function plain(h) { return String(h == null ? '' : h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
  function nb(s) { return String(s).replace(/(\d) (%|€|km\b|h\b|min\b)/g, '$1&nbsp;$2'); }
  function R(path) { return '#/estudio' + (path ? '/' + path : ''); }
  function lsGet(k, d) { try { var v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: funciona igual, sin recordar */ } }
  function assetUrl(name, fallback) {
    var l = document.querySelector('link[data-ap-asset="' + name + '"]');
    return new URL(l ? l.getAttribute('href') : fallback, document.baseURI).href;
  }
  function setProg(id, v) { if ((PROG[id] || 0) >= v && v !== 0) return; PROG[id] = v; lsSet('prog', PROG); }
  function setWidths(el) { $$('[data-w]', el).forEach(function (n) { n.style.width = n.getAttribute('data-w') + '%'; }); }   // CSSOM: la CSP no admite atributos de estilo
  function dot(id) { var p = PROG[id] || 0; return '<span class="td ' + (p ? 's' + p : '') + '" title="' + (p === 2 ? 'Entendido' : p === 1 ? 'En estudio' : 'Pendiente') + '"></span>'; }

  /* ── saneado del HTML del contenido: lista blanca de etiquetas, atributos y enlaces ── */
  var ALLOW = { b: 1, strong: 1, i: 1, em: 1, u: 1, code: 1, p: 1, br: 1, ul: 1, ol: 1, li: 1, sub: 1, sup: 1, blockquote: 1, h3: 1, h4: 1, h5: 1, h6: 1,
    table: 1, thead: 1, tbody: 1, tr: 1, th: 1, td: 1, a: 1, div: 1, span: 1, mark: 1, details: 1, summary: 1 };
  var DROP = { script: 1, style: 1, iframe: 1, object: 1, embed: 1, svg: 1, math: 1, template: 1, noscript: 1, link: 1, meta: 1, form: 1, input: 1, button: 1, textarea: 1, select: 1, img: 1, video: 1, audio: 1 };
  var ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  function safeHref(href) {
    if (/^https:\/\//i.test(href)) return href;
    var m = /^#(indicadores|tema|glosario|temas)(\/[A-Za-z0-9\/-]*)?$/.exec(href);   // enlaces internos del manual → rutas del área privada
    return m ? R(m[1] + (m[2] || '')) : null;
  }
  function copyClean(src, dst) {
    Array.prototype.forEach.call(src.childNodes, function (n) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      if (tag === 'img' && n.getAttribute('class') === 'rail-visual') {
        var png = n.getAttribute('src') || '';
        if (png.length <= 150000 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(png)) {
          var picture = document.createElement('img');
          picture.src = png;
          picture.alt = (n.getAttribute('alt') || '').slice(0, 500);
          picture.style.width = '100%';
          picture.loading = 'lazy';
          dst.appendChild(picture);
        }
        return;
      }
      if (DROP[tag]) return;
      if (!ALLOW[tag]) { copyClean(n, dst); return; }
      var e = document.createElement(tag);
      var cls = (n.getAttribute('class') || '').split(/\s+/).filter(function (c) { return /^[a-z0-9-]{1,30}$/.test(c); });
      if (cls.length) e.setAttribute('class', cls.join(' '));
      var id = n.getAttribute('id'); if (id && ID.test(id)) e.setAttribute('id', id);
      if (tag === 'mark' && n.getAttribute('title')) e.setAttribute('title', n.getAttribute('title').slice(0, 200));
      if (tag === 'a') {
        var href = safeHref(n.getAttribute('href') || '');
        if (href) { e.setAttribute('href', href); if (/^https:/i.test(href)) { e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener noreferrer'); } }
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
  function load() {
    if (cache && Date.now() - cache.at < TTL) { D = cache.data; return Promise.resolve(); }
    return ctx.api('/rest/v1/me_docs?select=kind,pos,data&order=pos.asc&limit=10000').then(function (rows) {
      rows = (rows || []).filter(function (x) { return x && x.data && typeof x.data === 'object'; });
      function of(kind) { return rows.filter(function (x) { return x.kind === kind; }).map(function (x) { return x.data; }); }
      var meta = of('meta')[0] || {};
      var TOPICS = of('topic').filter(function (t) { return ID.test(String(t.id)); }).sort(function (a, b) { return (a.num || 0) - (b.num || 0); });
      var BOOK = {};
      TOPICS.forEach(function (t) { BOOK[t.id] = { html: '', secs: [] }; });
      of('chunk').filter(function (c) { return BOOK[c.t]; }).sort(function (a, b) { return a.i - b.i; }).forEach(function (c) {
        BOOK[c.t].html += String(c.html || '');
        (c.secs || []).forEach(function (s) { if (s && ID.test(String(s.id))) BOOK[c.t].secs.push(s); });
      });
      var data = {
        M: meta, TOPICS: TOPICS, BOOK: BOOK,
        BLOCKS: of('block').filter(function (b) { return ID.test(String(b.id)); }),
        GLOSS: of('gloss').filter(function (g) { return g.k && ID.test(String(g.t)); }),
        INDFAM: of('fam').filter(function (f) { return ID.test(String(f.id)); }),
        INDIC: of('indic').filter(function (x) { return ID.test(String(x.id)) && ID.test(String(x.fam)); }),
        /* glosario completo (opcional: solo si el manual publica glosario.js) */
        GTERMS: of('gterm').filter(function (g) { return g.k && ID.test(String(g.id)) && ID.test(String(g.fam)); }),
        GFAM: of('gfam').filter(function (f) { return ID.test(String(f.id)); }),
        SIGLAS: of('gsig').filter(function (r) { return r.s && r.d; }),
        GCONF: of('gconf')[0] || {},
        GVIS: {}
      };
      of('gvis').forEach(function (x) { if (ID.test(String(x.id))) data.GVIS[x.id] = x; });
      data.byId = {}; TOPICS.forEach(function (t, i) { t._i = i; data.byId[t.id] = t; });
      data.blockById = {}; data.BLOCKS.forEach(function (b) { data.blockById[b.id] = b; });
      data.famById = {}; data.INDFAM.forEach(function (f) { data.famById[f.id] = f; });
      data.ALLG = buildGloss(data);
      cache = { at: Date.now(), data: data };
      D = data;
      D.IDX = buildIndex(D);
    });
  }

  /* glosario completo: conceptos de los capítulos → siglas y términos del libro → vocabulario básico (sin repetir) */
  var GCAT = { s: 'Sigla', l: 'Término del libro', m: 'Concepto del capítulo', v: 'Vocabulario básico' };
  function gcat(g) { return g.c || (g.v ? 'v' : 'm'); }
  function buildGloss(d) {
    if (d.GTERMS.length) return buildFullGloss(d);
    var all = [], seen = {};
    function add(o) { var k = String(o.k).toLowerCase(); if (seen[k]) return; seen[k] = 1; all.push(o); }
    d.GLOSS.forEach(function (g) { add({ k: g.k, d: g.d, t: g.t, a: g.a }); });
    d.TOPICS.forEach(function (t) { (t.entries || []).forEach(function (e) { if (e.c === 's' || e.c === 'l') add({ k: e.k, d: e.d, t: t.id, a: e.a, c: e.c }); }); });
    d.TOPICS.forEach(function (t) { (t.vocab || []).forEach(function (v) { if (v && v[0]) add({ k: v[0], d: v[1], t: t.id, a: 's-vocab', v: true }); }); });
    return all;
  }
  /* Glosario completo (manuales con glosario.js): entradas por familias + fichas de capítulo y vocabulario.
     Una ficha cuyo término coincide con el término o un alias de una entrada se fusiona con ella
     (solo aporta su enlace «En el manual»). Mismas reglas que la web local (GMERGE). */
  function gkey(s) { return norm(String(s)).trim(); }
  function buildFullGloss(d) {
    var c = d.GCONF, famT = c.famT || {}, famK = c.famK || {}, dup = c.dup || {}, alias = {}, all = [];
    d.GBY = {};
    d.GTERMS.forEach(function (g) { g.m = (g.m || []).slice(); d.GBY[g.id] = g; all.push(g); [g.k].concat(g.al || []).forEach(function (a) { alias[gkey(a)] = g.id; }); });
    function addCap(k, txt, t, a, kind) {
      if (!ID.test(String(t))) return;
      var id = alias[gkey(k)] || (dup[k] && alias[gkey(dup[k])]);
      if (id) { var g = d.GBY[id]; if (!g.m.some(function (x) { return x[0] === t && x[1] === a; })) g.m.push([t, a]); return; }
      var nid = gkey(k).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 't'; while (d.GBY[nid]) nid += '-b';
      var e = { id: nid, k: k, fam: famK[k] || famT[t] || (d.GFAM[0] || {}).id, d: esc(txt), m: [[t, a]], kind: kind };
      d.GBY[nid] = e; alias[gkey(k)] = nid; all.push(e);
    }
    d.GLOSS.forEach(function (g) { addCap(g.k, g.d, g.t, g.a, 'cap'); });
    d.TOPICS.forEach(function (t) { (t.vocab || []).forEach(function (v) { if (v && v[0]) addCap(v[0], v[1], t.id, 's-vocab', 'vocab'); }); });
    return all;
  }
  function gHref(g) { return g.id && D.GBY ? R('glosario/' + g.id) : R('tema/' + g.t + (g.a && ID.test(g.a) ? '/' + g.a : '')); }
  function gText(g) { return g._s || (g._s = norm([g.k].concat(g.al || []).join(' ') + ' ' + plain(g.d) + ' ' + plain(g.x || ''))); }

  /* ── búsqueda ── */
  function topicText(t) { return t._tx || (t._tx = norm([t.t, t.q, t.one, (t.rec || []).join(' '), (D.BOOK[t.id].secs || []).map(function (s) { return s.t; }).join(' ')].join(' '))); }
  function indText(x) { return x._s || (x._s = norm([x.n, x.q, plain(x.d), plain(x.ej), x.u, (D.famById[x.fam] || {}).n].join(' '))); }
  var RANK = { 'Sección': 0, 'Indicador': 1, 'Capítulo': 2, 'Sigla': 3, 'Glosario': 3, 'Apartado': 4 };
  function buildIndex(d) {
    var idx = [];
    d.TOPICS.forEach(function (t) {
      idx.push({ k: 'Capítulo', n: t.t, d: t.q, h: R('tema/' + t.id), s: topicText(t), txt: '' });
      d.BOOK[t.id].secs.forEach(function (s) { idx.push({ k: 'Apartado', n: s.t, d: 'Cap. ' + t.num + ' · ' + t.t, h: R('tema/' + t.id + '/' + s.id), s: norm(s.t + ' ' + (s.txt || '')), txt: s.txt || '' }); });
    });
    d.INDIC.forEach(function (x) { idx.push({ k: 'Indicador', n: x.n, d: x.q, h: R('indicadores/' + x.id), s: indText(x), txt: '' }); });
    d.ALLG.forEach(function (g) { idx.push({ k: 'Glosario', n: g.k, d: plain(g.d), h: gHref(g), s: d.GBY ? gText(g) : norm(g.k + ' ' + g.d), txt: '' }); });
    if (d.GBY) d.SIGLAS.forEach(function (r) { idx.push({ k: 'Sigla', n: r.s, d: r.d, h: R('glosario/' + (r.g && d.GBY[r.g] ? r.g : 'siglas')), s: norm(r.s + ' ' + r.d), txt: '' }); });
    [['Inicio', ''], ['Todos los capítulos', 'temas'], ['Indicadores', 'indicadores'], ['Glosario', 'glosario']].forEach(function (v) { idx.push({ k: 'Sección', n: v[0], d: 'Ir a la sección', h: R(v[1]), s: norm(v[0]), txt: '' }); });
    return idx;
  }

  /* ═══════════ Entrada del módulo ═══════════ */
  function render(c) {
    ctx = c;
    PROG = lsGet('prog', {});
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
  function paintSetup() { paintMsg('El manual aún no está creado', 'Ejecuta supabase/manual-estudio.sql en el SQL Editor de Supabase y publica el contenido con node tools/manual-estudio/publish.mjs desde tu terminal.'); }
  function paintEmpty() { paintMsg('El manual todavía no tiene contenido', 'La tabla existe pero está vacía. Publica el contenido con node tools/manual-estudio/publish.mjs desde tu terminal.'); }

  function shell() {
    var title = esc(D.M.title || 'Manual de estudio');
    return '<a class="skip-link" href="#" data-skip>Saltar al contenido</a>' +
      '<header class="appbar"><div class="appbar-in"><a class="brand" href="' + R('') + '" aria-label="' + title + ', ir al inicio">' + title + '</a>' +
      '<nav class="topnav" aria-label="Secciones del manual"><a class="tnb" href="' + R('') + '" data-v="home">Inicio</a><a class="tnb" href="' + R('temas') + '" data-v="temas">Capítulos</a><a class="tnb" href="' + R('indicadores') + '" data-v="indicadores">Indicadores</a><a class="tnb" href="' + R('glosario') + '" data-v="glosario">Glosario</a></nav>' +
      '<div class="appbar-r"><a class="iconbtn" href="#/portfolio">Portfolio</a>' +
      '<button class="iconbtn" id="qkBtn" type="button" aria-label="Buscar Ctrl K, un capítulo, un indicador o un término"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><span class="qk-l">Buscar</span> <kbd>Ctrl K</kbd></button>' +
      '<button class="iconbtn" id="themeBtn" type="button" aria-label="Cambiar entre tema claro y oscuro">Oscuro</button></div></div></header>' +
      '<main id="main" tabindex="-1"><section id="view"></section></main><article id="detail" class="hidden" tabindex="-1"></article>' +
      '<footer class="foot"><span>' + title + ' · notas de estudio · edición ' + esc(D.M.edition || '') + '</span><span>Manual privado: solo visible con tu sesión</span></footer>';
  }

  function paint() {
    ctx.view.textContent = '';
    host = document.createElement('div'); host.className = 'cm-host me-host'; host.hidden = true;
    root = host.attachShadow({ mode: 'open' });
    var pending = 2, show = function () { if (--pending <= 0) host.hidden = false; };
    [['cm-css', './css/claude-manual.css'], ['me-css', './css/manual-estudio.css']].forEach(function (a) {
      var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = assetUrl(a[0], a[1]);
      link.addEventListener('load', show); link.addEventListener('error', show); root.appendChild(link);
    });
    var wrap = document.createElement('div'); wrap.className = 'wrap'; wrap.innerHTML = shell(); root.appendChild(wrap);
    var th = lsGet('theme', null); if (th) host.setAttribute('data-theme', th);
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
    var v = $('#view'), anchor = null;
    if (isTopic) anchor = renderTopic(parts[1], parts[2]);
    else if (view === 'temas') renderTemas(v);
    else if (view === 'indicadores') anchor = renderIndicadores(v, parts[1]);
    else if (view === 'glosario') anchor = renderGlosario(v, parts[1]);
    else renderHome(v);
    setWidths(root);
    if (anchor) {
      var el = root.getElementById(anchor);
      if (el) {
        var det = el.closest('details'); if (det) det.open = true;
        setTimeout(function () {
          el.scrollIntoView({ block: 'start', behavior: 'instant' });
          if (el.classList.contains('gl-entry') || el.classList.contains('ind') || el.classList.contains('gent')) { el.classList.add('hit'); setTimeout(function () { el.classList.remove('hit'); }, 2200); }
        }, 60);
      }
      lastArg = ctx.arg;
    } else if (ctx.arg !== lastArg) { window.scrollTo({ top: 0, behavior: 'instant' }); lastArg = ctx.arg; }
  }
  function isDark() { var t = host.getAttribute('data-theme'); return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function syncThemeBtn() { $('#themeBtn').textContent = isDark() ? 'Claro' : 'Oscuro'; }

  /* ══ INICIO ══════════════════════════════ */
  function blocksHTML() {
    return '<div class="blocks">' + D.BLOCKS.map(function (b) {
      var ts = D.TOPICS.filter(function (t) { return t.b === b.id; }), done = ts.filter(function (t) { return PROG[t.id] === 2; }).length;
      return '<div class="bcard"><div class="bh"><span class="bn">' + esc(b.n) + '</span><div><h3>' + esc(b.t) + '</h3><p class="bs">' + esc(b.s) + '</p></div></div><ol class="bl">' +
        ts.map(function (t) { return '<li><a class="tlink" href="' + R('tema/' + t.id) + '"><span class="ti">' + esc(t.num) + '</span><span class="tt">' + esc(t.t) + '</span>' + dot(t.id) + '</a></li>'; }).join('') +
        '</ol><div class="bp"><span>' + done + ' de ' + ts.length + ' entendidos</span><span class="bar"><i data-w="' + (ts.length ? Math.round(done / ts.length * 100) : 0) + '"></i></span></div></div>';
    }).join('') + '</div>';
  }
  function renderHome(v) {
    var T = D.TOPICS, M = D.M;
    var done = T.filter(function (t) { return PROG[t.id] === 2; }).length;
    var next = T.filter(function (t) { return PROG[t.id] !== 2; })[0] || T[0];
    var nsec = T.reduce(function (a, t) { return a + (t.nsec || 0); }, 0);
    var stats = [['Capítulos', T.length], ['Apartados', nsec], ['Indicadores', D.INDIC.length], ['Términos', D.ALLG.length]];
    var tools = [
      [R('indicadores'), 'Indicadores', D.INDIC.length + ' indicadores y unidades, cada uno con su fórmula, un ejemplo con números y la trampa en la que es fácil caer.'],
      [R('glosario'), 'Glosario', D.ALLG.length + ' términos: siglas, términos del libro, conceptos de los capítulos y vocabulario básico.'],
      [R('temas'), 'Capítulos', 'El texto completo de cada capítulo con sus recuadros «En sencillo». Usa Ctrl K para buscar cualquier palabra.']
    ];
    v.innerHTML =
      '<section class="cover-hero"><div class="cover-copy"><div class="eyebrow">Manual visual · edición ' + esc(M.edition || '') + '</div><h1>' + clean(M.heroTitle || esc(M.title || '')) + '</h1>' +
      '<p class="lead">Una guía visual para entender la infraestructura, los servicios y la operación del ferrocarril en España.</p>' +
      '<div class="hero-cta"><a class="btn solid" href="' + R('tema/' + next.id) + '">' + (done ? 'Seguir por el capítulo ' : 'Empezar por el capítulo ') + esc(next.num) + ' →</a><a class="btn" href="' + R('temas') + '">Explorar capítulos</a></div>' +
      '<div class="hero-stats">' + stats.map(function (s) { return '<div class="hs"><div class="n">' + s[1] + '</div><div class="l">' + s[0] + '</div></div>'; }).join('') + '</div></div>' +
      '<figure class="cover-art"><img src="./img/manuales/portada-alta-velocidad.webp" alt="Tren de alta velocidad sobre un viaducto en un paisaje castellano" fetchpriority="high" decoding="async"><figcaption><span>Portada elegida · 01 Alta velocidad</span><span>Grabado azul sobre papel crema</span></figcaption></figure></section>' +
      '<section class="network-section" aria-labelledby="network-title"><div class="sec-h"><h2 id="network-title">La red ferroviaria de España</h2><p>Mapa interactivo oficial de Adif Alta Velocidad.</p></div>' +
      '<div class="official-map"><iframe class="official-map-frame" title="Mapa interactivo de la red ferroviaria española de Adif Alta Velocidad" src="https://www.adifaltavelocidad.es/static-data/mapa/index.html" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe><div class="map-caption">Acerca o aleja con los controles del mapa. Abre el icono de capas para filtrar estaciones, cambiadores, anchos de vía, electrificación y actuaciones.</div></div>' +
      '<div class="service-map-note"><p>Este mapa representa infraestructura ferroviaria. Para consultar mapas de servicios de viajeros, usa las fuentes de Renfe:</p><div class="service-map-links"><a class="btn" href="https://www.renfe.com/es/es/viajar/informacion-util/mapas-y-lineas/ave-y-larga-distancia" target="_blank" rel="noopener">AVE y Larga Distancia ↗</a><a class="btn" href="https://www.renfe.com/es/es/viajar/informacion-util/mapas-y-lineas/media-distancia-y-avant" target="_blank" rel="noopener">Media Distancia y Avant ↗</a><a class="btn" href="https://www.renfe.com/es/es/ayuda/cercanias" target="_blank" rel="noopener">Cercanías ↗</a></div><a class="official-map-source" href="https://www.adifaltavelocidad.es/sobre-adif-av/red-av/mapa" target="_blank" rel="noopener">Ver mapa en la web de Adif AV ↗</a></div></section>' +
      '<div class="sec-h"><h2>Ruta de lectura</h2><p>' + done + ' de ' + T.length + ' capítulos entendidos. El punto verde marca lo que ya dominas.</p></div>' + blocksHTML() +
      '<div class="sec-h"><h2>Para estudiar</h2><p>Herramientas que cruzan todo el manual.</p></div>' +
      '<div class="tools">' + tools.map(function (x) { return '<a class="card tool" href="' + x[0] + '"><h3>' + x[1] + ' <span aria-hidden="true">→</span></h3><p class="cq">' + x[2] + '</p></a>'; }).join('') + '</div>';
  }

  /* ══ CAPÍTULOS ═══════════════════════════ */
  function renderTemas(v) {
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Catálogo</div><h2 class="th-title">Los ' + D.TOPICS.length + ' capítulos, de un vistazo</h2><p class="th-sub">Busca por concepto o por apartado. Cada capítulo empieza con <b>«La pregunta que responde»</b>.</p></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar capítulo</span><input id="tq" type="search" placeholder="Buscar un concepto…" value="' + esc(temasState.q) + '"></label><span class="count" id="tcount"></span></div><div class="cards" id="tcards"></div>';
    $('#tq', v).addEventListener('input', function (e) { temasState.q = e.target.value; drawCards(v); });
    drawCards(v);
  }
  function drawCards(v) {
    var q = norm(temasState.q.trim());
    var list = D.TOPICS.filter(function (t) { return !q || topicText(t).indexOf(q) > -1; });
    $('#tcount', v).textContent = list.length + (list.length === 1 ? ' capítulo' : ' capítulos');
    $('#tcards', v).innerHTML = list.length ? list.map(function (t) {
      return '<a class="card" href="' + R('tema/' + t.id) + '"><div class="cb">Capítulo ' + esc(t.num) + '</div><h3>' + esc(t.t) + '</h3><p class="cq">' + esc(t.q) + '</p><div class="dmeta me-push"><span class="chip">' + esc(t.nsec) + ' apartados</span><span class="chip">' + nf.format(t.pal || 0) + ' palabras</span>' + dot(t.id) + '</div></a>';
    }).join('') : '<p class="lead">Ningún capítulo coincide con la búsqueda.</p>';
  }

  /* ══ INDICADORES ══════════════════════════ */
  var ORIG = { libro: ['ok', 'Dato del libro'], propia: ['acc', 'Cuenta propia con datos del libro'], inventado: ['ex', 'Ejemplo inventado para entenderlo'] };
  function formulaHTML(x, big) {
    var lhs = '<span class="flhs">' + esc(x.n) + ' =</span>';
    if (x.f) return '<div class="fml' + (big ? ' big' : '') + '">' + lhs + '<span class="frac"><span class="fn">' + esc(x.f.n) + '</span><span class="fd">' + esc(x.f.d) + '</span></span></div>';
    return '<div class="fml' + (big ? ' big' : '') + '">' + lhs + '<span class="fx">' + esc(x.fx) + '</span></div>';
  }
  function indCard(x) {
    var o = ORIG[x.o] || ORIG.libro, top = D.byId[x.t], fam = D.famById[x.fam] || {};
    return '<article class="ind" id="ind-' + esc(x.id) + '"><div class="ind-h"><div class="cb">' + esc(fam.n) + '</div><h3>' + esc(x.n) + '</h3><p class="iq">' + esc(x.q) + '</p></div>' +
      '<p class="idesc">' + clean(nb(x.d)) + '</p>' +
      '<div class="ibox"><div class="ik">Fórmula</div>' + formulaHTML(x, true) + '<div class="iu"><span class="ik">Unidad</span> ' + esc(x.u) + '</div></div>' +
      '<div class="iex"><div class="iexh"><span class="ik">Ejemplo</span><span class="chip ' + o[0] + '">' + o[1] + '</span></div><p>' + clean(nb(x.ej)) + '</p></div>' +
      '<p class="itrap"><b>Ojo:</b> ' + clean(nb(x.trap)) + '</p>' +
      (x.dax ? '<details class="idax"><summary>Si lo calcularas en Power BI</summary><pre class="dcode"><code>' + esc(x.dax) + '</code></pre></details>' : '') +
      (top && ID.test(String(x.a)) ? '<a class="ilink" href="' + R('tema/' + x.t + '/' + x.a) + '">Leer en el capítulo ' + esc(top.num) + ' →</a>' : '') +
      (x.g && D.GBY && D.GBY[x.g] ? '<a class="ilink" href="' + R('glosario/' + x.g) + '">Ver en el glosario →</a>' : '') + '</article>';
  }
  function renderIndicadores(v, anchor) {
    if (anchor) { indState = { q: '', f: '', m: 'fichas' }; }
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Indicadores</div><h2 class="th-title">' + D.INDIC.length + ' indicadores del manual</h2>' +
      '<p class="th-sub">Cada uno con la pregunta que responde, una explicación en llano, la fórmula, un ejemplo con números y la trampa habitual. La etiqueta del ejemplo te dice si el dato es <b>del libro</b>, una <b>cuenta propia con datos del libro</b> o un <b>ejemplo inventado</b>.</p></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar indicador</span><input id="iq" type="search" placeholder="Buscar un indicador…" value="' + esc(indState.q) + '"></label><span class="count" id="icount"></span>' +
      '<div class="seg" id="imode" role="group" aria-label="Modo de vista"><button type="button" data-m="fichas">Fichas</button><button type="button" data-m="chuleta">Chuleta</button></div></div>' +
      '<div class="toolbar"><div class="filters" id="ifam" role="group" aria-label="Filtrar por familia"><button class="fb" data-f="">Todas</button>' + D.INDFAM.map(function (f) { return '<button class="fb" data-f="' + esc(f.id) + '">' + esc(f.n) + '</button>'; }).join('') + '</div></div>' +
      '<div id="ibody"></div>';
    function syncBtns() {
      $$('#ifam .fb', v).forEach(function (b) { var on = b.dataset.f === indState.f; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      $$('#imode button', v).forEach(function (b) { var on = b.dataset.m === indState.m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }
    $('#iq', v).addEventListener('input', function (e) { indState.q = e.target.value; drawInd(v); });
    $('#ifam', v).addEventListener('click', function (e) { var b = e.target.closest('.fb'); if (!b) return; indState.f = b.dataset.f; syncBtns(); drawInd(v); });
    $('#imode', v).addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (!b) return; indState.m = b.dataset.m; syncBtns(); drawInd(v); });
    syncBtns(); drawInd(v);
    return anchor && ID.test(anchor) ? 'ind-' + anchor : null;
  }
  function drawInd(v) {
    var q = norm(indState.q.trim());
    var list = D.INDIC.filter(function (x) { return (!indState.f || x.fam === indState.f) && (!q || indText(x).indexOf(q) > -1); });
    $('#icount', v).textContent = list.length + (list.length === 1 ? ' indicador' : ' indicadores');
    var body = $('#ibody', v);
    if (!list.length) { body.innerHTML = '<p class="lead">Ningún indicador coincide con la búsqueda.</p>'; return; }
    if (indState.m === 'chuleta') {
      body.innerHTML = '<p class="ichu-intro">Todos de un vistazo para repasar. Pulsa un nombre para abrir su ficha.</p><div class="tw"><table class="dxtbl ichu"><thead><tr><th>Indicador</th><th>Fórmula</th><th>Unidad</th><th>Ejemplo rápido</th></tr></thead><tbody>' +
        list.map(function (x) { return '<tr><td><a href="' + R('indicadores/' + x.id) + '">' + esc(x.n) + '</a><span class="ifamt">' + esc((D.famById[x.fam] || {}).n) + '</span></td><td>' + formulaHTML(x, false) + '</td><td>' + esc(x.u) + '</td><td>' + clean(nb(x.ej)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      return;
    }
    body.innerHTML = D.INDFAM.map(function (f) {
      var xs = list.filter(function (x) { return x.fam === f.id; }); if (!xs.length) return '';
      return '<section class="ifam"><div class="sec-h"><h2>' + esc(f.n) + '</h2><p>' + esc(f.s) + '</p></div><div class="ind-grid">' + xs.map(indCard).join('') + '</div></section>';
    }).join('');
  }

  /* ══ GLOSARIO ═════════════════════════════ */
  function renderGlosario(v, anchor) {
    if (D.GBY) return renderFullGlosario(v, anchor);
    var cnt = { s: 0, l: 0, m: 0, v: 0 };
    D.ALLG.forEach(function (g) { cnt[gcat(g)]++; });
    function fbtn(f, label) { return cnt[f] ? '<button class="fb" data-f="' + f + '">' + label + ' (' + cnt[f] + ')</button>' : ''; }
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Glosario</div><h2 class="th-title">' + D.ALLG.length + ' términos</h2><p class="th-sub">Las <b>siglas</b> y los <b>términos</b> del glosario del libro, los conceptos de cada capítulo y el <b>vocabulario básico</b> que el libro da por sabido. Cada término enlaza con el sitio donde se explica.</p></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar término</span><input id="gq" type="search" placeholder="Buscar una sigla o un término…" value="' + esc(glosState.q) + '"></label><span class="count" id="gcount"></span></div>' +
      '<div class="toolbar"><div class="filters" id="gf" role="group" aria-label="Filtrar términos"><button class="fb" data-f="">Todos</button>' + fbtn('s', 'Siglas') + fbtn('l', 'Términos del libro') + fbtn('m', 'Conceptos de los capítulos') + fbtn('v', 'Vocabulario básico') + '</div></div><div class="cards" id="gcards"></div>';
    function syncBtns() { $$('#gf .fb', v).forEach(function (b) { var on = b.dataset.f === glosState.f; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
    $('#gq', v).addEventListener('input', function (e) { glosState.q = e.target.value; drawGloss(v); });
    $('#gf', v).addEventListener('click', function (e) { var b = e.target.closest('.fb'); if (!b) return; glosState.f = b.dataset.f; syncBtns(); drawGloss(v); });
    syncBtns(); drawGloss(v);
  }
  function drawGloss(v) {
    var q = norm(glosState.q.trim());
    var list = D.ALLG.filter(function (g) { return (!glosState.f || gcat(g) === glosState.f) && (!q || norm(g.k + ' ' + g.d).indexOf(q) > -1); })
      .sort(function (a, b) { return a.k.localeCompare(b.k, 'es', { sensitivity: 'base' }); });
    $('#gcount', v).textContent = list.length + (list.length === 1 ? ' término' : ' términos');
    $('#gcards', v).innerHTML = list.length ? list.map(function (g) {
      return '<a class="card" href="' + gHref(g) + '"><div class="cb">' + GCAT[gcat(g)] + '</div><h3>' + esc(g.k) + '</h3><p class="cq clamp">' + esc(g.d) + '</p></a>';
    }).join('') : '<p class="lead">Ningún término coincide con la búsqueda.</p>';
  }

  /* Glosario completo: tabla de siglas y entradas por familias. Todo el texto del contenido pasa por clean();
     los esquemas son imágenes SVG en data: (no ejecutan nada) y solo se aceptan con ese formato exacto. */
  var SVG_DATA = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/;
  function gVis(id) {
    var x = D.GVIS[id]; if (!x) return '';
    var inner = x.img && x.img.length <= 300000 && SVG_DATA.test(x.img) ? '<img class="gvis-img" src="' + x.img + '" alt="' + esc(x.alt) + '" loading="lazy">' : (x.html ? clean(x.html) : '');
    if (!inner) return '';
    return '<figure class="gvis"><div class="gvis-in">' + inner + '</div><figcaption><b>' + esc(x.t) + '.</b> ' + esc(x.alt) + '</figcaption></figure>';
  }
  function gSecLabel(t, a) {
    var top = D.byId[t]; if (!top || !ID.test(String(a))) return null;
    var s = a === 's-vocab' ? 'vocabulario básico' : ((D.BOOK[t].secs.filter(function (x) { return x.id === a; })[0] || {}).t || '');
    return (top.num === 0 ? 'Capítulo 0' : 'Tema ' + top.num) + (s ? ' · ' + s : '');
  }
  function gSiglas(g) { return (g.al || []).filter(function (a) { return a !== g.k && String(a).length <= 9 && (/[A-Z].*[A-Z]/.test(a) || /[·.\/]/.test(a)); }); }
  function gEntry(g) {
    var sig = gSiglas(g), tag = g.kind === 'vocab' ? '<span class="chip">Definición general, no del libro</span>' : (g.kind === 'cap' ? '<span class="chip">Concepto de un capítulo</span>' : '');
    var m = (g.m || []).map(function (x) { var l = x[2] || gSecLabel(x[0], x[1]); return l ? '<a href="' + R('tema/' + x[0] + '/' + x[1]) + '">' + esc(l) + '</a>' : ''; }).filter(Boolean);
    var src = (g.s || []).filter(function (s) { return /^https:\/\//.test(String(s[1])); });
    return '<article class="gent" id="g-' + esc(g.id) + '" data-s="' + esc(gText(g)) + '">' +
      '<div class="gent-h"><h3>' + esc(g.k) + '</h3>' + (sig.length ? '<span class="gsig-l">' + sig.map(esc).join(' · ') + '</span>' : '') + tag + '</div>' +
      '<p class="gd">' + clean(g.d) + '</p>' + (g.x ? '<p class="gx">' + clean(g.x) + '</p>' : '') +
      (g.n ? '<p class="gn"><b>Uso.</b> ' + clean(g.n) + '</p>' : '') +
      (g.v ? gVis(g.v) : '') +
      (g.cf && g.cf.length ? '<div class="gcf"><div class="gk">Se confunde con</div><ul>' + g.cf.map(function (c) { var o = D.GBY[c[0]]; return '<li>' + (o ? '<a href="' + R('glosario/' + o.id) + '">' + esc(o.k) + '</a>: ' : '') + clean(c[1]) + '</li>'; }).join('') + '</ul></div>' : '') +
      (m.length ? '<p class="gm"><span class="gk">En el manual</span> ' + m.join(' · ') + '</p>' : '') +
      (src.length ? '<p class="gsrc"><span class="gk">Fuente</span> ' + src.map(function (s) { return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(s[0]) + '</a>'; }).join(' · ') + '</p>' : '') +
      '</article>';
  }
  function renderFullGlosario(v, anchor) {
    if (anchor) glosState.q = '';
    var byFam = {}; D.GFAM.forEach(function (f) { byFam[f.id] = []; });
    D.ALLG.forEach(function (g) { if (byFam[g.fam]) byFam[g.fam].push(g); });
    var nav = '<nav class="gnav" aria-label="Ir a una familia del glosario"><a class="fb" href="' + R('glosario/siglas') + '">Siglas</a>' + D.GFAM.map(function (f) { return '<a class="fb" href="' + R('glosario/gf-' + f.id) + '">' + esc(f.n) + '</a>'; }).join('') + '</nav>';
    var sig = '<section class="gsec" id="g-siglas"><div class="sec-h"><h2>Siglas, acrónimos, símbolos y abreviaturas</h2><p>Ordenadas alfabéticamente. «Ver entrada» lleva a la explicación completa.</p></div>' +
      '<div class="gv-tw"><table class="t gtab"><thead><tr><th>Sigla</th><th>Significado</th></tr></thead><tbody>' +
      D.SIGLAS.map(function (r) {
        return '<tr data-s="' + esc(norm(r.s + ' ' + r.d + ' ' + (r.x || ''))) + '"><td class="gs">' + esc(r.s) + '</td><td><b>' + esc(r.d) + '</b>' + (r.x ? '<br>' + esc(r.x) : '') +
          (r.n ? '<br><span class="gnote">' + esc(r.n) + '</span>' : '') + (r.g && D.GBY[r.g] ? ' <a class="gto" href="' + R('glosario/' + r.g) + '">Ver entrada →</a>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    var fams = D.GFAM.map(function (f) {
      var xs = (byFam[f.id] || []).slice().sort(function (a, b) { return a.k.localeCompare(b.k, 'es', { sensitivity: 'base' }); });
      if (!xs.length) return '';
      return '<section class="gsec gfam" id="gf-' + esc(f.id) + '"><div class="sec-h"><h2>' + esc(f.n) + '</h2><p>' + esc(f.s) + '</p></div>' + (f.v ? gVis(f.v) : '') + '<div class="gents">' + xs.map(gEntry).join('') + '</div></section>';
    }).join('');
    v.innerHTML = '<div class="modehead gmh"><div class="eyebrow">Glosario</div><h2 class="th-title">Glosario</h2></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar en el glosario</span><input id="gq" type="search" placeholder="Busca una sigla, un término o una palabra de su definición…" value="' + esc(glosState.q) + '"></label><span class="count" id="gcount"></span></div>' +
      nav + sig + fams + '<p class="lead" id="gempty" hidden>Nada coincide con la búsqueda.</p>';
    $('#gq', v).addEventListener('input', function (e) { glosState.q = e.target.value; drawFullGloss(v); });
    drawFullGloss(v);
    if (!anchor || !ID.test(anchor)) return null;
    return D.GBY[anchor] || anchor === 'siglas' ? 'g-' + anchor : anchor;
  }
  function drawFullGloss(v) {
    var q = norm(glosState.q.trim()), n = 0, ns = 0;
    $$('.gent', v).forEach(function (a) { var on = !q || a.dataset.s.indexOf(q) > -1; a.hidden = !on; if (on) n++; });
    $$('.gtab tbody tr', v).forEach(function (r) { var on = !q || r.dataset.s.indexOf(q) > -1; r.hidden = !on; if (on) ns++; });
    $$('.gfam', v).forEach(function (s) { s.hidden = !!q && !$('.gent:not([hidden])', s); });
    $('#g-siglas', v).hidden = !!q && !ns;
    $('.gnav', v).hidden = !!q;
    $('#gcount', v).textContent = n + (n === 1 ? ' término' : ' términos') + ' · ' + ns + ' siglas';
    $('#gempty', v).hidden = !!(n || ns);
  }

  /* ══ CAPÍTULO ═════════════════════════════ */
  function renderTopic(id, anchor) {
    var t = D.byId[id];
    if (!t) { location.hash = R('temas'); return null; }
    if (!PROG[t.id]) setProg(t.id, 1);
    var bk = D.BOOK[t.id], b = D.blockById[t.b] || { t: '' };
    var prev = D.TOPICS[t._i - 1], next = D.TOPICS[t._i + 1];
    var toc = [], body = '';
    function chap(n, k, title, inner) { return '<section class="chap" id="c' + n + '"><div class="chap-h"><span class="chap-n">' + n + '</span><div><div class="k">' + k + '</div><h2>' + title + '</h2></div></div>' + inner + '</section>'; }
    function blk(sid, title, inner) { toc.push([sid, title, 1]); return '<div class="blk" id="' + sid + '"><h3>' + title + '</h3>' + inner + '</div>'; }

    toc.push(['ch', 'Antes de leer']);
    body += chap(1, 'Parte 1', 'Antes de leer',
      blk('s-idea', 'La idea en una frase', '<p class="oneliner">' + esc(t.one) + '</p>') +
      blk('s-rec', 'Lo que te llevas de este capítulo', '<div class="recall"><div class="ck">Recuerda</div><ul>' + (t.rec || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>') +
      (t.vocab && t.vocab.length ? blk('s-vocab', 'Vocabulario mínimo para leer el capítulo', '<p class="vintro">Palabras que el libro usa sin explicar porque las da por sabidas. Son definiciones generales, no del libro.</p><dl class="gl">' + t.vocab.map(function (v) { return '<div><dt>' + esc(v[0]) + '</dt><dd>' + esc(v[1]) + '</dd></div>'; }).join('') + '</dl>') : '') +
      blk('s-como', 'Cómo leer el capítulo', '<div class="call analog"><div class="ck">Guía rápida</div><div class="dbody"><p>El texto del libro está <b>completo</b> y en su orden. Debajo de los apartados que lo necesitan hay un recuadro <b>«En sencillo»</b> con la idea en llano, una analogía o un ejemplo con números; las cuentas que no son del libro lo indican.</p><p>Si ves <mark class="dudoso" title="Pasaje dudoso de la transcripción">[¿?]</mark>, es un pasaje que no se leyó con seguridad: al final del capítulo tienes la lista de dudas para contrastar con el libro.</p></div></div>'));

    toc.push(['ch', 'El capítulo completo']);
    bk.secs.filter(function (s) { return s.lvl <= 2; }).forEach(function (s) { toc.push([s.id, s.t, s.lvl]); });
    body += chap(2, 'Parte 2', 'El capítulo completo', '<div class="libro">' + clean(bk.html) + '</div>');

    var tocHTML = '<div class="tt">En este capítulo</div><ol>' + toc.map(function (x) {
      if (x[0] === 'ch') return '<li class="ch">' + esc(x[1]) + '</li>';
      return '<li class="' + (x[2] === 2 ? 'sub' : '') + '"><a href="' + R('tema/' + t.id + '/' + x[0]) + '" data-sec="' + esc(x[0]) + '">' + esc(x[1]) + '</a></li>';
    }).join('') + '</ol><div class="tprog"><div class="l">Tu progreso: <span id="progLbl"></span></div><button type="button" class="pbtn" id="progBtn"></button></div>';

    $('#detail').innerHTML = '<div class="dtop"><a class="dback" href="' + R('temas') + '">← Capítulos</a><span class="sep">/</span><span>' + esc(b.t) + '</span><span class="sep">/</span><span>Capítulo ' + esc(t.num) + '</span></div>' +
      '<div class="dhero"><div><h1>' + esc(t.t) + '</h1><div class="dmeta"><span class="chip acc">Capítulo ' + esc(t.num) + '</span><span class="chip">' + esc(t.nsec) + ' apartados</span></div><p class="dhero-q">' + esc(t.q) + '</p></div>' +
      '<div class="dfacts"><h4>Ficha rápida</h4><dl><dt>Capítulo</dt><dd>' + esc(t.num) + '</dd><dt>Apartados</dt><dd>' + esc(t.nsec) + '</dd><dt>Texto</dt><dd>' + nf.format(t.pal || 0) + ' palabras</dd><dt>Fuente</dt><dd class="sm">' + esc((t.src || [])[0] || '—') + '</dd></dl></div></div>' +
      '<div class="study"><nav class="stoc" aria-label="Índice del capítulo">' + tocHTML + '</nav><div class="smain">' + body +
      '<nav class="dnav" aria-label="Capítulo anterior y siguiente">' + (prev ? '<a href="' + R('tema/' + prev.id) + '"><span class="nk">← Anterior</span><span class="nt">' + esc(prev.t) + '</span></a>' : '<span></span>') + (next ? '<a class="nx" href="' + R('tema/' + next.id) + '"><span class="nk">Siguiente →</span><span class="nt">' + esc(next.t) + '</span></a>' : '') + '</nav></div></div>';

    $$('.stoc a[data-sec]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var el = root.getElementById(a.dataset.sec); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
    $('#progBtn').addEventListener('click', function () { PROG[t.id] = PROG[t.id] === 2 ? 1 : 2; lsSet('prog', PROG); syncProgBtn(t); });
    syncProgBtn(t);
    if (tocObs) tocObs.disconnect();
    if ('IntersectionObserver' in window) {
      tocObs = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) { $$('.stoc a').forEach(function (a) { a.classList.toggle('on', a.dataset.sec === en.target.id); }); } }); }, { rootMargin: '-90px 0px -70% 0px' });
      $$('.blk, .libro h3[id], .libro h4[id]', $('#detail')).forEach(function (s) { tocObs.observe(s); });
    }
    return anchor && ID.test(anchor) ? anchor : null;
  }
  function syncProgBtn(t) {
    var p = PROG[t.id] || 0, bt = $('#progBtn'), l = $('#progLbl'); if (!bt) return;
    l.textContent = p === 2 ? 'Entendido' : 'En estudio';
    bt.textContent = p === 2 ? 'Marcar como en estudio' : 'Lo entiendo';
    bt.classList.toggle('on', p === 2);
  }

  /* ══ BUSCADOR (Ctrl K  o  /) ═════════════ */
  function openQk() {
    if (qk || !root) return;
    qkPrev = root.activeElement;
    qk = document.createElement('div'); qk.className = 'qk';
    qk.innerHTML = '<div class="qk-box" role="dialog" aria-modal="true" aria-label="Buscar en el manual"><input type="text" placeholder="Busca un concepto, una sigla o una palabra del texto…" aria-label="Buscar" autocomplete="off"><div class="qk-res" role="listbox"></div><div class="qk-foot"><span>↑ ↓ para moverte</span><span>Intro para abrir</span><span>Esc para cerrar</span></div></div>';
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
  function snippet(x, q) {
    if (!x.txt || norm(x.n).indexOf(q) > -1) return esc(plain(x.d));
    var i = norm(x.txt).indexOf(q); if (i < 0) return esc(plain(x.d));
    var a = Math.max(0, i - 50), z = Math.min(x.txt.length, i + q.length + 90);
    return (a ? '…' : '') + esc(x.txt.slice(a, i)) + '<mark>' + esc(x.txt.slice(i, i + q.length)) + '</mark>' + esc(x.txt.slice(i + q.length, z)) + (z < x.txt.length ? '…' : '');
  }
  function drawQk(raw) {
    var q = norm(raw.trim());
    if (q) {
      qkRes = D.IDX.filter(function (x) { return x.s.indexOf(q) > -1 || norm(x.n).indexOf(q) > -1; });
      qkRes.sort(function (a, b) { var ta = norm(a.n).indexOf(q) > -1 ? 0 : 1, tb = norm(b.n).indexOf(q) > -1 ? 0 : 1; return ta - tb || RANK[a.k] - RANK[b.k]; });
      qkRes = qkRes.slice(0, 30);
    } else qkRes = D.IDX.filter(function (x) { return x.k === 'Sección' || x.k === 'Capítulo'; }).slice(0, 12);
    $('.qk-res', qk).innerHTML = qkRes.length ? qkRes.map(function (x, i) { return '<button type="button" class="qk-it' + (i === qkSel ? ' on' : '') + '" role="option" aria-selected="' + (i === qkSel) + '" data-h="' + esc(x.h) + '"><span class="qi">' + esc(x.k) + '</span><span class="qt"><span class="qn">' + esc(x.n) + '</span><span class="qd">' + (q ? snippet(x, q) : esc(plain(x.d))) + '</span></span></button>'; }).join('') : '<div class="qk-empty">Sin resultados. Prueba con una palabra más corta.</div>';
  }
  function onKey(e) {
    if (!host || !host.isConnected) return;                    // otra pestaña del área privada: no es asunto del manual
    var t = (e.composedPath && e.composedPath()[0]) || e.target, typing = t && /^(input|textarea|select)$/i.test(t.tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); qk ? closeQk() : openQk(); }
    else if (e.key === '/' && !qk && !typing) { e.preventDefault(); openQk(); }
  }

  return { render: render, _clean: clean };
})();
