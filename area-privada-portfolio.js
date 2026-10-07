/* ═══════════════════════════════════════════════
   area-privada-portfolio.js — pestaña «Portfolio» del área privada (#/portfolio)
   ─────────────────────────────────────────────────
   Inventario de todo lo construido para el portfolio: manuales, proyectos y gráficos
   de Power BI, apps de Streamlit, repositorios, visualizaciones…
   Tabla public.portfolio (supabase/portfolio.sql). Los tipos son el grupo
   «portfolio.tipo» de public.ap_opciones y se gestionan en «Configuración».
   Todo lo que viene de la base se pinta como texto, nunca como HTML.
   ═══════════════════════════════════════════════ */
window.APPortfolio = (function () {
  'use strict';

  var COLS = 'id,titulo,tipo,estado,url,repo_url,pagina_url,descripcion,tecnologias,destacado,notas,posicion,updated_at';
  var ESTADOS = [['publicado', 'Publicado', 'is-ok'], ['en_curso', 'En curso', 'is-live'], ['idea', 'Idea', 'is-off'], ['archivado', 'Archivado', 'is-off']];
  var JSON_REP = { 'Content-Type': 'application/json', Prefer: 'return=representation' };

  var ctx = null, items = [], tipos = [], flash = '';
  var st = { q: '', tipo: '', estado: '' };
  var ui = {};

  function label(v) { for (var i = 0; i < ESTADOS.length; i++) if (ESTADOS[i][0] === v) return ESTADOS[i]; return [v, v, '']; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function uniq(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  // los tipos configurados, en su orden, más cualquiera que use un elemento y ya no esté en la lista
  function allTipos() { return uniq(tipos.concat(items.map(function (x) { return x.tipo; }))); }

  /* ── Datos ── */
  function load() {
    return Promise.all([
      ctx.api('/rest/v1/portfolio?select=' + COLS + '&order=posicion.asc,titulo.asc'),
      ctx.api('/rest/v1/ap_opciones?select=valor&grupo=eq.portfolio.tipo&order=posicion.asc,created_at.asc')
        .catch(function (err) { if (err && err.auth) throw err; return []; })
    ]).then(function (r) { items = r[0] || []; tipos = (r[1] || []).map(function (o) { return o.valor; }); });
  }
  function save(id, row) {
    return id
      ? ctx.api('/rest/v1/portfolio?id=eq.' + id + '&select=' + COLS, { method: 'PATCH', headers: JSON_REP, body: JSON.stringify(row) }).then(function (r) { return r[0]; })
      : ctx.api('/rest/v1/portfolio?select=' + COLS, { method: 'POST', headers: JSON_REP, body: JSON.stringify(row) }).then(function (r) { return r[0]; });
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

  /* ═══════════ VISTA ═══════════ */
  function paint() {
    var h = ctx.h;
    ctx.view.textContent = '';
    if (flash) { ctx.setStatus(flash); flash = ''; }
    ui.q = h('input', { type: 'search', id: 'app-q', placeholder: 'Título, descripción o tecnología', autocomplete: 'off', value: st.q, oninput: function () { st.q = this.value; draw(); } });
    ui.tipo = ctx.ui.select(allTipos(), st.tipo, 'Todos los tipos');
    ui.tipo.id = 'app-tipo';
    ui.tipo.addEventListener('change', function () { st.tipo = this.value; draw(); });
    ui.estado = ctx.ui.select(ESTADOS.map(function (e) { return [e[0], e[1]]; }), st.estado, 'Todos los estados');
    ui.estado.id = 'app-estado';
    ui.estado.addEventListener('change', function () { st.estado = this.value; draw(); });
    ui.count = h('p', { class: 'apf-count', role: 'status', 'aria-live': 'polite' });
    ui.list = h('div', { class: 'app-sections' });
    ctx.view.appendChild(h('div', { class: 'apf-bar' }, [
      h('div', { class: 'ap-search apf-search' }, [
        h('label', { class: 'sr-only', for: 'app-q', text: 'Buscar en el portfolio' }),
        h('span', { class: 'ap-search-ico', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' }),
        ui.q
      ]),
      h('div', { class: 'apf-filters' }, [
        h('label', { class: 'sr-only', for: 'app-tipo', text: 'Filtrar por tipo' }), ui.tipo,
        h('label', { class: 'sr-only', for: 'app-estado', text: 'Filtrar por estado' }), ui.estado
      ]),
      h('div', { class: 'apf-actions' }, [
        h('a', { class: 'ap-tool', href: '#/configuracion', text: 'Tipos' }),
        h('button', { type: 'button', class: 'ap-tool ap-tool--dark', onclick: function () { form(null); } }, [h('span', { 'aria-hidden': 'true', text: '+' }), ' Añadir'])
      ])
    ]));
    ctx.view.appendChild(ui.count);
    ctx.view.appendChild(ui.list);
    draw();
  }

  function visible() {
    var words = norm(st.q).split(/\s+/).filter(Boolean);
    return items.filter(function (x) {
      if (st.tipo && x.tipo !== st.tipo) return false;
      if (st.estado && x.estado !== st.estado) return false;
      if (!words.length) return true;
      var hay = norm([x.titulo, x.tipo, x.descripcion, x.notas, (x.tecnologias || []).join(' '), domain(x.url)].join(' '));
      return words.every(function (w) { return hay.indexOf(w) > -1; });
    });
  }

  function draw() {
    var h = ctx.h, list = visible();
    ui.count.textContent = list.length === items.length ? plural(items.length, 'elemento', 'elementos') : list.length + ' de ' + plural(items.length, 'elemento', 'elementos');
    ui.list.textContent = '';
    if (!list.length) {
      ui.list.appendChild(h('div', { class: 'ap-empty' }, [
        h('p', { class: 'ap-empty-title', text: items.length ? 'Nada con esos criterios' : 'El portfolio está vacío' }),
        h('p', { text: items.length ? 'Prueba con otra palabra o quita los filtros.' : 'Añade tu primer manual, proyecto o app con «+ Añadir».' })
      ]));
      return;
    }
    // una sección por tipo, en el orden de Configuración; «Sin tipo» al final
    allTipos().concat([null]).forEach(function (t) {
      var group = list.filter(function (x) { return (x.tipo || null) === t; }).sort(function (a, b) {
        return (b.destacado - a.destacado) || (a.posicion - b.posicion) || a.titulo.localeCompare(b.titulo, 'es');
      });
      if (!group.length) return;
      var id = 'app-s-' + norm(t || 'sin-tipo').replace(/[^a-z0-9]+/g, '-');
      ui.list.appendChild(h('section', { class: 'app-section', 'aria-labelledby': id }, [
        h('div', { class: 'app-section-head' }, [
          h('h2', { class: 'ape-h3', id: id, text: t || 'Sin tipo' }),
          h('span', { class: 'apx-count', text: String(group.length) })
        ]),
        h('ul', { class: 'app-grid' }, group.map(card))
      ]));
    });
  }

  function extLink(href, text, cls) {
    var h = ctx.h;
    return h('a', { class: cls, href: href, target: '_blank', rel: 'noopener noreferrer' }, [text, h('span', { class: 'sr-only', text: ' (abre en pestaña nueva)' })]);
  }

  function card(x) {
    var h = ctx.h, e = label(x.estado);
    var links = [
      x.url ? extLink(x.url, 'Abrir', 'app-link app-link--main') : null,
      x.repo_url ? extLink(x.repo_url, 'Código', 'app-link') : null,
      x.pagina_url ? extLink(x.pagina_url, 'En el portfolio', 'app-link') : null
    ].filter(Boolean);
    return h('li', { class: 'app-card' + (x.destacado ? ' is-featured' : '') }, [
      h('div', { class: 'app-card-top' }, [
        x.destacado ? h('span', { class: 'app-star' }, [h('span', { 'aria-hidden': 'true', text: '★ ' }), 'Destacado']) : null,
        x.estado !== 'publicado' ? h('span', { class: 'ape-badge ' + e[2], text: e[1] }) : null
      ]),
      h('h3', { class: 'app-title' }, [x.url ? extLink(x.url, x.titulo, 'app-title-link') : x.titulo]),
      x.url ? h('p', { class: 'apf-domain', text: domain(x.url) }) : null,
      x.descripcion ? h('p', { class: 'app-desc', text: x.descripcion }) : null,
      (x.tecnologias || []).length ? h('ul', { class: 'app-tags', 'aria-label': 'Tecnologías' }, x.tecnologias.map(function (t) { return h('li', { class: 'apf-tag', text: t }); })) : null,
      x.notas ? h('p', { class: 'app-note' }, [h('span', { class: 'sr-only', text: 'Nota privada: ' }), x.notas]) : null,
      h('div', { class: 'app-card-foot' }, [
        h('div', { class: 'app-links' }, links),
        h('div', { class: 'app-act' }, [
          h('button', { type: 'button', class: 'ap-link-btn', text: 'Editar', 'aria-label': 'Editar «' + x.titulo + '»', onclick: function () { form(x); } }),
          h('button', { type: 'button', class: 'ap-link-btn ap-link-btn--danger', text: 'Eliminar', 'aria-label': 'Eliminar «' + x.titulo + '»', onclick: function () { remove(x); } })
        ])
      ])
    ]);
  }

  /* ═══════════ FORMULARIO ═══════════ */
  function form(x) {
    var u = ctx.ui, h = ctx.h;
    var f = {
      titulo: u.input('text', x && x.titulo, { required: true, maxlength: '200' }),
      tipo: u.select(allTipos(), x ? x.tipo : (st.tipo || ''), 'Sin tipo'),
      estado: u.select(ESTADOS.map(function (e) { return [e[0], e[1]]; }), x ? x.estado : 'publicado'),
      url: u.input('url', x && x.url, { maxlength: '2000', placeholder: 'https://', inputmode: 'url' }),
      repo: u.input('url', x && x.repo_url, { maxlength: '2000', placeholder: 'https://github.com/…', inputmode: 'url' }),
      pagina: u.input('url', x && x.pagina_url, { maxlength: '2000', placeholder: 'https://borjamora.es/…', inputmode: 'url' }),
      desc: u.area(x && x.descripcion, 3, 1000),
      tec: u.input('text', x ? (x.tecnologias || []).join(', ') : '', { maxlength: '400' }),
      notas: u.area(x && x.notas, 2, 4000),
      dest: h('input', { type: 'checkbox', id: 'app-f-dest', checked: !!(x && x.destacado) })
    };
    u.formDialog(x ? 'Editar' : 'Añadir al portfolio', x ? 'Guardar cambios' : 'Añadir', [
      u.field('app-f-tit', 'Título', f.titulo, { wide: true }),
      u.field('app-f-tipo', 'Tipo', f.tipo, { hint: 'Los tipos se gestionan en Configuración.' }),
      u.field('app-f-est', 'Estado', f.estado),
      u.field('app-f-url', 'Enlace principal', f.url, { wide: true, hint: 'Dónde se ve: la web, el informe publicado, la app…' }),
      u.field('app-f-repo', 'Repositorio', f.repo),
      u.field('app-f-pag', 'Página en el portfolio', f.pagina),
      u.field('app-f-desc', 'Descripción', f.desc, { wide: true }),
      u.field('app-f-tec', 'Tecnologías', f.tec, { wide: true, hint: 'Separadas por comas: Power BI, DAX, Python…' }),
      h('div', { class: 'apf-field apf-wide' }, [h('label', { class: 'apf-check', for: 'app-f-dest' }, [f.dest, ' Destacado (sale entre los primeros de su tipo)'])]),
      u.field('app-f-not', 'Notas privadas', f.notas, { wide: true })
    ], function () {
      var urls = [[f.url, 'El enlace principal'], [f.repo, 'El repositorio'], [f.pagina, 'La página del portfolio']];
      var row = {
        titulo: f.titulo.value.trim(), tipo: f.tipo.value || null, estado: f.estado.value,
        url: f.url.value.trim() || null, repo_url: f.repo.value.trim() || null, pagina_url: f.pagina.value.trim() || null,
        descripcion: f.desc.value.trim() || null, notas: f.notas.value.trim() || null, destacado: f.dest.checked,
        tecnologias: uniq(f.tec.value.split(',').map(function (t) { return t.trim().slice(0, 40); })).slice(0, 15)
      };
      if (!row.titulo) throw u.invalid('Ponle un título.', f.titulo);
      urls.forEach(function (p) { var v = p[0].value.trim(); if (v && !/^https?:\/\//i.test(v)) throw u.invalid(p[1] + ' tiene que empezar por http:// o https://', p[0]); });
      if (!x) row.posicion = items.reduce(function (m, i) { return Math.max(m, i.posicion || 0); }, 0) + 1;
      return save(x && x.id, row).then(function (saved) {
        flash = x ? 'Cambios guardados en «' + saved.titulo + '».' : 'Añadido: «' + saved.titulo + '».';
        rerender();
      });
    }, f.titulo);
  }

  function remove(x) {
    ctx.ask({ title: '¿Eliminar del portfolio?', text: '«' + x.titulo + '» desaparecerá de esta lista (no se toca nada de la web publicada). No se puede deshacer.', ok: 'Eliminar', danger: true })
      .then(function (yes) {
        if (!yes) return;
        return ctx.api('/rest/v1/portfolio?id=eq.' + x.id, { method: 'DELETE' }).then(function () { flash = 'Eliminado: «' + x.titulo + '».'; rerender(); });
      }).catch(ctx.fail);
  }

  function paintSetup() {
    var h = ctx.h;
    ctx.view.textContent = '';
    ctx.view.appendChild(h('div', { class: 'ap-empty' }, [
      h('p', { class: 'ap-empty-title', text: 'El portfolio aún no está creado' }),
      h('p', { text: 'Ejecuta supabase/opciones.sql y después supabase/portfolio.sql en el SQL Editor de Supabase. Se cargarán los 30 elementos publicados en borjamora.es.' })
    ]));
  }

  return { render: render };
})();
