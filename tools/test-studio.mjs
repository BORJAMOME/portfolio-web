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
const sandbox = { window: {}, Intl };
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
