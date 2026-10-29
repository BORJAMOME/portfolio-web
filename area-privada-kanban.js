/* ═══════════════════════════════════════════════
   area-privada-kanban.js: Centro de trabajo de «Hoy»
   ─────────────────────────────────────────────────
   Vistas: «Hoy» (foco del día), «Tablero» (Kanban) y «Archivo».
   Datos: tablas kb_* de supabase/kanban.sql (Supabase es la fuente de verdad).
   Lo monta area-privada-hoy.js encima de sus tarjetas de agenda.
   Mover tarjetas: arrastrar (ratón, lápiz; en táctil, desde el asa ⠿),
   Mayús + flechas con el teclado, o el botón «Mover a…» de cada tarjeta.
   La lógica pura (orden, límites, sugerencias, filtros) vive en `logic` y se prueba
   con tools/test-kanban.mjs sin navegador.
   ═══════════════════════════════════════════════ */
window.APKanban = (function () {
  'use strict';

  /* ═══════════ LÓGICA PURA ═══════════ */
  var DAY = 864e5;
  var ESTADOS = [
    { id: 'ideas', label: 'Ideas', vacio: 'Captura aquí lo que aún estás explorando.' },
    { id: 'pendiente', label: 'Pendiente', vacio: 'Trabajo definido que todavía no has decidido empezar.' },
    { id: 'en_curso', label: 'En curso', vacio: 'Lo que haces ahora. Mejor poco y terminado.' },
    { id: 'revision', label: 'En revisión', vacio: 'Pendiente de comprobar o de una decisión.' },
    { id: 'hecho', label: 'Hecho', vacio: 'Lo que termines aparecerá aquí.' }
  ];
  var PRIO = { 1: 'Baja', 2: 'Normal', 3: 'Alta', 4: 'Urgente' };
  var ESFUERZO = { 1: '≤ 1 h', 2: '½ día', 3: 'Varios días' };
  var DEFAULTS = { wip: { en_curso: 3, revision: 3 }, capacidad: 3 };
  var GAP = 1024, MIN_GAP = 1e-6;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toDay(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysUntil(key, now) {
    var t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((toDay(key) - t) / DAY);
  }
  function dueLabel(key, now) {
    var d = daysUntil(key, now);
    if (d < -1) return { text: 'Vencida hace ' + (-d) + ' días', tone: 'late', days: d };
    if (d === -1) return { text: 'Venció ayer', tone: 'late', days: d };
    if (d === 0) return { text: 'Vence hoy', tone: 'soon', days: d };
    if (d === 1) return { text: 'Vence mañana', tone: 'soon', days: d };
    return { text: 'Vence en ' + d + ' días', tone: d <= 7 ? 'soon' : 'far', days: d };
  }

  /* Posición de una tarjeta que se inserta en `index` de una columna ya ordenada (sin la tarjeta movida). */
  function insertPosition(others, index) {
    var prev = others[index - 1], next = others[index];
    if (!prev && !next) return GAP;
    if (!prev) return next.posicion - GAP;
    if (!next) return prev.posicion + GAP;
    return (prev.posicion + next.posicion) / 2;
  }
  function needsRenumber(others, index) {
    var prev = others[index - 1], next = others[index];
    return !!(prev && next && next.posicion - prev.posicion < MIN_GAP);
  }
  function byPos(a, b) { return (a.posicion - b.posicion) || (a.created_at < b.created_at ? -1 : 1); }
  function column(cards, estado) {
    return cards.filter(function (c) { return c.estado === estado && !c.archivada_en; }).sort(byPos);
  }
  /* Estado de un límite WIP. limit null/0 = sin límite. */
  function wipState(count, limit) {
    if (!limit) return { limit: 0, over: false, at: false };
    return { limit: limit, over: count > limit, at: count === limit };
  }

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  /* f: { q, proyecto ('' todos · 'none' sin proyecto · id), prioridad (0 = todas), bloqueadas (bool) } */
  function filterCards(cards, f, subs) {
    var q = norm(f.q);
    return cards.filter(function (c) {
      if (f.proyecto === 'none' && c.proyecto_id) return false;
      if (f.proyecto && f.proyecto !== 'none' && c.proyecto_id !== f.proyecto) return false;
      if (f.prioridad && c.prioridad !== f.prioridad) return false;
      if (f.bloqueadas && !c.bloqueada) return false;
      if (!q) return true;
      var hay = [c.titulo, c.notas, c.siguiente_paso, c.bloqueo, (c.etiquetas || []).join(' ')];
      ((subs && subs[c.id]) || []).forEach(function (s) { hay.push(s.titulo); });
      return norm(hay.join(' ')).indexOf(q) !== -1;
    });
  }

  /* Sugerencias de «qué toca». Heurística visible, no una verdad: cada punto lleva su motivo.
     Pesos: prioridad 0-3 · vencimiento 0-3 · ya empezada +1,5 (acabar antes de empezar) ·
     en revisión +1 · rápida +0,5 · -1 si ya hay tantas en curso como el límite. */
  function suggest(cards, now, o) {
    o = o || {};
    var inCourse = cards.filter(function (c) { return c.estado === 'en_curso' && !c.archivada_en; }).length;
    var limit = o.wipEnCurso || 0;
    var today = dayKey(now);
    return cards.filter(function (c) {
      return !c.archivada_en && !c.bloqueada && c.estado !== 'hecho' && c.estado !== 'ideas' && c.hoy_fecha !== today;
    }).map(function (c) {
      var score = c.prioridad - 1, why = [];
      if (c.prioridad >= 3) why.push('Prioridad ' + PRIO[c.prioridad].toLowerCase());
      if (c.fecha_limite) {
        var d = dueLabel(c.fecha_limite, now);
        if (d.days < 0) { score += 3; why.push(d.text.toLowerCase()); }
        else if (d.days <= 1) { score += 2; why.push(d.text.toLowerCase()); }
        else if (d.days <= 7) { score += 1; why.push(d.text.toLowerCase()); }
      }
      if (c.estado === 'en_curso') { score += 1.5; why.push('ya empezada'); }
      if (c.estado === 'revision') { score += 1; why.push('solo falta revisarla'); }
      if (c.esfuerzo === 1) { score += 0.5; why.push('rápida'); }
      if (c.estado === 'pendiente' && limit && inCourse >= limit) { score -= 1; why.push('ya tienes ' + inCourse + ' en curso'); }
      return { card: c, score: score, why: why };
    }).sort(function (a, b) { return (b.score - a.score) || byPos(a.card, b.card); });
  }

  function subProgress(list) {
    var done = (list || []).filter(function (s) { return s.hecho; }).length;
    return { done: done, total: (list || []).length };
  }
  function parseTags(s) {
    var seen = {}, out = [];
    String(s || '').split(',').forEach(function (t) {
      t = t.trim().replace(/\s+/g, ' ').slice(0, 30);
      if (t && !seen[t.toLowerCase()] && out.length < 8) { seen[t.toLowerCase()] = 1; out.push(t); }
    });
    return out;
  }

  /* Captura inteligente (local, sin IA): «Preparar DAX mañana #portfolio !alta @hoy»
     !urgente|!alta|!normal|!baja (o !4…!1) · #proyecto (si no hay proyecto con ese nombre, es etiqueta) · @hoy ·
     hoy, mañana, pasado mañana, lunes…domingo, dd/mm[/aaaa] (con «para», «el» o «antes del» delante si se quiere). */
  var WD = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  function addDays(now, n) { return dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)); }
  function parseCapture(text, projects, now) {
    var out = { titulo: '', prioridad: null, fecha_limite: null, proyecto_id: null, proyecto: null, etiquetas: [], hoy: false };
    var s = ' ' + String(text || '').replace(/\s+/g, ' ') + ' ';
    var PRE = '(?:(?:para|el|antes\\sdel?|hasta(?:\\sel)?)\\s)*';
    s = s.replace(/\s!(urgente|alta|normal|baja|[1-4])(?=\s)/i, function (m, p) {
      p = norm(p); out.prioridad = p === 'urgente' || p === '4' ? 4 : p === 'alta' || p === '3' ? 3 : p === 'baja' || p === '1' ? 1 : 2; return ' ';
    });
    s = s.replace(/\s@hoy(?=\s)/i, function () { out.hoy = true; return ' '; });
    s = s.replace(/\s#([^\s#!@]+)(?=\s)/g, function (m, w) {
      var n = norm(w).replace(/[-_]+/g, ' ');
      var p = n.length >= 2 ? (projects || []).filter(function (x) { var t = norm(x.titulo); return t === n || t.indexOf(n) === 0 || (n.length >= 4 && t.indexOf(n) > -1); })[0] : null;
      if (p && !out.proyecto_id) { out.proyecto_id = p.id; out.proyecto = p.titulo; }
      else if (out.etiquetas.length < 8 && out.etiquetas.indexOf(w) < 0) out.etiquetas.push(w);
      return ' ';
    });
    var rules = [
      [new RegExp('\\s' + PRE + 'pasado\\sma(?:ñ|n)ana(?=\\s)', 'i'), function () { return addDays(now, 2); }],
      [new RegExp('\\s' + PRE + '(hoy|ma(?:ñ|n)ana)(?=\\s)', 'i'), function (m, before) {
        if (/(?:^|\s)(?:la|esta|por)$/i.test(before.trim())) return null;      // «por la mañana», «esta mañana»: no es una fecha
        return addDays(now, norm(m[1]) === 'hoy' ? 0 : 1);
      }],
      [new RegExp('\\s' + PRE + '(lunes|martes|mi(?:é|e)rcoles|jueves|viernes|s(?:á|a)bado|domingo)(?=\\s)', 'i'), function (m) {
        var d = (WD.indexOf(norm(m[1])) - now.getDay() + 7) % 7; return addDays(now, d || 7);
      }],
      [new RegExp('\\s' + PRE + '(\\d{1,2})[/-](\\d{1,2})(?:[/-](\\d{2,4}))?(?=\\s)', 'i'), function (m) {
        var d = +m[1], mo = +m[2], y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
        var dt = new Date(y, mo - 1, d);
        if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
        if (!m[3] && dayKey(dt) < dayKey(now)) dt = new Date(y + 1, mo - 1, d);
        return dayKey(dt);
      }]
    ];
    for (var i = 0; i < rules.length && !out.fecha_limite; i++) {
      var m = rules[i][0].exec(s);
      if (m) { var v = rules[i][1](m, s.slice(0, m.index)); if (v) { out.fecha_limite = v; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); } }
    }
    out.titulo = s.replace(/\s+/g, ' ').trim();
    return out;
  }

  var logic = {
    ESTADOS: ESTADOS, PRIO: PRIO, DEFAULTS: DEFAULTS, dayKey: dayKey, daysUntil: daysUntil, dueLabel: dueLabel,
    insertPosition: insertPosition, needsRenumber: needsRenumber, column: column, wipState: wipState,
    filterCards: filterCards, suggest: suggest, subProgress: subProgress, parseTags: parseTags, parseCapture: parseCapture
  };

  /* ═══════════ INTERFAZ ═══════════ */
  var dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  var ESTADO_LABEL = {}; ESTADOS.forEach(function (e) { ESTADO_LABEL[e.id] = e.label; });
  var JSON_H = { 'Content-Type': 'application/json' };
  var SV = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
  var ICON = {
    grip: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5.5" cy="3.5" r="1.2"/><circle cx="10.5" cy="3.5" r="1.2"/><circle cx="5.5" cy="8" r="1.2"/><circle cx="10.5" cy="8" r="1.2"/><circle cx="5.5" cy="12.5" r="1.2"/><circle cx="10.5" cy="12.5" r="1.2"/></svg>',
    next: SV + '<path d="M3 8h10M9 4l4 4-4 4"/></svg>',
    plus: SV + '<path d="M8 3v10M3 8h10"/></svg>',
    // estados: el relleno crece con el avance (forma + color + texto: nunca solo color)
    st_ideas: SV + '<circle cx="8" cy="8" r="6" stroke-dasharray="2.6 2.1"/></svg>',
    st_pendiente: SV + '<circle cx="8" cy="8" r="6"/></svg>',
    st_en_curso: SV + '<circle cx="8" cy="8" r="6"/><path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" stroke="none"/></svg>',
    st_revision: SV + '<circle cx="8" cy="8" r="6"/><path d="M8 4.5a3.5 3.5 0 1 1-3.5 3.5H8z" fill="currentColor" stroke="none"/></svg>',
    st_hecho: SV + '<circle cx="8" cy="8" r="6.6" fill="currentColor" stroke="none"/><path d="M5.2 8.3l1.9 1.9 3.7-3.9" stroke="#fff" stroke-width="1.8"/></svg>',
    // conceptos
    idea: SV + '<path d="M6.2 12.4h3.6M6.7 14.3h2.6M8 1.9a4.1 4.1 0 0 0-2.5 7.4c.5.4.7 1 .7 1.6h3.6c0-.6.2-1.2.7-1.6A4.1 4.1 0 0 0 8 1.9z"/></svg>',
    proyecto: SV + '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.4"/></svg>',
    pasos: SV + '<path d="M7 4.5h6.5M7 8h6.5M7 11.5h6.5M2.4 4.4l.9.9 1.5-1.7M2.4 7.9l.9.9 1.5-1.7"/><circle cx="3.5" cy="11.5" r=".9"/></svg>',
    bloqueo: SV + '<path d="M5.6 1.9h4.8l3.7 3.7v4.8l-3.7 3.7H5.6L1.9 10.4V5.6z"/><path d="M5.4 8h5.2"/></svg>',
    fecha: SV + '<rect x="2.2" y="3.2" width="11.6" height="10.6" rx="2"/><path d="M2.2 6.6h11.6M5.4 1.8v2.6M10.6 1.8v2.6"/></svg>',
    reloj: SV + '<circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.5"/></svg>',
    prio: SV + '<path d="M3.5 12.5v-2.5M8 12.5V7M12.5 12.5V3.5" stroke-width="2.2"/></svg>',
    libro: SV + '<path d="M2.4 3.3c1.9-.6 3.9-.4 5.6.9 1.7-1.3 3.7-1.5 5.6-.9v9.5c-1.9-.6-3.9-.4-5.6.9-1.7-1.3-3.7-1.5-5.6-.9zM8 4.2v9.5"/></svg>',
    hoy: SV + '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1"/></svg>',
    ia: SV + '<path d="M7 2.2l1.4 3.9 3.9 1.4-3.9 1.4L7 12.8 5.6 8.9 1.7 7.5l3.9-1.4z"/><path d="M12.6 1.6v2.8M11.2 3h2.8"/></svg>',
    buscar: SV + '<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4 14 14"/></svg>',
    imagen: SV + '<rect x="2" y="2.8" width="12" height="10.4" rx="1.8"/><circle cx="5.8" cy="6.4" r="1.1"/><path d="m2.6 12 3.6-3.4 2.8 2.6 1.8-1.7 2.6 2.5"/></svg>'
  };
  function stIcon(estado) { var s = h2('span', { class: 'apk-st', 'data-estado': estado, html: ICON['st_' + estado] }); return s; }
  function icon(name) { return h2('span', { class: 'apk-ico', html: ICON[name] }); }
  function h2(tag, attrs) { var e = document.createElement(tag); Object.keys(attrs).forEach(function (k) { if (k === 'html') e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]); }); return e; }   // html: solo SVG propio de arriba
  var PROJ_TONES = ['#273A5F', '#4A628E', '#2F7D5B', '#9A6414', '#6B5B95', '#3F7F8C'];
  function tone(id) { var n = 0; for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0; return PROJ_TONES[n % PROJ_TONES.length]; }
  var REP = { 'Content-Type': 'application/json', Prefer: 'return=representation' };

  function render(ctx) {
    var h = ctx.h, api = ctx.api, ui = ctx.ui;
    var now = new Date(), today = dayKey(now);
    function tick() { var n = new Date(), changed = dayKey(n) !== today; now = n; if (changed) { today = dayKey(n); st.cfg.resultado = ''; } return changed; }
    var st = {
      cards: [], archived: null, projects: [], subs: {}, hist: {}, cfg: { wip: {}, capacidad: DEFAULTS.capacidad, resultado: '' },
      view: pref('view') || 'hoy', filters: { q: '', proyecto: '', prioridad: 0, bloqueadas: false },
      colTab: pref('col') || 'en_curso', hechoMas: false
    };
    var undo = [], root = h('section', { class: 'apk', 'aria-label': 'Centro de trabajo' });
    var live = h('p', { class: 'sr-only apk-live', role: 'status', 'aria-live': 'polite' });
    var toastBox = h('div', { class: 'apk-toast', role: 'status', 'aria-live': 'polite' });
    var toastTimer = null, lastDrag = 0, keep = null, fresh = null, celebrate = null, flipOff = false;
    var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    function pref(k) { try { return localStorage.getItem('apk.' + k); } catch (e) { return null; } }
    function setPref(k, v) { try { localStorage.setItem('apk.' + k, v); } catch (e) { /* sin almacenamiento */ } }
    function auth(err) { if (err && err.auth) { ctx.fail(err); return true; } return false; }
    function missing(err) { return err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01'); }

    /* ── Carga ── */
    function load() {
      return Promise.all([
        api('/rest/v1/kb_tarjetas?select=*&archivada_en=is.null&order=posicion.asc&limit=1000'),
        api('/rest/v1/kb_proyectos?select=*&order=created_at.asc'),
        api('/rest/v1/kb_subtareas?select=*&order=posicion.asc&limit=5000'),
        api('/rest/v1/kb_ajustes?select=clave,valor')
      ]).then(function (r) {
        st.cards = r[0] || [];
        st.projects = r[1] || [];
        st.subs = {};
        (r[2] || []).forEach(function (s) { (st.subs[s.tarjeta_id] = st.subs[s.tarjeta_id] || []).push(s); });
        var cfg = {};
        (r[3] || []).forEach(function (a) { cfg[a.clave] = a.valor; });
        st.cfg.wip = Object.assign({}, DEFAULTS.wip, cfg.wip || {});
        st.cfg.capacidad = (cfg.capacidad && cfg.capacidad.hoy) || DEFAULTS.capacidad;
        st.cfg.resultado = cfg.hoy_resultado && cfg.hoy_resultado.fecha === today ? cfg.hoy_resultado.texto : '';
      });
    }

    /* ── Escrituras con reversión si fallan ── */
    var saySeq = 0;
    function say(msg, o) {
      o = o || {};
      var n = ++saySeq;
      live.textContent = '';
      // solo escribe el último mensaje: uno antiguo que llega tarde no pisa a uno nuevo
      setTimeout(function () { if (n === saySeq) live.textContent = msg; }, 20);
      toastBox.textContent = '';
      toastBox.classList.toggle('is-error', !!o.error);
      toastBox.appendChild(h('span', { text: msg }));
      if (o.action) toastBox.appendChild(h('button', { type: 'button', class: 'apk-link', text: o.action.label, onclick: function () { toastBox.classList.remove('is-on'); o.action.fn(); } }));
      if (o.undo) toastBox.appendChild(h('button', { type: 'button', class: 'apk-link', text: 'Deshacer', onclick: doUndo }));
      toastBox.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastBox.classList.remove('is-on'); }, o.error ? 7000 : 5000);
    }
    function failed(err, what, rollback) {
      if (rollback) rollback();
      if (auth(err)) return;
      console.warn('[kanban]', err);
      say('No se ha guardado' + (what ? ' (' + what + ')' : '') + ': ' + ((err && err.message) || 'error') + '. Se ha vuelto a cargar lo que sí está guardado.', { error: true });
      paint();
      resync();
    }
    function resync() {
      tick();
      return load().then(function () { st.archived = null; return st.view === 'archivo' ? loadArchived() : paint(); }).catch(function () { /* sin red: se queda lo que hay */ });
    }
    var queue = {};
    function patchCard(id, patch) {      // las escrituras de una misma tarjeta salen en orden: un fallo anterior no pisa a uno posterior
      var run = function () {
        return api('/rest/v1/kb_tarjetas?id=eq.' + id + '&select=*', { method: 'PATCH', headers: REP, body: JSON.stringify(patch) }).then(function (r) {
          if (!r || !r[0]) throw new Error('La tarjeta ya no existe');
          var c = byAny(id); if (c) { c.updated_at = r[0].updated_at; c.completada_en = r[0].completada_en; }   // el estado optimista local manda
          return r[0];
        });
      };
      var p = (queue[id] || Promise.resolve()).then(run, run);
      queue[id] = p.catch(function () { /* el siguiente no depende de este resultado */ });
      return p;
    }
    function byId(id) { for (var i = 0; i < st.cards.length; i++) if (st.cards[i].id === id) return st.cards[i]; return null; }
    function byAny(id) { var c = byId(id); if (c) return c; var a = st.archived || []; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
    function snapshot(c, keys) { var s = {}; keys.forEach(function (k) { s[k] = c[k]; }); return s; }

    function pushUndo(label, fn) { var e = { label: label, fn: fn }; undo.push(e); if (undo.length > 30) undo.shift(); return e; }
    function dropUndo(e) { var i = undo.indexOf(e); if (i > -1) undo.splice(i, 1); }
    function doUndo() {
      var u = undo.pop();
      if (!u) return say('No hay nada que deshacer.');
      toastBox.classList.remove('is-on');
      // se anuncia al deshacer (como al mover), no cuando responde el servidor: si se anunciase
      // después, podría pisar el aviso de una acción posterior. Si falla, failed() avisa del error.
      var p = Promise.resolve(u.fn());
      say('Deshecho: ' + u.label + '.');
      p.then(function () { paint(); }).catch(function (e) { failed(e, 'deshacer'); });
    }

    /* Mover (columna + posición). index = posición final en la columna destino. */
    function move(card, estado, index, how, beforeId) {
      var prev = snapshot(card, ['estado', 'posicion', 'tipo', 'completada_en', 'hoy_fecha']);
      var others = column(st.cards, estado).filter(function (c) { return c.id !== card.id; });
      if (beforeId !== undefined) { index = beforeId ? others.map(function (c) { return c.id; }).indexOf(beforeId) : others.length; if (index < 0) index = others.length; }   // soltar entre dos visibles = entre esas dos reales
      if (index == null || index > others.length) index = others.length;
      if (prev.estado === estado && column(st.cards, estado).indexOf(card) === index) return Promise.resolve();
      var renumber = needsRenumber(others, index);
      var patch = { estado: estado, tipo: estado === 'ideas' ? 'idea' : 'tarea' };
      if (estado === 'hecho' && card.hoy_fecha) patch.hoy_fecha = card.hoy_fecha;       // se conserva para «hecho hoy»
      var limit = st.cfg.wip[estado], before = others.length;
      Object.assign(card, patch);
      if (renumber) {
        others.splice(index, 0, card);
        others.forEach(function (c, i) { c.posicion = (i + 1) * GAP; });
      } else card.posicion = insertPosition(others, index);
      if (estado === 'hecho' && prev.estado !== 'hecho') { card.completada_en = new Date().toISOString(); celebrate = card.id; }
      if (estado !== 'hecho') card.completada_en = null;
      var pos = card.posicion;
      paint();
      var w = limit && prev.estado !== estado ? wipState(before + 1, limit) : null;
      say('«' + clip(card.titulo) + '» → ' + ESTADO_LABEL[estado] + (how === 'key' ? ', posición ' + (index + 1) + ' de ' + (before + 1) : '') +
        (w && w.over ? '. ' + ESTADO_LABEL[estado] + ' supera su límite (' + (before + 1) + '/' + limit + ').' : '.'),
        { undo: true, action: estado === 'hecho' && prev.estado !== 'hecho' ? { label: 'Anotar aprendizaje', fn: function () { detailDialog(card, 'aprendizaje'); } } : null });
      var entry = pushUndo('movimiento de «' + clip(card.titulo) + '»', function () {
        Object.assign(card, prev); paint();
        return patchCard(card.id, { estado: prev.estado, tipo: prev.tipo, posicion: prev.posicion, hoy_fecha: prev.hoy_fecha }).then(function () { return null; });
      });
      var writes = [patchCard(card.id, Object.assign({ posicion: pos }, patch))];
      if (renumber) others.forEach(function (c) { if (c.id !== card.id) writes.push(patchCard(c.id, { posicion: c.posicion })); });
      return Promise.all(writes).catch(function (err) { dropUndo(entry); failed(err, 'movimiento', function () { Object.assign(card, prev); }); });
    }
    function clip(s, n) { n = n || 40; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    function create(titulo, estado, proyecto, extra) {
      var col = column(st.cards, estado), pos = col.length ? col[col.length - 1].posicion + GAP : GAP;
      var row = Object.assign({ titulo: titulo, estado: estado, tipo: estado === 'ideas' ? 'idea' : 'tarea', posicion: pos, proyecto_id: proyecto || null }, extra || {});
      return api('/rest/v1/kb_tarjetas?select=*', { method: 'POST', headers: REP, body: JSON.stringify(row) }).then(function (r) {
        var c = r[0]; st.cards.push(c);
        keep = c.id; fresh = c.id;
        pushUndo('creación de «' + clip(c.titulo) + '»', function () {
          st.cards = st.cards.filter(function (x) { return x.id !== c.id; });
          return api('/rest/v1/kb_tarjetas?id=eq.' + c.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).then(function () { removeImages(c.id); });
        });
        paint();
        say('Tarjeta creada en ' + ESTADO_LABEL[estado] + '.', { undo: true });
        return c;
      });
    }

    function archive(card, on) {
      var prevA = card.archivada_en;
      card.archivada_en = on ? new Date().toISOString() : null;
      if (on) { st.cards = st.cards.filter(function (c) { return c.id !== card.id; }); if (st.archived) st.archived.unshift(card); }
      else { st.cards.push(card); st.archived = (st.archived || []).filter(function (c) { return c.id !== card.id; }); }
      paint();
      say(on ? '«' + clip(card.titulo) + '» archivada.' : '«' + clip(card.titulo) + '» recuperada.', { undo: true });
      var entry = pushUndo(on ? 'archivado' : 'recuperación', function () { return archive(card, !on); });
      return api('/rest/v1/kb_tarjetas?id=eq.' + card.id, { method: 'PATCH', headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' }, body: JSON.stringify({ archivada_en: card.archivada_en }) })
        .catch(function (err) {
          dropUndo(entry);
          failed(err, 'archivar', function () {
            card.archivada_en = prevA;
            if (on) { st.cards.push(card); st.archived = (st.archived || []).filter(function (c) { return c.id !== card.id; }); }
            else { st.cards = st.cards.filter(function (c) { return c.id !== card.id; }); if (st.archived) st.archived.unshift(card); }
          });
        });
    }

    function remove(card) {
      var subs = st.subs[card.id] || [];
      st.cards = st.cards.filter(function (c) { return c.id !== card.id; });
      if (st.archived) st.archived = st.archived.filter(function (c) { return c.id !== card.id; });
      paint();
      return api('/rest/v1/kb_tarjetas?id=eq.' + card.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).then(function () {
        say('«' + clip(card.titulo) + '» eliminada.', { undo: true });
        // las imágenes se borran cuando ya no se puede deshacer desde el aviso (deshacer después recupera la tarjeta sin ellas)
        var imgTimer = setTimeout(function () { removeImages(card.id); }, 10000);
        pushUndo('eliminación de «' + clip(card.titulo) + '»', function () {
          clearTimeout(imgTimer);
          var row = Object.assign({}, card);
          return api('/rest/v1/kb_tarjetas', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) })
            .then(function () {
              if (!subs.length) return null;
              return api('/rest/v1/kb_subtareas', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(subs) });
            }).then(function () { (card.archivada_en ? (st.archived = st.archived || []) : st.cards).push(card); st.subs[card.id] = subs; });
        });
      }).catch(function (err) { failed(err, 'eliminar'); });
    }

    function setHoy(card, on) {
      tick();
      var prev = card.hoy_fecha, value = on ? today : null;
      if (on && todayList().length >= st.cfg.capacidad) say('Ya tienes ' + todayList().length + ' elegidas para hoy (tu capacidad es ' + st.cfg.capacidad + '). Se añade igualmente: decide qué quitas.');
      card.hoy_fecha = value; paint();
      return patchCard(card.id, { hoy_fecha: value }).catch(function (err) { failed(err, 'hoy', function () { card.hoy_fecha = prev; }); });
    }
    function todayList() { return st.cards.filter(function (c) { return c.hoy_fecha === today && c.estado !== 'hecho'; }).sort(byPos); }

    function saveCfg(clave, valor) {
      return api('/rest/v1/kb_ajustes?on_conflict=clave', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ clave: clave, valor: valor, updated_at: new Date().toISOString() }) });
    }

    /* ── Pintado ── */
    var scrollLeft = 0;
    function paint() {
      tick();
      var board = root.querySelector('.apk-board'); if (board) scrollLeft = board.scrollLeft;
      var before = {};
      [].forEach.call(root.querySelectorAll('.apk-card[data-id]'), function (el) { before[el.getAttribute('data-id')] = el.getBoundingClientRect(); });
      var focusId = keep || (document.activeElement && document.activeElement.closest && (document.activeElement.closest('[data-id]') || {}).getAttribute && document.activeElement.closest('[data-id]').getAttribute('data-id'));
      var focusRole = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-role');
      root.textContent = '';
      root.appendChild(header());
      root.appendChild(st.view === 'hoy' ? viewHoy() : st.view === 'archivo' ? viewArchivo() : viewTablero());
      root.appendChild(toastBox); root.appendChild(live);
      board = root.querySelector('.apk-board'); if (board) board.scrollLeft = scrollLeft;
      if (!calm && !flipOff) [].forEach.call(root.querySelectorAll('.apk-card[data-id]'), function (el) {     // FLIP: la tarjeta se desliza de donde estaba a donde queda
        var a = before[el.getAttribute('data-id')], b = el.getBoundingClientRect();
        if (!a || (Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) < 2) || !el.animate) return;
        el.animate([{ transform: 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' });
      });
      fresh = null;
      if (celebrate) { var done = root.querySelector('.apk-card[data-id="' + celebrate + '"]'); if (done && !calm) done.classList.add('is-justdone'); celebrate = null; }
      if (focusId) {
        var el = root.querySelector('[data-id="' + focusId + '"] [data-role="' + (focusRole || 'open') + '"]') || root.querySelector('[data-id="' + focusId + '"] [data-role="open"]');
        if (el) el.focus({ preventScroll: true });
      }
      keep = null;
    }

    function btn(text, cls, fn, attrs) { return h('button', Object.assign({ type: 'button', class: cls, onclick: fn }, attrs || {}), typeof text === 'string' ? [text] : text); }

    function header() {
      var cur = st.cards.filter(function (c) { return c.estado === 'en_curso'; }).length;
      var doneToday = st.cards.filter(function (c) { return c.completada_en && dayKey(new Date(c.completada_en)) === today; }).length;
      var blocked = st.cards.filter(function (c) { return c.bloqueada && c.estado !== 'hecho'; }).length;
      var title = dateFmt.format(now); title = title.charAt(0).toUpperCase() + title.slice(1);
      var parts = [cur + (cur === 1 ? ' en curso' : ' en curso'), doneToday + (doneToday === 1 ? ' terminada hoy' : ' terminadas hoy')];
      if (blocked) parts.push(blocked + (blocked === 1 ? ' bloqueada' : ' bloqueadas'));
      var tabs = [['hoy', 'Hoy'], ['tablero', 'Tablero'], ['archivo', 'Archivo']];
      return h('header', { class: 'apk-head' }, [
        h('div', { class: 'apk-head-main' }, [
          h('h2', { class: 'apk-title', text: title }),
          h('p', { class: 'apk-sub', text: parts.join(' · ') }),
          flowBar()
        ]),
        h('div', { class: 'apk-head-actions' }, [
          h('div', { class: 'apk-seg', role: 'group', 'aria-label': 'Vista' }, tabs.map(function (t) {
            return btn(t[1], 'apk-seg-btn', function () { swap(function () { st.view = t[0]; setPref('view', t[0]); paint(); }); if (t[0] === 'archivo') loadArchived(); }, { 'aria-pressed': String(st.view === t[0]) });
          })),
          btn([icon('buscar'), 'Buscar', h('kbd', { class: 'apk-kbd', text: 'Ctrl K' })], 'apk-btn apk-btn--search', palette, { 'aria-keyshortcuts': 'Control+K', 'data-role': 'palette' }),
          btn('Proyectos', 'apk-btn', projectsDialog),
          btn('Ajustes', 'apk-btn', settingsDialog),
          btn([icon('plus'), 'Nueva tarjeta'], 'apk-btn apk-btn--primary', function () { newDialog('pendiente'); }, { 'data-role': 'new' })
        ])
      ]);
    }

    /* Barra de flujo: cuánto hay en cada estado (lo hecho, solo los últimos 7 días). Responde «qué avanza y dónde se acumula». */
    function flowBar() {
      var segs = ESTADOS.map(function (e) {
        var n = e.id === 'hecho' ? st.cards.filter(function (c) { return c.estado === 'hecho' && c.completada_en && (now - new Date(c.completada_en)) <= 7 * DAY; }).length : column(st.cards, e.id).length;
        return { e: e, n: n };
      });
      var total = segs.reduce(function (a, s) { return a + s.n; }, 0);
      if (!total) return null;
      return h('div', { class: 'apk-flowbox' }, [
        h('div', { class: 'apk-flow', 'aria-hidden': 'true' }, segs.filter(function (s) { return s.n; }).map(function (s) {
          var seg = h('span', { class: 'apk-flow-seg', 'data-estado': s.e.id }); seg.style.flexGrow = String(s.n); return seg;
        })),
        h('ul', { class: 'apk-flow-legend', 'aria-label': 'Reparto del trabajo por estado (Hecho: últimos 7 días)' }, segs.map(function (s) {
          return h('li', { 'data-estado': s.e.id }, [stIcon(s.e.id), h('span', { text: s.e.label }), h('strong', { text: String(s.n) })]);
        }))
      ]);
    }

    /* ── Tarjeta ── */
    function cardEl(c, o) {
      o = o || {};
      var sp = subProgress(st.subs[c.id]), proj = projOf(c);
      var meta = [];
      if (c.hoy_fecha === today && c.estado !== 'hecho') meta.push(h('span', { class: 'apk-chip apk-today' }, [icon('hoy'), 'Hoy']));
      if (c.prioridad >= 3) meta.push(h('span', { class: 'apk-chip apk-prio', 'data-prio': c.prioridad }, [icon('prio'), PRIO[c.prioridad]]));
      if (c.fecha_limite && c.estado !== 'hecho') { var d = dueLabel(c.fecha_limite, now); meta.push(h('span', { class: 'apk-chip apk-due', 'data-tone': d.tone }, [icon('fecha'), d.text])); }
      if (c.bloqueada) meta.push(h('span', { class: 'apk-chip apk-block' }, [icon('bloqueo'), 'Bloqueada']));
      var still = (c.estado === 'en_curso' || c.estado === 'revision') && c.updated_at ? Math.floor((now - new Date(c.updated_at)) / DAY) : 0;
      if (still >= 7) meta.push(h('span', { class: 'apk-chip apk-stale' }, [icon('reloj'), 'Sin mover ' + still + ' d']));
      if (sp.total) { var bar = h('span', { class: 'apk-bar', 'aria-hidden': 'true' }, [h('span', { class: 'apk-bar-fill' })]); bar.firstChild.style.width = Math.round(sp.done / sp.total * 100) + '%'; meta.push(h('span', { class: 'apk-chip apk-steps' }, [icon('pasos'), bar, sp.done + '/' + sp.total + ' pasos'])); }
      if (c.esfuerzo) meta.push(h('span', { class: 'apk-chip' }, [icon('reloj'), ESFUERZO[c.esfuerzo]]));
      (c.etiquetas || []).slice(0, 3).forEach(function (t) { meta.push(h('span', { class: 'apk-chip apk-tag', text: '#' + t })); });
      var idx = ESTADOS.map(function (e) { return e.id; }).indexOf(c.estado), next = ESTADOS[idx + 1];
      return h('li', { class: 'apk-card' + (c.bloqueada ? ' is-blocked' : '') + (c.estado === 'hecho' ? ' is-done' : '') + (fresh === c.id ? ' is-new' : ''), 'data-id': c.id, 'data-estado': c.estado }, [
        h('div', { class: 'apk-card-top' }, [
          h('span', { class: 'apk-grip', 'aria-hidden': 'true' }, [icon('grip')]),
          stIcon(c.estado), h('span', { class: 'sr-only', text: 'Estado: ' + ESTADO_LABEL[c.estado] + '. ' }),
          c.tipo === 'idea' ? h('span', { class: 'apk-type', title: 'Idea' }, [icon('idea')]) : null,
          proj ? h('span', { class: 'apk-proj' }, [(function () { var d = h('span', { class: 'apk-dot', 'aria-hidden': 'true' }); d.style.background = tone(proj.id); return d; })(), h('span', { class: 'apk-proj-t', text: proj.titulo })]) : null,
        ]),
        h('button', { type: 'button', class: 'apk-card-open', 'data-role': 'open', 'aria-keyshortcuts': 'Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown',
          'aria-describedby': 'apk-kbd-help', onclick: function () { if (Date.now() - lastDrag > 80) detailDialog(c); }, text: c.titulo }),
        c.siguiente_paso && c.estado !== 'hecho' ? h('p', { class: 'apk-next' }, [icon('next'), h('span', { class: 'sr-only', text: 'Siguiente paso: ' }), c.siguiente_paso]) : null,
        c.bloqueada && c.bloqueo ? h('p', { class: 'apk-why-block', text: 'Bloqueo: ' + c.bloqueo }) : null,
        c.estado === 'hecho' && c.aprendizaje ? h('p', { class: 'apk-learn' }, [icon('libro'), h('strong', { text: 'Aprendido: ' }), clip(c.aprendizaje, 140)]) : null,
        o.askNext && !c.siguiente_paso && c.estado !== 'hecho' ? h('p', { class: 'apk-next' }, [btn('Definir siguiente paso', 'apk-link', function () {
          ctx.ask({ title: 'Siguiente paso de «' + clip(c.titulo) + '»', text: 'La acción concreta más pequeña que puedes hacer a continuación.', input: true, ok: 'Guardar' }).then(function (v) {
            if (!v) return;
            c.siguiente_paso = v.slice(0, 300); paint();
            patchCard(c.id, { siguiente_paso: c.siguiente_paso }).catch(function (err) { failed(err, 'siguiente paso', function () { c.siguiente_paso = null; }); });
          });
        })]) : null,
        meta.length ? h('div', { class: 'apk-meta' }, meta) : null,
        h('div', { class: 'apk-card-act' }, [      // al final del DOM: el título es lo primero que alcanza el Tab; en pantalla va arriba a la derecha
          o.hoy ? btn(c.hoy_fecha === today ? 'Quitar de hoy' : 'Añadir a hoy', 'apk-mini', function () { setHoy(c, c.hoy_fecha !== today); },
            { 'data-role': 'hoy', 'aria-label': (c.hoy_fecha === today ? 'Quitar «' : 'Añadir «') + c.titulo + (c.hoy_fecha === today ? '» de hoy' : '» a hoy') }) : null,
          next && !o.noAdvance ? btn([next.label, icon('next')], 'apk-mini apk-adv', function () { move(c, next.id, column(st.cards, next.id).length, 'btn'); }, { 'data-role': 'adv', 'aria-label': 'Mover «' + c.titulo + '» a ' + next.label }) : null
        ])
      ]);
    }
    function projOf(c) { for (var i = 0; i < st.projects.length; i++) if (st.projects[i].id === c.proyecto_id) return st.projects[i]; return null; }

    /* ── Tablero ── */
    function viewTablero() {
      var visible = filterCards(st.cards, st.filters, st.subs);
      var filtered = !!(st.filters.q || st.filters.proyecto || st.filters.prioridad || st.filters.bloqueadas);
      var cols = ESTADOS.map(function (e) { return colEl(e, column(visible, e.id), column(st.cards, e.id).length, filtered); });
      var tabs = h('div', { class: 'apk-coltabs', role: 'group', 'aria-label': 'Columna visible (móvil)' }, ESTADOS.map(function (e) {
        return btn([stIcon(e.id), e.label + ' ' + column(visible, e.id).length], 'apk-coltab', function () { swap(function () { st.colTab = e.id; setPref('col', e.id); paint(); }); }, { 'aria-pressed': String(st.colTab === e.id), 'data-estado': e.id });
      }));
      return h('div', { class: 'apk-tablero', 'data-tab': st.colTab }, [
        filtersEl(filtered), tabs,
        h('p', { class: 'sr-only', id: 'apk-kbd-help', text: 'Mayús más flechas izquierda o derecha cambia la tarjeta de columna; Mayús más flechas arriba o abajo la reordena.' }),
        h('div', { class: 'apk-board', tabindex: '-1' }, cols)
      ]);
    }

    function filtersEl(filtered) {
      var q = h('input', { type: 'search', class: 'apk-input', placeholder: 'Buscar en título, notas o etiquetas', 'aria-label': 'Buscar tarjetas', value: st.filters.q, autocomplete: 'off' });
      q.addEventListener('input', function () {
        st.filters.q = q.value; var pos = q.selectionStart;
        paint(); var n = root.querySelector('.apk-filters input[type=search]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
      });
      var proj = ui.select([['', 'Todos los proyectos'], ['none', 'Sin proyecto']].concat(st.projects.filter(function (p) { return p.estado !== 'archivado'; }).map(function (p) { return [p.id, p.titulo]; })), st.filters.proyecto);
      proj.classList.add('apk-select'); proj.setAttribute('aria-label', 'Filtrar por proyecto');
      proj.addEventListener('change', function () { st.filters.proyecto = proj.value; paint(); });
      var pr = ui.select([['0', 'Cualquier prioridad'], ['4', 'Urgente'], ['3', 'Alta'], ['2', 'Normal'], ['1', 'Baja']], String(st.filters.prioridad));
      pr.classList.add('apk-select'); pr.setAttribute('aria-label', 'Filtrar por prioridad');
      pr.addEventListener('change', function () { st.filters.prioridad = +pr.value; paint(); });
      return h('div', { class: 'apk-filters' }, [
        q, proj, pr,
        btn('Solo bloqueadas', 'apk-chipbtn', function () { st.filters.bloqueadas = !st.filters.bloqueadas; paint(); }, { 'aria-pressed': String(st.filters.bloqueadas) }),
        filtered ? btn('Quitar filtros', 'apk-link', function () { st.filters = { q: '', proyecto: '', prioridad: 0, bloqueadas: false }; paint(); }) : null
      ]);
    }

    function colEl(e, cards, total, filtered) {
      var limit = st.cfg.wip[e.id], w = wipState(total, limit), shown = cards;
      var hechoCut = e.id === 'hecho' && !st.hechoMas && cards.length > 10;
      if (e.id === 'hecho') shown = cards.slice().sort(function (a, b) { return (b.completada_en || '') < (a.completada_en || '') ? -1 : 1; });
      if (hechoCut) shown = shown.slice(0, 10);
      var count = h('span', { class: 'apk-count' + (w.over ? ' is-over' : w.at ? ' is-at' : ''), text: String(total) + (limit ? ' / ' + limit : '') });
      var nb = column(st.cards, e.id).filter(function (c) { return c.bloqueada; }).length;
      var note = nb ? h('span', { class: 'apk-count-note', text: '· ' + nb + (nb === 1 ? ' bloqueada' : ' bloqueadas') }) : null;
      var list = h('ul', { class: 'apk-list', 'data-estado': e.id, 'aria-label': e.label }, shown.map(function (c) { return cardEl(c, { hoy: e.id !== 'hecho' && e.id !== 'ideas' }); }));
      var empty = !shown.length ? h('p', { class: 'apk-empty', text: filtered && total ? 'Ninguna tarjeta coincide con los filtros.' : e.vacio }) : null;
      return h('section', { class: 'apk-col', 'data-estado': e.id, 'aria-labelledby': 'apk-h-' + e.id }, [
        h('header', { class: 'apk-col-head' }, [
          stIcon(e.id), h('h3', { class: 'apk-col-title', id: 'apk-h-' + e.id, text: e.label }), count, note,
          e.id === 'hecho' && total ? btn('Archivar', 'apk-link', function () { archiveDone(); }, { title: 'Archiva las tarjetas hechas hace más de 7 días' }) : null
        ]),
        w.over ? h('p', { class: 'apk-wipwarn', role: 'note', text: 'Por encima del límite (' + total + ' de ' + limit + '). Puedes seguir, pero terminar antes de empezar suele ir más rápido.' }) : null,
        list, empty,
        hechoCut ? btn('Mostrar las ' + (cards.length - 10) + ' restantes', 'apk-link', function () { st.hechoMas = true; paint(); }) : null,
        e.id !== 'hecho' ? addInline(e.id) : null
      ]);
    }

    function addInline(estado) {
      var open = btn([icon('plus'), 'Añadir tarjeta'], 'apk-add', function () {
        var inp = h('input', { class: 'apk-input', type: 'text', maxlength: '200', placeholder: 'Título y Enter', 'aria-label': 'Título de la nueva tarjeta en ' + ESTADO_LABEL[estado], autocomplete: 'off' });
        var form = h('form', { class: 'apk-add-form', onsubmit: function (ev) {
          ev.preventDefault();
          var t = inp.value.trim(); if (!t) return;
          inp.disabled = true;
          createFrom(t, estado, st.filters.proyecto && st.filters.proyecto !== 'none' ? st.filters.proyecto : null).then(function () {
            var again = root.querySelector('.apk-col[data-estado="' + estado + '"] .apk-add'); if (again) again.click();
          }).catch(function (err) { inp.disabled = false; failed(err, 'crear'); });
        } }, [inp]);
        inp.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.preventDefault(); paint(); var b = root.querySelector('.apk-col[data-estado="' + estado + '"] .apk-add'); if (b) b.focus(); } });
        open.replaceWith(form); inp.focus();
      });
      return open;
    }

    function archiveDone() {
      var old = st.cards.filter(function (c) { return c.estado === 'hecho' && c.completada_en && (now - new Date(c.completada_en)) > 7 * DAY; });
      if (!old.length) return say('No hay tarjetas hechas hace más de 7 días.');
      ctx.ask({ title: 'Archivar ' + old.length + (old.length === 1 ? ' tarjeta hecha' : ' tarjetas hechas'), text: 'Se archivan las terminadas hace más de 7 días. Se conservan y se pueden recuperar en «Archivo».', ok: 'Archivar' }).then(function (ok) {
        if (ok) old.forEach(function (c) { archive(c, true); });
      });
    }

    /* ── Vista Hoy ── */
    function viewHoy() {
      var list = todayList(), cap = st.cfg.capacidad;
      var doneToday = st.cards.filter(function (c) { return c.completada_en && dayKey(new Date(c.completada_en)) === today; });
      var inCourse = column(st.cards, 'en_curso').filter(function (c) { return c.hoy_fecha !== today && !c.bloqueada; });
      var blocked = st.cards.filter(function (c) { return c.bloqueada && c.estado !== 'hecho'; });
      var sug = suggest(st.cards, now, { wipEnCurso: st.cfg.wip.en_curso }).slice(0, 5);
      var main = h('div', { class: 'apk-main' }, [
        h('p', { class: 'apk-label', text: 'Resultado principal de hoy' }),
        st.cfg.resultado ? h('p', { class: 'apk-main-text', text: st.cfg.resultado }) : h('p', { class: 'apk-main-text is-empty', text: 'Si hoy solo consiguieras una cosa, ¿cuál sería?' }),
        btn(st.cfg.resultado ? 'Cambiar' : 'Definirlo', 'apk-link', function () {
          ctx.ask({ title: 'Resultado principal de hoy', text: 'Una frase: lo que quieres tener al acabar el día.', input: true, value: st.cfg.resultado, ok: 'Guardar' }).then(function (v) {
            if (v == null) return;
            var prev = st.cfg.resultado; st.cfg.resultado = v; paint();
            saveCfg('hoy_resultado', { fecha: today, texto: v }).catch(function (err) { failed(err, 'resultado', function () { st.cfg.resultado = prev; }); });
          });
        })
      ]);
      var carry = st.cards.filter(function (c) { return c.hoy_fecha && c.hoy_fecha < today && c.estado !== 'hecho' && c.estado !== 'ideas'; }).sort(byPos);
      var capInput = h('input', { class: 'apk-input', type: 'text', maxlength: '300', placeholder: 'Captura: «Preparar DAX mañana #portfolio !alta»', 'aria-label': 'Capturar una idea o tarea', 'aria-describedby': 'apk-cap-help', autocomplete: 'off' });
      var capChips = h('div', { class: 'apk-cap-chips' });
      capInput.addEventListener('input', function () { capChips.textContent = ''; captureChips(capInput.value).forEach(function (c) { capChips.appendChild(c); }); });
      var capture = h('form', { class: 'apk-capture', onsubmit: function (ev) {
        ev.preventDefault();
        var t = capInput.value.trim(); if (!t) return;
        capInput.disabled = true;
        createFrom(t).then(function () { var n = root.querySelector('.apk-capture input'); if (n) n.focus(); }).catch(function (err) { capInput.disabled = false; failed(err, 'capturar'); });
      } }, [
        h('div', { class: 'apk-capture-row' }, [h('span', { class: 'apk-capture-ico' }, [icon('idea')]), capInput,
          st.ia ? btn([icon('ia'), 'Varias con IA'], 'apk-btn apk-btn--ia', function () { captureAI(capInput.value); }, { 'data-role': 'ia-capturar' }) : null]),
        capChips,
        h('p', { class: 'apk-hint apk-cap-help', id: 'apk-cap-help', text: '#proyecto o #etiqueta · !alta, !urgente, !baja · hoy, mañana, viernes, 24/10 · @hoy para elegirla hoy' })
      ]);
      return h('div', { class: 'apk-hoy' }, [
        capture,
        main,
        h('div', { class: 'apk-hoy-grid' }, [
          carry.length ? h('section', { class: 'apk-block apk-block--wide', 'aria-labelledby': 'apk-carry' }, [
            h('header', { class: 'apk-block-head' }, [h('h3', { id: 'apk-carry', class: 'apk-block-title' }, [icon('reloj'), 'Quedó de ayer']), h('span', { class: 'apk-count', text: String(carry.length) })]),
            h('p', { class: 'apk-hint', text: 'Elegidas para un día anterior y sin terminar. Decide si siguen hoy o salen del día.' }),
            h('ul', { class: 'apk-sug' }, carry.map(function (c) {
              return h('li', { class: 'apk-sug-item', 'data-id': c.id }, [
                h('button', { type: 'button', class: 'apk-card-open', 'data-role': 'open', text: c.titulo, onclick: function () { detailDialog(c); } }),
                h('div', { class: 'apk-proj-act' }, [
                  btn('Mantener hoy', 'apk-mini', function () { setHoy(c, true); }, { 'data-role': 'hoy', 'aria-label': 'Mantener «' + c.titulo + '» hoy' }),
                  btn('Quitar', 'apk-mini', function () { setHoy(c, false); }, { 'data-role': 'quit', 'aria-label': 'Quitar «' + c.titulo + '» del día' })
                ])
              ]);
            }))
          ]) : null,
          block('Elegidas para hoy', capacity(list.length, cap), list.length > cap ? 'Has elegido más de lo que cabe (' + cap + '). Decide qué quitas.' : '',
            list.length ? list.map(function (c) { return cardEl(c, { hoy: true, askNext: true }); }) : null, 'Elige tarjetas desde «Siguientes pasos» o desde el tablero.'),
          block('En curso', String(inCourse.length), '', inCourse.length ? inCourse.map(function (c) { return cardEl(c, { hoy: true }); }) : null, 'Nada más en curso fuera de lo elegido para hoy.'),
          block('Bloqueos', String(blocked.length), '', blocked.length ? blocked.map(function (c) { return cardEl(c, { noAdvance: true }); }) : null, 'Sin bloqueos.'),
          h('section', { class: 'apk-block apk-block--wide', 'aria-labelledby': 'apk-sug' }, [
            h('header', { class: 'apk-block-head' }, [h('h3', { id: 'apk-sug', class: 'apk-block-title' }, [icon('next'), 'Siguientes pasos sugeridos']),
              st.ia ? btn([icon('ia'), 'Plan del día con IA'], 'apk-btn apk-btn--ia apk-push', planDia, { 'data-role': 'ia-plan' }) : null]),
            h('p', { class: 'apk-hint', text: 'Sugerencias, no órdenes: puntúan prioridad, fecha límite y si ya está empezada. El motivo va debajo de cada una.' }),
            sug.length ? h('ul', { class: 'apk-sug' }, sug.map(function (s) {
              return h('li', { class: 'apk-sug-item', 'data-id': s.card.id }, [
                h('div', null, [
                  h('button', { type: 'button', class: 'apk-card-open', 'data-role': 'open', text: s.card.titulo, onclick: function () { detailDialog(s.card); } }),
                  h('p', { class: 'apk-why', text: s.why.length ? 'Porque: ' + s.why.join(' · ') : 'Sin factores destacados: es el siguiente en su columna.' }),
                  s.card.siguiente_paso ? h('p', { class: 'apk-next' }, [h('span', { class: 'sr-only', text: 'Siguiente paso: ' }), s.card.siguiente_paso]) : null
                ]),
                btn('Añadir a hoy', 'apk-mini', function () { setHoy(s.card, true); }, { 'data-role': 'hoy', 'aria-label': 'Añadir «' + s.card.titulo + '» a hoy' })
              ]);
            })) : h('p', { class: 'apk-empty', text: list.length ? 'Todo lo accionable ya está en tu día.' : 'No hay tarjetas pendientes que sugerir. Pasa una idea a «Pendiente» o crea una tarjeta.' })
          ]),
          block('Hecho hoy', String(doneToday.length), '', doneToday.length ? doneToday.map(function (c) { return cardEl(c, { noAdvance: true }); }) : null, 'Todavía nada terminado hoy.')
        ])
      ]);
      function capacity(n, cap) {
        var dots = []; for (var i = 0; i < Math.max(n, cap); i++) dots.push(h('span', { class: 'apk-cap-dot' + (i < n ? ' is-on' : '') + (i >= cap ? ' is-over' : '') }));
        return h('span', { class: 'apk-cap' }, [h('span', { class: 'apk-cap-dots', 'aria-hidden': 'true' }, dots), n + ' de ' + cap]);
      }
      function blockIcon(title) {     // declaración (no var): se usa desde el return de arriba
        return title === 'Elegidas para hoy' ? icon('hoy') : title === 'En curso' ? stIcon('en_curso') : title === 'Bloqueos' ? icon('bloqueo') : title === 'Hecho hoy' ? stIcon('hecho') : null;
      }
      function block(title, count, warn, items, emptyText) {
        return h('section', { class: 'apk-block', 'aria-label': title }, [
          h('header', { class: 'apk-block-head' }, [h('h3', { class: 'apk-block-title' }, [blockIcon(title), title]), h('span', { class: 'apk-count' }, [count])]),
          warn ? h('p', { class: 'apk-wipwarn', role: 'note', text: warn }) : null,
          items ? h('ul', { class: 'apk-list apk-list--flat' }, items) : h('p', { class: 'apk-empty', text: emptyText })
        ]);
      }
    }

    /* ── Archivo ── */
    function loadArchived() {
      paint();
      return api('/rest/v1/kb_tarjetas?select=*&archivada_en=not.is.null&order=archivada_en.desc&limit=300').then(function (r) { st.archived = r || []; paint(); })
        .catch(function (e) { failed(e, 'cargar el archivo'); });
    }
    function viewArchivo() {
      if (!st.archived) return h('p', { class: 'apk-empty', text: 'Cargando…' });
      return h('div', { class: 'apk-arch' }, [
        h('p', { class: 'apk-hint', text: 'Las tarjetas archivadas conservan notas, pasos e historial. Recupéralas cuando las necesites.' }),
        st.archived.length ? h('ul', { class: 'apk-list apk-list--flat' }, st.archived.map(function (c) {
          return h('li', { class: 'apk-card', 'data-id': c.id }, [
            h('button', { type: 'button', class: 'apk-card-open', 'data-role': 'open', text: c.titulo, onclick: function () { detailDialog(c); } }),
            h('p', { class: 'apk-next', text: ESTADO_LABEL[c.estado] + ' · archivada el ' + new Date(c.archivada_en).toLocaleDateString('es-ES') }),
            h('div', { class: 'apk-card-act apk-card-act--static' }, [btn('Recuperar', 'apk-mini', function () { archive(c, false); }, { 'data-role': 'rec' })])
          ]);
        })) : h('p', { class: 'apk-empty', text: 'No hay nada archivado.' })
      ]);
    }

    /* ── Diálogos ── */
    function selectEstado(v) { return ui.select(ESTADOS.map(function (e) { return [e.id, e.label]; }), v); }
    function selectProy(v) { return ui.select(st.projects.filter(function (p) { return p.estado !== 'archivado' || p.id === v; }).map(function (p) { return [p.id, p.titulo]; }), v || '', 'Sin proyecto'); }

    /* ── Tarjeta: un único diálogo para crear y para editar (botón «Nueva tarjeta», columnas, paleta y «+ Tarjeta» de la barra móvil) ──
       Cabecera (título + X) y pie (Cancelar / Guardar) fijos; solo el cuerpo se desplaza. Siempre a la vista lo esencial:
       título, estado, proyecto y bloqueo. Planificación, notas e imágenes, pasos e historial van en secciones plegables
       (<details>: plegar no borra nada) con un resumen de lo que contienen. En móvil ocupa la pantalla y sigue al teclado.
       Cerrar (X, Esc, clic fuera, Cancelar) es inmediato si no hay cambios; si los hay, pregunta antes de descartarlos.
       Imágenes de las notas: bucket privado «recursos», en kanban/<tarjeta>/; se suben y se quitan al pulsar Guardar. */
    var IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], IMG_MAX = 10 * 1024 * 1024, IMG_LIMIT = 12;
    function imgPrefix(id) { return 'kanban/' + id + '/'; }
    function imgName(path) { return path.split('/').pop().replace(/^[0-9a-f]{8}-/, ''); }
    function safeFile(name) {
      var n = String(name || 'imagen').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      return (n || 'imagen').slice(-80);
    }
    function removeImages(id) {          // borra las imágenes de una tarjeta que ya no existe (sin bloquear nada si falla)
      if (!ctx.storage) return Promise.resolve();
      return ctx.storage.list(imgPrefix(id)).then(function (list) {
        return list.length ? ctx.storage.remove(list.map(function (x) { return imgPrefix(id) + x.name; })) : null;
      }).catch(function (err) { console.warn('[kanban] imágenes sin borrar', err); });
    }

    function newDialog(estado) { cardDialog(null, { estado: estado }); }
    function detailDialog(c0, focusField) { cardDialog(c0, { focus: focusField }); }

    function cardDialog(c0, o) {
      o = o || {};
      var c = c0, subs = c ? (st.subs[c.id] || []).slice() : [], dlg, saving = false;
      var src = c || { titulo: '', estado: o.estado || 'pendiente', proyecto_id: st.filters.proyecto && st.filters.proyecto !== 'none' ? st.filters.proyecto : '', prioridad: 2, etiquetas: [], bloqueada: false };
      var msg = h('p', { class: 'ap-msg apk-dlg-msg', 'aria-live': 'assertive' });
      var f = {
        titulo: ui.input('text', src.titulo, { maxlength: '200', 'aria-required': 'true', enterkeyhint: 'done' }),
        estado: selectEstado(src.estado), proyecto: selectProy(src.proyecto_id),
        prioridad: ui.select([['4', 'Urgente'], ['3', 'Alta'], ['2', 'Normal'], ['1', 'Baja']], String(src.prioridad || 2)),
        fecha: ui.input('date', src.fecha_limite || ''),
        esfuerzo: ui.select([['1', ESFUERZO[1]], ['2', ESFUERZO[2]], ['3', ESFUERZO[3]]], src.esfuerzo ? String(src.esfuerzo) : '', 'Sin estimar'),
        tags: ui.input('text', (src.etiquetas || []).join(', '), { maxlength: '200', autocapitalize: 'none' }),
        bloqueada: h('input', { type: 'checkbox', role: 'switch', class: 'apk-switch-in', id: 'apk-d-bl', checked: !!src.bloqueada, 'aria-describedby': 'apk-d-bl-hint' }),
        bloqueo: ui.input('text', src.bloqueo || '', { maxlength: '300', placeholder: 'p. ej. Espero acceso a la base de datos' }),
        paso: ui.input('text', src.siguiente_paso || '', { maxlength: '300' }),
        notas: ui.area(src.notas, 6, 8000), aprendizaje: ui.area(src.aprendizaje, 3, 2000)
      };
      var title = h('h2', { class: 'ap-dialog-title apk-dlg-title', id: 'apk-d-title', tabindex: '-1', text: c ? 'Editar tarjeta' : 'Nueva tarjeta' });

      /* Errores junto al campo (y la sección se abre si estaba plegada) */
      function fieldErr(el, text) {
        var id = el.id + '-err', p = document.getElementById(id);
        if (!p) { p = h('p', { class: 'apk-err', id: id }); el.insertAdjacentElement('afterend', p); }
        p.textContent = text;
        el.setAttribute('aria-invalid', 'true');
        el.setAttribute('aria-describedby', ((el.getAttribute('aria-describedby') || '').replace(id, '').trim() + ' ' + id).trim());
        var sec = el.closest('details'); if (sec) sec.open = true;
        el.focus();
      }
      function clearErrs() {
        [].forEach.call(dlg.querySelectorAll('.apk-err'), function (p) {
          var el = document.getElementById(p.id.replace(/-err$/, ''));
          if (el) { el.removeAttribute('aria-invalid'); var d = (el.getAttribute('aria-describedby') || '').replace(p.id, '').trim(); if (d) el.setAttribute('aria-describedby', d); else el.removeAttribute('aria-describedby'); }
          p.remove();
        });
      }

      /* ── Bloqueo: interruptor con su efecto explicado; el motivo solo aparece (y se exige) si está activo ── */
      var blockWhy = h('div', { class: 'apk-block-why' }, [h('label', { class: 'ap-field-label', for: 'apk-d-b', text: 'Qué la bloquea' }), (f.bloqueo.id = 'apk-d-b', f.bloqueo)]);
      function syncBlock() { blockWhy.hidden = !f.bloqueada.checked; }
      f.bloqueada.addEventListener('change', function () { syncBlock(); if (f.bloqueada.checked) f.bloqueo.focus(); });
      syncBlock();
      var blockBox = h('div', { class: 'apf-field apf-wide apk-block' }, [
        h('label', { class: 'apk-switch', for: 'apk-d-bl' }, [f.bloqueada, h('span', { class: 'apk-switch-ui', 'aria-hidden': 'true' }), h('span', { class: 'apk-switch-t' }, [icon('bloqueo'), 'Bloqueada'])]),
        h('p', { class: 'apf-hint', id: 'apk-d-bl-hint', text: 'Algo externo te impide avanzar. Se marca en el tablero y no se sugiere para hoy.' }),
        blockWhy
      ]);

      /* ── Secciones plegables con resumen de lo que hay dentro ── */
      function section(id, label, kids, open) {
        var sum = h('span', { class: 'apk-sec-sum', id: id + '-sum' });
        var d = h('details', { class: 'apk-sec', id: id, open: !!open }, [
          h('summary', { class: 'apk-sec-h' }, [h('span', { class: 'apk-sec-t', text: label }), sum]),
          h('div', { class: 'apk-sec-b apf-grid' }, kids)
        ]);
        d.sum = sum;
        return d;
      }
      function planSummary() {
        var p = [];
        if (f.prioridad.value !== '2') p.push(PRIO[f.prioridad.value]);
        if (f.fecha.value) p.push(dueLabel(f.fecha.value, now).text);
        if (f.esfuerzo.value) p.push(ESFUERZO[f.esfuerzo.value]);
        var n = parseTags(f.tags.value).length; if (n) p.push(n + (n === 1 ? ' etiqueta' : ' etiquetas'));
        if (f.paso.value.trim()) p.push('con siguiente paso');
        return p.join(' · ') || 'Prioridad normal, sin fecha';
      }
      function notesSummary() {
        var p = [], n = imgs.filter(function (x) { return !x.gone; }).length + added.length;
        if (f.notas.value.trim()) p.push('Con notas');
        if (n) p.push(n + (n === 1 ? ' imagen' : ' imágenes'));
        if (f.aprendizaje.value.trim()) p.push('con aprendizaje');
        return p.join(' · ') || 'Vacío';
      }

      /* ── Imágenes: las guardadas (con su ruta) y las nuevas (aún en el dispositivo) ── */
      var imgs = [], added = [], urls = [], imgsReady = !c;
      var fileIn = h('input', { type: 'file', accept: IMG_TYPES.join(','), multiple: true, hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
      var gallery = h('ul', { class: 'apk-imgs', 'aria-label': 'Imágenes adjuntas' });
      var imgMsg = h('p', { class: 'apf-hint apk-img-msg', 'aria-live': 'polite' });
      var addImg = btn([icon('imagen'), 'Añadir imágenes'], 'apk-btn', function () { fileIn.click(); }, { 'data-role': 'img-add', 'aria-describedby': 'apk-d-img-hint' });
      function objUrl(b) { var u = URL.createObjectURL(b); urls.push(u); return u; }
      function drawImgs() {
        gallery.textContent = '';
        imgs.filter(function (x) { return !x.gone; }).concat(added).forEach(function (x) {
          gallery.appendChild(h('li', { class: 'apk-img' + (x.file ? ' is-new' : '') }, [
            x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener', class: 'apk-img-a', title: 'Abrir a tamaño completo' }, [h('img', { src: x.url, alt: x.name, loading: 'lazy' })])
              : h('span', { class: 'apk-img-ph', text: x.failed ? 'Sin vista previa' : 'Cargando…' }),
            x.file ? h('span', { class: 'apk-img-tag', text: 'Sin guardar' }) : null,
            btn('Quitar', 'apk-img-x', function () {
              if (x.file) added.splice(added.indexOf(x), 1); else x.gone = true;
              drawImgs(); imgMsg.textContent = '«' + x.name + '» se quitará al guardar.'; addImg.focus();
            }, { 'aria-label': 'Quitar la imagen «' + x.name + '»' })
          ]));
        });
        gallery.hidden = !gallery.firstChild;
        if (notesSec) notesSec.sum.textContent = notesSummary();
      }
      fileIn.addEventListener('change', function () {
        var files = [].slice.call(fileIn.files || []), bad = [], room = IMG_LIMIT - (imgs.filter(function (x) { return !x.gone; }).length + added.length);
        files.forEach(function (file) {
          if (IMG_TYPES.indexOf(file.type) < 0) return bad.push('«' + file.name + '» no es PNG, JPG, WebP ni GIF');
          if (file.size > IMG_MAX) return bad.push('«' + file.name + '» pesa más de 10 MB');
          if (room <= 0) return bad.push('«' + file.name + '» supera el máximo de ' + IMG_LIMIT + ' imágenes');
          room--; added.push({ file: file, name: file.name, url: objUrl(file) });
        });
        fileIn.value = '';
        drawImgs();
        imgMsg.textContent = bad.length ? 'No se han añadido: ' + bad.join('; ') + '.' : files.length ? (files.length === 1 ? 'Imagen añadida.' : files.length + ' imágenes añadidas.') + ' Se subirán al guardar.' : '';
        imgMsg.classList.toggle('is-error', !!bad.length);
      });
      function loadImgs() {
        if (!c || !ctx.storage) { imgsReady = true; return; }
        imgMsg.textContent = 'Cargando imágenes…';
        ctx.storage.list(imgPrefix(c.id)).then(function (list) {
          imgs = list.map(function (x) { return { path: imgPrefix(c.id) + x.name, name: imgName(x.name) }; });
          imgsReady = true; imgMsg.textContent = ''; drawImgs();
          if (imgs.length && notesSec) notesSec.open = true;
          imgs.forEach(function (x) {
            ctx.storage.blob(x.path).then(function (b) { x.url = objUrl(b); }, function () { x.failed = true; }).then(function () { if (dlg.open) drawImgs(); });
          });
        }).catch(function (err) {
          if (auth(err)) return;
          imgMsg.textContent = 'No se han podido cargar las imágenes guardadas. Lo demás se puede editar con normalidad.'; imgMsg.classList.add('is-error');
          addImg.disabled = true;      // sin saber qué hay guardado, no se mezclan altas
        });
      }
      /* Sube las nuevas y borra las quitadas. Lo que falle se queda pendiente (y a la vista) para reintentar. */
      function syncImages() {
        if (!c || (!added.length && !imgs.some(function (x) { return x.gone; }))) return Promise.resolve();
        var errs = [];
        var ups = added.slice().map(function (x) {
          var path = imgPrefix(c.id) + Math.random().toString(16).slice(2, 10).padEnd(8, '0') + '-' + safeFile(x.name);
          return ctx.storage.upload(x.file, path, x.file.type, function () {}).then(function () {
            added.splice(added.indexOf(x), 1); imgs.push({ path: path, name: x.name, url: x.url });
          }, function (err) { errs.push('«' + x.name + '»: ' + (err.status === 413 ? 'demasiado grande' : err.status === 415 ? 'formato no admitido' : err.message)); if (err.auth) throw err; });
        });
        var gone = imgs.filter(function (x) { return x.gone; });
        var del = gone.length ? ctx.storage.remove(gone.map(function (x) { return x.path; })).then(function () {
          imgs = imgs.filter(function (x) { return !x.gone; });
        }, function (err) { errs.push('no se han podido quitar ' + gone.length + (gone.length === 1 ? ' imagen' : ' imágenes')); if (err.auth) throw err; }) : null;
        return Promise.all(ups.concat(del)).then(function () {
          drawImgs();
          if (errs.length) { var e = new Error('Imágenes sin guardar (' + errs.join('; ') + ')'); e.images = true; throw e; }
        });
      }

      /* ── Pasos (solo al editar: se guardan al momento, como hasta ahora) ── */
      var subList = h('ul', { class: 'apk-subs' });
      function drawSubs() {
        subList.textContent = '';
        subs.forEach(function (s) {
          var cb = h('input', { type: 'checkbox', checked: s.hecho, 'aria-label': s.titulo });
          cb.addEventListener('change', function () {
            var prev = s.hecho; s.hecho = cb.checked;
            api('/rest/v1/kb_subtareas?id=eq.' + s.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ hecho: s.hecho }) })
              .catch(function (err) { s.hecho = prev; cb.checked = prev; msg.textContent = 'No se ha guardado el paso: ' + err.message; msg.classList.add('is-error'); });
            stepsSum();
          });
          subList.appendChild(h('li', { class: 'apk-sub' }, [h('label', null, [cb, h('span', { text: s.titulo })]),
            btn('Quitar', 'apk-link', function () {
              api('/rest/v1/kb_subtareas?id=eq.' + s.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).then(function () {
                subs = subs.filter(function (x) { return x.id !== s.id; }); st.subs[c.id] = subs; drawSubs();
              }).catch(function (err) { msg.textContent = 'No se ha podido quitar: ' + err.message; msg.classList.add('is-error'); });
            }, { 'aria-label': 'Quitar el paso «' + s.titulo + '»' })]));
        });
        stepsSum();
      }
      function stepsSum() { if (stepsSec) { var d = subs.filter(function (s) { return s.hecho; }).length; stepsSec.sum.textContent = subs.length ? d + ' de ' + subs.length + ' hechos' : 'Ninguno'; } }
      var newSub = ui.input('text', '', { maxlength: '200', placeholder: 'Nuevo paso y Enter', 'aria-label': 'Nuevo paso', enterkeyhint: 'enter', 'aria-describedby': 'apk-d-sub-hint' });
      newSub.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        var t = newSub.value.trim(); if (!t) return;
        var pos = subs.length ? subs[subs.length - 1].posicion + GAP : GAP;
        newSub.disabled = true;      // evita duplicados con doble Enter
        api('/rest/v1/kb_subtareas?select=*', { method: 'POST', headers: REP, body: JSON.stringify({ tarjeta_id: c.id, titulo: t, posicion: pos }) }).then(function (r) {
          subs.push(r[0]); st.subs[c.id] = subs; newSub.value = ''; drawSubs(); newSub.disabled = false; newSub.focus();
        }).catch(function (err) { newSub.disabled = false; msg.textContent = 'No se ha podido añadir: ' + err.message; msg.classList.add('is-error'); });
      });

      /* ── Historial: se pide al abrir su sección ── */
      var histBox = h('ul', { class: 'apk-hist' }), histLoaded = false;
      function loadHist() {
        if (histLoaded || !c) return; histLoaded = true;
        api('/rest/v1/kb_historial?select=tipo,de,a,created_at&tarjeta_id=eq.' + c.id + '&order=created_at.desc&limit=12').then(function (r) {
          (r || []).forEach(function (e) {
            var txt = e.tipo === 'creada' ? 'Creada en ' + ESTADO_LABEL[e.a] : e.tipo === 'estado' ? ESTADO_LABEL[e.de] + ' → ' + ESTADO_LABEL[e.a] : e.tipo === 'archivada' ? 'Archivada' : 'Recuperada';
            histBox.appendChild(h('li', null, [h('time', { text: new Date(e.created_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }), ' · ' + txt]));
          });
          if (!histBox.firstChild) histBox.appendChild(h('li', { text: 'Sin cambios registrados.' }));
        }).catch(function () { histLoaded = false; histBox.appendChild(h('li', { text: 'No se ha podido cargar el historial.' })); });
      }

      var save = btn(c ? 'Guardar' : 'Crear tarjeta', 'btn btn-primary', null, { type: 'submit', 'data-role': 'save' });
      var iaHint = h('p', { class: 'apk-hint apk-ia-note', 'aria-live': 'polite' });
      var idea = c && (c.tipo === 'idea' || c.estado === 'ideas') ? h('div', { class: 'apk-promote apf-wide' }, [
        h('p', { class: 'apk-hint', text: 'Es una idea. Cuando decidas trabajar en ella:' }),
        btn('Convertir en tarea', 'apk-btn', function () { f.estado.value = 'pendiente'; save.click(); }),
        btn('Convertir en proyecto', 'apk-btn', function () {
          api('/rest/v1/kb_proyectos?select=*', { method: 'POST', headers: REP, body: JSON.stringify({ titulo: f.titulo.value.trim() || c.titulo, objetivo: (f.notas.value || '').slice(0, 1000) || null }) }).then(function (r) {
            st.projects.push(r[0]); f.estado.value = 'pendiente';
            f.proyecto.appendChild(h('option', { value: r[0].id, text: r[0].titulo })); f.proyecto.value = r[0].id;
            save.click();
          }).catch(function (err) { msg.textContent = err.message; msg.classList.add('is-error'); });
        })
      ]) : null;

      var showLearn = c && (c.estado === 'hecho' || c.estado === 'revision');
      var planSec = section('apk-sec-plan', 'Planificación', [
        ui.field('apk-d-pr', 'Prioridad', f.prioridad), ui.field('apk-d-f', 'Fecha límite', f.fecha),
        ui.field('apk-d-es', 'Esfuerzo', f.esfuerzo), ui.field('apk-d-tag', 'Etiquetas', f.tags, { hint: 'Separadas por comas, p. ej. sql, portfolio.' }),
        ui.field('apk-d-p', 'Siguiente paso concreto', f.paso, { wide: true, hint: 'La primera acción física, la que harías nada más sentarte.' }),
        st.ia && c ? h('div', { class: 'apf-field apf-wide apk-ia-row' }, [btn([icon('ia'), 'Proponer siguiente paso con IA'], 'apk-btn apk-btn--ia', function (ev) { suggestNext(c, f.paso, iaHint, ev.currentTarget); }, { 'data-role': 'ia-next' }), iaHint]) : null
      ], o.focus === 'plan');
      var notesSec = null;
      notesSec = section('apk-sec-notas', 'Notas e imágenes', [
        ui.field('apk-d-n', 'Notas', f.notas, { wide: true, hint: 'Contexto, decisiones, preguntas o enlaces que quieras conservar.' }),
        h('div', { class: 'apf-field apf-wide apk-imgs-field' }, [
          h('p', { class: 'ap-field-label', text: 'Imágenes' }),
          gallery,
          h('div', { class: 'apk-img-row' }, [addImg, fileIn]),
          h('p', { class: 'apf-hint', id: 'apk-d-img-hint', text: 'Capturas, fotos o esquemas. PNG, JPG, WebP o GIF; hasta 10 MB cada una. Se suben al guardar.' }),
          imgMsg
        ]),
        showLearn ? ui.field('apk-d-a', 'Qué he aprendido', f.aprendizaje, { wide: true, hint: 'Lo que te llevarías a la próxima tarea parecida.' }) : null
      ], c && (!!c.notas || o.focus === 'aprendizaje'));
      var stepsSec = null;
      stepsSec = c ? section('apk-sec-pasos', 'Pasos', [h('div', { class: 'apf-field apf-wide' }, [subList, newSub,
        h('p', { class: 'apf-hint', id: 'apk-d-sub-hint', text: 'Pasos pequeños para avanzar. Se guardan al momento, sin pulsar Guardar.' }),
        st.ia ? btn([icon('ia'), 'Desglosar con IA'], 'apk-btn apk-btn--ia apk-ia-break', function (ev) { breakdown(c, subs.map(function (s) { return s.titulo; }), function (rows) { rows.forEach(function (r) { subs.push(r); }); st.subs[c.id] = subs; drawSubs(); }, ev.currentTarget); }, { 'data-role': 'ia-desglosar' }) : null])], subs.length > 0) : null;
      var histSec = c ? section('apk-sec-hist', 'Historial', [h('div', { class: 'apf-field apf-wide' }, [
        h('p', { class: 'apk-dates' }, [h('span', { text: 'Creada ' + new Date(c.created_at).toLocaleDateString('es-ES') }), c.updated_at ? h('span', { text: 'Actualizada ' + new Date(c.updated_at).toLocaleDateString('es-ES') }) : null,
          c.completada_en ? h('span', { text: 'Terminada ' + new Date(c.completada_en).toLocaleDateString('es-ES') }) : null]),
        histBox])]) : null;
      if (histSec) { histSec.sum.textContent = 'Cambios de estado y fechas'; histSec.addEventListener('toggle', function () { if (histSec.open) loadHist(); }); }
      var more = c ? h('div', { class: 'apk-dlg-more' }, [
        c.archivada_en ? btn('Recuperar', 'apk-btn', function () { guarded(function () { archive(c, false); }); }) : btn('Archivar', 'apk-btn', function () { guarded(function () { archive(c, true); }); }),
        btn('Eliminar', 'apk-btn apk-danger', function () {
          ctx.ask({ title: 'Eliminar «' + clip(c.titulo) + '»', text: 'Se borra con sus pasos, imágenes e historial. Podrás deshacerlo unos segundos; si dudas, archívala.', ok: 'Eliminar', danger: true }).then(function (ok) { if (ok) { dlg.close(); remove(c); } });
        })
      ]) : null;

      [f.prioridad, f.fecha, f.esfuerzo, f.tags, f.paso].forEach(function (el) { el.addEventListener('input', function () { planSec.sum.textContent = planSummary(); }); el.addEventListener('change', function () { planSec.sum.textContent = planSummary(); }); });
      [f.notas, f.aprendizaje].forEach(function (el) { el.addEventListener('input', function () { notesSec.sum.textContent = notesSummary(); }); });

      /* ── Cambios sin guardar ── */
      function snap() { return JSON.stringify(Object.keys(f).map(function (k) { return f[k].type === 'checkbox' ? f[k].checked : f[k].value; })); }
      var initial = '';
      function dirty() { return snap() !== initial || added.length > 0 || imgs.some(function (x) { return x.gone; }); }
      function onBeforeUnload(e) { if (dlg.open && dirty()) { e.preventDefault(); e.returnValue = ''; } }
      function guarded(fn) {
        if (!dirty()) { dlg.close(); return fn && fn(); }
        ctx.ask({ title: '¿Descartar los cambios?', text: 'Has cambiado esta tarjeta y no lo has guardado.', ok: 'Descartar cambios', cancel: 'Seguir editando', danger: true })
          .then(function (ok) { if (ok) { dlg.close(); if (fn) fn(); } });
      }
      function requestClose() { if (!saving) guarded(null); }

      function submit(ev) {
        ev.preventDefault();
        if (saving) return;
        clearErrs(); msg.classList.remove('is-error'); msg.textContent = '';
        var t = f.titulo.value.trim();
        if (!t) return fieldErr(f.titulo, 'Escribe un título: es lo único obligatorio.');
        if (f.bloqueada.checked && !f.bloqueo.value.trim()) return fieldErr(f.bloqueo, 'Indica qué la bloquea, o desactiva «Bloqueada».');
        if (!imgsReady && c) { msg.textContent = 'Espera a que terminen de cargar las imágenes.'; return; }
        saving = true; save.disabled = true; dlg.setAttribute('aria-busy', 'true');
        msg.textContent = added.length ? 'Guardando y subiendo ' + added.length + (added.length === 1 ? ' imagen…' : ' imágenes…') : 'Guardando…';
        var fields = {
          proyecto_id: f.proyecto.value || null, prioridad: +f.prioridad.value, fecha_limite: f.fecha.value || null,
          esfuerzo: f.esfuerzo.value ? +f.esfuerzo.value : null, etiquetas: parseTags(f.tags.value),
          bloqueada: f.bloqueada.checked, bloqueo: f.bloqueada.checked ? f.bloqueo.value.trim() : null,
          siguiente_paso: f.paso.value.trim() || null, notas: f.notas.value.trim() || null, aprendizaje: f.aprendizaje.value.trim() || null
        };
        var job;
        if (!c) {
          // Captura inteligente en el título (#proyecto, !prioridad, fechas, @hoy): rellena lo que el formulario dejó por defecto
          var cap = captureFields(t, f.estado.value), extra = Object.assign({}, fields);
          if (cap.extra.prioridad && fields.prioridad === 2) extra.prioridad = cap.extra.prioridad;
          if (cap.extra.fecha_limite && !fields.fecha_limite) extra.fecha_limite = cap.extra.fecha_limite;
          if (cap.extra.etiquetas) extra.etiquetas = fields.etiquetas.concat(cap.extra.etiquetas.filter(function (x) { return fields.etiquetas.indexOf(x) < 0; })).slice(0, 8);
          if (cap.extra.hoy_fecha) extra.hoy_fecha = cap.extra.hoy_fecha;
          var proj = fields.proyecto_id || cap.p.proyecto_id || null;
          delete extra.proyecto_id;
          job = create(cap.titulo, f.estado.value, proj, extra).then(function (row) { c = row; });
        } else {
          var patch = Object.assign({ titulo: t }, fields);
          var prev = Object.assign({}, c), newEstado = f.estado.value;
          if (newEstado !== c.estado) {
            patch.estado = newEstado; patch.tipo = newEstado === 'ideas' ? 'idea' : 'tarea';
            var col = column(st.cards, newEstado); patch.posicion = col.length ? col[col.length - 1].posicion + GAP : GAP;
          }
          job = patchCard(c.id, patch).then(function (row) {
            Object.assign(c, row);     // c puede ser una tarjeta archivada que no está en st.cards
            pushUndo('edición de «' + clip(c.titulo) + '»', function () {
              var back = {}; Object.keys(patch).forEach(function (k) { back[k] = prev[k]; });
              return patchCard(c.id, back).then(function (row) { Object.assign(c, row); });
            });
          });
        }
        var wasNew = !c0;
        job.then(function () { initial = snap(); return syncImages(); }).then(function () {
          saving = false; dlg.removeAttribute('aria-busy');
          dlg.close(); paint();
          if (!wasNew) say('Cambios guardados.', { undo: true });
        }).catch(function (err) {
          saving = false; save.disabled = false; dlg.removeAttribute('aria-busy');
          if (err && err.auth) { dlg.close(); return auth(err); }
          if (c && wasNew) { title.textContent = 'Editar tarjeta'; save.textContent = 'Guardar'; }   // la tarjeta ya existe: el siguiente intento solo sube lo pendiente
          msg.textContent = err && err.images ? 'La tarjeta se ha guardado, pero hay ' + err.message.charAt(0).toLowerCase() + err.message.slice(1) + '. Pulsa Guardar para reintentarlo.'
            : 'No se ha guardado: ' + ((err && err.message) || 'error') + '. No se ha perdido nada de lo escrito.';
          msg.classList.add('is-error');
          if (err && err.images) { notesSec.open = true; }
        });
      }

      var closeX = h('button', { type: 'button', class: 'apk-dlg-x', 'aria-label': 'Cerrar', 'data-role': 'close', onclick: requestClose, html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>' });
      var form = h('form', { method: 'dialog', novalidate: true, class: 'apk-dlg-form', onsubmit: submit }, [
        h('header', { class: 'apk-dlg-head' }, [title, closeX]),
        h('div', { class: 'apk-dlg-body' }, [
          h('div', { class: 'apf-grid apk-dlg-main' }, [
            idea,
            ui.field('apk-d-t', 'Título', f.titulo, { wide: true, hint: c ? null : 'En pocas palabras. Puedes añadir #proyecto, !alta o «mañana» y se rellenan solos.' }),
            ui.field('apk-d-e', 'Estado', f.estado),
            ui.field('apk-d-proy', 'Proyecto', f.proyecto),
            blockBox
          ]),
          planSec, notesSec, stepsSec, histSec, more
        ]),
        h('footer', { class: 'apk-dlg-foot' }, [msg, h('div', { class: 'apk-dlg-btns' }, [btn('Cancelar', 'btn btn-outline', requestClose, { 'data-role': 'cancel' }), save])])
      ]);
      planSec.sum.textContent = planSummary();
      dlg = h('dialog', { class: 'ap-dialog apk-dialog apk-card-dlg', 'aria-labelledby': 'apk-d-title', onclose: function () {
        window.removeEventListener('beforeunload', onBeforeUnload);
        if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
        urls.forEach(URL.revokeObjectURL);
        dlg.remove(); if (root.isConnected) paint();      // repinta: los pasos se guardan al instante y la tarjeta cuenta
      } }, [form]);
      dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); requestClose(); });      // Esc
      var downOut = false;      // clic fuera: solo si empieza y termina en el fondo (seleccionar texto y soltar fuera no cierra)
      dlg.addEventListener('pointerdown', function (ev) { downOut = ev.target === dlg; });
      dlg.addEventListener('click', function (ev) { if (ev.target === dlg && downOut) requestClose(); downOut = false; });

      /* Móvil: a pantalla completa, con la altura del viewport visual para que el pie (Guardar) quede encima del teclado */
      var vv = window.visualViewport, sheet = window.matchMedia && matchMedia('(max-width: 599.98px), (max-height: 520px)');
      function fit() {
        if (!vv || !sheet || !sheet.matches) { dlg.style.height = ''; dlg.style.top = ''; return; }
        dlg.style.height = Math.round(vv.height) + 'px'; dlg.style.top = Math.round(vv.offsetTop) + 'px';
      }
      if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
      form.addEventListener('focusin', function (ev) {      // con el teclado abierto, el campo activo queda a la vista dentro del cuerpo
        var el = ev.target;
        if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !sheet || !sheet.matches) return;
        setTimeout(function () { if (document.activeElement === el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }, 280);
      });

      drawSubs(); drawImgs(); loadImgs();
      initial = snap();
      window.addEventListener('beforeunload', onBeforeUnload);
      document.body.appendChild(dlg); dlg.showModal(); fit();
      if (o.focus === 'aprendizaje' && f.aprendizaje.isConnected) f.aprendizaje.focus();
      else if (!c) f.titulo.focus();
      else title.focus();      // al editar no se abre el teclado del móvil: se lee el título del diálogo y se elige qué tocar
    }

    function projectsDialog() {
      var dlg, box = h('div', { class: 'apk-proj-list' });
      function draw() {
        box.textContent = '';
        if (!st.projects.length) box.appendChild(h('p', { class: 'apk-empty', text: 'Aún no hay proyectos. Un proyecto es un resultado que quieres conseguir; las tarjetas son sus tareas.' }));
        st.projects.forEach(function (p) {
          var n = st.cards.filter(function (c) { return c.proyecto_id === p.id; });
          var done = n.filter(function (c) { return c.estado === 'hecho'; }).length;
          box.appendChild(h('div', { class: 'apk-proj-row' }, [
            h('div', null, [h('strong', { text: p.titulo }), h('p', { class: 'apk-hint', text: (p.objetivo ? p.objetivo + ' · ' : '') + p.estado + ' · ' + done + '/' + n.length + ' tareas hechas' })]),
            h('div', { class: 'apk-proj-act' }, [
              btn('Ver tarjetas', 'apk-link', function () { dlg.close(); st.filters.proyecto = p.id; st.view = 'tablero'; paint(); }),
              btn('Editar', 'apk-link', function () { dlg.close(); projectForm(p); })
            ])
          ]));
        });
      }
      draw();
      dlg = h('dialog', { class: 'ap-dialog apf-dialog', 'aria-labelledby': 'apk-pl-t', onclose: function () { dlg.remove(); } }, [
        h('h2', { class: 'ap-dialog-title', id: 'apk-pl-t', text: 'Proyectos' }), box,
        h('div', { class: 'ap-dialog-actions' }, [btn('Cerrar', 'btn btn-outline', function () { dlg.close(); }), btn('Nuevo proyecto', 'btn btn-primary', function () { dlg.close(); projectForm(null); })])
      ]);
      document.body.appendChild(dlg); dlg.showModal();
    }
    function projectForm(p) {
      var t = ui.input('text', p ? p.titulo : '', { maxlength: '160' }), o = ui.area(p ? p.objetivo : '', 3, 1000), d = ui.area(p ? p.descripcion : '', 4, 4000);
      var e = ui.select([['activo', 'Activo'], ['pausado', 'Pausado'], ['hecho', 'Hecho'], ['archivado', 'Archivado']], p ? p.estado : 'activo');
      var pr = ui.select([['4', 'Urgente'], ['3', 'Alta'], ['2', 'Normal'], ['1', 'Baja']], p ? String(p.prioridad) : '2');
      var fo = ui.input('date', p && p.fecha_objetivo || '');
      var fields = [ui.field('apk-p-t', 'Nombre', t, { wide: true }), ui.field('apk-p-o', 'Objetivo (el resultado que quiero)', o, { wide: true }), ui.field('apk-p-e', 'Estado', e), ui.field('apk-p-pr', 'Prioridad', pr), ui.field('apk-p-f', 'Fecha objetivo', fo), ui.field('apk-p-d', 'Descripción', d, { wide: true })];
      ui.formDialog(p ? 'Editar proyecto' : 'Nuevo proyecto', 'Guardar', fields, function () {
        var v = t.value.trim(); if (!v) throw ui.invalid('Escribe un nombre.', t);
        var body = { titulo: v, objetivo: o.value.trim() || null, descripcion: d.value.trim() || null, estado: e.value, prioridad: +pr.value, fecha_objetivo: fo.value || null };
        return (p ? api('/rest/v1/kb_proyectos?id=eq.' + p.id + '&select=*', { method: 'PATCH', headers: REP, body: JSON.stringify(body) })
          : api('/rest/v1/kb_proyectos?select=*', { method: 'POST', headers: REP, body: JSON.stringify(body) })).then(function (r) {
          if (p) Object.assign(p, r[0]); else st.projects.push(r[0]);
          paint(); say('Proyecto guardado.');
        });
      }, t);
    }

    function settingsDialog() {
      var a = ui.input('number', st.cfg.wip.en_curso || 0, { min: '0', max: '20' }), b = ui.input('number', st.cfg.wip.revision || 0, { min: '0', max: '20' }), c = ui.input('number', st.cfg.capacidad, { min: '1', max: '12' });
      ui.formDialog('Ajustes del tablero', 'Guardar', [
        ui.field('apk-s-a', 'Límite en «En curso» (0 = sin límite)', a, { hint: 'Valor inicial 3: pocas cosas a la vez. Avisa, no bloquea.' }),
        ui.field('apk-s-b', 'Límite en «En revisión» (0 = sin límite)', b),
        ui.field('apk-s-c', 'Capacidad diaria (tarjetas para hoy)', c, { hint: 'Cuántas cosas caben de verdad en un día.' })
      ], function () {
        var wip = { en_curso: Math.max(0, Math.min(20, +a.value || 0)), revision: Math.max(0, Math.min(20, +b.value || 0)) }, cap = Math.max(1, Math.min(12, +c.value || 1));
        return Promise.all([saveCfg('wip', wip), saveCfg('capacidad', { hoy: cap })]).then(function () { st.cfg.wip = wip; st.cfg.capacidad = cap; paint(); say('Ajustes guardados.'); });
      }, a);
    }

    /* ── Transición nativa entre vistas (View Transitions API); sin soporte o con «reducir movimiento», cambio directo ── */
    function swap(fn) {
      if (calm || !document.startViewTransition) return fn();
      flipOff = true;
      var off = function () { flipOff = false; };
      document.startViewTransition(fn).finished.then(off, off);
    }

    /* ── Captura inteligente: lo que se detecta al escribir se enseña en chips antes de crear ── */
    function captureFields(text, estadoFijo) {
      var p = parseCapture(text, st.projects.filter(function (x) { return x.estado !== 'archivado'; }), now);
      var estado = estadoFijo || (p.fecha_limite || p.hoy || p.prioridad ? 'pendiente' : 'ideas');
      var extra = {};
      if (p.prioridad) extra.prioridad = p.prioridad;
      if (p.fecha_limite) extra.fecha_limite = p.fecha_limite;
      if (p.etiquetas.length) extra.etiquetas = p.etiquetas;
      if (p.hoy) extra.hoy_fecha = today;
      return { p: p, estado: estado, extra: extra, titulo: p.titulo || String(text).trim() };
    }
    function captureChips(text, estadoFijo) {
      if (!String(text).trim()) return [];
      var f = captureFields(text, estadoFijo), p = f.p, chips = [];
      if (!estadoFijo) chips.push(h('span', { class: 'apk-chip', 'data-estado': f.estado }, [stIcon(f.estado), ESTADO_LABEL[f.estado]]));
      if (p.proyecto) chips.push(h('span', { class: 'apk-chip' }, [icon('proyecto'), p.proyecto]));
      if (p.fecha_limite) chips.push(h('span', { class: 'apk-chip' }, [icon('fecha'), dueLabel(p.fecha_limite, now).text]));
      if (p.prioridad) chips.push(h('span', { class: 'apk-chip' }, [icon('prio'), PRIO[p.prioridad]]));
      if (p.hoy) chips.push(h('span', { class: 'apk-chip apk-today' }, [icon('hoy'), 'Para hoy']));
      p.etiquetas.forEach(function (t) { chips.push(h('span', { class: 'apk-chip apk-tag', text: '#' + t })); });
      return chips;
    }
    function createFrom(text, estadoFijo, proyecto) {
      var f = captureFields(text, estadoFijo);
      return create(f.titulo, f.estado, f.p.proyecto_id || proyecto || null, f.extra);
    }

    /* ── IA (Edge Function kanban-ia): propone; nada se guarda sin confirmar ── */
    function iaCall(body) {
      return api('/functions/v1/kanban-ia', { method: 'POST', headers: JSON_H, body: JSON.stringify(body) }).then(function (r) {
        if (st.ia && r && typeof r.remaining === 'number') st.ia.remaining = r.remaining;
        return r || {};
      });
    }
    function iaCheck() {     // sin función desplegada o con la IA apagada, los botones de IA no aparecen
      iaCall({ action: 'estado' }).then(function (r) { var was = !!st.ia; st.ia = r && r.enabled ? r : null; if (!!st.ia !== was && root.isConnected) paint(); })
        .catch(function (err) { st.ia = null; auth(err); });
    }
    function iaFail(err) { if (auth(err)) return; say('IA: ' + ((err && err.message) || 'no ha respondido') + '.', { error: true }); }
    function iaNote() { return 'Propuesta generada con IA' + (st.ia && typeof st.ia.remaining === 'number' ? ' · quedan ' + st.ia.remaining + ' llamadas hoy' : '') + '. Revísala: solo se guarda lo que marques.'; }
    function busy(el, p) {
      if (el) { el.disabled = true; el.classList.add('is-busy'); }
      say('La IA está preparando una propuesta…');
      return p.finally(function () { if (el) { el.disabled = false; el.classList.remove('is-busy'); } toastBox.classList.remove('is-on'); });
    }

    /* Revisión de propuestas: casilla + texto editable por fila; se guarda solo lo marcado */
    function review(o) {
      var dlg, msg = h('p', { class: 'ap-msg', 'aria-live': 'assertive' });
      var rows = o.items.map(function (it, i) {
        var cb = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Incluir «' + it.label + '»' });
        var tx = it.editable === false ? h('span', { class: 'apk-rv-t', text: it.label }) : h('input', { type: 'text', class: 'apk-input', value: it.label, maxlength: '200', 'aria-label': 'Texto de la propuesta ' + (i + 1) });
        return { it: it, cb: cb, tx: tx, el: h('li', { class: 'apk-rv-item' }, [cb, h('div', { class: 'apk-rv-body' }, [tx, it.sub ? h('p', { class: 'apk-hint', text: it.sub }) : null, it.chips ? h('div', { class: 'apk-meta' }, it.chips) : null])]) };
      });
      var ok = btn(o.ok || 'Añadir', 'btn btn-primary', function () {
        var sel = rows.filter(function (r) { return r.cb.checked; }).map(function (r) {
          return Object.assign({}, r.it, { label: r.tx.tagName === 'INPUT' ? r.tx.value.trim() : r.it.label });
        }).filter(function (x) { return x.label; });
        if (!sel.length) return dlg.close();
        ok.disabled = true; msg.classList.remove('is-error'); msg.textContent = 'Guardando…';
        Promise.resolve().then(function () { return o.accept(sel); }).then(function () { dlg.close(); }).catch(function (err) {
          ok.disabled = false; msg.textContent = (err && err.message) || 'No se ha podido guardar.'; msg.classList.add('is-error');
        });
      }, { 'data-role': 'rv-ok' });
      dlg = h('dialog', { class: 'ap-dialog apf-dialog apk-dialog apk-review', 'aria-labelledby': 'apk-rv-title', onclose: function () { dlg.remove(); } }, [
        h('h2', { class: 'ap-dialog-title apk-rv-title', id: 'apk-rv-title' }, [icon('ia'), o.title]),
        o.intro ? h('p', { class: 'apk-rv-intro', text: o.intro }) : null,
        rows.length ? h('ul', { class: 'apk-rv-list' }, rows.map(function (r) { return r.el; })) : h('p', { class: 'apk-empty', text: o.empty || 'La IA no ha propuesto nada esta vez.' }),
        h('p', { class: 'apk-hint apk-rv-note', text: iaNote() }), msg,
        h('div', { class: 'ap-dialog-actions' }, [btn('Descartar', 'btn btn-outline', function () { dlg.close(); }), rows.length ? ok : null])
      ]);
      document.body.appendChild(dlg); dlg.showModal();
      var first = dlg.querySelector('.apk-rv-list input'); if (first) first.focus();
    }

    function breakdown(c, current, onAdded, el) {
      busy(el, iaCall({ action: 'desglosar', card: { titulo: c.titulo, notas: c.notas, siguiente_paso: c.siguiente_paso, pasos: current } })).then(function (r) {
        review({ title: 'Pasos para «' + clip(c.titulo) + '»', items: (r.pasos || []).map(function (p) { return { label: p }; }), ok: 'Añadir pasos', accept: function (sel) {
          var last = (st.subs[c.id] || []).reduce(function (m, s) { return Math.max(m, s.posicion); }, 0);
          var rows = sel.map(function (s, i) { return { tarjeta_id: c.id, titulo: s.label.slice(0, 200), posicion: last + (i + 1) * GAP }; });
          return api('/rest/v1/kb_subtareas?select=*', { method: 'POST', headers: REP, body: JSON.stringify(rows) }).then(function (saved) {
            saved = saved || []; onAdded(saved); paint();
            say(saved.length + (saved.length === 1 ? ' paso añadido.' : ' pasos añadidos.'));
          });
        } });
      }).catch(iaFail);
    }
    function suggestNext(c, input, note, el) {
      busy(el, iaCall({ action: 'siguiente_paso', card: { titulo: c.titulo, notas: c.notas, siguiente_paso: input.value, pasos: (st.subs[c.id] || []).map(function (s) { return s.titulo; }) } })).then(function (r) {
        if (!r.siguiente_paso) return say('La IA no ha propuesto nada esta vez.');
        input.value = r.siguiente_paso; input.focus(); input.select();
        note.textContent = 'Propuesto con IA' + (r.motivo ? ': ' + r.motivo : '.') + ' Edítalo si quieres; se guarda al pulsar Guardar.';
      }).catch(iaFail);
    }
    function planDia(ev) {
      var el = ev && ev.currentTarget, chosen = todayList().length, free = Math.max(0, st.cfg.capacidad - chosen);
      if (!free) return say('Ya tienes el día completo (' + chosen + ' de ' + st.cfg.capacidad + '). Quita algo antes de añadir más.');
      var cands = st.cards.filter(function (c) { return c.estado !== 'hecho' && c.estado !== 'ideas' && !c.bloqueada && c.hoy_fecha !== today; }).slice(0, 60);
      if (!cands.length) return say('No hay tarjetas pendientes que planificar.');
      busy(el, iaCall({ action: 'plan_dia', hoy: today, capacidad: free, resultado: st.cfg.resultado || undefined, cards: cands.map(function (c) {
        return { id: c.id, titulo: c.titulo, estado: c.estado, prioridad: c.prioridad, fecha_limite: c.fecha_limite, esfuerzo: c.esfuerzo, bloqueada: c.bloqueada, siguiente_paso: c.siguiente_paso };
      }) })).then(function (r) {
        var items = (r.elegidas || []).map(function (e) {
          var c = byId(e.id);
          return c ? { label: c.titulo, sub: e.motivo, editable: false, card: c, chips: [h('span', { class: 'apk-chip', 'data-estado': c.estado }, [stIcon(c.estado), ESTADO_LABEL[c.estado]])] } : null;
        }).filter(Boolean);
        review({ title: 'Plan del día', intro: r.resumen, items: items, ok: 'Elegir para hoy', empty: 'La IA no ha encontrado nada que proponer.', accept: function (sel) { sel.forEach(function (s) { setHoy(s.card, true); }); } });
      }).catch(iaFail);
    }
    function captureAI(text) {
      var area = ui.area(text || '', 6, 4000);
      area.setAttribute('placeholder', 'Notas de una reunión, una lista desordenada, lo que tengas en la cabeza…');
      ui.formDialog('Convertir texto en tarjetas con IA', 'Proponer tarjetas', [
        ui.field('apk-ia-txt', 'Texto', area, { wide: true, hint: 'La IA propone; nada se guarda hasta que lo confirmes.' })
      ], function () {
        var t = area.value.trim(); if (!t) throw ui.invalid('Escribe algo primero.', area);
        return iaCall({ action: 'capturar', texto: t, hoy: today, proyectos: st.projects.filter(function (p) { return p.estado !== 'archivado'; }).map(function (p) { return { id: p.id, titulo: p.titulo }; }) }).then(function (r) {
          setTimeout(function () {      // se abre al cerrarse este formulario
            review({ title: 'Tarjetas propuestas', ok: 'Crear tarjetas', items: (r.tarjetas || []).map(function (t) {
              var proj = st.projects.filter(function (p) { return p.id === t.proyecto_id; })[0];
              var chips = [h('span', { class: 'apk-chip', 'data-estado': t.estado }, [stIcon(t.estado), ESTADO_LABEL[t.estado]])];
              if (proj) chips.push(h('span', { class: 'apk-chip' }, [icon('proyecto'), proj.titulo]));
              if (t.fecha_limite) chips.push(h('span', { class: 'apk-chip' }, [icon('fecha'), dueLabel(t.fecha_limite, now).text]));
              if (t.prioridad >= 3) chips.push(h('span', { class: 'apk-chip' }, [icon('prio'), PRIO[t.prioridad]]));
              return { label: t.titulo, sub: t.siguiente_paso ? 'Siguiente paso: ' + t.siguiente_paso : '', chips: chips, t: t };
            }), accept: function (sel) {
              return sel.reduce(function (p, s) {
                return p.then(function () { return create(s.label, s.t.estado, s.t.proyecto_id, { prioridad: s.t.prioridad, fecha_limite: s.t.fecha_limite, siguiente_paso: s.t.siguiente_paso }); });
              }, Promise.resolve()).then(function () { say(sel.length + (sel.length === 1 ? ' tarjeta creada.' : ' tarjetas creadas.')); });
            } });
          }, 0);
        });
      }, area);
    }

    /* ── Paleta de comandos (Ctrl/⌘+K): busca tarjetas y ejecuta acciones sin ratón ── */
    function palette() {
      if (document.querySelector('dialog.apk-pal')) return;
      var active = 0, items = [];
      var input = h('input', { type: 'text', class: 'apk-pal-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'apk-pal-list', 'aria-autocomplete': 'list', placeholder: 'Busca una tarjeta, una acción o escribe para crear', 'aria-label': 'Buscar tarjetas y acciones', autocomplete: 'off' });
      var list = h('ul', { class: 'apk-pal-list', id: 'apk-pal-list', role: 'listbox', 'aria-label': 'Resultados' });
      var dlg = h('dialog', { class: 'ap-dialog apk-pal', 'aria-label': 'Paleta de comandos', onclose: function () { dlg.remove(); } }, [
        h('div', { class: 'apk-pal-box' }, [icon('buscar'), input]), list,
        h('p', { class: 'apk-pal-hint', text: '↑ ↓ para moverte · Enter para ejecutar · Esc para cerrar' })
      ]);
      function go(view) { return function () { swap(function () { st.view = view; setPref('view', view); paint(); }); if (view === 'archivo') loadArchived(); }; }
      function actions() {
        var a = [
          { ico: 'plus', label: 'Nueva tarjeta', run: function () { newDialog('pendiente'); } },
          { ico: 'idea', label: 'Capturar una idea', run: function () { go('hoy')(); setTimeout(function () { var n = root.querySelector('.apk-capture input'); if (n) n.focus(); }, 80); } },
          { ico: 'hoy', label: 'Ir a Hoy', run: go('hoy') },
          { ico: 'st_en_curso', label: 'Ir al Tablero', run: go('tablero') },
          { ico: 'libro', label: 'Ir al Archivo', run: go('archivo') },
          { ico: 'proyecto', label: 'Proyectos', run: projectsDialog },
          { ico: 'reloj', label: 'Ajustes del tablero', run: settingsDialog }
        ];
        if (st.ia) a.push({ ico: 'ia', label: 'Plan del día con IA', run: function () { go('hoy')(); planDia(); } }, { ico: 'ia', label: 'Convertir texto en tarjetas con IA', run: function () { captureAI(''); } });
        return a.map(function (x) { x.kind = 'Acción'; return x; });
      }
      function draw() {
        var raw = input.value.trim(), q = norm(raw);
        var cards = q ? st.cards.concat(st.archived || []).filter(function (c) { return norm(c.titulo + ' ' + (c.notas || '') + ' ' + (c.etiquetas || []).join(' ')).indexOf(q) > -1; }).slice(0, 8).map(function (c) {
          return { estado: c.estado, label: c.titulo, kind: c.archivada_en ? 'Archivada' : ESTADO_LABEL[c.estado], run: function () { detailDialog(c); } };
        }) : [];
        items = cards.concat(actions().filter(function (a) { return !q || norm(a.label).indexOf(q) > -1; }));
        if (raw) items.push({ ico: 'plus', label: 'Crear «' + clip(raw, 60) + '»', kind: 'Nueva', run: function () { createFrom(raw).catch(function (e) { failed(e, 'crear'); }); } });
        if (active >= items.length) active = Math.max(0, items.length - 1);
        list.textContent = '';
        items.forEach(function (it, i) {
          list.appendChild(h('li', { role: 'option', id: 'apk-pal-o' + i, class: 'apk-pal-item', 'aria-selected': String(i === active), onclick: function () { run(i); }, onmousemove: function () { if (active !== i) { active = i; mark(); } } }, [
            h('span', { class: 'apk-pal-ico' }, [it.estado ? stIcon(it.estado) : icon(it.ico)]), h('span', { class: 'apk-pal-label', text: it.label }), h('span', { class: 'apk-pal-kind', text: it.kind })
          ]));
        });
        mark();
      }
      function mark() {
        [].forEach.call(list.children, function (li, i) { li.setAttribute('aria-selected', String(i === active)); });
        if (!items.length) return input.removeAttribute('aria-activedescendant');
        input.setAttribute('aria-activedescendant', 'apk-pal-o' + active);
        var el = list.children[active]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      }
      function run(i) { var it = items[i]; if (!it) return; dlg.close(); it.run(); }
      input.addEventListener('input', function () { active = 0; draw(); });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); active = Math.max(0, active - 1); mark(); }
        else if (ev.key === 'Enter') { ev.preventDefault(); run(active); }
      });
      document.body.appendChild(dlg); dlg.showModal(); draw(); input.focus();
    }

    /* ── Teclado: Mayús + flechas mueve la tarjeta enfocada; Ctrl/⌘+Z deshace ── */
    root.addEventListener('keydown', function (ev) {
      var li = ev.target.closest && ev.target.closest('.apk-card[data-id]');
      if (!li || !ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey || ev.target.tagName === 'INPUT') return;
      var dx = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0, dy = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
      if (!dx && !dy) return;
      var c = byId(li.getAttribute('data-id')); if (!c || st.view !== 'tablero') return;
      ev.preventDefault();
      var ids = ESTADOS.map(function (e) { return e.id; }), i = ids.indexOf(c.estado);
      keep = c.id;
      if (dx) { var j = i + dx; if (j < 0 || j >= ids.length) return say('No hay más columnas en esa dirección.'); st.colTab = ids[j]; move(c, ids[j], 0, 'key'); }
      else { var col = column(st.cards, c.estado), k = col.indexOf(c) + dy; if (k < 0 || k >= col.length) return say('Ya está en el extremo de la columna.'); move(c, c.estado, k, 'key'); }
    });
    function onDocKey(ev) {
      if (!root.isConnected) return document.removeEventListener('keydown', onDocKey);
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { ev.preventDefault(); return palette(); }
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) && !document.querySelector('dialog[open]')) { ev.preventDefault(); doUndo(); }
    }
    document.addEventListener('keydown', onDocKey);
    function onVisible() {
      if (!root.isConnected) return document.removeEventListener('visibilitychange', onVisible);
      if (!document.hidden && dayKey(new Date()) !== today) resync();      // cambió el día con la pestaña abierta
    }
    document.addEventListener('visibilitychange', onVisible);
    /* «+ Tarjeta» de la barra móvil: el shell deja la intención y avisa (o navega a Hoy y se atiende al pintar; ver paintFirst) */
    function onIntent() {
      if (!root.isConnected) return document.removeEventListener('ap:intent', onIntent);
      if (ctx.takeIntent && ctx.takeIntent('nueva-tarjeta') && !document.querySelector('dialog[open]')) newDialog('pendiente');
    }

    /* ── Arrastrar y soltar (Pointer Events) ── */
    root.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 || st.view !== 'tablero') return;
      var el = ev.target.closest && ev.target.closest('.apk-card[data-id]'); if (!el) return;
      if (ev.target.closest('input, select, textarea, a')) return;       // los botones sí arrastran: un clic sin mover sigue siendo un clic
      if (ev.pointerType === 'touch' && !ev.target.closest('.apk-grip')) return;       // en táctil solo desde el asa: la tarjeta sigue desplazándose
      startDrag(ev, el);
    });
    root.addEventListener('click', function (ev) { if (Date.now() - lastDrag < 80) { ev.stopPropagation(); ev.preventDefault(); } }, true);   // el clic que cierra un arrastre no activa nada
    function startDrag(ev, el) {
      var card = byId(el.getAttribute('data-id')), board = root.querySelector('.apk-board'), active = false, ghost, drop, tgt = null;
      var sx = ev.clientX, sy = ev.clientY, px = sx, py = sy, rect, raf = 0, pid = ev.pointerId;
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      function begin() {
        active = true; rect = el.getBoundingClientRect();
        ghost = el.cloneNode(true); ghost.classList.add('apk-ghost'); ghost.removeAttribute('data-id');
        ghost.style.width = rect.width + 'px'; ghost.style.left = rect.left + 'px'; ghost.style.top = rect.top + 'px';
        document.body.appendChild(ghost);
        el.classList.add('is-src');
        drop = h('li', { class: 'apk-drop', 'aria-hidden': 'true' });
        root.classList.add('is-dragging');
        raf = requestAnimationFrame(tick);
      }
      function place() {
        var cols = [].slice.call(root.querySelectorAll('.apk-col')).filter(function (c) { return c.offsetParent !== null; }), best = null, bd = 1e9;
        cols.forEach(function (c) { var r = c.getBoundingClientRect(), d = px < r.left ? r.left - px : px > r.right ? px - r.right : 0; if (d < bd) { bd = d; best = c; } });
        if (!best) return;
        var list = best.querySelector('.apk-list'), items = [].slice.call(list.children).filter(function (x) { return x !== el && x !== drop; }), idx = 0;
        var shift = drop.parentNode === list ? drop.offsetHeight + 8 : 0;      // el hueco empuja a las de debajo: se descuenta para que el cálculo no oscile
        items.forEach(function (x) {
          var r = x.getBoundingClientRect(), after = shift && (drop.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (py > r.top - (after ? shift : 0) + r.height / 2) idx++;
        });
        if (items[idx]) list.insertBefore(drop, items[idx]); else list.appendChild(drop);
        tgt = { estado: list.getAttribute('data-estado'), index: idx, beforeId: items[idx] ? items[idx].getAttribute('data-id') : null };
        root.querySelectorAll('.apk-col.is-target').forEach(function (c) { c.classList.remove('is-target'); });
        best.classList.add('is-target');
      }
      function tick() {
        if (!active) return;
        ghost.style.transform = 'translate(' + (px - sx) + 'px,' + (py - sy) + 'px)';
        var br = board.getBoundingClientRect(), edge = 70, spd = reduce ? 10 : 18;
        if (px < br.left + edge) board.scrollLeft -= spd; else if (px > br.right - edge) board.scrollLeft += spd;
        if (py < 80) window.scrollBy(0, -spd); else if (py > innerHeight - 80) window.scrollBy(0, spd);
        place();
        raf = requestAnimationFrame(tick);
      }
      function onMove(e) {
        if (e.pointerId !== pid) return;
        px = e.clientX; py = e.clientY;
        if (!active && Math.hypot(px - sx, py - sy) > 6) begin();
        if (active) e.preventDefault();
      }
      function end(commit) {
        document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel); document.removeEventListener('keydown', onKey, true);
        cancelAnimationFrame(raf);
        if (!active) return;
        lastDrag = Date.now();
        if (commit) place();      // soltar antes del primer fotograma no debe perder el destino
        if (ghost) ghost.remove(); if (drop) drop.remove();
        el.classList.remove('is-src'); root.classList.remove('is-dragging');
        root.querySelectorAll('.apk-col.is-target').forEach(function (c) { c.classList.remove('is-target'); });
        if (commit && tgt && card) { keep = card.id; st.colTab = tgt.estado; move(card, tgt.estado, tgt.index, 'drag', tgt.beforeId); }
      }
      function onUp(e) { if (e.pointerId === pid) end(true); }
      function onCancel(e) { if (e.pointerId === pid) end(false); }
      function onKey(e) { if (e.key === 'Escape' && active) { e.preventDefault(); e.stopPropagation(); end(false); say('Movimiento cancelado.'); } }
      document.addEventListener('pointermove', onMove, { passive: false }); document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel); document.addEventListener('keydown', onKey, true);
    }

    /* ── Arranque ── */
    return load().then(function () {
      return function paintFirst() {
        ctx.view.appendChild(root);
        paint();
        iaCheck();
        document.addEventListener('ap:intent', onIntent);
        setTimeout(onIntent);      // Hoy monta el tablero en su caja justo después de este paint: se espera a que root esté en el documento
      };
    }).catch(function (err) {
      if (err && err.auth) throw err;
      if (missing(err)) {
        return function paintSetup() {
          ctx.view.appendChild(h('section', { class: 'apk apk-setup', 'aria-label': 'Centro de trabajo' }, [
            h('p', { text: 'Las tablas del tablero aún no existen en Supabase. Ejecuta supabase/kanban.sql en el SQL Editor (una vez, es idempotente) y recarga la página.' })
          ]));
        };
      }
      throw err;
    });
  }

  return { render: render, logic: logic };
})();
