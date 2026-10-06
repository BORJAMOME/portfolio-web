/* ═══════════════════════════════════════════════
   area-privada-calendario.js — pestaña «Calendario» del área privada
   ─────────────────────────────────────────────────
   Rutas: #/calendario            mes actual
          #/calendario/2026-11    un mes concreto
          #/calendario/agenda     próximos 60 días en lista
   Solo lectura: los eventos llegan de Google Calendar a public.calendar_events con
   la Edge Function «calendario-sync» (supabase/calendario.sql). La página nunca
   habla con Google. Las entrevistas enlazadas (entrevistas.calendar_uid) se resaltan.
   ═══════════════════════════════════════════════ */
window.APCalendario = (function () {
  'use strict';

  var ctx = null, events = [], links = {}, syncs = [], view = null, selected = null;
  var flash = '';   // aviso para después de redibujar (el shell limpia el estado al pintar)
  var DAY = 864e5;
  var WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  var WD_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
  var dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  var timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
  var rel = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  // los eventos de día completo se guardan a medianoche UTC: se leen con la fecha UTC
  function startDay(ev) { var s = new Date(ev.starts_at); return ev.all_day ? new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) : new Date(s.getFullYear(), s.getMonth(), s.getDate()); }
  function lastDay(ev) {
    var e = new Date(new Date(ev.ends_at).getTime() - 1);
    var d = ev.all_day ? new Date(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()) : new Date(e.getFullYear(), e.getMonth(), e.getDate());
    var s = startDay(ev);
    return d < s ? s : d;
  }
  function when(ev) {
    if (ev.all_day) return 'Todo el día';
    return timeFmt.format(new Date(ev.starts_at)) + '–' + timeFmt.format(new Date(ev.ends_at));
  }
  function ago(iso) {
    var mins = Math.round((new Date(iso) - Date.now()) / 60000);
    return Math.abs(mins) < 60 ? rel.format(mins, 'minute') : Math.abs(mins) < 1440 ? rel.format(Math.round(mins / 60), 'hour') : rel.format(Math.round(mins / 1440), 'day');
  }

  /* ── Datos ── */
  function load(from, to) {
    var api = ctx.api;
    return Promise.all([
      api('/rest/v1/calendar_events?select=uid,starts_at,ends_at,all_day,title,location,description,url,calendar' +
        '&starts_at=lt.' + to.toISOString() + '&ends_at=gt.' + from.toISOString() + '&order=starts_at.asc&limit=2000'),
      api('/rest/v1/calendar_sync?select=calendar,ran_at,ok,events,error&order=calendar.asc'),
      // entrevistas enlazadas a un evento; si la tabla aún no existe, sin resaltado
      api('/rest/v1/entrevistas?select=calendar_uid,proceso_id,fase,procesos(empresa)&calendar_uid=not.is.null').catch(function () { return []; })
    ]).then(function (r) {
      events = r[0] || [];
      syncs = r[1] || [];
      links = {};
      (r[2] || []).forEach(function (e) { links[e.calendar_uid] = e; });
    });
  }
  function linkOf(ev) { return links[ev.uid + '|' + ev.starts_at] || null; }

  function render(c) {
    ctx = c;
    var arg = ctx.arg || '';
    var now = new Date();
    if (arg === 'agenda') {
      view = { mode: 'agenda', from: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
      view.to = addDays(view.from, 60);
    } else {
      var m = /^(\d{4})-(\d{2})$/.exec(arg);
      var first = m ? new Date(+m[1], +m[2] - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
      var gridStart = addDays(first, -((first.getDay() + 6) % 7));                   // lunes de la primera semana
      var last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      var gridEnd = addDays(last, 7 - ((last.getDay() + 6) % 7));                    // lunes siguiente al último domingo
      view = { mode: 'month', first: first, from: gridStart, to: gridEnd };
      if (!selected || fromKey(selected) < gridStart || fromKey(selected) >= gridEnd)
        selected = first.getMonth() === now.getMonth() && first.getFullYear() === now.getFullYear() ? key(now) : key(first);
    }
    return load(view.from, view.to).then(function () { return paint; }, function (err) {
      if (err && err.auth) throw err;
      // la tabla no existe todavía (calendario sin configurar)
      if (err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01')) return paintSetup;
      throw err;
    });
  }

  function byDay() {
    var map = {};
    events.forEach(function (ev) {
      for (var d = startDay(ev), end = lastDay(ev), i = 0; d <= end && i < 62; d = addDays(d, 1), i++) (map[key(d)] = map[key(d)] || []).push(ev);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) { return (b.all_day - a.all_day) || (a.starts_at < b.starts_at ? -1 : 1); });
    });
    return map;
  }

  /* ── Pintado ── */
  function paint() {
    var h = ctx.h;
    ctx.view.textContent = '';
    if (flash) { ctx.setStatus(flash); flash = ''; }
    ctx.view.appendChild(toolbar());
    var days = byDay();
    if (view.mode === 'agenda') ctx.view.appendChild(agenda(days));
    else {
      var grid = month(days);
      var panel = h('section', { class: 'apc-day', 'aria-live': 'polite', 'aria-labelledby': 'apc-day-title' });
      ctx.view.appendChild(h('div', { class: 'apc-layout' }, [grid, panel]));
      drawDay(panel, days);
    }
  }

  function toolbar() {
    var h = ctx.h, isMonth = view.mode === 'month';
    var left = isMonth ? (function () {
      var prev = new Date(view.first.getFullYear(), view.first.getMonth() - 1, 1), next = new Date(view.first.getFullYear(), view.first.getMonth() + 1, 1);
      var ym = function (d) { return '#/calendario/' + d.getFullYear() + '-' + pad(d.getMonth() + 1); };
      return h('div', { class: 'apc-nav' }, [
        h('a', { class: 'ap-tool apc-arrow', href: ym(prev), 'aria-label': 'Mes anterior', text: '←' }),
        h('h2', { class: 'apc-month', text: cap(monthFmt.format(view.first)) }),
        h('a', { class: 'ap-tool apc-arrow', href: ym(next), 'aria-label': 'Mes siguiente', text: '→' }),
        h('a', { class: 'ap-tool', href: '#/calendario', text: 'Hoy' })
      ]);
    })() : h('h2', { class: 'apc-month', text: 'Próximos 60 días' });

    var last = syncs.length ? syncs.reduce(function (a, b) { return a.ran_at > b.ran_at ? a : b; }) : null;
    var bad = syncs.filter(function (s) { return !s.ok; });
    var syncBtn = h('button', { type: 'button', class: 'ap-tool', text: 'Sincronizar ahora', onclick: function () { syncNow(syncBtn); } });
    return h('div', { class: 'apc-bar' }, [
      left,
      h('div', { class: 'apc-right' }, [
        h('nav', { class: 'ape-subnav apc-modes', 'aria-label': 'Vista del calendario' }, [
          h('a', { href: '#/calendario', 'aria-current': isMonth ? 'page' : null, text: 'Mes' }),
          h('a', { href: '#/calendario/agenda', 'aria-current': isMonth ? null : 'page', text: 'Agenda' })
        ]),
        h('p', { class: 'apc-sync' + (bad.length ? ' is-error' : '') },
          bad.length ? 'La última sincronización falló: ' + (bad[0].error || 'error desconocido')
            : last ? 'Sincronizado ' + ago(last.ran_at) : 'Sin sincronizar todavía'),
        syncBtn
      ])
    ]);
  }

  function syncNow(btn) {
    btn.disabled = true;
    ctx.setStatus('Sincronizando con Google Calendar…');
    ctx.api('/functions/v1/calendario-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) {
        var n = (r && r.results || []).reduce(function (a, x) { return a + (x.events || 0); }, 0);
        flash = 'Calendario actualizado: ' + n + ' eventos.';
        if (ctx.isCurrent()) window.dispatchEvent(new HashChangeEvent('hashchange'));
      })
      .catch(function (err) { btn.disabled = false; ctx.fail(err); });
  }

  function chip(ev, compact) {
    var h = ctx.h, l = linkOf(ev);
    return h('li', { class: 'apc-ev' + (ev.all_day ? ' is-allday' : '') + (l ? ' is-interview' : '') }, [
      ev.all_day || compact === 'notime' ? null : h('span', { class: 'apc-ev-time', text: timeFmt.format(new Date(ev.starts_at)) }),
      h('span', { class: 'apc-ev-title', text: ev.title })
    ]);
  }

  function month(days) {
    var h = ctx.h, todayKey = key(new Date());
    var table = h('table', { class: 'apc-grid' }, [
      h('caption', { class: 'sr-only', text: 'Calendario de ' + monthFmt.format(view.first) + '. Elige un día para ver sus eventos.' }),
      h('thead', null, [h('tr', null, WD.map(function (d, i) { return h('th', { scope: 'col', abbr: WD_LONG[i], text: d }); }))])
    ]);
    var body = h('tbody');
    for (var d = new Date(view.from); d < view.to;) {
      var tr = h('tr');
      for (var i = 0; i < 7; i++, d = addDays(d, 1)) {
        var k = key(d), list = days[k] || [], out = d.getMonth() !== view.first.getMonth();
        var hasInterview = list.some(linkOf);
        (function (k, list) {
          tr.appendChild(h('td', { class: (out ? 'is-out ' : '') + (k === todayKey ? 'is-today ' : '') + (k === selected ? 'is-selected' : '') }, [
            h('button', { type: 'button', class: 'apc-daybtn', 'aria-pressed': String(k === selected),
              'aria-label': dayFmt.format(fromKey(k)) + (list.length ? ', ' + list.length + (list.length === 1 ? ' evento' : ' eventos') : ', sin eventos') + (hasInterview ? ', con entrevista' : ''),
              onclick: function () { selected = k; paint(); var b = ctx.view.querySelector('.apc-grid .is-selected .apc-daybtn'); if (b) b.focus(); } }, [
              h('span', { class: 'apc-num', text: String(fromKey(k).getDate()) }),
              list.length ? h('span', { class: 'apc-dot' + (hasInterview ? ' is-interview' : ''), 'aria-hidden': 'true', text: String(list.length) }) : null
            ]),
            list.length ? h('ul', { class: 'apc-evs', 'aria-hidden': 'true' }, list.slice(0, 3).map(function (ev) { return chip(ev); })
              .concat(list.length > 3 ? [h('li', { class: 'apc-more', text: '+' + (list.length - 3) + ' más' })] : [])) : null
          ]));
        })(k, list);
      }
      body.appendChild(tr);
    }
    table.appendChild(body);
    return h('div', { class: 'apc-grid-wrap' }, [table]);
  }

  function detail(ev) {
    var h = ctx.h, l = linkOf(ev);
    var desc = ev.description ? ev.description.replace(/\s+\n/g, '\n').slice(0, 400) : null;
    return h('li', { class: 'apc-item' + (l ? ' is-interview' : '') }, [
      h('p', { class: 'apc-item-time', text: when(ev) }),
      h('div', null, [
        h('p', { class: 'apc-item-title', text: ev.title }),
        ev.location ? h('p', { class: 'ape-meta', text: ev.location }) : null,
        desc ? h('p', { class: 'apc-item-desc', text: desc }) : null,
        l ? h('a', { class: 'apc-item-link', href: '#/entrevistas/' + l.proceso_id, text: 'Entrevista · ' + ((l.procesos && l.procesos.empresa) || 'ver proceso') + ' →' }) : null
      ])
    ]);
  }

  function drawDay(panel, days) {
    var h = ctx.h, list = days[selected] || [];
    panel.textContent = '';
    panel.appendChild(h('h3', { class: 'ape-h3', id: 'apc-day-title', text: cap(dayFmt.format(fromKey(selected))) }));
    panel.appendChild(list.length ? h('ul', { class: 'apc-list' }, list.map(detail)) : h('p', { class: 'ape-meta', text: 'Nada en el calendario este día.' }));
  }

  function agenda(days) {
    var h = ctx.h, wrap = h('div', { class: 'apc-agenda' }), any = false;
    for (var d = new Date(view.from); d < view.to; d = addDays(d, 1)) {
      var list = days[key(d)];
      if (!list || !list.length) continue;
      any = true;
      wrap.appendChild(h('section', { class: 'apc-agenda-day', 'aria-label': dayFmt.format(d) }, [
        h('h3', { class: 'apc-agenda-date' }, [h('span', { class: 'apc-agenda-n', text: String(d.getDate()) }), h('span', { text: cap(dayFmt.format(d)) })]),
        h('ul', { class: 'apc-list' }, list.map(detail))
      ]));
    }
    if (!any) wrap.appendChild(h('div', { class: 'ap-empty' }, [h('p', { class: 'ap-empty-title', text: 'Agenda despejada' }), h('p', { text: 'No hay nada en los próximos 60 días.' })]));
    return wrap;
  }

  function paintSetup() {
    var h = ctx.h;
    ctx.view.textContent = '';
    ctx.view.appendChild(h('div', { class: 'ap-empty' }, [
      h('p', { class: 'ap-empty-title', text: 'El calendario aún no está conectado' }),
      h('p', { text: 'Ejecuta supabase/calendario.sql y despliega la función calendario-sync (instrucciones en supabase/functions/calendario-sync/README.md).' })
    ]));
  }

  return { render: render };
})();
