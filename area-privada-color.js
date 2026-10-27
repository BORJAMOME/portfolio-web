/* ═══════════════════════════════════════════════
   area-privada-color.js: Color Studio (#/color)
   ─────────────────────────────────────────────────
   Herramienta personal de color aplicada al vestuario. Cuatro vistas sobre el mismo estado:
     #/color             Studio: construir un outfit, su composición y su distribución cromática
     #/color/inspiracion Inspiración: outfits guardados de internet con su paleta extraída (cs_inspirations)
     #/color/biblioteca  Biblioteca de paletas (crear, editar, importar, exportar)
     #/color/armario     Armario: prendas reales con foto y colores corregibles
     #/color/calcetines  Guía de calcetines (reglas explícitas)
   Esta capa solo pinta e interactúa. Las reglas viven en módulos ES aparte, sin DOM y probados
   con tools/test-color.mjs: color-studio/engine.js (color, proporciones, coincidencias),
   compose.js (lectura del conjunto, direcciones y paletas como inspiración), socks.js (calcetines),
   data.js (validación, importación, exportación), image.js (fotos) e inspiration.js (Inspiración).
   Datos: tablas cs_* y bucket privado «armario» (supabase/color-studio.sql), con RLS.
   Modo ejemplo: datos inventados en memoria, señalados en todo momento y que nunca se guardan.
   ═══════════════════════════════════════════════ */
