/* ═══════════════════════════════════════════════
   area-privada.js — área privada (area-privada.html)
   ─────────────────────────────────────────────────
   Drive personal con notas: carpetas, notas en Markdown y archivos.
   Habla directamente con la API de Supabase (Auth, PostgREST y Storage) con fetch:
   sin librerías ni build, como el resto del sitio.

   Seguridad
   · La clave de este archivo es la PÚBLICA (publishable/anon): puede estar aquí.
     La service_role NUNCA va en el frontend.
   · Lo que protege los datos es Row Level Security (supabase/area-privada.sql):
     sin sesión válida de un miembro, la API no devuelve nada.
   · La sesión vive en sessionStorage: se pierde al cerrar la pestaña y se cierra
     sola tras 30 minutos sin actividad.
   · Todo lo que viene de la base de datos se pinta como texto (textContent) o pasa
     por el renderizador de Markdown, que escapa el HTML antes de dar formato.
   ═══════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Configuración: Supabase → Project Settings → API ── */
  var SUPABASE_URL = 'https://rvizmzjkxunkbqomsvcv.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_rozvXk1dBTGMHmd1h7j6Zw_AW2mIWJv';           // sb_publishable_… o la anon key
  var OWNER_EMAIL = 'borja.mora.mendez@gmail.com'; // el usuario creado en Authentication → Users
  var BUCKET = 'recursos';
  var MAX_FILE = 50 * 1024 * 1024;                 // límite del plan gratuito
  var PREVIEW_MAX = 15 * 1024 * 1024;              // por encima, la vista previa se carga a petición
  var IDLE_MS = 30 * 60 * 1000;
  var SESSION_KEY = 'bm_ap_session';

  var CONFIGURED = !/TU-PROYECTO|TU-CLAVE/.test(SUPABASE_URL + SUPABASE_KEY);
  var COLS = 'id,parent_id,kind,title,mime,size_bytes,updated_at';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    lock: $('ap-lock'), app: $('ap-app'), form: $('ap-login'), pass: $('ap-pass'),
    toggle: $('ap-pass-toggle'), loginMsg: $('ap-login-msg'), loginBtn: $('ap-login-btn'),
    user: $('ap-user'), logout: $('ap-logout'), title: $('ap-app-title'),
    searchForm: $('ap-search-form'), search: $('ap-search'), file: $('ap-file'),
    crumbs: $('ap-crumbs'), status: $('ap-status'), uploads: $('ap-uploads'),
    view: $('ap-view'), drop: $('ap-drop'),
    dialog: $('ap-dialog'), dForm: $('ap-dialog-form'), dTitle: $('ap-dialog-title'),
    dText: $('ap-dialog-text'), dField: $('ap-dialog-field'), dInput: $('ap-dialog-input'),
    dOk: $('ap-dialog-ok'), dCancel: $('ap-dialog-cancel'),
    toolbar: $('ap-toolbar'), crumbsNav: $('ap-crumbs-nav'), tabs: document.querySelectorAll('.ap-tabs a[data-tab]')
  };

  /* ═══════════ FECHA Y HORA (cabecera) ═══════════
     Se actualiza al cambiar de minuto; no se anuncia a lectores de pantalla en cada cambio. */
  var nowDate = $('ap-now-date'), nowTime = $('ap-now-time');
  var clockDay = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  var clockTime = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var d = new Date();
    nowDate.dateTime = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    nowDate.textContent = '';
    nowDate.appendChild(document.createTextNode(clockDay.format(d)));
    var y = document.createElement('span');
    y.className = 'ap-now-date-y';
    y.textContent = ' de ' + d.getFullYear();
    nowDate.appendChild(y);
    nowTime.dateTime = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    nowTime.textContent = clockTime.format(d);
    setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
  }
  if (nowDate && nowTime) tick();

  /* ═══════════ SESIÓN ═══════════ */
  var session = null;
  function readSession() {
    try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { session = null; }
    if (!session || !session.access_token || !session.refresh_token) session = null;
  }
  function writeSession(s) {
    session = s;
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }
  function toSession(d) {
    return {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      email: (d.user && d.user.email) || OWNER_EMAIL
    };
  }

  function parseJson(t) { try { return JSON.parse(t); } catch (e) { return null; } }
  function httpError(status, d, fallback) {
    d = d || {};
    var e = new Error(d.msg || d.message || d.error_description || d.error || fallback || ('HTTP ' + status));
    e.status = status;
    e.code = d.error_code || d.code || d.error;
    return e;
  }
  function authError() { var e = new Error('Sin sesión'); e.status = 401; e.auth = true; return e; }

  function authPost(path, body, token) {
    var headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(SUPABASE_URL + '/auth/v1/' + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.text().then(function (t) {
          var d = t ? parseJson(t) : {};
          if (!r.ok) throw httpError(r.status, d);
          return d || {};
        });
      });
  }

  var refreshing = null;
  function refresh() {
    if (!session) return Promise.reject(authError());
    if (!refreshing) {
      refreshing = authPost('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
        .then(function (d) { writeSession(toSession(d)); })
        .catch(function () { throw authError(); })
        .finally(function () { refreshing = null; });
    }
    return refreshing;
  }
  function token() {
    if (!session) return Promise.reject(authError());
    if (session.expires_at - 60 > Date.now() / 1000) return Promise.resolve(session.access_token);
    return refresh().then(function () { return session.access_token; });
  }

  /* Petición autenticada a Supabase. opts: method, headers, body, raw (devuelve la Response) */
  function api(path, opts, retried) {
    opts = opts || {};
    return token().then(function (t) {
      var headers = Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t }, opts.headers || {});
      return fetch(SUPABASE_URL + path, { method: opts.method || 'GET', headers: headers, body: opts.body });
    }).then(function (r) {
      if (r.status === 401 && !retried) return refresh().then(function () { return api(path, opts, true); });
      if (!r.ok) return r.text().then(function (t) { throw httpError(r.status, parseJson(t)); });
      if (opts.raw) return r;
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  var JSON_HEADERS = { 'Content-Type': 'application/json' };

  /* ═══════════ DATOS ═══════════ */
  var db = {
    list: function (parentId) {
      return api('/rest/v1/items?select=' + COLS + '&parent_id=' + (parentId ? 'eq.' + parentId : 'is.null'));
    },
    get: function (id) {
      return api('/rest/v1/items?select=*&id=eq.' + id).then(function (r) { return r && r[0]; });
    },
    search: function (q) {
      return api('/rest/v1/items?select=' + COLS + '&search=wfts(spanish).' + encodeURIComponent(q) + '&limit=60');
    },
    insert: function (row) {
      return api('/rest/v1/items?select=' + COLS, {
        method: 'POST', headers: Object.assign({ Prefer: 'return=representation' }, JSON_HEADERS), body: JSON.stringify(row)
      }).then(function (r) { return r[0]; });
    },
    update: function (id, patch) {
      return api('/rest/v1/items?id=eq.' + id, {
        method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, JSON_HEADERS), body: JSON.stringify(patch)
      });
    },
    remove: function (id) {
      return api('/rest/v1/items?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    },
    ancestors: function (id) {
      return api('/rest/v1/rpc/item_ancestors', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ target: id }) });
    },
    subtreeFiles: function (id) {
      return api('/rest/v1/rpc/item_subtree_files', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ root: id }) });
    }
  };

  var encPath = function (p) { return p.split('/').map(encodeURIComponent).join('/'); };
  var storage = {
    /* XHR en lugar de fetch: es la única forma de tener progreso de subida */
    upload: function (file, path, mime, onProgress) {
      return token().then(function (t) {
        return new Promise(function (resolve, reject) {
          var x = new XMLHttpRequest();
          x.open('POST', SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + encPath(path));
          x.setRequestHeader('apikey', SUPABASE_KEY);
          x.setRequestHeader('Authorization', 'Bearer ' + t);
          x.setRequestHeader('Content-Type', mime);
          x.setRequestHeader('x-upsert', 'false');
          x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
          x.onload = function () {
            if (x.status >= 200 && x.status < 300) resolve();
            else reject(httpError(x.status, parseJson(x.responseText), 'No se ha podido subir'));
          };
          x.onerror = function () { reject(new Error('Sin conexión')); };
          x.send(file);
        });
      });
    },
    blob: function (path) {
      return api('/storage/v1/object/authenticated/' + BUCKET + '/' + encPath(path), { raw: true })
        .then(function (r) { return r.blob(); });
    },
    remove: function (paths) {
      var chunks = [];
      for (var i = 0; i < paths.length; i += 100) chunks.push(paths.slice(i, i + 100));
      return Promise.all(chunks.map(function (c) {
        return api('/storage/v1/object/' + BUCKET, { method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({ prefixes: c }) });
      }));
    }
  };

  /* ═══════════ UTILIDADES DE INTERFAZ ═══════════ */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;          // solo para cadenas propias o ya escapadas
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  var ICONS = {
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14.5 3.5v4h4M9 12h6M9 15.5h6"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14.5 3.5v4h4"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 2.5-2.5L20 19"/></svg>'
  };
  function icon(item) {
    var k = item.kind === 'file' && /^image\//.test(item.mime || '') ? 'image' : item.kind;
    return h('span', { class: 'ap-ico ap-ico--' + k, 'aria-hidden': 'true', html: ICONS[k] });
  }

  var dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  var dateTimeFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  function fmtSize(n) {
    if (n == null) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' MB';
  }
  function ext(name) { var m = /\.([a-z0-9]{1,8})$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function typeLabel(item) {
    if (item.kind === 'folder') return 'Carpeta';
    if (item.kind === 'note') return 'Nota';
    if (/^image\//.test(item.mime || '')) return 'Imagen';
    var e = ext(item.title);
    return e ? e.toUpperCase() : 'Archivo';
  }
  var DRIVE = '#/archivos';            // raíz del drive; #/ es la vista «Hoy»
  function route(kind, id) { return '#/' + kind + '/' + id; }
  function hrefFor(item) {
    return route(item.kind === 'folder' ? 'carpeta' : item.kind === 'note' ? 'nota' : 'archivo', item.id);
  }
  function parentHref(item) { return item.parent_id ? route('carpeta', item.parent_id) : DRIVE; }

  function setStatus(msg, isError) {
    els.status.textContent = msg || '';
    els.status.classList.toggle('is-error', !!isError);
  }
  function fail(err) {
    if (err && err.auth) return lockScreen('Tu sesión ha caducado. Vuelve a entrar.');
    console.warn('[área privada]', err);
    setStatus('Algo ha fallado: ' + ((err && err.message) || 'error desconocido') + '. Inténtalo de nuevo.', true);
  }

  /* blob: URLs de la vista actual, se liberan al cambiar de vista */
  var blobs = [];
  function blobUrl(b) { var u = URL.createObjectURL(b); blobs.push(u); return u; }
  function releaseBlobs() { blobs.forEach(URL.revokeObjectURL); blobs = []; }

  /* ── Diálogo: pide un texto (input:true) o confirma. Resuelve con el texto, true o null ── */
  function ask(o) {
    return new Promise(function (resolve) {
      els.dTitle.textContent = o.title;
      els.dText.textContent = o.text || '';
      els.dText.hidden = !o.text;
      els.dField.hidden = !o.input;
      els.dInput.value = o.value || '';
      els.dInput.required = !!o.input;
      els.dOk.textContent = o.ok || 'Aceptar';
      els.dOk.classList.toggle('btn-danger', !!o.danger);
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        els.dForm.removeEventListener('submit', onSubmit);
        els.dCancel.removeEventListener('click', onCancel);
        els.dialog.removeEventListener('close', onClose);
        if (els.dialog.open) els.dialog.close();
        resolve(v);
      }
      function onSubmit(e) {
        e.preventDefault();
        if (!o.input) return finish(true);
        var v = els.dInput.value.trim();
        if (!v) { els.dInput.focus(); return; }
        finish(v.slice(0, 200));
      }
      function onCancel() { finish(null); }
      function onClose() { finish(null); }
      els.dForm.addEventListener('submit', onSubmit);
      els.dCancel.addEventListener('click', onCancel);
      els.dialog.addEventListener('close', onClose);
      els.dialog.showModal();
      if (o.input) { els.dInput.focus(); els.dInput.select(); } else els.dCancel.focus();
    });
  }

  /* ── Formularios de las pestañas (ctx.ui): campos con etiqueta y diálogo con validación ──
     Usan las clases de formulario comunes (apf-field, apf-grid, apf-select). */
  function field(id, labelText, el, opts) {
    opts = opts || {};
    el.id = id;
    return h('div', { class: 'apf-field' + (opts.wide ? ' apf-wide' : '') }, [
      h('label', { class: 'ap-field-label', for: id, text: labelText }), el,
      opts.hint ? h('p', { class: 'apf-hint', text: opts.hint }) : null
    ]);
  }
  function input(type, value, attrs) { return h('input', Object.assign({ type: type, value: value == null ? '' : value, autocomplete: 'off' }, attrs || {})); }
  function select(options, value, empty) {
    return h('select', { class: 'apf-select' }, (empty ? [h('option', { value: '', text: empty })] : []).concat(options.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
      return h('option', { value: v, text: l, selected: v === value });
    })));
  }
  function area(value, rows, max) { return h('textarea', { rows: String(rows), maxlength: String(max), text: value || '' }); }
  /* Diálogo de formulario. fields: [nodos]; onSubmit(): Promise (rechaza con Error para mostrar mensaje) */
  function formDialog(title, okText, fields, onSubmit, focusEl) {
    var msg = h('p', { class: 'ap-msg', 'aria-live': 'assertive' });
    var ok = h('button', { type: 'submit', class: 'btn btn-primary', text: okText });
    var dlg;
    var form = h('form', { method: 'dialog', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      ok.disabled = true;
      msg.classList.remove('is-error');
      msg.textContent = 'Guardando…';
      Promise.resolve().then(onSubmit).then(function () { dlg.close(); }).catch(function (err) {
        ok.disabled = false;
        if (err && err.auth) { dlg.close(); return fail(err); }
        msg.textContent = (err && err.message) || 'No se ha podido guardar.';
        msg.classList.add('is-error');
        if (err && err.field) err.field.focus();
      });
    } }, [
      h('h2', { class: 'ap-dialog-title', id: 'ap-form-title', text: title }),
      h('div', { class: 'apf-grid' }, fields),
      msg,
      h('div', { class: 'ap-dialog-actions' }, [
        h('button', { type: 'button', class: 'btn btn-outline', text: 'Cancelar', onclick: function () { dlg.close(); } }), ok
      ])
    ]);
    dlg = h('dialog', { class: 'ap-dialog apf-dialog', 'aria-labelledby': 'ap-form-title', onclose: function () { dlg.remove(); } }, [form]);
    document.body.appendChild(dlg);
    dlg.showModal();
    if (focusEl) focusEl.focus();
  }
  function invalid(text, el) { var e = new Error(text); e.field = el; return e; }
  var ui = { field: field, input: input, select: select, area: area, formDialog: formDialog, invalid: invalid };

  /* ═══════════ MARKDOWN (subconjunto seguro) ═══════════
     Primero se escapa TODO el HTML; después se da formato. Solo se permiten
     enlaces http(s) y mailto. Títulos: # → h3 (la página ya usa h1 y h2). */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function inline(s) {
    var codes = [];
    s = s.replace(/`([^`]+)`/g, function (m, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, function (m, t, u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + t + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return '<code>' + codes[+i] + '</code>'; });
  }
  var LIST = /^\s*([-*+]|\d+[.)])\s+/;
  function md(src) {
    var lines = esc(src || '').split(/\r?\n/), out = [], para = [], i = 0;
    function flush() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    while (i < lines.length) {
      var l = lines[i], m;
      if (/^\s*```/.test(l)) {
        flush();
        var code = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push('<pre><code>' + code.join('\n') + '</code></pre>');
      } else if ((m = /^(#{1,4})\s+(.+)$/.exec(l))) {
        flush();
        var lv = m[1].length + 2;
        out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>');
        i++;
      } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
        flush(); out.push('<hr>'); i++;
      } else if (LIST.test(l)) {
        flush();
        var ordered = /^\s*\d/.test(l), items = [];
        while (i < lines.length && LIST.test(lines[i])) {
          var t = lines[i++].replace(LIST, ''), cb = /^\[( |x)\]\s+(.*)$/i.exec(t);
          if (cb) {
            var on = cb[1] !== ' ';
            items.push('<li class="ap-check' + (on ? ' is-done' : '') + '"><span class="ap-check-box" aria-hidden="true"></span>' +
              '<span class="sr-only">' + (on ? 'Hecho: ' : 'Pendiente: ') + '</span>' + inline(cb[2]) + '</li>');
          } else items.push('<li>' + inline(t) + '</li>');
        }
        out.push((ordered ? '<ol>' : '<ul>') + items.join('') + (ordered ? '</ol>' : '</ul>'));
      } else if (/^&gt;\s?/.test(l)) {
        flush();
        var q = [];
        while (i < lines.length && /^&gt;\s?/.test(lines[i])) q.push(lines[i++].replace(/^&gt;\s?/, ''));
        out.push('<blockquote><p>' + inline(q.join(' ')) + '</p></blockquote>');
      } else if (!l.trim()) {
        flush(); i++;
      } else {
        para.push(l.trim()); i++;
      }
    }
    flush();
    return out.join('');
  }

  /* ═══════════ VISTAS ═══════════ */
  var current = { folderId: null };   // carpeta destino de «+ Carpeta», «+ Nota» y las subidas
  var dirty = false;                  // nota con cambios sin guardar
  var renderSeq = 0;

  /* Pestañas que viven en su propio archivo (area-privada-<nombre>.js). Cada archivo
     define window[global] = { render(ctx) → Promise<paint> } y se carga la primera vez
     que se abre su pestaña: la ruta del archivo (con su ?v=) está en un
     <link rel="prefetch" data-ap-module="…"> de area-privada.html. */
  var MODULES = {
    hoy:         { global: 'APHoy',         title: 'Hoy' },
    calendario:  { global: 'APCalendario',  title: 'Calendario' },
    entrevistas: { global: 'APEntrevistas', title: 'Entrevistas' },
    portfolio:   { global: 'APPortfolio',   title: 'Portfolio' },
    fichero:     { global: 'APFichero',     title: 'Fichero' },
    configuracion: { global: 'APConfiguracion', title: 'Configuración' }
  };
  var MODULE_ROUTE = new RegExp('^#/(' + Object.keys(MODULES).join('|') + ')(?:/(.*))?$');
  var loading = {};
  function loadModule(name) {
    var g = MODULES[name].global;
    if (window[g]) return Promise.resolve(window[g]);
    if (!loading[name]) {
      loading[name] = new Promise(function (resolve, reject) {
        var link = document.querySelector('link[data-ap-module="' + name + '"]');
        var s = document.createElement('script');
        s.src = link ? link.href : './area-privada-' + name + '.js';
        s.onload = function () { window[g] ? resolve(window[g]) : reject(new Error('Módulo vacío: ' + name)); };
        s.onerror = function () { delete loading[name]; s.remove(); reject(new Error('No se ha podido cargar la sección. Revisa la conexión.')); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }

  function parseRoute() {
    var hash = location.hash;
    if (!hash || hash === '#' || hash === '#/') return { kind: 'module', name: 'hoy', arg: '' };
    var mod = MODULE_ROUTE.exec(hash);
    if (mod) return { kind: 'module', name: mod[1], arg: mod[2] ? decodeURIComponent(mod[2]) : '' };
    var m = /^#\/(carpeta|nota|archivo|buscar)\/(.+)$/.exec(hash);
    if (!m) return { kind: 'root' };
    var arg = decodeURIComponent(m[2]);
    if (m[1] === 'buscar') return { kind: 'search', q: arg };
    if (!UUID.test(arg)) return { kind: 'root' };
    return { kind: m[1], id: arg };
  }

  function render() {
    if (!session) return;
    var seq = ++renderSeq, r = parseRoute();
    releaseBlobs();
    dirty = false;
    setStatus('Cargando…');
    var job, isModule = r.kind === 'module', tab = isModule ? r.name : 'archivos';
    // la barra del drive (buscar, + Carpeta, subir) y las migas solo tienen sentido en «Archivos y notas»
    els.toolbar.hidden = els.crumbsNav.hidden = isModule;
    [].forEach.call(els.tabs, function (a) {
      if (a.getAttribute('data-tab') !== tab) return a.removeAttribute('aria-current');
      a.setAttribute('aria-current', 'page');
      // en móvil la barra se desplaza en horizontal: que la pestaña activa quede a la vista (sin mover la página)
      var bar = a.parentNode, r = a.getBoundingClientRect(), b = bar.getBoundingClientRect();
      if (r.left < b.left || r.right > b.right) bar.scrollLeft += r.left - b.left - 16;
    });
    els.title.textContent = isModule ? MODULES[r.name].title : 'Archivos y notas';
    if (isModule) {
      job = loadModule(r.name).then(function (mod) {
        return mod.render({
          api: api, h: h, ui: ui, ask: ask, setStatus: setStatus, fail: fail, view: els.view, arg: r.arg,
          isCurrent: function () { return seq === renderSeq; }
        });
      });
    }
    else if (r.kind === 'root') job = renderFolder(null);
    else if (r.kind === 'carpeta') job = renderFolder(r.id);
    else if (r.kind === 'search') job = renderSearch(r.q);
    else job = renderItem(r.kind, r.id);
    job.then(function (paint) {
      if (seq !== renderSeq) return;      // llegó otra navegación mientras tanto
      setStatus('');
      paint();
    }).catch(fail);
  }

  function crumbs(chain, linkLast) {
    els.crumbs.textContent = '';
    var all = [{ id: null, title: 'Inicio' }].concat(chain || []);
    all.forEach(function (c, i) {
      var last = i === all.length - 1;
      els.crumbs.appendChild(h('li', null, [
        last && !linkLast
          ? h('span', { 'aria-current': 'page', text: c.title })
          : h('a', { href: c.id ? route('carpeta', c.id) : DRIVE, text: c.title })
      ]));
    });
  }

  function sortItems(list) {
    var rank = { folder: 0, note: 1, file: 2 };
    return list.sort(function (a, b) {
      return (rank[a.kind] - rank[b.kind]) || a.title.localeCompare(b.title, 'es', { sensitivity: 'base', numeric: true });
    });
  }

  function table(items, caption) {
    var body = h('tbody');
    items.forEach(function (it) {
      body.appendChild(h('tr', null, [
        h('td', { class: 'ap-col-name' }, [h('a', { class: 'ap-name', href: hrefFor(it) }, [icon(it), h('span', { text: it.title })])]),
        h('td', { class: 'ap-col-type', text: typeLabel(it) }),
        h('td', { class: 'ap-col-date' }, [h('time', { datetime: it.updated_at, text: dateFmt.format(new Date(it.updated_at)) })]),
        h('td', { class: 'ap-col-size', text: it.kind === 'file' ? fmtSize(it.size_bytes) : '—' }),
        h('td', { class: 'ap-col-act' }, [
          h('button', { type: 'button', class: 'ap-link-btn', 'aria-label': 'Renombrar «' + it.title + '»', text: 'Renombrar', onclick: function () { renameItem(it); } }),
          h('button', { type: 'button', class: 'ap-link-btn ap-link-btn--danger', 'aria-label': 'Eliminar «' + it.title + '»', text: 'Eliminar', onclick: function () { deleteItem(it); } })
        ])
      ]));
    });
    return h('div', { class: 'ap-table-wrap' }, [h('table', { class: 'ap-table' }, [
      h('caption', { class: 'sr-only', text: caption }),
      h('thead', null, [h('tr', null, [
        h('th', { scope: 'col', class: 'ap-col-name', text: 'Nombre' }),
        h('th', { scope: 'col', class: 'ap-col-type', text: 'Tipo' }),
        h('th', { scope: 'col', class: 'ap-col-date', text: 'Modificado' }),
        h('th', { scope: 'col', class: 'ap-col-size', text: 'Tamaño' }),
        h('th', { scope: 'col', class: 'ap-col-act' }, [h('span', { class: 'sr-only', text: 'Acciones' })])
      ])]),
      body
    ])]);
  }

  function empty(title, text) {
    return h('div', { class: 'ap-empty' }, [h('p', { class: 'ap-empty-title', text: title }), h('p', { text: text })]);
  }

  function renderFolder(id) {
    return Promise.all([db.list(id), id ? db.ancestors(id) : Promise.resolve([])]).then(function (res) {
      var items = sortItems(res[0] || []), chain = res[1] || [];
      if (id && !chain.length) { location.replace(DRIVE); return function () {}; }   // no existe o no es accesible
      return function () {
        current.folderId = id;
        crumbs(chain, false);
        els.view.textContent = '';
        var name = chain.length ? chain[chain.length - 1].title : 'Inicio';
        els.view.appendChild(items.length
          ? table(items, 'Contenido de ' + name)
          : empty(id ? 'Esta carpeta está vacía' : 'Todavía no hay nada aquí',
                  'Crea una carpeta o una nota, o arrastra archivos a esta ventana para subirlos.'));
      };
    });
  }

  function renderSearch(q) {
    els.search.value = q;
    return db.search(q).then(function (items) {
      return function () {
        current.folderId = null;
        els.crumbs.textContent = '';
        els.crumbs.appendChild(h('li', null, [h('a', { href: DRIVE, text: 'Inicio' })]));
        els.crumbs.appendChild(h('li', null, [h('span', { 'aria-current': 'page', text: 'Búsqueda: «' + q + '»' })]));
        els.view.textContent = '';
        els.view.appendChild(items && items.length
          ? table(sortItems(items), 'Resultados de búsqueda')
          : empty('Sin resultados para «' + q + '»', 'Prueba con otra palabra. La búsqueda mira títulos y el texto de las notas.'));
        setTimeout(function () { setStatus(items.length + (items.length === 1 ? ' resultado' : ' resultados')); }, 0);
      };
    });
  }

  function renderItem(kind, id) {
    return Promise.all([db.get(id), db.ancestors(id)]).then(function (res) {
      var item = res[0], chain = res[1] || [];
      var expected = kind === 'nota' ? 'note' : 'file';
      if (!item || item.kind !== expected) { location.replace(DRIVE); return function () {}; }
      return function () {
        current.folderId = item.parent_id;
        crumbs(chain, false);
        els.view.textContent = '';
        els.view.appendChild(item.kind === 'note' ? noteView(item) : fileView(item));
      };
    });
  }

  function docBar(item, extra) {
    return h('div', { class: 'ap-doc-bar' }, [
      h('a', { class: 'ap-backlink', href: parentHref(item) }, [h('span', { 'aria-hidden': 'true', text: '← ' }), 'Volver a la carpeta']),
      h('div', { class: 'ap-doc-actions' }, (extra || []).concat([
        h('button', { type: 'button', class: 'ap-tool', text: 'Renombrar', onclick: function () { renameItem(item); } }),
        h('button', { type: 'button', class: 'ap-tool ap-tool--danger', text: 'Eliminar', onclick: function () { deleteItem(item); } })
      ]))
    ]);
  }

  /* ── Nota: lectura y edición ── */
  var editNext = null;   // id de la nota recién creada: se abre directamente en edición
  function noteView(item) {
    var wrap = h('article', { class: 'ap-doc', 'aria-labelledby': 'ap-doc-title' });
    function showRead() {
      dirty = false;
      wrap.textContent = '';
      wrap.appendChild(docBar(item, [h('button', { type: 'button', class: 'ap-tool ap-tool--dark', text: 'Editar', onclick: showEdit })]));
      wrap.appendChild(h('h2', { class: 'ap-doc-title', id: 'ap-doc-title', text: item.title }));
      wrap.appendChild(h('p', { class: 'ap-doc-meta', text: 'Actualizada el ' + dateTimeFmt.format(new Date(item.updated_at)) }));
      wrap.appendChild(item.body.trim()
        ? h('div', { class: 'ap-md', html: md(item.body) })
        : empty('Nota vacía', 'Pulsa «Editar» para escribir. Admite formato Markdown.'));
    }
    function showEdit() {
      wrap.textContent = '';
      var ta = h('textarea', { id: 'ap-editor', class: 'ap-editor', spellcheck: 'true', 'aria-describedby': 'ap-editor-help' });
      ta.value = item.body;
      ta.addEventListener('input', function () { dirty = ta.value !== item.body; });
      function save() {
        var body = ta.value;
        saveBtn.disabled = true;
        setStatus('Guardando…');
        db.update(item.id, { body: body }).then(function () {
          item.body = body;
          item.updated_at = new Date().toISOString();
          setStatus('Guardado');
          showRead();
        }).catch(function (e) { saveBtn.disabled = false; fail(e); });
      }
      var saveBtn = h('button', { type: 'button', class: 'btn btn-primary', text: 'Guardar', onclick: save });
      ta.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      });
      wrap.appendChild(h('div', { class: 'ap-doc-bar' }, [
        h('h2', { class: 'ap-doc-title ap-doc-title--sm', id: 'ap-doc-title', text: item.title }),
        h('div', { class: 'ap-doc-actions' }, [
          h('button', { type: 'button', class: 'btn btn-outline', text: 'Cancelar', onclick: function () {
            if (dirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
            showRead();
          } }),
          saveBtn
        ])
      ]));
      wrap.appendChild(h('label', { class: 'ap-field-label', for: 'ap-editor', text: 'Contenido' }));
      wrap.appendChild(ta);
      wrap.appendChild(h('p', { class: 'ap-help', id: 'ap-editor-help', html:
        'Markdown: <code>#</code> títulos · <code>-</code> listas · <code>- [ ]</code> tareas · <code>**negrita**</code> · ' +
        '<code>*cursiva*</code> · <code>`código`</code> · <code>[texto](https://…)</code> · <code>```</code> bloques. Ctrl + S guarda.' }));
      ta.focus();
    }
    if (editNext === item.id) { editNext = null; setTimeout(showEdit, 0); }
    showRead();
    return wrap;
  }

  /* ── Archivo: vista previa y descarga ── */
  var TEXT_EXT = ['txt', 'md', 'csv', 'json', 'sql', 'dax', 'm', 'py', 'log'];
  function previewKind(item) {
    var mime = item.mime || '', e = ext(item.title);
    if (/^image\//.test(mime)) return 'image';
    if (mime === 'application/pdf' || e === 'pdf') return 'pdf';
    if (/^text\//.test(mime) || mime === 'application/json' || TEXT_EXT.indexOf(e) > -1) return e === 'md' ? 'md' : 'text';
    return null;
  }
  function download(item) {
    setStatus('Preparando descarga…');
    storage.blob(item.file_path).then(function (b) {
      var a = h('a', { href: blobUrl(b), download: item.title });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus('Descarga lista: ' + item.title);
    }).catch(fail);
  }
  function fileView(item) {
    var kind = previewKind(item), box = h('div', { class: 'ap-preview' });
    function load() {
      box.textContent = '';
      box.appendChild(h('p', { class: 'ap-preview-msg', text: 'Cargando vista previa…' }));
      storage.blob(item.file_path).then(function (b) {
        if (kind === 'text' || kind === 'md') {
          return b.slice(0, 1024 * 1024).text().then(function (t) {
            box.textContent = '';
            box.appendChild(kind === 'md' ? h('div', { class: 'ap-md', html: md(t) }) : h('pre', { class: 'ap-pre', text: t, tabindex: '0' }));
          });
        }
        box.textContent = '';
        if (kind === 'image') box.appendChild(h('img', { src: blobUrl(b), alt: item.title }));
        else box.appendChild(h('iframe', { src: blobUrl(new Blob([b], { type: 'application/pdf' })), title: 'Vista previa de ' + item.title }));
      }).catch(function (e) {
        box.textContent = '';
        box.appendChild(h('p', { class: 'ap-preview-msg', text: 'No se ha podido cargar la vista previa.' }));
        fail(e);
      });
    }
    if (!kind) box.appendChild(h('p', { class: 'ap-preview-msg', text: 'Este tipo de archivo no tiene vista previa. Descárgalo para abrirlo.' }));
    else if ((item.size_bytes || 0) > PREVIEW_MAX) {
      box.appendChild(h('p', { class: 'ap-preview-msg' }, [
        'El archivo pesa ' + fmtSize(item.size_bytes) + '. ',
        h('button', { type: 'button', class: 'ap-link-btn', text: 'Cargar vista previa', onclick: load })
      ]));
    } else load();

    return h('article', { class: 'ap-doc', 'aria-labelledby': 'ap-doc-title' }, [
      docBar(item, [h('button', { type: 'button', class: 'ap-tool ap-tool--dark', text: 'Descargar', onclick: function () { download(item); } })]),
      h('h2', { class: 'ap-doc-title', id: 'ap-doc-title', text: item.title }),
      h('p', { class: 'ap-doc-meta', text: typeLabel(item) + ' · ' + fmtSize(item.size_bytes) + ' · subido el ' + dateTimeFmt.format(new Date(item.created_at)) }),
      box
    ]);
  }

  /* ═══════════ ACCIONES ═══════════ */
  function newFolder() {
    ask({ title: 'Nueva carpeta', input: true, ok: 'Crear' }).then(function (name) {
      if (!name) return;
      return db.insert({ kind: 'folder', title: name, parent_id: current.folderId }).then(function (it) {
        location.hash = route('carpeta', it.id);
      });
    }).catch(fail);
  }
  function newNote() {
    ask({ title: 'Nueva nota', input: true, ok: 'Crear' }).then(function (name) {
      if (!name) return;
      return db.insert({ kind: 'note', title: name, parent_id: current.folderId }).then(function (it) {
        editNext = it.id;
        location.hash = route('nota', it.id);
      });
    }).catch(fail);
  }
  function renameItem(item) {
    ask({ title: 'Renombrar', input: true, value: item.title, ok: 'Guardar' }).then(function (name) {
      if (!name || name === item.title) return;
      return db.update(item.id, { title: name }).then(function () { setStatus('Renombrado'); render(); });
    }).catch(fail);
  }
  function deleteItem(item) {
    var isFolder = item.kind === 'folder';
    ask({
      title: '¿Eliminar «' + item.title + '»?',
      text: isFolder ? 'Se borrará la carpeta y todo lo que contiene. No se puede deshacer.' : 'No se puede deshacer.',
      ok: 'Eliminar', danger: true
    }).then(function (ok) {
      if (!ok) return;
      setStatus('Eliminando…');
      var paths = item.kind === 'note' ? Promise.resolve([]) : db.subtreeFiles(item.id);
      return paths.then(function (p) {
        return db.remove(item.id).then(function () { return p && p.length ? storage.remove(p) : null; });
      }).then(function () {
        setStatus('Eliminado: ' + item.title);
        var viewing = parseRoute().id === item.id;
        if (viewing) location.hash = parentHref(item); else render();
      });
    }).catch(fail);
  }

  /* ── Subidas ── */
  var MIME_BY_EXT = { md: 'text/markdown', csv: 'text/csv', txt: 'text/plain', json: 'application/json', pdf: 'application/pdf' };
  function safeName(name) {
    var clean = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return (clean || 'archivo').slice(-120);
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
  function uploadFiles(fileList) {
    var files = [].slice.call(fileList || []);
    if (!files.length) return;
    var parent = current.folderId, ok = 0, pending = files.length;
    files.forEach(function (f) {
      var bar = h('span', { class: 'ap-up-bar' }), row = h('li', { class: 'ap-up' }, [
        h('span', { class: 'ap-up-name', text: f.name }), h('span', { class: 'ap-up-track', 'aria-hidden': 'true' }, [bar]),
        h('span', { class: 'ap-up-state', text: '0 %' })
      ]);
      var state = row.lastChild;
      els.uploads.appendChild(row);
      function end(msg, isErr) {
        state.textContent = msg;
        row.classList.add(isErr ? 'is-error' : 'is-done');
        if (!isErr) setTimeout(function () { row.remove(); }, 2500);
        if (--pending === 0) {
          setStatus(ok + ' de ' + files.length + (files.length === 1 ? ' archivo subido' : ' archivos subidos'), ok < files.length);
          if (current.folderId === parent) render();
        }
      }
      if (f.size > MAX_FILE) return end('Supera los 50 MB', true);
      var path = uuid() + '/' + safeName(f.name);
      var mime = f.type || MIME_BY_EXT[ext(f.name)] || 'application/octet-stream';
      storage.upload(f, path, mime, function (p) {
        bar.style.width = Math.round(p * 100) + '%';
        state.textContent = Math.round(p * 100) + ' %';
      }).then(function () {
        return db.insert({ kind: 'file', title: f.name.slice(0, 200), parent_id: parent, file_path: path, mime: mime, size_bytes: f.size })
          .catch(function (e) { return storage.remove([path]).then(function () { throw e; }, function () { throw e; }); });
      }).then(function () { ok++; end('Subido'); }, function (e) {
        end(e.status === 415 || /mime|type/i.test(e.message) ? 'Tipo de archivo no permitido' : 'Error: ' + e.message, true);
        if (e.auth) fail(e);
      });
    });
  }

  /* ═══════════ ACCESO ═══════════ */
  var idleTimer = null;
  function bumpIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { logout('Sesión cerrada tras 30 minutos sin actividad.'); }, IDLE_MS);
  }
  var IDLE_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

  function unlockScreen() {
    els.lock.hidden = true;
    els.app.hidden = false;
    els.user.textContent = session.email || '';
    IDLE_EVENTS.forEach(function (ev) { document.addEventListener(ev, bumpIdle, { passive: true }); });
    bumpIdle();
    render();
    els.title.focus();
  }
  function lockScreen(msg) {
    writeSession(null);
    clearTimeout(idleTimer);
    IDLE_EVENTS.forEach(function (ev) { document.removeEventListener(ev, bumpIdle); });
    releaseBlobs();
    dirty = false;
    els.view.textContent = '';
    els.crumbs.textContent = '';
    els.uploads.textContent = '';
    setStatus('');
    els.app.hidden = true;
    els.lock.hidden = false;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    els.loginMsg.textContent = msg || '';
    els.loginMsg.classList.remove('is-error');
    els.pass.focus();
  }
  function logout(msg) {
    var t = session && session.access_token;
    if (t) authPost('logout', {}, t).catch(function () {});
    lockScreen(msg || 'Has cerrado sesión.');
  }

  var fails = 0;
  function loginMessage(text, isError) {
    els.loginMsg.textContent = text;
    els.loginMsg.classList.toggle('is-error', !!isError);
    els.pass.setAttribute('aria-invalid', isError ? 'true' : 'false');
  }
  els.form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!CONFIGURED) return loginMessage('El área privada todavía se está configurando.', true);
    var pw = els.pass.value;
    if (!pw) { loginMessage('Escribe la contraseña.', true); els.pass.focus(); return; }
    els.loginBtn.disabled = true;
    loginMessage('Comprobando…');
    authPost('token?grant_type=password', { email: OWNER_EMAIL, password: pw }).then(function (d) {
      fails = 0;
      writeSession(toSession(d));
      els.pass.value = '';
      loginMessage('');
      els.loginBtn.disabled = false;
      unlockScreen();
    }).catch(function (err) {
      fails++;
      loginMessage(
        err.status === 400 || err.status === 401 ? 'Contraseña incorrecta.'
          : err.status === 429 ? 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
          : 'No se ha podido conectar. Revisa la conexión e inténtalo de nuevo.', true);
      els.pass.select();
      // espera creciente entre intentos (Supabase además limita por IP)
      setTimeout(function () { els.loginBtn.disabled = false; }, Math.min(fails * 1000, 10000));
    });
  });

  els.toggle.addEventListener('click', function () {
    var show = els.pass.type === 'password';
    els.pass.type = show ? 'text' : 'password';
    els.toggle.setAttribute('aria-pressed', String(show));
    els.toggle.textContent = show ? 'Ocultar' : 'Mostrar';
  });

  /* ═══════════ EVENTOS ═══════════ */
  els.logout.addEventListener('click', function () {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Cerrar sesión igualmente?')) return;
    logout();
  });
  document.querySelector('[data-action="new-folder"]').addEventListener('click', newFolder);
  document.querySelector('[data-action="new-note"]').addEventListener('click', newNote);
  els.file.addEventListener('change', function () { uploadFiles(els.file.files); els.file.value = ''; });
  els.searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = els.search.value.trim();
    location.hash = q ? '#/buscar/' + encodeURIComponent(q) : DRIVE;
  });
  window.addEventListener('hashchange', function () {
    if (!session) return;
    if (parseRoute().kind !== 'search') els.search.value = '';
    render();
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  /* navegar dentro de la app con una nota a medias: pedir confirmación */
  els.app.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (a && dirty && !window.confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) e.preventDefault();
  }, true);

  /* Arrastrar y soltar archivos en cualquier parte de la app */
  var dragDepth = 0;
  function hasFiles(e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') > -1; }
  els.app.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; els.drop.hidden = false; });
  els.app.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
  els.app.addEventListener('dragleave', function () { if (--dragDepth <= 0) { dragDepth = 0; els.drop.hidden = true; } });
  els.app.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    els.drop.hidden = true;
    uploadFiles(e.dataTransfer.files);
  });

  /* ═══════════ ARRANQUE ═══════════ */
  readSession();
  if (session && CONFIGURED) unlockScreen();
})();
