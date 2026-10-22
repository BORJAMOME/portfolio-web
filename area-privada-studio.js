/* ═══════════════════════════════════════════════
   area-privada-studio.js: Studio de proyectos
   ─────────────────────────────────────────────────
   Vistas: «Resumen», «Tablero» (Kanban de tareas) y «Archivo».
   Datos: tablas ps_* de supabase/studio.sql (Supabase es la fuente de verdad). Independiente del Centro de trabajo (kb_*).
   Todas las vistas leen el mismo estado en memoria: cambiar algo en una se ve en las demás.
   Mover tareas: arrastrar (ratón, lápiz; en táctil, desde el asa ⠿), Mayús + flechas con el teclado
   o el selector «Estado» del panel lateral.
   La lógica pura (orden, límites, progreso, filtros, actividad) vive en `logic` y se prueba
   con tools/test-studio.mjs sin navegador.
   ═══════════════════════════════════════════════ */
window.APStudio = (function () {
  'use strict';

  /* ═══════════ LÓGICA PURA ═══════════ */
  var DAY = 864e5;
  var STATUSES = [
    { id: 'inbox', label: 'Bandeja', empty: 'Captura aquí lo que aún no has decidido.' },
    { id: 'ready', label: 'Listo', empty: 'Trabajo definido, listo para empezar.' },
    { id: 'in_progress', label: 'En curso', empty: 'Lo que haces ahora. Mejor poco y terminado.' },
    { id: 'review', label: 'Revisión', empty: 'Pendiente de comprobar o de una decisión.' },
    { id: 'done', label: 'Hecho', empty: 'Lo que termines aparecerá aquí.' }
  ];
  var STATUS_LABEL = {}; STATUSES.forEach(function (s) { STATUS_LABEL[s.id] = s.label; });
  var STAGES = [
    { id: 'capture', label: 'Capturar' }, { id: 'explore', label: 'Explorar' }, { id: 'define', label: 'Definir' },
    { id: 'plan', label: 'Planificar' }, { id: 'build', label: 'Construir' }, { id: 'validate', label: 'Validar' }, { id: 'publish', label: 'Publicar' }
  ];
  var STAGE_LABEL = {}; STAGES.forEach(function (s) { STAGE_LABEL[s.id] = s.label; });
  var PSTATUS = [['active', 'Activo'], ['paused', 'En pausa'], ['completed', 'Completado'], ['cancelled', 'Cancelado']];
  var PSTATUS_LABEL = {}; PSTATUS.forEach(function (s) { PSTATUS_LABEL[s[0]] = s[1]; });
  var KINDS = [['powerbi', 'Power BI'], ['analytics', 'Análisis de datos'], ['sql', 'SQL'], ['python', 'Python'], ['ml', 'Machine learning'],
    ['streamlit', 'Streamlit'], ['ux', 'UX/UI'], ['portfolio', 'Portfolio'], ['experiment', 'Experimento técnico']];
  var PRIO = { 1: 'Baja', 2: 'Normal', 3: 'Alta', 4: 'Urgente' };
  var DEFAULTS = { wip: { in_progress: 3, review: 3 } };
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

  /* Posición de una tarea que se inserta en `index` de una columna ya ordenada (sin la tarea movida). */
  function insertPosition(others, index) {
    var prev = others[index - 1], next = others[index];
    if (!prev && !next) return GAP;
    if (!prev) return next.position - GAP;
    if (!next) return prev.position + GAP;
    return (prev.position + next.position) / 2;
  }
  function needsRenumber(others, index) {
    var prev = others[index - 1], next = others[index];
    return !!(prev && next && next.position - prev.position < MIN_GAP);
  }
  function byPos(a, b) { return (a.position - b.position) || (a.created_at < b.created_at ? -1 : 1); }

  /* El tablero solo enseña tareas de primer nivel, no archivadas, sueltas o de proyectos activos. */
  function boardTasks(tasks, projects) {
    var inactive = {};
    (projects || []).forEach(function (p) { if (p.status !== 'active') inactive[p.id] = true; });
    return tasks.filter(function (t) { return !t.parent_id && !t.archived_at && !(t.project_id && inactive[t.project_id]); });
  }
  function column(tasks, status) { return tasks.filter(function (t) { return t.board_status === status; }).sort(byPos); }
  /* Estado de un límite WIP. limit null/0 = sin límite. */
  function wipState(count, limit) {
    if (!limit) return { limit: 0, over: false, at: false };
    return { limit: limit, over: count > limit, at: count === limit };
  }

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  /* f: { q, project ('' todos · 'none' sin proyecto · id), blocked (bool) } */
  function filterTasks(tasks, f, subs) {
    var q = norm(f.q);
    return tasks.filter(function (t) {
      if (f.project === 'none' && t.project_id) return false;
      if (f.project && f.project !== 'none' && t.project_id !== f.project) return false;
      if (f.blocked && !t.blocked) return false;
      if (!q) return true;
      var hay = [t.title, t.notes, t.next_step, t.blocked_reason];
      ((subs && subs[t.id]) || []).forEach(function (s) { hay.push(s.title); });
      return norm(hay.join(' ')).indexOf(q) !== -1;
    });
  }
  function subsOf(tasks) {
    var map = {};
    tasks.forEach(function (t) { if (t.parent_id) (map[t.parent_id] = map[t.parent_id] || []).push(t); });
    Object.keys(map).forEach(function (k) { map[k].sort(byPos); });
    return map;
  }

  /* Progreso de un proyecto: tareas de primer nivel hechas / totales. */
  function progress(tasks, projectId) {
    var own = tasks.filter(function (t) { return t.project_id === projectId && !t.parent_id && !t.archived_at; });
    var done = own.filter(function (t) { return t.board_status === 'done'; }).length;
    return { done: done, total: own.length, pct: own.length ? Math.round(done * 100 / own.length) : 0 };
  }
  function subProgress(list) {
    var done = (list || []).filter(function (s) { return s.board_status === 'done'; }).length;
    return { done: done, total: (list || []).length };
  }

  /* «Qué hago ahora»: lo empezado primero, luego revisión, luego lo listo; a igual estado, prioridad y fecha. Sin bloqueadas ni hechas. */
  var RANK = { in_progress: 0, review: 1, ready: 2, inbox: 3 };
  function nextActions(tasks) {
    return tasks.filter(function (t) { return !t.blocked && t.board_status !== 'done'; }).sort(function (a, b) {
      return (RANK[a.board_status] - RANK[b.board_status]) || (b.priority - a.priority) ||
        ((a.due_date || '9999') < (b.due_date || '9999') ? -1 : (a.due_date || '9999') > (b.due_date || '9999') ? 1 : 0) || byPos(a, b);
    });
  }

  /* Texto de una entrada de actividad (la escribe un trigger; aquí solo se redacta). */
  function activityText(a) {
    var l = '«' + (a.label || 'sin título') + '»';
    switch (a.kind) {
      case 'task_created': return 'Tarea creada: ' + l;
      case 'task_status': return l + ': ' + (STATUS_LABEL[a.from_value] || a.from_value) + ' → ' + (STATUS_LABEL[a.to_value] || a.to_value);
      case 'task_archived': return 'Tarea archivada: ' + l;
      case 'task_restored': return 'Tarea recuperada: ' + l;
      case 'project_created': return 'Proyecto creado: ' + l;
      case 'project_stage': return l + ', fase: ' + (STAGE_LABEL[a.from_value] || a.from_value) + ' → ' + (STAGE_LABEL[a.to_value] || a.to_value);
      case 'project_status': return l + ': ' + (PSTATUS_LABEL[a.from_value] || a.from_value) + ' → ' + (PSTATUS_LABEL[a.to_value] || a.to_value);
      case 'idea_created': return 'Idea capturada: ' + l;
      case 'idea_converted': return 'Idea convertida en proyecto: ' + l;
      default: return l;
    }
  }

  /* Ideas (Idea Lab), notas e investigación y entregables (hito 2). */
  var IDEA_STATUSES = [['new', 'Nueva'], ['exploring', 'Explorando'], ['converted', 'Convertida'], ['discarded', 'Descartada']];
  var IDEA_LABEL = {}; IDEA_STATUSES.forEach(function (s) { IDEA_LABEL[s[0]] = s[1]; });
  var KIND_LABEL = {}; KINDS.forEach(function (k) { KIND_LABEL[k[0]] = k[1]; });
  var NOTE_KINDS = [['note', 'Nota'], ['research', 'Investigación'], ['hypothesis', 'Hipótesis'], ['decision', 'Decisión'], ['reference', 'Referencia']];
  var NOTE_LABEL = {}; NOTE_KINDS.forEach(function (k) { NOTE_LABEL[k[0]] = k[1]; });
  var DELIV_KINDS = [['repo', 'Repositorio'], ['document', 'Documento'], ['dashboard', 'Dashboard'], ['app', 'Aplicación'], ['other', 'Otro']];
  var DELIV_LABEL = {}; DELIV_KINDS.forEach(function (k) { DELIV_LABEL[k[0]] = k[1]; });
  var DSTATUS = [['planned', 'Prevista'], ['in_progress', 'En curso'], ['delivered', 'Entregada']];
  var DSTATUS_LABEL = {}; DSTATUS.forEach(function (k) { DSTATUS_LABEL[k[0]] = k[1]; });

  /* Solo http(s): lo que llega de la base no se convierte en enlace si es otra cosa (javascript:, data:…). */
  function safeUrl(u) {
    if (!u) return null;
    try { var p = new URL(String(u)); return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null; } catch (e) { return null; }
  }
  /* f: { q, show: 'activas' (nuevas y explorando) | 'todas' | un estado }. Más recientes primero. */
  function filterIdeas(ideas, f) {
    var q = norm(f.q), show = f.show || 'activas';
    return ideas.filter(function (i) {
      if (show === 'activas' ? (i.status === 'converted' || i.status === 'discarded') : show !== 'todas' && i.status !== show) return false;
      return !q || norm([i.title, i.body, i.topic].join(' ')).indexOf(q) !== -1;
    }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0; });
  }
  /* Grupos por `topic` (los grupos con nombre por orden alfabético; «Sin grupo» al final). */
  function groupIdeas(ideas) {
    var map = {}, order = [];
    ideas.forEach(function (i) { var k = i.topic || ''; if (!map[k]) { map[k] = []; order.push(k); } map[k].push(i); });
    order.sort(function (a, b) { return a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es', { sensitivity: 'base' }); });
    return order.map(function (k) { return { topic: k, ideas: map[k] }; });
  }

  var logic = {
    IDEA_STATUSES: IDEA_STATUSES, NOTE_KINDS: NOTE_KINDS, DELIV_KINDS: DELIV_KINDS, DSTATUS: DSTATUS, KINDS: KINDS,
    safeUrl: safeUrl, filterIdeas: filterIdeas, groupIdeas: groupIdeas,
    STATUSES: STATUSES, STAGES: STAGES, DEFAULTS: DEFAULTS,
    dayKey: dayKey, daysUntil: daysUntil, dueLabel: dueLabel,
    insertPosition: insertPosition, needsRenumber: needsRenumber, boardTasks: boardTasks, column: column, wipState: wipState,
    filterTasks: filterTasks, subsOf: subsOf, progress: progress, subProgress: subProgress, nextActions: nextActions, activityText: activityText
  };

  /* ═══════════ INTERFAZ ═══════════ */
  var REP = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
  var DT = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  function render(ctx) {
    var h = ctx.h, api = ctx.api, ui = ctx.ui;
    var now = new Date();
    var st = {
      tasks: [], archived: null, projects: [], cfg: { wip: Object.assign({}, DEFAULTS.wip) }, activity: [],
      ideas: [], notes: [], deliverables: [], ext: false,       // ext: existen las tablas de ideas, notas y entregables (studio-ideas.sql)
      view: pref('view') || 'resumen', filters: { q: '', project: '', blocked: false }, ideaFilter: { q: '', show: 'activas' }, panel: null, doneMore: false
    };
    var undo = [], keep = null, lastDrag = 0, toastTimer = null, saySeq = 0, returnFocus = null, actTimer = null;
    var root = h('section', { class: 'aps', 'aria-label': 'Studio de proyectos' });
    var live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    var toastBox = h('div', { class: 'aps-toast', role: 'status', 'aria-live': 'polite' });

    function pref(k) { try { return localStorage.getItem('aps.' + k); } catch (e) { return null; } }
    function setPref(k, v) { try { localStorage.setItem('aps.' + k, v); } catch (e) { /* sin almacenamiento */ } }
    function auth(err) { if (err && err.auth) { ctx.fail(err); return true; } return false; }
    function missing(err) { return err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01'); }
    function clip(s, n) { n = n || 40; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function btn(text, cls, fn, attrs) { return h('button', Object.assign({ type: 'button', class: cls, onclick: fn }, attrs || {}), typeof text === 'string' ? [text] : text); }

    /* ── Carga ── */
    function load() {
      return Promise.all([
        api('/rest/v1/ps_tasks?select=*&archived_at=is.null&limit=3000'),
        api('/rest/v1/ps_projects?select=*&order=created_at.asc'),
        api('/rest/v1/ps_settings?select=key,value'),
        api('/rest/v1/ps_activity?select=*&order=created_at.desc&limit=12')
      ]).then(function (r) {
        st.tasks = r[0] || [];
        st.projects = r[1] || [];
        var cfg = {};
        (r[2] || []).forEach(function (a) { cfg[a.key] = a.value; });
        st.cfg.wip = Object.assign({}, DEFAULTS.wip, cfg.wip || {});
        st.activity = recent(r[3]);
      }).then(function () {
        return Promise.all([
          api('/rest/v1/ps_ideas?select=*&order=created_at.desc&limit=1000'),
          api('/rest/v1/ps_notes?select=*&order=created_at.desc&limit=2000'),
          api('/rest/v1/ps_deliverables?select=*&order=created_at.asc&limit=1000')
        ]).then(function (e) { st.ideas = e[0] || []; st.notes = e[1] || []; st.deliverables = e[2] || []; st.ext = true; }, function (err) {
          if (missing(err)) { st.ext = false; st.ideas = []; st.notes = []; st.deliverables = []; return; }     // aún sin studio-ideas.sql: el resto del Studio funciona
          throw err;
        });
      });
    }
    function recent(list) { return (list || []).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 12); }
    function refreshActivity() {      // los triggers escriben la actividad: se vuelve a pedir, sin prisa
      clearTimeout(actTimer);
      actTimer = setTimeout(function () {
        api('/rest/v1/ps_activity?select=*&order=created_at.desc&limit=12').then(function (a) {
          st.activity = recent(a);
          if (st.view === 'resumen' && root.isConnected) paint();
        }).catch(function () { /* se queda lo que hay */ });
      }, 500);
    }

    /* ── Avisos y escrituras con reversión si fallan ── */
    function say(msg, o) {
      o = o || {};
      var n = ++saySeq;
      live.textContent = '';
      setTimeout(function () { if (n === saySeq) live.textContent = msg; }, 20);
      toastBox.textContent = '';
      toastBox.classList.toggle('is-error', !!o.error);
      toastBox.appendChild(h('span', { text: msg }));
      if (o.undo) toastBox.appendChild(btn('Deshacer', 'aps-link', doUndo));
      toastBox.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastBox.classList.remove('is-on'); }, o.error ? 7000 : 5000);
    }
    function failed(err, what, rollback) {
      if (rollback) rollback();
      if (auth(err)) return;
      console.warn('[studio]', err);
      say('No se ha guardado' + (what ? ' (' + what + ')' : '') + ': ' + ((err && err.message) || 'error') + '. Se ha vuelto a cargar lo que sí está guardado.', { error: true });
      paint();
      resync();
    }
    function resync() {
      return load().then(function () { st.archived = null; if (st.view === 'archivo') return loadArchived(); paint(); }).catch(function () { /* sin red: se queda lo que hay */ });
    }
    function pushUndo(label, fn) { var e = { label: label, fn: fn }; undo.push(e); if (undo.length > 30) undo.shift(); return e; }
    function dropUndo(e) { var i = undo.indexOf(e); if (i > -1) undo.splice(i, 1); }
    function doUndo() {
      var u = undo.pop();
      if (!u) return say('No hay nada que deshacer.');
      toastBox.classList.remove('is-on');
      Promise.resolve(u.fn()).then(function () { say('Deshecho: ' + u.label + '.'); }).catch(function (err) { failed(err, 'deshacer'); });
    }

    var queue = {};
    function patchRow(table, id, patch) {      // las escrituras de una misma fila salen en orden
      var run = function () {
        return api('/rest/v1/' + table + '?id=eq.' + id + '&select=*', { method: 'PATCH', headers: REP, body: JSON.stringify(patch) }).then(function (r) {
          if (!r || !r[0]) throw new Error('El elemento ya no existe');
          return r[0];
        });
      };
      var p = (queue[id] || Promise.resolve()).then(run, run);
      queue[id] = p.catch(function () { /* el siguiente no depende de este resultado */ });
      return p;
    }
    function taskById(id) {
      for (var i = 0; i < st.tasks.length; i++) if (st.tasks[i].id === id) return st.tasks[i];
      var a = st.archived || []; for (var j = 0; j < a.length; j++) if (a[j].id === id) return a[j];
      return null;
    }
    function projectById(id) { for (var i = 0; i < st.projects.length; i++) if (st.projects[i].id === id) return st.projects[i]; return null; }
    function snapshot(o, keys) { var s = {}; keys.forEach(function (k) { s[k] = o[k]; }); return s; }
    function visible() { return boardTasks(st.tasks, st.projects); }
    function subs() { return subsOf(st.tasks); }

    /* ── Tareas: mover, crear, editar, duplicar, archivar, eliminar ── */
    function move(task, status, index, how, beforeId) {
      var prev = snapshot(task, ['board_status', 'position', 'completed_at']);
      var others = column(filterOut(visible(), task.id), status), writes = [];
      if (beforeId) { var bi = others.findIndex(function (x) { return x.id === beforeId; }); if (bi > -1) index = bi; }
      index = Math.max(0, Math.min(index, others.length));
      var limit = st.cfg.wip[status], before = others.length;
      if (needsRenumber(others, index)) {
        others.forEach(function (x, i) { var np = (i + 1) * GAP; if (x.position !== np) { x.position = np; writes.push(patchRow('ps_tasks', x.id, { position: np })); } });
      }
      task.board_status = status; task.position = insertPosition(others, index);
      if (status === 'done' && prev.board_status !== 'done') task.completed_at = new Date().toISOString();
      if (status !== 'done') task.completed_at = null;
      var w = limit && prev.board_status !== status ? wipState(before + 1, limit) : null;
      var msg = '«' + clip(task.title) + '» → ' + STATUS_LABEL[status] + '.';
      if (w && w.over) msg += ' Pasa del límite (' + (before + 1) + ' de ' + limit + '); puedes seguir.';
      say(msg, { undo: true });
      keep = task.id;
      paint();
      writes.push(patchRow('ps_tasks', task.id, { board_status: status, position: task.position }));
      var entry = pushUndo('movimiento', function () {
        Object.assign(task, prev); keep = task.id; paint();
        return patchRow('ps_tasks', task.id, { board_status: prev.board_status, position: prev.position });
      });
      refreshActivity();
      return Promise.all(writes).catch(function (err) { dropUndo(entry); failed(err, 'movimiento', function () { Object.assign(task, prev); }); });
    }
    function filterOut(list, id) { return list.filter(function (t) { return t.id !== id; }); }

    function createTask(title, status, projectId) {
      title = title.trim();
      if (!title) return Promise.resolve(null);
      var others = column(visible(), status);
      var row = { title: title.slice(0, 200), board_status: status, position: insertPosition(others, others.length), project_id: projectId || null };
      return api('/rest/v1/ps_tasks?select=*', { method: 'POST', headers: REP, body: JSON.stringify(row) }).then(function (r) {
        var t = r[0]; st.tasks.push(t); keep = t.id;
        say('Tarea creada en ' + STATUS_LABEL[status] + '.', { undo: true });
        pushUndo('crear tarea', function () { st.tasks = st.tasks.filter(function (x) { return x.id !== t.id; }); closePanelIf(t.id); paint(); return api('/rest/v1/ps_tasks?id=eq.' + t.id, { method: 'DELETE' }); });
        paint(); refreshActivity();
        return t;
      }).catch(function (err) { failed(err, 'crear tarea'); return null; });
    }

    var TASK_KEYS = ['title', 'project_id', 'priority', 'due_date', 'blocked', 'blocked_reason', 'next_step', 'notes'];
    function saveTask(task, patch, label) {
      var keys = Object.keys(patch), prev = snapshot(task, keys);
      Object.assign(task, patch);
      keep = task.id; paint();
      var entry = pushUndo(label || 'edición', function () { Object.assign(task, prev); keep = task.id; paint(); return patchRow('ps_tasks', task.id, prev); });
      return patchRow('ps_tasks', task.id, patch).then(function () { return true; }, function (err) { dropUndo(entry); failed(err, 'edición', function () { Object.assign(task, prev); }); return false; });
    }

    function duplicate(task) {
      var pool = visible(), col = column(pool, task.board_status), i = col.findIndex(function (x) { return x.id === task.id; });
      var row = { title: ('Copia de ' + task.title).slice(0, 200), board_status: task.board_status === 'done' ? 'ready' : task.board_status, project_id: task.project_id,
        priority: task.priority, due_date: task.due_date, next_step: task.next_step, notes: task.notes, position: insertPosition(col, i + 1) };
      var children = (subs()[task.id] || []);
      return api('/rest/v1/ps_tasks?select=*', { method: 'POST', headers: REP, body: JSON.stringify(row) }).then(function (r) {
        var copy = r[0]; st.tasks.push(copy);
        if (!children.length) return [copy, []];
        return api('/rest/v1/ps_tasks?select=*', { method: 'POST', headers: REP, body: JSON.stringify(children.map(function (s) {
          return { parent_id: copy.id, title: s.title, board_status: 'inbox', position: s.position };
        })) }).then(function (cs) { return [copy, cs || []]; });
      }).then(function (res) {
        res[1].forEach(function (s) { st.tasks.push(s); });
        var copy = res[0]; keep = copy.id; st.panel = { type: 'task', id: copy.id };
        say('Tarea duplicada.', { undo: true });
        pushUndo('duplicar', function () { st.tasks = st.tasks.filter(function (x) { return x.id !== copy.id && x.parent_id !== copy.id; }); closePanelIf(copy.id); paint(); return api('/rest/v1/ps_tasks?id=eq.' + copy.id, { method: 'DELETE' }); });
        paint(); refreshActivity();
      }).catch(function (err) { failed(err, 'duplicar'); });
    }

    function archive(task, on) {
      var stamp = on ? new Date().toISOString() : null, prev = task.archived_at;
      task.archived_at = stamp;
      if (on) { st.tasks = st.tasks.filter(function (x) { return x.id !== task.id && x.parent_id !== task.id; }); if (st.archived) st.archived.unshift(task); closePanelIf(task.id); }
      else { st.archived = (st.archived || []).filter(function (x) { return x.id !== task.id; }); st.tasks.push(task); }
      say(on ? '«' + clip(task.title) + '» archivada.' : '«' + clip(task.title) + '» recuperada.', { undo: true });
      paint();
      var entry = pushUndo(on ? 'archivar' : 'recuperar', function () {
        task.archived_at = prev;
        if (on) { st.tasks.push(task); st.archived = (st.archived || []).filter(function (x) { return x.id !== task.id; }); }
        else { st.tasks = st.tasks.filter(function (x) { return x.id !== task.id; }); if (st.archived) st.archived.unshift(task); }
        paint();
        return patchRow('ps_tasks', task.id, { archived_at: prev });
      });
      refreshActivity();
      return patchRow('ps_tasks', task.id, { archived_at: stamp }).then(function () {
        if (on) return api('/rest/v1/ps_tasks?parent_id=eq.' + task.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived_at: stamp }) }).catch(function () { /* las subtareas siguen al padre */ });
      }).catch(function (err) { dropUndo(entry); failed(err, 'archivar', function () { task.archived_at = prev; }); });
    }

    function remove(task) {
      var kids = subs()[task.id] || [], rows = [Object.assign({}, task)].concat(kids.map(function (k) { return Object.assign({}, k); }));
      st.tasks = st.tasks.filter(function (x) { return x.id !== task.id && x.parent_id !== task.id; });
      if (st.archived) st.archived = st.archived.filter(function (x) { return x.id !== task.id; });
      closePanelIf(task.id);
      say('«' + clip(task.title) + '» eliminada.', { undo: true });
      paint();
      var entry = pushUndo('eliminar', function () {
        return api('/rest/v1/ps_tasks?select=*', { method: 'POST', headers: REP, body: JSON.stringify(rows) }).then(function (r) {
          (r || []).forEach(function (x) { if (!x.archived_at) st.tasks.push(x); }); paint();
        });
      });
      refreshActivity();
      return api('/rest/v1/ps_tasks?id=eq.' + task.id, { method: 'DELETE' }).catch(function (err) { dropUndo(entry); failed(err, 'eliminar'); });
    }
    function closePanelIf(id) { if (st.panel && st.panel.type === 'task' && st.panel.id === id) st.panel = null; }

    function addSub(task, title) {
      title = title.trim();
      if (!title) return Promise.resolve();
      var list = subs()[task.id] || [], last = list[list.length - 1];
      return api('/rest/v1/ps_tasks?select=*', { method: 'POST', headers: REP, body: JSON.stringify({ parent_id: task.id, title: title.slice(0, 200), board_status: 'inbox', position: last ? last.position + GAP : GAP }) })
        .then(function (r) { st.tasks.push(r[0]); keep = task.id; paint(); focusPanel('[data-role="sub-new"]'); })
        .catch(function (err) { failed(err, 'añadir paso'); });
    }
    function toggleSub(sub) {
      var next = sub.board_status === 'done' ? 'inbox' : 'done', prev = sub.board_status;
      sub.board_status = next; paint(); focusPanel('[data-sub="' + sub.id + '"] input');
      patchRow('ps_tasks', sub.id, { board_status: next }).catch(function (err) { failed(err, 'paso', function () { sub.board_status = prev; }); });
    }
    function removeSub(sub) {
      var row = Object.assign({}, sub);
      st.tasks = st.tasks.filter(function (x) { return x.id !== sub.id; }); paint(); focusPanel('[data-role="sub-new"]');
      say('Paso eliminado.', { undo: true });
      var entry = pushUndo('eliminar paso', function () {
        return api('/rest/v1/ps_tasks?select=*', { method: 'POST', headers: REP, body: JSON.stringify([row]) }).then(function (r) { st.tasks.push(r[0]); paint(); });
      });
      api('/rest/v1/ps_tasks?id=eq.' + sub.id, { method: 'DELETE' }).catch(function (err) { dropUndo(entry); failed(err, 'eliminar paso'); });
    }

    /* ── Proyectos ── */
    function createProject(fields) {
      return api('/rest/v1/ps_projects?select=*', { method: 'POST', headers: REP, body: JSON.stringify(fields) }).then(function (r) {
        var p = r[0]; st.projects.push(p); st.panel = { type: 'project', id: p.id };
        say('Proyecto creado.', { undo: true });
        pushUndo('crear proyecto', function () { st.projects = st.projects.filter(function (x) { return x.id !== p.id; }); st.panel = null; paint(); return api('/rest/v1/ps_projects?id=eq.' + p.id, { method: 'DELETE' }); });
        paint(); refreshActivity();
      });
    }
    function saveProject(p, patch) {
      var keys = Object.keys(patch), prev = snapshot(p, keys);
      Object.assign(p, patch); paint();
      var entry = pushUndo('edición del proyecto', function () { Object.assign(p, prev); paint(); return patchRow('ps_projects', p.id, prev); });
      refreshActivity();
      return patchRow('ps_projects', p.id, patch).then(function () { return true; }, function (err) { dropUndo(entry); failed(err, 'proyecto', function () { Object.assign(p, prev); }); return false; });
    }
    function removeProject(p) {
      var n = st.tasks.filter(function (t) { return t.project_id === p.id; }).length;
      return ctx.ask({ title: 'Eliminar «' + clip(p.title) + '»', text: 'Se borra el proyecto y sus ' + n + ' tareas (con pasos y actividad). No se puede deshacer; si dudas, márcalo como completado o cancelado.', ok: 'Eliminar', danger: true }).then(function (ok) {
        if (!ok) return;
        st.projects = st.projects.filter(function (x) { return x.id !== p.id; });
        st.tasks = st.tasks.filter(function (t) { return t.project_id !== p.id; });
        st.notes = st.notes.filter(function (x) { return x.project_id !== p.id; });
        st.deliverables = st.deliverables.filter(function (x) { return x.project_id !== p.id; });
        st.ideas.forEach(function (i) { if (i.project_id === p.id) i.project_id = null; });      // las ideas sobreviven (set null en la base)
        if (st.filters.project === p.id) st.filters.project = '';
        st.panel = null; undo.length = 0;
        say('Proyecto «' + clip(p.title) + '» eliminado.');
        paint();
        return api('/rest/v1/ps_projects?id=eq.' + p.id, { method: 'DELETE' }).catch(function (err) { failed(err, 'eliminar proyecto'); });
      });
    }
    /* ── Ideas, notas y entregables: mismas reglas (escritura en orden, deshacer, reversión si falla) ── */
    function addRow(table, key, row, label) {
      return api('/rest/v1/' + table + '?select=*', { method: 'POST', headers: REP, body: JSON.stringify(row) }).then(function (r) {
        var o = r[0]; st[key].push(o); keep = o.id;
        say(label + ' creada.', { undo: true });
        pushUndo('crear ' + label.toLowerCase(), function () { st[key] = st[key].filter(function (x) { return x.id !== o.id; }); if (st.panel && st.panel.id === o.id) st.panel = null; paint(); return api('/rest/v1/' + table + '?id=eq.' + o.id, { method: 'DELETE' }); });
        paint(); refreshActivity();
        return o;
      });
    }
    function editRow(table, o, patch, label) {
      var keys = Object.keys(patch), prev = snapshot(o, keys);
      Object.assign(o, patch); keep = o.id; paint();
      var entry = pushUndo(label || 'edición', function () { Object.assign(o, prev); keep = o.id; paint(); return patchRow(table, o.id, prev); });
      return patchRow(table, o.id, patch).then(function () { return true; }, function (err) { dropUndo(entry); failed(err, 'edición', function () { Object.assign(o, prev); }); return false; });
    }
    function delRow(table, key, o, label) {
      var row = Object.assign({}, o);
      st[key] = st[key].filter(function (x) { return x.id !== o.id; });
      if (st.panel && st.panel.id === o.id) st.panel = null;
      say(label + ' eliminada.', { undo: true });
      paint();
      var entry = pushUndo('eliminar ' + label.toLowerCase(), function () {
        return api('/rest/v1/' + table + '?select=*', { method: 'POST', headers: REP, body: JSON.stringify([row]) }).then(function (r) { st[key].push(r[0]); paint(); });
      });
      return api('/rest/v1/' + table + '?id=eq.' + o.id, { method: 'DELETE' }).catch(function (err) { dropUndo(entry); failed(err, 'eliminar'); });
    }
    function convertIdea(idea) {
      return api('/rest/v1/rpc/ps_convert_idea', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_idea: idea.id }) }).then(function (r) {
        var p = Array.isArray(r) ? r[0] : r;
        st.projects.push(p); idea.status = 'converted'; idea.project_id = p.id; st.panel = { type: 'project', id: p.id };
        say('Idea convertida en proyecto. Se ha copiado su descripción como objetivo.');
        paint(); refreshActivity();
      }).catch(function (err) { failed(err, 'convertir'); });
    }
    function noteOf(project) { return st.notes.filter(function (n) { return n.project_id === project; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }); }
    function delivOf(project) { return st.deliverables.filter(function (d) { return d.project_id === project; }); }

    function saveWip(wip) {
      return api('/rest/v1/ps_settings?on_conflict=key', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'wip', value: wip, updated_at: new Date().toISOString() }) });
    }
    function loadArchived() {
      return api('/rest/v1/ps_tasks?select=*&archived_at=not.is.null&parent_id=is.null&limit=500').then(function (r) { st.archived = r || []; paint(); })
        .catch(function (err) { if (!auth(err)) { st.archived = []; paint(); say('No se han podido cargar las tareas archivadas.', { error: true }); } });
    }

    /* ── Pintado ── */
    var scrollLeft = 0;
    function paint() {
      now = new Date();
      var board = root.querySelector('.aps-board'); if (board) scrollLeft = board.scrollLeft;
      var ae = document.activeElement, host = ae && ae.closest && ae.closest('[data-id]');
      var focusId = keep || (host && host.getAttribute('data-id'));
      var focusRole = ae && ae.getAttribute && ae.getAttribute('data-role');
      var inPanel = ae && ae.closest && ae.closest('.aps-panel');
      root.textContent = '';
      root.appendChild(header());
      var main = h('div', { class: 'aps-main' }, [st.view === 'tablero' ? viewTablero() : st.view === 'archivo' ? viewArchivo() : st.view === 'ideas' ? viewIdeas() : viewResumen()]);
      root.appendChild(h('div', { class: 'aps-layout' + (st.panel ? ' has-panel' : '') }, [main, st.panel ? panelEl() : null]));
      root.appendChild(toastBox); root.appendChild(live);
      board = root.querySelector('.aps-board'); if (board) board.scrollLeft = scrollLeft;
      if (focusId && !inPanel) {
        var el = root.querySelector('.aps-main [data-id="' + focusId + '"] [data-role="' + (focusRole || 'open') + '"]') || root.querySelector('.aps-main [data-id="' + focusId + '"] [data-role="open"]');
        if (el) el.focus({ preventScroll: true });
      }
      keep = null;
    }
    function focusPanel(sel) { var el = root.querySelector('.aps-panel ' + sel); if (el) el.focus({ preventScroll: true }); }

    function header() {
      var active = st.projects.filter(function (p) { return p.status === 'active'; }).length;
      var open = visible().filter(function (t) { return t.board_status !== 'done'; }).length;
      return h('header', { class: 'aps-head' }, [
        h('div', null, [
          h('h2', { class: 'aps-title', text: 'Studio' }),
          h('p', { class: 'aps-sub', text: active + (active === 1 ? ' proyecto activo' : ' proyectos activos') + ' · ' + open + (open === 1 ? ' tarea abierta' : ' tareas abiertas') })
        ]),
        h('div', { class: 'aps-head-actions' }, [
          h('div', { class: 'aps-seg', role: 'group', 'aria-label': 'Vista' }, [['resumen', 'Resumen'], ['ideas', 'Ideas'], ['tablero', 'Tablero'], ['archivo', 'Archivo']].map(function (v) {
            return btn(v[1], 'aps-seg-btn', function () { st.view = v[0]; setPref('view', v[0]); paint(); if (v[0] === 'archivo' && !st.archived) loadArchived(); }, { 'aria-pressed': st.view === v[0] ? 'true' : 'false' });
          })),
          btn('Nuevo proyecto', 'aps-btn aps-btn--primary', projectDialog, { 'data-role': 'new-project' })
        ])
      ]);
    }

    function chip(text, cls, title) { return h('span', { class: 'aps-chip' + (cls ? ' ' + cls : ''), text: text, title: title || null }); }
    function projChip(t) {
      var p = t.project_id && projectById(t.project_id);
      return p ? chip(clip(p.title, 24), 'aps-chip--proj', p.title) : null;
    }
    function openPanel(type, id, opener) { returnFocus = opener || null; st.panel = { type: type, id: id }; paint(); var t = root.querySelector('.aps-panel-title'); if (t) t.focus({ preventScroll: true }); }
    function closePanel() {
      st.panel = null; paint();
      if (returnFocus) { var el = root.querySelector(returnFocus); if (el) el.focus({ preventScroll: true }); }
      returnFocus = null;
    }

    /* Resumen */
    function viewResumen() {
      var active = st.projects.filter(function (p) { return p.status === 'active'; });
      var pool = visible(), next = nextActions(pool), blocked = pool.filter(function (t) { return t.blocked && t.board_status !== 'done'; });
      if (!st.projects.length && !st.tasks.length) {
        return h('div', { class: 'aps-empty-state' }, [
          h('h3', { text: 'Empieza por un proyecto' }),
          h('p', { text: 'Un proyecto reúne su objetivo, su fase y sus tareas. Puedes crearlo con solo el nombre y completar el resto más adelante.' }),
          btn('Crear el primer proyecto', 'aps-btn aps-btn--primary', projectDialog)
        ]);
      }
      return h('div', { class: 'aps-grid' }, [
        h('section', { class: 'aps-block aps-block--wide', 'aria-labelledby': 'aps-h-proj' }, [
          h('h3', { class: 'aps-block-title', id: 'aps-h-proj', text: 'Proyectos activos' }),
          active.length ? h('ul', { class: 'aps-projects' }, active.map(projectCard)) : h('p', { class: 'aps-empty', text: 'No hay proyectos activos. Reactiva uno desde «Archivo» o crea uno nuevo.' })
        ]),
        h('section', { class: 'aps-block', 'aria-labelledby': 'aps-h-next' }, [
          h('h3', { class: 'aps-block-title', id: 'aps-h-next', text: 'Siguientes acciones' }),
          next.length ? h('ul', { class: 'aps-rows' }, next.slice(0, 6).map(function (t) { return taskRow(t); })) : h('p', { class: 'aps-empty', text: 'Sin tareas abiertas. Captura una desde el tablero.' })
        ]),
        h('section', { class: 'aps-block', 'aria-labelledby': 'aps-h-blk' }, [
          h('h3', { class: 'aps-block-title', id: 'aps-h-blk', text: 'Bloqueado' }),
          blocked.length ? h('ul', { class: 'aps-rows' }, blocked.map(function (t) { return taskRow(t, t.blocked_reason || 'Sin motivo anotado'); })) : h('p', { class: 'aps-empty', text: 'Nada bloqueado.' })
        ]),
        st.ext && st.ideas.length ? h('section', { class: 'aps-block aps-block--wide', 'aria-labelledby': 'aps-h-idea' }, [
          h('h3', { class: 'aps-block-title', id: 'aps-h-idea', text: 'Ideas recientes' }),
          h('ul', { class: 'aps-rows' }, filterIdeas(st.ideas, { q: '', show: 'activas' }).slice(0, 5).map(function (i) { return ideaRow(i); })),
          btn('Ver todas las ideas', 'aps-link', function () { st.view = 'ideas'; setPref('view', 'ideas'); paint(); })
        ]) : null,
        h('section', { class: 'aps-block aps-block--wide', 'aria-labelledby': 'aps-h-act' }, [
          h('h3', { class: 'aps-block-title', id: 'aps-h-act', text: 'Actividad reciente' }),
          st.activity.length ? h('ul', { class: 'aps-activity' }, st.activity.map(function (a) {
            return h('li', null, [h('span', { text: activityText(a) }), h('time', { datetime: a.created_at, text: DT ? DT.format(new Date(a.created_at)) : a.created_at })]);
          })) : h('p', { class: 'aps-empty', text: 'Aún no hay actividad.' })
        ])
      ]);
    }
    function projectCard(p) {
      var pr = progress(st.tasks, p.id);
      var fill = h('span');
      fill.style.width = pr.pct + '%';       // CSSOM, no el atributo style: la CSP (style-src 'self') bloquea los estilos en línea
      return h('li', { class: 'aps-project', 'data-id': p.id }, [
        h('div', { class: 'aps-project-top' }, [
          btn(p.title, 'aps-project-title', function (e) { openPanel('project', p.id, '[data-id="' + p.id + '"] [data-role="open"]'); }, { 'data-role': 'open' }),
          p.priority >= 3 ? chip(PRIO[p.priority], 'aps-chip--prio') : null
        ]),
        h('p', { class: 'aps-project-meta', text: 'Fase: ' + STAGE_LABEL[p.stage] + (p.target_date ? ' · objetivo ' + p.target_date : '') }),
        h('div', { class: 'aps-bar', role: 'img', 'aria-label': pr.done + ' de ' + pr.total + ' tareas hechas' }, [fill]),
        h('p', { class: 'aps-project-count', text: pr.total ? pr.done + ' de ' + pr.total + ' tareas hechas' : 'Sin tareas todavía' }),
        h('p', { class: p.next_action ? 'aps-next' : 'aps-next is-empty', text: p.next_action ? 'Siguiente: ' + p.next_action : 'Sin siguiente acción definida' })
      ]);
    }
    function taskRow(t, extra) {
      var d = t.due_date ? dueLabel(t.due_date, now) : null;
      return h('li', { class: 'aps-row', 'data-id': t.id, 'data-status': t.board_status }, [
        btn(t.title, 'aps-row-title', function () { openPanel('task', t.id, '.aps-main [data-id="' + t.id + '"] [data-role="open"]'); }, { 'data-role': 'open' }),
        h('span', { class: 'aps-row-meta' }, [chip(STATUS_LABEL[t.board_status], 'aps-chip--st'), projChip(t), d ? chip(d.text, 'aps-chip--' + d.tone) : null, extra ? h('span', { class: 'aps-row-note', text: extra }) : null])
      ]);
    }

    /* Idea Lab */
    function ideaRow(i) {
      var p = i.project_id && projectById(i.project_id);
      return h('li', { class: 'aps-row aps-idea', 'data-id': i.id }, [
        h('div', { class: 'aps-idea-main' }, [
          btn(i.title, 'aps-row-title', function () { openPanel('idea', i.id, '.aps-main [data-id="' + i.id + '"] [data-role="open"]'); }, { 'data-role': 'open' }),
          i.body ? h('p', { class: 'aps-idea-body', text: clip(i.body, 140) }) : null
        ]),
        h('span', { class: 'aps-row-meta' }, [chip(IDEA_LABEL[i.status], 'aps-chip--idea-' + i.status), i.kind ? chip(KIND_LABEL[i.kind]) : null, p ? chip(clip(p.title, 24), 'aps-chip--proj', p.title) : null])
      ]);
    }
    function viewIdeas() {
      if (!st.ext) return h('p', { class: 'aps-setup', text: 'Las tablas de ideas, notas y entregables aún no existen. Ejecuta supabase/studio-ideas.sql en el SQL Editor (una vez, es idempotente) y recarga la página.' });
      var f = st.ideaFilter, list = filterIdeas(st.ideas, f), groups = groupIdeas(list);
      var q = h('input', { class: 'aps-input', type: 'search', placeholder: 'Buscar ideas', 'aria-label': 'Buscar ideas', value: f.q, 'data-role': 'search' });
      q.addEventListener('input', function () { f.q = q.value; paint(); var n = root.querySelector('[data-role="search"]'); if (n) { n.focus(); n.setSelectionRange(f.q.length, f.q.length); } });
      var show = ui.select([['activas', 'Nuevas y explorando'], ['todas', 'Todas']].concat(IDEA_STATUSES), f.show);
      show.className = 'aps-select'; show.setAttribute('aria-label', 'Mostrar ideas');
      show.addEventListener('change', function () { f.show = show.value; paint(); });
      return h('div', null, [
        h('form', { class: 'aps-capture', onsubmit: function (e) {
          e.preventDefault();
          var input = e.target.elements.t, v = input.value.trim();
          if (!v) return;
          input.value = '';
          addRow('ps_ideas', 'ideas', { title: v.slice(0, 200) }, 'Idea').then(function () { var i = root.querySelector('.aps-capture input'); if (i) i.focus(); }).catch(function (err) { failed(err, 'crear idea'); });
        } }, [
          h('label', { class: 'sr-only', for: 'aps-idea-cap', text: 'Capturar una idea' }),
          h('input', { id: 'aps-idea-cap', name: 't', class: 'aps-input', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Capturar una idea y pulsar Intro; la estructuras después', 'data-role': 'capture' })
        ]),
        h('div', { class: 'aps-filters' }, [q, show]),
        groups.length ? groups.map(function (g, n) {
          var id = 'aps-g-' + n;
          return h('section', { class: 'aps-block aps-idea-group', 'aria-labelledby': id }, [
            h('h3', { class: 'aps-block-title', id: id, text: g.topic || 'Sin grupo' }),
            h('ul', { class: 'aps-rows' }, g.ideas.map(ideaRow))
          ]);
        }) : h('p', { class: 'aps-empty', text: st.ideas.length ? 'Ninguna idea con estos filtros.' : 'Aún no hay ideas. Captura la primera arriba: basta una frase.' })
      ]);
    }

    /* Tablero */
    function viewTablero() {
      var f = st.filters, all = visible(), filtered = filterTasks(all, f, subs()), sub = subs();
      var hasFilter = !!(f.q || f.project || f.blocked);
      return h('div', null, [
        h('form', { class: 'aps-capture', onsubmit: function (e) {
          e.preventDefault();
          var input = e.target.elements.t, v = input.value;
          input.value = '';
          createTask(v, 'inbox', f.project && f.project !== 'none' ? f.project : null).then(function () { var i = root.querySelector('.aps-capture input'); if (i) i.focus(); });
        } }, [
          h('label', { class: 'sr-only', for: 'aps-cap', text: 'Capturar tarea en la bandeja' }),
          h('input', { id: 'aps-cap', name: 't', class: 'aps-input', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Capturar tarea y pulsar Intro', 'data-role': 'capture' })
        ]),
        filtersEl(hasFilter),
        h('div', { class: 'aps-board', role: 'group', 'aria-label': 'Tablero de tareas' }, STATUSES.map(function (s) {
          return colEl(s, column(filtered, s.id), column(all, s.id).length, sub, hasFilter);
        }))
      ]);
    }
    function filtersEl(hasFilter) {
      var f = st.filters;
      var q = h('input', { class: 'aps-input', type: 'search', placeholder: 'Buscar', 'aria-label': 'Buscar tareas', value: f.q, 'data-role': 'search' });
      q.addEventListener('input', function () { f.q = q.value; paint(); var n = root.querySelector('[data-role="search"]'); if (n) { n.focus(); n.setSelectionRange(f.q.length, f.q.length); } });
      var proj = ui.select(st.projects.filter(function (p) { return p.status === 'active'; }).map(function (p) { return [p.id, p.title]; }).concat([['none', 'Sin proyecto']]), f.project, 'Todos los proyectos');
      proj.className = 'aps-select'; proj.setAttribute('aria-label', 'Filtrar por proyecto');
      proj.addEventListener('change', function () { f.project = proj.value; paint(); });
      return h('div', { class: 'aps-filters' }, [
        q, proj,
        btn('Solo bloqueadas', 'aps-chipbtn', function () { f.blocked = !f.blocked; paint(); }, { 'aria-pressed': f.blocked ? 'true' : 'false' }),
        hasFilter ? btn('Quitar filtros', 'aps-link', function () { st.filters = { q: '', project: '', blocked: false }; paint(); }) : null,
        btn('Límites', 'aps-link aps-filters-end', wipDialog)
      ]);
    }
    function colEl(s, cards, total, sub, filtered) {
      var limit = st.cfg.wip[s.id], w = wipState(total, limit), shown = cards, more = 0;
      if (s.id === 'done' && !st.doneMore && cards.length > 8) { shown = cards.slice(-8); more = cards.length - 8; }
      var count = h('span', { class: 'aps-count' + (w.over ? ' is-over' : w.at ? ' is-at' : ''), text: limit ? total + ' / ' + limit : String(total) });
      return h('section', { class: 'aps-col', 'data-status': s.id, 'aria-label': s.label }, [
        h('div', { class: 'aps-col-head' }, [h('h3', { class: 'aps-col-title', text: s.label }), count]),
        w.over ? h('p', { class: 'aps-wipwarn', role: 'note', text: 'Por encima del límite (' + total + ' de ' + limit + '). Puedes seguir, pero terminar antes de empezar suele ir más rápido.' }) : null,
        h('ul', { class: 'aps-list', 'data-status': s.id }, shown.map(function (t) { return cardEl(t, sub); })),
        !shown.length ? h('p', { class: 'aps-empty', text: filtered ? 'Nada con estos filtros.' : s.empty }) : null,
        more ? btn('Ver las ' + more + ' anteriores', 'aps-link', function () { st.doneMore = true; paint(); }) : null,
        s.id === 'done' ? null : btn('+ Añadir', 'aps-link aps-add', function () { addInline(s.id); }, { 'data-role': 'add-' + s.id })
      ]);
    }
    function addInline(status) {
      var col = root.querySelector('.aps-col[data-status="' + status + '"]'), add = col && col.querySelector('.aps-add');
      if (!col || col.querySelector('.aps-add-form')) return;
      var input = h('input', { class: 'aps-input', type: 'text', maxlength: '200', 'aria-label': 'Título de la tarea en ' + STATUS_LABEL[status], autocomplete: 'off' });
      var form = h('form', { class: 'aps-add-form', onsubmit: function (e) {
        e.preventDefault();
        var v = input.value; input.value = '';
        var pid = st.filters.project && st.filters.project !== 'none' ? st.filters.project : null;
        createTask(v, status, pid).then(function () { var c = root.querySelector('.aps-col[data-status="' + status + '"]'); if (c && !c.querySelector('.aps-add-form')) addInline(status); });
      } }, [input]);
      input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); form.remove(); add.focus(); } });
      col.insertBefore(form, add); input.focus();
    }
    function cardEl(t, sub) {
      var d = t.due_date && t.board_status !== 'done' ? dueLabel(t.due_date, now) : null, sp = subProgress(sub[t.id]);
      var meta = [projChip(t), t.priority >= 3 ? chip(PRIO[t.priority], 'aps-chip--prio') : null, t.blocked ? chip('Bloqueada', 'aps-chip--blocked', t.blocked_reason || null) : null,
        d ? chip(d.text, 'aps-chip--' + d.tone) : null, sp.total ? chip(sp.done + '/' + sp.total + ' pasos') : null].filter(Boolean);
      return h('li', { class: 'aps-card' + (t.blocked ? ' is-blocked' : '') + (t.board_status === 'done' ? ' is-done' : ''), 'data-id': t.id, 'data-status': t.board_status }, [
        h('div', { class: 'aps-card-top' }, [
          h('span', { class: 'aps-grip', 'aria-hidden': 'true', text: '⠿' }),
          btn(t.title, 'aps-card-open', function () { openPanel('task', t.id, '.aps-main [data-id="' + t.id + '"] [data-role="open"]'); }, { 'data-role': 'open', 'aria-keyshortcuts': 'Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight' })
        ]),
        meta.length ? h('div', { class: 'aps-card-meta' }, meta) : null
      ]);
    }

    /* Archivo */
    function viewArchivo() {
      var inactive = st.projects.filter(function (p) { return p.status !== 'active'; });
      return h('div', { class: 'aps-grid' }, [
        h('section', { class: 'aps-block aps-block--wide', 'aria-labelledby': 'aps-h-ap' }, [
          h('h3', { class: 'aps-block-title', id: 'aps-h-ap', text: 'Proyectos en pausa, completados o cancelados' }),
          h('p', { class: 'aps-hint', text: 'Sus tareas dejan de aparecer en el tablero hasta que el proyecto vuelva a estar activo.' }),
          inactive.length ? h('ul', { class: 'aps-rows' }, inactive.map(function (p) {
            return h('li', { class: 'aps-row', 'data-id': p.id }, [
              btn(p.title, 'aps-row-title', function () { openPanel('project', p.id, '.aps-main [data-id="' + p.id + '"] [data-role="open"]'); }, { 'data-role': 'open' }),
              h('span', { class: 'aps-row-meta' }, [chip(PSTATUS_LABEL[p.status], 'aps-chip--st'), chip('Fase: ' + STAGE_LABEL[p.stage]),
                btn('Reactivar', 'aps-link', function () { saveProject(p, { status: 'active' }); say('Proyecto reactivado.', { undo: true }); })])
            ]);
          })) : h('p', { class: 'aps-empty', text: 'Ningún proyecto archivado.' })
        ]),
        h('section', { class: 'aps-block aps-block--wide', 'aria-labelledby': 'aps-h-at' }, [
          h('h3', { class: 'aps-block-title', id: 'aps-h-at', text: 'Tareas archivadas' }),
          st.archived === null ? h('p', { class: 'aps-empty', text: 'Cargando…' }) :
            st.archived.length ? h('ul', { class: 'aps-rows' }, st.archived.map(function (t) {
              return h('li', { class: 'aps-row', 'data-id': t.id }, [
                h('span', { class: 'aps-row-title is-static', text: t.title }),
                h('span', { class: 'aps-row-meta' }, [projChip(t), btn('Recuperar', 'aps-link', function () { archive(t, false); }),
                  btn('Eliminar', 'aps-link aps-link--danger', function () { ctx.ask({ title: 'Eliminar «' + clip(t.title) + '»', text: 'Se borra con sus pasos. Podrás deshacerlo unos segundos.', ok: 'Eliminar', danger: true }).then(function (ok) { if (ok) remove(t); }); })])
              ]);
            })) : h('p', { class: 'aps-empty', text: 'Ninguna tarea archivada.' })
        ])
      ]);
    }

    /* Panel lateral contextual */
    function panelEl() {
      var p = st.panel;
      if (p.type === 'project') { var pr = projectById(p.id); if (pr) return projectPanel(pr); }
      else if (p.type === 'idea') { var id = st.ideas.filter(function (x) { return x.id === p.id; })[0]; if (id) return ideaPanel(id); }
      else { var t = taskById(p.id); if (t) return taskPanel(t); }
      st.panel = null; return null;
    }
    function panelShell(title, body, labelId) {
      return h('aside', { class: 'aps-panel', 'aria-labelledby': labelId, onkeydown: function (e) { if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); closePanel(); } } }, [
        h('div', { class: 'aps-panel-head' }, [
          h('h3', { class: 'aps-panel-title', id: labelId, tabindex: '-1', text: title }),
          btn('Cerrar', 'aps-link', closePanel, { 'aria-label': 'Cerrar panel' })
        ]), body
      ]);
    }
    function taskPanel(t) {
      var title = ui.input('text', t.title, { maxlength: '200', required: 'true' });
      var projSel = ui.select(st.projects.filter(function (p) { return p.status === 'active' || p.id === t.project_id; }).map(function (p) { return [p.id, p.title]; }), t.project_id || '', 'Sin proyecto');
      var statusSel = ui.select(STATUSES.map(function (s) { return [s.id, s.label]; }), t.board_status);
      var prioSel = ui.select([[1, 'Baja'], [2, 'Normal'], [3, 'Alta'], [4, 'Urgente']].map(function (x) { return [String(x[0]), x[1]]; }), String(t.priority));
      var due = ui.input('date', t.due_date || '');
      var blocked = h('input', { type: 'checkbox', checked: t.blocked ? '' : null }); blocked.checked = !!t.blocked;
      var reason = ui.input('text', t.blocked_reason || '', { maxlength: '300' });
      var next = ui.input('text', t.next_step || '', { maxlength: '300' });
      var notes = ui.area(t.notes || '', 5, 8000);
      var msg = h('p', { class: 'aps-panel-msg', role: 'alert' });
      var list = subs()[t.id] || [], sp = subProgress(list);
      var newSub = h('input', { class: 'aps-input', type: 'text', maxlength: '200', 'aria-label': 'Nuevo paso', placeholder: 'Añadir paso', autocomplete: 'off', 'data-role': 'sub-new' });
      newSub.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var v = newSub.value; newSub.value = ''; addSub(t, v); } });
      reason.disabled = !blocked.checked;
      blocked.addEventListener('change', function () { reason.disabled = !blocked.checked; if (blocked.checked) reason.focus(); });

      var form = h('form', { class: 'aps-form', novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var v = title.value.trim();
        if (!v) { msg.textContent = 'El título no puede estar vacío.'; title.focus(); return; }
        msg.textContent = '';
        var patch = {}, vals = {
          title: v, project_id: projSel.value || null, priority: +prioSel.value, due_date: due.value || null, blocked: blocked.checked,
          blocked_reason: blocked.checked ? (reason.value.trim() || null) : null, next_step: next.value.trim() || null, notes: notes.value.trim() || null
        };
        TASK_KEYS.forEach(function (k) { if (vals[k] !== (t[k] == null ? (k === 'blocked' ? false : null) : t[k])) patch[k] = vals[k]; });
        var changed = Object.keys(patch).length || statusSel.value !== t.board_status;
        if (!changed) { say('Sin cambios.'); return; }
        var job = Promise.resolve();
        if (statusSel.value !== t.board_status) { var tgt = column(filterOut(visible(), t.id), statusSel.value); job = move(t, statusSel.value, tgt.length, 'panel'); }
        job.then(function () { return Object.keys(patch).length ? saveTask(t, patch) : true; }).then(function (ok) { if (ok !== false) say('Cambios guardados.', { undo: true }); });
      } }, [
        ui.field('aps-t-title', 'Título', title, { wide: true }),
        ui.field('aps-t-status', 'Estado', statusSel),
        ui.field('aps-t-proj', 'Proyecto', projSel),
        ui.field('aps-t-prio', 'Prioridad', prioSel),
        ui.field('aps-t-due', 'Fecha límite', due),
        h('div', { class: 'apf-field apf-wide aps-check' }, [h('label', null, [blocked, ' Bloqueada'])]),
        ui.field('aps-t-reason', 'Motivo del bloqueo', reason, { wide: true }),
        ui.field('aps-t-next', 'Siguiente paso', next, { wide: true }),
        ui.field('aps-t-notes', 'Notas', notes, { wide: true }),
        msg,
        h('div', { class: 'aps-panel-actions' }, [h('button', { type: 'submit', class: 'aps-btn aps-btn--primary', text: 'Guardar' })])
      ]);
      var steps = h('section', { class: 'aps-steps', 'aria-labelledby': 'aps-steps-h' }, [
        h('h4', { id: 'aps-steps-h', class: 'aps-sub-title', text: 'Pasos' + (sp.total ? ' · ' + sp.done + ' de ' + sp.total : '') }),
        list.length ? h('ul', { class: 'aps-step-list' }, list.map(function (s) {
          var cb = h('input', { type: 'checkbox', 'aria-label': s.title }); cb.checked = s.board_status === 'done';
          cb.addEventListener('change', function () { toggleSub(s); });
          return h('li', { 'data-sub': s.id, class: s.board_status === 'done' ? 'is-done' : null }, [cb, h('span', { text: s.title }), btn('Quitar', 'aps-link aps-link--danger', function () { removeSub(s); }, { 'aria-label': 'Quitar el paso «' + s.title + '»' })]);
        })) : null,
        newSub
      ]);
      var foot = h('div', { class: 'aps-panel-foot' }, [
        btn('Duplicar', 'aps-link', function () { duplicate(t); }),
        btn('Archivar', 'aps-link', function () { archive(t, true); }),
        btn('Eliminar', 'aps-link aps-link--danger', function () {
          ctx.ask({ title: 'Eliminar «' + clip(t.title) + '»', text: 'Se borra con sus pasos. Podrás deshacerlo unos segundos; si dudas, archívala.', ok: 'Eliminar', danger: true }).then(function (ok) { if (ok) remove(t); });
        })
      ]);
      return panelShell('Tarea', h('div', null, [form, steps, foot]), 'aps-panel-t');
    }
    function ideaPanel(i) {
      var title = ui.input('text', i.title, { maxlength: '200', required: 'true' });
      var body = ui.area(i.body || '', 5, 4000);
      var kind = ui.select(KINDS, i.kind || '', 'Sin clasificar');
      var topic = ui.input('text', i.topic || '', { maxlength: '60', list: 'aps-topics' });
      var topics = h('datalist', { id: 'aps-topics' }, Object.keys(st.ideas.reduce(function (m, x) { if (x.topic) m[x.topic] = 1; return m; }, {})).map(function (t) { return h('option', { value: t }); }));
      var statusSel = ui.select(IDEA_STATUSES.filter(function (s) { return s[0] !== 'converted' || i.status === 'converted'; }), i.status);
      var proj = ui.select(st.projects.filter(function (p) { return p.status === 'active' || p.id === i.project_id; }).map(function (p) { return [p.id, p.title]; }), i.project_id || '', 'Sin proyecto');
      var msg = h('p', { class: 'aps-panel-msg', role: 'alert' });
      var linked = i.project_id && projectById(i.project_id);
      var form = h('form', { class: 'aps-form', novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var v = title.value.trim();
        if (!v) { msg.textContent = 'El título no puede estar vacío.'; title.focus(); return; }
        msg.textContent = '';
        var vals = { title: v, body: body.value.trim() || null, kind: kind.value || null, topic: topic.value.trim() || null, status: statusSel.value, project_id: proj.value || null }, patch = {};
        Object.keys(vals).forEach(function (k) { if (vals[k] !== (i[k] == null ? null : i[k])) patch[k] = vals[k]; });
        if (!Object.keys(patch).length) { say('Sin cambios.'); return; }
        editRow('ps_ideas', i, patch, 'edición de la idea').then(function (ok) { if (ok) say('Cambios guardados.', { undo: true }); });
      } }, [
        ui.field('aps-i-title', 'Idea', title, { wide: true }),
        ui.field('aps-i-body', 'Descripción', body, { wide: true, hint: 'Al convertirla en proyecto, esta descripción pasa a ser su objetivo.' }),
        ui.field('aps-i-kind', 'Tipo', kind),
        ui.field('aps-i-status', 'Estado', statusSel),
        ui.field('aps-i-topic', 'Grupo', topic, { hint: 'Escribe un nombre para agrupar ideas parecidas.' }),
        ui.field('aps-i-proj', 'Conectada al proyecto', proj),
        topics, msg,
        h('div', { class: 'aps-panel-actions' }, [h('button', { type: 'submit', class: 'aps-btn aps-btn--primary', text: 'Guardar' })])
      ]);
      var foot = h('div', { class: 'aps-panel-foot' }, [
        i.status !== 'converted' ? btn('Convertir en proyecto', 'aps-link', function () { convertIdea(i); }) : null,
        linked ? btn('Abrir el proyecto', 'aps-link', function () { openPanel('project', linked.id, null); }) : null,
        btn('Eliminar', 'aps-link aps-link--danger', function () {
          ctx.ask({ title: 'Eliminar «' + clip(i.title) + '»', text: 'Podrás deshacerlo unos segundos. Si dudas, márcala como descartada.', ok: 'Eliminar', danger: true }).then(function (ok) { if (ok) delRow('ps_ideas', 'ideas', i, 'Idea'); });
        })
      ]);
      return panelShell('Idea', h('div', null, [form, foot]), 'aps-panel-i');
    }

    /* Secciones desplegables del proyecto (divulgación progresiva): solo se abre lo que se necesita. */
    function noteDialog(project, note) {
      var kind = ui.select(NOTE_KINDS, note ? note.kind : 'note');
      var title = ui.input('text', note ? note.title : '', { maxlength: '200', required: 'true' });
      var url = ui.input('url', note && note.url || '', { maxlength: '500', placeholder: 'https://' });
      var body = ui.area(note ? note.body || '' : '', 6, 8000);
      ui.formDialog(note ? 'Editar nota' : 'Nueva nota', note ? 'Guardar' : 'Añadir', [
        ui.field('aps-nt-kind', 'Tipo', kind), ui.field('aps-nt-title', 'Título', title),
        ui.field('aps-nt-url', 'Enlace (opcional)', url, { wide: true, hint: 'Útil para referencias y fuentes. Solo http o https.' }),
        ui.field('aps-nt-body', 'Contenido', body, { wide: true })
      ], function () {
        var t = title.value.trim(), u = url.value.trim();
        if (!t) throw ui.invalid('Escribe un título.', title);
        if (u && !safeUrl(u)) throw ui.invalid('El enlace debe empezar por http:// o https://.', url);
        var vals = { kind: kind.value, title: t, url: u ? safeUrl(u) : null, body: body.value.trim() || null };
        if (!note) return addRow('ps_notes', 'notes', Object.assign({ project_id: project.id }, vals), 'Nota');
        return editRow('ps_notes', note, vals, 'edición de la nota').then(function (ok) { if (!ok) throw new Error('No se ha podido guardar la nota.'); });
      }, title);
    }
    function delivDialog(project, d) {
      var kind = ui.select(DELIV_KINDS, d ? d.kind : 'other');
      var status = ui.select(DSTATUS, d ? d.status : 'planned');
      var title = ui.input('text', d ? d.title : '', { maxlength: '200', required: 'true' });
      var url = ui.input('url', d && d.url || '', { maxlength: '500', placeholder: 'https://' });
      ui.formDialog(d ? 'Editar entregable' : 'Nuevo entregable', d ? 'Guardar' : 'Añadir', [
        ui.field('aps-dl-kind', 'Tipo', kind), ui.field('aps-dl-status', 'Estado', status),
        ui.field('aps-dl-title', 'Nombre', title, { wide: true }),
        ui.field('aps-dl-url', 'Enlace (opcional)', url, { wide: true, hint: 'Repositorio, documento, dashboard o aplicación. Solo http o https.' })
      ], function () {
        var t = title.value.trim(), u = url.value.trim();
        if (!t) throw ui.invalid('Escribe un nombre.', title);
        if (u && !safeUrl(u)) throw ui.invalid('El enlace debe empezar por http:// o https://.', url);
        var vals = { kind: kind.value, status: status.value, title: t, url: u ? safeUrl(u) : null };
        if (!d) return addRow('ps_deliverables', 'deliverables', Object.assign({ project_id: project.id }, vals), 'Entregable');
        return editRow('ps_deliverables', d, vals, 'edición del entregable').then(function (ok) { if (!ok) throw new Error('No se ha podido guardar el entregable.'); });
      }, title);
    }
    function section(id, title, count, open, body) {
      var key = 'sec.' + id;
      var det = h('details', { class: 'aps-sec', open: (pref(key) == null ? open : pref(key) === '1') ? '' : null }, [
        h('summary', { class: 'aps-sec-sum' }, [h('span', { text: title }), h('span', { class: 'aps-count', text: String(count) })]), body
      ]);
      det.addEventListener('toggle', function () { setPref(key, det.open ? '1' : '0'); });
      return det;
    }
    function notesSection(p) {
      var list = noteOf(p.id);
      return section('notes', 'Notas e investigación', list.length, list.length > 0, h('div', null, [
        !st.ext ? h('p', { class: 'aps-setup', text: 'Ejecuta supabase/studio-ideas.sql para activar las notas.' }) : [
          list.length ? h('ul', { class: 'aps-rows' }, list.map(function (n) {
            var u = safeUrl(n.url);
            return h('li', { class: 'aps-row aps-note', 'data-id': n.id }, [
              h('div', { class: 'aps-idea-main' }, [
                btn(n.title, 'aps-row-title', function () { noteDialog(p, n); }, { 'data-role': 'open', 'aria-label': 'Editar la nota «' + n.title + '»' }),
                n.body ? h('p', { class: 'aps-idea-body', text: clip(n.body, 160) }) : null,
                u ? h('a', { class: 'aps-ext', href: u, target: '_blank', rel: 'noopener noreferrer', text: clip(u.replace(/^https?:\/\//, ''), 50) }) : null
              ]),
              h('span', { class: 'aps-row-meta' }, [chip(NOTE_LABEL[n.kind]), btn('Quitar', 'aps-link aps-link--danger', function () { delRow('ps_notes', 'notes', n, 'Nota'); }, { 'aria-label': 'Quitar la nota «' + n.title + '»' })])
            ]);
          })) : h('p', { class: 'aps-empty', text: 'Sin notas. Guarda aquí referencias, hipótesis y decisiones.' }),
          btn('+ Añadir nota', 'aps-link', function () { noteDialog(p); }, { 'data-role': 'add-note' })
        ]
      ]));
    }
    function delivSection(p) {
      var list = delivOf(p.id), done = list.filter(function (d) { return d.status === 'delivered'; }).length;
      return section('deliv', 'Entregables', list.length ? done + '/' + list.length : 0, list.length > 0, h('div', null, [
        !st.ext ? h('p', { class: 'aps-setup', text: 'Ejecuta supabase/studio-ideas.sql para activar los entregables.' }) : [
          list.length ? h('ul', { class: 'aps-rows' }, list.map(function (d) {
            var u = safeUrl(d.url);
            return h('li', { class: 'aps-row', 'data-id': d.id }, [
              h('div', { class: 'aps-idea-main' }, [
                btn(d.title, 'aps-row-title', function () { delivDialog(p, d); }, { 'data-role': 'open', 'aria-label': 'Editar el entregable «' + d.title + '»' }),
                u ? h('a', { class: 'aps-ext', href: u, target: '_blank', rel: 'noopener noreferrer', text: clip(u.replace(/^https?:\/\//, ''), 50) }) : null
              ]),
              h('span', { class: 'aps-row-meta' }, [chip(DELIV_LABEL[d.kind]), chip(DSTATUS_LABEL[d.status], d.status === 'delivered' ? 'aps-chip--done' : ''), btn('Quitar', 'aps-link aps-link--danger', function () { delRow('ps_deliverables', 'deliverables', d, 'Entregable'); }, { 'aria-label': 'Quitar el entregable «' + d.title + '»' })])
            ]);
          })) : h('p', { class: 'aps-empty', text: 'Sin entregables. Añade el repositorio, el documento o el dashboard cuando existan.' }),
          btn('+ Añadir entregable', 'aps-link', function () { delivDialog(p); }, { 'data-role': 'add-deliv' })
        ]
      ]));
    }

    function projectPanel(p) {
      var title = ui.input('text', p.title, { maxlength: '160', required: 'true' });
      var kind = ui.select(KINDS, p.kind || '', 'Sin tipo');
      var goal = ui.area(p.goal || '', 3, 1000), scope = ui.area(p.scope || '', 4, 4000);
      var stage = ui.select(STAGES.map(function (s) { return [s.id, s.label]; }), p.stage);
      var status = ui.select(PSTATUS, p.status);
      var prio = ui.select([['1', 'Baja'], ['2', 'Normal'], ['3', 'Alta'], ['4', 'Urgente']], String(p.priority));
      var target = ui.input('date', p.target_date || '');
      var next = ui.input('text', p.next_action || '', { maxlength: '300' });
      var msg = h('p', { class: 'aps-panel-msg', role: 'alert' });
      var pr = progress(st.tasks, p.id);
      var tasks = st.tasks.filter(function (t) { return t.project_id === p.id && !t.parent_id; }).sort(byPos);
      var form = h('form', { class: 'aps-form', novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var v = title.value.trim();
        if (!v) { msg.textContent = 'El nombre no puede estar vacío.'; title.focus(); return; }
        msg.textContent = '';
        var vals = { title: v, kind: kind.value || null, goal: goal.value.trim() || null, scope: scope.value.trim() || null, stage: stage.value, status: status.value,
          priority: +prio.value, target_date: target.value || null, next_action: next.value.trim() || null }, patch = {};
        Object.keys(vals).forEach(function (k) { if (vals[k] !== (p[k] == null ? null : p[k])) patch[k] = vals[k]; });
        if (!Object.keys(patch).length) { say('Sin cambios.'); return; }
        saveProject(p, patch).then(function (ok) { if (ok) say('Cambios guardados.', { undo: true }); });
      } }, [
        ui.field('aps-p-title', 'Nombre', title, { wide: true }),
        ui.field('aps-p-goal', 'Objetivo', goal, { wide: true }),
        ui.field('aps-p-next', 'Siguiente acción', next, { wide: true }),
        ui.field('aps-p-stage', 'Fase', stage),
        ui.field('aps-p-status', 'Estado', status),
        ui.field('aps-p-prio', 'Prioridad', prio),
        ui.field('aps-p-target', 'Fecha objetivo', target),
        ui.field('aps-p-kind', 'Tipo', kind),
        ui.field('aps-p-scope', 'Alcance', scope, { wide: true }),
        msg,
        h('div', { class: 'aps-panel-actions' }, [h('button', { type: 'submit', class: 'aps-btn aps-btn--primary', text: 'Guardar' })])
      ]);
      var list = h('section', { class: 'aps-steps', 'aria-labelledby': 'aps-ptasks-h' }, [
        h('h4', { id: 'aps-ptasks-h', class: 'aps-sub-title', text: 'Tareas · ' + pr.done + ' de ' + pr.total + ' hechas' }),
        tasks.length ? h('ul', { class: 'aps-rows' }, tasks.map(function (t) {
          return h('li', { class: 'aps-row', 'data-id': t.id }, [
            btn(t.title, 'aps-row-title', function () { openPanel('task', t.id, null); }, { 'data-role': 'open' }),
            h('span', { class: 'aps-row-meta' }, [chip(STATUS_LABEL[t.board_status], 'aps-chip--st')])
          ]);
        })) : h('p', { class: 'aps-empty', text: 'Sin tareas. Añádelas desde el tablero filtrando por este proyecto.' }),
        btn('Ver en el tablero', 'aps-link', function () { st.filters = { q: '', project: p.id, blocked: false }; st.view = 'tablero'; setPref('view', 'tablero'); st.panel = null; paint(); })
      ]);
      var foot = h('div', { class: 'aps-panel-foot' }, [
        btn('Eliminar proyecto', 'aps-link aps-link--danger', function () { removeProject(p); })
      ]);
      return panelShell('Proyecto', h('div', null, [form, list, notesSection(p), delivSection(p), foot]), 'aps-panel-p');
    }

    /* Diálogos */
    function projectDialog() {
      var title = ui.input('text', '', { maxlength: '160', required: 'true' });
      var kind = ui.select(KINDS, '', 'Sin tipo');
      var goal = ui.area('', 3, 1000);
      ui.formDialog('Nuevo proyecto', 'Crear', [
        ui.field('aps-n-title', 'Nombre', title, { wide: true }),
        ui.field('aps-n-kind', 'Tipo', kind),
        ui.field('aps-n-goal', 'Objetivo (opcional)', goal, { wide: true, hint: 'Puedes completarlo más adelante.' })
      ], function () {
        var v = title.value.trim();
        if (!v) throw ui.invalid('Escribe un nombre.', title);
        return createProject({ title: v, kind: kind.value || null, goal: goal.value.trim() || null });
      }, title);
    }
    function wipDialog() {
      var a = ui.input('number', st.cfg.wip.in_progress || 0, { min: '0', max: '20' }), b = ui.input('number', st.cfg.wip.review || 0, { min: '0', max: '20' });
      ui.formDialog('Límites de trabajo en curso', 'Guardar', [
        ui.field('aps-w-a', 'En curso (0 = sin límite)', a), ui.field('aps-w-b', 'Revisión (0 = sin límite)', b),
        h('p', { class: 'apf-hint apf-wide', text: 'Los límites avisan, no impiden mover tareas.' })
      ], function () {
        var wip = { in_progress: Math.max(0, Math.min(20, +a.value || 0)), review: Math.max(0, Math.min(20, +b.value || 0)) };
        return saveWip(wip).then(function () { st.cfg.wip = wip; paint(); say('Límites guardados.'); });
      }, a);
    }

    /* ── Teclado ── */
    root.addEventListener('keydown', function (ev) {
      var el = ev.target.closest && ev.target.closest('.aps-card[data-id]');
      if (!el || !ev.shiftKey || !/^Arrow(Up|Down|Left|Right)$/.test(ev.key) || ev.target.closest('input, select, textarea')) return;
      var t = taskById(el.getAttribute('data-id')); if (!t) return;
      ev.preventDefault();
      var idx = STATUSES.findIndex(function (s) { return s.id === t.board_status; }), col = column(visible(), t.board_status), i = col.findIndex(function (x) { return x.id === t.id; });
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        var to = i + (ev.key === 'ArrowUp' ? -1 : 1);
        if (to < 0 || to >= col.length) return say(ev.key === 'ArrowUp' ? 'Ya es la primera.' : 'Ya es la última.');
        move(t, t.board_status, to, 'key');
      } else {
        var ni = idx + (ev.key === 'ArrowLeft' ? -1 : 1);
        if (ni < 0 || ni >= STATUSES.length) return say('No hay más columnas en esa dirección.');
        move(t, STATUSES[ni].id, Math.min(i, column(visible(), STATUSES[ni].id).length), 'key');
      }
    });
    function onDocKey(ev) {
      if (!root.isConnected) { document.removeEventListener('keydown', onDocKey); return; }
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z' && !(ev.target.closest && ev.target.closest('input, textarea, select, dialog'))) { ev.preventDefault(); doUndo(); }
    }
    document.addEventListener('keydown', onDocKey);

    /* ── Arrastrar y soltar (Pointer Events) ── */
    root.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 || st.view !== 'tablero') return;
      var el = ev.target.closest && ev.target.closest('.aps-card[data-id]'); if (!el) return;
      if (ev.target.closest('input, select, textarea, a')) return;
      if (ev.pointerType === 'touch' && !ev.target.closest('.aps-grip')) return;       // en táctil solo desde el asa: la tarjeta sigue desplazándose
      startDrag(ev, el);
    });
    root.addEventListener('click', function (ev) { if (Date.now() - lastDrag < 80) { ev.stopPropagation(); ev.preventDefault(); } }, true);
    function startDrag(ev, el) {
      var task = taskById(el.getAttribute('data-id')), board = root.querySelector('.aps-board'), active = false, ghost, drop, tgt = null;
      var sx = ev.clientX, sy = ev.clientY, px = sx, py = sy, raf = 0, pid = ev.pointerId;
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      function begin() {
        active = true; var rect = el.getBoundingClientRect();
        ghost = el.cloneNode(true); ghost.classList.add('aps-ghost'); ghost.removeAttribute('data-id');
        ghost.style.width = rect.width + 'px'; ghost.style.left = rect.left + 'px'; ghost.style.top = rect.top + 'px';
        document.body.appendChild(ghost);
        el.classList.add('is-src');
        drop = h('li', { class: 'aps-drop', 'aria-hidden': 'true' });
        root.classList.add('is-dragging');
        raf = requestAnimationFrame(tick);
      }
      function place() {
        var cols = [].slice.call(root.querySelectorAll('.aps-col')), best = null, bd = 1e9;
        cols.forEach(function (c) { var r = c.getBoundingClientRect(), d = px < r.left ? r.left - px : px > r.right ? px - r.right : 0; if (d < bd) { bd = d; best = c; } });
        if (!best) return;
        var list = best.querySelector('.aps-list'), items = [].slice.call(list.children).filter(function (x) { return x !== el && x !== drop; }), idx = 0;
        var shift = drop.parentNode === list ? drop.offsetHeight + 8 : 0;      // el hueco empuja a las de debajo: se descuenta para que el cálculo no oscile
        items.forEach(function (x) {
          var r = x.getBoundingClientRect(), after = shift && (drop.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (py > r.top - (after ? shift : 0) + r.height / 2) idx++;
        });
        if (items[idx]) list.insertBefore(drop, items[idx]); else list.appendChild(drop);
        tgt = { status: list.getAttribute('data-status'), index: idx, beforeId: items[idx] ? items[idx].getAttribute('data-id') : null };
        root.querySelectorAll('.aps-col.is-target').forEach(function (c) { c.classList.remove('is-target'); });
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
        if (commit) place();
        if (ghost) ghost.remove(); if (drop) drop.remove();
        el.classList.remove('is-src'); root.classList.remove('is-dragging');
        root.querySelectorAll('.aps-col.is-target').forEach(function (c) { c.classList.remove('is-target'); });
        if (commit && tgt && task) move(task, tgt.status, tgt.index, 'drag', tgt.beforeId);
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
        if (st.view === 'archivo') loadArchived(); else paint();
      };
    }).catch(function (err) {
      if (err && err.auth) throw err;
      if (missing(err)) {
        return function paintSetup() {
          ctx.view.appendChild(h('section', { class: 'aps aps-setup', 'aria-label': 'Studio de proyectos' }, [
            h('p', { text: 'Las tablas del Studio aún no existen en Supabase. Ejecuta supabase/studio.sql en el SQL Editor (una vez, es idempotente) y recarga la página.' })
          ]));
        };
      }
      throw err;
    });
  }

  return { render: render, logic: logic };
})();
