/* ═══════════════════════════════════════════════
   tools/test-studio.mjs: pruebas de la lógica pura del Studio de proyectos
     node tools/test-studio.mjs
   Sin dependencias: carga area-privada-studio.js en un contexto aislado y prueba `logic`
   (orden, límites WIP, tablero visible, progreso, filtros, siguientes acciones, actividad).
   La interfaz se prueba aparte con tools/check-studio.mjs.
   ═══════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import legacy from 'node:assert';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const eq = legacy.deepEqual;     // el código se evalúa en otro contexto de vm: los prototipos difieren
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'area-privada-studio.js'), 'utf8');
const sandbox = { window: {}, Intl, URL };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const L = sandbox.window.APStudio.logic;

const task = (o) => Object.assign({ id: Math.random().toString(36).slice(2), title: 'T', board_status: 'inbox', position: 1024, priority: 2, blocked: false, parent_id: null, project_id: null, archived_at: null, created_at: '2026-10-01' }, o);
const proj = (o) => Object.assign({ id: Math.random().toString(36).slice(2), title: 'P', status: 'active', stage: 'capture', priority: 2 }, o);
const NOW = new Date(2026, 9, 22, 10, 0, 0);

test('insertPosition: columna vacía, extremos y punto medio', () => {
  assert.equal(L.insertPosition([], 0), 1024);
  const col = [task({ position: 1024 }), task({ position: 2048 })];
  assert.equal(L.insertPosition(col, 0), 0);
  assert.equal(L.insertPosition(col, 1), 1536);
  assert.equal(L.insertPosition(col, 2), 3072);
});

test('needsRenumber: solo cuando el hueco se agota', () => {
  assert.equal(L.needsRenumber([task({ position: 1 }), task({ position: 1 + 1e-9 })], 1), true);
  assert.equal(L.needsRenumber([task({ position: 1 }), task({ position: 2 })], 1), false);
  assert.equal(L.needsRenumber([task({ position: 1 })], 1), false);
});

test('column: ordena por posición y desempata por fecha de creación', () => {
  const a = task({ id: 'a', position: 2 }), b = task({ id: 'b', position: 1 }), c = task({ id: 'c', position: 1, created_at: '2026-10-02' });
  eq(L.column([a, c, b, task({ board_status: 'ready' })], 'inbox').map((t) => t.id), ['b', 'c', 'a']);
});

test('boardTasks: oculta subtareas, archivadas y tareas de proyectos que no están activos', () => {
  const on = proj({ id: 'on' }), off = proj({ id: 'off', status: 'paused' });
  const visible = task({ id: 'v', project_id: 'on' }), loose = task({ id: 'l' });
  const all = [visible, loose, task({ id: 's', parent_id: 'v' }), task({ id: 'a', archived_at: '2026-10-01' }), task({ id: 'o', project_id: 'off' })];
  eq(L.boardTasks(all, [on, off]).map((t) => t.id), ['v', 'l']);
});

test('wipState: sin límite, en el límite y por encima', () => {
  eq(L.wipState(5, 0), { limit: 0, over: false, at: false });
  eq(L.wipState(3, 3), { limit: 3, over: false, at: true });
  eq(L.wipState(4, 3), { limit: 3, over: true, at: false });
});

test('filterTasks: texto sin tildes, proyecto, sin proyecto, bloqueadas y búsqueda en pasos', () => {
  const a = task({ id: 'a', title: 'Revisión del modelo', project_id: 'p1' }), b = task({ id: 'b', title: 'Otra', blocked: true }), c = task({ id: 'c', title: 'Sin pistas' });
  const subs = { c: [task({ title: 'Dibujar el MODELO', parent_id: 'c' })] };
  eq(L.filterTasks([a, b, c], { q: 'revision', project: '', blocked: false }, subs).map((t) => t.id), ['a']);
  eq(L.filterTasks([a, b, c], { q: 'modelo', project: '', blocked: false }, subs).map((t) => t.id), ['a', 'c']);
  eq(L.filterTasks([a, b, c], { q: '', project: 'p1', blocked: false }, subs).map((t) => t.id), ['a']);
  eq(L.filterTasks([a, b, c], { q: '', project: 'none', blocked: false }, subs).map((t) => t.id), ['b', 'c']);
  eq(L.filterTasks([a, b, c], { q: '', project: '', blocked: true }, subs).map((t) => t.id), ['b']);
});

test('progress: cuenta solo tareas de primer nivel, no archivadas, del proyecto', () => {
  const all = [task({ project_id: 'p', board_status: 'done' }), task({ project_id: 'p' }), task({ project_id: 'p', parent_id: 'x', board_status: 'done' }),
    task({ project_id: 'p', archived_at: '2026-10-01' }), task({ project_id: 'q', board_status: 'done' })];
  eq(L.progress(all, 'p'), { done: 1, total: 2, pct: 50 });
  eq(L.progress(all, 'vacío'), { done: 0, total: 0, pct: 0 });
});

test('subProgress y subsOf agrupan los pasos por tarea', () => {
  const s1 = task({ id: 's1', parent_id: 'a', position: 2, board_status: 'done' }), s2 = task({ id: 's2', parent_id: 'a', position: 1 });
  const map = L.subsOf([task({ id: 'a' }), s1, s2]);
  eq(map.a.map((s) => s.id), ['s2', 's1']);
  eq(L.subProgress(map.a), { done: 1, total: 2 });
  eq(L.subProgress(undefined), { done: 0, total: 0 });
});

test('nextActions: lo empezado primero, luego revisión y listo; sin bloqueadas ni hechas', () => {
  const t = [
    task({ id: 'inbox', board_status: 'inbox' }), task({ id: 'ready', board_status: 'ready' }),
    task({ id: 'rev', board_status: 'review' }), task({ id: 'curso', board_status: 'in_progress' }),
    task({ id: 'curso-alta', board_status: 'in_progress', priority: 4 }), task({ id: 'blk', board_status: 'in_progress', blocked: true }),
    task({ id: 'ok', board_status: 'done' }), task({ id: 'ready-fecha', board_status: 'ready', due_date: '2026-10-23' })
  ];
  eq(L.nextActions(t).map((x) => x.id), ['curso-alta', 'curso', 'rev', 'ready-fecha', 'ready', 'inbox']);
});

test('dueLabel: vencida, hoy, mañana y lejana', () => {
  assert.equal(L.dueLabel('2026-10-20', NOW).tone, 'late');
  assert.equal(L.dueLabel('2026-10-21', NOW).text, 'Venció ayer');
  assert.equal(L.dueLabel('2026-10-22', NOW).text, 'Vence hoy');
  assert.equal(L.dueLabel('2026-10-23', NOW).text, 'Vence mañana');
  assert.equal(L.dueLabel('2026-12-01', NOW).tone, 'far');
});

test('activityText: redacta cada tipo con las etiquetas en español', () => {
  assert.equal(L.activityText({ kind: 'task_status', label: 'Informe', from_value: 'ready', to_value: 'in_progress' }), '«Informe»: Listo → En curso');
  assert.equal(L.activityText({ kind: 'project_stage', label: 'App', from_value: 'plan', to_value: 'build' }), '«App», fase: Planificar → Construir');
  assert.equal(L.activityText({ kind: 'project_status', label: 'App', from_value: 'active', to_value: 'paused' }), '«App»: Activo → En pausa');
  assert.equal(L.activityText({ kind: 'task_created', label: 'X' }), 'Tarea creada: «X»');
  assert.equal(L.activityText({ kind: 'otra', label: null }), '«sin título»');
});

test('Los estados y fases coinciden con los del esquema SQL', () => {
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'studio.sql'), 'utf8');
  const listIn = (col) => new RegExp(col + '[^\\n]*check \\(' + col + ' in \\(([^)]*)\\)').exec(sql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  eq(L.STATUSES.map((s) => s.id), listIn('board_status'));
  eq(L.STAGES.map((s) => s.id), listIn('stage'));
});

/* ── Hito 2: ideas, notas y entregables ── */
const idea = (o) => Object.assign({ id: Math.random().toString(36).slice(2), title: 'I', body: null, topic: null, status: 'new', kind: null, project_id: null, created_at: '2026-10-01' }, o);