window.APColor = (function () {
  'use strict';

  var VIEWS = [
    { id: 'studio', arg: '', label: 'Studio', title: 'Construye un conjunto', sub: 'Elige prendas reales, lee cómo funciona el color y explora otras direcciones.' },
    { id: 'inspiracion', arg: 'inspiracion', label: 'Inspiración', title: 'Inspiración', sub: 'Outfits que te gustan, con su paleta: tu archivo de referencias para crear los tuyos.' },
    { id: 'biblioteca', arg: 'biblioteca', label: 'Biblioteca', title: 'Biblioteca de paletas', sub: 'Combinaciones de referencia: tuyas, de libros, webs o fotos.' },
    { id: 'armario', arg: 'armario', label: 'Armario', title: 'Mi armario', sub: 'Tus prendas, con su foto y sus colores corregidos a mano.' },
    { id: 'calcetines', arg: 'calcetines', label: 'Calcetines', title: 'Guía de calcetines', sub: 'Continuidad, coordinación y contraste: el calcetín según el pantalón, el calzado y el resto del conjunto.' }
  ];
  var ICON = {
    studio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M4 9.5h16M4 15h16"/></svg>',
    inspiracion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><rect x="4" y="3.5" width="16" height="17" rx="1.5"/><circle cx="9.5" cy="9" r="1.7"/><path d="M4.5 17.5l4.6-4.2 3.6 3 2.8-2.3 4 3.4"/></svg>',
    biblioteca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="5.5" rx="1"/><rect x="3.5" y="13.5" width="17" height="5.5" rx="1"/><path d="M9.2 5v5.5M14.8 5v5.5M12 13.5V19"/></svg>',
    armario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5a2 2 0 1 1 2-2c0 1.2-2 1.6-2 3.2v.8"/><path d="M12 9.5 3.5 16a1.4 1.4 0 0 0 .8 2.5h15.4a1.4 1.4 0 0 0 .8-2.5z"/></svg>',
    calcetines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M9 3.5h7v9.2l-3.6 5.6a3.4 3.4 0 0 1-5.7-3.7L9 12.4z"/><path d="M9 7.5h7"/></svg>'
  };
  var BUCKET = 'armario';
  var DRAFT_KEY = 'bm_cs_draft';
  var STALE_MS = 5 * 60 * 1000;

  /* ── Estado que sobrevive al cambiar de vista (el shell vuelve a llamar a render en cada ruta) ── */
  var M = null;                 // módulos { E, S, D, I, C }
  var cache = null;             // datos reales { garments, palettes, outfits, at }
  var inspCache = null;         // Inspiración { items, options, missing, at } (aparte: sin su tabla, el resto de Color Studio sigue)
  var userId = null;            // auth.uid(): carpeta propia de las fotos de Inspiración
  var flash = null;             // aviso para enseñar tras cambiar de vista
  var demo = null;              // datos de ejemplo si el modo ejemplo está activo
  var images = {};              // ruta → Promise<blob: URL> (fotos privadas descargadas con la sesión)
  var mem = {
    lib: { q: '', count: '', family: '', tag: '', source: '', fav: false },
    ward: { q: '', cat: '' },
    insp: { q: '', style: '', collection: '', season: '', family: '', fav: false, review: false, sort: 'saved', open: false },
    sock: { trousers: null, shoes: null },      // colores escritos en la guía y aplicados con «Actualizar»: solo valen en la guía
    sockPending: { tr: null, sh: null }         // texto escrito y aún no aplicado (sobrevive a repintar la guía)
  };
  var draft = readDraft(false), demoDraft = emptyDraft();

  // direction: Minimalista / Equilibrada / Creativa (estado de interfaz, no se guarda en cs_outfits)
  // shoeType: '' = deducido de la subcategoría del calzado · original: huecos antes de aplicar una propuesta
  function emptyDraft() { return { id: null, name: '', slots: {}, palette_id: null, override: null, formality: 'smart', direction: 'balanced', shoeType: '', original: null, occasion: '', notes: '', is_favorite: false }; }
  function readDraft() {
    try {
      var d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (d && typeof d === 'object' && d.slots) {
        if (!d.direction && d.preference) d.direction = d.preference === 'discreet' ? 'minimal' : d.preference === 'contrast' ? 'creative' : 'balanced';   // borradores anteriores
        delete d.preference;
        return Object.assign(emptyDraft(), d);
      }
    } catch (e) { /* sin almacenamiento */ }
    return emptyDraft();
  }
  function cur() { return demo ? demoDraft : draft; }
  function saveDraft() { if (demo) return; try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* sin almacenamiento */ } }

  function assetUrl(name, fallback) {
    var l = document.querySelector('link[data-ap-asset="' + name + '"]');
    return new URL(l ? l.getAttribute('href') : fallback, document.baseURI).href;
  }
  function loadLibs() {
    if (M) return Promise.resolve(M);
    return Promise.all([
      import(assetUrl('cs-engine', './color-studio/engine.js')),
      import(assetUrl('cs-socks', './color-studio/socks.js')),
      import(assetUrl('cs-data', './color-studio/data.js')),
      import(assetUrl('cs-image', './color-studio/image.js')),
      import(assetUrl('cs-compose', './color-studio/compose.js')),
      import(assetUrl('cs-inspiration', './color-studio/inspiration.js'))
    ]).then(function (m) { M = { E: m[0], S: m[1], D: m[2], I: m[3], C: m[4], N: m[5] }; return M; })
      .catch(function () { throw new Error('No se ha podido cargar Color Studio. Revisa la conexión.'); });
  }
  function isMissing(err) { return !!err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01'); }
  var JSON_H = { 'Content-Type': 'application/json' };

  /* ═══════════ INTRO ═══════════
     Bienvenida a pantalla completa al entrar en Color Studio: el nombre se revela con una máscara
     (transform + opacidad) y una línea fina se dibuja debajo. Es una capa aparte sobre la página:
     no toca la aplicación y se puede quitar borrando este bloque y los estilos csi- del CSS.
     · Una vez por carga de la página (memoria del módulo): no se repite al cambiar de sección ni al volver a la pestaña.
     · Corre en paralelo a la carga real: se va cuando termina la animación (~2 s) Y la aplicación está pintada;
       nunca espera más de INTRO.max. Un clic o una tecla la adelantan; salir de #/color la quita al momento.
     · Con prefers-reduced-motion no se muestra. Es decorativa: aria-hidden, el título real sigue siendo el h1. */
  var INTRO = { font: 700, reveal: 900, hold: 550, exit: 600, max: 6000 };
  var introPlayed = false, activeIntro = null;
  function startIntro() {
    if (activeIntro) return activeIntro;
    if (introPlayed) return null;
    introPlayed = true;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    var el = document.createElement('div');
    el.className = 'csi';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<p class="csi-title"><span class="csi-mask"><span class="csi-word">Color</span></span> <span class="csi-mask"><span class="csi-word">Studio</span></span></p><span class="csi-rule"></span>';
    document.body.appendChild(el);
    var ready = false, shown = false, gone = false, timers = [];
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function remove() {
      if (gone) return;
      gone = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('pointerdown', leave, true);
      document.removeEventListener('keydown', leave, true);
      el.remove();
      activeIntro = null;
    }
    function leave() {
      if (gone || el.classList.contains('is-out')) return;
      el.classList.add('is-out');
      later(remove, INTRO.exit + 50);
    }
    function onHash() { if (!/^#\/color(\/|$)/.test(location.hash)) remove(); }
    window.addEventListener('hashchange', onHash);
    document.addEventListener('pointerdown', leave, true);
    document.addEventListener('keydown', leave, true);
    // espera breve a la fuente del título para que no cambie de letra a mitad de la animación
    var font = document.fonts && document.fonts.load ? document.fonts.load('500 64px Newsreader').catch(function () {}) : null;
    Promise.race([font, new Promise(function (r) { setTimeout(r, INTRO.font); })]).then(function () {
      if (gone) return;
      el.classList.add('is-in');
      later(function () { shown = true; if (ready) leave(); }, INTRO.reveal + INTRO.hold);
    });
    later(leave, INTRO.max);
    activeIntro = { ready: function () { ready = true; if (shown) leave(); }, abort: remove };
    return activeIntro;
  }

  /* ═══════════ RENDER ═══════════ */
  function render(ctx) {
    var intro = startIntro();
    var h = ctx.h, ui = ctx.ui;
    var view = VIEWS.filter(function (v) { return v.arg === (ctx.arg || '').split('/')[0]; })[0] || VIEWS[0];
    var root, body, toastEl, toastTimer;

    /* ── Datos ── */
    var st = {
      load: function () {
        return Promise.all([
          ctx.api('/rest/v1/cs_garments?select=*&order=created_at.desc'),
          ctx.api('/rest/v1/cs_palettes?select=*&order=updated_at.desc'),
          ctx.api('/rest/v1/cs_outfits?select=*&order=updated_at.desc')
        ]).then(function (r) { cache = { garments: r[0] || [], palettes: r[1] || [], outfits: r[2] || [], at: Date.now() }; });
      },
      // Inspiración: tabla propia (color-studio-inspiracion.sql). Si no existe, solo esa vista lo explica.
      // Estilos y colecciones salen de ap_opciones (Configuración); sin esa tabla se usan los estilos por defecto.
      loadInsp: function () {
        return Promise.all([
          ctx.api('/rest/v1/cs_inspirations?select=*&order=created_at.desc'),
          ctx.api('/rest/v1/ap_opciones?select=id,grupo,valor,posicion&grupo=in.(inspiracion.estilo,inspiracion.coleccion)&order=posicion.asc,created_at.asc')
            .catch(function (err) { if (err && err.auth) throw err; return null; })
        ]).then(function (r) { inspCache = { items: r[0] || [], options: r[1], missing: false, at: Date.now() }; }, function (err) {
          if (err && err.auth) throw err;
          if (isMissing(err)) { inspCache = { items: [], options: null, missing: true, at: Date.now() }; return; }
          inspCache = { items: [], options: null, error: (err && err.message) || 'error desconocido', at: 0 };   // at 0: se reintenta al volver
        });
      },
      uid: function () {
        if (userId) return Promise.resolve(userId);
        return ctx.api('/auth/v1/user').then(function (u) {
          if (!u || !/^[0-9a-f-]{36}$/i.test(u.id || '')) throw new Error('No se ha podido identificar la sesión. Recarga la página.');
          userId = u.id; return userId;
        });
      },
      insert: function (t, rows) {
        return ctx.api('/rest/v1/' + t + '?select=*', { method: 'POST', headers: Object.assign({ Prefer: 'return=representation' }, JSON_H), body: JSON.stringify(rows) });
      },
      update: function (t, id, patch) {
        return ctx.api('/rest/v1/' + t + '?id=eq.' + encodeURIComponent(id) + '&select=*', { method: 'PATCH', headers: Object.assign({ Prefer: 'return=representation' }, JSON_H), body: JSON.stringify(patch) })
          .then(function (r) { if (!r || !r[0]) throw new Error('No se ha encontrado el registro. Recarga la página.'); return r[0]; });
      },
      remove: function (t, id) { return ctx.api('/rest/v1/' + t + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
      upload: function (path, blob, type) {
        return ctx.api('/storage/v1/object/' + BUCKET + '/' + path, { method: 'POST', headers: { 'Content-Type': type, 'x-upsert': 'false' }, body: blob })
          .catch(function (err) {
            if (err && err.auth) throw err;
            var e = new Error(/bucket not found/i.test(err && err.message) ? 'Falta el bucket «armario»: ejecuta supabase/color-studio.sql en Supabase.' : 'No se ha podido subir la foto: ' + ((err && err.message) || 'error desconocido') + '.');
            throw e;
          });
      },
      image: function (path) {
        if (!images[path]) {
          images[path] = ctx.api('/storage/v1/object/authenticated/' + BUCKET + '/' + path, { raw: true })
            .then(function (r) { return r.blob(); }).then(function (b) { return URL.createObjectURL(b); })
            .catch(function (err) { delete images[path]; throw err; });
        }
        return images[path];
      },
      imageBlob: function (path) {
        return ctx.api('/storage/v1/object/authenticated/' + BUCKET + '/' + path, { raw: true }).then(function (r) { return r.blob(); });
      },
      removeImages: function (paths) {
        paths.forEach(function (p) { if (images[p]) { images[p].then(URL.revokeObjectURL, function () {}); delete images[p]; } });
        return ctx.api('/storage/v1/object/' + BUCKET, { method: 'DELETE', headers: JSON_H, body: JSON.stringify({ prefixes: paths }) });
      }
    };
    function data() { return demo || cache; }
    function garmentById(id) { return data().garments.filter(function (g) { return g.id === id; })[0] || null; }
    function paletteById(id) { return data().palettes.filter(function (p) { return p.id === id; })[0] || null; }
    function replaceIn(list, row) { var i = list.findIndex(function (x) { return x.id === row.id; }); if (i < 0) list.unshift(row); else list[i] = row; }
    function dropFrom(list, id) { var i = list.findIndex(function (x) { return x.id === id; }); if (i >= 0) list.splice(i, 1); }

    /* ── Utilidades de interfaz ── */
    function btn(text, cls, fn, attrs) { return h('button', Object.assign({ type: 'button', class: cls, onclick: fn }, attrs || {}), [].concat(text)); }
    function swatch(hex, cls, label) {
      var s = h('span', { class: 'cs-sw' + (cls ? ' ' + cls : ''), role: label ? 'img' : null, 'aria-label': label || null, 'aria-hidden': label ? null : 'true' });
      s.style.backgroundColor = hex;      // CSSOM: la CSP (style-src 'self') bloquea el atributo style, no esto
      return s;
    }
    function band(colors, opts) {
      opts = opts || {};
      var b = h('span', { class: 'cs-band' + (opts.cls ? ' ' + opts.cls : ''), 'aria-hidden': 'true' }, colors.map(function (c, i) {
        var hex = c.hex || c, s = h('span', { class: 'cs-band-c' + (opts.mark && opts.mark.indexOf(i) >= 0 ? ' is-mark' : '') });
        s.style.backgroundColor = hex;
        if (c.pct != null) s.style.flexGrow = String(Math.max(c.pct, 0.0001));
        return s;
      }));
      return b;
    }
    function hexList(colors) { return colors.map(function (c) { return (c.name ? c.name + ' ' : '') + (c.hex || c); }).join(', '); }
    function colorName(hex) { var d = M.E.describeColor(hex); return d ? d.name : hex; }
    function garmentName(g) { return g.name || (M.E.CATEGORY_LABEL[g.category] + ' ' + colorName(g.primary_color)); }
    function thumb(g, cls) {
      var box = h('span', { class: 'cs-thumb' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
      box.style.backgroundColor = g ? g.primary_color : 'transparent';
      if (g && g.image_path && !g.demo) {
        st.image(g.image_path).then(function (url) {
          var img = h('img', { alt: '', src: url, loading: 'lazy', decoding: 'async' });
          box.appendChild(img);
        }).catch(function (err) { if (err && err.auth) ctx.fail(err); box.classList.add('is-broken'); });
      }
      return box;
    }
    function toast(msg, isError) {
      clearTimeout(toastTimer);
      toastEl.textContent = msg;
      toastEl.classList.toggle('is-error', !!isError);
      toastEl.classList.add('is-on');
      toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, isError ? 7000 : 3500);
    }
    function failSoft(err) {
      if (err && err.auth) return ctx.fail(err);
      toast((err && err.message) || 'Algo ha fallado.', true);
    }
    function demoBlocked() { toast('Modo ejemplo: no se guarda nada. Sal del modo ejemplo para usar tus datos.', true); return true; }
    function sheet(title, build, opts) {
      opts = opts || {};
      var id = 'cs-sheet-' + Math.random().toString(36).slice(2, 8);
      var dlg = h('dialog', { class: 'cs-sheet' + (opts.wide ? ' cs-sheet--wide' : ''), 'aria-labelledby': id });
      var close = function () { dlg.close(); };
      dlg.appendChild(h('div', { class: 'cs-sheet-head' }, [
        h('h2', { class: 'cs-sheet-title', id: id, text: title }),
        btn('Cerrar', 'cs-link', close)
      ]));
      var content = h('div', { class: 'cs-sheet-body' });
      dlg.appendChild(content);
      build(content, close);
      dlg.addEventListener('close', function () { dlg.remove(); if (opts.onClose) opts.onClose(); });
      document.body.appendChild(dlg);
      dlg.showModal();
      return dlg;
    }
    function colorInput(id, labelText, value, onChange, opts) {
      opts = opts || {};
      var text = h('input', { type: 'text', id: id, value: value || '', autocomplete: 'off', spellcheck: 'false', maxlength: '9', inputmode: 'text', class: 'cs-hex-input', placeholder: '#RRGGBB' });
      var pick = h('input', { type: 'color', value: M.E.normalizeHex(value) || '#808080', 'aria-label': labelText + ': selector visual', class: 'cs-color-input' });
      pick.addEventListener('input', function () { text.value = pick.value.toUpperCase(); onChange(text.value, text.value); });
      text.addEventListener('input', function () { var n = M.E.normalizeHex(text.value); if (n) { pick.value = n.toLowerCase(); onChange(n, text.value.trim()); } else onChange(null, text.value.trim()); });
      var wrap = h('div', { class: 'cs-colorfield' + (opts.compact ? ' is-compact' : '') }, [
        opts.noLabel ? null : h('label', { class: 'ap-field-label', for: id, text: labelText }),
        h('div', { class: 'cs-colorfield-row' }, [pick, text].concat(opts.extra || []))
      ]);
      return { el: wrap, text: text, set: function (v) { text.value = v; pick.value = (M.E.normalizeHex(v) || '#808080').toLowerCase(); } };
    }
    function empty(title, text, actions) {
      return h('div', { class: 'cs-empty' }, [h('p', { class: 'cs-empty-title', text: title }), h('p', { class: 'cs-empty-text', text: text }), actions ? h('div', { class: 'cs-empty-actions' }, actions) : null]);
    }
    function badge(text, tone) { return h('span', { class: 'cs-badge' + (tone ? ' cs-badge--' + tone : ''), text: text }); }
    function sourceBadge(p) { return badge(p.demo ? 'Ejemplo' : p.source_type === 'own' ? 'Creada por ti' : M.D.SOURCE_LABEL[p.source_type] || 'Referencia', p.demo ? 'demo' : p.source_type === 'own' ? 'own' : 'src'); }

    /* ── Esqueleto ── */
    function nav() {
      return h('nav', { class: 'cs-nav', 'aria-label': 'Secciones de Color Studio' }, VIEWS.map(function (v) {
        return h('a', { class: 'cs-nav-a', href: '#/color' + (v.arg ? '/' + v.arg : ''), 'aria-current': v.id === view.id ? 'page' : null }, [
          h('span', { class: 'cs-nav-ico', 'aria-hidden': 'true', html: ICON[v.id] }), h('span', { text: v.label })
        ]);
      }));
    }
    function head() {
      return h('header', { class: 'cs-head' }, [
        h('p', { class: 'cs-eyebrow', text: 'Color Studio' }),
        h('h2', { class: 'cs-title', text: view.title }),
        h('p', { class: 'cs-sub', text: view.sub }),
        demo ? h('div', { class: 'cs-demo', role: 'note' }, [
          h('p', null, [h('strong', { text: 'Modo ejemplo. ' }), 'Prendas y paletas inventadas para probar la herramienta: no son tuyas, no proceden de ningún libro y no se guarda nada.']),
          btn('Salir del modo ejemplo', 'cs-link', exitDemo)
        ]) : null
      ]);
    }
    function rebuild() {
      var key = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-key');
      ctx.view.textContent = '';
      root = h('section', { class: 'cs', 'data-view': view.id, 'aria-labelledby': 'ap-app-title' });
      toastEl = h('div', { class: 'cs-toast', role: 'status', 'aria-live': 'polite' });
      body = h('div', { class: 'cs-body' });
      root.appendChild(head());
      root.appendChild(nav());
      root.appendChild(body);
      root.appendChild(toastEl);
      ctx.view.appendChild(root);
      ({ studio: paintStudio, inspiracion: paintInspiration, biblioteca: paintLibrary, armario: paintWardrobe, calcetines: paintSocks })[view.id]();
      if (key) { var el = root.querySelector('[data-key="' + key + '"]'); if (el) el.focus(); }
      if (flash) { toast(flash); flash = null; }
    }
    function refresh() { saveDraft(); rebuild(); }

    /* ═══════════ STUDIO ═══════════ */
    function slotItems() { return M.C.buildItems(cur().slots, data().garments); }
    function computed() {
      var items = slotItems(), est = M.E.estimateDistribution(items), d = cur(), manual = false, shown = est.colors.map(function (c) { return { hex: c.hex, pct: c.pct }; });
      if (d.override) {
        var a = d.override.map(function (x) { return x.hex; }).sort().join(), b = shown.map(function (x) { return x.hex; }).sort().join();
        if (a === b && est.valid) { shown = M.E.normalizeDistribution(d.override); manual = true; } else d.override = null;    // cambiaron las prendas: la edición manual ya no aplica
      }
      // colores para buscar paletas: principal y secundarios de cada prenda, con su superficie estimada
      var match = [];
      items.forEach(function (it) {
        var hexes = it.garment ? [it.garment.primary_color].concat(it.garment.secondary_colors || []) : it.hex ? [it.hex] : [];
        hexes.forEach(function (hex) {
          var src = (est.colors.filter(function (c) { return c.sources.some(function (s) { return s.slot === it.slot && s.hex === hex; }); })[0] || {});
          var share = (src.sources || []).filter(function (s) { return s.slot === it.slot && s.hex === hex; }).reduce(function (t, s) { return t + s.pct; }, 0);
          var prev = match.filter(function (m) { return m.hex === hex; })[0];
          if (prev) { prev.share += share; prev.label += ' y ' + it.label.toLowerCase(); } else match.push({ hex: hex, share: share, label: it.label });
        });
      });
      return { items: items, est: est, shown: shown, manual: manual, match: match, analysis: M.C.analyzeOutfit(items, { distribution: manual ? shown : null }) };
    }
    function setSlot(slot, entry) {
      var d = cur(), prev = d.slots[slot];
      d.slots[slot] = Object.assign({ weight: prev ? prev.weight : M.E.SLOT[slot].weight }, entry);
      d.override = null;
      refresh();
    }
    function snapshot(x) { return JSON.parse(JSON.stringify(x)); }
    function applyProposal(p) {
      var d = cur();
      if (!d.original) d.original = snapshot(d.slots);          // el conjunto de partida se conserva para volver a él
      d.slots = snapshot(p.slots); d.override = null;
      refresh();
      toast(p.hypothetical ? 'Propuesta aplicada con un color provisional: no es una prenda que tengas.' : 'Propuesta aplicada al outfit.');
    }
    function restoreOriginal() { var d = cur(); if (!d.original) return; d.slots = d.original; d.original = null; d.override = null; refresh(); toast('Has vuelto al conjunto original.'); }
    function shoeGarment(c) { var it = c.items.filter(function (x) { return x.slot === 'shoes'; })[0]; return it && it.garment ? it.garment : null; }
    function detectedShoe(c) { var g = shoeGarment(c); return g ? M.S.inferShoeType([g.subcategory, g.name].join(' ')) : null; }
    // manual = true solo en la guía de calcetines: el Studio usa siempre los colores reales del outfit
    function sockInputFrom(c, manual) {
      var by = {}; c.items.forEach(function (it) { by[it.slot] = it; });
      var others = c.items.filter(function (it) { return ['outer', 'top', 'accessory'].indexOf(it.slot) >= 0 && it.hex; }).map(function (it) {
        var g = c.est.garments.filter(function (x) { return x.slot === it.slot; })[0];
        return { hex: it.hex, label: it.label, share: g ? g.pct : 0, secondary: it.garment ? it.garment.secondary_colors || [] : [] };
      });
      var d = cur(), tr = by.bottom && by.bottom.garment, sh = by.shoes && by.shoes.garment;
      var mt = manual ? mem.sock.trousers : null, ms = manual ? mem.sock.shoes : null;
      return {
        trousers: mt || (by.bottom && by.bottom.hex) || null, shoes: ms || (by.shoes && by.shoes.hex) || null,
        trousersSecondary: !mt && tr ? tr.secondary_colors || [] : [], trousersPattern: !mt && tr ? tr.pattern : null,
        shoesSecondary: !ms && sh ? sh.secondary_colors || [] : [],
        shoeType: d.shoeType || detectedShoe(c),
        others: others, formality: d.formality, direction: d.direction,
        socks: data().garments.filter(function (g) { return g.category === 'calcetines'; }), palettes: data().palettes
      };
    }
    function useSock(p) {
      var d = cur();
      d.slots.socks = Object.assign({ weight: d.slots.socks ? d.slots.socks.weight : M.E.SLOT.socks.weight }, p.owned ? { garment_id: p.owned.garment.id, hex: null } : { garment_id: null, hex: p.hex });
      d.override = null;
      refresh();
      toast(p.owned ? 'Calcetín de tu armario añadido al outfit.' : 'Calcetín añadido como color provisional: no tienes uno de este tono registrado.');
    }
    function sockIsOn(p) { var e = cur().slots.socks; return !!e && (p.owned ? e.garment_id === p.owned.garment.id : !e.garment_id && e.hex === p.hex); }

    function paintStudio() {
      var c = computed(), d = cur();
      var layout = h('div', { class: 'cs-studio' });
      var main = h('div', { class: 'cs-col cs-col--main' }), side = h('div', { class: 'cs-col cs-col--side' });
      layout.appendChild(main); layout.appendChild(side);
      body.appendChild(layout);

      if (!data().garments.length && !Object.keys(d.slots).length) {
        main.appendChild(empty('Tu armario está vacío', 'Puedes empezar con colores a mano en cada hueco o registrar tus prendas en el armario. También puedes probar la herramienta con datos de ejemplo.', [
          h('a', { class: 'btn btn-primary', href: '#/color/armario', text: 'Añadir prendas' }),
          demo ? null : btn('Ver con datos de ejemplo', 'btn btn-outline', enterDemo)
        ]));
      }

      // cs-o-*: en móvil (una columna) el CSS reordena los bloques por tarea: prendas → dirección → calcetines →
      // composición → paletas → detalles → outfits, con «Guardar» fijo abajo (auditoría CS-06). En escritorio no cambia nada.
      function o(el, k) { el.classList.add('cs-o-' + k); return el; }
      main.appendChild(o(composition(c), 'compose'));
      main.appendChild(o(slotList(c), 'slots'));
      main.appendChild(o(directions(c), 'dir'));
      main.appendChild(o(gapsCard(c), 'gaps'));
      main.appendChild(o(sockInline(c), 'socks'));
      main.appendChild(o(manualEditor(c), 'manual'));
      main.appendChild(o(howItWorks(), 'how'));

      side.appendChild(o(references(c), 'refs'));
      side.appendChild(o(saveBlock(c), 'save'));
      side.appendChild(o(savedOutfits(), 'outfits'));
    }

    function composition(c) {
      var sec = h('section', { class: 'cs-card cs-compose', 'aria-labelledby': 'cs-compose-t' });
      sec.appendChild(h('div', { class: 'cs-card-head' }, [
        h('h3', { class: 'cs-h3', id: 'cs-compose-t', text: 'Composición del conjunto' }),
        badge(c.manual ? 'Ajustada a mano' : 'Estimación', c.manual ? 'manual' : 'est')
      ]));
      if (!c.est.valid) {
        sec.appendChild(h('div', { class: 'cs-compose-empty' }, [
          h('span', { class: 'cs-plate is-empty', 'aria-hidden': 'true' }, [h('span'), h('span'), h('span')]),
          h('p', { text: c.items.length ? 'Los pesos suman 0: asigna un peso mayor que 0 a alguna prenda para calcular la distribución.' : 'Elige al menos una prenda o un color para ver su composición.' })
        ]));
        if (c.est.warnings.length) sec.appendChild(h('ul', { class: 'cs-warn' }, c.est.warnings.map(function (w) { return h('li', { text: w }); })));
        return sec;
      }
      // lámina: una franja por prenda, en el orden en que se lleva, con su superficie estimada
      var gPct = M.E.roundPercentages(c.est.garments.map(function (g) { return g.pct; }));
      var plate = h('figure', { class: 'cs-plate' }, [
        h('span', { class: 'cs-plate-stack', 'aria-hidden': 'true' }, c.items.map(function (it, i) {
          var row = h('span', { class: 'cs-plate-row' }, it.colors.map(function (col) { var s = h('span', { class: 'cs-plate-c' }); s.style.backgroundColor = col.hex; s.style.flexGrow = String(col.share); return s; }));
          row.style.flexGrow = String(Math.max(c.est.garments[i].pct, 0.0001));
          return row;
        })),
        h('figcaption', { class: 'sr-only', text: 'Superficie estimada por prenda: ' + c.items.map(function (it, i) { return it.label + ' ' + gPct[i] + ' %'; }).join(', ') })
      ]);
      var cPct = M.E.roundPercentages(c.shown.map(function (x) { return x.pct; }));
      var roles = {}; (c.analysis.colors || []).forEach(function (x) { roles[x.hex] = x.role; });
      var ROLE = { dominante: 'Dominante', apoyo: 'Apoyo', acento: 'Acento' };
      var legend = h('div', { class: 'cs-compose-legend' }, [
        h('p', { class: 'cs-mini-t', text: 'Distribución cromática' }),
        band(c.shown, { cls: 'cs-band--dist' }),
        h('ul', { class: 'cs-dist', 'aria-label': 'Distribución cromática' + (c.manual ? ' ajustada a mano' : ' estimada') }, c.shown.map(function (x, i) {
          var role = roles[x.hex];
          return h('li', { class: 'cs-dist-row' }, [swatch(x.hex), h('span', { class: 'cs-dist-name' }, [h('span', { class: 'cs-dist-txt', text: colorName(x.hex) }), role ? h('span', { class: 'cs-role cs-role--' + role, text: ROLE[role] }) : null]),
            h('span', { class: 'cs-hex', text: x.hex }), h('span', { class: 'cs-pct', text: cPct[i] + ' %' })]);
        })),
        h('p', { class: 'cs-fine cs-fine--tight', text: (c.manual ? 'Porcentajes ajustados a mano.' : 'Porcentajes = superficie estimada, no peso visual.') + ' Dominante, apoyo y acento son una jerarquía sugerida: un acento es un color pequeño que destaca por intensidad o distancia.' }),
        h('p', { class: 'cs-mini-t', text: 'Superficie por prenda' }),
        h('ul', { class: 'cs-surf' }, c.items.map(function (it, i) {
          return h('li', null, [h('span', { text: it.label }), h('span', { class: 'cs-pct', text: gPct[i] + ' %' })]);
        }))
      ]);
      sec.appendChild(h('div', { class: 'cs-compose-grid' }, [plate, legend]));
      if (c.est.warnings.length) sec.appendChild(h('ul', { class: 'cs-warn' }, c.est.warnings.map(function (w) { return h('li', { text: w }); })));
      return sec;
    }

    function slotList(c) {
      var d = cur();
      var sec = h('section', { class: 'cs-card', 'aria-labelledby': 'cs-slots-t' }, [
        h('div', { class: 'cs-card-head' }, [h('h3', { class: 'cs-h3', id: 'cs-slots-t', text: 'Prendas' }),
          Object.keys(d.slots).length ? btn('Vaciar', 'cs-link', function () { var x = cur(); x.slots = {}; x.override = null; x.id = null; x.name = ''; x.palette_id = null; x.original = null; mem.sock = { trousers: null, shoes: null }; mem.sockPending = { tr: null, sh: null }; refresh(); }) : null])
      ]);
      var list = h('ul', { class: 'cs-slots' });
      M.E.SLOTS.forEach(function (s) {
        var e = d.slots[s.id], it = c.items.filter(function (x) { return x.slot === s.id; })[0];
        if (!e) {
          list.appendChild(h('li', { class: 'cs-slot is-empty' }, [
            h('span', { class: 'cs-thumb is-empty', 'aria-hidden': 'true' }),
            h('span', { class: 'cs-slot-txt' }, [h('span', { class: 'cs-slot-k', text: s.label }), h('span', { class: 'cs-slot-n', text: 'Sin elegir' })]),
            btn(['Elegir', h('span', { class: 'sr-only', text: ' ' + s.label.toLowerCase() })], 'cs-btn-s', function () { pickFor(s.id); }, { 'data-key': 'pick-' + s.id })
          ]));
          return;
        }
        var g = it.garment, wId = 'cs-w-' + s.id;
        var weight = h('input', { type: 'number', id: wId, class: 'cs-weight', min: '0', step: '1', inputmode: 'decimal', value: e.weight == null ? '' : String(e.weight), 'data-key': 'w-' + s.id });
        weight.addEventListener('change', function () { var v = weight.value.trim(); var n = Number(v.replace(',', '.')); cur().slots[s.id].weight = v === '' ? null : Number.isFinite(n) ? n : v; cur().override = null; refresh(); });
        list.appendChild(h('li', { class: 'cs-slot' }, [
          g ? thumb(g) : (function () { var t = h('span', { class: 'cs-thumb' + (it.lost ? ' is-empty' : ''), 'aria-hidden': 'true' }); if (it.hex) t.style.backgroundColor = it.hex; return t; })(),
          h('span', { class: 'cs-slot-txt' }, [
            h('span', { class: 'cs-slot-k', text: s.label }),
            h('span', { class: 'cs-slot-n', text: it.lost ? 'Prenda eliminada del armario' : g ? garmentName(g) : it.hypothetical ? 'Color hipotético' : 'Color a mano' }),
            it.hypothetical && !g ? h('span', { class: 'cs-hypo', text: 'Propuesta: no es una prenda que tengas' }) : null,
            it.hex ? h('span', { class: 'cs-slot-c' }, [h('span', { class: 'cs-hex', text: it.hex }), ' · ', colorName(it.hex),
              g && g.secondary_colors && g.secondary_colors.length ? ' · +' + g.secondary_colors.length : null]) : null
          ]),
          h('span', { class: 'cs-slot-w' }, [h('label', { class: 'cs-weight-l', for: wId }, ['Peso', h('span', { class: 'sr-only', text: ' de ' + s.label.toLowerCase() })]), weight]),
          h('span', { class: 'cs-slot-act' }, [
            btn(['Cambiar', h('span', { class: 'sr-only', text: ' ' + s.label.toLowerCase() })], 'cs-link', function () { pickFor(s.id); }, { 'data-key': 'pick-' + s.id }),
            btn(['Quitar', h('span', { class: 'sr-only', text: ' ' + s.label.toLowerCase() })], 'cs-link cs-link--muted', function () { delete cur().slots[s.id]; cur().override = null; refresh(); })
          ])
        ]));
      });
      sec.appendChild(list);
      return sec;
    }

    function pickFor(slot) {
      var s = M.E.SLOT[slot];
      var options = data().garments.filter(function (g) { return s.categories.indexOf(g.category) >= 0; });
      sheet('Elegir ' + s.label.toLowerCase(), function (box, close) {
        if (options.length) {
          box.appendChild(h('p', { class: 'cs-mini-t', text: 'De tu armario' }));
          box.appendChild(h('ul', { class: 'cs-pick' }, options.map(function (g) {
            var on = cur().slots[slot] && cur().slots[slot].garment_id === g.id;
            return h('li', null, [btn([thumb(g), h('span', { class: 'cs-pick-n', text: garmentName(g) }), h('span', { class: 'cs-hex', text: g.primary_color })],
              'cs-pick-b' + (on ? ' is-on' : ''), function () { close(); setSlot(slot, { garment_id: g.id, hex: null }); }, { 'aria-pressed': on ? 'true' : 'false' })]);
          })));
        } else {
          box.appendChild(h('p', { class: 'cs-note', text: 'No tienes prendas de este tipo en el armario. Usa un color provisional o registra la prenda.' }));
        }
        box.appendChild(h('p', { class: 'cs-mini-t', text: 'Color provisional' }));
        var value = (cur().slots[slot] && cur().slots[slot].hex) || '';
        var picked = M.E.normalizeHex(value);
        var cf = colorInput('cs-pick-hex', 'Color de la prenda (HEX)', value, function (v) { picked = v; });
        var msg = h('p', { class: 'ap-msg', 'aria-live': 'polite' });
        box.appendChild(h('div', { class: 'cs-pick-manual' }, [cf.el, btn('Usar este color', 'btn btn-outline', function () {
          if (!picked) { msg.textContent = 'Escribe un HEX válido, por ejemplo #1F2A44.'; msg.classList.add('is-error'); cf.text.focus(); return; }
          close(); setSlot(slot, { garment_id: null, hex: picked });
        }), msg]));
        if (!demo) box.appendChild(btn('Registrar una prenda nueva', 'cs-link', function () {
          close(); editGarment(null, { category: s.categories[0], onSaved: function (g) { setSlot(slot, { garment_id: g.id, hex: null }); } });
        }));
      });
    }

    function manualEditor(c) {
      var d = cur();
      var det = h('details', { class: 'cs-card cs-details', open: c.manual ? true : null });
      det.appendChild(h('summary', { class: 'cs-summary', text: 'Ajustar la distribución a mano' }));
      if (!c.est.valid || c.shown.length < 2) { det.appendChild(h('p', { class: 'cs-note', text: 'Hace falta un conjunto con al menos dos colores para ajustar su reparto.' })); return det; }
      det.appendChild(h('p', { class: 'cs-note', text: 'Si la estimación no se parece a lo que ves en el espejo, corrígela. Al mover un color, el resto se reparte en proporción y el total sigue en 100 %. Cambiar una prenda o un peso vuelve a la estimación.' }));
      var list = h('ul', { class: 'cs-sliders' });
      var rounded = M.E.roundPercentages(c.shown.map(function (x) { return x.pct; }));
      c.shown.forEach(function (x, i) {
        var id = 'cs-sl-' + x.hex.slice(1);
        var range = h('input', { type: 'range', id: id, min: '0', max: '100', step: '1', value: String(rounded[i]), 'data-key': 'sl-' + x.hex });
        range.addEventListener('change', function () { d.override = M.E.setColorShare(c.shown, x.hex, Number(range.value)); refresh(); });
        list.appendChild(h('li', { class: 'cs-slider' }, [swatch(x.hex), h('label', { for: id, text: colorName(x.hex) + ' ' }), range, h('output', { for: id, class: 'cs-pct', text: rounded[i] + ' %' })]));
        range.addEventListener('input', function () { list.querySelector('output[for="' + id + '"]').textContent = range.value + ' %'; });
      });
      det.appendChild(list);
      if (c.manual) det.appendChild(btn('Volver a la estimación', 'cs-link', function () { d.override = null; refresh(); }, { 'data-key': 'reset-manual' }));
      return det;
    }

    function howItWorks() {
      return h('details', { class: 'cs-card cs-details' }, [
        h('summary', { class: 'cs-summary', text: 'Cómo se calcula' }),
        h('div', { class: 'cs-prose' }, [
          h('p', null, [h('strong', { text: 'Superficie estimada de cada prenda' }), ' = su peso ÷ la suma de los pesos × 100. Los pesos por defecto (pantalón 35, parte superior 30, prenda exterior 25, calzado 10, accesorio 3, calcetines 2) son una hipótesis de partida, no una medición: cámbialos si la prenda se ve más o menos.']),
          h('p', null, [h('strong', { text: 'Distribución cromática' }), ' = la superficie de cada prenda repartida entre sus colores (si definiste su reparto; si no, cuenta su color principal) y sumada por color. Dos colores casi indistinguibles (ΔE00 < 3) se agrupan y se avisa.']),
          h('p', null, [h('strong', { text: 'Peso visual percibido' }), ' no se calcula: un color saturado o con mucho contraste pesa más de lo que ocupa. Por eso la distribución se puede ajustar a mano.']),
          h('p', { text: 'Una foto de una prenda suelta no dice cuánto se ve dentro de un conjunto (capas, solapes, postura). Estimar la superficie desde una foto del outfit vestido queda para una fase posterior.' })
        ])
      ]);
    }

    /* ── Dirección cromática: lectura del conjunto y propuestas que no tocan el original hasta aplicarlas ── */
    function glossary(keys) {
      return h('details', { class: 'cs-gloss' }, [h('summary', { text: '¿Qué significa cada término?' }),
        h('dl', null, [].concat.apply([], keys.map(function (k) { var e = M.C.GLOSSARY[k]; return [h('dt', { text: e[0] }), h('dd', { text: e[1] })]; })))]);
    }
    function readingFacts(a) {
      var rel = a.relations[0];
      var rows = [
        ['Contraste de luminosidad', a.light],
        ['Temperatura', a.temperature === 'mixta' ? 'mezcla cálidos y fríos' : a.temperature],
        ['Acento', a.accents.length ? a.accents.map(function (x) { return x.name; }).join(', ') : 'ninguno'],
        ['Repetición', a.repetitions.length ? a.repetitions.map(function (r) { return r.name + ' (' + r.labels.join(' y ').toLowerCase() + ')'; }).join('; ') : 'ningún color se repite entre prendas'],
        a.lower ? ['Pantalón y calzado', a.lower.label.toLowerCase() + ', contraste ' + a.lower.light] : null,
        rel ? ['Relación principal', rel.label.toLowerCase() + ': ' + M.C.describeRelation(rel).replace(/^.*?: /, '')] : null
      ].filter(Boolean);
      return h('dl', { class: 'cs-facts' }, [].concat.apply([], rows.map(function (r) { return [h('dt', { text: r[0] }), h('dd', { text: r[1] })]; })));
    }
    function compareBands(p) {
      var col = function (title, a, cls) {
        return h('div', { class: 'cs-cmp-col' + (cls ? ' ' + cls : '') }, [
          h('p', { class: 'cs-mini-t', text: title }),
          band(a.colors.map(function (x) { return { hex: x.hex, pct: x.pct }; }), { cls: 'cs-band--cmp' }),
          h('p', { class: 'sr-only', text: title + ': ' + a.colors.map(function (x) { return x.name + ' ' + x.hex; }).join(', ') })
        ]);
      };
      return h('div', { class: 'cs-cmp' }, [col('Ahora', p.before), col('Propuesta', p.after, 'is-new')]);
    }
    function changeList(p) {
      return h('ul', { class: 'cs-changes' }, p.changes.map(function (ch) {
        return h('li', { class: 'cs-change' }, [
          ch.remove ? h('span', { class: 'cs-sw cs-sw--x', 'aria-hidden': 'true' }) : ch.garment ? thumb(ch.garment, 'cs-thumb--s') : swatch(ch.hex, 'cs-sw--m'),
          h('span', { class: 'cs-change-txt' }, [
            h('span', { class: 'cs-slot-k', text: ch.label }),
            h('span', { class: 'cs-change-n' }, [ch.from + ' → ', h('strong', { text: ch.name })]),
            ch.remove ? null : h('span', { class: 'cs-change-s' }, [h('span', { class: 'cs-hex', text: ch.hex }), ' · ',
              ch.hypothetical ? h('span', { class: 'cs-hypo', text: 'Hipotético: no tienes esta prenda' }) : h('span', { text: 'De tu armario' })])
          ])
        ]);
      }));
    }
    function proposalCard(p, key) {
      return h('article', { class: 'cs-prop2' + (p.hypothetical ? ' is-hypo' : '') }, [
        compareBands(p),
        changeList(p),
        h('p', { class: 'cs-prop2-exp', text: p.explanation }),
        p.diff.length ? h('div', { class: 'cs-diff' }, [h('p', { class: 'cs-mini-t', text: 'Qué cambia' }), h('ul', null, p.diff.map(function (t) { return h('li', { text: t }); }))]) : null,
        h('details', { class: 'cs-rules' }, [h('summary', { text: 'Criterio aplicado' }), h('ul', null, [h('li', { text: p.rule }),
          p.palette ? h('li', { text: 'Inspiración: paleta «' + (p.palette.name || 'sin nombre') + '»' + (p.palette.source_type === 'book' ? ' (HEX convertido de CMYK, aproximado).' : '.') }) : null])]),
        btn([p.hypothetical ? 'Aplicar con color provisional' : 'Aplicar al outfit', h('span', { class: 'sr-only', text: ' (' + p.changes.map(function (ch) { return ch.label.toLowerCase(); }).join(', ') + ')' })], 'cs-btn-s', function () { applyProposal(p); }, { 'data-key': key })
      ]);
    }
    function directions(c) {
      var d = cur();
      var sec = h('section', { class: 'cs-card cs-dir', 'aria-labelledby': 'cs-dir-t' }, [h('div', { class: 'cs-card-head' }, [h('h3', { class: 'cs-h3', id: 'cs-dir-t', text: 'Dirección cromática' })])]);
      sec.appendChild(h('div', { class: 'cs-dirs', role: 'group', 'aria-label': 'Dirección' }, M.C.DIRECTIONS.map(function (x) {
        var on = d.direction === x.id;
        return btn([h('span', { class: 'cs-dir-n', text: x.label }), h('span', { class: 'cs-dir-g', text: x.goal })], 'cs-dir-b', function () { d.direction = x.id; refresh(); }, { 'aria-pressed': on ? 'true' : 'false', 'data-key': 'dir-' + x.id });
      })));
      if (d.original) {
        sec.appendChild(h('div', { class: 'cs-orig', role: 'note' }, [h('p', { text: 'Has aplicado una propuesta. El conjunto de partida sigue guardado en este borrador.' }),
          btn('Volver al conjunto original', 'cs-link', restoreOriginal, { 'data-key': 'restore-original' })]));
      }
      if (!c.analysis.valid) { sec.appendChild(h('p', { class: 'cs-note', text: 'Elige prendas para leer el conjunto y explorar alternativas en cada dirección.' })); return sec; }
      var a = c.analysis;
      sec.appendChild(h('div', { class: 'cs-reading' }, [
        h('p', { class: 'cs-reading-t' }, ['Lectura actual: ', h('strong', { text: M.C.READING_LABEL[a.reading] })]),
        readingFacts(a),
        glossary(['luminosidad', 'acento', 'repeticion', 'temperatura', 'tonal', 'analoga', 'complementaria'])
      ]));
      var r = M.C.proposeDirection(d.direction, { slots: d.slots, garments: data().garments, palettes: data().palettes, formality: d.formality });
      var box = h('div', { class: 'cs-dir-props', 'aria-live': 'polite' });
      if (r.note) box.appendChild(h('p', { class: 'cs-note', text: r.note }));
      r.proposals.forEach(function (p, i) { box.appendChild(proposalCard(p, 'apply-' + i)); });
      sec.appendChild(box);
      sec.appendChild(h('p', { class: 'cs-fine', text: 'Las propuestas usan primero tus prendas; un color que no tienes se marca como hipotético. Aplicar cambia el borrador, no lo guardado' + (c.manual ? '; la comparación usa la superficie estimada, no tu ajuste manual.' : '.') }));
      return sec;
    }

    // qué prenda te falta (auditoría CS-22): sale de las propuestas hipotéticas de las tres direcciones
    function gapsCard(c) {
      var d = cur();
      var sec = h('section', { class: 'cs-card cs-gaps', 'aria-labelledby': 'cs-gaps-t' }, [h('div', { class: 'cs-card-head' }, [h('h3', { class: 'cs-h3', id: 'cs-gaps-t', text: 'Qué prenda te falta' })])]);
      if (!c.analysis.valid) { sec.appendChild(h('p', { class: 'cs-note', text: 'Elige prendas para ver qué color, en qué prenda, abriría más propuestas.' })); return sec; }
      var gaps = M.C.wardrobeGaps({ slots: d.slots, garments: data().garments, palettes: data().palettes, formality: d.formality });
      if (!gaps.length) { sec.appendChild(h('p', { class: 'cs-note', 'data-key': 'gaps-none', text: 'Para este conjunto, las tres direcciones se resuelven con prendas que ya tienes.' })); return sec; }
      sec.appendChild(h('ul', { class: 'cs-gap-list', 'data-key': 'gaps' }, gaps.map(function (x) {
        return h('li', { class: 'cs-gap' }, [
          swatch(x.hex, 'cs-sw--l'),
          h('span', { class: 'cs-gap-txt' }, [
            h('span', { class: 'cs-slot-n', text: x.label + ' en ' + x.name }),
            h('span', { class: 'cs-slot-c' }, [h('span', { class: 'cs-hex', text: x.hex }), ' · Abriría: ' + x.directions.map(function (id) { return M.C.DIRECTION[id].label; }).join(', ')]),
            h('details', { class: 'cs-rules' }, [h('summary', { text: 'Por qué' }), h('ul', null, [h('li', { text: x.explanation }), h('li', { text: 'Criterio: ' + x.rule })])])
          ])
        ]);
      })));
      sec.appendChild(h('p', { class: 'cs-fine', text: 'Se deduce de las propuestas de las tres direcciones para este conjunto: son colores que no tienes en ese tipo de prenda. No es una valoración de tu armario ni una lista de la compra.' }));
      return sec;
    }

    function references(c) {
      var d = cur(), pals = data().palettes;
      var sec = h('section', { class: 'cs-card', 'aria-labelledby': 'cs-refs-t' }, [h('div', { class: 'cs-card-head' }, [h('h3', { class: 'cs-h3', id: 'cs-refs-t', text: 'Paletas que inspiran' })])]);
      var chosen = d.palette_id ? paletteById(d.palette_id) : null;
      if (d.palette_id && !chosen) d.palette_id = null;
      if (!pals.length) { sec.appendChild(empty('Biblioteca vacía', 'Importa las combinaciones de Sanzo Wada o registra paletas para ver cuáles se relacionan con este conjunto.', [h('a', { class: 'btn btn-outline', href: '#/color/biblioteca', text: 'Ir a la biblioteca' })])); return sec; }
      if (!c.match.length) {
        if (chosen) sec.appendChild(h('div', { class: 'cs-ref is-on' }, [h('p', { class: 'cs-ref-n', text: chosen.name || 'Paleta sin nombre' }), band(chosen.colors, { cls: 'cs-band--ref' }),
          h('p', { class: 'cs-note', text: 'Referencia elegida. Elige prendas para compararla con tu conjunto.' })]));
        else sec.appendChild(h('p', { class: 'cs-note', text: 'Elige prendas para buscar paletas con colores idénticos o próximos.' }));
        return sec;
      }
      var ranked = M.E.rankPalettes(c.match, pals, { limit: 3 });
      if (chosen && !ranked.some(function (r) { return r.palette.id === chosen.id; })) ranked.unshift({ palette: chosen, match: M.E.matchColorsToPalette(c.match, chosen) });
      // con menos de 3 coincidencias por color, se completan con paletas relacionadas por familia (señaladas como tales)
      if (ranked.length < 3) ranked = ranked.concat(M.C.rankPalettesByFamily(c.match, pals, { limit: 3 - ranked.length, exclude: ranked.map(function (r) { return r.palette; }) }));
      if (!ranked.length) { sec.appendChild(h('p', { class: 'cs-note', text: 'Ninguna paleta de tu biblioteca tiene colores próximos (ΔE00 ≤ 10) ni dos colores de la misma familia que este conjunto.' })); return sec; }
      var input = { slots: d.slots, garments: data().garments, palettes: pals, formality: d.formality };
      var ROLE = M.C.PALETTE_ROLE;
      sec.appendChild(h('ul', { class: 'cs-refs' }, ranked.map(function (r) {
        var p = r.palette, on = d.palette_id === p.id, fam = r.match.kind === 'family';
        var rows = M.C.adaptPalette(p, fam ? Object.assign({ family: true }, input) : input);
        return h('li', { class: 'cs-ref' + (on ? ' is-on' : '') }, [
          h('div', { class: 'cs-ref-meta' }, [
            h('p', { class: 'cs-ref-n', text: p.name || 'Paleta sin nombre' }),
            h('p', { class: 'cs-badges' }, [fam ? badge('Relación por familia', 'family') : r.match.overall === 'exact' ? badge('Coincidencia exacta', 'exact') : badge('Coincidencia aproximada', 'approx'), sourceBadge(p)])
          ]),
          h('ul', { class: 'cs-adapt', 'aria-label': 'Colores de la paleta frente al conjunto' }, rows.map(function (x) {
            var status = x.present ? [(x.present.family ? 'Misma familia en el conjunto: ' : 'En el conjunto: ') + x.present.label.toLowerCase(), x.present.family ? 'is-fam' : 'is-in']
              : x.candidate ? ['Podría ser: ' + garmentName(x.candidate.garment) + ' (' + x.candidate.label.toLowerCase() + ')', 'is-cand']
              : ['No tienes una prenda de este color', 'is-miss'];
            return h('li', { class: 'cs-adapt-r ' + status[1] }, [
              swatch(x.hex, 'cs-sw--pal'),
              h('span', { class: 'cs-adapt-txt' }, [h('span', { class: 'cs-adapt-n' }, [x.name + ' ', h('span', { class: 'cs-hex', text: x.hex })]), h('span', { class: 'cs-adapt-s', text: status[0] })]),
              x.candidate ? thumb(x.candidate.garment, 'cs-thumb--s') : x.present && x.present.hex ? swatch(x.present.hex, 'cs-sw--m', 'Color de ' + x.present.label.toLowerCase() + ': ' + x.present.hex) : h('span', { class: 'cs-adapt-gap', 'aria-hidden': 'true' }),
              x.role ? h('span', { class: 'cs-adapt-role', text: ROLE[x.role] }) : null
            ]);
          })),
          h('div', { class: 'cs-ref-act' }, [
            btn(['Comparar con mi conjunto', h('span', { class: 'sr-only', text: ' («' + (p.name || 'sin nombre') + '»)' })], 'cs-btn-s', function () { comparePalette(p, fam); }, { 'data-key': 'cmp-' + p.id }),
            btn(on ? 'Referencia elegida' : 'Usar como referencia', on ? 'cs-link is-on' : 'cs-link', function () { d.palette_id = on ? null : p.id; refresh(); }, { 'aria-pressed': on ? 'true' : 'false', 'data-key': 'ref-' + p.id })
          ]),
          h('details', { class: 'cs-rules' }, [h('summary', { text: 'Por qué se relaciona' }), h('ul', { class: 'cs-why' }, (fam ? M.C.explainFamilyMatch(r.match) : M.E.explainMatch(r.match, p)).slice(0, 4).map(function (l) { return h('li', { text: l }); }))])
        ]);
      })));
      sec.appendChild(h('p', { class: 'cs-fine', text: 'Muestra a la izquierda: color de la paleta. A la derecha: tu prenda o el color de tu conjunto. Papel = relación con el color dominante. «Relación por familia» = mismos tipos de color con luminosidad parecida, no los mismos colores. ΔE00 mide proximidad, no si combinan bien. Los HEX de las paletas de libro son conversiones aproximadas de valores de impresión.' }));
      return sec;
    }
    function comparePalette(p, family) {
      var d = cur();
      var prop = M.C.proposeFromPalette(p, { slots: d.slots, garments: data().garments, palettes: data().palettes, formality: d.formality, family: !!family });
      sheet('Comparar con «' + (p.name || 'sin nombre') + '»', function (box, close) {
        box.appendChild(band(p.colors, { cls: 'cs-band--ref' }));
        if (!prop) { box.appendChild(h('p', { class: 'cs-note', text: 'El conjunto ya contiene los colores de esta paleta que se pueden llevar a una prenda, o la paleta no aporta un color nuevo y distinto (ΔE00 > 15).' })); return; }
        var card = proposalCard(prop, 'apply-pal');
        card.querySelector('button[data-key="apply-pal"]').addEventListener('click', close);
        box.appendChild(card);
      }, { wide: true });
    }

    function lengthNote(own, fit) {
      return own.lengthOk === false ? ' (' + M.S.SOCK_LENGTH_LABEL[own.length].toLowerCase() + '; con este calzado mejor ' + fit.label + ')' : '';
    }
    function sockResult(c) { return M.S.recommendSocks(sockInputFrom(c)); }
    function sockInline(c) {
      var sec = h('section', { class: 'cs-card', 'aria-labelledby': 'cs-sock-t' }, [h('div', { class: 'cs-card-head' }, [h('h3', { class: 'cs-h3', id: 'cs-sock-t', text: 'Calcetines' }),
        h('a', { class: 'cs-link', href: '#/color/calcetines', text: 'Guía completa' })])]);
      var input = sockInputFrom(c), r = sockResult(c);
      if (r.insufficient) { sec.appendChild(h('p', { class: 'cs-note', text: r.notes[0] })); return sec; }
      if (input.shoeType) sec.appendChild(h('p', { class: 'cs-fine cs-fine--top', text: 'Calzado: ' + M.S.SHOE_LABEL[input.shoeType].toLowerCase() + (cur().shoeType ? ' (elegido a mano)' : ' (deducido de la prenda)') + ' · Dirección ' + M.C.DIRECTION[cur().direction].label.toLowerCase() + '.' }));
      sec.appendChild(h('p', { class: 'cs-fine' + (input.shoeType ? ' cs-fine--tight' : ' cs-fine--top'), 'data-key': 'sock-fit' }, [h('strong', { text: 'Largo: ' }), r.fit.label + ' · ' + r.fit.weight.toLowerCase() + '.']));
      sec.appendChild(h('ul', { class: 'cs-socklines' }, r.proposals.map(function (p) {
        var on = sockIsOn(p);
        return h('li', { class: 'cs-sockline' + (on ? ' is-on' : '') }, [
          h('span', { class: 'cs-ankle is-mini', 'aria-hidden': 'true' }, ankle(input, p.hex)),
          h('span', { class: 'cs-sockline-txt' }, [
            h('span', { class: 'cs-slot-k', text: p.label + ' · contraste con el ' + (p.contrastTrousers ? 'pantalón ' + p.contrastTrousers : 'calzado ' + p.contrastShoes) }),
            h('span', { class: 'cs-slot-n' }, [p.name + ' ', h('span', { class: 'cs-hex', text: p.hex })]),
            h('span', { class: 'cs-slot-c', text: p.owned ? 'En tu armario: ' + garmentName(p.owned.garment) + lengthNote(p.owned, r.fit) : 'No tienes uno de este tono registrado' })
          ]),
          btn([on ? 'En el outfit' : 'Usar', h('span', { class: 'sr-only', text: ' calcetín ' + p.label.toLowerCase() })], on ? 'cs-btn-s is-on' : 'cs-btn-s', function () { if (!on) useSock(p); }, { 'aria-pressed': on ? 'true' : 'false', 'data-key': 'sock-' + p.type })
        ]);
      })));
      return sec;
    }

    function saveBlock(c) {
      var d = cur();
      var sec = h('section', { class: 'cs-card cs-save' + (c.items.length ? ' is-ready' : ''), 'aria-label': 'Guardar el outfit' });
      if (d.id) sec.appendChild(h('p', { class: 'cs-note', text: 'Editando «' + d.name + '».' }));
      sec.appendChild(btn(d.id ? 'Guardar cambios' : 'Guardar outfit', 'btn btn-primary cs-save-btn', function () { saveOutfit(c); }, { disabled: c.items.length ? null : true, 'data-key': 'save-outfit' }));
      if (!c.items.length) sec.appendChild(h('p', { class: 'cs-fine', text: 'Elige al menos una prenda para guardar.' }));
      return sec;
    }
    function saveOutfit(c) {
      if (demo) return demoBlocked();
      var d = cur();
      var name = ui.input('text', d.name || '', { maxlength: '120' });
      var occ = ui.input('text', d.occasion || '', { maxlength: '120' });
      var form = ui.select(M.S.FORMALITY, d.formality || '', 'Sin indicar');
      var notes = ui.area(d.notes || '', 3, 2000);
      var fav = h('input', { type: 'checkbox', checked: d.is_favorite ? true : null });
      var asNew = h('input', { type: 'checkbox' });
      var fields = [ui.field('cs-o-name', 'Nombre', name, { wide: true }), ui.field('cs-o-occ', 'Ocasión', occ), ui.field('cs-o-form', 'Formalidad', form),
        ui.field('cs-o-notes', 'Notas', notes, { wide: true }),
        h('label', { class: 'cs-check apf-wide' }, [fav, ' Marcar como favorito'])];
      if (d.id) fields.push(h('label', { class: 'cs-check apf-wide' }, [asNew, ' Guardarlo como un outfit nuevo']));
      ui.formDialog(d.id ? 'Guardar cambios del outfit' : 'Guardar outfit', 'Guardar', fields, function () {
        var v = M.D.validateOutfit({
          name: name.value, occasion: occ.value, formality: form.value || null, notes: notes.value, is_favorite: fav.checked, palette_id: d.palette_id,
          distribution_override: c.manual ? c.shown : null,
          items: c.items.map(function (it) { var e = d.slots[it.slot]; return { slot: it.slot, garment_id: e.garment_id || null, hex: e.hex || null, weight: e.weight, hypothetical: e.hypothetical === true }; })
        });
        if (!v.ok) throw ui.invalid(v.errors[0], v.errors[0].indexOf('nombre') >= 0 ? name : null);
        var job = d.id && !asNew.checked ? st.update('cs_outfits', d.id, v.value) : st.insert('cs_outfits', v.value).then(function (r) { return r[0]; });
        return job.then(function (row) {
          replaceIn(cache.outfits, row);
          Object.assign(d, { id: row.id, name: row.name, occasion: row.occasion || '', formality: row.formality || d.formality, notes: row.notes || '', is_favorite: row.is_favorite });
          refresh();
          toast('Outfit guardado.');
        });
      }, name);
    }
    function outfitColors(o) {
      var items = (o.items || []).map(function (it) {
        var g = it.garment_id ? garmentById(it.garment_id) : null;
        return { slot: it.slot, weight: it.weight, colors: g ? M.E.garmentColorParts(g) : it.hex ? [{ hex: it.hex, share: 1 }] : [] };
      });
      return o.distribution_override ? M.E.normalizeDistribution(o.distribution_override) : M.E.estimateDistribution(items).colors;
    }
    function savedOutfits() {
      var list = data().outfits.slice().sort(function (a, b) { return (b.is_favorite - a.is_favorite) || (a.updated_at < b.updated_at ? 1 : -1); });
      var sec = h('section', { class: 'cs-card', 'aria-labelledby': 'cs-out-t' }, [h('div', { class: 'cs-card-head' }, [h('h3', { class: 'cs-h3', id: 'cs-out-t', text: 'Mis outfits' })])]);
      if (!list.length) { sec.appendChild(h('p', { class: 'cs-note', text: demo ? 'En el modo ejemplo no hay outfits guardados.' : 'Los outfits que guardes aparecerán aquí para reutilizarlos.' })); return sec; }
      sec.appendChild(h('ul', { class: 'cs-outfits' }, list.map(function (o) {
        var cols = outfitColors(o), lost = (o.items || []).some(function (it) { return it.garment_id && !garmentById(it.garment_id); });
        return h('li', { class: 'cs-outfit' }, [
          band(cols.length ? cols : ['#E9EDF3'], { cls: 'cs-band--mini' }),
          h('span', { class: 'cs-outfit-txt' }, [h('span', { class: 'cs-slot-n', text: (o.is_favorite ? '★ ' : '') + o.name }),
            h('span', { class: 'cs-slot-c', text: [o.occasion, (o.items || []).length + ' prendas', lost ? 'alguna prenda ya no está' : null].filter(Boolean).join(' · ') })]),
          h('span', { class: 'cs-slot-act' }, [
            btn(['Abrir', h('span', { class: 'sr-only', text: ' «' + o.name + '»' })], 'cs-link', function () { loadOutfit(o); }),
            btn(['Eliminar', h('span', { class: 'sr-only', text: ' «' + o.name + '»' })], 'cs-link cs-link--danger', function () { deleteOutfit(o); })
          ])
        ]);
      })));
      return sec;
    }
    function loadOutfit(o) {
      var d = cur();
      d.id = o.id; d.name = o.name; d.palette_id = o.palette_id; d.override = o.distribution_override; d.formality = o.formality || 'smart';
      d.occasion = o.occasion || ''; d.notes = o.notes || ''; d.is_favorite = o.is_favorite; d.slots = {}; d.original = null;
      (o.items || []).forEach(function (it) { d.slots[it.slot] = { garment_id: it.garment_id, hex: it.hex, weight: it.weight, hypothetical: !it.garment_id && it.hypothetical === true }; });
      mem.sock = { trousers: null, shoes: null }; mem.sockPending = { tr: null, sh: null };
      refresh();
      toast('Outfit «' + o.name + '» cargado.');
    }
    function deleteOutfit(o) {
      if (demo) return demoBlocked();
      ctx.ask({ title: 'Eliminar «' + o.name + '»', text: 'Se borra el outfit guardado. Las prendas siguen en el armario.', ok: 'Eliminar', danger: true }).then(function (yes) {
        if (!yes) return;
        return st.remove('cs_outfits', o.id).then(function () {
          dropFrom(cache.outfits, o.id);
          if (cur().id === o.id) cur().id = null;
          refresh(); toast('Outfit eliminado.');
        });
      }).catch(failSoft);
    }
    function enterDemo() { demo = M.D.demoData(); demoDraft = emptyDraft(); rebuild(); }
    function exitDemo() {
      demo = null; demoDraft = emptyDraft();
      if (cache) return rebuild();
      st.load().then(rebuild).catch(function (err) { if (isMissing(err)) setup(); else failSoft(err); });
    }

    /* ═══════════ INSPIRACIÓN ═══════════
       Outfits guardados de internet: imagen y miniatura en el bucket privado (carpeta inspiracion/<usuario>/),
       enlace y fuente opcionales, clasificación propia y paleta extraída en el dispositivo (inspiration.js).
       Guardar nunca depende de que la lectura del enlace o la extracción funcionen: todo se completa después.
       Una referencia no es una prenda: nunca entra en el armario ni en un outfit; su paleta, sí, como referencia. */
    var INSP_FN = '/functions/v1/inspiracion-meta';
    var observer = null;
    function inspData() { return demo ? { items: demo.inspirations || [], options: null } : inspCache || { items: [], options: null }; }
    function inspOptions(group) {
      var o = inspData().options;
      if (!o) return group === 'inspiracion.estilo' ? M.N.DEFAULT_STYLES.slice() : [];
      return o.filter(function (x) { return x.grupo === group; }).map(function (x) { return x.valor; });
    }
    function inspStyles() { return M.N.optionValues(inspOptions('inspiracion.estilo'), inspData().items, 'styles'); }
    function inspCollections() { return M.N.optionValues(inspOptions('inspiracion.coleccion'), inspData().items, 'collections'); }
    function inspBand(x, cls) { return (x.palette || []).length ? band(x.palette.map(function (c) { return { hex: c.hex, pct: c.weight }; }), { cls: cls }) : null; }
    function pctList(pal) { return M.E.roundPercentages(pal.map(function (c) { return c.weight; })); }
    function paletteText(x) { var p = pctList(x.palette || []); return (x.palette || []).map(function (c, i) { return colorName(c.hex) + ' ' + p[i] + ' %'; }).join(', '); }
    function fmtDate(v) {
      var d = new Date(String(v).length === 10 ? v + 'T12:00:00' : v);
      return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    function photoOf(x) { return x.demo ? null : x.thumb_path || x.image_path || null; }
    function needsReview(x) { return x.palette_status === 'auto' || x.palette_status === 'failed' || !(x.palette || []).length; }
    function reviewText(x) { return x.palette_status === 'auto' ? 'Paleta por revisar' : x.palette_status === 'failed' ? 'Paleta no extraída' : 'Sin paleta'; }
    // fotos privadas: se descargan con la sesión solo cuando la tarjeta se acerca a la pantalla
    function lazyPhoto(box, path) {
      function load() {
        st.image(path).then(function (url) { box.appendChild(h('img', { alt: '', src: url, decoding: 'async' })); box.classList.add('has-img'); })
          .catch(function (err) { if (err && err.auth) ctx.fail(err); box.classList.add('is-broken'); });
      }
      if (!('IntersectionObserver' in window)) return load();
      if (!observer) observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { observer.unobserve(e.target); e.target.csLoad(); } });
      }, { rootMargin: '400px 0px' });
      box.csLoad = load;
      observer.observe(box);
    }

    function paintInspiration() {
      if (observer) { observer.disconnect(); observer = null; }
      var f = mem.insp, all = inspData().items;
      if (!demo && !inspCache) {        // p. ej. al salir del modo ejemplo: se carga ahora
        body.appendChild(h('p', { class: 'cs-note', role: 'status', text: 'Cargando tus inspiraciones…' }));
        st.loadInsp().then(function () { if (view.id === 'inspiracion' && root && root.isConnected) rebuild(); }, failSoft);
        return;
      }
      if (!demo && inspCache && inspCache.missing) {
        body.appendChild(empty('Falta preparar Inspiración', 'La tabla de referencias aún no existe en Supabase. Ejecuta supabase/color-studio-inspiracion.sql en el SQL Editor (una vez; es idempotente) y recarga la página. No toca tus prendas, paletas ni outfits.',
          [btn('Ver con datos de ejemplo', 'btn btn-outline', enterDemo)]));
        return;
      }
      if (!demo && inspCache && inspCache.error) {
        body.appendChild(empty('No se han podido cargar tus inspiraciones', inspCache.error + '. El resto de Color Studio funciona con normalidad.',
          [btn('Reintentar', 'btn btn-outline', function () { st.loadInsp().then(rebuild, failSoft); }, { 'data-key': 'insp-retry' })]));
        return;
      }
      var q = h('input', { type: 'search', id: 'cs-in-q', value: f.q, placeholder: 'Título, fuente, nota o color', autocomplete: 'off', 'data-key': 'insp-q' });
      q.addEventListener('input', function () { f.q = q.value.trim(); paintGrid(); });
      body.appendChild(h('div', { class: 'cs-toolbar' }, [
        h('div', { class: 'cs-search' }, [h('label', { class: 'sr-only', for: 'cs-in-q', text: 'Buscar inspiraciones' }), q]),
        h('div', { class: 'cs-actions' }, [btn('Añadir inspiración', 'btn btn-primary', function () { editInspiration(null); }, { 'data-key': 'new-insp' })])
      ]));
      // filtros: en móvil se pliegan tras «Filtros»; en escritorio se ven siempre (CSS). El orden queda siempre a mano.
      function sel(id, label, options, key, emptyLabel) {
        var s = ui.select(options, f[key], emptyLabel);
        s.id = id; s.setAttribute('data-key', id);
        s.addEventListener('change', function () { f[key] = s.value; sync(); });
        return h('div', { class: 'cs-ins-f' }, [h('label', { class: 'cs-ins-fl', for: id, text: label }), s]);
      }
      function check(label, key) {
        var c = h('input', { type: 'checkbox', checked: f[key] ? true : null, 'data-key': 'insp-' + key });
        c.addEventListener('change', function () { f[key] = c.checked; sync(); });
        return h('label', { class: 'cs-check' }, [c, ' ' + label]);
      }
      var KEYS = ['style', 'collection', 'season', 'family', 'fav', 'review'];
      var panel = h('div', { class: 'cs-ins-panel' + (f.open ? ' is-open' : ''), id: 'cs-ins-panel' });
      var toggle = btn('Filtros', 'cs-btn-s cs-ins-toggle', function () {
        f.open = !f.open; toggle.setAttribute('aria-expanded', f.open ? 'true' : 'false'); panel.classList.toggle('is-open', f.open);
      }, { 'aria-expanded': f.open ? 'true' : 'false', 'aria-controls': 'cs-ins-panel', 'data-key': 'insp-filters' });
      var sortSel = ui.select(M.N.SORTS, f.sort);
      sortSel.id = 'cs-in-sort'; sortSel.setAttribute('data-key', 'insp-sort');
      sortSel.addEventListener('change', function () { f.sort = sortSel.value; paintGrid(); });
      var clear = btn('Limpiar filtros', 'cs-link cs-link--muted', function () { KEYS.forEach(function (k) { f[k] = k === 'fav' || k === 'review' ? false : ''; }); refresh(); }, { 'data-key': 'insp-clear' });
      [sel('cs-in-style', 'Estilo', inspStyles(), 'style', 'Todos'),
        sel('cs-in-col', 'Colección', inspCollections(), 'collection', 'Todas'),
        sel('cs-in-season', 'Temporada', M.N.SEASONS, 'season', 'Todas'),
        sel('cs-in-fam', 'Color', M.E.FAMILIES.map(function (x) { return [x.id, x.label]; }), 'family', 'Cualquiera'),
        h('div', { class: 'cs-ins-checks' }, [check('Solo favoritas', 'fav'), check('Paleta por revisar', 'review')]),
        clear].forEach(function (el) { panel.appendChild(el); });
      body.appendChild(h('div', { class: 'cs-ins-filters' }, [
        h('div', { class: 'cs-ins-bar' }, [toggle, h('div', { class: 'cs-ins-sort' }, [h('label', { class: 'cs-ins-fl', for: 'cs-in-sort', text: 'Ordenar' }), sortSel])]),
        panel]));
      var count = h('p', { class: 'cs-count', role: 'status', 'aria-live': 'polite' });
      var grid = h('ul', { class: 'cs-ins-grid' });
      body.appendChild(count); body.appendChild(grid);
      function sync() {
        var n = KEYS.filter(function (k) { return !!f[k]; }).length;
        toggle.textContent = n ? 'Filtros (' + n + ')' : 'Filtros';
        clear.hidden = !n;
        paintGrid();
      }
      function paintGrid() {
        if (observer) { observer.disconnect(); observer = null; }
        grid.textContent = '';
        var list = M.N.sortInspirations(all.filter(function (x) { return M.N.matchesFilters(x, f); }), f.sort);
        count.textContent = list.length === all.length ? all.length + (all.length === 1 ? ' referencia' : ' referencias') : list.length + ' de ' + all.length + ' referencias';
        if (!all.length) {
          grid.appendChild(h('li', { class: 'cs-wide' }, [empty('Tu archivo de inspiración está vacío', 'Guarda outfits que encuentres en webs, tiendas, revistas o redes: con su imagen, su enlace o los dos. Color Studio extrae su paleta en tu dispositivo y podrás usarla al crear tus conjuntos.', [
            btn('Añadir inspiración', 'btn btn-primary', function () { editInspiration(null); }), demo ? null : btn('Ver con datos de ejemplo', 'btn btn-outline', enterDemo)])]));
          return;
        }
        if (!list.length) { grid.appendChild(h('li', { class: 'cs-wide' }, [empty('Sin resultados', 'Ninguna referencia cumple la búsqueda o los filtros.')])); return; }
        list.forEach(function (x) { grid.appendChild(inspCard(x)); });
      }
      sync();
    }

    function inspCard(x) {
      var title = M.N.displayTitle(x), photo = photoOf(x);
      var media = h('span', { class: 'cs-ins-media', 'aria-hidden': 'true' });
      if (photo) {
        if ((x.palette || []).length) media.style.backgroundColor = x.palette[0].hex;      // color de espera: el dominante
        lazyPhoto(media, photo);
      } else media.appendChild(inspBand(x, 'cs-band--cover') || h('span', { class: 'cs-ins-nophoto', text: 'Sin imagen' }));
      var meta = [(x.styles || [])[0], x.source_name].filter(Boolean).join(' · ');
      return h('li', { class: 'cs-ins-card' }, [
        h('button', { type: 'button', class: 'cs-ins-open', onclick: function () { inspDetail(x); }, 'data-key': 'insp-' + x.id }, [
          media,
          h('span', { class: 'cs-ins-txt' }, [
            h('span', { class: 'cs-ins-t', text: title }),
            meta ? h('span', { class: 'cs-ins-m', text: meta }) : null,
            photo ? inspBand(x, 'cs-band--strip') : null,
            needsReview(x) ? h('span', { class: 'cs-ins-flag', text: reviewText(x) }) : null
          ]),
          (x.palette || []).length ? h('span', { class: 'sr-only', text: '. Colores: ' + paletteText(x) }) : null
        ]),
        favButton(x)
      ]);
    }
    function favButton(x) {
      return btn(h('span', { 'aria-hidden': 'true', text: x.is_favorite ? '★' : '☆' }), 'cs-fav cs-ins-fav' + (x.is_favorite ? ' is-on' : ''), function () { toggleInspFav(x); },
        { 'aria-pressed': x.is_favorite ? 'true' : 'false', 'aria-label': 'Favorita: ' + M.N.displayTitle(x), 'data-key': 'ifav-' + x.id });
    }
    function saveInsp(x, patch, then) {
      return st.update('cs_inspirations', x.id, patch).then(function (row) { replaceIn(inspCache.items, row); refresh(); if (then) then(row); return row; });
    }
    function toggleInspFav(x, reopen) {
      if (demo) return demoBlocked();
      saveInsp(x, { is_favorite: !x.is_favorite }, reopen ? inspDetail : null).catch(failSoft);
    }

    function inspDetail(x) {
      var title = M.N.displayTitle(x), pal = x.palette || [];
      sheet(title, function (box, close) {
        var hero = h('figure', { class: 'cs-ins-hero' });
        if (x.image_path && !x.demo) {
          if (pal.length) hero.style.backgroundColor = pal[0].hex;
          var alt = 'Foto guardada: ' + title + (pal.length ? '. Colores con más presencia: ' + pal.slice(0, 3).map(function (c) { return colorName(c.hex); }).join(', ') : '');
          st.image(x.image_path).then(function (url) { hero.appendChild(h('img', { src: url, alt: alt })); hero.classList.add('has-img'); })
            .catch(function (err) { if (err && err.auth) { close(); ctx.fail(err); return; } hero.appendChild(h('p', { class: 'cs-note', text: 'No se ha podido cargar la imagen.' })); });
        } else hero.appendChild(inspBand(x, 'cs-band--cover') || h('span', { class: 'cs-ins-nophoto', text: 'Sin imagen' }));
        var url = M.N.httpUrl(x.source_url || '');
        var stars = x.rating ? h('p', { class: 'cs-ins-rate' }, [h('span', { 'aria-hidden': 'true', text: '★★★★★'.slice(0, x.rating) + '☆☆☆☆☆'.slice(0, 5 - x.rating) }), h('span', { class: 'sr-only', text: 'Valoración: ' + x.rating + ' de 5' })]) : null;
        var cls = (x.styles || []).map(function (t) { return h('span', { class: 'cs-tag', text: t }); }).concat((x.seasons || []).map(function (t) { return h('span', { class: 'cs-tag cs-tag--season', text: M.N.SEASON_LABEL[t] }); }));
        var info = h('div', { class: 'cs-ins-info' }, [
          h('p', { class: 'cs-ins-src' }, [x.source_name || (url ? M.N.sourceNameFromUrl(url) : 'Sin fuente'), x.published_on ? ' · publicada el ' + fmtDate(x.published_on) : null]),
          url ? h('p', null, [h('a', { class: 'cs-ins-link', href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Ver la publicación original' }), h('span', { class: 'sr-only', text: ' (abre en pestaña nueva)' })]) : null,
          x.demo ? h('p', { class: 'cs-fine', text: 'Ejemplo inventado para la demo: sin imagen ni fuente real.' }) : null,
          cls.length ? h('p', { class: 'cs-tags' }, cls) : null,
          (x.collections || []).length ? h('p', { class: 'cs-ins-cols' }, [h('span', { class: 'cs-mini-t', text: 'Colecciones' }), ' ', x.collections.join(' · ')]) : null,
          stars,
          x.is_favorite ? h('p', { class: 'cs-badges' }, [badge('★ Favorita', 'fav')]) : null
        ]);
        box.appendChild(h('div', { class: 'cs-ins-detail' }, [hero, info]));
        box.appendChild(paletteSection(x, close));
        if (pal.length) box.appendChild(wardrobeSection(x));
        var sim = M.N.similarInspirations(x, inspData().items, 4);
        if (sim.length) {
          box.appendChild(h('section', { class: 'cs-ins-sec', 'aria-labelledby': 'cs-ins-sim-t' }, [
            h('h3', { class: 'cs-h3', id: 'cs-ins-sim-t', text: 'Referencias con paleta parecida' }),
            h('ul', { class: 'cs-ins-sim' }, sim.map(function (r) {
              return h('li', null, [btn([inspBand(r.item, 'cs-band--mini'), h('span', { class: 'cs-ins-sim-t', text: M.N.displayTitle(r.item) }),
                h('span', { class: 'cs-fine', text: r.match.connected + (r.match.connected === 1 ? ' color en común' : ' colores en común') })], 'cs-ins-sim-b', function () { close(); inspDetail(r.item); })]);
            })),
            h('p', { class: 'cs-fine', text: 'En común = colores muy próximos o próximos (ΔE00 ≤ 10). Es proximidad de color, no de estilo.' })
          ]));
        }
        if (x.description || x.notes) {
          box.appendChild(h('section', { class: 'cs-ins-sec', 'aria-labelledby': 'cs-ins-notes-t' }, [
            h('h3', { class: 'cs-h3', id: 'cs-ins-notes-t', text: 'Notas' }),
            x.notes ? h('p', { class: 'cs-ins-note', text: x.notes }) : null,
            x.description ? h('p', { class: 'cs-fine', text: 'Descripción de la fuente: ' + x.description }) : null
          ]));
        }
        if (x.created_at && !x.demo) box.appendChild(h('p', { class: 'cs-fine', text: 'Guardada el ' + fmtDate(x.created_at) + '.' }));
        box.appendChild(h('div', { class: 'cs-sheet-actions' }, [
          btn('Usar en Studio', 'btn btn-primary', function () { close(); useInspInStudio(x); }, { disabled: pal.length ? null : true, 'data-key': 'insp-studio' }),
          btn(x.is_favorite ? 'Quitar de favoritas' : 'Marcar como favorita', 'btn btn-outline', function () { close(); toggleInspFav(x, true); }, { 'data-key': 'insp-fav-detail' }),
          btn('Editar', 'btn btn-outline', function () { close(); editInspiration(x); }, { 'data-key': 'insp-edit' }),
          btn('Eliminar', 'cs-link cs-link--danger', function () { close(); deleteInspiration(x); }, { 'data-key': 'insp-del' })
        ]));
        if (!pal.length) box.appendChild(h('p', { class: 'cs-fine', text: 'Para usarla en el Studio hace falta una paleta.' }));
      }, { wide: true });
    }

    function copyHex(hex, b) {
      var label = b.firstChild, done = function (t) { label.textContent = t; setTimeout(function () { label.textContent = 'Copiar'; }, 1600); };
      if (!navigator.clipboard) return done('No disponible');
      navigator.clipboard.writeText(hex).then(function () { done('Copiado'); }, function () { done('No se ha podido'); });
    }
    function paletteSection(x, close) {
      var roles = M.N.paletteRoles(x.palette || []), pcts = pctList(roles);
      var sec = h('section', { class: 'cs-ins-sec', 'aria-labelledby': 'cs-ins-pal-t' }, [h('div', { class: 'cs-card-head' }, [
        h('h3', { class: 'cs-h3', id: 'cs-ins-pal-t', text: 'Paleta' }),
        badge(M.N.STATUS_LABEL[x.palette_status] || 'Sin paleta', x.palette_status === 'reviewed' ? 'own' : x.palette_status === 'auto' ? 'approx' : null)
      ])]);
      if (roles.length) {
        sec.appendChild(inspBand(x, 'cs-band--ref'));
        sec.appendChild(h('ul', { class: 'cs-ins-colors' }, roles.map(function (c, i) {
          var info = M.N.colorInfo(c.hex), bar = h('span', { class: 'cs-ins-meter-in' });
          bar.style.width = Math.max(1, c.weight) + '%';
          var copy = btn([h('span', { text: 'Copiar' }), h('span', { class: 'sr-only', text: ' ' + c.hex })], 'cs-btn-s cs-ins-copy', function () { copyHex(c.hex, copy); });
          return h('li', { class: 'cs-ins-color' }, [
            swatch(c.hex, 'cs-sw--l'),
            h('span', { class: 'cs-ins-ctxt' }, [
              h('span', { class: 'cs-ins-cname' }, [h('span', { text: info.name }), h('span', { class: 'cs-role cs-role--' + c.role, text: M.N.ROLE_LABEL[c.role] }),
                c.source === 'manual' ? h('span', { class: 'cs-ins-manual', text: 'corregido a mano' }) : null]),
              h('span', { class: 'cs-hex', text: c.hex + ' · RGB ' + info.rgb.r + ' ' + info.rgb.g + ' ' + info.rgb.b + ' · Lab ' + info.lab.L + ' ' + info.lab.a + ' ' + info.lab.b }),
              h('span', { class: 'cs-ins-w' }, [h('span', { class: 'cs-ins-meter', 'aria-hidden': 'true' }, [bar]), h('span', { class: 'cs-pct', text: pcts[i] + ' %' })])
            ]),
            copy
          ]);
        })));
        sec.appendChild(h('p', { class: 'cs-fine', text: 'Porcentaje = presencia estimada en los píxeles analizados (puede incluir fondo, piel o accesorios), no la superficie de cada prenda. Dominante = el de más presencia; secundario = 15 % o más; el resto, detalles.' }));
      } else {
        sec.appendChild(h('p', { class: 'cs-note', text: x.palette_status === 'failed' ? 'No se pudo extraer la paleta de esta imagen. Vuelve a intentarlo o añade los colores a mano.'
          : x.image_path ? 'Esta referencia aún no tiene paleta.' : 'Sin imagen no hay paleta automática: añade una imagen o los colores a mano.' }));
      }
      sec.appendChild(h('div', { class: 'cs-ref-act' }, [
        x.palette_status === 'auto' && roles.length ? btn('Confirmar paleta', 'cs-btn-s', function () {
          if (demo) return demoBlocked();
          close(); saveInsp(x, { palette_status: 'reviewed' }, inspDetail).catch(failSoft);
        }, { 'data-key': 'insp-confirm' }) : null,
        btn(roles.length ? 'Corregir paleta' : 'Añadir colores', 'cs-btn-s', function () { close(); editInspPalette(x); }, { 'data-key': 'insp-palette' }),
        x.image_path && !x.demo ? btn('Volver a extraer', 'cs-link', function () { close(); reExtractPalette(x); }, { 'data-key': 'insp-extract' }) : null
      ]));
      return sec;
    }
    function wardrobeSection(x) {
      var garments = data().garments;
      var sec = h('section', { class: 'cs-ins-sec', 'aria-labelledby': 'cs-ins-ward-t' }, [h('h3', { class: 'cs-h3', id: 'cs-ins-ward-t', text: 'Con tu armario' })]);
      if (!garments.length) { sec.appendChild(h('p', { class: 'cs-note', text: 'Registra prendas en el Armario para ver cuáles se acercan a estos colores.' })); return sec; }
      var rows = M.C.adaptPalette({ colors: x.palette }, { slots: {}, garments: garments, palettes: [] });
      sec.appendChild(h('ul', { class: 'cs-adapt', 'aria-label': 'Colores de la referencia frente a tu armario' }, rows.map(function (r) {
        return h('li', { class: 'cs-adapt-r ' + (r.candidate ? 'is-cand' : 'is-miss') }, [
          swatch(r.hex, 'cs-sw--pal'),
          h('span', { class: 'cs-adapt-txt' }, [h('span', { class: 'cs-adapt-n' }, [r.name + ' ', h('span', { class: 'cs-hex', text: r.hex })]),
            h('span', { class: 'cs-adapt-s', text: r.candidate ? 'Cerca: ' + garmentName(r.candidate.garment) + ' (' + r.candidate.label.toLowerCase() + ')' : 'No tienes una prenda de este color' })]),
          r.candidate ? thumb(r.candidate.garment, 'cs-thumb--s') : h('span', { class: 'cs-adapt-gap', 'aria-hidden': 'true' })
        ]);
      })));
      sec.appendChild(h('p', { class: 'cs-fine', text: 'Prenda de tu armario con el color principal más próximo (ΔE00 ≤ 12). Coincidir en color no basta para reproducir el look: el corte, el material, el contexto y tener las demás piezas también cuentan.' }));
      return sec;
    }

    // «Usar en Studio»: la paleta pasa a la Biblioteca (o se reutiliza si ya está igual) y queda elegida como referencia del Studio.
    function useInspInStudio(x) {
      if (demo) return demoBlocked();
      var v = M.D.validatePalette(M.N.paletteForLibrary(x));
      if (!v.ok) return toast(v.errors[0], true);
      var key = function (p) { return p ? p.colors.map(function (c) { return c.hex; }).join() : ''; };
      var linked = x.palette_id ? paletteById(x.palette_id) : null;
      var existing = linked && key(linked) === key(v.value) ? linked
        : (M.E.findDuplicates(v.value, cache.palettes).filter(function (d) { return d.kind === 'identical'; })[0] || {}).palette;
      var job = existing ? Promise.resolve({ pal: existing, created: false })
        : st.insert('cs_palettes', v.value).then(function (r) { replaceIn(cache.palettes, r[0]); return { pal: r[0], created: true }; });
      job.then(function (res) {
        var link = x.palette_id === res.pal.id ? null : st.update('cs_inspirations', x.id, { palette_id: res.pal.id }).then(function (row) { replaceIn(inspCache.items, row); });
        return Promise.resolve(link).then(function () {
          draft.palette_id = res.pal.id; saveDraft();
          var name = res.pal.name || 'sin nombre';
          flash = res.created ? 'Paleta «' + name + '» creada en tu Biblioteca y elegida como referencia del Studio.' : 'Paleta «' + name + '» elegida como referencia del Studio.';
          location.hash = '#/color';
        });
      }).catch(failSoft);
    }
    function deleteInspiration(x) {
      if (demo) return demoBlocked();
      ctx.ask({ title: 'Eliminar «' + M.N.displayTitle(x) + '»', text: 'Se borran la referencia y su imagen. ' + (x.palette_id ? 'La paleta que creaste con ella en la Biblioteca se conserva. ' : '') + 'No se puede deshacer.', ok: 'Eliminar', danger: true }).then(function (yes) {
        if (!yes) return;
        return st.remove('cs_inspirations', x.id).then(function () {
          dropFrom(inspCache.items, x.id);
          var paths = [x.image_path, x.thumb_path].filter(Boolean);
          if (paths.length) st.removeImages(paths).catch(function (e) { console.warn('[color] imagen no borrada', e && e.status); });
          refresh(); toast('Inspiración eliminada.');
        });
      }).catch(failSoft);
    }
    function reExtractPalette(x) {
      if (demo) return demoBlocked();
      function go() {
        toast('Extrayendo la paleta en tu dispositivo…');
        st.imageBlob(x.image_path).then(function (blob) { return M.I.prepareImage(blob); }).then(function (prep) {
          var pal = M.N.extractOutfitPalette(prep.sample);
          return saveInsp(x, { palette: pal, palette_status: pal.length ? 'auto' : 'failed', image_hash: M.N.imageHash(prep.sample) }, inspDetail);
        }).then(function (row) { toast(row.palette.length ? 'Paleta extraída de nuevo: revísala.' : 'No se ha podido extraer la paleta de esta imagen.', !row.palette.length); }).catch(failSoft);
      }
      if (!(x.palette || []).length) return go();
      var manual = x.palette.some(function (c) { return c.source === 'manual'; });
      ctx.ask({ title: 'Volver a extraer la paleta', text: 'Sustituye los colores actuales' + (manual ? ', incluidas tus correcciones,' : '') + ' por los del análisis de la imagen.', ok: 'Extraer' })
        .then(function (yes) { if (yes) go(); }).catch(failSoft);
    }
    function editInspPalette(x) {
      if (demo) return demoBlocked();
      var rows = (x.palette || []).map(function (c) { return { hex: c.hex, weight: c.weight, source: c.source, orig: c.hex, origW: c.weight }; });
      if (!rows.length) rows.push({ hex: '', weight: 100, source: 'manual' });
      var listEl = h('ol', { class: 'cs-edit-colors' }), msg = h('p', { class: 'apf-hint', 'aria-live': 'polite' });
      function paint(focus) {
        listEl.textContent = '';
        rows.forEach(function (r, i) {
          var w = h('input', { type: 'number', min: '0', max: '100', step: 'any', inputmode: 'decimal', value: String(r.weight), class: 'cs-weight', 'aria-label': 'Presencia del color ' + (i + 1) + ' (%)' });
          w.addEventListener('input', function () { var n = Number(w.value.replace(',', '.')); r.weight = Number.isFinite(n) && n >= 0 ? n : 0; });
          var cf = colorInput('cs-ip-' + i, 'Color ' + (i + 1), r.hex, function (v, raw) { r.hex = v || ''; r.raw = raw; }, { compact: true, extra: [
            h('span', { class: 'cs-ins-wl' }, [w, h('span', { 'aria-hidden': 'true', text: '%' })]),
            btn('×', 'cs-icon-b', function () { rows.splice(i, 1); paint(Math.max(0, i - 1)); }, { 'aria-label': 'Quitar color ' + (i + 1) })] });
          listEl.appendChild(h('li', { class: 'cs-edit-color' }, [cf.el]));
          if (focus === i) setTimeout(function () { cf.text.focus(); }, 0);
        });
      }
      paint();
      var add = btn('+ Añadir color', 'cs-link', function () {
        if (rows.length >= M.N.PALETTE_LIMIT) { msg.textContent = 'Máximo ' + M.N.PALETTE_LIMIT + ' colores.'; return; }
        rows.push({ hex: '', weight: 0, source: 'manual' }); paint(rows.length - 1);
      });
      ui.formDialog('Corregir la paleta', 'Guardar paleta', [
        h('p', { class: 'apf-hint apf-wide', text: 'Cambia un color si la luz de la foto lo altera, quita los que no son del outfit (fondo, piel) y ajusta su presencia. Los porcentajes se reparten en proporción para sumar 100.' }),
        h('fieldset', { class: 'apf-fieldset apf-wide' }, [h('legend', { class: 'ap-field-label', text: 'Colores (en orden)' }), listEl, add, msg])
      ], function () {
        var bad = rows.findIndex(function (r) { return r.raw != null ? !M.E.normalizeHex(r.raw) : !r.hex; });
        if (bad >= 0) throw ui.invalid('El color ' + (bad + 1) + ' no es un HEX válido.', listEl.querySelectorAll('.cs-hex-input')[bad]);
        var pal = M.N.normalizePalette(rows.map(function (r) { return { hex: r.hex, weight: r.weight, source: r.hex !== r.orig || r.weight !== r.origW ? 'manual' : r.source }; }));
        return saveInsp(x, { palette: pal, palette_status: pal.length ? 'reviewed' : 'none' }, inspDetail).then(function () { toast('Paleta guardada.'); });
      }, listEl.querySelector('.cs-hex-input'));
    }

    function chipGroup(id, label, options, selected, onAdd) {
      var wrap = h('div', { class: 'cs-ins-chipset' });
      var fs = h('fieldset', { class: 'apf-fieldset apf-wide' }, [h('legend', { class: 'ap-field-label', text: label }), wrap]);
      function paint(focusIndex) {
        wrap.textContent = '';
        var all = options.slice();
        selected.forEach(function (v) { if (!all.some(function (o) { return (o[0] || o) === v; })) all.push(v); });
        all.forEach(function (o, i) {
          var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o, on = selected.indexOf(v) >= 0;
          wrap.appendChild(btn(l, 'cs-chip', function () {
            var k = selected.indexOf(v); if (k >= 0) selected.splice(k, 1); else selected.push(v);
            paint(i);
          }, { 'aria-pressed': on ? 'true' : 'false', 'data-key': id + '-' + i }));
        });
        if (focusIndex != null && wrap.children[focusIndex]) wrap.children[focusIndex].focus();
      }
      paint();
      if (onAdd) {
        var inp = h('input', { type: 'text', id: id + '-new', maxlength: '60', autocomplete: 'off', class: 'cs-ins-new', placeholder: onAdd.placeholder });
        var addIt = function () {
          var v = inp.value.replace(/\s+/g, ' ').trim();
          if (!v) return inp.focus();
          var same = options.filter(function (o) { return o.toLocaleLowerCase('es') === v.toLocaleLowerCase('es'); })[0];
          if (same) v = same; else { options.push(v); onAdd.added.push(v); }
          if (selected.indexOf(v) < 0) selected.push(v);
          inp.value = ''; paint(); inp.focus();
        };
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addIt(); } });
        fs.appendChild(h('div', { class: 'cs-ins-newrow' }, [h('label', { class: 'sr-only', for: id + '-new', text: onAdd.label }), inp, btn('Añadir', 'cs-btn-s', addIt)]));
      }
      return fs;
    }

    function editInspiration(x) {
      if (demo) return demoBlocked();
      if (!inspCache || inspCache.missing || inspCache.error) return toast('Inspiración no está disponible: recarga la página o ejecuta supabase/color-studio-inspiracion.sql.', true);
      var editing = !!x;
      var s = {
        prep: null, previewUrl: null, removeImage: false, dupOk: false,
        palette: x ? (x.palette || []).slice() : [], status: x ? x.palette_status : 'none', hash: x ? x.image_hash : null,
        styles: x ? (x.styles || []).slice() : [], collections: x ? (x.collections || []).slice() : [], seasons: x ? (x.seasons || []).slice() : [],
        added: { estilo: [], coleccion: [] }
      };
      var url = ui.input('url', x ? x.source_url || '' : '', { maxlength: '1000', inputmode: 'url', placeholder: 'https://…' });
      var title = ui.input('text', x ? x.title || '' : '', { maxlength: '160' });
      var source = ui.input('text', x ? x.source_name || '' : '', { maxlength: '120' });
      var desc = ui.area(x ? x.description || '' : '', 2, 2000);
      var notes = ui.area(x ? x.notes || '' : '', 3, 4000);
      var rating = ui.select([['1', '1 de 5'], ['2', '2 de 5'], ['3', '3 de 5'], ['4', '4 de 5'], ['5', '5 de 5']], x && x.rating ? String(x.rating) : '', 'Sin valorar');
      var published = ui.input('date', x ? x.published_on || '' : '');
      var fav = h('input', { type: 'checkbox', checked: x && x.is_favorite ? true : null });
      var linkMsg = h('p', { class: 'apf-hint', 'aria-live': 'polite' });
      var photoMsg = h('p', { class: 'apf-hint', 'aria-live': 'polite' });
      var preview = h('div', { class: 'cs-ins-preview' }), palBox = h('div', { class: 'cs-ins-palprev' });
      var readBtn = btn('Leer enlace', 'btn btn-outline', readLink, { 'data-key': 'insp-read' });
      var removeBtn = btn('Quitar imagen', 'cs-link cs-link--muted', function () {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
        s.prep = null; s.previewUrl = null; s.removeImage = true; s.hash = null; s.palette = []; s.status = 'none'; photoMsg.textContent = '';
        paintPreview();
      });
      function paintPreview() {
        preview.textContent = '';
        if (s.previewUrl) preview.appendChild(h('img', { src: s.previewUrl, alt: 'Vista previa de la imagen elegida' }));
        else if (x && x.image_path && !s.removeImage) {
          var b = h('span', { class: 'cs-ins-media' });
          st.image(x.thumb_path || x.image_path).then(function (u) { b.appendChild(h('img', { src: u, alt: 'Imagen guardada' })); }).catch(function () { b.classList.add('is-broken'); });
          preview.appendChild(b);
        } else preview.appendChild(h('span', { class: 'cs-photo-empty', text: 'Sin imagen' }));
        removeBtn.hidden = !(s.previewUrl || (x && x.image_path && !s.removeImage));
        palBox.textContent = '';
        if (s.palette.length) {
          var p = pctList(s.palette);
          palBox.appendChild(h('p', { class: 'cs-mini-t', text: s.status === 'auto' ? 'Paleta extraída (por revisar)' : 'Paleta' }));
          palBox.appendChild(band(s.palette.map(function (c) { return { hex: c.hex, pct: c.weight }; }), { cls: 'cs-band--dist' }));
          palBox.appendChild(h('ul', { class: 'cs-ins-pallist', 'aria-label': 'Colores de la paleta' }, s.palette.map(function (c, i) {
            return h('li', null, [swatch(c.hex), h('span', { text: colorName(c.hex) }), h('span', { class: 'cs-hex', text: c.hex }), h('span', { class: 'cs-pct', text: p[i] + ' %' })]);
          })));
          if (s.prep) palBox.appendChild(h('p', { class: 'cs-fine cs-fine--tight', text: 'Estimación de la imagen completa (puede incluir fondo o piel). La podrás corregir desde el detalle.' }));
        } else if (s.status === 'failed') palBox.appendChild(h('p', { class: 'apf-hint', text: 'No se ha podido extraer la paleta. Puedes guardar igualmente y añadir los colores después.' }));
      }
      function usePhoto(file, fromLink) {
        photoMsg.textContent = 'Preparando la imagen…';
        return M.I.prepareImage(file, { thumb: 640 }).then(function (prep) {
          if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
          s.prep = prep; s.previewUrl = URL.createObjectURL(prep.blob); s.removeImage = false;
          s.hash = M.N.imageHash(prep.sample);
          var pal = [];
          try { pal = M.N.extractOutfitPalette(prep.sample); } catch (e) { console.warn('[color] extracción fallida', e); }
          s.palette = pal; s.status = pal.length ? 'auto' : 'failed';
          paintPreview();
          photoMsg.textContent = (fromLink ? 'Imagen descargada del enlace' : 'Imagen lista') + ' (' + prep.width + '×' + prep.height + ' px, sin datos de ubicación). ' +
            (pal.length ? pal.length + (pal.length === 1 ? ' color extraído' : ' colores extraídos') + ' en tu dispositivo.' : 'No se ha podido extraer la paleta.');
          var dup = M.N.findDuplicateInspirations({ id: x && x.id, image_hash: s.hash }, inspCache.items)[0];
          if (dup) photoMsg.textContent += ' Parece la misma imagen que «' + M.N.displayTitle(dup.item) + '».';
          return true;
        }).catch(function (err) { photoMsg.textContent = err.message; return false; });
      }
      function reason(err) { return (err && err.message) || 'error desconocido'; }
      function readLink() {
        var u = M.N.httpUrl(url.value);
        if (!u) { linkMsg.textContent = 'Escribe un enlace que empiece por http:// o https://.'; url.focus(); return; }
        var dup = M.N.findDuplicateInspirations({ id: x && x.id, source_url: u }, inspCache.items)[0];
        var got = [], tail = '';
        readBtn.disabled = true; linkMsg.textContent = 'Leyendo la página…';
        ctx.api(INSP_FN, { method: 'POST', headers: JSON_H, body: JSON.stringify({ action: 'meta', url: u }) }).then(function (m) {
          m = m || {};
          if (m.title && !title.value.trim()) { title.value = m.title; got.push('título'); }
          if (m.siteName && !source.value.trim()) { source.value = m.siteName; got.push('fuente'); }
          if (!source.value.trim()) source.value = M.N.sourceNameFromUrl(u) || '';
          if (m.published && !published.value) { published.value = m.published; got.push('fecha de publicación'); }
          if (m.description && !desc.value.trim()) { desc.value = m.description; got.push('descripción'); }
          if (!m.image) { tail = 'La página no indica una imagen: añádela desde tu dispositivo.'; return; }
          if (s.prep) { tail = 'La página tiene imagen, pero ya has elegido una: se mantiene la tuya.'; return; }
          linkMsg.textContent = 'Descargando la imagen…';
          return ctx.api(INSP_FN, { method: 'POST', headers: JSON_H, body: JSON.stringify({ action: 'image', url: m.image }), raw: true })
            .then(function (r) { return r.blob(); })
            .then(function (blob) { return usePhoto(blob, true); })
            .then(function (okImg) { if (okImg) got.push('imagen'); else tail = 'La imagen de la página no se ha podido usar: añádela desde tu dispositivo.'; }, function (err) {
              if (err && err.auth) throw err;
              tail = 'La imagen no se ha podido descargar (' + reason(err) + '): añádela desde tu dispositivo.';
            });
        }).then(function () {
          linkMsg.textContent = (got.length ? 'Obtenido: ' + got.join(', ') + '. ' : 'La página no ofrece título ni fuente. ') + (tail || 'Revisa los datos antes de guardar.');
        }, function (err) {
          if (err && err.auth) { var d = readBtn.closest('dialog'); if (d) d.close(); return ctx.fail(err); }
          if (!source.value.trim()) source.value = M.N.sourceNameFromUrl(u) || '';
          linkMsg.textContent = (err && err.status === 404 ? 'La lectura de enlaces no está activada (falta desplegar la función inspiracion-meta).'
            : 'No se ha podido leer la página (' + reason(err) + '). Muchas redes sociales no lo permiten.') + ' El enlace se guardará igualmente: añade la imagen desde tu dispositivo.';
        }).then(function () {
          readBtn.disabled = false;
          if (dup) linkMsg.textContent += ' Ya guardaste este enlace en «' + M.N.displayTitle(dup.item) + '».';
        });
      }
      var camIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only' });
      var galIn = h('input', { type: 'file', accept: M.I.ACCEPTED.join(','), class: 'sr-only', 'data-key': 'insp-file' });
      [camIn, galIn].forEach(function (inp) { inp.addEventListener('change', function () { var file = inp.files[0]; inp.value = ''; if (file) usePhoto(file); }); });
      paintPreview();
      var styleOpts = inspStyles(), colOpts = inspCollections();
      var fields = [
        h('div', { class: 'apf-field apf-wide' }, [
          h('label', { class: 'ap-field-label', for: 'cs-i-url', text: 'Enlace de la publicación (opcional)' }),
          h('div', { class: 'cs-ins-urlrow' }, [url, readBtn]), linkMsg,
          h('p', { class: 'apf-hint', text: 'Se guarda tal cual. «Leer enlace» intenta traer título, fuente e imagen; muchas redes no lo permiten.' })
        ]),
        h('div', { class: 'apf-wide cs-ins-photo' }, [preview, h('div', { class: 'cs-ins-photo-side' }, [
          h('div', { class: 'cs-photo-act' }, [h('label', { class: 'btn btn-outline cs-file' }, ['Elegir imagen', galIn]), h('label', { class: 'btn btn-outline cs-file cs-ins-cam' }, ['Hacer foto', camIn]), removeBtn]),
          h('p', { class: 'cs-fine cs-fine--tight', text: 'JPEG, PNG o WebP. También puedes pegarla (Ctrl/⌘+V). Se reduce en tu dispositivo, sin datos de ubicación, y se guarda en privado.' }),
          photoMsg, palBox])]),
        ui.field('cs-i-title', 'Título', title, { wide: true }),
        ui.field('cs-i-src', 'Fuente', source, { hint: 'Web, tienda, revista o cuenta' }),
        h('label', { class: 'cs-check' }, [fav, ' Favorita']),
        chipGroup('cs-i-sty', 'Estilo', styleOpts, s.styles, { added: s.added.estilo, label: 'Nuevo estilo', placeholder: 'Nuevo estilo' }),
        chipGroup('cs-i-sea', 'Temporada', M.N.SEASONS, s.seasons, null),
        chipGroup('cs-i-col', 'Colecciones', colOpts, s.collections, { added: s.added.coleccion, label: 'Nueva colección', placeholder: 'Nueva colección' }),
        h('details', { class: 'apf-wide cs-ins-more', open: x && (x.notes || x.description || x.rating || x.published_on) ? true : null }, [
          h('summary', { class: 'cs-summary cs-summary--s', text: 'Notas, valoración y fecha' }),
          h('div', { class: 'apf-grid' }, [
            ui.field('cs-i-notes', 'Notas privadas', notes, { wide: true, hint: 'Qué te gusta: el corte, una prenda, la proporción…' }),
            ui.field('cs-i-rate', 'Valoración', rating), ui.field('cs-i-pub', 'Fecha de publicación', published, { hint: 'Si la conoces' }),
            ui.field('cs-i-desc', 'Descripción de la fuente', desc, { wide: true })
          ])
        ]),
        h('p', { class: 'apf-hint apf-wide' }, ['Gestiona estilos y colecciones (renombrar, eliminar) en ', h('a', { href: '#/configuracion', text: 'Configuración' }), '.'])
      ];
      url.id = 'cs-i-url';
      ui.formDialog(editing ? 'Editar inspiración' : 'Nueva inspiración', 'Guardar', fields, function () {
        var hasImage = !!s.prep || !!(x && x.image_path && !s.removeImage);
        var v = M.N.validateInspiration({ title: title.value, source_url: url.value, source_name: source.value, published_on: published.value, description: desc.value, notes: notes.value,
          styles: s.styles, collections: s.collections, seasons: s.seasons, rating: rating.value, is_favorite: fav.checked, palette: s.palette, palette_status: s.status, has_image: hasImage });
        if (!v.ok) { var e0 = v.errors[0]; throw ui.invalid(e0, /enlace/i.test(e0) ? url : /fecha/i.test(e0) ? published : /valoración/i.test(e0) ? rating : title); }
        var row = v.value;
        row.image_hash = s.prep ? s.hash : hasImage && x ? x.image_hash : null;
        if (!s.dupOk) {
          var dups = M.N.findDuplicateInspirations({ id: x && x.id, source_url: row.source_url, image_hash: s.prep ? s.hash : null }, inspCache.items);
          if (dups.length) {
            s.dupOk = true;
            throw ui.invalid((dups[0].reason === 'url' ? 'Ya guardaste este enlace' : 'Ya guardaste una imagen casi igual') + ' en «' + M.N.displayTitle(dups[0].item) + '». Pulsa «Guardar» otra vez para guardarla de todos modos.');
          }
        }
        var paths = null, job = Promise.resolve();
        if (s.prep) {
          job = st.uid().then(function (uid) {
            var base = 'inspiracion/' + uid + '/' + crypto.randomUUID(), ext = s.prep.type === 'image/webp' ? '.webp' : '.jpg';
            paths = { image: base + ext, thumb: s.prep.thumb ? base + '-m' + ext : null };
            return st.upload(paths.image, s.prep.blob, s.prep.type).then(function () { return paths.thumb ? st.upload(paths.thumb, s.prep.thumb.blob, s.prep.thumb.type) : null; });
          }).then(function () { row.image_path = paths.image; row.thumb_path = paths.thumb; });
        } else if (s.removeImage) { row.image_path = null; row.thumb_path = null; }
        return job.then(function () {
          return editing ? st.update('cs_inspirations', x.id, row) : st.insert('cs_inspirations', row).then(function (r) { return r[0]; });
        }).then(function (saved) {
          if (paths && s.previewUrl) { images[paths.image] = Promise.resolve(s.previewUrl); if (paths.thumb) images[paths.thumb] = images[paths.image]; }   // la vista previa ya es la foto subida
          if (editing && x.image_path && x.image_path !== saved.image_path) st.removeImages([x.image_path, x.thumb_path].filter(Boolean)).catch(function (e) { console.warn('[color] imagen anterior no borrada', e && e.status); });
          replaceIn(inspCache.items, saved);
          saveNewOptions(s.added);
          refresh();
          toast('Inspiración guardada.' + (saved.palette_status === 'auto' ? ' Revisa su paleta cuando puedas.' : saved.palette_status === 'failed' ? ' Sin paleta: no se pudo extraer.' : ''));
        }).catch(function (err) {
          if (paths && err && !err.auth) st.removeImages([paths.image, paths.thumb].filter(Boolean)).catch(function () {});   // no dejar fotos huérfanas
          throw err;
        });
      }, editing ? title : url);
      // pegar una imagen desde el portapapeles (escritorio)
      var dlg = url.closest('dialog');
      if (dlg) dlg.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var file = items[i].getAsFile(); if (file) { e.preventDefault(); usePhoto(file); } return; }
        }
      });
    }
    // estilos y colecciones nuevos: a la lista de Configuración (si existe). Si falla, el valor ya está guardado en la referencia.
    function saveNewOptions(added) {
      if (!inspCache || !inspCache.options) return;
      var rows = added.estilo.map(function (v) { return { grupo: 'inspiracion.estilo', valor: v, posicion: 100 }; })
        .concat(added.coleccion.map(function (v) { return { grupo: 'inspiracion.coleccion', valor: v, posicion: 100 }; }));
      if (!rows.length) return;
      st.insert('ap_opciones', rows).then(function (r) { (r || []).forEach(function (o) { inspCache.options.push(o); }); })
        .catch(function (e) { if (e && e.auth) return ctx.fail(e); console.warn('[color] opción no guardada', e && e.status); });
    }

    /* ═══════════ BIBLIOTECA ═══════════ */
    function paletteMatchesFilters(p, f) {
      var n = p.colors.length;
      if (f.count && (f.count === '6' ? n < 6 : n !== Number(f.count))) return false;
      if (f.family && !p.colors.some(function (c) { return M.E.familyOf(c.hex) === f.family; })) return false;
      if (f.tag && (p.tags || []).indexOf(f.tag) < 0) return false;
      if (f.source && (p.demo ? 'own' : p.source_type) !== f.source) return false;
      if (f.fav && !p.is_favorite) return false;
      if (f.q) {
        var q = f.q.toLowerCase(), hay = [p.name, p.notes, p.source_title, (p.tags || []).join(' ')].concat(p.colors.map(function (c) { return c.hex + ' ' + (c.name || ''); })).join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }
    function paintLibrary() {
      var f = mem.lib, pals = data().palettes;
      var tags = []; pals.forEach(function (p) { (p.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); }); tags.sort();
      var q = h('input', { type: 'search', id: 'cs-lib-q', value: f.q, placeholder: 'Nombre, etiqueta o HEX', autocomplete: 'off', 'data-key': 'lib-q' });
      q.addEventListener('input', function () { f.q = q.value.trim(); paintGrid(); });
      var counts = h('div', { class: 'cs-seg', role: 'group', 'aria-label': 'Número de colores' }, [['', 'Todas'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6+']].map(function (o) {
        return btn(o[1], 'cs-seg-b', function () { f.count = o[0]; refresh(); }, { 'aria-pressed': f.count === o[0] ? 'true' : 'false', 'data-key': 'cnt-' + o[0], 'aria-label': o[0] ? o[1] + ' colores' : 'Todas las paletas' });
      }));
      var fam = ui.select(M.E.FAMILIES.map(function (x) { return [x.id, x.label]; }), f.family, 'Todas las familias');
      fam.id = 'cs-f-fam';
      fam.addEventListener('change', function () { f.family = fam.value; paintGrid(); });
      var tag = ui.select(tags, f.tag, 'Todas las etiquetas');
      tag.id = 'cs-f-tag';
      tag.addEventListener('change', function () { f.tag = tag.value; paintGrid(); });
      var src = ui.select(M.D.SOURCE_TYPES, f.source, 'Cualquier origen');
      src.id = 'cs-f-src';
      src.addEventListener('change', function () { f.source = src.value; paintGrid(); });
      var fav = h('input', { type: 'checkbox', checked: f.fav ? true : null });
      fav.addEventListener('change', function () { f.fav = fav.checked; paintGrid(); });
      body.appendChild(h('div', { class: 'cs-toolbar' }, [
        h('div', { class: 'cs-search' }, [h('label', { class: 'sr-only', for: 'cs-lib-q', text: 'Buscar paletas' }), q]),
        h('div', { class: 'cs-actions' }, [
          btn('Nueva paleta', 'btn btn-primary', function () { editPalette(null); }, { 'data-key': 'new-pal' }),
          btn('Importar', 'btn btn-outline', importDialog), btn('Exportar', 'btn btn-outline', exportData)
        ])
      ]));
      body.appendChild(h('div', { class: 'cs-filters' }, [counts,
        h('label', { class: 'sr-only', for: 'cs-f-fam', text: 'Familia cromática' }), fam,
        h('label', { class: 'sr-only', for: 'cs-f-tag', text: 'Etiqueta' }), tag,
        h('label', { class: 'sr-only', for: 'cs-f-src', text: 'Origen' }), src,
        h('label', { class: 'cs-check' }, [fav, ' Solo favoritas'])]));
      var count = h('p', { class: 'cs-count', role: 'status', 'aria-live': 'polite' });
      var grid = h('ul', { class: 'cs-pal-grid' });
      body.appendChild(count); body.appendChild(grid);
      function paintGrid() {
        grid.textContent = '';
        var list = pals.filter(function (p) { return paletteMatchesFilters(p, f); });
        count.textContent = list.length === pals.length ? pals.length + (pals.length === 1 ? ' paleta' : ' paletas') : list.length + ' de ' + pals.length + ' paletas';
        if (!pals.length) {
          grid.appendChild(h('li', { class: 'cs-wide' }, [empty('Todavía no hay paletas', 'Registra combinaciones que te inspiren: de un libro, una web, una foto o tuyas. Indica siempre de dónde salen.', [
            btn('Nueva paleta', 'btn btn-primary', function () { editPalette(null); }), demo ? null : btn('Ver con datos de ejemplo', 'btn btn-outline', enterDemo)])]));
          return;
        }
        if (!list.length) { grid.appendChild(h('li', { class: 'cs-wide' }, [empty('Sin resultados', 'Ninguna paleta cumple estos filtros.')])); return; }
        list.forEach(function (p) {
          var name = p.name || 'Paleta sin nombre';
          grid.appendChild(h('li', { class: 'cs-pal' }, [
            h('button', { type: 'button', class: 'cs-pal-open', onclick: function () { paletteDetail(p); }, 'data-key': 'pal-' + p.id }, [
              band(p.colors, { cls: 'cs-band--card' }),
              h('span', { class: 'cs-pal-n', text: name }),
              h('span', { class: 'cs-pal-m', text: p.colors.length + ' colores · ' + (p.demo ? 'Ejemplo' : p.source_type === 'own' ? 'Creada por ti' : M.D.SOURCE_LABEL[p.source_type]) }),
              h('span', { class: 'sr-only', text: '. Colores: ' + hexList(p.colors) })
            ]),
            btn(h('span', { 'aria-hidden': 'true', text: p.is_favorite ? '★' : '☆' }), 'cs-fav' + (p.is_favorite ? ' is-on' : ''), function () { toggleFav(p); },
              { 'aria-pressed': p.is_favorite ? 'true' : 'false', 'aria-label': 'Favorita: ' + name, 'data-key': 'fav-' + p.id })
          ]));
        });
      }
      paintGrid();
    }
    function toggleFav(p) {
      if (demo) return demoBlocked();
      st.update('cs_palettes', p.id, { is_favorite: !p.is_favorite }).then(function (row) { replaceIn(cache.palettes, row); refresh(); }).catch(failSoft);
    }
    function paletteDetail(p) {
      var name = p.name || 'Paleta sin nombre';
      sheet(name, function (box, close) {
        box.appendChild(h('p', { class: 'cs-badges' }, [sourceBadge(p), badge(p.colors.length + ' colores'), p.is_favorite ? badge('★ Favorita', 'fav') : null]));
        box.appendChild(h('ol', { class: 'cs-swatches' }, p.colors.map(function (c) {
          var block = h('span', { class: 'cs-swatch-big', 'aria-hidden': 'true' }); block.style.backgroundColor = c.hex;
          return h('li', { class: 'cs-swatch' }, [block, h('span', { class: 'cs-swatch-txt' }, [
            h('span', { class: 'cs-slot-n', text: c.name || colorName(c.hex) }), h('span', { class: 'cs-hex', text: c.hex }),
            c.original && M.E.normalizeHex(c.original) !== c.original ? h('span', { class: 'cs-fine', text: 'Registrado como «' + c.original + '»' }) : null,
            c.role ? h('span', { class: 'cs-fine', text: 'Papel: ' + c.role }) : null, c.note ? h('span', { class: 'cs-fine', text: c.note }) : null
          ])]);
        })));
        if ((p.tags || []).length) box.appendChild(h('p', { class: 'cs-tags' }, p.tags.map(function (t) { return h('span', { class: 'cs-tag', text: t }); })));
        var url = M.D.safeUrl(p.source_url);
        box.appendChild(h('div', { class: 'cs-prov' }, [
          h('p', { class: 'cs-mini-t', text: 'Procedencia' }),
          h('p', { text: (p.demo ? 'Ejemplo inventado para la demo' : M.D.SOURCE_LABEL[p.source_type]) + (p.source_title && !p.demo ? ': ' + p.source_title : '') }),
          url ? h('p', null, [h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Abrir la referencia original' }), h('span', { class: 'sr-only', text: ' (abre en pestaña nueva)' })]) : null,
          p.source_notes ? h('p', { class: 'cs-fine', text: p.source_notes }) : null,
          p.source_type === 'book' ? h('p', { class: 'cs-fine', text: 'Datos introducidos por ti a partir del libro; Color Studio no verifica la procedencia.' }) : null
        ]));
        if (p.notes) box.appendChild(h('p', { class: 'cs-note', text: p.notes }));
        box.appendChild(h('div', { class: 'cs-sheet-actions' }, [
          btn('Usar en Studio', 'btn btn-primary', function () { cur().palette_id = p.id; saveDraft(); close(); location.hash = '#/color'; }),
          btn('Editar', 'btn btn-outline', function () { close(); editPalette(p); }),
          btn('Duplicar', 'btn btn-outline', function () { close(); editPalette(Object.assign({}, p, { id: null, name: (p.name || 'Paleta') + ' (copia)', is_favorite: false }), true); }),
          btn('Eliminar', 'cs-link cs-link--danger', function () { close(); deletePalette(p); })
        ]));
      });
    }
    function deletePalette(p) {
      if (demo) return demoBlocked();
      ctx.ask({ title: 'Eliminar «' + (p.name || 'paleta sin nombre') + '»', text: 'Los outfits que la usaban como referencia se quedan sin ella.', ok: 'Eliminar', danger: true }).then(function (yes) {
        if (!yes) return;
        return st.remove('cs_palettes', p.id).then(function () {
          dropFrom(cache.palettes, p.id);
          cache.outfits.forEach(function (o) { if (o.palette_id === p.id) o.palette_id = null; });
          if (draft.palette_id === p.id) draft.palette_id = null;
          refresh(); toast('Paleta eliminada.');
        });
      }).catch(failSoft);
    }
    function editPalette(p, isCopy) {
      if (demo) return demoBlocked();
      var editing = p && p.id && !isCopy;
      var rows = (p ? p.colors : [{ hex: '' }, { hex: '' }, { hex: '' }]).map(function (c) { return { hex: c.hex || '', original: c.original || null, name: c.name || '', role: c.role || null, note: c.note || null }; });
      var name = ui.input('text', p ? p.name || '' : '', { maxlength: '120' });
      var tags = ui.input('text', p ? (p.tags || []).join(', ') : '', { maxlength: '400' });
      var type = ui.select(M.D.SOURCE_TYPES, p ? p.source_type : 'own');
      var stitle = ui.input('text', p ? p.source_title || '' : '', { maxlength: '200' });
      var surl = ui.input('url', p ? p.source_url || '' : '', { maxlength: '600', inputmode: 'url' });
      var snotes = ui.area(p ? p.source_notes || '' : '', 2, 2000);
      var notes = ui.area(p ? p.notes || '' : '', 2, 2000);
      var fav = h('input', { type: 'checkbox', checked: p && p.is_favorite ? true : null });
      var bookHint = h('p', { class: 'apf-hint apf-wide cs-hint', text: 'Libro: indica edición y página. Registra solo los colores que hayas comprobado tú; Color Studio no verifica la procedencia.' });
      var listEl = h('ol', { class: 'cs-edit-colors' });
      var imgMsg = h('p', { class: 'apf-hint', 'aria-live': 'polite' });
      function paintRows(focusIndex) {
        listEl.textContent = '';
        rows.forEach(function (r, i) {
          var nm = h('input', { type: 'text', value: r.name, maxlength: '60', 'aria-label': 'Nombre del color ' + (i + 1) + ' (opcional)', placeholder: 'Nombre (opcional)', class: 'cs-cname' });
          nm.addEventListener('input', function () { r.name = nm.value; });
          var cf = colorInput('cs-pc-' + i, 'Color ' + (i + 1), M.E.normalizeHex(r.original || '') ? r.original : r.hex, function (v, raw) { r.hex = v || ''; r.raw = raw; r.original = v ? raw : null; }, { compact: true, extra: [nm] });
          listEl.appendChild(h('li', { class: 'cs-edit-color' }, [cf.el, h('span', { class: 'cs-edit-act' }, [
            btn('↑', 'cs-icon-b', function () { if (i) { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); paintRows(i - 1); } }, { 'aria-label': 'Subir color ' + (i + 1), disabled: i ? null : true }),
            btn('↓', 'cs-icon-b', function () { if (i < rows.length - 1) { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); paintRows(i + 1); } }, { 'aria-label': 'Bajar color ' + (i + 1), disabled: i < rows.length - 1 ? null : true }),
            btn('×', 'cs-icon-b', function () { rows.splice(i, 1); paintRows(Math.max(0, i - 1)); }, { 'aria-label': 'Quitar color ' + (i + 1), disabled: rows.length > 1 ? null : true })
          ])]));
          if (focusIndex === i) setTimeout(function () { cf.text.focus(); }, 0);
        });
      }
      paintRows();
      var addBtn = btn('+ Añadir color', 'cs-link', function () { if (rows.length >= M.E.PALETTE_MAX) { imgMsg.textContent = 'Máximo ' + M.E.PALETTE_MAX + ' colores.'; return; } rows.push({ hex: '', name: '' }); paintRows(rows.length - 1); });
      var imgInput = h('input', { type: 'file', accept: M.I.ACCEPTED.join(','), class: 'sr-only' });
      imgInput.addEventListener('change', function () {
        var file = imgInput.files[0]; imgInput.value = '';
        if (!file) return;
        imgMsg.textContent = 'Analizando la imagen en tu dispositivo…';
        M.I.prepareImage(file).then(function (prep) { return M.I.visionProvider('local').analyze(prep.sample); }).then(function (res) {
          var room = M.E.PALETTE_MAX - rows.filter(function (r) { return r.hex; }).length;
          rows = rows.filter(function (r) { return r.hex; }).concat(res.colors.slice(0, Math.max(0, room)).map(function (c) { return { hex: c.hex, name: '' }; }));
          if (!type.value || type.value === 'own') type.value = 'photo';
          paintRows();
          imgMsg.textContent = res.colors.length ? 'Añadidos ' + Math.min(res.colors.length, room) + ' colores propuestos. Revísalos: la luz de la foto los altera. La imagen no se guarda.' : 'No se han encontrado colores claros en la imagen.';
        }).catch(function (err) { imgMsg.textContent = err.message; });
      });
      function syncHint() { bookHint.hidden = type.value !== 'book'; }
      type.addEventListener('change', syncHint); syncHint();
      var fields = [
        ui.field('cs-p-name', 'Nombre', name, { wide: true }),
        h('fieldset', { class: 'apf-fieldset apf-wide' }, [h('legend', { class: 'ap-field-label', text: 'Colores (en orden)' }), listEl,
          h('div', { class: 'cs-edit-more' }, [addBtn, h('label', { class: 'cs-link cs-file' }, ['Extraer de una imagen', imgInput])]), imgMsg]),
        ui.field('cs-p-tags', 'Etiquetas', tags, { wide: true, hint: 'Separadas por comas: otoño, neutros…' }),
        ui.field('cs-p-type', 'Origen', type), ui.field('cs-p-stitle', 'Fuente', stitle, { hint: 'Título, autoría, edición o página' }),
        bookHint,
        ui.field('cs-p-url', 'Enlace de referencia', surl, { wide: true, hint: 'Solo se guarda el enlace: no se descarga su contenido.' }),
        ui.field('cs-p-snotes', 'Notas de procedencia', snotes, { wide: true }),
        ui.field('cs-p-notes', 'Notas personales', notes, { wide: true }),
        h('label', { class: 'cs-check apf-wide' }, [fav, ' Marcar como favorita'])
      ];
      ui.formDialog(editing ? 'Editar paleta' : 'Nueva paleta', 'Guardar paleta', fields, function () {
        var bad = rows.findIndex(function (r) { return r.raw ? !M.E.normalizeHex(r.raw) : r.hex && !M.E.normalizeHex(r.hex); });   // lo escrito, no solo lo válido
        if (bad >= 0) throw ui.invalid('El color ' + (bad + 1) + ' no es un HEX válido.', listEl.querySelectorAll('.cs-hex-input')[bad]);
        var v = M.D.validatePalette({
          name: name.value, tags: tags.value, source_type: type.value, source_title: stitle.value, source_url: surl.value, source_notes: snotes.value, notes: notes.value, is_favorite: fav.checked,
          colors: rows.filter(function (r) { return r.hex; }).map(function (r) { return { hex: r.hex, original: r.original || r.hex, name: r.name, role: r.role, note: r.note }; })
        });
        if (!v.ok) throw ui.invalid(v.errors[0], /enlace/i.test(v.errors[0]) ? surl : null);
        var dups = M.E.findDuplicates(Object.assign({ id: editing ? p.id : null }, v.value), cache.palettes);
        var same = dups.filter(function (x) { return x.kind === 'identical'; })[0];
        if (same) throw ui.invalid('Ya tienes una paleta con estos colores en este orden: «' + (same.palette.name || 'sin nombre') + '».');
        var job = editing ? st.update('cs_palettes', p.id, v.value) : st.insert('cs_palettes', v.value).then(function (r) { return r[0]; });
        return job.then(function (row) {
          replaceIn(cache.palettes, row);
          refresh();
          toast(dups.length ? 'Paleta guardada. Se parece a «' + (dups[0].palette.name || 'otra paleta') + '».' : 'Paleta guardada.');
        });
      }, name);
    }

    function importDialog() {
      if (demo) return demoBlocked();
      sheet('Importar paletas', function (box, close) {
        box.appendChild(h('p', { class: 'cs-note', text: 'JSON (una exportación de Color Studio o una lista de paletas) o CSV con columnas nombre, colores, etiquetas, origen, fuente, url y notas. Antes de importar podrás revisar cada fila.' }));
        var file = h('input', { type: 'file', id: 'cs-imp-file', accept: '.json,.csv,application/json,text/csv' });
        var msg = h('p', { class: 'ap-msg', 'aria-live': 'polite' });
        var review = h('div', { class: 'cs-review' });
        box.appendChild(h('div', { class: 'apf-field' }, [h('label', { class: 'ap-field-label', for: 'cs-imp-file', text: 'Archivo' }), file]));
        box.appendChild(msg); box.appendChild(review);
        file.addEventListener('change', function () {
          review.textContent = ''; msg.classList.remove('is-error');
          var f = file.files[0]; if (!f) return;
          if (f.size > M.D.IMPORT_MAX_BYTES) { msg.textContent = 'El archivo supera 2 MB.'; msg.classList.add('is-error'); return; }
          f.text().then(function (text) {
            var parsed = /\.csv$/i.test(f.name) || f.type === 'text/csv' ? M.D.parseImportCSV(text) : M.D.parseImportJSON(text);
            if (!parsed.ok) { msg.textContent = parsed.error; msg.classList.add('is-error'); return; }
            var rows = M.D.reviewImport(parsed.rows, cache.palettes);
            var valid = rows.filter(function (r) { return !r.errors.length; }).length;
            msg.textContent = rows.length + ' filas: ' + valid + ' válidas, ' + (rows.length - valid) + ' con errores.';
            var go = btn('', 'btn btn-primary', function () { doImport(rows, go, msg, close); });
            function label() { var n = rows.filter(function (r) { return r.selected; }).length; go.textContent = 'Importar ' + n + (n === 1 ? ' paleta' : ' paletas'); go.disabled = !n; }
            review.appendChild(h('ul', { class: 'cs-imp' }, rows.map(function (r) {
              var cb = h('input', { type: 'checkbox', checked: r.selected ? true : null, disabled: r.errors.length ? true : null, 'aria-label': 'Importar la fila ' + r.row });
              cb.addEventListener('change', function () { r.selected = cb.checked; label(); });
              return h('li', { class: 'cs-imp-row' + (r.errors.length ? ' is-bad' : '') }, [cb,
                r.value.colors.length ? band(r.value.colors, { cls: 'cs-band--mini' }) : h('span', { class: 'cs-band cs-band--mini is-empty', 'aria-hidden': 'true' }),
                h('span', { class: 'cs-imp-txt' }, [h('span', { class: 'cs-slot-n', text: 'Fila ' + r.row + ' · ' + (r.value.name || 'sin nombre') }),
                  r.errors.length ? h('span', { class: 'cs-imp-err', text: r.errors.join('. ') }) : null,
                  r.duplicates.map(function (d) { return h('span', { class: 'cs-imp-dup', text: ({ identical: 'Idéntica a', reordered: 'Mismos colores que', near: 'Casi igual que' })[d.kind] + ' «' + d.name + '» (' + d.where + ')' }); })])
              ]);
            })));
            review.appendChild(h('div', { class: 'cs-sheet-actions' }, [go]));
            label();
          }).catch(function () { msg.textContent = 'No se ha podido leer el archivo.'; msg.classList.add('is-error'); });
        });
      }, { wide: true });
    }
    function doImport(rows, go, msg, close) {
      var chosen = rows.filter(function (r) { return r.selected && !r.errors.length; }).map(function (r) { return r.value; });
      if (!chosen.length) return;
      go.disabled = true; msg.classList.remove('is-error'); msg.textContent = 'Importando…';
      st.insert('cs_palettes', chosen).then(function (saved) {
        (saved || []).forEach(function (row) { replaceIn(cache.palettes, row); });
        close(); refresh(); toast((saved || []).length + ' paletas importadas.');
      }).catch(function (err) {
        if (err && err.auth) return ctx.fail(err);
        go.disabled = false; msg.textContent = 'No se ha importado nada: ' + ((err && err.message) || 'error desconocido') + '.'; msg.classList.add('is-error');
      });
    }
    function exportData() {
      if (demo) return demoBlocked();
      if (!inspCache) return st.loadInsp().then(exportData, failSoft);   // una vez: tras un error queda inspCache.error y se exporta sin ellas
      var out = M.D.buildExport(Object.assign({ inspirations: inspCache.items }, cache));
      var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = h('a', { href: url, download: 'color-studio-' + new Date().toISOString().slice(0, 10) + '.json' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('Copia descargada: ' + out.palettes.length + ' paletas, ' + out.garments.length + ' prendas, ' + out.outfits.length + ' outfits y ' + out.inspirations.length + ' inspiraciones (sin fotos)' + (inspCache.error ? '; las inspiraciones no se han podido leer.' : '.'));
    }

    /* ═══════════ ARMARIO ═══════════ */
    function paintWardrobe() {
      var f = mem.ward, all = data().garments;
      var q = h('input', { type: 'search', id: 'cs-w-q', value: f.q, placeholder: 'Nombre, color o notas', autocomplete: 'off', 'data-key': 'ward-q' });
      q.addEventListener('input', function () { f.q = q.value.trim(); paintGrid(); });
      var cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only' });
      cam.addEventListener('change', function () { var file = cam.files[0]; cam.value = ''; if (file) editGarment(null, { file: file, category: f.cat || null }); });
      body.appendChild(h('div', { class: 'cs-toolbar' }, [
        h('div', { class: 'cs-search' }, [h('label', { class: 'sr-only', for: 'cs-w-q', text: 'Buscar prendas' }), q]),
        h('div', { class: 'cs-actions' }, [
          btn('Añadir prenda', 'btn btn-primary', function () { editGarment(null, { category: f.cat || null }); }, { 'data-key': 'new-garment' }),
          demo ? null : h('label', { class: 'btn btn-outline cs-file' }, ['Hacer foto', cam])
        ])
      ]));
      var counts = {}; all.forEach(function (g) { counts[g.category] = (counts[g.category] || 0) + 1; });
      body.appendChild(h('div', { class: 'cs-chips', role: 'group', 'aria-label': 'Categoría' }, [['', 'Todas']].concat(M.E.CATEGORIES).map(function (c) {
        var n = c[0] ? counts[c[0]] || 0 : all.length;
        return btn([c[1], h('span', { class: 'cs-chip-n', text: String(n) })], 'cs-chip', function () { f.cat = c[0]; refresh(); }, { 'aria-pressed': f.cat === c[0] ? 'true' : 'false', 'data-key': 'cat-' + c[0] });
      })));
      var count = h('p', { class: 'cs-count', role: 'status', 'aria-live': 'polite' });
      var grid = h('ul', { class: 'cs-ward' });
      body.appendChild(count); body.appendChild(grid);
      function paintGrid() {
        grid.textContent = '';
        var ql = f.q.toLowerCase();
        var list = all.filter(function (g) {
          if (f.cat && g.category !== f.cat) return false;
          if (!ql) return true;
          return [garmentName(g), g.subcategory, g.material, g.notes, g.primary_color, colorName(g.primary_color)].concat(g.secondary_colors || []).join(' ').toLowerCase().indexOf(ql) >= 0;
        });
        count.textContent = list.length + (list.length === 1 ? ' prenda' : ' prendas');
        if (!all.length) {
          grid.appendChild(h('li', { class: 'cs-wide' }, [empty('Tu armario está vacío', 'Haz una foto de una prenda o regístrala con su color a mano. La foto es opcional y se guarda en privado.', [
            btn('Añadir prenda', 'btn btn-primary', function () { editGarment(null, {}); }), demo ? null : btn('Ver con datos de ejemplo', 'btn btn-outline', enterDemo)])]));
          return;
        }
        if (!list.length) { grid.appendChild(h('li', { class: 'cs-wide' }, [empty('Sin resultados', 'Ninguna prenda cumple el filtro.')])); return; }
        list.forEach(function (g) {
          grid.appendChild(h('li', { class: 'cs-garment' }, [h('button', { type: 'button', class: 'cs-garment-b', onclick: function () { editGarment(g, {}); }, 'data-key': 'g-' + g.id }, [
            thumb(g, 'cs-thumb--card'),
            h('span', { class: 'cs-garment-txt' }, [
              h('span', { class: 'cs-slot-k', text: M.E.CATEGORY_LABEL[g.category] }),
              h('span', { class: 'cs-slot-n', text: garmentName(g) }),
              h('span', { class: 'cs-dots', 'aria-hidden': 'true' }, [g.primary_color].concat(g.secondary_colors || []).map(function (x) { return swatch(x, 'cs-dot'); })),
              h('span', { class: 'sr-only', text: '. Colores: ' + [g.primary_color].concat(g.secondary_colors || []).join(', ') })
            ])
          ])]));
        });
      }
      paintGrid();
    }

    function editGarment(g, opts) {
      if (demo) return demoBlocked();
      opts = opts || {};
      var s = { prep: null, previewUrl: null, removePhoto: false, picking: false, pickAt: { x: 0.5, y: 0.5 }, primary: g ? g.primary_color : '', secondary: g ? (g.secondary_colors || []).slice() : [], shares: g && g.color_shares ? g.color_shares.slice() : null };
      var cat = ui.select(M.E.CATEGORIES, g ? g.category : opts.category || '', 'Elige una categoría');
      var name = ui.input('text', g ? g.name || '' : '', { maxlength: '120' });
      var sub = ui.input('text', g ? g.subcategory || '' : '', { maxlength: '80' });
      var pattern = ui.select(M.D.PATTERNS, g ? g.pattern : 'liso');
      var material = ui.input('text', g ? g.material || '' : '', { maxlength: '80' });
      var notes = ui.area(g ? g.notes || '' : '', 2, 2000);
      var preview = h('div', { class: 'cs-photo' });
      var proposals = h('div', { class: 'cs-proposals', 'aria-live': 'polite' });
      var photoMsg = h('p', { class: 'apf-hint', 'aria-live': 'polite' });
      var pickOut = h('div', { class: 'cs-pick-out', 'aria-live': 'polite' });
      var primary = colorInput('cs-g-primary', 'Color principal', s.primary, function (v) { s.primary = v; });
      var secList = h('ul', { class: 'cs-sec' });
      var sharesBox = h('div', { class: 'cs-shares' });
      function paintPreview() {
        preview.textContent = '';
        var src = s.previewUrl;
        preview.classList.toggle('is-picking', !!(src && s.picking));
        if (src && s.picking) preview.appendChild(pickArea(src));
        else if (src) { var img = h('img', { alt: 'Vista previa de la foto de la prenda', src: src }); preview.appendChild(img); }
        else if (g && g.image_path && !s.removePhoto) { var box = thumb(g, 'cs-thumb--photo'); preview.appendChild(box); }
        else preview.appendChild(h('span', { class: 'cs-photo-empty', text: 'Sin foto' }));
        removeBtn.hidden = !(s.previewUrl || (g && g.image_path && !s.removePhoto));
        pickBtn.hidden = !(s.prep && s.prep.pick);
        pickBtn.setAttribute('aria-pressed', s.picking ? 'true' : 'false');
        pickBtn.textContent = s.picking ? 'Cerrar cuentagotas' : 'Cuentagotas';
      }
      // cuentagotas (auditoría CS-17): el color de un punto de la foto, elegido a mano; flechas para moverlo e Intro para tomarlo
      function sampleAt() { var p = s.prep.pick; return M.E.sampleColor(p.data, p.width, p.height, s.pickAt.x, s.pickAt.y, 3); }
      function pickArea(src) {
        var img = h('img', { alt: '', src: src, draggable: 'false' });
        var mark = h('span', { class: 'cs-pick-mark', 'aria-hidden': 'true' });
        var area = h('div', { class: 'cs-pick-area', tabindex: '0', role: 'application', 'data-key': 'pick-area',
          'aria-label': 'Cuentagotas sobre la foto. Toca un punto de la prenda, o muévete con las flechas (Mayús para ir más rápido) y pulsa Intro para tomar su color.' }, [img, mark]);
        function place() { mark.style.left = (s.pickAt.x * 100) + '%'; mark.style.top = (s.pickAt.y * 100) + '%'; var hex = sampleAt(); mark.style.backgroundColor = hex || 'transparent'; }
        area.addEventListener('pointerdown', function (e) {
          var r = img.getBoundingClientRect();
          if (!r.width || !r.height) return;
          s.pickAt = { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
          place(); take();
        });
        area.addEventListener('keydown', function (e) {
          var step = e.shiftKey ? 0.1 : 0.02, dx = { ArrowLeft: -step, ArrowRight: step }[e.key] || 0, dy = { ArrowUp: -step, ArrowDown: step }[e.key] || 0;
          if (dx || dy) { e.preventDefault(); s.pickAt = { x: Math.max(0, Math.min(1, s.pickAt.x + dx)), y: Math.max(0, Math.min(1, s.pickAt.y + dy)) }; place(); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); take(); }
        });
        place();
        return area;
      }
      function take() {
        var hex = sampleAt();
        pickOut.textContent = '';
        if (!hex) { pickOut.appendChild(h('p', { class: 'apf-hint', text: 'En ese punto la imagen es transparente: elige otro.' })); return; }
        pickOut.appendChild(h('p', { class: 'cs-mini-t', text: 'Color del punto elegido' }));
        pickOut.appendChild(h('ul', { class: 'cs-prop' }, [colorRow(hex, 'pick')]));
      }
      function colorRow(hex, key) {
        return h('li', { class: 'cs-prop-row' }, [swatch(hex, 'cs-sw--l'), h('span', { class: 'cs-prop-t' }, [h('span', { text: colorName(hex) }), h('span', { class: 'cs-hex', text: hex })]),
          btn(['Principal', h('span', { class: 'sr-only', text: ' ' + hex })], 'cs-btn-s', function () { s.primary = hex; primary.set(hex); }, key ? { 'data-key': key + '-primary' } : null),
          btn(['+ Secundario', h('span', { class: 'sr-only', text: ' ' + hex })], 'cs-btn-s', function () { addSecondary(hex); }, key ? { 'data-key': key + '-secondary' } : null)]);
      }
      function paintSecondary() {
        secList.textContent = '';
        s.secondary.forEach(function (hex, i) {
          var cf = colorInput('cs-g-sec-' + i, 'Color secundario ' + (i + 1), hex, function (v, raw) { s.secondary[i] = v || raw || ''; }, { compact: true,
            extra: [btn('×', 'cs-icon-b', function () { s.secondary.splice(i, 1); s.shares = null; paintSecondary(); }, { 'aria-label': 'Quitar color secundario ' + (i + 1) })] });
          secList.appendChild(h('li', null, [cf.el]));
        });
        paintShares();
      }
      function paintShares() {
        sharesBox.textContent = '';
        if (!s.secondary.length) return;
        var labels = ['Principal'].concat(s.secondary.map(function (_, i) { return 'Secundario ' + (i + 1); }));
        sharesBox.appendChild(h('details', { open: s.shares ? true : null }, [h('summary', { class: 'cs-summary cs-summary--s', text: 'Reparto de colores (opcional)' }),
          h('p', { class: 'apf-hint', text: 'Cuánto ocupa cada color en la prenda, en cualquier escala (p. ej. 70 y 30). Vacío: cuenta solo el principal.' }),
          h('div', { class: 'cs-share-grid' }, labels.map(function (l, i) {
            var inp = h('input', { type: 'number', min: '0', step: '1', inputmode: 'decimal', id: 'cs-g-sh-' + i, value: s.shares && s.shares[i] != null ? String(s.shares[i]) : '' });
            inp.addEventListener('input', function () { var all = [].map.call(sharesBox.querySelectorAll('input'), function (x) { return x.value.trim(); }); s.shares = all.every(function (x) { return x === ''; }) ? null : all.map(function (x) { return x === '' ? 0 : Number(x.replace(',', '.')); }); });
            return h('div', { class: 'apf-field' }, [h('label', { class: 'ap-field-label', for: 'cs-g-sh-' + i, text: l }), inp]);
          }))]));
      }
      function addSecondary(hex) { if (s.secondary.length >= 6) { photoMsg.textContent = 'Máximo 6 colores secundarios.'; return; } s.secondary.push(hex || ''); s.shares = null; paintSecondary(); }
      function usePhoto(file) {
        photoMsg.textContent = 'Preparando la foto…';
        M.I.prepareImage(file).then(function (prep) {
          if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
          s.prep = prep; s.previewUrl = URL.createObjectURL(prep.blob); s.removePhoto = false; s.picking = false; s.pickAt = { x: 0.5, y: 0.5 }; pickOut.textContent = '';
          paintPreview();
          photoMsg.textContent = 'Foto lista (' + prep.width + '×' + prep.height + ' px, sin datos de ubicación). Analizando colores en tu dispositivo…';
          return M.I.visionProvider('local').analyze(prep.sample);
        }).then(function (res) {
          if (!res) return;
          proposals.textContent = '';
          if (!res.colors.length) { photoMsg.textContent = 'No se han encontrado colores claros. Elige el color a mano.'; return; }
          photoMsg.textContent = 'Colores propuestos: la luz y el balance de blancos los alteran, compáralos con la prenda. Si alguno no se parece, usa el cuentagotas sobre la zona bien iluminada.';
          proposals.appendChild(h('p', { class: 'cs-mini-t', text: 'Colores del análisis' }));
          proposals.appendChild(h('ul', { class: 'cs-prop' }, res.colors.map(function (c) { return colorRow(c.hex); })));
          if (!s.primary) { s.primary = res.colors[0].hex; primary.set(res.colors[0].hex); }
        }).catch(function (err) { photoMsg.textContent = err.message; });
      }
      var camIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only' });
      var galIn = h('input', { type: 'file', accept: M.I.ACCEPTED.join(','), class: 'sr-only' });
      [camIn, galIn].forEach(function (inp) { inp.addEventListener('change', function () { var f = inp.files[0]; inp.value = ''; if (f) usePhoto(f); }); });
      var removeBtn = btn('Quitar foto', 'cs-link cs-link--muted', function () { if (s.previewUrl) URL.revokeObjectURL(s.previewUrl); s.prep = null; s.previewUrl = null; s.removePhoto = true; s.picking = false; proposals.textContent = ''; pickOut.textContent = ''; paintPreview(); });
      var pickBtn = btn('Cuentagotas', 'btn btn-outline', function () {
        s.picking = !s.picking; paintPreview();
        var area = preview.querySelector('.cs-pick-area'); if (area) area.focus();
      }, { 'aria-pressed': 'false', 'data-key': 'eyedropper' });
      paintPreview(); paintSecondary();
      var del = g ? btn('Eliminar prenda', 'cs-link cs-link--danger', function () {
        var dlg = del.closest('dialog');
        ctx.ask({ title: 'Eliminar «' + garmentName(g) + '»', text: 'Se borran la prenda y su foto. Los outfits que la usaban mostrarán el hueco como prenda eliminada.', ok: 'Eliminar', danger: true }).then(function (yes) {
          if (!yes) return;
          return st.remove('cs_garments', g.id).then(function () {
            dropFrom(cache.garments, g.id);
            if (g.image_path) st.removeImages([g.image_path]).catch(function (e) { console.warn('[color] foto no borrada', e && e.status); });
            if (dlg && dlg.open) dlg.close();
            refresh(); toast('Prenda eliminada.');
          });
        }).catch(failSoft);
      }) : null;
      var fields = [
        h('div', { class: 'apf-wide cs-photo-field' }, [preview, h('div', { class: 'cs-photo-act' }, [
          h('label', { class: 'btn btn-outline cs-file' }, ['Hacer foto', camIn]),
          h('label', { class: 'btn btn-outline cs-file' }, ['Elegir imagen', galIn]), pickBtn, removeBtn]),
          h('p', { class: 'cs-fine cs-fine--tight', text: 'Para colores fieles: luz natural indirecta, sin flash y la prenda sobre un fondo liso blanco o gris. Ni el análisis ni el cuentagotas corrigen el balance de blancos.' }),
          photoMsg, pickOut, proposals]),
        ui.field('cs-g-cat', 'Categoría', cat),
        h('div', { class: 'apf-field' }, [primary.el]),
        h('fieldset', { class: 'apf-fieldset apf-wide' }, [h('legend', { class: 'ap-field-label', text: 'Colores secundarios' }), secList,
          btn('+ Añadir color secundario', 'cs-link', function () { addSecondary(''); }), sharesBox]),
        ui.field('cs-g-name', 'Nombre (opcional)', name), ui.field('cs-g-sub', 'Subcategoría', sub, { hint: 'Chino, oxford, bota, calcetín tobillero…' }),
        ui.field('cs-g-pattern', 'Patrón', pattern), ui.field('cs-g-mat', 'Material', material),
        ui.field('cs-g-notes', 'Notas', notes, { wide: true }),
        del ? h('div', { class: 'apf-wide' }, [del]) : null
      ].filter(Boolean);
      ui.formDialog(g ? 'Editar prenda' : 'Nueva prenda', 'Guardar prenda', fields, function () {
        var v = M.D.validateGarment({ category: cat.value, primary_color: s.primary, secondary_colors: s.secondary.filter(Boolean), color_shares: s.shares,
          name: name.value, subcategory: sub.value, pattern: pattern.value, material: material.value, notes: notes.value });
        if (!v.ok) throw ui.invalid(v.errors[0], /categor/i.test(v.errors[0]) ? cat : /principal/i.test(v.errors[0]) ? primary.text : null);
        var row = v.value, newPath = null, upload = Promise.resolve();
        if (s.prep) {
          newPath = 'prendas/' + crypto.randomUUID() + (s.prep.type === 'image/webp' ? '.webp' : '.jpg');
          upload = st.upload(newPath, s.prep.blob, s.prep.type);
          row.image_path = newPath;
        } else if (s.removePhoto) row.image_path = null;
        return upload.then(function () {
          return g ? st.update('cs_garments', g.id, row) : st.insert('cs_garments', row).then(function (r) { return r[0]; });
        }).then(function (saved) {
          if (newPath && s.previewUrl) images[newPath] = Promise.resolve(s.previewUrl);   // la vista previa ya es la foto subida
          if (g && g.image_path && g.image_path !== saved.image_path) st.removeImages([g.image_path]).catch(function (e) { console.warn('[color] foto anterior no borrada', e && e.status); });
          replaceIn(cache.garments, saved);
          if (opts.onSaved) opts.onSaved(saved); else refresh();
          toast('Prenda guardada.');
        }).catch(function (err) {
          if (newPath && err && !err.auth && !/subir la foto|bucket/i.test(err.message)) st.removeImages([newPath]).catch(function () {});   // no dejar fotos huérfanas
          throw err;
        });
      }, cat.value ? primary.text : cat);
      if (opts.file) usePhoto(opts.file);
    }

    /* ═══════════ CALCETINES ═══════════ */
    function ankle(input, sockHex) {
      return [['Pantalón', input.trousers], ['Calcetín', sockHex], ['Calzado', input.shoes]].map(function (x) {
        var s = h('span', { class: 'cs-ankle-b' + (x[1] ? '' : ' is-empty') }); if (x[1]) s.style.backgroundColor = x[1]; return s;
      });
    }
    function paintSocks() {
      var c = computed(), d = cur(), input = sockInputFrom(c, true);
      var basis = h('section', { class: 'cs-card', 'aria-labelledby': 'cs-basis-t' }, [h('div', { class: 'cs-card-head' }, [h('h3', { class: 'cs-h3', id: 'cs-basis-t', text: 'Punto de partida' })])]);
      basis.appendChild(h('p', { class: 'cs-note', text: c.items.length ? 'Se toman del outfit del Studio. Puedes cambiarlos aquí sin tocar el outfit.' : 'No hay outfit en el Studio: elige los colores a mano.' }));
      // lo escrito no cuenta hasta pulsar «Actualizar propuestas»; vacío = color del outfit
      var pend = mem.sockPending;
      var tr = colorInput('cs-s-tr', 'Pantalón', pend.tr != null ? pend.tr : input.trousers || '', function (v, t) { pend.tr = t; });
      var sh = colorInput('cs-s-sh', 'Calzado', pend.sh != null ? pend.sh : input.shoes || '', function (v, t) { pend.sh = t; });
      basis.appendChild(h('div', { class: 'cs-basis' }, [tr.el, sh.el]));
      basis.appendChild(h('div', { class: 'cs-basis-act' }, [
        btn('Actualizar propuestas', 'btn btn-outline', function () {
          var bad = pend.tr && !M.E.normalizeHex(pend.tr) ? tr : pend.sh && !M.E.normalizeHex(pend.sh) ? sh : null;
          if (bad) { toast('Escribe un HEX válido (#RRGGBB) o deja el campo vacío para usar el color del outfit.', true); bad.text.focus(); return; }
          var outfit = sockInputFrom(c);
          var t = pend.tr == null ? mem.sock.trousers : M.E.normalizeHex(pend.tr), s2 = pend.sh == null ? mem.sock.shoes : M.E.normalizeHex(pend.sh);
          mem.sock = { trousers: t && t !== outfit.trousers ? t : null, shoes: s2 && s2 !== outfit.shoes ? s2 : null };
          mem.sockPending = { tr: null, sh: null };
          refresh();
        }, { 'data-key': 'sock-apply' }),
        (mem.sock.trousers || mem.sock.shoes || pend.tr != null || pend.sh != null) ? btn('Volver a los colores del outfit', 'cs-link', function () { mem.sock = { trousers: null, shoes: null }; mem.sockPending = { tr: null, sh: null }; refresh(); }, { 'data-key': 'sock-reset' }) : null
      ]));
      if (mem.sock.trousers || mem.sock.shoes) basis.appendChild(h('p', { class: 'cs-note cs-note--manual', role: 'note', text: 'Estás probando colores escritos a mano: solo cambian esta guía. El Studio sigue usando los colores del outfit.' }));
      if (input.others.length) basis.appendChild(h('p', { class: 'cs-fine' }, ['Resto del outfit: '].concat(input.others.map(function (o, i) { return [i ? ', ' : '', swatch(o.hex, 'cs-dot'), ' ' + o.label.toLowerCase() + ' (' + colorName(o.hex) + ')']; }))));
      function seg(label, opts, value, onPick, key) {
        return h('div', { class: 'cs-segfield' }, [h('p', { class: 'ap-field-label', id: 'cs-seg-' + key, text: label }),
          h('div', { class: 'cs-seg', role: 'group', 'aria-labelledby': 'cs-seg-' + key }, opts.map(function (o) {
            return btn(o[1], 'cs-seg-b', function () { onPick(o[0]); refresh(); }, { 'aria-pressed': value === o[0] ? 'true' : 'false', 'data-key': key + '-' + o[0] });
          }))]);
      }
      basis.appendChild(h('div', { class: 'cs-segs' }, [
        seg('Formalidad', M.S.FORMALITY, d.formality, function (v) { d.formality = v; }, 'form'),
        seg('Dirección', M.C.DIRECTIONS.map(function (x) { return [x.id, x.label]; }), d.direction, function (v) { d.direction = v; }, 'dir')
      ]));
      var detected = detectedShoe(c);
      var shoeSel = ui.select([['', detected ? 'Automático: ' + M.S.SHOE_LABEL[detected].toLowerCase() : 'Automático (sin dato)']].concat(M.S.SHOE_TYPES), d.shoeType || '');
      shoeSel.id = 'cs-s-shoe'; shoeSel.setAttribute('data-key', 'shoe-type');
      shoeSel.addEventListener('change', function () { d.shoeType = shoeSel.value; refresh(); });
      basis.appendChild(h('div', { class: 'cs-shoe' }, [h('label', { class: 'ap-field-label', for: 'cs-s-shoe', text: 'Tipo de calzado' }), shoeSel,
        h('p', { class: 'cs-fine cs-fine--tight', text: detected ? 'Deducido de lo que escribiste en la prenda (subcategoría o nombre). Puedes corregirlo aquí; solo afecta a esta guía.' : 'Escribe el tipo en la subcategoría del calzado (bota, mocasín, deportiva…) para que se deduzca solo, o elígelo aquí.' })]));
      body.appendChild(basis);

      var r = M.S.recommendSocks(input);
      var out = h('section', { class: 'cs-socks', 'aria-labelledby': 'cs-props-t' }, [h('h3', { class: 'cs-h3', id: 'cs-props-t', text: 'Propuestas' })]);
      if (r.insufficient) {
        out.appendChild(empty('Falta información', r.notes[0], [h('a', { class: 'btn btn-outline', href: '#/color', text: 'Ir al Studio' })]));
        body.appendChild(out);
        return;
      }
      out.appendChild(h('div', { class: 'cs-fit', 'data-key': 'sock-fit-guide' }, [
        h('p', { class: 'cs-eyebrow', text: 'Largo y grosor' }),
        h('p', { class: 'cs-fit-main' }, [h('strong', { text: r.fit.label.replace(/^./, function (m) { return m.toUpperCase(); }) }), ' · ' + r.fit.weight]),
        h('p', { class: 'cs-fine cs-fine--tight', text: r.fit.why + (r.shoeType ? '' : ' Indica el tipo de calzado para afinarlo.') })
      ]));
      out.appendChild(h('ol', { class: 'cs-props' }, r.proposals.map(function (p) {
        var big = h('span', { class: 'cs-prop-sw', 'aria-hidden': 'true' }); big.style.backgroundColor = p.hex;
        var on = sockIsOn(p);
        return h('li', { class: 'cs-propcard' + (on ? ' is-on' : '') }, [
          h('div', { class: 'cs-prop-vis' }, [big, h('span', { class: 'cs-ankle', 'aria-hidden': 'true' }, ankle(input, p.hex))]),
          h('div', { class: 'cs-prop-body' }, [
            h('p', { class: 'cs-eyebrow', text: p.label }),
            h('p', { class: 'cs-prop-name' }, [p.name + ' ', h('span', { class: 'cs-hex', text: p.hex })]),
            h('p', { class: 'cs-prop-meta' }, [
              h('span', { text: 'Contraste: ' + [p.contrastTrousers ? 'pantalón ' + p.contrastTrousers : null, p.contrastShoes ? 'calzado ' + p.contrastShoes : null].filter(Boolean).join(' · ') }),
              h('span', { text: 'Inspira: ' + p.source })]),
            h('p', { class: 'cs-prop-exp', text: p.explanation }),
            h('p', { class: 'cs-prop-eff', text: p.effect }),
            h('p', { class: 'cs-prop-own' + (p.owned ? ' is-own' : '') }, p.owned
              ? [swatch(p.owned.garment.primary_color, 'cs-dot'), ' En tu armario: ' + garmentName(p.owned.garment) + ' (' + M.E.MATCH_LABEL[M.E.matchKind(p.owned.dE)].toLowerCase() + ')' +
                (p.owned.lengthOk === false ? '. Es ' + M.S.SOCK_LENGTH_LABEL[p.owned.length].toLowerCase() + ': con este calzado se suele llevar ' + r.fit.label + '.' : '')]
              : ['No tienes calcetines de este tono registrados.']),
            h('details', { class: 'cs-rules' }, [h('summary', { text: 'Reglas aplicadas' }), h('ul', null, p.rules.map(function (id) { return h('li', { text: M.S.RULES[id] }); }))]),
            btn([on ? 'En el outfit' : 'Usar en el outfit', h('span', { class: 'sr-only', text: ' (' + p.label.toLowerCase() + ')' })], on ? 'cs-btn-s is-on' : 'cs-btn-s', function () { if (!on) useSock(p); }, { 'aria-pressed': on ? 'true' : 'false', 'data-key': 'use-' + p.type })
          ])
        ]);
      })));
      if (r.notes.length) out.appendChild(h('ul', { class: 'cs-warn' }, r.notes.map(function (n) { return h('li', { text: n }); })));
      out.appendChild(h('p', { class: 'cs-fine', text: 'Las propuestas salen de reglas explícitas y de tus colores, no del azar, y nunca repiten el mismo tono. Son orientativas: la formalidad y la dirección cambian el orden, no convierten una opción en obligatoria. El largo de tus calcetines se lee de su subcategoría o nombre (invisible, tobillero, media caña, largo): anótalo ahí para que cuente.' }));
      body.appendChild(out);
    }

    /* ═══════════ ARRANQUE ═══════════ */
    function setup() {
      ctx.view.textContent = '';
      ctx.view.appendChild(h('section', { class: 'cs cs-setup', 'aria-labelledby': 'cs-setup-t' }, [
        h('p', { class: 'cs-eyebrow', text: 'Color Studio' }),
        h('h2', { class: 'cs-title', id: 'cs-setup-t', text: 'Falta preparar la base de datos' }),
        h('p', { class: 'cs-sub', text: 'Las tablas de Color Studio aún no existen en Supabase. Ejecuta supabase/color-studio.sql en el SQL Editor (una vez; es idempotente) y recarga la página. Crea las tablas, sus políticas de acceso y el bucket privado de fotos.' }),
        h('div', { class: 'cs-empty-actions' }, [btn('Ver con datos de ejemplo', 'btn btn-outline', function () { demo = M.D.demoData(); rebuild(); })])
      ]));
    }
    return loadLibs().then(function () {
      var jobs = [];
      if (!demo && !(cache && Date.now() - cache.at < STALE_MS)) jobs.push(st.load());
      if (!demo && view.id === 'inspiracion' && !(inspCache && Date.now() - inspCache.at < STALE_MS)) jobs.push(st.loadInsp());
      return Promise.all(jobs);
    }).then(function () {
      return function paint() { rebuild(); if (activeIntro) activeIntro.ready(); };
    }).catch(function (err) {
      if (isMissing(err)) return function paintSetup() { if (demo) rebuild(); else setup(); if (activeIntro) activeIntro.ready(); };
      if (intro) intro.abort();          // error o sesión caducada: nada de quedarse en la bienvenida
      throw err;
    });
  }

  return { render: render };
})();
