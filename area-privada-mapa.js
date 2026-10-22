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
        if (n.familia) famCount[n.familia] = (famCount[n.familia] || 0) + 1;
        var ids = [n.id];
        (n.hijos || []).forEach(function (c) { ids = ids.concat(walk(c, n.id)); });
        subtree[n.id] = ids;
        return ids;
      })(col, null);
    });
  }
  function color(fam) { return (data.familias[fam] || {}).color || '#44546F'; }

  function render(c) {
    ctx = c;
    return import(assetUrl()).then(function (m) { data = m.default; index(); return paint; });
  }

  /* ── Pintado ── */
  function paint() {
    var h = ctx.h;
    labels = {}; edges = []; pinned = null; hover = null; famFilter = null;
    ctx.view.textContent = '';

    var r = data.recuento;
    var ver = ['v' + data.huella, r.paginas + ' páginas', r.proyectos + ' proyectos', r.plataformas + ' plataformas y repos', r.pestanas + ' pestañas', r.tablas + ' tablas', r.funciones + ' funciones', r.herramientas + ' herramientas', r.relaciones + ' relaciones'].join(' · ');

    svg = svgEl('svg', { class: 'mp-edges', 'aria-hidden': 'true', focusable: 'false' });
    svg.appendChild(marker('mp-arrow', '#6f7a8f'));
    Object.keys(data.familias).forEach(function (f) { svg.appendChild(marker('mp-arrow-' + f, color(f))); });

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
      h('div', { class: 'mp-cols' }, data.columnas.map(column)),
      svg
    ]);

    detail = h('section', { class: 'mp-detail', 'aria-live': 'polite', 'aria-label': 'Detalle del elemento seleccionado', hidden: true });

    root = h('section', { class: 'mp', 'aria-labelledby': 'mp-title' }, [
      h('p', { class: 'ape-meta', text: 'Pulsa un elemento para ver con qué se relaciona, o un tipo de la leyenda para resaltarlo. El menú que repiten todas las páginas no se dibuja: solo los enlaces del contenido.' }),
      legend(),
      canvas,
      foot(),
      detail
    ]);
    ctx.view.appendChild(root);

    data.relaciones.forEach(function (rel) {
      var weak = !!(data.verbos[rel.tipo] || {}).debil;
      var p = svgEl('path', { class: 'mp-edge' + (weak ? ' is-weak' : ''), 'marker-end': 'url(#mp-arrow)' });
      svg.appendChild(p);
      edges.push({ rel: rel, el: p });
    });

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
    var kids = n.hijos && n.hijos.length ? h('ul', null, n.hijos.map(node)) : null;
    return h('li', { class: 'mp-node' + (inline ? ' mp-node--note' : '') }, [
      h('div', { class: 'mp-row' }, [
        h('span', { class: 'mp-lab' }, [labelButton(n), inline ? h('span', { class: 'mp-note mp-note--sub', text: n.nota }) : null])
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
        : h('p', { class: 'mp-legend-line', text: 'Todos los enlaces del contenido están clasificados.' })
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
    var cb = canvas.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + Math.round(cb.width) + ' ' + Math.round(cb.height));
    if (!window.matchMedia(WIDE).matches) return;
    edges.forEach(function (e) {
      var a = labels[e.rel.de], b = labels[e.rel.a];
      if (!a || !b) return;
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var ay = ra.top + ra.height / 2 - cb.top, by = rb.top + rb.height / 2 - cb.top;
      var ca = colOf[e.rel.de], cbi = colOf[e.rel.a], d;
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
    pinned = id;
    refresh();
    paintDetail();
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