test('safeUrl: solo http y https; lo demás no se convierte en enlace', () => {
  assert.equal(L.safeUrl('https://github.com/BORJAMOME/x'), 'https://github.com/BORJAMOME/x');
  assert.equal(L.safeUrl('http://localhost:8000/a'), 'http://localhost:8000/a');
  for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://x.es', 'github.com/x', '', null, undefined, 'vbscript:x']) assert.equal(L.safeUrl(bad), null, String(bad));
});

test('filterIdeas: por defecto solo nuevas y explorando, más recientes primero', () => {
  const a = idea({ id: 'a', created_at: '2026-10-01' }), b = idea({ id: 'b', status: 'exploring', created_at: '2026-10-03' }),
    c = idea({ id: 'c', status: 'converted' }), d = idea({ id: 'd', status: 'discarded' });
  eq(L.filterIdeas([a, b, c, d], { q: '' }).map((x) => x.id), ['b', 'a']);
  eq(L.filterIdeas([a, b, c, d], { q: '', show: 'todas' }).length, 4);
  eq(L.filterIdeas([a, b, c, d], { q: '', show: 'discarded' }).map((x) => x.id), ['d']);
});

test('filterIdeas: busca sin tildes en título, descripción y grupo', () => {
  const a = idea({ id: 'a', title: 'Análisis de ventas' }), b = idea({ id: 'b', body: 'Usar SARIMA' }), c = idea({ id: 'c', topic: 'Previsión' });
  eq(L.filterIdeas([a, b, c], { q: 'analisis' }).map((x) => x.id), ['a']);
  eq(L.filterIdeas([a, b, c], { q: 'sarima' }).map((x) => x.id), ['b']);
  eq(L.filterIdeas([a, b, c], { q: 'prevision' }).map((x) => x.id), ['c']);
});

