/* ═══════════════════════════════════════════════
   area-privada-fichero.js — pestaña «Fichero» del área privada (#/fichero)
   ─────────────────────────────────────────────────
   Tabla de enlaces guardados (tabla public.links de Supabase, ver
   supabase/fichero.sql): buscar, filtrar, ordenar, añadir, editar y eliminar.
   No habla con Supabase por su cuenta: area-privada.js le pasa su cliente
   autenticado (api), su diálogo de confirmación (ask) y sus avisos.
   Todo lo que viene de la base se pinta como texto (textContent), nunca como HTML.
   ═══════════════════════════════════════════════ */
window.APFichero = (function () {
  'use strict';

  var TOPICS = ['Visualización', 'Ejemplos', 'Power BI', 'Datos abiertos', 'Gente'];
  var TYPES = ['Artículo', 'Ejemplo', 'Guía', 'Catálogo', 'Herramienta', 'Portal de datos', 'Blog o canal', 'Portfolio', 'Perfil'];
  var LANGS = { es: 'Español', en: 'Inglés' };
  var COLS = 'id,title,url,url_key,topics,type,tags,author,note,description,rating,lang,saved_at,updated_at';

  var ctx = null, rows = null, dialog = null, editing = null;
  var st = { q: '', tema: '', formato: '', sort: 'saved_at', dir: -1 };
  var ui = {};
  var dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

  /* ── Utilidades ── */
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // Misma clave que la carga inicial: sin protocolo, www, barra final, fragmento ni parámetros de seguimiento
  var TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igsh|igshid|si|ref|ref_src|tracking_source|_hsenc|_hsmi)$/i;
  function urlKey(raw) {
    var u;
    try { u = new URL(String(raw).trim()); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    var params = [];
    u.searchParams.forEach(function (v, k) { if (!TRACKING.test(k)) params.push([k, v]); });
    params.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    var query = params.length ? '?' + new URLSearchParams(params).toString() : '';
    return u.hostname.toLowerCase().replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + query;
  }
  function domain(raw) { try { return new URL(raw).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function splitTags(s) {
    var seen = {}, out = [];
    String(s || '').split(',').forEach(function (t) {
      t = t.trim().slice(0, 40);
      if (t && !seen[norm(t)]) { seen[norm(t)] = 1; out.push(t); }
    });
    return out.slice(0, 12);
  }
  function uniq(list) { return list.filter(function (v, i, a) { return v && a.indexOf(v) === i; }); }
  function allTopics() { return uniq(TOPICS.concat.apply(TOPICS.slice(), (rows || []).map(function (r) { return r.topics || []; }))); }
  function allTypes() { return uniq(TYPES.concat((rows || []).map(function (r) { return r.type; }))); }

  /* ── Datos ── */
  var JSON_REP = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
  var data = {
    list: function () { return ctx.api('/rest/v1/links?select=' + COLS + '&order=saved_at.desc'); },
    insert: function (o) { return ctx.api('/rest/v1/links?select=' + COLS, { method: 'POST', headers: JSON_REP, body: JSON.stringify(o) }).then(function (r) { return r[0]; }); },
    update: function (id, o) { return ctx.api('/rest/v1/links?id=eq.' + id + '&select=' + COLS, { method: 'PATCH', headers: JSON_REP, body: JSON.stringify(o) }).then(function (r) { return r[0]; }); },
    remove: function (id) { return ctx.api('/rest/v1/links?id=eq.' + id, { method: 'DELETE' }); }
  };

  /* ── Vista ── */
  function render(c) {
    ctx = c;
    var h = ctx.h;
    return data.list().then(function (list) {
      rows = list || [];
      return function paint() {
        ctx.view.textContent = '';
        ui.q = h('input', { type: 'search', id: 'apf-q', placeholder: 'Título, sitio, etiqueta o nota', autocomplete: 'off', value: st.q, oninput: function () { st.q = this.value; drawRows(); } });
        ui.tema = select('apf-tema', 'Todos los temas', allTopics(), st.tema, function () { st.tema = this.value; drawRows(); });
        ui.formato = select('apf-formato', 'Todos los formatos', allTypes(), st.formato, function () { st.formato = this.value; drawRows(); });
        ui.count = h('p', { class: 'apf-count', role: 'status', 'aria-live': 'polite' });
        ui.body = h('tbody');
        ui.head = h('tr');
        ctx.view.appendChild(h('div', { class: 'apf-bar' }, [
          h('div', { class: 'ap-search apf-search' }, [
            h('label', { class: 'sr-only', for: 'apf-q', text: 'Buscar en el Fichero' }),
            h('span', { class: 'ap-search-ico', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' }),
            ui.q
          ]),
          h('div', { class: 'apf-filters' }, [
            h('label', { class: 'sr-only', for: 'apf-tema', text: 'Filtrar por tema' }), ui.tema,
            h('label', { class: 'sr-only', for: 'apf-formato', text: 'Filtrar por formato' }), ui.formato
          ]),
          h('button', { type: 'button', class: 'ap-tool ap-tool--dark', onclick: function () { openForm(null); } }, [h('span', { 'aria-hidden': 'true', text: '+' }), ' Añadir enlace'])
        ]));
        ctx.view.appendChild(ui.count);
        ctx.view.appendChild(h('div', { class: 'ap-table-wrap apf-wrap' }, [h('table', { class: 'ap-table apf-table' }, [
          h('caption', { class: 'sr-only', text: 'Enlaces guardados en el Fichero' }),
          h('thead', null, [ui.head]), ui.body
        ])]));
        drawHead();
        drawRows();
      };
    });
  }

  function select(id, allLabel, values, current, onchange) {
    var h = ctx.h;
    return h('select', { id: id, class: 'apf-select', onchange: onchange },
      [h('option', { value: '', text: allLabel })].concat(values.map(function (v) {
        return h('option', { value: v, text: v, selected: v === current });
      })));
  }

  var HEAD = [
    { key: 'title', label: 'Recurso', cls: 'apf-c-res' },
    { key: 'topics', label: 'Tema', cls: 'apf-c-tema' },
    { key: 'type', label: 'Formato', cls: 'apf-c-fmt' },
    { key: null, label: 'Etiquetas', cls: 'apf-c-tags' },
    { key: 'rating', label: '★', sr: 'Valoración', cls: 'apf-c-rate' },
    { key: 'saved_at', label: 'Guardado', cls: 'apf-c-date' }
  ];
  function drawHead() {
    var h = ctx.h;
    ui.head.textContent = '';
    HEAD.forEach(function (c) {
      if (!c.key) return ui.head.appendChild(h('th', { scope: 'col', class: c.cls, text: c.label }));
      var on = st.sort === c.key;
      ui.head.appendChild(h('th', { scope: 'col', class: c.cls, 'aria-sort': on ? (st.dir > 0 ? 'ascending' : 'descending') : null }, [
        h('button', { type: 'button', class: 'apf-sort', onclick: function () {
          st.dir = st.sort === c.key ? -st.dir : (c.key === 'title' || c.key === 'topics' || c.key === 'type' ? 1 : -1);
          st.sort = c.key; drawHead(); drawRows();
        } }, [c.sr ? h('span', { 'aria-hidden': 'true', text: c.label }) : c.label, c.sr ? h('span', { class: 'sr-only', text: c.sr }) : null,
          h('span', { class: 'apf-arrow', 'aria-hidden': 'true', text: on ? (st.dir > 0 ? '↑' : '↓') : '' })])
      ]));
    });
    ui.head.appendChild(h('th', { scope: 'col', class: 'ap-col-act' }, [h('span', { class: 'sr-only', text: 'Acciones' })]));
  }

  function visible() {
    var words = norm(st.q).split(/\s+/).filter(Boolean);
    var list = rows.filter(function (r) {
      if (st.tema && (r.topics || []).indexOf(st.tema) < 0) return false;
      if (st.formato && r.type !== st.formato) return false;
      if (!words.length) return true;
      var hay = norm([r.title, domain(r.url), r.author, r.type, (r.topics || []).join(' '), (r.tags || []).join(' '), r.note, r.description].join(' '));
      return words.every(function (w) { return hay.indexOf(w) > -1; });
    });
    var k = st.sort, d = st.dir;
    return list.sort(function (a, b) {
      var x = k === 'topics' ? (a.topics || [])[0] : a[k], y = k === 'topics' ? (b.topics || [])[0] : b[k];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { sensitivity: 'base' })) * d;
    });
  }

  function drawRows() {
    var h = ctx.h, list = visible();
    ui.count.textContent = list.length === rows.length ? rows.length + ' enlaces' : list.length + ' de ' + rows.length + ' enlaces';
    ui.body.textContent = '';
    if (!list.length) {
      ui.body.appendChild(h('tr', null, [h('td', { colspan: '7', class: 'apf-empty' }, [
        h('p', { class: 'ap-empty-title', text: rows.length ? 'Nada con esos criterios' : 'El Fichero está vacío' }),
        h('p', { text: rows.length ? 'Prueba con otra palabra o quita los filtros.' : 'Añade el primer enlace con «+ Añadir enlace».' })
      ])]));
      return;
    }
    list.forEach(function (r) {
      var sub = r.note || r.description;
      ui.body.appendChild(h('tr', null, [
        h('td', { class: 'apf-c-res' }, [
          h('a', { class: 'apf-title', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, [
            r.title, h('span', { class: 'sr-only', text: ' (abre en pestaña nueva)' })
          ]),
          h('span', { class: 'apf-domain', text: domain(r.url) + (r.author ? ' · ' + r.author : '') }),
          sub ? h('span', { class: 'apf-sub' + (r.note ? ' is-note' : ''), text: sub }) : null,
          h('span', { class: 'apf-meta-m', text: [(r.topics || []).join(', '), r.type].filter(Boolean).join(' · ') })
        ]),
        h('td', { class: 'apf-c-tema', text: (r.topics || []).join(', ') || '—' }),
        h('td', { class: 'apf-c-fmt', text: r.type || '—' }),
        h('td', { class: 'apf-c-tags' }, (r.tags || []).length
          ? (r.tags || []).map(function (t) { return h('span', { class: 'apf-tag', text: t }); })
          : [h('span', { class: 'apf-none', text: '—' })]),
        h('td', { class: 'apf-c-rate' }, r.rating
          ? [h('span', { 'aria-hidden': 'true', text: '★'.repeat(r.rating) }), h('span', { class: 'sr-only', text: r.rating + ' de 5' })]
          : [h('span', { class: 'apf-none', text: '—' })]),
        h('td', { class: 'apf-c-date' }, [h('time', { datetime: r.saved_at, text: dateFmt.format(new Date(r.saved_at)) })]),
        h('td', { class: 'ap-col-act' }, [
          h('button', { type: 'button', class: 'ap-link-btn', 'aria-label': 'Editar «' + r.title + '»', text: 'Editar', onclick: function () { openForm(r); } }),
          h('button', { type: 'button', class: 'ap-link-btn ap-link-btn--danger', 'aria-label': 'Eliminar «' + r.title + '»', text: 'Eliminar', onclick: function () { removeRow(r); } })
        ])
      ]));
    });
  }

  /* ── Formulario: añadir y editar ── */
  function field(label, input, hint) {
    var h = ctx.h;
    return h('div', { class: 'apf-field' }, [h('label', { class: 'ap-field-label', for: input.id, text: label }), input, hint ? h('p', { class: 'apf-hint', id: input.id + '-hint', text: hint }) : null]);
  }
  function buildDialog() {
    var h = ctx.h, f = {};
    f.url = h('input', { id: 'apf-url', type: 'url', required: true, maxlength: '2000', autocomplete: 'off', inputmode: 'url', placeholder: 'https://' });
    f.title = h('input', { id: 'apf-title', required: true, maxlength: '300', autocomplete: 'off' });
    f.topics = h('div', { class: 'apf-checks' });
    f.type = h('select', { id: 'apf-type', class: 'apf-select' });
    f.tags = h('input', { id: 'apf-tags', maxlength: '400', autocomplete: 'off', 'aria-describedby': 'apf-tags-hint' });
    f.author = h('input', { id: 'apf-author', maxlength: '120', autocomplete: 'off' });
    f.rating = h('select', { id: 'apf-rating', class: 'apf-select' }, [h('option', { value: '', text: 'Sin valorar' })].concat([5, 4, 3, 2, 1].map(function (n) {
      return h('option', { value: String(n), text: '★'.repeat(n) + ' · ' + n + (n >= 4 ? ' (destacado)' : '') });
    })));
    f.lang = h('select', { id: 'apf-lang', class: 'apf-select' }, [h('option', { value: '', text: 'Sin indicar' }), h('option', { value: 'es', text: 'Español' }), h('option', { value: 'en', text: 'Inglés' })]);
    f.note = h('textarea', { id: 'apf-note', rows: '3', maxlength: '2000' });
    f.description = h('textarea', { id: 'apf-desc', rows: '2', maxlength: '600' });
    f.msg = h('p', { class: 'ap-msg', id: 'apf-msg', 'aria-live': 'assertive' });
    f.ok = h('button', { type: 'submit', class: 'btn btn-primary', text: 'Guardar' });
    f.titleEl = h('h2', { class: 'ap-dialog-title', id: 'apf-dialog-title' });
    var form = h('form', { method: 'dialog', novalidate: true, onsubmit: save }, [
      f.titleEl,
      h('div', { class: 'apf-grid' }, [
        h('div', { class: 'apf-wide' }, [field('Enlace', f.url)]),
        h('div', { class: 'apf-wide' }, [field('Título', f.title)]),
        h('fieldset', { class: 'apf-wide apf-fieldset' }, [h('legend', { class: 'ap-field-label', text: 'Tema' }), f.topics]),
        field('Formato', f.type),
        field('Valoración', f.rating),
        field('Etiquetas', f.tags, 'Separadas por comas: color, mapas, DAX…'),
        field('Autor u organización', f.author),
        h('div', { class: 'apf-wide' }, [field('Por qué lo guardo', f.note)]),
        h('div', { class: 'apf-wide' }, [field('Descripción', f.description)]),
        field('Idioma', f.lang)
      ]),
      f.msg,
      h('div', { class: 'ap-dialog-actions' }, [
        h('button', { type: 'button', class: 'btn btn-outline', text: 'Cancelar', onclick: function () { dialog.close(); } }),
        f.ok
      ])
    ]);
    dialog = h('dialog', { class: 'ap-dialog apf-dialog', 'aria-labelledby': 'apf-dialog-title' }, [form]);
    dialog.f = f;
    document.body.appendChild(dialog);
  }

  function openForm(r) {
    if (!dialog) buildDialog();
    var h = ctx.h, f = dialog.f;
    editing = r;
    f.titleEl.textContent = r ? 'Editar enlace' : 'Añadir enlace';
    f.ok.textContent = r ? 'Guardar cambios' : 'Añadir';
    f.url.value = r ? r.url : '';
    f.title.value = r ? r.title : '';
    f.topics.textContent = '';
    allTopics().forEach(function (t, i) {
      var id = 'apf-t' + i;
      f.topics.appendChild(h('label', { class: 'apf-check', for: id }, [
        h('input', { type: 'checkbox', id: id, value: t, checked: !!(r && (r.topics || []).indexOf(t) > -1) }), ' ' + t
      ]));
    });
    f.type.textContent = '';
    [h('option', { value: '', text: 'Sin formato' })].concat(allTypes().map(function (t) { return h('option', { value: t, text: t }); }))
      .forEach(function (o) { f.type.appendChild(o); });
    f.type.value = r && r.type ? r.type : '';
    f.tags.value = r ? (r.tags || []).join(', ') : '';
    f.author.value = r && r.author ? r.author : '';
    f.rating.value = r && r.rating ? String(r.rating) : '';
    f.lang.value = r && r.lang && LANGS[r.lang] ? r.lang : '';
    f.note.value = r && r.note ? r.note : '';
    f.description.value = r && r.description ? r.description : '';
    message('');
    f.ok.disabled = false;
    dialog.showModal();
    (r ? f.title : f.url).focus();
  }
  function message(t, err) {
    var m = dialog.f.msg;
    m.textContent = t;
    m.classList.toggle('is-error', !!err);
  }

  function save(e) {
    e.preventDefault();
    var f = dialog.f;
    var url = f.url.value.trim(), title = f.title.value.trim(), key = urlKey(url);
    if (!key) { message('El enlace tiene que empezar por http:// o https://', true); f.url.focus(); return; }
    if (!title) { message('Ponle un título.', true); f.title.focus(); return; }
    var dup = rows.filter(function (r) { return r.url_key === key && (!editing || r.id !== editing.id); })[0];
    if (dup) { message('Ya lo tienes guardado como «' + dup.title + '».', true); f.url.focus(); return; }
    var o = {
      url: url, url_key: key, title: title,
      topics: [].map.call(f.topics.querySelectorAll('input:checked'), function (c) { return c.value; }),
      type: f.type.value || null,
      tags: splitTags(f.tags.value),
      author: f.author.value.trim() || null,
      rating: f.rating.value ? +f.rating.value : null,
      lang: f.lang.value || null,
      note: f.note.value.trim() || null,
      description: f.description.value.trim() || null
    };
    f.ok.disabled = true;
    message('Guardando…');
    var job = editing ? data.update(editing.id, o) : data.insert(o);
    job.then(function (saved) {
      if (editing) rows = rows.map(function (r) { return r.id === saved.id ? saved : r; });
      else rows.unshift(saved);
      dialog.close();
      ctx.setStatus(editing ? 'Cambios guardados en «' + saved.title + '».' : 'Añadido: «' + saved.title + '».');
      refreshFilters();
      drawRows();
    }).catch(function (err) {
      f.ok.disabled = false;
      if (err && err.auth) { dialog.close(); return ctx.fail(err); }
      message(err && (err.status === 409 || err.code === '23505') ? 'Ese enlace ya está en el Fichero.' : 'No se ha podido guardar: ' + ((err && err.message) || 'error desconocido') + '.', true);
    });
  }

  function removeRow(r) {
    ctx.ask({ title: '¿Eliminar este enlace?', text: '«' + r.title + '» desaparecerá del Fichero. No se puede deshacer.', ok: 'Eliminar', danger: true }).then(function (yes) {
      if (!yes) return;
      ctx.setStatus('Eliminando…');
      data.remove(r.id).then(function () {
        rows = rows.filter(function (x) { return x.id !== r.id; });
        ctx.setStatus('Eliminado: «' + r.title + '».');
        refreshFilters();
        drawRows();
        if (ui.q) ui.q.focus();
      }).catch(ctx.fail);
    });
  }

  // los desplegables muestran también temas o formatos nuevos que se hayan escrito
  function refreshFilters() {
    [[ui.tema, 'Todos los temas', allTopics(), 'tema'], [ui.formato, 'Todos los formatos', allTypes(), 'formato']].forEach(function (s) {
      var el = s[0], h = ctx.h;
      el.textContent = '';
      el.appendChild(h('option', { value: '', text: s[1] }));
      s[2].forEach(function (v) { el.appendChild(h('option', { value: v, text: v })); });
      el.value = st[s[3]];
    });
  }

  return { render: render, urlKey: urlKey };
})();
