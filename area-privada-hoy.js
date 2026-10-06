/* ═══════════════════════════════════════════════
   area-privada-hoy.js — portada del área privada (#/)
   ─────────────────────────────────────────────────
   Tres bloques con lo que pide atención: los próximos 7 días del calendario,
   las entrevistas programadas y los procesos en curso que llevan tiempo sin
   moverse (para escribir un seguimiento). Solo lee; editar se hace en cada pestaña.
   Si el calendario o las entrevistas aún no están configurados, su bloque lo dice
   y el resto funciona igual.
   ═══════════════════════════════════════════════ */
window.APHoy = (function () {
  'use strict';

  var STALE_DAYS = 10;   // días sin novedades para sugerir un seguimiento
  var DAY = 864e5;
  var dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  var shortFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  var timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
  var FASES = { rrhh: 'Filtro RRHH', tecnica: 'Técnica', caso: 'Caso práctico', hiring_manager: 'Hiring manager', cultural: 'Cultural / equipo', final: 'Final', otra: 'Entrevista' };

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function evDay(ev) { var s = new Date(ev.starts_at); return ev.all_day ? s.getUTCFullYear() + '-' + pad(s.getUTCMonth() + 1) + '-' + pad(s.getUTCDate()) : key(s); }

  function render(ctx) {
    var h = ctx.h, now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var end = new Date(start.getTime() + 7 * DAY);
    var auth = function (err) { if (err && err.auth) throw err; return null; };
    return Promise.all([
      ctx.api('/rest/v1/calendar_events?select=uid,starts_at,ends_at,all_day,title,location&starts_at=lt.' + end.toISOString() +
        '&ends_at=gt.' + start.toISOString() + '&order=starts_at.asc&limit=200').catch(auth),
      ctx.api('/rest/v1/procesos?select=id,empresa,puesto,estado,fecha_aplicacion&estado=in.(activo,oferta)').catch(auth),
      ctx.api('/rest/v1/entrevistas?select=id,proceso_id,fecha,fase,resultado,calendar_uid&order=fecha.asc').catch(auth)
    ]).then(function (r) {
      var evs = r[0], procs = r[1], ents = r[2];
      return function paint() {
        ctx.view.textContent = '';
        ctx.view.appendChild(h('p', { class: 'aph-date', text: cap(dayFmt.format(now)) }));
        ctx.view.appendChild(h('div', { class: 'aph-grid' }, [
          card('Próximos 7 días', '#/calendario', 'Abrir el calendario', evs ? week(evs, ents || []) : setup('El calendario aún no está conectado.')),
          card('Entrevistas programadas', '#/entrevistas', 'Ver procesos', procs && ents ? upcoming(procs, ents) : setup('La tabla de entrevistas aún no está creada.')),
          card('Pendientes de seguimiento', '#/entrevistas', 'Ver procesos', procs && ents ? stale(procs, ents) : setup('La tabla de entrevistas aún no está creada.'))
        ]));
      };
    });

    function card(title, href, linkText, body) {
      return h('section', { class: 'aph-card', 'aria-label': title }, [
        h('div', { class: 'aph-card-head' }, [h('h2', { class: 'ape-h3', text: title }), h('a', { class: 'aph-more', href: href, text: linkText + ' →' })]),
        body
      ]);
    }
    function setup(text) { return h('p', { class: 'ape-meta', text: text }); }
    function empty(text) { return h('p', { class: 'aph-empty', text: text }); }

    function week(evs, ents) {
      if (!evs.length) return empty('Semana despejada.');
      var linked = {};
      ents.forEach(function (e) { if (e.calendar_uid) linked[e.calendar_uid] = e.proceso_id; });
      var groups = {}, order = [];
      evs.forEach(function (ev) {
        var k = evDay(ev);
        if (k < key(start)) k = key(start);          // empezó antes y sigue hoy
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(ev);
      });
      order.sort();
      return h('div', { class: 'aph-week' }, order.map(function (k) {
        var p = k.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
        var label = k === key(start) ? 'Hoy' : k === key(new Date(start.getTime() + DAY)) ? 'Mañana' : cap(dayFmt.format(d));
        return h('div', { class: 'aph-day' }, [
          h('h3', { class: 'aph-day-t', text: label }),
          h('ul', { class: 'aph-list' }, groups[k].map(function (ev) {
            var pid = linked[ev.uid + '|' + ev.starts_at];
            return h('li', { class: pid ? 'is-interview' : null }, [
              h('span', { class: 'aph-time', text: ev.all_day ? 'Todo el día' : timeFmt.format(new Date(ev.starts_at)) }),
              pid ? h('a', { href: '#/entrevistas/' + pid, text: ev.title }) : h('span', { text: ev.title })
            ]);
          }))
        ]);
      }));
    }

    function upcoming(procs, ents) {
      var byId = {};
      procs.forEach(function (p) { byId[p.id] = p; });
      var iso = now.toISOString();
      var list = ents.filter(function (e) { return e.fecha >= iso && e.resultado === 'pendiente' && byId[e.proceso_id]; }).slice(0, 6);
      var waiting = ents.filter(function (e) { return e.fecha < iso && e.resultado === 'pendiente' && byId[e.proceso_id]; });
      var out = [];
      if (list.length) out.push(h('ul', { class: 'aph-list' }, list.map(function (e) {
        var p = byId[e.proceso_id];
        return h('li', null, [
          h('span', { class: 'aph-time', text: shortFmt.format(new Date(e.fecha)) }),
          h('a', { href: '#/entrevistas/' + p.id, text: p.empresa + ' · ' + FASES[e.fase] })
        ]);
      })));
      else out.push(empty('No hay entrevistas a la vista.'));
      if (waiting.length) out.push(h('p', { class: 'aph-note', text: waiting.length === 1
        ? 'Una entrevista ya pasada sigue como «pendiente»: apunta cómo fue mientras lo recuerdas.'
        : waiting.length + ' entrevistas ya pasadas siguen como «pendiente»: apunta cómo fueron mientras lo recuerdas.' }));
      return h('div', null, out);
    }

    function stale(procs, ents) {
      var iso = now.toISOString();
      var list = procs.filter(function (p) { return p.estado === 'activo'; }).map(function (p) {
        var mine = ents.filter(function (e) { return e.proceso_id === p.id; });
        if (mine.some(function (e) { return e.fecha >= iso && e.resultado === 'pendiente'; })) return null;   // ya hay algo programado
        var lastIso = mine.length ? mine[mine.length - 1].fecha : p.fecha_aplicacion + 'T00:00:00';
        var days = Math.floor((now - new Date(lastIso)) / DAY);
        return days >= STALE_DAYS ? { p: p, days: days } : null;
      }).filter(Boolean).sort(function (a, b) { return b.days - a.days; }).slice(0, 6);
      if (!list.length) return empty('Nada parado más de ' + STALE_DAYS + ' días.');
      return h('ul', { class: 'aph-list' }, list.map(function (x) {
        return h('li', null, [
          h('span', { class: 'aph-time', text: x.days + ' días' }),
          h('a', { href: '#/entrevistas/' + x.p.id, text: x.p.empresa + ' · ' + x.p.puesto })
        ]);
      }));
    }
  }

  return { render: render };
})();
