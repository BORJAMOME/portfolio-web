/* ═══════════════════════════════════════════════
   area-privada-mapa.js: pestaña «Mapa» del área privada (#/mapa)
   ─────────────────────────────────────────────────
   Dibuja la estructura del portfolio web y del área privada como un árbol en cuatro bloques,
   con flechas punteadas para las relaciones. No lee nada de Supabase ni del servidor: el
   árbol viene de mapa/estructura.js, que genera tools/mapa/build-mapa.mjs leyendo el
   repositorio (CI comprueba que está al día). Estilos: css/mapa.css.
   El árbol es HTML (listas con botones); el SVG de flechas es decorativo y las mismas
   relaciones se leen como texto en el panel de detalle.
   ═══════════════════════════════════════════════ */
window.APMapa = (function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var WIDE = '(min-width: 1180px)';   // cuatro columnas con flechas; el mismo corte que en css/mapa.css

  var ctx = null, data = null;
  var byId, parentOf, colOf, subtree, labels, edges, root, canvas, svg, detail;
  var pinned = null, hover = null, raf = 0;

  /* ── Datos ── */
  function assetUrl() {
    var l = document.querySelector('link[data-ap-asset="mapa-datos"]');
    return new URL(l ? l.getAttribute('href') : './mapa/estructura.js', document.baseURI).href;
  }
  function index() {
    byId = {}; parentOf = {}; colOf = {}; subtree = {};
    data.columnas.forEach(function (col, ci) {
      (function walk(n, parent) {
        byId[n.id] = n; parentOf[n.id] = parent; colOf[n.id] = ci;
        var ids = [n.id];
        (n.hijos || []).forEach(function (c) { ids = ids.concat(walk(c, n.id)); });
        subtree[n.id] = ids;
        return ids;
      })(col, null);
    });
  }

  function render(c) {
    ctx = c;
    return import(assetUrl()).then(function (m) { data = m.default; index(); return paint; });
  }

  /* ── Pintado ── */
  function paint() {
    var h = ctx.h;
    labels = {}; edges = []; pinned = null; hover = null;
    ctx.view.textContent = '';

    var r = data.recuento;
    var ver = ['v' + data.huella, r.paginas + ' páginas', r.pestanas + ' pestañas', r.tablas + ' tablas', r.funciones + ' funciones', r.herramientas + ' herramientas', r.relaciones + ' relaciones'].join(' · ');

    svg = svgEl('svg', { class: 'mp-edges', 'aria-hidden': 'true', focusable: 'false' });
    svg.appendChild(marker('mp-arrow', 'mp-arrow-path'));
    svg.appendChild(marker('mp-arrow-on', 'mp-arrow-path mp-arrow-path--on'));

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
      h('p', { class: 'ape-meta', text: 'Pulsa un elemento para ver con qué se relaciona.' }),
      canvas,
      legend(),
      detail
    ]);
    ctx.view.appendChild(root);

    data.relaciones.forEach(function (rel) {
      var weak = !!(data.verbos[rel.tipo] || {}).debil;
      var p = svgEl('path', { class: 'mp-edge' + (weak ? ' is-weak' : ''), 'marker-end': 'url(#mp-arrow)' });
      svg.appendChild(p);
      edges.push({ rel: rel, el: p });
    });

    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pinned) { e.stopPropagation(); select(null); } });
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
    // la nota va sobre la propia rama solo en los grupos; en las pestañas se lee en el panel de detalle
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
    var b = ctx.h('button', {
      type: 'button', class: 'mp-label mp-t-' + n.tipo, 'data-id': n.id, 'aria-pressed': 'false', text: n.etiqueta,
      onclick: function () { select(pinned === n.id ? null : n.id); },
      onmouseenter: function () { hover = n.id; refresh(); },
      onmouseleave: function () { hover = null; refresh(); },
      onfocus: function () { hover = n.id; refresh(); },
      onblur: function () { hover = null; refresh(); }
    });
    labels[n.id] = b;
    return b;
  }

  function legend() {
    var h = ctx.h;
    function sample(dotted) {
      var s = svgEl('svg', { viewBox: '0 0 34 10', 'aria-hidden': 'true', focusable: 'false' });
      if (dotted) {
        s.appendChild(svgEl('path', { class: 'mp-edge', d: 'M1 5 H27' }));
        s.appendChild(svgEl('path', { class: 'mp-arrow-path', d: 'M24 1.5 L30 5 L24 8.5' }));
      } else {
        s.appendChild(svgEl('path', { d: 'M1 5 H20 M20 1 V5', fill: 'none', stroke: '#8f99aa', 'stroke-width': '1' }));
      }
      return s;
    }
    return h('div', { class: 'mp-legend' }, [
      h('span', null, [sample(true), 'relación entre elementos (enlaza, monta, genera…)']),
      h('span', null, [sample(false), 'contiene']),
      h('label', { class: 'mp-all' }, [
        h('input', { type: 'checkbox', onchange: function (e) { root.classList.toggle('show-all', e.target.checked); } }),
        'Dibujar también el uso de tablas y las comprobaciones'
      ])
    ]);
  }

  /* ── SVG ── */
  function svgEl(name, attrs) {
    var el = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function marker(id, pathClass) {
    var m = svgEl('marker', { id: id, viewBox: '0 0 10 10', refX: '8.5', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto' });
    m.appendChild(svgEl('path', { class: pathClass, d: 'M1.5 1.5 L8.5 5 L1.5 8.5' }));
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
        var bulge = 34 + Math.min(70, Math.abs(by - ay) * 0.18);
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

  function select(id) {
    pinned = id;
    refresh();
    paintDetail();
  }

  function refresh() {
    var id = pinned || hover;           // lo fijado con un clic manda sobre el paso del ratón
    root.classList.toggle('has-active', !!id);
    var related = {};
    edges.forEach(function (e) {
      var on = !!id && relevant(e.rel, id);
      e.el.classList.toggle('is-on', on);
      e.el.setAttribute('marker-end', 'url(#' + (on ? 'mp-arrow-on' : 'mp-arrow') + ')');
      if (on) otherEnd(e.rel, id).forEach(function (o) { related[o] = true; });
    });
    Object.keys(labels).forEach(function (k) {
      labels[k].classList.toggle('is-active', k === id);
      labels[k].classList.toggle('is-rel', !!related[k] && k !== id);
      labels[k].setAttribute('aria-pressed', k === pinned ? 'true' : 'false');
    });
  }

  /* ── Detalle ── */
  function paintDetail() {
    var h = ctx.h;
    detail.textContent = '';
    if (!pinned) { detail.hidden = true; return; }
    var n = byId[pinned];
    var rels = data.relaciones.filter(function (r) { return relevant(r, pinned); });
    var items = [];
    rels.forEach(function (r) {
      var verbo = (data.verbos[r.tipo] || {}).verbo || r.tipo;
      otherEnd(r, pinned).forEach(function (oid) {
        var other = byId[oid], outgoing = oid === r.a;
        items.push(h('li', null, [
          outgoing ? h('span', { class: 'mp-d-verb', text: verbo + ' → ' }) : null,
          h('button', { type: 'button', class: 'mp-d-rel', text: other.etiqueta, onclick: function () { select(oid); } }),
          outgoing ? null : h('span', { class: 'mp-d-verb', text: ' ' + verbo + ' este elemento' }),
          r.detalle && r.detalle.length && outgoing && n.tipo !== 'tabla' ? h('span', { class: 'mp-d-extra', text: r.detalle.join(', ') }) : null
        ]));
      });
    });
    var open = n.href && !n.href.indexOf('#') ? { href: n.href } : n.href ? { href: n.href, target: '_blank', rel: 'noopener' } : null;
    detail.appendChild(h('div', { class: 'mp-d-top' }, [
      h('strong', { class: 'mp-d-name', text: n.etiqueta }),
      h('span', { class: 'mp-d-type', text: data.tipos[n.tipo] || n.tipo }),
      n.archivo ? h('span', { class: 'mp-d-path', text: n.archivo }) : null,
      h('span', { class: 'mp-d-actions' }, [
        open ? h('a', { class: 'mp-d-link', href: open.href, target: open.target, rel: open.rel, text: open.target ? 'Abrir página ↗' : 'Ir a la pestaña' }) : null,
        h('button', { type: 'button', class: 'mp-d-close', text: 'Quitar selección', onclick: function () { select(null); } })
      ])
    ]));
    if (n.nota) detail.appendChild(h('p', { class: 'mp-d-note', text: n.nota }));
    detail.appendChild(items.length
      ? h('ul', { class: 'mp-d-rels', 'aria-label': 'Relaciones de ' + n.etiqueta }, items)
      : h('p', { class: 'mp-d-empty', text: 'Sin relaciones detectadas todavía.' }));
    detail.hidden = false;
  }

  return { render: render };
})();
