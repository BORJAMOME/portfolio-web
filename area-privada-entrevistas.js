/* ═══════════════════════════════════════════════
   area-privada-entrevistas.js — pestaña «Entrevistas» del área privada
   ─────────────────────────────────────────────────
   Rutas: #/entrevistas            lista de procesos (candidaturas)
          #/entrevistas/analisis   embudo, tasas por fase y fuente, calibración, preguntas
          #/entrevistas/<uuid>     un proceso con sus entrevistas
   Tablas public.procesos y public.entrevistas (supabase/entrevistas.sql).
   Como los demás módulos: area-privada.js le pasa api, h, ask, setStatus, fail y view.
   Todo lo que viene de la base se pinta como texto, nunca como HTML.
   ═══════════════════════════════════════════════ */
window.APEntrevistas = (function () {
  'use strict';

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var ESTADOS = [
    ['activo', 'En curso', 'is-live'], ['oferta', 'Oferta', 'is-ok'], ['aceptada', 'Aceptada', 'is-ok'],
    ['rechazado', 'Me descartan', 'is-ko'], ['descartado', 'Lo descarto yo', 'is-off'], ['sin_respuesta', 'Sin respuesta', 'is-off']
  ];
  var FASES = [
    ['rrhh', 'Filtro RRHH'], ['tecnica', 'Técnica'], ['caso', 'Caso práctico'], ['hiring_manager', 'Hiring manager'],
    ['cultural', 'Cultural / equipo'], ['final', 'Final'], ['otra', 'Otra']
  ];
  var RESULTADOS = [['pendiente', 'Pendiente', 'is-live'], ['superada', 'Superada', 'is-ok'], ['no_superada', 'No superada', 'is-ko'], ['cancelada', 'Cancelada', 'is-off']];
  var FORMATOS = [['video', 'Videollamada'], ['presencial', 'Presencial'], ['telefono', 'Teléfono']];
  var MODALIDADES = [['presencial', 'Presencial'], ['hibrido', 'Híbrido'], ['remoto', 'Remoto']];
  var FUENTES = ['LinkedIn', 'InfoJobs', 'Web de la empresa', 'Referido', 'Headhunter', 'Tecnoempleo', 'Indeed', 'Otra'];
  // nivel que alcanza cada fase en el embudo (0 = cualquier primera entrevista)
  var NIVEL_FASE = { rrhh: 1, cultural: 1, otra: 1, tecnica: 2, caso: 2, hiring_manager: 2, final: 3 };

  var PCOLS = 'id,empresa,puesto,ubicacion,modalidad,fuente,url,fecha_aplicacion,salario_min,salario_max,estado,fecha_cierre,motivo_cierre,notas,updated_at';
  var ECOLS = 'id,proceso_id,fecha,fase,formato,duracion_min,entrevistadores,preparacion,autovaloracion,resultado,preguntas,bien,mejorar,feedback,calendar_uid';

  var ctx = null, procs = [], ents = [];
  var flash = '';   // aviso para después de redibujar (el shell limpia el estado al pintar)
  function notify(msg) { flash = msg; }
  var st = { q: '', estado: '', sort: 'fecha_aplicacion', dir: -1 };

  var dFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  var dtFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  var pct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
  var num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

  /* ── Utilidades ── */
  function label(list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return v || '—'; }
  function cls(list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][2] || ''; return ''; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function day(d) { return d ? dFmt.format(new Date(d.length === 10 ? d + 'T00:00:00' : d)) : '—'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localInput(iso) {      // ISO → valor de <input type="datetime-local">
    var d = iso ? new Date(iso) : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function today() { return localInput().slice(0, 10); }
  function money(n) { return n == null ? '' : num.format(n / 1000) + ' k'; }
  function stars(n) { return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—'; }
  function median(a) {
    if (!a.length) return null;
    a = a.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function badge(list, v) { return ctx.h('span', { class: 'ape-badge ' + cls(list, v), text: label(list, v) }); }
  function entsOf(id) {
    return ents.filter(function (e) { return e.proceso_id === id; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
  }
  function nextOf(id) {
    var now = new Date().toISOString();
    return entsOf(id).filter(function (e) { return e.fecha >= now && e.resultado === 'pendiente'; })[0] || null;
  }
  function lastFase(id) {
    var list = entsOf(id).filter(function (e) { return e.resultado !== 'cancelada'; });
    return list.length ? list[list.length - 1].fase : null;
  }
  // 0 sin entrevistas · 1 primera entrevista · 2 técnica/caso · 3 final · 4 oferta
  function nivel(p) {
    var n = 0;
    entsOf(p.id).forEach(function (e) { if (e.resultado !== 'cancelada') n = Math.max(n, NIVEL_FASE[e.fase] || 1); });
    if (p.estado === 'oferta' || p.estado === 'aceptada') n = 4;
    return n;
  }

  /* ── Datos ── */
  var JSON_REP = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
  function load() {
    return Promise.all([
      ctx.api('/rest/v1/procesos?select=' + PCOLS + '&order=fecha_aplicacion.desc'),
      ctx.api('/rest/v1/entrevistas?select=' + ECOLS + '&order=fecha.asc')
    ]).then(function (r) { procs = r[0] || []; ents = r[1] || []; });
  }
  function save(table, cols, id, row) {
    return id
      ? ctx.api('/rest/v1/' + table + '?id=eq.' + id + '&select=' + cols, { method: 'PATCH', headers: JSON_REP, body: JSON.stringify(row) }).then(function (r) { return r[0]; })
      : ctx.api('/rest/v1/' + table + '?select=' + cols, { method: 'POST', headers: JSON_REP, body: JSON.stringify(row) }).then(function (r) { return r[0]; });
  }
  function remove(table, id) { return ctx.api('/rest/v1/' + table + '?id=eq.' + id, { method: 'DELETE' }); }

  /* ── Entrada ── */
  function render(c) {
    ctx = c;
    field = c.ui.field; input = c.ui.input; select = c.ui.select; area = c.ui.area; formDialog = c.ui.formDialog; invalid = c.ui.invalid;
    return load().then(function () {
      var paint = ctx.arg === 'analisis' ? paintAnalysis : UUID.test(ctx.arg) ? function () { paintDetail(ctx.arg); } : paintList;
      return function () { paint(); if (flash) { ctx.setStatus(flash); flash = ''; } };
    });
  }
  function rerender() { if (ctx.isCurrent()) window.dispatchEvent(new HashChangeEvent('hashchange')); }

  function subnav(active) {
    var h = ctx.h;
    return h('nav', { class: 'ape-subnav', 'aria-label': 'Vistas de entrevistas' }, [
      h('a', { href: '#/entrevistas', 'aria-current': active === 'list' ? 'page' : null, text: 'Procesos' }),
      h('a', { href: '#/entrevistas/analisis', 'aria-current': active === 'analysis' ? 'page' : null, text: 'Análisis' })
    ]);
  }

  /* ═══════════ LISTA DE PROCESOS ═══════════ */
  var ui = {};
  function paintList() {
    var h = ctx.h;
    ctx.view.textContent = '';
    ui.q = h('input', { type: 'search', id: 'ape-q', placeholder: 'Empresa, puesto, fuente o nota', autocomplete: 'off', value: st.q, oninput: function () { st.q = this.value; drawRows(); } });
    ui.estado = h('select', { id: 'ape-estado', class: 'apf-select', onchange: function () { st.estado = this.value; drawRows(); } },
      [h('option', { value: '', text: 'Todos los estados' }), h('option', { value: 'abiertos', text: 'Abiertos (en curso u oferta)', selected: st.estado === 'abiertos' })]
        .concat(ESTADOS.map(function (e) { return h('option', { value: e[0], text: e[1], selected: st.estado === e[0] }); })));
    ui.count = h('p', { class: 'apf-count', role: 'status', 'aria-live': 'polite' });
    ui.head = h('tr');
    ui.body = h('tbody');
    ctx.view.appendChild(subnav('list'));
    ctx.view.appendChild(h('div', { class: 'apf-bar' }, [
      h('div', { class: 'ap-search apf-search' }, [
        h('label', { class: 'sr-only', for: 'ape-q', text: 'Buscar procesos' }),
        h('span', { class: 'ap-search-ico', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' }),
        ui.q
      ]),
      h('div', { class: 'apf-filters' }, [h('label', { class: 'sr-only', for: 'ape-estado', text: 'Filtrar por estado' }), ui.estado]),
      h('button', { type: 'button', class: 'ap-tool ap-tool--dark', onclick: function () { procesoForm(null); } }, [h('span', { 'aria-hidden': 'true', text: '+' }), ' Nuevo proceso'])
    ]));
    ctx.view.appendChild(ui.count);
    ctx.view.appendChild(h('div', { class: 'ap-table-wrap apf-wrap', tabindex: '0', role: 'region', 'aria-label': 'Procesos de selección' }, [h('table', { class: 'ap-table apf-table ape-table' }, [
      h('caption', { class: 'sr-only', text: 'Procesos de selección' }), h('thead', null, [ui.head]), ui.body
    ])]));
    drawHead();
    drawRows();
  }

  var HEAD = [
    { key: 'empresa', label: 'Empresa y puesto', cls: 'ape-c-emp' },
    { key: 'fuente', label: 'Fuente', cls: 'ape-c-src' },
    { key: 'fecha_aplicacion', label: 'Aplicado', cls: 'ape-c-date' },
    { key: 'estado', label: 'Estado', cls: 'ape-c-st' },
    { key: 'nivel', label: 'Fase', cls: 'ape-c-fase' },
    { key: 'proxima', label: 'Próxima', cls: 'ape-c-next' }
  ];
  function sortVal(p, k) {
    if (k === 'nivel') return nivel(p);
    if (k === 'proxima') { var n = nextOf(p.id); return n ? n.fecha : null; }
    if (k === 'estado') return ESTADOS.map(function (e) { return e[0]; }).indexOf(p.estado);
    return p[k];
  }
  function drawHead() {
    var h = ctx.h;
    ui.head.textContent = '';
    HEAD.forEach(function (c) {
      var on = st.sort === c.key;
      ui.head.appendChild(h('th', { scope: 'col', class: c.cls, 'aria-sort': on ? (st.dir > 0 ? 'ascending' : 'descending') : null }, [
        h('button', { type: 'button', class: 'apf-sort', onclick: function () {
          st.dir = st.sort === c.key ? -st.dir : (c.key === 'empresa' || c.key === 'fuente' || c.key === 'estado' || c.key === 'proxima' ? 1 : -1);
          st.sort = c.key; drawHead(); drawRows();
        } }, [c.label, h('span', { class: 'apf-arrow', 'aria-hidden': 'true', text: on ? (st.dir > 0 ? '↑' : '↓') : '' })])
      ]));
    });
    ui.head.appendChild(h('th', { scope: 'col', class: 'ap-col-act' }, [h('span', { class: 'sr-only', text: 'Acciones' })]));
  }
  function visible() {
    var words = norm(st.q).split(/\s+/).filter(Boolean);
    var list = procs.filter(function (p) {
      if (st.estado === 'abiertos' && ['activo', 'oferta'].indexOf(p.estado) < 0) return false;
      if (st.estado && st.estado !== 'abiertos' && p.estado !== st.estado) return false;
      if (!words.length) return true;
      var hay = norm([p.empresa, p.puesto, p.fuente, p.ubicacion, p.notas, p.motivo_cierre].join(' '));
      return words.every(function (w) { return hay.indexOf(w) > -1; });
    });
    var k = st.sort, d = st.dir;
    return list.sort(function (a, b) {
      var x = sortVal(a, k), y = sortVal(b, k);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { sensitivity: 'base' })) * d;
    });
  }
  function drawRows() {
    var h = ctx.h, list = visible();
    ui.count.textContent = list.length === procs.length ? procs.length + ' procesos' : list.length + ' de ' + procs.length + ' procesos';
    ui.body.textContent = '';
    if (!list.length) {
      ui.body.appendChild(h('tr', null, [h('td', { colspan: '7', class: 'apf-empty' }, [
        h('p', { class: 'ap-empty-title', text: procs.length ? 'Nada con esos criterios' : 'Todavía no hay procesos' }),
        h('p', { text: procs.length ? 'Prueba con otra palabra o quita el filtro.' : 'Empieza con «+ Nuevo proceso» cuando envíes una candidatura.' })
      ])]));
      return;
    }
    var NIVELES = ['—', '1.ª entrevista', 'Técnica / caso', 'Final', 'Oferta'];
    list.forEach(function (p) {
      var nx = nextOf(p.id), n = entsOf(p.id).length;
      ui.body.appendChild(h('tr', null, [
        h('td', { class: 'ape-c-emp' }, [
          h('a', { class: 'apf-title', href: '#/entrevistas/' + p.id, text: p.empresa }),
          h('span', { class: 'apf-domain', text: p.puesto + (p.ubicacion ? ' · ' + p.ubicacion : '') }),
          h('span', { class: 'apf-meta-m', text: [label(ESTADOS, p.estado), day(p.fecha_aplicacion)].join(' · ') })
        ]),
        h('td', { class: 'ape-c-src', text: p.fuente || '—' }),
        h('td', { class: 'ape-c-date' }, [h('time', { datetime: p.fecha_aplicacion, text: day(p.fecha_aplicacion) })]),
        h('td', { class: 'ape-c-st' }, [badge(ESTADOS, p.estado)]),
        h('td', { class: 'ape-c-fase', text: NIVELES[nivel(p)] + (n ? ' (' + n + ')' : '') }),
        h('td', { class: 'ape-c-next' }, nx ? [h('time', { datetime: nx.fecha, text: dtFmt.format(new Date(nx.fecha)) })] : [h('span', { class: 'apf-none', text: '—' })]),
        h('td', { class: 'ap-col-act' }, [
          h('button', { type: 'button', class: 'ap-link-btn', 'aria-label': 'Editar el proceso de ' + p.empresa, text: 'Editar', onclick: function () { procesoForm(p); } })
        ])
      ]));
    });
  }

  /* ═══════════ DETALLE DE UN PROCESO ═══════════ */
  function paintDetail(id) {
    var h = ctx.h, p = procs.filter(function (x) { return x.id === id; })[0];
    ctx.view.textContent = '';
    if (!p) { location.replace('#/entrevistas'); return; }
    var list = entsOf(id);
    var meta = [p.puesto, p.ubicacion, label(MODALIDADES, p.modalidad) !== '—' ? label(MODALIDADES, p.modalidad) : null, p.fuente,
      'aplicado el ' + day(p.fecha_aplicacion),
      p.salario_min || p.salario_max ? [money(p.salario_min), money(p.salario_max)].filter(Boolean).join('–') + ' €' : null].filter(Boolean);
    ctx.view.appendChild(h('a', { class: 'ap-backlink', href: '#/entrevistas' }, [h('span', { 'aria-hidden': 'true', text: '← ' }), 'Todos los procesos']));
    ctx.view.appendChild(h('div', { class: 'ape-detail-head' }, [
      h('div', null, [
        h('h2', { class: 'ap-doc-title', text: p.empresa }),
        h('p', { class: 'ape-meta', text: meta.join(' · ') }),
        h('p', { class: 'ape-meta' }, [badge(ESTADOS, p.estado),
          p.fecha_cierre ? ' cerrado el ' + day(p.fecha_cierre) : null,
          p.url ? h('a', { class: 'ape-ext', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, ['Ver la oferta', h('span', { class: 'sr-only', text: ' (abre en pestaña nueva)' })]) : null])
      ]),
      h('div', { class: 'ap-doc-actions' }, [
        h('button', { type: 'button', class: 'ap-tool ap-tool--dark', onclick: function () { entrevistaForm(p, null); } }, [h('span', { 'aria-hidden': 'true', text: '+' }), ' Entrevista']),
        h('button', { type: 'button', class: 'ap-tool', text: 'Editar proceso', onclick: function () { procesoForm(p); } }),
        h('button', { type: 'button', class: 'ap-tool ap-tool--danger', text: 'Eliminar', onclick: function () { removeProceso(p); } })
      ])
    ]));
    if (p.notas || p.motivo_cierre) {
      ctx.view.appendChild(h('div', { class: 'ape-notes' }, [
        p.notas ? block('Notas', p.notas) : null,
        p.motivo_cierre ? block('Por qué se cerró', p.motivo_cierre) : null
      ]));
    }
    ctx.view.appendChild(h('h3', { class: 'ape-h3', text: list.length ? 'Entrevistas (' + list.length + ')' : 'Entrevistas' }));
    if (!list.length) {
      ctx.view.appendChild(h('div', { class: 'ap-empty' }, [
        h('p', { class: 'ap-empty-title', text: 'Sin entrevistas todavía' }),
        h('p', { text: 'Cuando te llamen, añade la ronda con «+ Entrevista». Si ya está en tu calendario, puedes enlazarla.' })
      ]));
      return;
    }
    var ol = h('ol', { class: 'ape-timeline' });
    list.forEach(function (e) {
      var preguntas = String(e.preguntas || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      ol.appendChild(h('li', { class: 'ape-card' }, [
        h('div', { class: 'ape-card-head' }, [
          h('div', null, [
            h('p', { class: 'ape-card-title' }, [label(FASES, e.fase), ' ', badge(RESULTADOS, e.resultado)]),
            h('p', { class: 'ape-meta' }, [
              h('time', { datetime: e.fecha, text: dtFmt.format(new Date(e.fecha)) }),
              [e.formato ? label(FORMATOS, e.formato) : null, e.duracion_min ? e.duracion_min + ' min' : null, e.entrevistadores].filter(Boolean).map(function (s) { return ' · ' + s; }).join(''),
              e.calendar_uid ? h('span', { class: 'ape-cal', text: ' · en tu calendario' }) : null
            ])
          ]),
          h('div', { class: 'ape-card-act' }, [
            h('button', { type: 'button', class: 'ap-link-btn', text: 'Editar', 'aria-label': 'Editar la entrevista ' + label(FASES, e.fase), onclick: function () { entrevistaForm(p, e); } }),
            h('button', { type: 'button', class: 'ap-link-btn ap-link-btn--danger', text: 'Eliminar', 'aria-label': 'Eliminar la entrevista ' + label(FASES, e.fase), onclick: function () { removeEntrevista(e); } })
          ])
        ]),
        e.preparacion || e.autovaloracion ? h('dl', { class: 'ape-scores' }, [
          h('dt', { text: 'Preparación' }), h('dd', null, [h('span', { 'aria-hidden': 'true', text: stars(e.preparacion) }), h('span', { class: 'sr-only', text: e.preparacion ? e.preparacion + ' de 5' : 'sin valorar' })]),
          h('dt', { text: 'Cómo fue' }), h('dd', null, [h('span', { 'aria-hidden': 'true', text: stars(e.autovaloracion) }), h('span', { class: 'sr-only', text: e.autovaloracion ? e.autovaloracion + ' de 5' : 'sin valorar' })])
        ]) : null,
        preguntas.length ? h('div', { class: 'ape-block' }, [h('p', { class: 'ap-label', text: 'Preguntas' }),
          h('ul', { class: 'ape-qs' }, preguntas.map(function (q) { return h('li', { text: q }); }))]) : null,
        e.bien ? block('Qué fue bien', e.bien) : null,
        e.mejorar ? block('Qué mejorar', e.mejorar) : null,
        e.feedback ? block('Feedback de la empresa', e.feedback) : null
      ]));
    });
    ctx.view.appendChild(ol);
  }
  function block(title, text) {
    var h = ctx.h;
    return h('div', { class: 'ape-block' }, [h('p', { class: 'ap-label', text: title }), h('p', { class: 'ape-text', text: text })]);
  }

  /* ═══════════ FORMULARIOS ═══════════ */
  // Formularios: helpers comunes del shell (ctx.ui en area-privada.js); se enlazan en render()
  var field, input, select, area, formDialog, invalid;
  function scale(value) {
    return select([5, 4, 3, 2, 1].map(function (n) { return [String(n), '★'.repeat(n) + ' · ' + n]; }), value ? String(value) : '', 'Sin valorar');
  }

  function intOrNull(v) { v = String(v).replace(/[.\s€]/g, '').replace(',', '.'); return v === '' ? null : Math.round(+v); }

  function procesoForm(p) {
    var f = {
      empresa: input('text', p && p.empresa, { required: true, maxlength: '160' }),
      puesto: input('text', p && p.puesto, { required: true, maxlength: '200' }),
      fuente: select(FUENTES.concat(p && p.fuente && FUENTES.indexOf(p.fuente) < 0 ? [p.fuente] : []), p && p.fuente, 'Sin indicar'),
      fecha: input('date', p ? p.fecha_aplicacion : today(), { required: true }),
      ubicacion: input('text', p && p.ubicacion, { maxlength: '160' }),
      modalidad: select(MODALIDADES, p && p.modalidad, 'Sin indicar'),
      url: input('url', p && p.url, { maxlength: '2000', placeholder: 'https://', inputmode: 'url' }),
      smin: input('text', p && p.salario_min, { inputmode: 'numeric', placeholder: 'p. ej. 26000' }),
      smax: input('text', p && p.salario_max, { inputmode: 'numeric', placeholder: 'p. ej. 30000' }),
      estado: select(ESTADOS, p ? p.estado : 'activo'),
      cierre: input('date', p && p.fecha_cierre),
      motivo: area(p && p.motivo_cierre, 2, 1000),
      notas: area(p && p.notas, 3, 5000)
    };
    formDialog(p ? 'Editar proceso' : 'Nuevo proceso', p ? 'Guardar cambios' : 'Crear proceso', [
      field('ape-f-emp', 'Empresa', f.empresa),
      field('ape-f-pue', 'Puesto', f.puesto),
      field('ape-f-fue', 'Fuente', f.fuente),
      field('ape-f-fec', 'Fecha de la candidatura', f.fecha),
      field('ape-f-ubi', 'Ubicación', f.ubicacion),
      field('ape-f-mod', 'Modalidad', f.modalidad),
      field('ape-f-url', 'Enlace a la oferta', f.url, { wide: true }),
      field('ape-f-smin', 'Salario mínimo (€ brutos/año)', f.smin),
      field('ape-f-smax', 'Salario máximo', f.smax),
      field('ape-f-est', 'Estado', f.estado),
      field('ape-f-cie', 'Fecha de cierre', f.cierre, { hint: 'Si el proceso ya terminó.' }),
      field('ape-f-mot', 'Por qué se cerró', f.motivo, { wide: true }),
      field('ape-f-not', 'Notas', f.notas, { wide: true, hint: 'Contactos, impresiones, lo que sepas de la empresa…' })
    ], function () {
      var row = {
        empresa: f.empresa.value.trim(), puesto: f.puesto.value.trim(), fuente: f.fuente.value || null,
        fecha_aplicacion: f.fecha.value, ubicacion: f.ubicacion.value.trim() || null, modalidad: f.modalidad.value || null,
        url: f.url.value.trim() || null, salario_min: intOrNull(f.smin.value), salario_max: intOrNull(f.smax.value),
        estado: f.estado.value, fecha_cierre: f.cierre.value || null,
        motivo_cierre: f.motivo.value.trim() || null, notas: f.notas.value.trim() || null
      };
      if (!row.empresa) throw invalid('Escribe la empresa.', f.empresa);
      if (!row.puesto) throw invalid('Escribe el puesto.', f.puesto);
      if (!row.fecha_aplicacion) throw invalid('Indica cuándo enviaste la candidatura.', f.fecha);
      if (row.url && !/^https?:\/\//i.test(row.url)) throw invalid('El enlace tiene que empezar por http:// o https://', f.url);
      if ((row.salario_min != null && isNaN(row.salario_min)) || (row.salario_max != null && isNaN(row.salario_max))) throw invalid('El salario tiene que ser un número.', f.smin);
      if (row.salario_min != null && row.salario_max != null && row.salario_min > row.salario_max) throw invalid('El mínimo no puede ser mayor que el máximo.', f.smin);
      if (row.estado !== 'activo' && row.estado !== 'oferta' && !row.fecha_cierre) row.fecha_cierre = today();
      return save('procesos', PCOLS, p && p.id, row).then(function (saved) {
        notify(p ? 'Cambios guardados.' : 'Proceso creado: ' + saved.empresa + '.');
        if (!p) location.hash = '#/entrevistas/' + saved.id; else rerender();
      });
    }, f.empresa);
  }

  function entrevistaForm(p, e) {
    var f = {
      fecha: input('datetime-local', e ? localInput(e.fecha) : '', { required: true }),
      fase: select(FASES, e ? e.fase : (entsOf(p.id).length ? 'tecnica' : 'rrhh')),
      formato: select(FORMATOS, e ? e.formato : 'video', 'Sin indicar'),
      duracion: input('number', e && e.duracion_min, { min: '1', max: '600', inputmode: 'numeric' }),
      quien: input('text', e && e.entrevistadores, { maxlength: '500', placeholder: 'Nombre y rol' }),
      prep: scale(e && e.preparacion),
      auto: scale(e && e.autovaloracion),
      resultado: select(RESULTADOS, e ? e.resultado : 'pendiente'),
      cal: select([], '', 'Sin enlazar'),
      preguntas: area(e && e.preguntas, 4, 10000),
      bien: area(e && e.bien, 2, 4000),
      mejorar: area(e && e.mejorar, 2, 4000),
      feedback: area(e && e.feedback, 2, 4000)
    };
    var events = [];
    // eventos del calendario cercanos, para enlazar la entrevista (si el calendario no está configurado, se queda vacío)
    var from = new Date(Date.now() - 45 * 864e5).toISOString(), to = new Date(Date.now() + 120 * 864e5).toISOString();
    ctx.api('/rest/v1/calendar_events?select=uid,starts_at,ends_at,title,all_day&all_day=is.false&starts_at=gte.' + from + '&starts_at=lte.' + to + '&order=starts_at.asc&limit=400')
      .then(function (list) {
        events = list || [];
        var words = norm(p.empresa).split(/\s+/).filter(function (w) { return w.length > 2; });
        events.forEach(function (ev) {
          var key = ev.uid + '|' + ev.starts_at;
          var match = words.some(function (w) { return norm(ev.title).indexOf(w) > -1; });
          f.cal.appendChild(ctx.h('option', { value: key, text: (match ? '★ ' : '') + dtFmt.format(new Date(ev.starts_at)) + ' · ' + ev.title, selected: e && e.calendar_uid === key }));
        });
      }).catch(function () {});
    f.cal.addEventListener('change', function () {
      var ev = events.filter(function (x) { return x.uid + '|' + x.starts_at === f.cal.value; })[0];
      if (!ev) return;
      f.fecha.value = localInput(ev.starts_at);
      if (!f.duracion.value) f.duracion.value = Math.round((new Date(ev.ends_at) - new Date(ev.starts_at)) / 60000);
    });
    formDialog(e ? 'Editar entrevista' : 'Nueva entrevista · ' + p.empresa, e ? 'Guardar cambios' : 'Añadir', [
      field('ape-e-cal', 'Evento del calendario', f.cal, { wide: true, hint: '★ = el título menciona la empresa. Rellena la fecha y la duración.' }),
      field('ape-e-fec', 'Fecha y hora', f.fecha),
      field('ape-e-fas', 'Fase', f.fase),
      field('ape-e-for', 'Formato', f.formato),
      field('ape-e-dur', 'Duración (min)', f.duracion),
      field('ape-e-qui', 'Entrevistadores', f.quien, { wide: true }),
      field('ape-e-pre', 'Cómo de preparado iba', f.prep),
      field('ape-e-aut', 'Cómo creo que fue', f.auto),
      field('ape-e-res', 'Resultado', f.resultado),
      field('ape-e-pq', 'Preguntas que me hicieron', f.preguntas, { wide: true, hint: 'Una por línea. El análisis cuenta las que se repiten entre entrevistas.' }),
      field('ape-e-bien', 'Qué fue bien', f.bien, { wide: true }),
      field('ape-e-mej', 'Qué mejorar', f.mejorar, { wide: true }),
      field('ape-e-fb', 'Feedback de la empresa', f.feedback, { wide: true })
    ], function () {
      if (!f.fecha.value) throw invalid('Indica la fecha y la hora.', f.fecha);
      var dur = f.duracion.value ? Math.round(+f.duracion.value) : null;
      if (dur != null && (isNaN(dur) || dur < 1 || dur > 600)) throw invalid('La duración va de 1 a 600 minutos.', f.duracion);
      var row = {
        proceso_id: p.id, fecha: new Date(f.fecha.value).toISOString(), fase: f.fase.value, formato: f.formato.value || null,
        duracion_min: dur, entrevistadores: f.quien.value.trim() || null,
        preparacion: f.prep.value ? +f.prep.value : null, autovaloracion: f.auto.value ? +f.auto.value : null,
        resultado: f.resultado.value, calendar_uid: f.cal.value || (e && e.calendar_uid) || null,
        preguntas: f.preguntas.value.trim() || null, bien: f.bien.value.trim() || null,
        mejorar: f.mejorar.value.trim() || null, feedback: f.feedback.value.trim() || null
      };
      return save('entrevistas', ECOLS, e && e.id, row).then(function () {
        notify(e ? 'Entrevista actualizada.' : 'Entrevista añadida.');
        // un proceso «sin respuesta» que recibe una entrevista vuelve a estar en curso
        if (!e && p.estado === 'sin_respuesta') return save('procesos', PCOLS, p.id, { estado: 'activo', fecha_cierre: null });
      }).then(rerender);
    }, e ? f.fecha : f.cal);
  }

  function removeProceso(p) {
    var n = entsOf(p.id).length;
    ctx.ask({ title: '¿Eliminar este proceso?', text: p.empresa + ' — ' + p.puesto + (n ? ' y sus ' + n + ' entrevistas' : '') + ' desaparecerán. No se puede deshacer.', ok: 'Eliminar', danger: true })
      .then(function (yes) {
        if (!yes) return;
        ctx.setStatus('Eliminando…');
        return remove('procesos', p.id).then(function () { notify('Proceso eliminado.'); location.hash = '#/entrevistas'; });
      }).catch(ctx.fail);
  }
  function removeEntrevista(e) {
    ctx.ask({ title: '¿Eliminar esta entrevista?', text: label(FASES, e.fase) + ' del ' + dtFmt.format(new Date(e.fecha)) + '. No se puede deshacer.', ok: 'Eliminar', danger: true })
      .then(function (yes) {
        if (!yes) return;
        return remove('entrevistas', e.id).then(function () { notify('Entrevista eliminada.'); rerender(); });
      }).catch(ctx.fail);
  }

  /* ═══════════ ANÁLISIS ═══════════ */
  function paintAnalysis() {
    var h = ctx.h;
    ctx.view.textContent = '';
    ctx.view.appendChild(subnav('analysis'));
    if (!procs.length) {
      ctx.view.appendChild(h('div', { class: 'ap-empty' }, [
        h('p', { class: 'ap-empty-title', text: 'Aún no hay datos que analizar' }),
        h('p', { text: 'El análisis aparece en cuanto registres tus primeras candidaturas y entrevistas.' })
      ]));
      return;
    }
    var now = new Date().toISOString();
    var hechas = ents.filter(function (e) { return e.fecha < now && e.resultado !== 'cancelada'; });
    var conEntrevista = procs.filter(function (p) { return nivel(p) >= 1; });
    var ofertas = procs.filter(function (p) { return p.estado === 'oferta' || p.estado === 'aceptada'; });
    var dias = conEntrevista.map(function (p) {
      var first = entsOf(p.id)[0];
      return first ? Math.max(0, Math.round((new Date(first.fecha) - new Date(p.fecha_aplicacion + 'T00:00:00')) / 864e5)) : null;
    }).filter(function (d) { return d != null; });
    var med = median(dias);

    ctx.view.appendChild(h('div', { class: 'ape-kpis' }, [
      kpi('Candidaturas', String(procs.length), procs.filter(function (p) { return p.estado === 'activo'; }).length + ' en curso'),
      kpi('Tasa de respuesta', pct.format(conEntrevista.length / procs.length), conEntrevista.length + ' con al menos una entrevista'),
      kpi('Entrevistas hechas', String(hechas.length), ents.length - hechas.length > 0 ? (ents.length - hechas.length) + ' programadas o canceladas' : 'ninguna pendiente'),
      kpi('Ofertas', String(ofertas.length), procs.length ? pct.format(ofertas.length / procs.length) + ' de las candidaturas' : ''),
      kpi('Hasta la 1.ª entrevista', med == null ? '—' : num.format(med) + ' días', 'mediana desde la candidatura')
    ]));

    // Embudo
    var STAGES = ['Candidaturas', 'Primera entrevista', 'Técnica o caso', 'Final', 'Oferta'];
    var counts = STAGES.map(function (_, k) { return procs.filter(function (p) { return nivel(p) >= k; }).length; });
    var funnel = h('ol', { class: 'ape-funnel' });
    counts.forEach(function (c, k) {
      var bar = h('span', { class: 'ape-bar' });
      bar.style.width = Math.max(c / counts[0] * 100, c ? 2 : 0) + '%';
      funnel.appendChild(h('li', null, [
        h('span', { class: 'ape-funnel-label', text: STAGES[k] }),
        h('span', { class: 'ape-track' }, [bar]),
        h('span', { class: 'ape-funnel-n' }, [h('strong', { text: String(c) }),
          k ? h('span', { text: ' · ' + (counts[k - 1] ? pct.format(c / counts[k - 1]) : '—') + ' del paso anterior' }) : null])
      ]));
    });
    ctx.view.appendChild(section('Embudo', 'Hasta dónde llega cada candidatura. Un proceso cuenta en una fase si llegó a ella o más allá.', funnel));

    // Por fase
    var faseRows = FASES.map(function (fa) {
      var l = ents.filter(function (e) { return e.fase === fa[0] && e.resultado !== 'cancelada'; });
      if (!l.length) return null;
      var ok = l.filter(function (e) { return e.resultado === 'superada'; }).length;
      var ko = l.filter(function (e) { return e.resultado === 'no_superada'; }).length;
      var av = l.filter(function (e) { return e.autovaloracion; }).map(function (e) { return e.autovaloracion; });
      return [fa[1], l.length, ok, ko, l.length - ok - ko, ok + ko ? pct.format(ok / (ok + ko)) : '—',
        av.length ? num.format(av.reduce(function (a, b) { return a + b; }, 0) / av.length) + ' / 5' : '—'];
    }).filter(Boolean);
    if (faseRows.length) ctx.view.appendChild(section('Por fase', 'Tasa de paso = superadas ÷ (superadas + no superadas). Las pendientes no cuentan.',
      table('Resultados por fase de entrevista', ['Fase', 'Entrevistas', 'Superadas', 'No superadas', 'Pendientes', 'Tasa de paso', 'Cómo creí que fue'], faseRows)));

    // Por fuente
    var fuentes = {};
    procs.forEach(function (p) { (fuentes[p.fuente || 'Sin indicar'] = fuentes[p.fuente || 'Sin indicar'] || []).push(p); });
    var srcRows = Object.keys(fuentes).map(function (k) {
      var l = fuentes[k], r = l.filter(function (p) { return nivel(p) >= 1; }).length, o = l.filter(function (p) { return nivel(p) >= 4; }).length;
      return [k, l.length, r, pct.format(r / l.length), o];
    }).sort(function (a, b) { return b[1] - a[1]; });
    ctx.view.appendChild(section('Por fuente', 'Qué canal te consigue entrevistas.',
      table('Resultados por fuente de la candidatura', ['Fuente', 'Candidaturas', 'Con entrevista', 'Tasa de respuesta', 'Ofertas'], srcRows)));

    // Calibración
    var decididas = ents.filter(function (e) { return e.autovaloracion && (e.resultado === 'superada' || e.resultado === 'no_superada'); });
    if (decididas.length) {
      var cal = h('ol', { class: 'ape-funnel ape-calib' });
      [5, 4, 3, 2, 1].forEach(function (n) {
        var l = decididas.filter(function (e) { return e.autovaloracion === n; });
        var ok = l.filter(function (e) { return e.resultado === 'superada'; }).length;
        var bar = h('span', { class: 'ape-bar' });
        bar.style.width = (l.length ? ok / l.length * 100 : 0) + '%';
        cal.appendChild(h('li', null, [
          h('span', { class: 'ape-funnel-label' }, [h('span', { 'aria-hidden': 'true', text: '★'.repeat(n) }), h('span', { class: 'sr-only', text: n + ' de 5' })]),
          h('span', { class: 'ape-track' }, [bar]),
          h('span', { class: 'ape-funnel-n', text: l.length ? pct.format(ok / l.length) + ' superadas (' + ok + ' de ' + l.length + ')' : 'sin datos' })
        ]));
      });
      ctx.view.appendChild(section('Calibración', '¿Aciertas cuando crees que te ha ido bien? Si las de 4–5 ★ no se superan más que las de 1–2 ★, tu intuición no es buena guía: pide feedback.', cal));
    }

    // Preguntas repetidas
    var qs = {};
    ents.forEach(function (e) {
      String(e.preguntas || '').split('\n').forEach(function (line) {
        var t = line.trim().replace(/^[-*·•\d.)\s]+/, '');
        if (t.length < 4) return;
        var k = norm(t).replace(/[¿?¡!.,;:"«»]/g, '').replace(/\s+/g, ' ').trim();
        if (!qs[k]) qs[k] = { text: t, n: 0, emp: {} };
        qs[k].n++;
        var p = procs.filter(function (x) { return x.id === e.proceso_id; })[0];
        if (p) qs[k].emp[p.empresa] = 1;
      });
    });
    var top = Object.keys(qs).map(function (k) { return qs[k]; }).filter(function (q) { return q.n > 1; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 15);
    ctx.view.appendChild(section('Preguntas que se repiten', 'Mismo texto en varias entrevistas (sin tildes, mayúsculas ni signos). Escríbelas de forma parecida para que coincidan.',
      top.length ? table('Preguntas repetidas', ['Pregunta', 'Veces', 'Empresas'], top.map(function (q) { return [q.text, q.n, Object.keys(q.emp).join(', ')]; }))
        : h('p', { class: 'ape-meta', text: 'Todavía ninguna pregunta aparece en más de una entrevista.' })));
  }
  function kpi(t, v, sub) {
    var h = ctx.h;
    return h('div', { class: 'ape-kpi' }, [h('p', { class: 'ap-label', text: t }), h('p', { class: 'ape-kpi-v', text: v }), sub ? h('p', { class: 'ape-meta', text: sub }) : null]);
  }
  function section(title, sub, body) {
    var h = ctx.h;
    return h('section', { class: 'ape-section' }, [h('h3', { class: 'ape-h3', text: title }), sub ? h('p', { class: 'ape-meta', text: sub }) : null, body]);
  }
  function table(caption, cols, rows) {
    var h = ctx.h;
    // una columna es numérica si todos sus valores son números, porcentajes, «x / 5» o «—»
    var isNum = cols.map(function (_, i) {
      return i > 0 && rows.every(function (r) { return typeof r[i] === 'number' || /^(—|[\d.,]+\s?(%|\/ 5))$/.test(String(r[i])); });
    });
    // tabindex + role: en móvil la tabla se desplaza en horizontal y tiene que poder recorrerse con el teclado
    return h('div', { class: 'ap-table-wrap apf-wrap', tabindex: '0', role: 'region', 'aria-label': caption }, [h('table', { class: 'ap-table apf-table ape-stats' }, [
      h('caption', { class: 'sr-only', text: caption }),
      h('thead', null, [h('tr', null, cols.map(function (c, i) { return h('th', { scope: 'col', class: isNum[i] ? 'is-num' : null, text: c }); }))]),
      h('tbody', null, rows.map(function (r) {
        return h('tr', null, r.map(function (v, i) { return h(i ? 'td' : 'th', { scope: i ? null : 'row', class: isNum[i] ? 'is-num' : null, text: String(v) }); }));
      }))
    ])]);
  }

  return { render: render };
})();
