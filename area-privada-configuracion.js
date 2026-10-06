/* ═══════════════════════════════════════════════
   area-privada-configuracion.js — pestaña «Configuración» (#/configuracion)
   ─────────────────────────────────────────────────
   Listas de opciones que usan las demás pestañas, guardadas en public.ap_opciones
   (supabase/opciones.sql). Hoy: temas y formatos del Fichero.

   Para añadir una lista nueva: una entrada en GROUPS (fem: true si el nombre es femenino) («source» es la tabla y las columnas
   donde se usan sus valores, para contar los usos) y el caso correspondiente en
   ap_opcion_renombrar/ap_opcion_eliminar (supabase/opciones.sql), para que renombrar y
   eliminar actualicen también esos datos.
   ═══════════════════════════════════════════════ */
window.APConfiguracion = (function () {
  'use strict';

  var GROUPS = [
    {
      id: 'fichero.tema', section: 'Fichero', title: 'Temas', one: 'tema', source: { table: 'links', select: 'topics,type' }, unit: ['enlace', 'enlaces'],
      desc: 'Clasifican los enlaces del Fichero. Un enlace puede tener varios.',
      uses: function (links, v) { return links.filter(function (l) { return (l.topics || []).indexOf(v) > -1; }).length; }
    },
    {
      id: 'fichero.formato', section: 'Fichero', title: 'Formatos', one: 'formato', source: { table: 'links', select: 'topics,type' }, unit: ['enlace', 'enlaces'],
      desc: 'Qué tipo de recurso es cada enlace: artículo, guía, herramienta…',
      uses: function (links, v) { return links.filter(function (l) { return l.type === v; }).length; }
    },
    {
      id: 'portfolio.tipo', section: 'Portfolio', title: 'Tipos', one: 'tipo', source: { table: 'portfolio', select: 'tipo' }, unit: ['elemento', 'elementos'],
      desc: 'Agrupan lo que hay en la pestaña Portfolio: manuales, proyectos, apps…',
      uses: function (rows, v) { return rows.filter(function (r) { return r.tipo === v; }).length; }
    },
    {
      id: 'agenda.categoria', section: 'Calendario', title: 'Categorías', one: 'categoría', fem: true, source: { table: 'agenda', select: 'categoria' }, unit: ['elemento', 'elementos'],
      desc: 'Dan color a tus eventos, bloques de foco y tareas. El color sigue el orden de la lista.',
      uses: function (rows, v) { return rows.filter(function (r) { return r.categoria === v; }).length; }
    }
  ];

  var ctx = null, opts = [], data = {}, flash = '';   // data: filas de cada tabla de origen, para contar usos
  var JSON_HEADERS = { 'Content-Type': 'application/json' };

  function load() {
    var ids = GROUPS.map(function (g) { return g.id; }).join(',');
    var sources = {};
    GROUPS.forEach(function (g) { sources[g.source.table] = g.source.select; });
    var tables = Object.keys(sources);
    return Promise.all([
      ctx.api('/rest/v1/ap_opciones?select=id,grupo,valor,posicion&grupo=in.(' + ids + ')&order=posicion.asc,created_at.asc')
    ].concat(tables.map(function (t) {
      // si una tabla de origen aún no existe, sus listas se ven igual (sin contar usos)
      return ctx.api('/rest/v1/' + t + '?select=' + sources[t]).catch(function (err) { if (err && err.auth) throw err; return []; });
    }))).then(function (r) {
      opts = r[0] || [];
      data = {};
      tables.forEach(function (t, i) { data[t] = r[i + 1] || []; });
    });
  }

  function render(c) {
    ctx = c;
    return load().then(function () { return paint; }, function (err) {
      if (err && err.auth) throw err;
      if (err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01')) return paintSetup;
      throw err;
    });
  }
  function rerender() { if (ctx.isCurrent()) window.dispatchEvent(new HashChangeEvent('hashchange')); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function paint() {
    var h = ctx.h;
    ctx.view.textContent = '';
    if (flash) { ctx.setStatus(flash); flash = ''; }
    ctx.view.appendChild(h('p', { class: 'ape-meta apx-intro', text: 'Listas que usan las demás pestañas. Si renombras o eliminas una opción, se actualizan también los elementos que la usan.' }));
    var sections = [];
    GROUPS.forEach(function (g) { if (sections.indexOf(g.section) < 0) sections.push(g.section); });
    sections.forEach(function (name) {
      ctx.view.appendChild(h('section', { class: 'apx-section', 'aria-labelledby': 'apx-s-' + name }, [
        h('h2', { class: 'ap-label apx-section-title', id: 'apx-s-' + name, text: name }),
        h('div', { class: 'apx-grid' }, GROUPS.filter(function (g) { return g.section === name; }).map(card))
      ]));
    });
  }

  function card(g) {
    var h = ctx.h, list = opts.filter(function (o) { return o.grupo === g.id; });
    var headId = 'apx-' + g.id.replace('.', '-');
    return h('div', { class: 'apx-card', role: 'group', 'aria-labelledby': headId }, [
      h('div', { class: 'apx-card-head' }, [
        h('h3', { class: 'ape-h3', id: headId, text: g.title }),
        h('span', { class: 'apx-count', text: String(list.length) })
      ]),
      h('p', { class: 'ape-meta', text: g.desc }),
      list.length
        ? h('ul', { class: 'apx-list', 'aria-label': g.title }, list.map(function (o) {
          var n = g.uses(data[g.source.table] || [], o.valor);
          return h('li', { class: 'apx-item' }, [
            h('span', { class: 'apx-name', text: o.valor }),
            h('span', { class: 'apx-uses', text: n ? plural(n, g.unit[0], g.unit[1]) : 'sin uso' }),
            h('span', { class: 'apx-act' }, [
              h('button', { type: 'button', class: 'ap-link-btn', text: 'Editar', 'aria-label': 'Renombrar ' + g.one + ' «' + o.valor + '»', onclick: function () { rename(g, o); } }),
              h('button', { type: 'button', class: 'ap-link-btn ap-link-btn--danger', text: 'Eliminar', 'aria-label': 'Eliminar ' + g.one + ' «' + o.valor + '»', onclick: function () { remove(g, o, n); } })
            ])
          ]);
        }))
        : h('p', { class: 'apx-empty', text: 'Todavía no hay ' + (g.fem ? 'ninguna ' : 'ningún ') + g.one + '.' }),
      h('button', { type: 'button', class: 'ap-tool apx-add', onclick: function () { add(g, list); } }, [h('span', { 'aria-hidden': 'true', text: '+' }), ' Añadir ' + g.one])
    ]);
  }

  function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  function exists(g, v, exceptId) {
    var k = v.toLocaleLowerCase('es');
    return opts.some(function (o) { return o.grupo === g.id && o.id !== exceptId && o.valor.toLocaleLowerCase('es') === k; });
  }
  function problem(g, v, exceptId) {
    if (!v) return 'Escribe un nombre.';
    if (v.length > 60) return 'Como mucho 60 caracteres.';
    if (exists(g, v, exceptId)) return 'Ya hay ' + (g.fem ? 'una ' : 'un ') + g.one + ' con ese nombre.';
    return null;
  }
  function failSave(err) {
    if (err && (err.code === '23505' || err.status === 409)) return ctx.setStatus('Ya existe una opción con ese nombre.', true);
    ctx.fail(err);
  }

  function add(g, list) {
    ctx.ask({ title: 'Añadir ' + g.one, input: true, ok: 'Añadir' }).then(function (v) {
      v = clean(v);
      if (v === '') return;
      var p = problem(g, v);
      if (p) return ctx.setStatus(p, true);
      var pos = list.reduce(function (m, o) { return Math.max(m, o.posicion || 0); }, 0) + 1;
      return ctx.api('/rest/v1/ap_opciones', { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, JSON_HEADERS), body: JSON.stringify({ grupo: g.id, valor: v, posicion: pos }) })
        .then(function () { flash = 'Añadido: «' + v + '».'; rerender(); });
    }).catch(failSave);
  }

  function rename(g, o) {
    ctx.ask({ title: 'Renombrar ' + g.one, input: true, value: o.valor, ok: 'Guardar' }).then(function (v) {
      v = clean(v);
      if (v === '' || v === o.valor) return;
      var p = problem(g, v, o.id);
      if (p) return ctx.setStatus(p, true);
      return ctx.api('/rest/v1/rpc/ap_opcion_renombrar', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ p_id: o.id, p_nuevo: v }) })
        .then(function (n) {
          flash = '«' + o.valor + '» ahora se llama «' + v + '»' + (n ? ' (' + plural(n, g.unit[0], g.unit[1]) + (n === 1 ? ' actualizado).' : ' actualizados).') : '.');
          rerender();
        });
    }).catch(failSave);
  }

  function remove(g, o, n) {
    ctx.ask({
      title: '¿Eliminar ' + (g.fem ? 'esta ' : 'este ') + g.one + '?',
      text: '«' + o.valor + '» dejará de estar disponible.' + (n ? ' Se quitará de ' + plural(n, g.unit[0], g.unit[1]) + ', que no se borran.' : '') + ' No se puede deshacer.',
      ok: 'Eliminar', danger: true
    }).then(function (yes) {
      if (!yes) return;
      return ctx.api('/rest/v1/rpc/ap_opcion_eliminar', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ p_id: o.id }) })
        .then(function () { flash = 'Eliminado: «' + o.valor + '».'; rerender(); });
    }).catch(ctx.fail);
  }

  function paintSetup() {
    var h = ctx.h;
    ctx.view.textContent = '';
    ctx.view.appendChild(h('div', { class: 'ap-empty' }, [
      h('p', { class: 'ap-empty-title', text: 'La configuración aún no está creada' }),
      h('p', { text: 'Ejecuta supabase/opciones.sql en el SQL Editor de Supabase. Mientras tanto, el Fichero usa los temas y formatos que ya tienen tus enlaces.' })
    ]));
  }

  return { render: render };
})();