test('groupIdeas: grupos por orden alfabético y «sin grupo» al final', () => {
  const g = L.groupIdeas([idea({ id: '1' }), idea({ id: '2', topic: 'Zeta' }), idea({ id: '3', topic: 'álgebra' }), idea({ id: '4', topic: 'Zeta' })]);
  eq(g.map((x) => x.topic), ['álgebra', 'Zeta', '']);
  eq(g[1].ideas.map((x) => x.id), ['2', '4']);
});

test('activityText: ideas', () => {
  assert.equal(L.activityText({ kind: 'idea_created', label: 'Mapa' }), 'Idea capturada: «Mapa»');
  assert.equal(L.activityText({ kind: 'idea_converted', label: 'Mapa' }), 'Idea convertida en proyecto: «Mapa»');
});

test('Los valores de ideas, notas y entregables coinciden con studio-ideas.sql', () => {
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'studio-ideas.sql'), 'utf8');
  const listIn = (table, col) => {
    const from = sql.indexOf('create table if not exists public.' + table), block = sql.slice(from, sql.indexOf(');', from));
    return new RegExp(col + '[^\\n]*check \\(' + col + ' in \\(([^)]*)\\)').exec(block)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  };
  eq(L.IDEA_STATUSES.map((s) => s[0]), listIn('ps_ideas', 'status'));
  eq(L.KINDS.map((s) => s[0]), listIn('ps_ideas', 'kind'));
  eq(L.NOTE_KINDS.map((s) => s[0]), listIn('ps_notes', 'kind'));
  eq(L.DELIV_KINDS.map((s) => s[0]), listIn('ps_deliverables', 'kind'));
  eq(L.DSTATUS.map((s) => s[0]), listIn('ps_deliverables', 'status'));
  // los tipos de proyecto del hito 1 siguen siendo los mismos
  const base = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'studio.sql'), 'utf8');
  eq(L.KINDS.map((s) => s[0]), /kind[^\n]*check \(kind in \(([^)]*)\)/.exec(base)[1].split(',').map((s) => s.trim().replace(/'/g, '')));
});

/* ── Hito 3: hoja de ruta y relaciones ── */
const link = (rel, from, to, kind = 'milestone') => ({ id: rel + from + to, rel, from_id: from, to_id: to, kind });

test('fmtDay: sin año en el año actual y con año en otro', () => {
  assert.equal(L.fmtDay('2026-11-05', NOW), '5 nov');
  assert.equal(L.fmtDay('2027-01-15', NOW), '15 ene 2027');
});

test('timelineRange: abarca de principio del primer mes a fin del último, incluye hoy y mide al menos tres meses', () => {
  const r = L.timelineRange(['2026-11-10', '2027-01-20', null], NOW);
  eq([r.start.getFullYear(), r.start.getMonth(), r.start.getDate()], [2026, 9, 1]);        // hoy (22-oct) manda: octubre
  eq(r.months.map((m) => m.key), ['2026-10', '2026-11', '2026-12', '2027-01']);
  assert.ok(Math.abs(r.months.reduce((s, m) => s + m.width, 0) - 100) < 1e-9, 'los meses suman 100 %');
  assert.ok(Math.abs(r.months[1].left - r.months[0].width) < 1e-9, 'los meses son contiguos');
  eq(L.timelineRange([], NOW).months.length, 3, 'mínimo tres meses sin fechas');
  assert.ok(r.months[0].label.includes('2026') && !r.months[1].label.includes('2026') && r.months[3].label.includes('2027'), 'año solo al principio y en enero');
});

test('pctOf: proporcional al rango y acotado a 0-100', () => {
  const r = L.timelineRange(['2026-10-01', '2026-12-31'], NOW);
  assert.equal(L.pctOf('2026-10-01', r), 0);
  assert.ok(L.pctOf('2026-11-16', r) > 40 && L.pctOf('2026-11-16', r) < 60);
  assert.equal(L.pctOf('2020-01-01', r), 0);
  assert.equal(L.pctOf('2030-01-01', r), 100);
});

test('relationsOf: dirección y etiqueta de dependencias y relaciones', () => {
  const links = [link('depends_on', 'a', 'b'), link('depends_on', 'c', 'a'), link('relates_to', 'a', 'd'), link('relates_to', 'e', 'a'), link('depends_on', 'x', 'y')];
  eq(L.relationsOf(links, 'a').map((r) => [r.label, r.otherId, r.dir]), [['Depende de', 'b', 'out'], ['Lo necesita', 'c', 'in'], ['Se relaciona con', 'd', 'out'], ['Se relaciona con', 'e', 'in']]);
  eq(L.relationsOf(links, 'z'), []);
});

test('wouldCycle: autoenlace, ciclo directo e indirecto; las relaciones simples no cuentan', () => {
  const links = [link('depends_on', 'b', 'a'), link('depends_on', 'c', 'b'), link('relates_to', 'a', 'z')];
  assert.equal(L.wouldCycle(links, 'a', 'a'), true);
  assert.equal(L.wouldCycle(links, 'a', 'b'), true, 'b ya depende de a');
  assert.equal(L.wouldCycle(links, 'a', 'c'), true, 'c depende de b que depende de a');
  assert.equal(L.wouldCycle(links, 'c', 'a'), false, 'c→a es coherente con c→b→a');
  assert.equal(L.wouldCycle(links, 'z', 'a'), false, 'relates_to no genera ciclos');
  assert.equal(L.wouldCycle([], 'a', 'b'), false);
});

test('linkExists: depends_on tiene sentido, relates_to es simétrico', () => {
  const links = [link('depends_on', 'a', 'b'), link('relates_to', 'c', 'd')];
  assert.equal(L.linkExists(links, 'depends_on', 'a', 'b'), true);
  assert.equal(L.linkExists(links, 'depends_on', 'b', 'a'), false);
  assert.equal(L.linkExists(links, 'relates_to', 'd', 'c'), true);
  assert.equal(L.linkExists(links, 'relates_to', 'a', 'b'), false, 'una dependencia no es una relación');
});

test('dependencyIssues: avisa si lo que se necesita está previsto después; ignora fechas que faltan', () => {
  const dates = { a: '2026-11-01', b: '2026-12-01', c: '2026-10-15', d: null };
  const links = [link('depends_on', 'a', 'b'), link('depends_on', 'a', 'c'), link('depends_on', 'a', 'd'), link('relates_to', 'a', 'b')];
  const is = L.dependencyIssues(links, (id) => dates[id]);
  eq(is.map((i) => [i.from, i.to, i.days]), [['a', 'b', 30]]);
});

test('sortMilestones: por fecha, los que no tienen fecha al final y empate por título', () => {
  const ms = [{ title: 'Z', target_date: null }, { title: 'B', target_date: '2026-11-02' }, { title: 'A', target_date: '2026-11-02' }, { title: 'C', target_date: '2026-10-30' }];
  eq(L.sortMilestones(ms).map((m) => m.title), ['C', 'A', 'B', 'Z']);
});

test('Los valores de hitos y relaciones coinciden con studio-roadmap.sql', () => {
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'studio-roadmap.sql'), 'utf8');
  const block = (t) => { const f = sql.indexOf('create table if not exists public.' + t); return sql.slice(f, sql.indexOf(');', f)); };
  const list = (b, col) => new RegExp(col + '[^\\n]*check \\(' + col + ' in \\(([^)]*)\\)').exec(b)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  eq(L.MS_STATUS.map((s) => s[0]), list(block('ps_milestones'), 'status'));
  eq(L.REL.map((s) => s[0]), list(block('ps_links'), 'rel'));
  eq(Object.keys(L.REL_KINDS), list(block('ps_links'), 'kind'));
  // las ideas no tienen dependencias (lo exige el check de la base)
  assert.ok(!L.REL_KINDS.idea.includes('depends_on') && /rel <> 'depends_on' or kind in \('project', 'milestone'\)/.test(sql));
});
