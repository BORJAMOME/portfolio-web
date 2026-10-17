/* ═══════════════════════════════════════════════
   tools/test-kanban.mjs: pruebas de la lógica pura del Centro de trabajo
     node tools/test-kanban.mjs
   Sin dependencias: carga area-privada-kanban.js en un contexto aislado y prueba `logic`
   (orden de tarjetas, límites WIP, filtros, sugerencias). La interfaz se prueba aparte
   con tools/check-kanban.mjs.
   ═══════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import legacy from 'node:assert';
// el código se evalúa en otro contexto de vm: los prototipos difieren, así que se compara estructura (deepEqual no estricto)
const eq = legacy.deepEqual;
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'area-privada-kanban.js'), 'utf8');
const sandbox = { window: {}, Intl };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const L = sandbox.window.APKanban.logic;

const card = (o) => Object.assign({ id: Math.random().toString(36).slice(2), titulo: 'T', estado: 'pendiente', posicion: 1024, prioridad: 2, bloqueada: false, archivada_en: null, created_at: '2026-10-01', etiquetas: [] }, o);
const NOW = new Date(2026, 9, 17, 10, 0, 0);      // 17-oct-2026 (local)

test('insertPosition: columna vacía, extremos y punto medio', () => {
  assert.equal(L.insertPosition([], 0), 1024);
  const col = [card({ posicion: 1024 }), card({ posicion: 2048 })];
  assert.equal(L.insertPosition(col, 0), 0);
  assert.equal(L.insertPosition(col, 2), 3072);
  assert.equal(L.insertPosition(col, 1), 1536);
});

test('needsRenumber: solo cuando el hueco es casi cero', () => {
  assert.equal(L.needsRenumber([card({ posicion: 1 }), card({ posicion: 2 })], 1), false);
  assert.equal(L.needsRenumber([card({ posicion: 1 }), card({ posicion: 1 + 1e-9 })], 1), true);
  assert.equal(L.needsRenumber([card({ posicion: 1 })], 1), false);
});

test('column: filtra por estado, excluye archivadas y ordena por posición', () => {
  const a = card({ posicion: 3 }), b = card({ posicion: 1 }), c = card({ posicion: 2, archivada_en: 'x' }), d = card({ estado: 'hecho' });
  eq(L.column([a, b, c, d], 'pendiente'), [b, a]);
});

test('wipState: sin límite, en el límite y por encima', () => {
  eq({ ...L.wipState(5, 0) }, { limit: 0, over: false, at: false });
  assert.equal(L.wipState(3, 3).at, true);
  assert.equal(L.wipState(3, 3).over, false);
  assert.equal(L.wipState(4, 3).over, true);
});

test('dueLabel: vencida, hoy, mañana y lejana', () => {
  assert.equal(L.dueLabel('2026-10-15', NOW).tone, 'late');
  assert.equal(L.dueLabel('2026-10-16', NOW).text, 'Venció ayer');
  assert.equal(L.dueLabel('2026-10-17', NOW).text, 'Vence hoy');
  assert.equal(L.dueLabel('2026-10-18', NOW).text, 'Vence mañana');
  assert.equal(L.dueLabel('2026-11-30', NOW).tone, 'far');
});

test('filterCards: texto sin acentos, proyecto, prioridad, bloqueadas y pasos', () => {
  const a = card({ titulo: 'Diseñar API', proyecto_id: 'p1', prioridad: 3 });
  const b = card({ titulo: 'Reunión', notas: 'Revisar presupuesto', bloqueada: true });
  const c = card({ titulo: 'Otra', etiquetas: ['Estadística'] });
  const all = [a, b, c];
  eq(L.filterCards(all, { q: 'disenar' }), [a]);
  eq(L.filterCards(all, { q: 'PRESUPUESTO' }), [b]);
  eq(L.filterCards(all, { q: 'estadistica' }), [c]);
  eq(L.filterCards(all, { proyecto: 'p1' }), [a]);
  eq(L.filterCards(all, { proyecto: 'none' }), [b, c]);
  eq(L.filterCards(all, { prioridad: 3 }), [a]);
  eq(L.filterCards(all, { bloqueadas: true }), [b]);
  eq(L.filterCards(all, { q: 'xyz' }, { [c.id]: [{ titulo: 'hacer xyz' }] }), [c]);
});

test('suggest: excluye bloqueadas, hechas, ideas, archivadas y las ya elegidas para hoy', () => {
  const ok = card({ prioridad: 3 });
  const out = [card({ bloqueada: true }), card({ estado: 'hecho' }), card({ estado: 'ideas' }), card({ archivada_en: 'x' }), card({ hoy_fecha: '2026-10-17' })];
  const r = L.suggest([ok].concat(out), NOW, { wipEnCurso: 3 });
  assert.equal(r.length, 1);
  assert.equal(r[0].card, ok);
  eq(r[0].why, ['Prioridad alta']);
});

test('suggest: ordena por prioridad, vencimiento y estado, y explica cada factor', () => {
  const normal = card({ titulo: 'normal' });
  const urgente = card({ titulo: 'urgente', prioridad: 4 });
  const vencida = card({ titulo: 'vencida', fecha_limite: '2026-10-10' });
  const empezada = card({ titulo: 'empezada', estado: 'en_curso' });
  const r = L.suggest([normal, urgente, vencida, empezada], NOW, { wipEnCurso: 3 });
  eq(r.map((x) => x.card.titulo), ['vencida', 'urgente', 'empezada', 'normal']);
  assert.ok(r[0].why.some((w) => w.indexOf('vencida') === 0));
  assert.ok(r[2].why.includes('ya empezada'));
});

test('suggest: penaliza empezar algo nuevo si el límite en curso está lleno', () => {
  const nuevo = card({ titulo: 'nuevo' });
  const cur = [1, 2, 3].map(() => card({ estado: 'en_curso', hoy_fecha: '2026-10-17' }));
  const r = L.suggest([nuevo].concat(cur), NOW, { wipEnCurso: 3 });
  assert.equal(r.length, 1);
  assert.ok(r[0].why.some((w) => w.indexOf('ya tienes 3 en curso') === 0));
  assert.equal(r[0].score, 0);
});

test('parseTags: recorta, deduplica sin distinguir mayúsculas y limita a 8', () => {
  eq(L.parseTags(' Power BI , sql,SQL, , python '), ['Power BI', 'sql', 'python']);
  assert.equal(L.parseTags('a,b,c,d,e,f,g,h,i,j').length, 8);
});

test('subProgress: cuenta hechas y total', () => {
  eq({ ...L.subProgress([{ hecho: true }, { hecho: false }, { hecho: true }]) }, { done: 2, total: 3 });
  eq({ ...L.subProgress(undefined) }, { done: 0, total: 0 });
});
