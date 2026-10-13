/* ═══════════════════════════════════════════════
   area-privada-preparacion.js — «Preparación» dentro de la pestaña Entrevistas
   ─────────────────────────────────────────────────
   Rutas: #/preparacion          entrevistas detectadas en el calendario y estado del informe
          #/preparacion/<uuid>   briefing de una entrevista (imprimible en dos A4)
   Lee public.ii_interviews, ii_reports e ii_runs (supabase/interview-intel.sql), que rellena la
   Edge Function interview-intel. Desde aquí solo se puede: confirmar, descartar, reintentar o
   regenerar (RPC ii_action) y pedir una comprobación inmediata.
   Todo lo que viene de la base (y de la investigación web) se pinta como texto; los enlaces
   solo si son http(s), en pestaña nueva y sin referrer.
   ═══════════════════════════════════════════════ */
window.APPreparacion = (function () {
  'use strict';

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // estado → [texto, clase de la insignia]. Las mismas claves que ii_interviews.status
  var STATUS = {
    detected: ['Detectada', ''], pending_review: ['Por revisar', 'is-warn'], queued: ['En cola', 'is-live'],
    researching: ['Investigando', 'is-live'], generating: ['Redactando', 'is-live'], ready: ['Informe listo', 'is-ok'],
    needs_update: ['Desactualizado', 'is-warn'], cancelled: ['Cancelada', 'is-off'], failed: ['Error', 'is-ko'], dismissed: ['Descartada', 'is-off']
  };
  var KIND = { rrhh: 'RRHH / Talent', tecnica: 'Técnica', negocio: 'Negocio / hiring manager', final: 'Final', mixta: 'Mixta', desconocida: 'Sin determinar' };
  var QUALITY = { completo: ['Completo', 'is-ok'], parcial: ['Parcial', 'is-warn'], revisar: ['Revisar', 'is-ko'] };
  var EVIDENCE = { demostrado: 'Demostrado', formacion: 'Formación', transferible: 'Transferible', brecha: 'Brecha' };
  var RESPONSE = { ACCEPTED: 'aceptada', 'NEEDS-ACTION': 'pendiente de responder', TENTATIVE: 'aceptada como «quizás»', DECLINED: 'rechazada' };
  var BUSY = ['queued', 'researching', 'generating', 'needs_update'];
  var COLS = 'id,starts_at,ends_at,title,company,role_title,interview_kind,classification,confidence,signals,status,status_note,' +
    'my_response,attempts,last_error,next_attempt_at,current_report_id,updated_at,conference_url,location,entrevista_id,attendees';

  var ctx = null, h = null, flash = '', pollTimer = null;
  var dFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  var sFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  var tFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  var money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function badge(map, v) { var x = map[v] || [v || '—', '']; return h('span', { class: 'ape-badge ' + x[1], text: x[0] }); }
  function safeUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null; }
  function ext(url, text, cls) {
    var u = safeUrl(url);
    if (!u) return h('span', { text: text });
    return h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', class: cls || null }, [text, h('span', { class: 'sr-only', text: ' (abre en pestaña nueva)' })]);
  }
  function missing(err) { return err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01'); }

  /* ── Entrada ── */
  function render(c) {
    ctx = c; h = c.h;
    clearTimeout(pollTimer);
    var id = UUID.test(ctx.arg) ? ctx.arg : null;
    var parts = (ctx.arg || '').split('/');
    if (!id && UUID.test(parts[0])) id = parts[0];
    var version = parts[1] && /^v\d+$/.test(parts[1]) ? +parts[1].slice(1) : null;
    var job = id ? loadDetail(id, version) : loadList();
    return job.then(function (paint) {
      return function () { paint(); if (flash) { ctx.setStatus(flash); flash = ''; } };
    }, function (err) {
      if (!missing(err)) throw err;
      return function () { notConfigured(); };
    });
  }
  function rerender() { if (ctx.isCurrent()) window.dispatchEvent(new HashChangeEvent('hashchange')); }

  function subnav() {
    return h('nav', { class: 'ape-subnav', 'aria-label': 'Vistas de entrevistas' }, [
      h('a', { href: '#/entrevistas', text: 'Procesos' }),
      h('a', { href: '#/entrevistas/analisis', text: 'Análisis' }),
      h('a', { href: '#/preparacion', 'aria-current': 'page', text: 'Preparación' })
    ]);
  }
  function notConfigured() {
    ctx.view.textContent = '';
    ctx.view.appendChild(subnav());
    ctx.view.appendChild(h('div', { class: 'ap-empty' }, [
      h('p', { class: 'ap-empty-title', text: 'La preparación automática aún no está instalada' }),
      h('p', { text: 'Ejecuta supabase/interview-intel.sql y sigue supabase/functions/interview-intel/README.md.' })
    ]));
  }

  /* Revisa sola la lista mientras haya algo en marcha (sin mover el foco si estás usando la página) */
  function poll(active) {
    clearTimeout(pollTimer);
    if (!active) return;
    pollTimer = setTimeout(function () {
      if (!ctx.isCurrent()) return;
      var a = document.activeElement;
      if (a && a !== document.body && ctx.view.contains(a)) return poll(true);
      rerender();
    }, 30000);
  }

  /* ── Acciones ── */
  function act(row, action, label) {
    ctx.setStatus('Guardando…');
    return ctx.api('/rest/v1/rpc/ii_action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: row.id, action: action }) })
      .then(function () {
        flash = label;
        // que la función lo procese ya (si no está desplegada o falla, lo hará el cron)
        return ctx.api('/functions/v1/interview-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"tick"}' }).catch(function () {});
      })
      .then(rerender).catch(ctx.fail);
  }
  function checkNow(btn) {
    btn.disabled = true;
    ctx.setStatus('Buscando entrevistas en el calendario…');
    ctx.api('/functions/v1/interview-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"tick"}' })
      .then(function (r) {
        var d = r && r.detected;
        flash = d ? 'Comprobado: ' + d.created + ' nuevas, ' + d.updated + ' revisadas' + (d.cancelled ? ', ' + d.cancelled + ' canceladas' : '') + '.' : 'Comprobado.';
        if (r && r.step && r.step.action === 'ai_disabled') flash += ' La investigación con IA está desactivada (II_AI_PROVIDER).';
        if (r && r.paused) flash = 'La automatización está en pausa (II_PAUSED).';
        rerender();
      })
      .catch(function (err) { btn.disabled = false; ctx.fail(err); });
  }
  function actions(row, inDetail) {
    var out = [];
    var btn = function (text, action, msg, cls) {
      return h('button', { type: 'button', class: inDetail ? 'ap-tool' + (cls ? ' ' + cls : '') : 'ap-link-btn', text: text, onclick: function () { act(row, action, msg); } });
    };
    if (!inDetail && row.current_report_id) out.push(h('a', { class: 'ap-link-btn apb-open', href: '#/preparacion/' + row.id, text: 'Abrir informe' }));
    if (row.status === 'pending_review' || row.status === 'detected') out.push(btn('Preparar', 'confirm', 'En cola para preparar.', 'ap-tool--dark'));
    if (row.status === 'cancelled' && !row.current_report_id) out.push(btn('Preparar igualmente', 'confirm', 'En cola para preparar.'));
    if (row.status === 'failed') out.push(btn('Reintentar', 'retry', 'Reintento en cola.', 'ap-tool--dark'));
    if (['ready', 'needs_update', 'cancelled'].indexOf(row.status) > -1 && row.current_report_id) out.push(btn('Regenerar', 'regenerate', 'Se investigará y redactará de nuevo.'));
    if (row.status === 'dismissed') out.push(btn('No era un error', 'restore', 'Vuelve a estar por revisar.'));
    else if (['researching', 'generating'].indexOf(row.status) < 0) out.push(btn('No es una entrevista', 'dismiss', 'Descartada.', 'ap-tool--danger'));
    return out;
  }
  function statusLine(row) {
    var note = row.status_note || '';
    if (row.status === 'failed' && row.last_error) note = 'Último error: ' + row.last_error;
    if (BUSY.indexOf(row.status) > -1 && row.next_attempt_at && new Date(row.next_attempt_at) > new Date()) note = 'Reintento a las ' + tFmt.format(new Date(row.next_attempt_at)) + (row.last_error ? ' · ' + row.last_error : '');
    return note;
  }

  /* ═══════════ LISTA ═══════════ */
  function loadList() {
    var since = new Date(Date.now() - 45 * 864e5).toISOString();
    return Promise.all([
      ctx.api('/rest/v1/ii_interviews?select=' + COLS + '&starts_at=gte.' + since + '&order=starts_at.asc&limit=300'),
      ctx.api('/rest/v1/ii_reports?select=id,interview_id,quality,created_at&order=created_at.desc&limit=300')
    ]).then(function (r) {
      var rows = r[0] || [], reps = {};
      (r[1] || []).forEach(function (x) { reps[x.id] = x; });
      return function () { paintList(rows, reps); };
    });
  }
  function paintList(rows, reps) {
    var now = new Date().toISOString();
    ctx.view.textContent = '';
    ctx.view.appendChild(subnav());
    var check = h('button', { type: 'button', class: 'ap-tool', onclick: function () { checkNow(check); } }, 'Comprobar ahora');
    ctx.view.appendChild(h('div', { class: 'apb-intro' }, [
      h('p', { class: 'ape-meta', text: 'Las entrevistas del calendario se detectan solas cada 10 minutos. Cuando falta poco, se investiga la empresa y a quién te entrevista y se prepara un briefing de dos páginas.' }),
      check
    ]));
    var review = rows.filter(function (r) { return r.status === 'pending_review'; });
    var upcoming = rows.filter(function (r) { return r.ends_at >= now && ['pending_review', 'dismissed'].indexOf(r.status) < 0; });
    var past = rows.filter(function (r) { return r.ends_at < now || r.status === 'dismissed'; }).reverse();

    if (review.length) ctx.view.appendChild(section('Posibles entrevistas por revisar', 'No hay suficientes señales para estar seguro. Confírmalas o descártalas.', table(review, reps, true)));
    ctx.view.appendChild(section('Próximas entrevistas', null, upcoming.length ? table(upcoming, reps, false)
      : h('div', { class: 'ap-empty' }, [h('p', { class: 'ap-empty-title', text: 'No hay entrevistas a la vista' }), h('p', { text: 'Cuando llegue una invitación a tu calendario aparecerá aquí.' })])));
    if (past.length) {
      var d = h('details', { class: 'apb-past' }, [h('summary', { text: 'Pasadas y descartadas (' + past.length + ')' }), table(past, reps, false)]);
      ctx.view.appendChild(d);
    }
    poll(rows.some(function (r) { return BUSY.indexOf(r.status) > -1 && r.ends_at >= now; }));
  }
  function section(title, sub, body) {
    return h('section', { class: 'ape-section apb-list' }, [h('h3', { class: 'ape-h3', text: title }), sub ? h('p', { class: 'ape-meta', text: sub }) : null, body]);
  }
  function table(rows, reps, showSignals) {
    var body = h('tbody');
    rows.forEach(function (r) {
      var rep = r.current_report_id ? reps[r.current_report_id] : null;
      var note = statusLine(r);
      body.appendChild(h('tr', null, [
        h('td', { class: 'apb-c-when' }, [h('time', { datetime: r.starts_at, text: sFmt.format(new Date(r.starts_at)) })]),
        h('td', { class: 'ape-c-emp' }, [
          r.current_report_id ? h('a', { class: 'apf-title', href: '#/preparacion/' + r.id, text: r.company || r.title }) : h('span', { class: 'apf-title', text: r.company || r.title }),
          h('span', { class: 'apf-domain', text: [r.role_title, r.company ? r.title : null].filter(Boolean).join(' · ') }),
          showSignals && r.signals && r.signals.length ? h('span', { class: 'apb-signals', text: 'Señales: ' + r.signals.slice(0, 3).join(' · ') }) : null
        ]),
        h('td', { class: 'apb-c-kind', text: KIND[r.interview_kind] || '—' }),
        h('td', { class: 'apb-c-st' }, [
          badge(STATUS, r.status), rep ? [' ', badge(QUALITY, rep.quality)] : null,
          note ? h('span', { class: 'apb-note', text: note }) : null
        ]),
        h('td', { class: 'apb-c-upd', text: rep ? 'Informe del ' + tFmt.format(new Date(rep.created_at)) : tFmt.format(new Date(r.updated_at)) }),
        h('td', { class: 'ap-col-act apb-c-act' }, actions(r, false))
      ]));
    });
    return h('div', { class: 'ap-table-wrap apf-wrap', tabindex: '0', role: 'region', 'aria-label': 'Entrevistas detectadas' }, [h('table', { class: 'ap-table apf-table apb-table' }, [
      h('caption', { class: 'sr-only', text: 'Entrevistas detectadas en el calendario' }),
      h('thead', null, [h('tr', null, [
        h('th', { scope: 'col', text: 'Fecha' }), h('th', { scope: 'col', text: 'Empresa y puesto' }), h('th', { scope: 'col', text: 'Tipo' }),
        h('th', { scope: 'col', text: 'Estado' }), h('th', { scope: 'col', text: 'Actualizado' }), h('th', { scope: 'col', class: 'ap-col-act' }, [h('span', { class: 'sr-only', text: 'Acciones' })])
      ])]),
      body
    ])]);
  }

  /* ═══════════ BRIEFING ═══════════ */
  function loadDetail(id, version) {
    return Promise.all([
      ctx.api('/rest/v1/ii_interviews?select=' + COLS + '&id=eq.' + id),
      ctx.api('/rest/v1/ii_reports?select=id,version,quality,created_at,word_count&interview_id=eq.' + id + '&order=version.desc'),
      ctx.api('/rest/v1/ii_runs?select=kind,status,started_at,finished_at,model,usage&interview_id=eq.' + id + '&order=started_at.desc&limit=40')
    ]).then(function (r) {
      var row = r[0] && r[0][0], versions = r[1] || [], runs = r[2] || [];
      if (!row) { location.replace('#/preparacion'); return function () {}; }
      var pick = version ? versions.filter(function (v) { return v.version === version; })[0] : versions.filter(function (v) { return v.id === row.current_report_id; })[0] || versions[0];
      var rep = pick ? ctx.api('/rest/v1/ii_reports?select=*&id=eq.' + pick.id).then(function (x) { return x && x[0]; }) : Promise.resolve(null);
      var proc = row.entrevista_id ? ctx.api('/rest/v1/entrevistas?select=proceso_id&id=eq.' + row.entrevista_id).then(function (x) { return x && x[0] && x[0].proceso_id; }).catch(function () { return null; }) : Promise.resolve(null);
      return Promise.all([rep, proc]).then(function (x) {
        return function () { paintDetail(row, x[0], versions, runs, x[1]); };
      });
    });
  }

  function paintDetail(row, rep, versions, runs, procesoId) {
    ctx.view.textContent = '';
    var bar = h('div', { class: 'apb-bar' }, [
      h('a', { class: 'ap-backlink', href: '#/preparacion' }, [h('span', { 'aria-hidden': 'true', text: '← ' }), 'Todas las entrevistas']),
      h('div', { class: 'ap-doc-actions apb-actions' }, [
        rep ? h('button', { type: 'button', class: 'ap-tool ap-tool--dark', text: 'Imprimir o guardar PDF', onclick: function () { window.print(); } }) : null,
        procesoId ? h('a', { class: 'ap-tool', href: '#/entrevistas/' + procesoId, text: 'Ver el proceso' }) : null
      ].concat(actions(row, true)))
    ]);
    ctx.view.appendChild(bar);
    if (!rep) {
      ctx.view.appendChild(h('div', { class: 'ap-empty' }, [
        h('p', { class: 'ap-empty-title', text: (row.company || row.title) + ': todavía no hay informe' }),
        h('p', { text: (STATUS[row.status] || [row.status])[0] + (statusLine(row) ? ' · ' + statusLine(row) : '') })
      ]));
      poll(BUSY.indexOf(row.status) > -1);
      return;
    }
    ctx.view.appendChild(briefing(row, rep, versions, runs));
    poll(BUSY.indexOf(row.status) > -1);
  }

  /* Referencias a fuentes: [1] con enlace a la URL verificada */
  function refs(ids, sources) {
    if (!ids || !ids.length) return null;
    return h('span', { class: 'apb-refs' }, ids.map(function (id) {
      var s = sources.filter(function (x) { return x.id === id; })[0];
      if (!s || !safeUrl(s.url)) return null;
      return h('a', { class: 'apb-ref', href: s.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Fuente ' + id + ': ' + s.title + ' (abre en pestaña nueva)', text: String(id) });
    }));
  }
  function block(n, title, kids) {
    return h('section', { class: 'apb-block', 'aria-labelledby': 'apb-b' + n }, [
      h('h3', { class: 'apb-h', id: 'apb-b' + n }, [h('span', { class: 'apb-n', 'aria-hidden': 'true', text: String(n) }), title])
    ].concat(kids));
  }
  function list(items, ordered) { return items.length ? h(ordered ? 'ol' : 'ul', { class: 'apb-ul' }, items.map(function (x) { return h('li', null, x); })) : null; }
  function pair(label, text) { return text ? h('p', { class: 'apb-pair' }, [h('strong', { text: label + ': ' }), text]) : null; }

  function briefing(row, rep, versions, runs) {
    var c = rep.content || {}, src = rep.sources || [];
    var research = runs.filter(function (r) { return r.kind === 'research' && r.status === 'ok'; })[0];
    var cost = runs.reduce(function (a, r) { return a + ((r.usage && +r.usage.usd) || 0); }, 0);
    var mode = row.conference_url ? 'Videollamada' : row.location ? 'Presencial' : null;
    var current = row.current_report_id === rep.id;
    var warnings = (rep.warnings || []).concat(c.limitations || []);

    var head = h('header', { class: 'apb-head' }, [
      h('p', { class: 'ap-label', text: 'Briefing de entrevista' }),
      h('h2', { class: 'ap-doc-title apb-title', id: 'apb-title', text: (row.company || 'Empresa sin identificar') + (row.role_title ? ' — ' + row.role_title : '') }),
      h('dl', { class: 'apb-meta' }, [
        h('dt', { text: 'Cuándo' }), h('dd', null, [h('time', { datetime: row.starts_at, text: cap(dFmt.format(new Date(row.starts_at))) })]),
        mode ? h('dt', { text: 'Modalidad' }) : null,
        mode ? h('dd', null, [mode, row.conference_url ? [' · ', ext(row.conference_url, 'enlace a la reunión')] : row.location ? ' · ' + row.location : null]) : null,
        h('dt', { text: 'Tipo' }), h('dd', { text: c.interview_type || KIND[row.interview_kind] || 'Sin determinar' }),
        row.my_response ? h('dt', { text: 'Invitación' }) : null, row.my_response ? h('dd', { text: RESPONSE[row.my_response] || row.my_response }) : null,
        h('dt', { text: 'Preparación' }), h('dd', null, [badge(QUALITY, rep.quality), ' ', badge(STATUS, row.status)]),
        h('dt', { text: 'Investigado' }), h('dd', { text: research && research.finished_at ? tFmt.format(new Date(research.finished_at)) : tFmt.format(new Date(rep.created_at)) })
      ])
    ]);

    var notices = [];
    if (!current) notices.push(h('p', { class: 'apb-alert', text: 'Estás viendo la versión ' + rep.version + ', que no es la vigente.' }));
    if (row.status === 'needs_update') notices.push(h('p', { class: 'apb-alert', text: 'El evento ha cambiado desde que se escribió este informe. ' + (row.status_note || '') + ' Se está actualizando.' }));
    if (row.status === 'cancelled') notices.push(h('p', { class: 'apb-alert', text: 'Entrevista cancelada o eliminada del calendario. Se conserva el informe.' }));
    if (warnings.length) notices.push(h('div', { class: 'apb-warn', role: 'note' }, [h('p', { class: 'apb-warn-t', text: 'A tener en cuenta' }), list(warnings.map(String))]));

    var k = c.know || {};
    var b1 = block(1, 'Lo que necesito saber', [
      k.context ? h('p', { text: k.context }) : null,
      list((k.facts || []).map(function (f) { return [f.text, refs(f.source_ids, src)]; })),
      k.why_it_matters ? pair('Por qué importa', k.why_it_matters) : null
    ]);
    var people = c.people || [];
    var b2 = block(2, 'Con quién voy a hablar', [people.length ? h('ul', { class: 'apb-ul apb-people' }, people.map(function (p) {
      return h('li', null, [
        h('strong', { text: p.name }), p.title ? ' · ' + p.title : null, ' ',
        p.verified ? refs(p.source_ids, src) : h('span', { class: 'apb-tag', text: 'sin verificar' }),
        h('span', { class: 'apb-sub', text: [p.role_in_interview, p.note].filter(Boolean).join(' · ') })
      ]);
    })) : h('p', { class: 'ape-meta', text: 'La invitación no indica quién te entrevista.' })]);

    var s = c.strategy || {};
    var b3 = block(3, 'Mi estrategia', [
      s.highlight && s.highlight.length ? h('p', { class: 'apb-k', text: 'Destaca' }) : null, list(s.highlight || []),
      (s.projects || []).map(function (p) {
        return h('div', { class: 'apb-project' }, [
          h('p', null, [h('strong', { text: p.name }), ' — ' + p.why]),
          pair('Qué destacar', p.highlight), pair('Decisiones a explicar', p.decisions),
          pair('Te pueden preguntar', p.follow_up), pair('Limitación honesta', p.limitation)
        ]);
      }),
      s.review && s.review.length ? pair('Repasa', s.review.join(' · ')) : null,
      s.gap ? pair('Brecha: ' + s.gap.topic, s.gap.honest_answer) : null
    ]);
    var b4 = block(4, 'Preguntas y respuestas', [
      c.intro ? h('div', { class: 'apb-intro-box' }, [h('p', { class: 'apb-k', text: '«Háblame de ti» (30–45 s)' }), h('p', { text: c.intro })]) : null,
      h('ol', { class: 'apb-qs' }, (c.questions || []).map(function (q) {
        return h('li', null, [h('p', { class: 'apb-q' }, [q.q, ' ', h('span', { class: 'apb-tag', text: EVIDENCE[q.evidence] || q.evidence })]), h('p', { class: 'apb-guide', text: q.guide })]);
      }))
    ]);
    var b5 = block(5, 'Preguntas que debo hacer', [list(c.ask || [], true)]);
    var r = c.reminder || {};
    var b6 = block(6, 'Mi recordatorio final', [h('dl', { class: 'apb-reminder' }, [
      h('dt', { text: 'Encaje' }), h('dd', { text: r.fit || '—' }),
      h('dt', { text: 'Ejemplo' }), h('dd', { text: r.example || '—' }),
      h('dt', { text: 'No olvides preguntar' }), h('dd', { text: r.question || '—' }),
      h('dt', { text: 'Repasa' }), h('dd', { text: r.technical || '—' })
    ])]);

    var sources = src.length ? h('section', { class: 'apb-sources', 'aria-labelledby': 'apb-src' }, [
      h('h3', { class: 'apb-h apb-h--sm', id: 'apb-src', text: 'Fuentes' }),
      h('ol', null, src.map(function (x) {
        return h('li', { value: String(x.id) }, [ext(x.url, x.title || x.domain), h('span', { class: 'apb-src-meta', text: ' · ' + x.domain + (x.published ? ' · ' + x.published : '') })]);
      }))
    ]) : null;

    var matrix = (c.matrix || []).length ? h('details', { class: 'apb-matrix' }, [
      h('summary', { text: 'Matriz de requisitos (uso interno)' }),
      h('div', { class: 'ap-table-wrap apf-wrap', tabindex: '0', role: 'region', 'aria-label': 'Matriz de requisitos' }, [h('table', { class: 'ap-table apf-table' }, [
        h('thead', null, [h('tr', null, [h('th', { scope: 'col', text: 'Requisito' }), h('th', { scope: 'col', text: 'Clase' }), h('th', { scope: 'col', text: 'Evidencia' })])]),
        h('tbody', null, c.matrix.map(function (m) { return h('tr', null, [h('td', { text: m.requirement }), h('td', { text: EVIDENCE[m.class] || m.class }), h('td', { text: m.evidence })]); }))
      ])])
    ]) : null;

    var older = versions.length > 1 ? h('p', { class: 'ape-meta apb-versions' }, ['Versiones: '].concat(versions.map(function (v, i) {
      var label = 'v' + v.version + ' (' + tFmt.format(new Date(v.created_at)) + ')';
      return [i ? ' · ' : '', v.id === rep.id ? h('strong', { text: label }) : h('a', { href: '#/preparacion/' + row.id + '/v' + v.version, text: label })];
    }))) : null;
    var meta = h('p', { class: 'ape-meta apb-foot', text: [rep.word_count ? rep.word_count + ' palabras' : null, rep.model && rep.model !== 'mock' ? 'modelo ' + rep.model : rep.model === 'mock' ? 'SIMULADO' : null, cost ? 'coste estimado ' + money.format(cost) : null].filter(Boolean).join(' · ') });

    return h('article', { class: 'apb', 'aria-labelledby': 'apb-title' }, [head].concat(notices, [b1, b2, b3, b4, b5, b6, sources, matrix, older, meta]));
  }

  return { render: render, STATUS: STATUS };
})();
