/* ═══════════════════════════════════════════════
   area-privada-mapa.js: pestaña «Mapa» del área privada (#/mapa)
   ─────────────────────────────────────────────────
   Dibuja la estructura del portfolio web (páginas y proyectos que enseña cada una), dónde vive
   cada cosa, el área privada, los datos y las herramientas como un árbol en cinco bloques, con
   flechas punteadas para las relaciones. Cada tipo de elemento tiene su color Y su forma (el color
   solo no basta). No lee nada de Supabase ni del servidor: el árbol viene de mapa/estructura.js,
   que genera tools/mapa/build-mapa.mjs leyendo el repositorio (CI comprueba que está al día).
   Estilos: css/mapa.css. El árbol es HTML (listas con botones); el SVG de flechas es decorativo
   y las mismas relaciones se leen como texto en el panel de detalle.
   ═══════════════════════════════════════════════ */
window.APMapa = (function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var WIDE = '(min-width: 1360px)';   // cinco columnas con flechas; el mismo corte que en css/mapa.css
  var MAX_REL = 14;                   // relaciones del mismo sentido que se listan en el panel

  var ctx = null, data = null;
  var byId, parentOf, colOf, subtree, labels, edges, root, canvas, svg, detail, famCount;
  var pinned = null, hover = null, famFilter = null, raf = 0;
  var collapsed = {}, lists = {}, toggles = {};
  var query = '', qCount = null;
  var mode = 'web', siteEl = null, sysEl = null, railSvg = null, railBox = null, rootPill = null, portEls = [], tabEls = {};
  var openCards = {}, bodies = {}, toggleBtns = {}, cardEls = {}, moreOf = {}, rootBodyOpen = false;
  function fold(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }   // grupos plegados, su <ul> y su botón

  /* ── Datos ── */
  function assetUrl() {
    var l = document.querySelector('link[data-ap-asset="mapa-datos"]');
    return new URL(l ? l.getAttribute('href') : './mapa/estructura.js', document.baseURI).href;
  }
  function index() {
    byId = {}; parentOf = {}; colOf = {}; subtree = {}; famCount = {};
    data.columnas.forEach(function (col, ci) {
      (function walk(n, parent) {
        byId[n.id] = n; parentOf[n.id] = parent; colOf[n.id] = ci;
        if (n.familia && ci > 0) famCount[n.familia] = (famCount[n.familia] || 0) + 1;     // la leyenda del sistema no cuenta la web
        var ids = [n.id];
        (n.hijos || []).forEach(function (c) { ids = ids.concat(walk(c, n.id)); });
        subtree[n.id] = ids;
        return ids;
      })(col, null);
    });
  }
  function foldable(n) { return !!(n.hijos && n.hijos.length) && (n.tipo === 'esquema' || (n.tipo === 'grupo' && colOf[n.id] === 0)); }
  function initCollapsed() {
    collapsed = {};
    Object.keys(byId).forEach(function (id) { if (foldable(byId[id])) collapsed[id] = true; });
  }
  // el elemento (o su antecesor plegado más alto) que se ve de verdad
  function shown(id) {
    var out = id;
    for (var cur = parentOf[id]; cur; cur = parentOf[cur]) if (collapsed[cur]) out = cur;
    return out;
  }
  function setFold(id, folded) {
    collapsed[id] = folded;
    if (lists[id]) lists[id].hidden = folded;
    if (toggles[id]) { toggles[id].setAttribute('aria-expanded', folded ? 'false' : 'true'); toggles[id].textContent = folded ? '▸' : '▾'; }
    schedule();
  }
  // abrir los grupos que esconden un elemento (al seleccionarlo desde el panel)
  function reveal(id) {
    if (colOf[id] === 0) return openFor(id);
    for (var cur = parentOf[id]; cur; cur = parentOf[cur]) if (collapsed[cur]) setFold(cur, false);
  }
  function color(fam) { return (data.familias[fam] || {}).color || '#44546F'; }

  function render(c) {
    ctx = c;
    return import(assetUrl()).then(function (m) { data = m.default; index(); return paint; });
  }

  /* ── Pintado ── */
  function paint() {
    var h = ctx.h;
    labels = {}; edges = []; pinned = null; hover = null; famFilter = null; lists = {}; toggles = {}; query = '';
    initCollapsed();
    ctx.view.textContent = '';

    var r = data.recuento;
    var ver = ['v' + data.huella, r.paginas + ' páginas', r.proyectos + ' proyectos', r.recursos + ' recursos', r.plataformas + ' plataformas y repos', r.pestanas + ' pestañas', r.tablas + ' tablas', r.funciones + ' funciones', r.herramientas + ' herramientas', r.relaciones + ' relaciones'].join(' · ');

    svg = svgEl('svg', { class: 'mp-edges', 'aria-hidden': 'true', focusable: 'false' });
    svg.appendChild(marker('mp-arrow', '#6f7a8f'));
    Object.keys(data.familias).forEach(function (f) { svg.appendChild(marker('mp-arrow-' + f, color(f))); });

    openCards = {}; bodies = {}; toggleBtns = {}; cardEls = {}; moreOf = {}; rootBodyOpen = false; portEls = []; tabEls = {}; mode = 'web'; alojaDe = null;
    canvas = h('div', { class: 'mp-canvas' }, [
      h('header', { class: 'mp-head' }, [
        h('h2', { class: 'mp-title', id: 'mp-title' }, [
          h('span', { class: 'mp-lab' }, [
            'Mapa del portfolio',
            h('span', { class: 'mp-note mp-note--l', text: 'toda la estructura y cómo se relaciona' }),
            h('span', { class: 'mp-note', text: 'se genera sola desde el repositorio' })
          ])
        ]),
        h('p', { class: 'mp-ver', text: ver })
      ]),
      h('div', { class: 'mp-stem', 'aria-hidden': 'true' }),
      h('div', { class: 'mp-cols' }, data.columnas.slice(1).map(column)),
      svg
    ]);
    canvas.querySelector('.mp-cols').style.setProperty('--cols', '4');

    detail = h('section', { class: 'mp-detail', 'aria-live': 'polite', 'aria-label': 'Detalle del elemento seleccionado', hidden: true });

    siteEl = site();
    sysEl = h('div', { class: 'mp-sys', hidden: true }, [
      h('p', { class: 'ape-meta', text: 'Cómo funciona por dentro: dónde vive cada cosa, el área privada, los datos y las herramientas. Pulsa un elemento para ver con qué se relaciona. El menú que repiten todas las páginas no se dibuja.' }),
      legend(),
      canvas,
      foot()
    ]);
    root = h('section', { class: 'mp is-web', 'aria-labelledby': 'mp-title' }, [hero(), siteEl, sysEl, detail]);
    ctx.view.appendChild(root);

    data.relaciones.forEach(function (rel) {
      var weak = !!(data.verbos[rel.tipo] || {}).debil;
      var p = svgEl('path', { class: 'mp-edge mp-edge--' + rel.tipo + (weak ? ' is-weak' : ''), 'marker-end': 'url(#mp-arrow)' });
      svg.appendChild(p);
      edges.push({ rel: rel, el: p });
    });

    if (window.ResizeObserver) new ResizeObserver(schedule).observe(siteEl);
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (pinned || famFilter)) { e.stopPropagation(); famFilter = null; select(null); } });
    // Las flechas dependen de la posición real de cada etiqueta: se recalculan al cambiar el tamaño o cargar la fuente
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(canvas);
    window.addEventListener('resize', onWindowResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    schedule();
  }

  function onWindowResize() {
    if (!canvas || !canvas.isConnected) return window.removeEventListener('resize', onWindowResize);
    schedule();
  }

  function column(col) {
    var h = ctx.h;
    var btn = labelButton(col);
    return h('div', { class: 'mp-col' }, [
      h('h3', { class: 'mp-colhead' }, [h('span', { class: 'mp-lab' }, [btn, h('span', { class: 'mp-note', text: col.nota })])]),
      h('ul', { class: 'mp-tree' }, (col.hijos || []).map(node))
    ]);
  }

  function node(n) {
    var h = ctx.h;
    // la nota va sobre la propia rama solo en los grupos; en el resto se lee en el panel de detalle
    var inline = n.nota && n.tipo === 'grupo';
    var kids = n.hijos && n.hijos.length ? h('ul', { hidden: !!collapsed[n.id] }, n.hijos.map(node)) : null;
    var tog = null;
    if (kids && foldable(n)) {
      lists[n.id] = kids;
      tog = h('button', {
        type: 'button', class: 'mp-tog', 'aria-expanded': collapsed[n.id] ? 'false' : 'true', 'aria-label': 'Mostrar u ocultar el contenido de ' + n.etiqueta,
        text: collapsed[n.id] ? '▸' : '▾', onclick: function () { setFold(n.id, !collapsed[n.id]); }
      });
      toggles[n.id] = tog;
    }
    return h('li', { class: 'mp-node' + (inline ? ' mp-node--note' : '') }, [
      h('div', { class: 'mp-row' }, [
        tog,
        h('span', { class: 'mp-lab' }, [labelButton(n), inline ? h('span', { class: 'mp-note mp-note--sub', text: n.nota }) : null]),
        tog ? h('span', { class: 'mp-count', text: String(n.hijos.length) }) : null
      ]),
      kids
    ]);
  }

  function labelButton(n) {
    var attrs = {
      type: 'button', class: 'mp-label mp-t-' + n.tipo, 'data-id': n.id, 'aria-pressed': 'false', text: n.etiqueta,
      onclick: function () { select(pinned === n.id ? null : n.id); },
      onmouseenter: function () { hover = n.id; refresh(); },
      onmouseleave: function () { hover = null; refresh(); },
      onfocus: function () { hover = n.id; refresh(); },
      onblur: function () { hover = null; refresh(); }
    };
    if (n.familia) { attrs['data-fam'] = n.familia; attrs['data-shape'] = (data.familias[n.familia] || {}).forma || 'circulo'; }
    var b = ctx.h('button', attrs);
    if (n.familia) b.style.setProperty('--fam', color(n.familia));
    labels[n.id] = b;
    return b;
  }

  /* Barra: búsqueda y vistas por pregunta */
  function bar() {
    var h = ctx.h;
    qCount = h('span', { class: 'mp-q-n', 'aria-live': 'polite' });
    var input = h('input', {
      type: 'search', class: 'mp-q', placeholder: 'Buscar un proyecto, página, tabla o tecnología', 'aria-label': 'Buscar en el mapa', autocomplete: 'off',
      oninput: function (e) { query = e.target.value; applySearch(); },
      onkeydown: function (e) {
        if (e.key === 'Enter') { var first = root.querySelector('.mp-label.is-hit'); if (first) { e.preventDefault(); select(first.getAttribute('data-id')); } }
        if (e.key === 'Escape' && query) { e.stopPropagation(); e.target.value = ''; query = ''; applySearch(); }
      }
    });
    return h('div', { class: 'mp-bar' }, [
      h('label', { class: 'mp-search' }, [h('span', { class: 'sr-only', text: 'Buscar en el mapa' }), input, qCount])
    ]);
  }

  /* ═══════════ VISTA «PORTFOLIO WEB»: mapa del sitio por secciones ═══════════ */
  var PL = {
    caso: ['dashboard', 'dashboards'], app: ['app', 'apps'], proyecto: ['proyecto de código', 'proyectos de código'], visual: ['visualización', 'visualizaciones'],
    lab: ['archivo .pbix', 'archivos .pbix'], grafico: ['gráfico nativo', 'gráficos nativos'], post: ['post', 'posts'], manual: ['manual', 'manuales'],
    capitulo: ['capítulo', 'capítulos'], perfil: ['punto de perfil', 'puntos de perfil']
  };
  var ORDEN = ['caso', 'app', 'proyecto', 'visual', 'lab', 'manual', 'capitulo', 'perfil', 'grafico', 'post'];
  var MONO = { GitHub: 'GH', 'Streamlit Cloud': 'ST', 'Power BI Service': 'PB', Behance: 'BE', LinkedIn: 'LI', 'Google Drive': 'GD', 'GitHub Pages': 'GP' };
  var alojaDe = null;
  function plural(t, n) { var p = PL[t] || [t, t]; return n === 1 ? p[0] : p[1]; }
  function sec(id) { return (data.secciones || {})[id] || { color: '#586278', tinta: '#586278' }; }
  function domId(id) { return 'mp-' + String(id).replace(/[^a-z0-9]+/gi, '-'); }
  function webNodes() { return (data.columnas[0].hijos || []); }
  function sections() { return webNodes().filter(function (n) { return n.tipo === 'pagina' || n.tipo === 'manual' || n.tipo === 'app'; }); }

  // Elementos únicos por tipo: ni los grupos ni las referencias (repeticiones de algo que vive en otra sección) cuentan
  function counts(list) {
    var c = {};
    (function walk(l) {
      l.forEach(function (k) {
        if (k.ref) return;
        if (k.tipo !== 'grupo') c[k.tipo] = (c[k.tipo] || 0) + 1;
        walk(k.hijos || []);
      });
    })(list);
    return c;
  }
  function platforms(n) {
    if (!alojaDe) { alojaDe = {}; data.relaciones.forEach(function (r) { if (r.tipo === 'aloja') (alojaDe[r.de] = alojaDe[r.de] || []).push(r.a); }); }
    var by = {};
    (function walk(l) {
      l.forEach(function (k) {
        if (k.ref) return;
        (alojaDe[k.id] || []).forEach(function (a) {
          var t = byId[a], name = t ? (t.tipo === 'repo' ? 'GitHub' : t.etiqueta) : null;
          if (name) (by[name] = by[name] || {})[k.id] = 1;
        });
        walk(k.hijos || []);
      });
    })(n.hijos || []);
    return Object.keys(by).map(function (k) { return { n: k, c: Object.keys(by[k]).length }; }).sort(function (x, y) { return y.c - x.c; });
  }
  function dot(t) {
    var d = ctx.h('span', { class: 'mp-dot', 'data-shape': (data.familias[t] || {}).forma || 'circulo', 'aria-hidden': 'true' });
    d.style.setProperty('--fam', '#3A4255');
    return d;
  }

  /* Cabecera: qué es, cuánto hay (cifras que filtran) y cómo cambiar de vista */
  function hero() {
    var h = ctx.h, tot = {}, paginas = webNodes().filter(function (n) { return n.tipo === 'pagina'; }).length;
    sections().forEach(function (n) { var c = counts(n.hijos || []); Object.keys(c).forEach(function (t) { tot[t] = (tot[t] || 0) + c[t]; }); });
    var figs = [h('li', null, h('span', { class: 'mp-fig mp-fig--static' }, [h('b', { text: String(paginas) }), h('span', { text: 'páginas del menú' })]))];
    ['caso', 'app', 'proyecto', 'visual', 'lab', 'manual'].forEach(function (t) {
      if (!tot[t]) return;
      figs.push(h('li', null, h('button', { type: 'button', class: 'mp-fig', 'data-fam': t, 'aria-pressed': 'false', onclick: function () { famFilter = famFilter === t ? null : t; refresh(); } }, [
        dot(t), h('b', { text: String(tot[t]) }), h('span', { text: plural(t, tot[t]) + (t === 'manual' && tot.capitulo ? ' · ' + tot.capitulo + ' capítulos' : '') })
      ])));
    });
    var r = data.recuento;
    var tabs = h('div', { class: 'mp-tabs', role: 'group', 'aria-label': 'Vista' }, [['web', 'Portfolio web'], ['sys', 'Sistema']].map(function (v) {
      var b = h('button', { type: 'button', class: 'mp-tab', 'aria-pressed': v[0] === 'web' ? 'true' : 'false', text: v[1], onclick: function () { setMode(v[0]); } });
      tabEls[v[0]] = b;
      return b;
    }));
    return h('header', { class: 'mp-hero' }, [
      h('div', { class: 'mp-eyebrow' }, [h('span', { text: 'Área privada · Mapa · Portfolio web' }), h('span', { text: 'v' + data.huella + ' · generado desde el repositorio' })]),
      h('h2', { class: 'mp-h1', id: 'mp-title', text: 'Cómo está formado mi portfolio web' }),
      h('p', { class: 'mp-sub', text: 'Cada tarjeta es una sección del menú, con lo que enseña y dónde vive. Pulsa una cifra para ver dónde está ese tipo de contenido.' }),
      h('ul', { class: 'mp-figs', 'aria-label': 'Cifras del portfolio' }, figs),
      h('div', { class: 'mp-tools' }, [tabs, bar()])
    ]);
  }

  /* Mapa del sitio: raíz «Inicio», bus, un puerto por sección, tarjetas y la banda de lo que no cuelga del menú */
  function site() {
    var h = ctx.h;
    var ports = [], cards = [];
    var all = sections();
    var index = all.filter(function (n) { return n.id === 'p:index'; })[0];
    var priv = byId['p:privacidad'];
    var body = all.filter(function (n) { return n.id !== 'p:index' && n.id !== 'p:privacidad'; });
    body.forEach(function (n, i) {
      ports.push(port(n, i));
      cards.push(card(n, i));
    });
    if (priv) ports.push(port(priv, body.length));
    railBox = h('div', { class: 'mp-rail-box' }, [
      railSvg = svgEl('svg', { class: 'mp-rail-svg', 'aria-hidden': 'true', focusable: 'false' }),
      index ? rootBlock(index) : null,
      h('div', { class: 'mp-ports', role: 'list', 'aria-label': 'Secciones del menú' }, ports)
    ]);
    return h('div', { class: 'mp-site' }, [railBox, h('div', { class: 'mp-grid' }, cards), band()]);
  }

  function rootBlock(n) {
    var h = ctx.h;
    // lo que destaca la portada: sus proyectos propios y las referencias a los de otras secciones
    var c = {};
    (function walk(l) { l.forEach(function (k) { if (k.tipo !== 'grupo') c[k.tipo] = (c[k.tipo] || 0) + 1; walk(k.hijos || []); }); })(n.hijos || []);
    var partes = ORDEN.filter(function (t) { return c[t]; }).map(function (t) { return c[t] + ' ' + plural(t, c[t]); });
    var sc = sec(n.id);
    var pill = labelButton(n);
    pill.classList.add('mp-root');
    pill.textContent = 'Inicio · portada';
    pill.style.setProperty('--pg-ink', sc.tinta);
    rootPill = pill;
    var rb = h('div', { class: 'mp-rootbody', id: domId(n.id), hidden: true }, rowsOf(n.hijos || []));
    bodies[n.id] = rb;
    var tg = h('button', { type: 'button', class: 'mp-toggle mp-toggle--root', 'aria-expanded': 'false', 'aria-controls': domId(n.id), text: 'Ver qué destaca', onclick: function () { setCard(n.id, !openCards[n.id]); } });
    toggleBtns[n.id] = tg;
    return h('div', { class: 'mp-root-wrap' }, [pill, h('p', { class: 'mp-root-sub', text: partes.length ? 'destaca ' + partes.join(' · ') : 'portada del sitio' }), tg, rb]);
  }

  function port(n, i) {
    var h = ctx.h, sc = sec(n.id);
    var b = h('button', {
      type: 'button', class: 'mp-port', role: 'listitem', 'data-sec': n.id,
      onclick: function () {
        if (cardEls[n.id]) { setCard(n.id, true); cardEls[n.id].scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        select(n.id);
      }
    }, [h('span', { class: 'mp-port-n', text: String(i + 1).padStart(2, '0') }), n.etiqueta]);
    b.style.setProperty('--pg-ink', sc.tinta);
    portEls.push(b);
    return b;
  }

  function card(n, i) {
    var h = ctx.h, sc = sec(n.id), cnt = counts(n.hijos || []);
    var total = Object.keys(cnt).reduce(function (a, k) { return a + cnt[k]; }, 0);
    var pills = ORDEN.filter(function (t) { return cnt[t]; }).map(function (t) {
      return h('li', { class: 'mp-pill', 'data-fam': t }, [dot(t), h('b', { text: String(cnt[t]) }), h('span', { text: plural(t, cnt[t]) })]);
    });
    var plats = platforms(n).slice(0, 5).map(function (p) {
      return h('li', { class: 'mp-plat' }, [h('span', { class: 'mp-mono', 'aria-hidden': 'true', text: MONO[p.n] || p.n.slice(0, 2).toUpperCase() }), p.n + ' ' + p.c]);
    });
    var name = labelButton(n);
    name.classList.add('mp-card-name');
    var tg = h('button', {
      type: 'button', class: 'mp-toggle', 'aria-expanded': 'false', 'aria-controls': domId(n.id), text: 'Ver contenido (' + total + ')',
      onclick: function () { setCard(n.id, !openCards[n.id]); }
    });
    toggleBtns[n.id] = tg;
    var bodyEl = h('div', { class: 'mp-body', id: domId(n.id), hidden: true }, rowsOf(n.hijos || []));
    bodies[n.id] = bodyEl;
    var el = h('article', { class: 'mp-card' + (n.id === 'p:descargas' ? ' mp-card--wide' : ''), id: 'sec-' + domId(n.id), 'data-sec': n.id }, [
      h('div', { class: 'mp-card-head' }, [
        h('span', { class: 'mp-num', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') }),
        name,
        n.href ? h('a', { class: 'mp-open', href: n.href, target: '_blank', rel: 'noopener', 'aria-label': 'Abrir ' + n.etiqueta + ' en una pestaña nueva', text: (n.archivo || 'abrir') + ' ↗' }) : null
      ]),
      n.nota ? h('p', { class: 'mp-note-line', text: n.nota }) : null,
      pills.length ? h('ul', { class: 'mp-pills', 'aria-label': 'Contenido de ' + n.etiqueta }, pills) : h('p', { class: 'mp-empty', text: 'Sin elementos propios.' }),
      plats.length ? h('ul', { class: 'mp-plats', 'aria-label': 'Dónde vive' }, plats) : null,
      total ? tg : null,
      bodyEl
    ]);
    el.style.setProperty('--pg', sc.color);
    el.style.setProperty('--pg-ink', sc.tinta);
    cardEls[n.id] = el;
    return el;
  }

  // Filas del contenido de una sección: grupos con su recuento y elementos; las referencias llevan ↗ y apuntan al original
  function rowsOf(list) {
    var h = ctx.h, out = [];
    list.forEach(function (k) {
      if (k.tipo === 'grupo') {
        out.push(h('div', { class: 'mp-grp' }, [
          h('h4', { class: 'mp-grp-h' }, [k.etiqueta.replace(/\/$/, ''), h('span', { class: 'mp-grp-n', text: String((k.hijos || []).length) })]),
          limited(k.hijos || [])
        ]));
      } else out.push(h('ul', { class: 'mp-items' }, [h('li', null, item(k))]));
    });
    return out;
  }
  function limited(items) {
    var h = ctx.h, CAP = 8, extra = [];
    var ul = h('ul', { class: 'mp-items' });
    items.forEach(function (k, i) {
      var li = h('li', null, item(k));
      if (i >= CAP) { li.hidden = true; extra.push({ li: li, id: k.id }); }
      ul.appendChild(li);
    });
    if (!extra.length) return ul;
    var more = h('button', { type: 'button', class: 'mp-more', text: 'Ver los ' + items.length });
    function expand() { extra.forEach(function (x) { x.li.hidden = false; }); more.hidden = true; }
    more.addEventListener('click', expand);
    extra.forEach(function (x) { moreOf[x.id] = expand; });
    return h('div', null, [ul, more]);
  }
  function item(k) {
    var h = ctx.h, b = labelButton(k);
    b.classList.add('mp-item');
    if (k.ref) { b.classList.add('is-ref'); b.setAttribute('title', 'También aparece aquí; vive en su sección'); }
    var kids = (k.hijos || []).length ? h('div', { class: 'mp-sub' }, rowsOf(k.hijos)) : null;
    return [b, kids];
  }

  /* Lo que no cuelga del menú (o solo del pie), con borde discontinuo */
  function band() {
    var h = ctx.h, g = byId['g:web:huerfanas'], priv = byId['p:privacidad'], en = byId['x:en'];
    var chips = [];
    if (g) (g.hijos || []).forEach(function (n) { var b = labelButton(n); b.classList.add('mp-chipx', 'is-orphan'); chips.push(h('li', null, [b, h('span', { class: 'mp-chipx-note', text: 'sin enlace desde el menú' })])); });
    if (priv) { var p = labelButton(priv); p.classList.add('mp-chipx'); chips.push(h('li', null, [p, h('span', { class: 'mp-chipx-note', text: 'pie de página' })])); }
    return h('section', { class: 'mp-band', 'aria-label': 'Fuera de la navegación' }, [
      h('h3', { class: 'mp-band-h', text: 'Fuera del menú' }),
      h('ul', { class: 'mp-chips' }, chips),
      en ? h('p', { class: 'mp-band-foot', text: 'Versión en inglés de cada página: ' + en.etiqueta + ' (' + en.archivo + ')' }) : null
    ]);
  }

  function setCard(id, open) {
    openCards[id] = open;
    if (bodies[id]) bodies[id].hidden = !open;
    if (toggleBtns[id]) {
      toggleBtns[id].setAttribute('aria-expanded', open ? 'true' : 'false');
      var t = toggleBtns[id].textContent;
      toggleBtns[id].textContent = toggleBtns[id].classList.contains('mp-toggle--root') ? (open ? 'Ocultar' : 'Ver qué destaca') : t.replace(/^(Ver|Ocultar)/, open ? 'Ocultar' : 'Ver');
    }
    schedule();
  }
  // abrir lo que esconde un elemento de la web: su sección y, si hace falta, el «Ver los N» de su lista
  function openFor(id) {
    for (var cur = id; cur; cur = parentOf[cur]) if (bodies[cur] && cur !== id) { setCard(cur, true); break; }
    if (moreOf[id]) moreOf[id]();
  }

  function setMode(m) {
    mode = m;
    root.classList.toggle('is-web', m === 'web');
    root.classList.toggle('is-sys', m === 'sys');
    siteEl.hidden = m !== 'web';
    sysEl.hidden = m !== 'sys';
    Object.keys(tabEls).forEach(function (k) { tabEls[k].setAttribute('aria-pressed', k === m ? 'true' : 'false'); });
    if (pinned && (colOf[pinned] === 0 ? 'web' : 'sys') !== m) { pinned = null; paintDetail(); refresh(); }
    schedule();
  }

  // El bus: del «Inicio» baja un tallo, un raíl horizontal y una bajante a cada puerto de sección
  function drawRail() {
    if (!railSvg || !railSvg.isConnected || !rootPill || !portEls.length) return;
    var box = railBox.getBoundingClientRect();
    while (railSvg.firstChild) railSvg.removeChild(railSvg.firstChild);
    railSvg.setAttribute('viewBox', '0 0 ' + Math.round(box.width) + ' ' + Math.round(box.height));
    if (box.width < 1000) return;
    var rp = rootPill.getBoundingClientRect(), x0 = rp.left + rp.width / 2 - box.left;
    var tops = portEls.map(function (p) { var r = p.getBoundingClientRect(); return { x: r.left + r.width / 2 - box.left, y: r.top - box.top }; });
    var yPort = Math.min.apply(null, tops.map(function (t) { return t.y; }));
    var yRail = yPort - 16;
    var rootBottom = ((document.querySelector('.mp-root-wrap') || rootPill).getBoundingClientRect().bottom - box.top) + 2;
    var xs = tops.map(function (t) { return t.x; }).concat([x0]);
    var d = 'M' + x0 + ' ' + rootBottom + ' V' + yRail + ' M' + Math.min.apply(null, xs) + ' ' + yRail + ' H' + Math.max.apply(null, xs);
    tops.forEach(function (t) { d += ' M' + t.x + ' ' + yRail + ' V' + (t.y - 2); });
    railSvg.appendChild(svgEl('path', { class: 'mp-rail-path', d: d }));
    tops.forEach(function (t) { railSvg.appendChild(svgEl('circle', { class: 'mp-rail-dot', cx: String(t.x), cy: String(yRail), r: '3.5' })); });
  }

  /* Búsqueda: resalta lo que coincide y abre los grupos que lo esconden */
  function applySearch() {
    var q = fold(query).trim();
    var hits = [];
    if (q.length >= 2) Object.keys(byId).forEach(function (id) {
      var n = byId[id];
      if (n.tipo === 'columna') return;
      if (fold([n.etiqueta, (n.tec || []).join(' '), n.archivo || '', n.nota || ''].join(' ')).indexOf(q) >= 0) hits.push(id);
    });
    root.classList.toggle('has-q', q.length >= 2);
    Object.keys(labels).forEach(function (id) { labels[id].classList.toggle('is-hit', hits.indexOf(id) >= 0); });
    if (hits.length && !hits.some(function (id) { return (colOf[id] === 0 ? 'web' : 'sys') === mode; })) setMode(colOf[hits[0]] === 0 ? 'web' : 'sys');
    if (hits.length && hits.length <= 60) hits.forEach(function (id) { reveal(id); });
    qCount.textContent = q.length < 2 ? '' : hits.length ? hits.length + (hits.length === 1 ? ' resultado' : ' resultados') + ' · Intro para abrir el primero' : 'Sin resultados';
    schedule();
  }

  /* Leyenda: cada tipo con su color y su forma; pulsarla resalta todos los de ese tipo */
  function legend() {
    var h = ctx.h;
    var fams = Object.keys(data.familias).filter(function (f) { return famCount[f]; });
    return h('div', { class: 'mp-legend', role: 'group', 'aria-label': 'Tipos de elemento' }, [
      fams.map(function (f) {
        var def = data.familias[f];
        var b = h('button', {
          type: 'button', class: 'mp-key', 'data-fam': f, 'data-shape': def.forma, 'aria-pressed': 'false',
          onclick: function () { famFilter = famFilter === f ? null : f; refresh(); }
        }, [h('span', { class: 'mp-key-name', text: def.nombre }), h('span', { class: 'mp-key-n', text: String(famCount[f]) })]);
        b.style.setProperty('--fam', def.color);
        return b;
      }),
      h('button', { type: 'button', class: 'mp-fold', text: 'Desplegar todo', onclick: function (e) {
        var open = e.target.getAttribute('data-open') !== '1';
        Object.keys(lists).forEach(function (id) { setFold(id, !open); });
        e.target.setAttribute('data-open', open ? '1' : '0'); e.target.textContent = open ? 'Plegar todo' : 'Desplegar todo';
      } }),
      h('label', { class: 'mp-all' }, [
        h('input', { type: 'checkbox', onchange: function (e) { root.classList.toggle('show-all', e.target.checked); } }),
        'Dibujar todas las relaciones'
      ])
    ]);
  }

  function foot() {
    var h = ctx.h;
    var miss = data.sinExplicar || [];
    return h('div', { class: 'mp-foot' }, [
      h('p', { class: 'mp-legend-line' }, [
        (function () {
          var s = svgEl('svg', { viewBox: '0 0 34 10', 'aria-hidden': 'true', focusable: 'false' });
          s.appendChild(svgEl('path', { class: 'mp-edge', d: 'M1 5 H27' }));
          s.appendChild(svgEl('path', { class: 'mp-arrow-path', d: 'M24 1.5 L30 5 L24 8.5' }));
          return s;
        })(),
        ' relación entre elementos (enseña, enlaza, monta, genera…). Con la casilla se dibujan también dónde vive cada cosa, el uso de tablas, las comprobaciones y el «siguiente caso». Las ramas continuas indican que un elemento contiene a otro.'
      ]),
      miss.length
        ? h('details', { class: 'mp-miss' }, [
          h('summary', { text: miss.length + (miss.length === 1 ? ' enlace del contenido que el mapa no sabe clasificar' : ' enlaces del contenido que el mapa no sabe clasificar') }),
          h('ul', null, miss.map(function (m) { return h('li', null, [h('code', { text: m.url }), ' · ' + m.paginas.join(', ')]); }))
        ])
        : h('p', { class: 'mp-legend-line', text: 'Todos los enlaces del contenido están clasificados' + ((data.ignorados || []).length ? '; se ignoran a propósito los de ' + data.ignorados.map(function (d) { return d.dominio; }).join(', ') + '.' : '.') })
    ]);
  }

  /* ── SVG ── */
  function svgEl(name, attrs) {
    var el = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function marker(id, stroke) {
    var m = svgEl('marker', { id: id, viewBox: '0 0 10 10', refX: '8.5', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto' });
    m.appendChild(svgEl('path', { d: 'M1.5 1.5 L8.5 5 L1.5 8.5', fill: 'none', stroke: stroke, 'stroke-width': '1.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return m;
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; draw(); });
  }

  // Una flecha sale por el lado de la etiqueta que mira a la columna de destino y entra por el lado que mira a la de origen.
  function draw() {
    if (!canvas || !canvas.isConnected) return;
    if (mode === 'web') return drawRail();
    var cb = canvas.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + Math.round(cb.width) + ' ' + Math.round(cb.height));
    if (!window.matchMedia(WIDE).matches) return;
    var drawn = {};
    edges.forEach(function (e) {
      var ia = shown(e.rel.de), ib = shown(e.rel.a);
      var a = labels[ia], b = labels[ib];
      var key = ia + '|' + ib, active = e.el.classList.contains('is-on');
      // dos relaciones que acaban en el mismo par de elementos visibles se dibujan una vez; si ambos extremos son el mismo grupo, ninguna
      var web = colOf[ia] === 0 || colOf[ib] === 0;       // las relaciones de la web se leen en el panel; el lienzo del sistema no las dibuja
      e.el.classList.toggle('is-folded', web || !a || !b || ia === ib || (!active && !!drawn[key]));
      if (web || !a || !b || ia === ib) return;
      if (!active) drawn[key] = true;
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var ay = ra.top + ra.height / 2 - cb.top, by = rb.top + rb.height / 2 - cb.top;
      var ca = colOf[ia], cbi = colOf[ib], d;
      if (ca === cbi) {                                      // misma columna: bucle por el lado derecho
        var sx = ra.right - cb.left + 3, ex = rb.right - cb.left + 6;
        var bulge = 30 + Math.min(70, Math.abs(by - ay) * 0.12);
        d = 'M' + sx + ' ' + ay + ' C' + (Math.max(sx, ex) + bulge) + ' ' + ay + ' ' + (Math.max(sx, ex) + bulge) + ' ' + by + ' ' + ex + ' ' + by;
      } else {
        var dir = ca < cbi ? 1 : -1;
        var x1 = (dir > 0 ? ra.right : ra.left) - cb.left + dir * 3;
        var x2 = (dir > 0 ? rb.left : rb.right) - cb.left - dir * 7;
        var k = Math.max(40, Math.abs(x2 - x1) * 0.5);
        d = 'M' + x1 + ' ' + ay + ' C' + (x1 + dir * k) + ' ' + ay + ' ' + (x2 - dir * k) + ' ' + by + ' ' + x2 + ' ' + by;
      }
      e.el.setAttribute('d', d);
    });
  }

  /* ── Selección ── */
  function relevant(rel, id) {
    var n = byId[id];
    if (n.tipo === 'tabla') {            // una tabla solo toca las relaciones de su esquema que la nombran
      var p = parentOf[id];
      return rel.a === p && (rel.detalle || []).indexOf(n.etiqueta) >= 0;
    }
    var ids = subtree[id];
    return ids.indexOf(rel.de) >= 0 || ids.indexOf(rel.a) >= 0;
  }
  function otherEnd(rel, id) {
    var ids = byId[id].tipo === 'tabla' ? [parentOf[id]] : subtree[id];
    var out = [];
    if (ids.indexOf(rel.de) < 0) out.push(rel.de);
    if (ids.indexOf(rel.a) < 0) out.push(rel.a);
    return out;
  }
  // la flecha toma el color de quien la origina (la familia de su origen)
  function originColor(rel) { var n = byId[rel.de]; return n && n.familia ? color(n.familia) : null; }

  function select(id) {
    if (id) { var m = colOf[id] === 0 ? 'web' : 'sys'; if (m !== mode) setMode(m); }
    pinned = id;
    if (id) reveal(id);
    refresh();
    paintDetail();
    schedule();
  }

  function refresh() {
    var id = pinned || hover;
    root.classList.toggle('has-active', !!id);
    root.classList.toggle('has-fam', !!famFilter && !id);
    var related = {};
    edges.forEach(function (e) {
      var on = !!id && relevant(e.rel, id);
      var c = on ? originColor(e.rel) : null;
      e.el.classList.toggle('is-on', on);
      if (c) e.el.style.setProperty('--ec', c); else e.el.style.removeProperty('--ec');
      var fam = on && byId[e.rel.de] && byId[e.rel.de].familia;
      e.el.setAttribute('marker-end', 'url(#' + (fam ? 'mp-arrow-' + fam : 'mp-arrow') + ')');
      if (on) otherEnd(e.rel, id).forEach(function (o) { related[o] = true; });
    });
    Object.keys(labels).forEach(function (k) {
      var b = labels[k];
      b.classList.toggle('is-active', k === id);
      b.classList.toggle('is-rel', !!related[k] && k !== id);
      b.classList.toggle('is-fam', !!famFilter && b.getAttribute('data-fam') === famFilter);
      b.setAttribute('aria-pressed', k === pinned ? 'true' : 'false');
    });
    schedule();
    [].forEach.call(root.querySelectorAll('.mp-pill, .mp-fig[data-fam]'), function (p) {
      var on = !!famFilter && p.getAttribute('data-fam') === famFilter;
      p.classList.toggle('is-fam', on);
      p.classList.toggle('is-dim', !!famFilter && !on);
      if (p.tagName === 'BUTTON') p.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    [].forEach.call(root.querySelectorAll('.mp-key'), function (k) { k.setAttribute('aria-pressed', k.getAttribute('data-fam') === famFilter ? 'true' : 'false'); });
  }

  /* ── Detalle ── */
  function paintDetail() {
    var h = ctx.h;
    detail.textContent = '';
    if (!pinned) { detail.hidden = true; return; }
    var n = byId[pinned];
    // Si el elemento contiene a otros (una página con sus proyectos), varias relaciones apuntan al mismo sitio:
    // se agrupan por verbo y destino y se cuenta cuántas son.
    var out = [], inc = [], seen = {};
    data.relaciones.filter(function (r) { return relevant(r, pinned); }).forEach(function (r) {
      var verbo = (data.verbos[r.tipo] || {}).verbo || r.tipo;
      otherEnd(r, pinned).forEach(function (oid) {
        var other = byId[oid];
        if (!other) return;
        var outgoing = oid === r.a, key = (outgoing ? '>' : '<') + verbo + '|' + oid;
        if (seen[key]) { seen[key].n++; return; }
        seen[key] = { id: oid, other: other, verbo: verbo, detalle: r.detalle, n: 1 };
        (outgoing ? out : inc).push(seen[key]);
      });
    });

    var open = n.href && !n.href.indexOf('#') ? { href: n.href } : n.href ? { href: n.href, target: '_blank', rel: 'noopener' } : null;
    var title = h('strong', { class: 'mp-d-name' }, [n.familia ? keyDot(n.familia) : null, n.etiqueta]);
    detail.appendChild(h('div', { class: 'mp-d-top' }, [
      title,
      h('span', { class: 'mp-d-type', text: data.tipos[n.tipo] || n.tipo }),
      n.archivo ? h('span', { class: 'mp-d-path', text: n.archivo }) : null,
      h('span', { class: 'mp-d-actions' }, [
        open ? h('a', { class: 'mp-d-link', href: open.href, target: open.target, rel: open.rel, text: open.target ? 'Abrir ↗' : 'Ir a la pestaña' }) : null,
        h('button', { type: 'button', class: 'mp-d-close', text: 'Quitar selección', onclick: function () { select(null); } })
      ])
    ]));
    if (n.nota) detail.appendChild(h('p', { class: 'mp-d-note', text: n.nota }));
    if (n.tec && n.tec.length) detail.appendChild(h('ul', { class: 'mp-d-tec', 'aria-label': 'Tecnologías' }, n.tec.map(function (t) { return h('li', { text: t }); })));

    var sections = [];
    if (out.length) sections.push(relList('Va hacia', out, true));
    if (inc.length) sections.push(relList('Le llegan', inc, false));
    detail.appendChild(sections.length ? h('div', { class: 'mp-d-cols' }, sections) : h('p', { class: 'mp-d-empty', text: 'Sin relaciones detectadas todavía.' }));
    detail.hidden = false;
  }

  function keyDot(fam) {
    var d = ctx.h('span', { class: 'mp-dot', 'data-shape': (data.familias[fam] || {}).forma || 'circulo', 'aria-hidden': 'true' });
    d.style.setProperty('--fam', color(fam));
    return d;
  }

  function relList(heading, list, outgoing) {
    var h = ctx.h;
    var shown = list.slice(0, MAX_REL);
    return h('div', { class: 'mp-d-col' }, [
      h('h4', { class: 'mp-d-h', text: heading + ' (' + list.length + ')' }),
      h('ul', { class: 'mp-d-rels' }, shown.map(function (x) {
        return h('li', null, [
          h('span', { class: 'mp-d-verb', text: x.verbo + (outgoing ? ' → ' : ' ← ') }),
          h('button', { type: 'button', class: 'mp-d-rel', text: x.other.etiqueta, onclick: function () { select(x.id); } }),
          x.n > 1 ? h('span', { class: 'mp-d-n', text: ' ×' + x.n }) : null,
          x.n === 1 && x.detalle && x.detalle.length && outgoing ? h('span', { class: 'mp-d-extra', text: x.detalle.join(', ') }) : null
        ]);
      })),
      list.length > shown.length ? h('p', { class: 'mp-d-more', text: 'y ' + (list.length - shown.length) + ' más, resaltados en el mapa' }) : null
    ]);
  }

  return { render: render };
})();
