/* ═══════════════════════════════════════════════
   area-privada-calendario.js — pestaña «Calendario» del área privada
   ─────────────────────────────────────────────────
   Rutas: #/calendario                      semana actual (día en pantallas estrechas)
          #/calendario/<vista>/<AAAA-MM-DD>  vista = dia | semana | mes | agenda
          (siguen funcionando #/calendario/agenda y #/calendario/AAAA-MM)

   Dos capas de datos:
   · Google Calendar (public.calendar_events): solo lectura, llega por la Edge Function
     «calendario-sync». La página nunca habla con Google.
   · Agenda propia (public.agenda, supabase/agenda.sql): eventos, bloques de foco y tareas
     que se crean, arrastran, redimensionan y editan aquí mismo.
   Las entrevistas enlazadas a un evento de Google (entrevistas.calendar_uid) se resaltan.

   Atajos: T hoy · D/S/M/A vistas · ← → anterior/siguiente · N nuevo · / buscar · ? ayuda
   ═══════════════════════════════════════════════ */
window.APCalendario = (function () {
  'use strict';

  var DAY = 864e5, HOUR_PX = 48, SNAP = 15;
  var VIEWS = [['dia', 'Día', 'D'], ['semana', 'Semana', 'S'], ['mes', 'Mes', 'M'], ['agenda', 'Agenda', 'A']];
  var TIPOS = [['evento', 'Evento'], ['foco', 'Bloque de foco'], ['tarea', 'Tarea']];
  var PRIORIDADES = [['1', 'Alta'], ['2', 'Media'], ['3', 'Baja']];
  // colores de categoría y de calendarios de Google: paleta de los manuales
  var PALETTE = ['#273A5F', '#1F8A7A', '#C8602F', '#B03A4E', '#9A6414', '#4A628E', '#BE5F8A'];
  var C_GOOGLE = '#4A628E', C_INTERVIEW = '#273A5F', C_OWN = '#1D2638', C_FOCUS = '#1F8A7A', C_TASK = '#9A6414';
  var PREFS_KEY = 'bm_ap_cal_prefs';
  var JSON_REP = { 'Content-Type': 'application/json', Prefer: 'return=representation' };

  var ctx = null, view = null, flash = '', q = '';
  var data = { google: [], own: [], tasks: [], links: {}, syncs: [], cats: [], googleReady: true, ownReady: true };
  var prefs = loadPrefs();
  var keysBound = false;

  var fmt = {
    month: new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }),
    monthShort: new Intl.DateTimeFormat('es-ES', { month: 'short' }),
    day: new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
    dayYear: new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    wd: new Intl.DateTimeFormat('es-ES', { weekday: 'short' }),
    short: new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }),
    rel: new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' })
  };
  var num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

  /* ═══════════ FECHAS ═══════════ */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function monday(d) { return addDays(startOfDay(d), -((d.getDay() + 6) % 7)); }
  function minutesOf(d) { return d.getHours() * 60 + d.getMinutes(); }
  function atMinutes(day, m) { var x = startOfDay(day); x.setMinutes(m); return x; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function timeInput(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function weekNumber(d) {   // ISO 8601
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / DAY + 1) / 7);
  }
  function ago(iso) {
    var mins = Math.round((new Date(iso) - Date.now()) / 60000);
    return Math.abs(mins) < 60 ? fmt.rel.format(mins, 'minute') : Math.abs(mins) < 1440 ? fmt.rel.format(Math.round(mins / 60), 'hour') : fmt.rel.format(Math.round(mins / 1440), 'day');
  }
  function hours(ms) { return num.format(ms / 36e5) + ' h'; }

  /* ═══════════ PREFERENCIAS (capas visibles, solo en este navegador) ═══════════ */
  function loadPrefs() {
    try { var p = JSON.parse(localStorage.getItem(PREFS_KEY)); if (p && typeof p === 'object') return { hidden: p.hidden || {} }; } catch (e) {}
    return { hidden: {} };
  }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} }
  function visibleLayer(id) { return !prefs.hidden[id]; }

  /* ═══════════ RUTAS Y RANGOS ═══════════ */
  function parseArg(arg) {
    var today = startOfDay(new Date());
    if (arg === 'agenda') return { mode: 'agenda', anchor: today };
    var m = /^(\d{4})-(\d{2})$/.exec(arg);
    if (m) return { mode: 'mes', anchor: new Date(+m[1], +m[2] - 1, 1) };
    m = /^(dia|semana|mes|agenda)(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(arg);
    if (m) return { mode: m[1], anchor: m[2] ? fromKey(m[2]) : today };
    // sin vista explícita: semana en escritorio, día en pantallas estrechas (como Google Calendar)
    var narrow = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
    return { mode: narrow ? 'dia' : 'semana', anchor: today };
  }
  function href(mode, anchor) { return '#/calendario/' + mode + '/' + key(anchor); }
  function go(mode, anchor) { location.hash = href(mode, anchor); }
  function range(v) {
    var a = v.anchor;
    if (v.mode === 'dia') return { from: startOfDay(a), to: addDays(startOfDay(a), 1), days: 1 };
    if (v.mode === 'semana') { var m = monday(a); return { from: m, to: addDays(m, 7), days: 7 }; }
    if (v.mode === 'agenda') return { from: startOfDay(a), to: addDays(startOfDay(a), 60) };
    var first = new Date(a.getFullYear(), a.getMonth(), 1), gs = monday(first);
    var last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    return { from: gs, to: addDays(last, 7 - ((last.getDay() + 6) % 7)), first: first };
  }
  function step(dir) {
    var a = view.anchor;
    if (view.mode === 'dia') return addDays(a, dir);
    if (view.mode === 'semana') return addDays(a, 7 * dir);
    if (view.mode === 'agenda') return addDays(a, 30 * dir);
    return new Date(a.getFullYear(), a.getMonth() + dir, 1);
  }
  function title() {
    var r = view.range, a = view.anchor;
    if (view.mode === 'dia') return cap(fmt.dayYear.format(a));
    if (view.mode === 'mes') return cap(fmt.month.format(a));
    if (view.mode === 'agenda') return 'Próximos 60 días';
    var end = addDays(r.from, 6);
    return cap(r.from.getMonth() === end.getMonth() ? fmt.month.format(r.from) : fmt.monthShort.format(r.from).replace('.', '') + ' – ' + fmt.month.format(end));
  }

  /* ═══════════ DATOS ═══════════ */
  function missing(err) { return err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01'); }
  function soft(flag) {
    return function (err) {
      if (err && err.auth) throw err;
      if (flag && missing(err)) data[flag] = false;
      return [];
    };
  }
  function miniRange() {
    var a = view.anchor, first = new Date(a.getFullYear(), a.getMonth(), 1), gs = monday(first);
    return { from: gs, to: addDays(gs, 42), first: first };
  }
  function load() {
    var r = view.range, mini = miniRange();
    // la mini-agenda lateral muestra el mes del ancla: se pide la unión de los dos rangos
    var from = new Date(Math.min(r.from, mini.from)), to = new Date(Math.max(r.to, mini.to));
    var api = ctx.api;
    data.googleReady = true; data.ownReady = true;
    return Promise.all([
      api('/rest/v1/calendar_events?select=uid,starts_at,ends_at,all_day,title,location,description,url,calendar' +
        '&starts_at=lt.' + to.toISOString() + '&ends_at=gt.' + from.toISOString() + '&order=starts_at.asc&limit=3000').catch(soft('googleReady')),
      api('/rest/v1/calendar_sync?select=calendar,ran_at,ok,events,error&order=calendar.asc').catch(soft()),
      // propios que empiezan en la ventana (con margen para los que vienen de antes)
      api('/rest/v1/agenda?select=*&inicio=gte.' + addDays(from, -31).toISOString() + '&inicio=lt.' + to.toISOString() + '&order=inicio.asc&limit=3000').catch(soft('ownReady')),
      // todas las tareas pendientes (panel lateral), con o sin fecha
      api('/rest/v1/agenda?select=*&tipo=eq.tarea&hecho=eq.false&order=inicio.asc.nullslast,created_at.asc&limit=500').catch(soft()),
      api('/rest/v1/entrevistas?select=calendar_uid,proceso_id,fase,procesos(empresa)&calendar_uid=not.is.null').catch(soft()),
      api('/rest/v1/ap_opciones?select=valor&grupo=eq.agenda.categoria&order=posicion.asc,created_at.asc').catch(soft())
    ]).then(function (res) {
      data.google = res[0] || [];
      data.syncs = res[1] || [];
      data.own = res[2] || [];
      data.tasks = res[3] || [];
      data.links = {};
      (res[4] || []).forEach(function (e) { data.links[e.calendar_uid] = e; });
      data.cats = (res[5] || []).map(function (o) { return o.valor; });
    });
  }

  /* Normaliza las dos fuentes a un mismo formato para pintar */
  function googleCals() {
    var names = [];
    data.syncs.forEach(function (s) { if (names.indexOf(s.calendar) < 0) names.push(s.calendar); });
    data.google.forEach(function (e) { if (names.indexOf(e.calendar) < 0) names.push(e.calendar); });
    return names;
  }
  function googleColor(name) { var c = googleCals(); return c.length > 1 ? PALETTE[(c.indexOf(name) + 5) % PALETTE.length] : C_GOOGLE; }
  function catColor(c) { var i = data.cats.indexOf(c); return i < 0 ? null : PALETTE[i % PALETTE.length]; }
  function items() {
    var out = [];
    data.google.forEach(function (e) {
      var s = new Date(e.starts_at), en = new Date(e.ends_at);
      if (e.all_day) { s = new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()); en = new Date(en.getUTCFullYear(), en.getUTCMonth(), en.getUTCDate()); }
      var link = data.links[e.uid + '|' + e.starts_at] || null;
      out.push({
        id: 'g:' + e.uid + '|' + e.starts_at, src: 'google', kind: link ? 'entrevista' : 'google', layer: 'g:' + e.calendar,
        title: e.title, start: s, end: en > s ? en : new Date(s.getTime() + (e.all_day ? DAY : 30 * 6e4)), allDay: e.all_day,
        color: link ? C_INTERVIEW : googleColor(e.calendar),
        location: e.location, description: e.description, url: e.url, calendar: e.calendar, link: link, raw: e, editable: false
      });
    });
    data.own.forEach(function (a) { if (a.inicio) out.push(ownItem(a)); });
    return out.filter(function (it) { return visibleLayer(it.layer) && matches(it); });
  }
  function ownItem(a) {
    var s = new Date(a.inicio), en = a.fin ? new Date(a.fin) : new Date(s.getTime() + (a.todo_el_dia ? DAY : 30 * 6e4));
    if (a.todo_el_dia) { s = startOfDay(s); en = a.fin ? startOfDay(new Date(a.fin)) : addDays(s, 1); if (en <= s) en = addDays(s, 1); }
    return {
      id: 'a:' + a.id, src: 'own', kind: a.tipo, layer: a.tipo, title: a.titulo, start: s, end: en, allDay: a.todo_el_dia,
      color: catColor(a.categoria) || (a.tipo === 'foco' ? C_FOCUS : a.tipo === 'tarea' ? C_TASK : C_OWN), category: a.categoria,
      location: a.lugar, description: a.notas, url: a.enlace, done: a.hecho, priority: a.prioridad, raw: a,
      editable: !a.todo_el_dia
    };
  }
  function undatedTask(t) {
    return { id: 'a:' + t.id, src: 'own', kind: 'tarea', layer: 'tarea', title: t.titulo, start: null, end: null, allDay: true, raw: t, done: t.hecho,
      priority: t.prioridad, category: t.categoria, description: t.notas, url: t.enlace, location: t.lugar, color: catColor(t.categoria) || C_TASK };
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function matches(it) {
    if (!q) return true;
    var hay = norm([it.title, it.location, it.description, it.category, it.calendar, it.link && it.link.procesos && it.link.procesos.empresa].join(' '));
    return norm(q).split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) > -1; });
  }
  function onDay(list, day) {
    var s = startOfDay(day), e = addDays(s, 1);
    return list.filter(function (it) { return it.start < e && it.end > s; });
  }

  /* ═══════════ ENTRADA ═══════════ */
  function render(c) {
    ctx = c;
    view = parseArg(ctx.arg || '');
    view.range = range(view);
    bindKeys();
    return load().then(function () { return paint; });
  }
  function rerender() { if (ctx.isCurrent()) window.dispatchEvent(new HashChangeEvent('hashchange')); }

  /* ═══════════ PINTADO GENERAL ═══════════ */
  var ui = {}, grid = null;
  function paint() {
    var h = ctx.h;
    ctx.view.textContent = '';
    grid = null;
    if (flash) { ctx.setStatus(flash); flash = ''; }
    var list = items();
    ui.main = h('div', { class: 'apc-main' });
    ctx.view.appendChild(h('div', { class: 'apc-app' }, [ui.main, sidebar(list)]));
    ui.main.appendChild(toolbar());
    ui.main.appendChild(summary(list));
    if (!data.googleReady && !data.ownReady) ui.main.appendChild(setupNote());
    if (view.mode === 'mes') ui.main.appendChild(month(list));
    else if (view.mode === 'agenda') ui.main.appendChild(agenda(list));
    else ui.main.appendChild(timeGrid(list));
    if (grid) scrollToMorning();
  }

  function setupNote() {
    var h = ctx.h;
    return h('div', { class: 'ap-empty apc-setup' }, [
      h('p', { class: 'ap-empty-title', text: 'El calendario aún no está conectado' }),
      h('p', { text: 'Ejecuta supabase/calendario.sql y supabase/agenda.sql en Supabase; la sincronización con Google se explica en supabase/functions/calendario-sync/README.md.' })
    ]);
  }

  /* ── Barra superior ── */
  function toolbar() {
    var h = ctx.h;
    ui.search = h('input', { type: 'search', id: 'apc-q', placeholder: 'Buscar', autocomplete: 'off', value: q,
      oninput: function () { q = this.value; repaintKeepFocus(); } });
    return h('div', { class: 'apc-toolbar' }, [
      h('div', { class: 'apc-nav' }, [
        h('a', { class: 'ap-tool', href: href(view.mode, startOfDay(new Date())), text: 'Hoy', 'aria-keyshortcuts': 'T' }),
        h('div', { class: 'apc-arrows' }, [
          h('a', { class: 'ap-tool apc-arrow', href: href(view.mode, step(-1)), 'aria-label': 'Periodo anterior', text: '‹' }),
          h('a', { class: 'ap-tool apc-arrow', href: href(view.mode, step(1)), 'aria-label': 'Periodo siguiente', text: '›' })
        ]),
        h('h2', { class: 'apc-month' }, [title(), view.mode === 'semana' ? h('span', { class: 'apc-weekno', text: 'Semana ' + weekNumber(view.range.from) }) : null])
      ]),
      h('div', { class: 'apc-right' }, [
        h('div', { class: 'ap-search apc-search' }, [
          h('label', { class: 'sr-only', for: 'apc-q', text: 'Buscar en el calendario' }),
          h('span', { class: 'ap-search-ico', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' }),
          ui.search
        ]),
        h('nav', { class: 'ape-subnav apc-modes', 'aria-label': 'Vista del calendario' }, VIEWS.map(function (v) {
          return h('a', { href: href(v[0], view.anchor), 'aria-current': view.mode === v[0] ? 'page' : null, 'aria-keyshortcuts': v[2], text: v[1] });
        })),
        h('button', { type: 'button', class: 'ap-tool apc-help-btn', 'aria-label': 'Atajos de teclado', 'aria-keyshortcuts': 'Shift+?', text: '?', onclick: help })
      ])
    ]);
  }
  function repaintKeepFocus() {
    var pos = ui.search.selectionStart;
    paint();
    ui.search.focus();
    try { ui.search.setSelectionRange(pos, pos); } catch (e) {}
  }

  /* ── Resumen del periodo: carga de trabajo ── */
  function summary(list) {
    var h = ctx.h, r = view.range;
    var inRange = list.filter(function (it) { return it.start < r.to && it.end > r.from; });
    var timed = inRange.filter(function (it) { return !it.allDay; });
    var sum = function (arr) { return arr.reduce(function (s, it) { return s + (Math.min(it.end, r.to) - Math.max(it.start, r.from)); }, 0); };
    var meetings = sum(timed.filter(function (it) { return it.kind === 'google' || it.kind === 'entrevista' || it.kind === 'evento'; }));
    var focus = sum(timed.filter(function (it) { return it.kind === 'foco'; }));
    var interviews = inRange.filter(function (it) { return it.kind === 'entrevista'; }).length;
    var today = startOfDay(new Date());
    var overdue = data.tasks.filter(function (t) { return t.inicio && new Date(t.inicio) < today; }).length;
    var due = data.tasks.filter(function (t) { return t.inicio && new Date(t.inicio) >= r.from && new Date(t.inicio) < r.to; }).length;
    var label = { dia: 'Este día', semana: 'Esta semana', mes: 'Este mes', agenda: 'Próximos 60 días' }[view.mode];
    var stat = function (v, t, cls) { return h('li', { class: 'apc-stat' + (cls ? ' ' + cls : '') }, [h('strong', { text: v }), ' ', h('span', { text: t })]); };
    return h('ul', { class: 'apc-summary', 'aria-label': 'Resumen de ' + label.toLowerCase() }, [
      h('li', { class: 'apc-stat apc-stat--label', text: label }),
      stat(hours(meetings), 'de reuniones y eventos'),
      stat(hours(focus), 'de foco'),
      stat(String(interviews), interviews === 1 ? 'entrevista' : 'entrevistas'),
      stat(String(due), due === 1 ? 'tarea con fecha' : 'tareas con fecha'),
      overdue ? stat(String(overdue), overdue === 1 ? 'vencida' : 'vencidas', 'is-alert') : null,
      q ? stat(String(inRange.length), inRange.length === 1 ? 'coincidencia' : 'coincidencias', 'is-search') : null
    ]);
  }

  /* ═══════════ BARRA LATERAL ═══════════ */
  function sidebar(list) {
    var h = ctx.h;
    return h('aside', { class: 'apc-side', 'aria-label': 'Herramientas del calendario' }, [
      h('button', { type: 'button', class: 'btn btn-primary apc-new', 'aria-keyshortcuts': 'N', onclick: function () { openForm(null, defaultSlot()); } }, [h('span', { 'aria-hidden': 'true', text: '+ ' }), 'Nuevo']),
      miniMonth(list),
      tasksPanel(),
      layersPanel(),
      syncPanel()
    ]);
  }
  function defaultSlot() {
    var now = new Date(), base = (view.mode === 'dia' || view.mode === 'semana') && key(view.anchor) !== key(now) ? view.anchor : now;
    var m = key(base) === key(now) ? Math.ceil(minutesOf(now) / 30) * 30 : 9 * 60;
    var s = atMinutes(base, Math.min(22 * 60, m));
    return { start: s, end: new Date(s.getTime() + 36e5), allDay: false };
  }

  function miniMonth(list) {
    var h = ctx.h, mr = miniRange(), today = key(new Date()), r = view.range;
    var target = view.mode === 'agenda' ? 'dia' : view.mode;
    var rows = [h('tr', null, ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(function (d) { return h('th', { scope: 'col', class: 'apc-mini-wd', text: d }); }))];
    for (var w = 0; w < 6; w++) {
      var tr = h('tr');
      for (var i = 0; i < 7; i++) {
        var d = addDays(mr.from, w * 7 + i), k = key(d), has = onDay(list, d).length > 0;
        var inView = (view.mode === 'dia' || view.mode === 'semana') && d >= r.from && d < r.to;
        tr.appendChild(h('td', null, [h('a', {
          class: 'apc-mini-day' + (d.getMonth() !== mr.first.getMonth() ? ' is-out' : '') + (k === today ? ' is-today' : '') + (inView ? ' is-range' : '') + (has ? ' has-items' : ''),
          href: href(target, d), 'aria-label': cap(fmt.day.format(d)) + (has ? ', con elementos' : ''), 'aria-current': k === today ? 'date' : null,
          text: String(d.getDate())
        })]));
      }
      rows.push(tr);
    }
    var prev = new Date(mr.first.getFullYear(), mr.first.getMonth() - 1, 1), next = new Date(mr.first.getFullYear(), mr.first.getMonth() + 1, 1);
    return h('section', { class: 'apc-panel apc-mini', 'aria-labelledby': 'apc-mini-t' }, [
      h('div', { class: 'apc-mini-head' }, [
        h('p', { class: 'apc-mini-title', id: 'apc-mini-t', text: cap(fmt.month.format(mr.first)) }),
        h('a', { class: 'apc-mini-nav', href: href(target === 'mes' ? 'mes' : target, prev), 'aria-label': 'Mes anterior', text: '‹' }),
        h('a', { class: 'apc-mini-nav', href: href(target === 'mes' ? 'mes' : target, next), 'aria-label': 'Mes siguiente', text: '›' })
      ]),
      h('table', { class: 'apc-mini-grid' }, [h('caption', { class: 'sr-only', text: 'Mini calendario de ' + fmt.month.format(mr.first) }), h('tbody', null, rows)])
    ]);
  }

  function layersPanel() {
    var h = ctx.h;
    var layers = googleCals().map(function (c) { return ['g:' + c, 'Google · ' + c, googleColor(c)]; })
      .concat([['evento', 'Mis eventos', C_OWN], ['foco', 'Bloques de foco', C_FOCUS], ['tarea', 'Tareas con fecha', C_TASK]]);
    return h('section', { class: 'apc-panel', 'aria-labelledby': 'apc-layers-t' }, [
      h('p', { class: 'apc-panel-title', id: 'apc-layers-t', text: 'Calendarios' }),
      h('ul', { class: 'apc-layers' }, layers.map(function (l, i) {
        var cb = h('input', { type: 'checkbox', id: 'apc-l' + i, checked: visibleLayer(l[0]), onchange: function () {
          if (this.checked) delete prefs.hidden[l[0]]; else prefs.hidden[l[0]] = 1;
          savePrefs(); paint();
          var again = document.getElementById('apc-l' + i); if (again) again.focus();
        } });
        var sw = h('span', { class: 'apc-swatch', 'aria-hidden': 'true' });
        sw.style.setProperty('--c', l[2]);
        return h('li', null, [h('label', { class: 'apc-layer', for: 'apc-l' + i }, [cb, sw, l[1]])]);
      })),
      h('p', { class: 'apc-legend' }, [h('span', { class: 'apc-swatch is-interview', 'aria-hidden': 'true' }), 'Entrevista enlazada a un proceso'])
    ]);
  }

  /* ── Tareas pendientes ── */
  var showAllTasks = false;
  function tasksPanel() {
    var h = ctx.h, today = startOfDay(new Date()), tomorrow = addDays(today, 1);
    var bucket = function (t) { if (!t.inicio) return 3; var d = new Date(t.inicio); return d < today ? 0 : d < tomorrow ? 1 : 2; };
    var list = data.tasks.slice().sort(function (a, b) {
      return (bucket(a) - bucket(b)) || ((a.prioridad || 9) - (b.prioridad || 9)) || String(a.inicio).localeCompare(String(b.inicio));
    });
    var shown = showAllTasks ? list : list.slice(0, 7);
    var input = h('input', { type: 'text', id: 'apc-quick', placeholder: 'Nueva tarea…', maxlength: '200', autocomplete: 'off' });
    var when = ctx.ui.select([['hoy', 'Hoy'], ['manana', 'Mañana'], ['', 'Sin fecha']], 'hoy');
    when.id = 'apc-quick-when';
    var form = h('form', { class: 'apc-quick', onsubmit: function (e) {
      e.preventDefault();
      var t = input.value.trim();
      if (!t) return input.focus();
      var d = when.value === 'hoy' ? today : when.value === 'manana' ? tomorrow : null;
      input.disabled = true;
      create({ tipo: 'tarea', titulo: t.slice(0, 200), inicio: d ? d.toISOString() : null, todo_el_dia: !!d })
        .then(function () { flash = 'Tarea añadida: «' + t + '».'; rerender(); })
        .catch(function (err) { input.disabled = false; ctx.fail(err); });
    } }, [
      h('label', { class: 'sr-only', for: 'apc-quick', text: 'Nueva tarea (Intro para añadir)' }), input,
      h('label', { class: 'sr-only', for: 'apc-quick-when', text: 'Para cuándo' }), when
    ]);
    return h('section', { class: 'apc-panel', 'aria-labelledby': 'apc-tasks-t' }, [
      h('div', { class: 'apc-panel-head' }, [h('p', { class: 'apc-panel-title', id: 'apc-tasks-t', text: 'Tareas pendientes' }), h('span', { class: 'apx-count', text: String(list.length) })]),
      form,
      list.length ? h('ul', { class: 'apc-tasks' }, shown.map(function (t) {
        var b = bucket(t);
        var cb = h('input', { type: 'checkbox', id: 'apc-t-' + t.id, onchange: function () { toggleDone(t, true); } });
        var meta = b === 3 ? 'Sin fecha' : b === 0 ? 'Vencida · ' + fmt.short.format(new Date(t.inicio)) : b === 1 ? 'Hoy' : cap(fmt.short.format(new Date(t.inicio)));
        if (b !== 3 && !t.todo_el_dia) meta += ' · ' + fmt.time.format(new Date(t.inicio));
        return h('li', { class: 'apc-task' + (b === 0 ? ' is-overdue' : '') }, [
          h('label', { class: 'sr-only', for: 'apc-t-' + t.id, text: 'Hecha: ' + t.titulo }), cb,
          h('div', { class: 'apc-task-body' }, [
            h('button', { type: 'button', class: 'apc-task-title', onclick: function () { details(t.inicio ? ownItem(t) : undatedTask(t)); } }, [
              t.prioridad === 1 ? h('span', { class: 'apc-prio', text: 'Alta' }) : null, t.titulo
            ]),
            h('span', { class: 'apc-task-meta', text: meta })
          ])
        ]);
      })) : h('p', { class: 'apc-empty-note', text: 'Nada pendiente. Buen trabajo.' }),
      list.length > 7 ? h('button', { type: 'button', class: 'ap-link-btn apc-more-btn', text: showAllTasks ? 'Ver menos' : 'Ver las ' + list.length, onclick: function () { showAllTasks = !showAllTasks; paint(); } }) : null
    ]);
  }

  function syncPanel() {
    var h = ctx.h;
    var last = data.syncs.length ? data.syncs.reduce(function (a, b) { return a.ran_at > b.ran_at ? a : b; }) : null;
    var bad = data.syncs.filter(function (s) { return !s.ok; });
    var btn = h('button', { type: 'button', class: 'ap-tool apc-sync-btn', text: 'Sincronizar Google', onclick: function () { syncNow(btn); } });
    return h('section', { class: 'apc-panel apc-sync-panel', 'aria-label': 'Sincronización con Google Calendar' }, [
      h('p', { class: 'apc-sync' + (bad.length ? ' is-error' : '') },
        !data.googleReady ? 'Google Calendar sin conectar'
          : bad.length ? 'La última sincronización falló: ' + (bad[0].error || 'error desconocido')
            : last ? 'Google sincronizado ' + ago(last.ran_at) : 'Google aún sin sincronizar'),
      data.googleReady ? btn : null
    ]);
  }
  function syncNow(btn) {
    btn.disabled = true;
    ctx.setStatus('Sincronizando con Google Calendar…');
    ctx.api('/functions/v1/calendario-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) {
        var n = (r && r.results || []).reduce(function (a, x) { return a + (x.events || 0); }, 0);
        flash = 'Calendario actualizado: ' + n + ' eventos.';
        rerender();
      })
      .catch(function (err) { btn.disabled = false; ctx.fail(err); });
  }

  /* ═══════════ VISTA DÍA / SEMANA ═══════════ */
  function layoutDay(list, day) {
    // reparte en columnas los eventos que se solapan (como Google Calendar)
    var s0 = startOfDay(day), e0 = addDays(s0, 1);
    var evs = list.map(function (it) {
      var s = it.start < s0 ? s0 : it.start, e = it.end > e0 ? e0 : it.end;
      var sm = (s - s0) / 6e4;
      return { it: it, s: sm, e: Math.max((e - s0) / 6e4, sm + 20) };
    }).sort(function (a, b) { return (a.s - b.s) || (b.e - a.e); });
    var cluster = [], colsEnd = [], clusterEnd = -1, out = [];
    function close() { cluster.forEach(function (x) { x.n = colsEnd.length; }); out = out.concat(cluster); cluster = []; colsEnd = []; }
    evs.forEach(function (x) {
      if (x.s >= clusterEnd && cluster.length) close();
      var c = 0;
      while (c < colsEnd.length && colsEnd[c] > x.s) c++;
      colsEnd[c] = x.e;
      x.col = c;
      cluster.push(x);
      clusterEnd = Math.max(clusterEnd, x.e);
    });
    close();
    return out;
  }

  function timeGrid(list) {
    var h = ctx.h, r = view.range, days = [], today = key(new Date());
    for (var i = 0; i < r.days; i++) days.push(addDays(r.from, i));
    var allDay = list.filter(function (it) { return it.allDay; });
    var timed = list.filter(function (it) { return !it.allDay; });
    var wrap = h('div', { class: 'apc-tg' + (r.days === 1 ? ' is-day' : '') });
    wrap.style.setProperty('--days', r.days);

    // cabecera de días con su carga de trabajo
    var head = h('div', { class: 'apc-tg-head' }, [h('div', { class: 'apc-gutter' })]);
    days.forEach(function (d) {
      var mins = onDay(timed, d).reduce(function (s, it) {
        var a = Math.max(it.start, startOfDay(d)), b = Math.min(it.end, addDays(startOfDay(d), 1));
        return s + (b - a) / 6e4;
      }, 0);
      var bar = h('i');
      bar.style.width = Math.min(100, mins / (8 * 60) * 100) + '%';
      head.appendChild(h('a', { class: 'apc-dh' + (key(d) === today ? ' is-today' : ''), href: href('dia', d), 'aria-label': cap(fmt.day.format(d)) + ', ' + hours(mins * 6e4) + ' ocupadas' }, [
        h('span', { class: 'apc-dh-wd', text: fmt.wd.format(d).replace('.', '') }),
        h('span', { class: 'apc-dh-n', text: String(d.getDate()) }),
        h('span', { class: 'apc-load', 'aria-hidden': 'true' }, [bar])
      ]));
    });
    wrap.appendChild(head);

    // fila de «todo el día»
    var adRow = h('div', { class: 'apc-tg-allday' }, [h('div', { class: 'apc-gutter apc-gutter-label', text: 'Todo el día' })]);
    days.forEach(function (d) {
      adRow.appendChild(h('div', { class: 'apc-ad-cell' }, onDay(allDay, d).map(function (it) { return chip(it, true); })));
    });
    wrap.appendChild(adRow);

    // rejilla horaria
    var hoursCol = h('div', { class: 'apc-hours', 'aria-hidden': 'true' });
    for (var hr = 0; hr < 24; hr++) hoursCol.appendChild(h('span', { class: 'apc-hour', text: hr ? pad(hr) + ':00' : '' }));
    var colsBox = h('div', { class: 'apc-cols' });
    var cols = days.map(function (d, di) {
      var col = h('div', { class: 'apc-col' + (key(d) === today ? ' is-today' : ''), 'data-i': String(di) });
      layoutDay(onDay(timed, d), d).forEach(function (x) {
        var el = block(x.it, d);
        el.style.top = (x.s / 60 * HOUR_PX) + 'px';
        el.style.height = Math.max(18, (x.e - x.s) / 60 * HOUR_PX - 2) + 'px';
        el.style.left = 'calc(' + (x.col / x.n * 100) + '% + 2px)';
        el.style.width = 'calc(' + (100 / x.n) + '% - 4px)';
        col.appendChild(el);
      });
      if (key(d) === today) {
        var now = h('div', { class: 'apc-now', 'aria-hidden': 'true' });
        now.style.top = (minutesOf(new Date()) / 60 * HOUR_PX) + 'px';
        col.appendChild(now);
      }
      colsBox.appendChild(col);
      return col;
    });
    var body = h('div', { class: 'apc-tg-body', tabindex: '0', role: 'region', 'aria-label': 'Horario. Haz clic o arrastra en un hueco para crear.' }, [h('div', { class: 'apc-tg-inner' }, [hoursCol, colsBox])]);
    wrap.appendChild(body);
    grid = { cols: cols, days: days, body: body, box: colsBox };
    bindDrag(colsBox);
    return wrap;
  }
  function scrollToMorning() {
    var now = new Date(), inView = grid.days.some(function (d) { return key(d) === key(now); });
    grid.body.scrollTop = Math.max(0, ((inView ? minutesOf(now) - 90 : 7.5 * 60) / 60) * HOUR_PX);
  }

  function kindName(it) {
    return it.kind === 'entrevista' ? 'Entrevista' : it.kind === 'foco' ? 'Bloque de foco' : it.kind === 'tarea' ? (it.done ? 'Tarea hecha' : 'Tarea') : it.src === 'google' ? 'Google Calendar' : 'Evento';
  }
  function aria(it) {
    return it.title + ', ' + (it.allDay ? 'todo el día' : fmt.time.format(it.start) + ' a ' + fmt.time.format(it.end)) + ', ' + kindName(it);
  }
  function block(it, day) {
    var h = ctx.h;
    var short = (it.end - it.start) <= 35 * 6e4;
    var el = h('button', { type: 'button', class: 'apc-ev apc-ev--' + it.kind + (it.done ? ' is-done' : '') + (short ? ' is-short' : '') + (it.editable ? ' is-editable' : ''),
      'data-id': it.id, 'aria-label': aria(it) }, [
      h('span', { class: 'apc-ev-title', text: it.title }),
      h('span', { class: 'apc-ev-time', text: fmt.time.format(it.start) + (short ? '' : ' – ' + fmt.time.format(it.end)) }),
      it.location && !short ? h('span', { class: 'apc-ev-loc', text: it.location }) : null,
      it.editable && it.end <= addDays(startOfDay(day), 1) ? h('span', { class: 'apc-resize', 'aria-hidden': 'true' }) : null
    ]);
    el.style.setProperty('--c', it.color);
    el._item = it;
    return el;
  }
  function chip(it, allDayRow) {
    var h = ctx.h;
    var el = h('button', { type: 'button', class: 'apc-chip apc-chip--' + it.kind + (it.done ? ' is-done' : ''), 'data-id': it.id, 'aria-label': aria(it) }, [
      it.kind === 'tarea' ? h('span', { class: 'apc-chip-check', 'aria-hidden': 'true', text: it.done ? '✓' : '' }) : null,
      !it.allDay && !allDayRow ? h('span', { class: 'apc-chip-time', text: fmt.time.format(it.start) }) : null,
      h('span', { class: 'apc-chip-title', text: it.title })
    ]);
    el.style.setProperty('--c', it.color);
    el.addEventListener('click', function (e) { e.stopPropagation(); details(it); });
    return el;
  }

  /* ── Arrastrar: crear en un hueco, mover y redimensionar lo propio ── */
  function bindDrag(box) {
    var drag = null;
    function dayIndexAt(x) { var r = box.getBoundingClientRect(); return Math.max(0, Math.min(grid.days.length - 1, Math.floor((x - r.left) / (r.width / grid.days.length)))); }
    function minutesAt(y) { var r = grid.cols[0].getBoundingClientRect(); return Math.max(0, Math.min(24 * 60, (y - r.top) / HOUR_PX * 60)); }
    function snap(m) { return Math.round(m / SNAP) * SNAP; }
    function place(el, di, s, e) {
      if (el.parentNode !== grid.cols[di]) grid.cols[di].appendChild(el);
      el.style.top = (s / 60 * HOUR_PX) + 'px';
      el.style.height = Math.max(18, (e - s) / 60 * HOUR_PX - 2) + 'px';
    }
    box.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var ev = e.target.closest('.apc-ev');
      var di = dayIndexAt(e.clientX), m = minutesAt(e.clientY);
      if (ev) {
        var it = ev._item;
        if (!it.editable) { drag = { type: 'click', el: ev }; return; }
        var dayStart = startOfDay(grid.days[di]);
        var s = Math.max(0, (it.start - dayStart) / 6e4), dur = (it.end - it.start) / 6e4;
        drag = { type: e.target.classList.contains('apc-resize') ? 'resize' : 'move', el: ev, it: it, x: e.clientX, y: e.clientY,
          di0: di, di: di, offset: m - s, dur: dur, s: s, e: s + dur, moved: false };
      } else if (e.target === box || e.target.classList.contains('apc-col') || e.target.classList.contains('apc-now')) {
        var g = ctx.h('div', { class: 'apc-ghost', 'aria-hidden': 'true' });
        var a = Math.floor(m / SNAP) * SNAP;
        drag = { type: 'create', el: g, x: e.clientX, y: e.clientY, di: di, a: a, s: a, e: Math.min(24 * 60, a + 60), moved: false };
        place(g, di, drag.s, drag.e);
        g.textContent = timeLabel(drag.s) + ' – ' + timeLabel(drag.e);
      } else return;
      try { box.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    box.addEventListener('pointermove', function (e) {
      if (!drag || drag.type === 'click') return;
      if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
      drag.moved = true;
      var m = minutesAt(e.clientY);
      if (drag.type === 'create') {
        drag.s = drag.a; drag.e = Math.min(24 * 60, Math.max(drag.a + SNAP, snap(m)));
        place(drag.el, drag.di, drag.s, drag.e);
        drag.el.textContent = timeLabel(drag.s) + ' – ' + timeLabel(drag.e);
      } else if (drag.type === 'move') {
        drag.di = dayIndexAt(e.clientX);
        drag.s = Math.max(0, Math.min(24 * 60 - drag.dur, snap(m - drag.offset)));
        drag.e = drag.s + drag.dur;
        drag.el.classList.add('is-dragging');
        place(drag.el, drag.di, drag.s, drag.e);
      } else {
        drag.e = Math.max(drag.s + SNAP, Math.min(24 * 60, snap(m)));
        drag.el.classList.add('is-dragging');
        place(drag.el, drag.di0, drag.s, drag.e);
      }
    });
    function end(e) {
      if (!drag) return;
      var d = drag; drag = null;
      if (e.type === 'pointercancel') { if (d.type === 'create') d.el.remove(); else if (d.moved) paint(); return; }
      if (d.type === 'click' || (d.type !== 'create' && !d.moved)) { details(d.el._item); return; }
      if (d.type === 'create') {
        d.el.remove();
        var day = grid.days[d.di];
        openForm(null, { start: atMinutes(day, d.s), end: atMinutes(day, d.e), allDay: false });
        return;
      }
      var day2 = grid.days[d.type === 'move' ? d.di : d.di0];
      var s = atMinutes(day2, d.s), en = atMinutes(day2, d.e);
      update(d.it.raw.id, { inicio: s.toISOString(), fin: en.toISOString() })
        .then(function () { flash = '«' + d.it.title + '» · ' + fmt.short.format(s) + ', ' + fmt.time.format(s) + '–' + fmt.time.format(en) + '.'; rerender(); })
        .catch(function (err) { ctx.fail(err); paint(); });
    }
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    // teclado: el botón del evento abre su ficha con Intro o Espacio
    box.addEventListener('click', function (e) {
      var ev = e.target.closest && e.target.closest('.apc-ev');
      if (ev && e.detail === 0) details(ev._item);   // detail 0 = activado con teclado
    });
  }
  function timeLabel(m) { return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }

  /* ═══════════ VISTA MES ═══════════ */
  function month(list) {
    var h = ctx.h, r = view.range, today = key(new Date());
    var table = h('table', { class: 'apc-grid' }, [
      h('caption', { class: 'sr-only', text: 'Calendario de ' + fmt.month.format(r.first) }),
      h('thead', null, [h('tr', null, ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(function (d, i) {
        return h('th', { scope: 'col', abbr: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i], text: d });
      }))])
    ]);
    var body = h('tbody');
    for (var d = new Date(r.from); d < r.to;) {
      var tr = h('tr');
      for (var i = 0; i < 7; i++, d = addDays(d, 1)) {
        var k = key(d), dayList = onDay(list, d).sort(function (a, b) { return (b.allDay - a.allDay) || (a.start - b.start); });
        var td = h('td', { class: (d.getMonth() !== r.first.getMonth() ? 'is-out ' : '') + (k === today ? 'is-today' : '') }, [
          h('div', { class: 'apc-cell-head' }, [
            h('a', { class: 'apc-num', href: href('dia', d), 'aria-label': cap(fmt.day.format(d)) + (dayList.length ? ', ' + dayList.length + (dayList.length === 1 ? ' elemento' : ' elementos') : ''), text: String(d.getDate()) }),
            dayList.length ? h('span', { class: 'apc-dot' + (dayList.some(function (x) { return x.kind === 'entrevista'; }) ? ' is-interview' : ''), 'aria-hidden': 'true', text: String(dayList.length) }) : null
          ]),
          dayList.length ? h('div', { class: 'apc-evs' }, dayList.slice(0, 3).map(function (it) { return chip(it); })
            .concat(dayList.length > 3 ? [h('a', { class: 'apc-more', href: href('dia', d), text: '+' + (dayList.length - 3) + ' más' })] : [])) : null
        ]);
        (function (day) {
          td.addEventListener('dblclick', function (e) { if (!e.target.closest('a, button')) openForm(null, { start: atMinutes(day, 9 * 60), end: atMinutes(day, 10 * 60), allDay: false }); });
        })(new Date(d));
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    table.appendChild(body);
    return h('div', null, [h('div', { class: 'apc-grid-wrap' }, [table]), h('p', { class: 'apc-hint', text: 'Doble clic en un día para crear · clic en el número para abrir el día.' })]);
  }

  /* ═══════════ VISTA AGENDA ═══════════ */
  function agenda(list) {
    var h = ctx.h, r = view.range, wrap = h('div', { class: 'apc-agenda' }), any = false;
    for (var d = new Date(r.from); d < r.to; d = addDays(d, 1)) {
      var dayList = onDay(list, d).sort(function (a, b) { return (b.allDay - a.allDay) || (a.start - b.start); });
      if (!dayList.length) continue;
      any = true;
      wrap.appendChild(h('section', { class: 'apc-agenda-day', 'aria-label': cap(fmt.day.format(d)) }, [
        h('h3', { class: 'apc-agenda-date' }, [
          h('a', { class: 'apc-agenda-n', href: href('dia', d), 'aria-label': 'Abrir el ' + fmt.day.format(d), text: String(d.getDate()) }),
          h('span', { text: cap(fmt.day.format(d)) })
        ]),
        h('ul', { class: 'apc-list' }, dayList.map(listItem))
      ]));
    }
    if (!any) wrap.appendChild(h('div', { class: 'ap-empty' }, [h('p', { class: 'ap-empty-title', text: q ? 'Sin coincidencias' : 'Agenda despejada' }), h('p', { text: q ? 'Prueba con otra palabra.' : 'No hay nada en los próximos 60 días.' })]));
    return wrap;
  }
  function listItem(it) {
    var h = ctx.h;
    var li = h('li', { class: 'apc-item apc-item--' + it.kind + (it.done ? ' is-done' : '') }, [
      h('p', { class: 'apc-item-time', text: it.allDay ? 'Todo el día' : fmt.time.format(it.start) + '–' + fmt.time.format(it.end) }),
      h('div', null, [
        h('button', { type: 'button', class: 'apc-item-title', onclick: function () { details(it); } }, [it.title]),
        h('p', { class: 'ape-meta', text: [kindLabel(it), it.location].filter(Boolean).join(' · ') })
      ])
    ]);
    li.style.setProperty('--c', it.color);
    return li;
  }
  function kindLabel(it) {
    if (it.kind === 'entrevista') return 'Entrevista · ' + ((it.link.procesos && it.link.procesos.empresa) || 'proceso');
    if (it.src === 'google') return 'Google · ' + it.calendar;
    return kindName(it) + (it.category ? ' · ' + it.category : '');
  }

  /* ═══════════ FICHA DE UN ELEMENTO ═══════════ */
  function gcalUrl(it) {
    var f = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var g = function (d) { return key(d).replace(/-/g, ''); };
    var dates = it.allDay ? g(it.start) + '/' + g(it.end) : f(it.start) + '/' + f(it.end);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(it.title) + '&dates=' + dates +
      (it.description ? '&details=' + encodeURIComponent(it.description) : '') + (it.location ? '&location=' + encodeURIComponent(it.location) : '');
  }
  function details(it) {
    var h = ctx.h, dlg;
    var close = function () { dlg.close(); };
    var act = function (text, fn, cls) { return h('button', { type: 'button', class: 'ap-tool' + (cls ? ' ' + cls : ''), text: text, onclick: function () { close(); fn(); } }); };
    var ext = function (url, text) { return h('a', { class: 'ap-tool', href: url, target: '_blank', rel: 'noopener noreferrer' }, [text, h('span', { class: 'sr-only', text: ' (abre en pestaña nueva)' })]); };
    var when = !it.start ? 'Sin fecha'
      : it.allDay ? cap(fmt.day.format(it.start)) + (it.end - it.start > DAY ? ' – ' + fmt.day.format(addDays(it.end, -1)) : '') + ' · todo el día'
        : cap(fmt.day.format(it.start)) + ' · ' + fmt.time.format(it.start) + '–' + fmt.time.format(it.end) + ' (' + hours(it.end - it.start) + ')';
    var actions = [];
    if (it.src === 'own') {
      if (it.kind === 'tarea') actions.push(act(it.done ? 'Marcar como pendiente' : 'Marcar como hecha', function () { toggleDone(it.raw, !it.done); }, 'ap-tool--dark'));
      actions.push(act('Editar', function () { openForm(it.raw); }, it.kind === 'tarea' ? '' : 'ap-tool--dark'));
      actions.push(act('Duplicar', function () { duplicate(it.raw); }));
      if (it.start) actions.push(ext(gcalUrl(it), 'Añadir a Google Calendar'));
      actions.push(act('Eliminar', function () { remove(it); }, 'ap-tool--danger'));
    } else {
      if (it.link) actions.push(h('a', { class: 'ap-tool ap-tool--dark', href: '#/entrevistas/' + it.link.proceso_id, onclick: close, text: 'Ver el proceso' }));
      if (!it.allDay) actions.push(act('Reservar 1 h para prepararlo', function () {
        var s = new Date(it.start.getTime() - 2 * 36e5);
        openForm({ tipo: 'foco', titulo: 'Preparar: ' + it.title, inicio: s.toISOString(), fin: new Date(s.getTime() + 36e5).toISOString(), todo_el_dia: false, categoria: data.cats[0] || null });
      }));
      actions.push(act('Crear tarea de seguimiento', function () {
        var d = addDays(startOfDay(it.end), 1);
        openForm({ tipo: 'tarea', titulo: 'Seguimiento: ' + it.title, inicio: d.toISOString(), todo_el_dia: true, prioridad: 2, categoria: data.cats[0] || null });
      }));
      if (it.url) actions.push(ext(it.url, 'Abrir enlace'));
    }
    var dot = h('span', { class: 'apc-swatch', 'aria-hidden': 'true' });
    dot.style.setProperty('--c', it.color);
    dlg = h('dialog', { class: 'ap-dialog apc-detail', 'aria-labelledby': 'apc-d-title', onclose: function () { dlg.remove(); } }, [
      h('div', { class: 'apc-detail-head' }, [
        h('p', { class: 'apc-detail-kind' }, [dot, kindLabel(it)]),
        h('button', { type: 'button', class: 'apc-close', 'aria-label': 'Cerrar', text: '×', onclick: close })
      ]),
      h('h2', { class: 'ap-dialog-title', id: 'apc-d-title', text: it.title }),
      h('p', { class: 'apc-detail-when', text: when }),
      it.priority ? h('p', { class: 'ape-meta', text: 'Prioridad ' + { 1: 'alta', 2: 'media', 3: 'baja' }[it.priority] }) : null,
      it.location ? h('p', { class: 'apc-detail-row' }, [h('span', { class: 'ap-label', text: 'Lugar' }), it.location]) : null,
      it.url && it.src === 'own' ? h('p', { class: 'apc-detail-row' }, [h('span', { class: 'ap-label', text: 'Enlace' }), h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: it.url.replace(/^https?:\/\//, '').slice(0, 60) })]) : null,
      it.description ? h('p', { class: 'apc-detail-desc', text: it.description.slice(0, 1200) }) : null,
      it.src === 'google' ? h('p', { class: 'apc-detail-note', text: 'Evento de Google Calendar: se edita en Google y llega aquí con la sincronización.' }) : null,
      h('div', { class: 'apc-detail-actions' }, actions)
    ]);
    document.body.appendChild(dlg);
    dlg.showModal();
    var first = dlg.querySelector('.apc-detail-actions > *');
    (first || dlg.querySelector('.apc-close')).focus();
  }

  /* ═══════════ ESCRITURA ═══════════ */
  function create(row) { return ctx.api('/rest/v1/agenda?select=id', { method: 'POST', headers: JSON_REP, body: JSON.stringify(row) }).then(function (r) { return r[0]; }); }
  function update(id, patch) { return ctx.api('/rest/v1/agenda?id=eq.' + id + '&select=id', { method: 'PATCH', headers: JSON_REP, body: JSON.stringify(patch) }).then(function (r) { return r[0]; }); }
  function toggleDone(t, done) {
    update(t.id, { hecho: done }).then(function () { flash = done ? 'Hecha: «' + t.titulo + '».' : 'Pendiente otra vez: «' + t.titulo + '».'; rerender(); }).catch(ctx.fail);
  }
  function duplicate(a) {
    create({ tipo: a.tipo, titulo: (a.titulo + ' (copia)').slice(0, 200), inicio: a.inicio, fin: a.fin, todo_el_dia: a.todo_el_dia, prioridad: a.prioridad, categoria: a.categoria, lugar: a.lugar, enlace: a.enlace, notas: a.notas })
      .then(function () { flash = 'Duplicado: «' + a.titulo + '».'; rerender(); }).catch(ctx.fail);
  }
  function remove(it) {
    ctx.ask({ title: '¿Eliminar «' + it.title + '»?', text: 'Se borra de tu agenda. No se puede deshacer.', ok: 'Eliminar', danger: true }).then(function (yes) {
      if (!yes) return;
      return ctx.api('/rest/v1/agenda?id=eq.' + it.raw.id, { method: 'DELETE' }).then(function () { flash = 'Eliminado: «' + it.title + '».'; rerender(); });
    }).catch(ctx.fail);
  }

  /* Crear / editar. a: fila de agenda (sin id = nueva con valores sugeridos) · slot: hueco {start, end, allDay} */
  function openForm(a, slot) {
    var u = ctx.ui, h = ctx.h, isNew = !a || !a.id;
    a = a || {};
    var s = a.inicio ? new Date(a.inicio) : slot ? slot.start : null;
    var e = a.fin ? new Date(a.fin) : slot ? slot.end : null;
    var allDay = a.inicio ? !!a.todo_el_dia : slot ? !!slot.allDay : false;
    var f = {
      tipo: u.select(TIPOS, a.tipo || 'evento'),
      titulo: u.input('text', a.titulo, { required: true, maxlength: '200' }),
      fecha: u.input('date', s ? key(s) : ''),
      ini: u.input('time', s && !allDay ? timeInput(s) : '09:00', { step: '900' }),
      fin: u.input('time', e && !allDay ? timeInput(e) : '10:00', { step: '900' }),
      todo: h('input', { type: 'checkbox', id: 'apc-f-todo', checked: allDay }),
      cat: u.select(data.cats.concat(a.categoria && data.cats.indexOf(a.categoria) < 0 ? [a.categoria] : []), a.categoria || '', 'Sin categoría'),
      prio: u.select(PRIORIDADES, a.prioridad ? String(a.prioridad) : '', 'Sin prioridad'),
      lugar: u.input('text', a.lugar, { maxlength: '300' }),
      enlace: u.input('url', a.enlace, { maxlength: '2000', placeholder: 'https://', inputmode: 'url' }),
      notas: u.area(a.notas, 3, 4000)
    };
    var timeFields = [u.field('apc-f-ini', 'Inicio', f.ini), u.field('apc-f-fin', 'Fin', f.fin)];
    var prioField = u.field('apc-f-prio', 'Prioridad', f.prio);
    function sync() {
      var tarea = f.tipo.value === 'tarea';
      timeFields.forEach(function (n) { n.hidden = f.todo.checked; });
      prioField.hidden = !tarea;
    }
    f.tipo.addEventListener('change', sync);
    f.todo.addEventListener('change', sync);
    u.formDialog(isNew ? 'Nuevo en la agenda' : 'Editar', isNew ? 'Crear' : 'Guardar cambios', [
      u.field('apc-f-tipo', 'Tipo', f.tipo),
      u.field('apc-f-cat', 'Categoría', f.cat, { hint: 'Se gestionan en Configuración.' }),
      u.field('apc-f-tit', 'Título', f.titulo, { wide: true }),
      u.field('apc-f-fecha', 'Fecha', f.fecha, { hint: 'En las tareas es opcional.' }),
      h('div', { class: 'apf-field apc-f-todo' }, [h('label', { class: 'apf-check', for: 'apc-f-todo' }, [f.todo, ' Todo el día'])]),
      timeFields[0], timeFields[1], prioField,
      u.field('apc-f-lugar', 'Lugar', f.lugar),
      u.field('apc-f-enlace', 'Enlace', f.enlace),
      u.field('apc-f-notas', 'Notas', f.notas, { wide: true })
    ], function () {
      var tipo = f.tipo.value, titulo = f.titulo.value.trim(), fecha = f.fecha.value, todo = f.todo.checked;
      if (!titulo) throw u.invalid('Ponle un título.', f.titulo);
      if (!fecha && tipo !== 'tarea') throw u.invalid('Indica la fecha.', f.fecha);
      var row = { tipo: tipo, titulo: titulo, todo_el_dia: !!fecha && todo, categoria: f.cat.value || null,
        prioridad: tipo === 'tarea' && f.prio.value ? +f.prio.value : null, lugar: f.lugar.value.trim() || null,
        enlace: f.enlace.value.trim() || null, notas: f.notas.value.trim() || null, inicio: null, fin: null };
      if (row.enlace && !/^https?:\/\//i.test(row.enlace)) throw u.invalid('El enlace tiene que empezar por http:// o https://', f.enlace);
      if (fecha) {
        var day = fromKey(fecha);
        if (todo) { row.inicio = day.toISOString(); row.fin = tipo === 'tarea' ? null : addDays(day, 1).toISOString(); }
        else {
          if (!f.ini.value) throw u.invalid('Indica la hora de inicio.', f.ini);
          var ps = f.ini.value.split(':'), st = atMinutes(day, +ps[0] * 60 + +ps[1]);
          row.inicio = st.toISOString();
          if (tipo !== 'tarea' || f.fin.value) {
            var pe = (f.fin.value || '').split(':'), en = atMinutes(day, +pe[0] * 60 + +pe[1]);
            if (!f.fin.value || en <= st) throw u.invalid('El fin tiene que ser posterior al inicio.', f.fin);
            row.fin = en.toISOString();
          }
        }
      }
      return (isNew ? create(row) : update(a.id, row)).then(function () {
        flash = (isNew ? 'Creado: «' : 'Guardado: «') + titulo + '».';
        // si se ha creado fuera del periodo que se ve, se navega hasta él
        if (row.inicio && (new Date(row.inicio) < view.range.from || new Date(row.inicio) >= view.range.to)) go(view.mode === 'agenda' ? 'semana' : view.mode, startOfDay(new Date(row.inicio)));
        else rerender();
      });
    }, f.titulo);
    sync();
  }

  /* ═══════════ ATAJOS DE TECLADO ═══════════ */
  function bindKeys() {
    if (keysBound) return;
    keysBound = true;
    document.addEventListener('keydown', function (e) {
      if (!/^#\/calendario/.test(location.hash) || !view || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable) || document.querySelector('dialog[open]')) return;
      var k = e.key.toLowerCase();
      var map = { d: 'dia', s: 'semana', w: 'semana', m: 'mes', a: 'agenda' };
      if (k === 't') go(view.mode, startOfDay(new Date()));
      else if (map[k]) go(map[k], view.anchor);
      else if (e.key === 'ArrowLeft' || k === 'j') go(view.mode, step(-1));
      else if (e.key === 'ArrowRight' || k === 'k') go(view.mode, step(1));
      else if (k === 'n' || k === 'c') openForm(null, defaultSlot());
      else if (e.key === '/') { if (ui.search) ui.search.focus(); }
      else if (e.key === '?') help();
      else return;
      e.preventDefault();
    });
  }
  function help() {
    var h = ctx.h, dlg;
    var rows = [['T', 'Ir a hoy'], ['D · S · M · A', 'Vista día, semana, mes o agenda'], ['← →', 'Periodo anterior o siguiente'], ['N', 'Nuevo evento, bloque o tarea'], ['/', 'Buscar'], ['?', 'Esta ayuda'],
      ['Clic o arrastre en un hueco', 'Crear en ese horario'], ['Arrastrar un evento propio', 'Moverlo, también a otro día'], ['Borde inferior del evento', 'Cambiar la duración']];
    dlg = h('dialog', { class: 'ap-dialog', 'aria-labelledby': 'apc-h-title', onclose: function () { dlg.remove(); } }, [
      h('h2', { class: 'ap-dialog-title', id: 'apc-h-title', text: 'Atajos del calendario' }),
      h('dl', { class: 'apc-keys' }, [].concat.apply([], rows.map(function (r) { return [h('dt', null, [h('kbd', { text: r[0] })]), h('dd', { text: r[1] })]; }))),
      h('div', { class: 'ap-dialog-actions' }, [h('button', { type: 'button', class: 'btn btn-primary', text: 'Entendido', onclick: function () { dlg.close(); } })])
    ]);
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  return { render: render };
})();
