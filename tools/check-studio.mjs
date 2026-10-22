/* ═══════════════════════════════════════════════
   tools/check-studio.mjs: prueba de la interfaz del Studio de proyectos
     npm i --no-save playwright axe-core && npx playwright install chromium
     node tools/check-studio.mjs
   Sirve el sitio en local y sustituye Supabase por un PostgREST en memoria (solo las tablas
   ps_*; el resto devuelve vacío). NO toca la base real. Recorre los flujos principales con
   Chromium: crear proyecto y tareas, arrastrar, reordenar, recargar, teclado, límites WIP, panel,
   pasos, consistencia entre vistas, archivar, eliminar, deshacer, error de guardado, móvil, axe
   y que «Hoy» (Centro de trabajo) siga funcionando.
   ═══════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const f = join(ROOT, p);
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const BASE = `http://localhost:${server.address().port}/area-privada.html`;

/* ── PostgREST en memoria ── */
let seq = 0;
const uid = () => '00000000-0000-4000-8000-' + String(++seq).padStart(12, '0');
const db = { ps_projects: [], ps_tasks: [], ps_settings: [], ps_activity: [] };
let failWrites = false;
const log = [];
function matches(row, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    if (v.startsWith('eq.') && String(row[k]) !== v.slice(3)) return false;
    if (v === 'is.null' && row[k] != null) return false;
    if (v === 'not.is.null' && row[k] == null) return false;
  }
  return true;
}
function act(project_id, task_id, kind, label, from_value, to_value) {
  db.ps_activity.push({ id: db.ps_activity.length + 1, project_id, task_id, kind, label, from_value: from_value || null, to_value: to_value || null, created_at: new Date().toISOString() });
}
function trigger(t, row, old) {          // lo que hacen los triggers de supabase/studio.sql
  const now = new Date().toISOString();
  if (t === 'ps_tasks') {
    if (row.parent_id) { const par = db.ps_tasks.find((x) => x.id === row.parent_id); if (!par || par.parent_id) throw new Error('Las subtareas solo tienen un nivel'); row.project_id = par.project_id; }
    if (!old) { row.completed_at = row.board_status === 'done' ? now : null; if (!row.parent_id) act(row.project_id, row.id, 'task_created', row.title, null, row.board_status); return; }
    if (row.board_status !== old.board_status) { row.completed_at = row.board_status === 'done' ? now : null; if (!row.parent_id) act(row.project_id, row.id, 'task_status', row.title, old.board_status, row.board_status); }
    if (row.archived_at !== old.archived_at && !row.parent_id) act(row.project_id, row.id, row.archived_at ? 'task_archived' : 'task_restored', row.title);
    row.updated_at = now;
  } else if (t === 'ps_projects') {
    if (!old) return act(row.id, null, 'project_created', row.title, null, row.stage);
    if (row.stage !== old.stage) act(row.id, null, 'project_stage', row.title, old.stage, row.stage);
    if (row.status !== old.status) act(row.id, null, 'project_status', row.title, old.status, row.status);
    row.updated_at = now;
  }
}
const DEFAULT_ROW = {
  ps_projects: { stage: 'capture', status: 'active', priority: 2, kind: null, goal: null, scope: null, next_action: null, target_date: null },
  ps_tasks: { board_status: 'inbox', position: 0, priority: 2, due_date: null, blocked: false, blocked_reason: null, next_step: null, notes: null, archived_at: null, completed_at: null, parent_id: null, project_id: null }
};
async function route(r) {
  const req = r.request(), url = new URL(req.url()), m = /\/rest\/v1\/(\w+)/.exec(url.pathname), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (/\/functions\/v1\//.test(url.pathname)) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ enabled: false, provider: 'off', remaining: 0 }) });
  if (!m) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' });
  const t = m[1], json = (status, body) => r.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (!(t in db)) return json(200, []);
  const method = req.method(), rows = db[t], params = [...url.searchParams.entries()];
  if (method === 'GET') return json(200, rows.filter((x) => matches(x, params)));
  log.push(method + ' ' + t);
  if (failWrites) return json(500, { message: 'Fallo simulado de guardado' });
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  try {
    if (method === 'POST') {
      const out = [].concat(body).map((b) => {
        const prior = t === 'ps_settings' ? rows.find((x) => x.key === b.key) : null;
        if (prior) { Object.assign(prior, b); return prior; }
        const row = Object.assign({ id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, DEFAULT_ROW[t] || {}, b);
        rows.push(row); trigger(t, row, null); return row;
      });
      return json(201, out);
    }
    const hit = rows.filter((x) => matches(x, params));
    if (method === 'PATCH') { hit.forEach((x) => { const old = { ...x }; Object.assign(x, body); trigger(t, x, old); }); return json(200, hit); }
    if (method === 'DELETE') {
      hit.forEach((x) => rows.splice(rows.indexOf(x), 1));
      if (t === 'ps_tasks') { const ids = new Set(hit.map((x) => x.id)); db.ps_tasks = db.ps_tasks.filter((x) => !ids.has(x.parent_id)); }
      if (t === 'ps_projects') { const ids = new Set(hit.map((x) => x.id)); db.ps_tasks = db.ps_tasks.filter((x) => !ids.has(x.project_id)); }
      return json(204, null);
    }
  } catch (e) { return json(400, { message: e.message }); }
  return json(400, {});
}

/* ── Utilidades de prueba ── */
const browser = await chromium.launch();
let failed = 0;
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['✔', name]); } catch (e) { failed++; results.push(['✖', name + ' → ' + e.message.split('\n')[0]]); }
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'distinto') + ': esperado ' + JSON.stringify(b) + ', recibido ' + JSON.stringify(a)); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };

async function open(viewport, hash) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 1000 }, bypassCSP: true, hasTouch: !!(viewport && viewport.width < 600), reducedMotion: 'reduce' });
  await ctx.route(/googletagmanager|google-analytics|fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await ctx.route(/supabase\.co/, route);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('bm_ap_session', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'borja.mora.mendez@gmail.com' })); localStorage.setItem('bm_cookie_consent', 'rejected'); } catch (e) { /* noop */ }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + (hash || '#/studio'));
  await page.waitForSelector(hash && hash === '#/' ? '.apk-head' : '.aps-head');
  return { ctx, page, errors };
}
const pagePtr = {};
async function bbox(sel) {
  for (let i = 0; i < 60; i++) {
    const el = await pagePtr.page.$(sel);
    const b = el && await el.boundingBox().catch(() => null);
    if (b) return b;
    await pagePtr.page.waitForTimeout(50);
  }
  throw new Error('sin caja para ' + sel);
}
const titles = (page, status) => page.$$eval(`.aps-col[data-status="${status}"] .aps-card .aps-card-open`, (els) => els.map((e) => e.textContent));
const view = async (page, name) => { await page.click(`.aps-seg-btn:has-text("${name}")`); await page.waitForTimeout(60); };
const cardSel = (t) => `.aps-card:has(.aps-card-open:text-is("${t}"))`;
async function capture(page, text) {
  await page.fill('#aps-cap', text);
  await page.keyboard.press('Enter');
  await page.waitForFunction((t) => [...document.querySelectorAll('.aps-card-open')].some((e) => e.textContent === t), text);
}
async function drag(page, fromSel, toX, toY) {
  const b = await bbox(fromSel);
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5 + 12, b.y + b.height / 2 + 12, { steps: 3 });
  await page.mouse.move(toX, toY, { steps: 12 });
  await page.waitForSelector('.aps-ghost');
  await page.mouse.up();
  await page.waitForTimeout(200);
}
const listPoint = async (status, yOff) => { const b = await bbox(`.aps-col[data-status="${status}"] .aps-list`); return [b.x + b.width / 2, b.y + (yOff == null ? 20 : yOff)]; };
const dbTask = (t) => db.ps_tasks.find((x) => x.title === t);
const shot = async (page, name) => { if (process.env.STUDIO_SHOTS) await page.screenshot({ path: join(process.env.STUDIO_SHOTS, name + '.png') }); };
const undoClick = async (page) => { await page.click('.aps-toast .aps-link:has-text("Deshacer")'); await page.waitForTimeout(250); };

const { page, ctx, errors } = await open();
pagePtr.page = page;

await step('Navegación: hay pestaña «Studio» y la ruta #/studio la activa', async () => {
  eq(await page.getAttribute('.ap-tabs a[data-tab="studio"]', 'aria-current'), 'page');
  ok(await page.isVisible('.aps-title'), 'sin cabecera');
});
await step('Vacío: Resumen invita a crear el primer proyecto', async () => {
  ok((await page.textContent('.aps-empty-state')).includes('Empieza por un proyecto'), 'sin estado vacío');
});
await step('1. Crear proyecto con solo el nombre; se abre su panel', async () => {
  await page.click('[data-role="new-project"]');
  await page.fill('#aps-n-title', 'App de retail');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('.aps-panel');
  eq(await page.inputValue('#aps-p-title'), 'App de retail');
  eq(db.ps_projects.length, 1);
  eq(db.ps_projects[0].stage, 'capture');
});
await step('1b. Editar el proyecto: fase, objetivo y siguiente acción llegan a la base y al Resumen', async () => {
  await page.selectOption('#aps-p-stage', 'build');
  await page.fill('#aps-p-goal', 'Publicar la app');
  await page.fill('#aps-p-next', 'Conectar los datos');
  await page.click('.aps-panel button[type="submit"]');
  await page.waitForTimeout(250);
  eq([db.ps_projects[0].stage, db.ps_projects[0].goal, db.ps_projects[0].next_action], ['build', 'Publicar la app', 'Conectar los datos']);
  await page.click('.aps-panel .aps-link:has-text("Cerrar")');
  const card = await page.textContent('.aps-project');
  ok(card.includes('App de retail') && card.includes('Fase: Construir') && card.includes('Siguiente: Conectar los datos'), 'tarjeta de proyecto: ' + card);
});
await step('2. Capturar tareas en la bandeja con el proyecto filtrado', async () => {
  await view(page, 'Tablero');
  await page.selectOption('.aps-filters .aps-select', { label: 'App de retail' });
  await capture(page, 'Cargar datos');
  await capture(page, 'Diseñar modelo');
  await capture(page, 'Escribir DAX');
  eq(await titles(page, 'inbox'), ['Cargar datos', 'Diseñar modelo', 'Escribir DAX']);
  ok(db.ps_tasks.every((t) => t.project_id === db.ps_projects[0].id), 'tareas sin proyecto');
});
await step('3. Arrastrar de Bandeja a Listo y persistir', async () => {
  const [x, y] = await listPoint('ready');
  await drag(page, cardSel('Cargar datos'), x, y);
  eq(await titles(page, 'ready'), ['Cargar datos']);
  eq(dbTask('Cargar datos').board_status, 'ready');
});
await step('3b. Reordenar dentro de la columna y persistir', async () => {
  const before = await titles(page, 'inbox');
  eq(before, ['Diseñar modelo', 'Escribir DAX']);
  const [x, y] = await listPoint('inbox', 5);
  await drag(page, cardSel('Escribir DAX'), x, y);
  eq(await titles(page, 'inbox'), ['Escribir DAX', 'Diseñar modelo']);
  ok(dbTask('Escribir DAX').position < dbTask('Diseñar modelo').position, 'posición no persistida');
});
await step('4. Recargar: estado y orden se conservan', async () => {
  await page.reload(); await page.waitForSelector('.aps-board');
  eq(await titles(page, 'inbox'), ['Escribir DAX', 'Diseñar modelo']);
  eq(await titles(page, 'ready'), ['Cargar datos']);
});
await step('5. Teclado: Mayús+→ cambia de columna y Mayús+↓ reordena', async () => {
  await page.focus(cardSel('Diseñar modelo') + ' .aps-card-open');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);
  eq(await titles(page, 'ready'), ['Cargar datos', 'Diseñar modelo']);
  ok(await page.evaluate(() => document.activeElement.textContent === 'Diseñar modelo'), 'el foco se pierde al mover');
  await page.keyboard.press('Shift+ArrowUp');
  await page.waitForTimeout(200);
  eq(await titles(page, 'ready'), ['Diseñar modelo', 'Cargar datos']);
  eq(dbTask('Diseñar modelo').board_status, 'ready');
});
await step('6. Límite WIP: avisa pero no impide mover', async () => {
  await page.click('.aps-link:has-text("Límites")');
  await page.fill('#aps-w-a', '1');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForTimeout(250);
  eq(db.ps_settings.find((s) => s.key === 'wip').value.in_progress, 1);
  const [x, y] = await listPoint('in_progress');
  await drag(page, cardSel('Cargar datos'), x, y);
  await drag(page, cardSel('Diseñar modelo'), ...(await listPoint('in_progress', 5)));
  eq((await titles(page, 'in_progress')).length, 2, 'ambas deberían haberse movido');
  ok((await page.textContent('.aps-col[data-status="in_progress"] .aps-wipwarn')).includes('Por encima del límite'), 'sin aviso de límite');
  ok((await page.textContent('.aps-col[data-status="in_progress"] .aps-count')).includes('2 / 1'), 'contador');
});
await step('7. Deshacer: botón y Ctrl+Z devuelven la tarjeta', async () => {
  await undoClick(page);
  eq((await titles(page, 'in_progress')).length, 1);
  eq(dbTask('Diseñar modelo').board_status, 'ready');
  await page.focus('#aps-cap'); await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  eq((await titles(page, 'in_progress')).length, 0);
  eq(dbTask('Cargar datos').board_status, 'ready');
});
await step('8. Panel de tarea: editar campos, bloqueo y estado', async () => {
  await page.click(cardSel('Escribir DAX') + ' .aps-card-open');
  await page.waitForSelector('.aps-panel');
  eq(await page.evaluate(() => document.activeElement.className), 'aps-panel-title', 'foco en el panel');
  await page.fill('#aps-t-title', 'Escribir medidas DAX');
  await page.selectOption('#aps-t-prio', '4');
  await page.fill('#aps-t-due', '2026-10-25');
  await page.check('.aps-check input');
  await page.fill('#aps-t-reason', 'Falta el modelo');
  await page.fill('#aps-t-next', 'Esperar al modelo');
  await page.selectOption('#aps-t-status', 'review');
  await page.click('.aps-panel button[type="submit"]');
  await page.waitForTimeout(300);
  const t = dbTask('Escribir medidas DAX');
  eq([t.priority, t.due_date, t.blocked, t.blocked_reason, t.next_step, t.board_status], [4, '2026-10-25', true, 'Falta el modelo', 'Esperar al modelo', 'review']);
  const card = await page.textContent('.aps-col[data-status="review"] .aps-card');
  ok(card.includes('Bloqueada') && card.includes('Urgente'), 'tarjeta: ' + card);
  await shot(page, 'tablero-panel');
});
await step('9. Pasos: añadir, marcar y quitar; el progreso se ve en la tarjeta', async () => {
  await page.fill('.aps-panel [data-role="sub-new"]', 'Medida ventas');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.aps-step-list li');
  await page.fill('.aps-panel [data-role="sub-new"]', 'Medida margen');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.aps-step-list li').length === 2);
  await page.check('.aps-step-list li:first-child input');
  await page.waitForTimeout(250);
  const subs = db.ps_tasks.filter((x) => x.parent_id);
  eq(subs.length, 2); eq(subs.map((s) => s.project_id === db.ps_projects[0].id), [true, true], 'el paso hereda el proyecto');
  ok((await page.textContent('.aps-col[data-status="review"] .aps-card')).includes('1/2 pasos'), 'progreso de pasos');
  await page.click('.aps-step-list li:last-child .aps-link');
  await page.waitForTimeout(250);
  eq(db.ps_tasks.filter((x) => x.parent_id).length, 1);
});
await step('10. Consistencia entre vistas: Resumen muestra progreso, bloqueo, siguiente y actividad', async () => {
  await page.click('.aps-panel .aps-link:has-text("Cerrar")');
  await page.evaluate(() => {});
  await view(page, 'Resumen');
  await page.waitForTimeout(700);        // la actividad se vuelve a pedir tras escribir
  ok((await page.textContent('.aps-project-count')).includes('0 de 3 tareas'), 'progreso: ' + await page.textContent('.aps-project-count'));
  ok((await page.textContent('[aria-labelledby="aps-h-blk"]')).includes('Falta el modelo'), 'bloqueado');
  const next = await page.$$eval('[aria-labelledby="aps-h-next"] .aps-row-title', (e) => e.map((x) => x.textContent));
  ok(!next.includes('Escribir medidas DAX'), 'una tarea bloqueada no es «siguiente»');
  ok(next.length >= 2, 'siguientes acciones');
  eq(await page.$$eval('[aria-labelledby="aps-h-next"] .aps-row-note', (e) => e.length), 0, 'texto suelto en las filas de siguientes acciones');
  ok((await page.textContent('[aria-labelledby="aps-h-act"]')).includes('Tarea creada'), 'actividad');
  await shot(page, 'resumen');
});
await step('11. Marcar hecha desde el tablero actualiza el progreso del proyecto', async () => {
  await view(page, 'Tablero');
  await drag(page, cardSel('Cargar datos'), ...(await listPoint('done')));
  ok(dbTask('Cargar datos').completed_at, 'completed_at lo pone el trigger');
  await view(page, 'Resumen');
  ok((await page.textContent('.aps-project-count')).includes('1 de 3 tareas'), 'progreso tras hecho');
});
await step('12. Duplicar y archivar tarea; recuperarla desde Archivo', async () => {
  await view(page, 'Tablero');
  await page.click(cardSel('Diseñar modelo') + ' .aps-card-open');
  await page.click('.aps-panel .aps-link:has-text("Duplicar")');
  await page.waitForFunction(() => [...document.querySelectorAll('.aps-card-open')].some((e) => e.textContent === 'Copia de Diseñar modelo'));
  await page.click('.aps-panel .aps-link:has-text("Archivar")');
  await page.waitForTimeout(300);
  ok(!(await titles(page, 'ready')).includes('Copia de Diseñar modelo'), 'sigue en el tablero');
  ok(dbTask('Copia de Diseñar modelo').archived_at, 'archived_at');
  await view(page, 'Archivo');
  await page.waitForSelector('[aria-labelledby="aps-h-at"] .aps-row');
  await page.click('[aria-labelledby="aps-h-at"] .aps-link:has-text("Recuperar")');
  await page.waitForTimeout(300);
  eq(dbTask('Copia de Diseñar modelo').archived_at, null);
});
await step('13. Eliminar con confirmación y deshacer lo recupera con sus pasos', async () => {
  await view(page, 'Tablero');
  await page.click(cardSel('Escribir medidas DAX') + ' .aps-card-open');
  await page.click('.aps-panel .aps-link:has-text("Eliminar")');
  await page.click('#ap-dialog button[type="submit"], dialog[open] button[type="submit"]');
  await page.waitForTimeout(300);
  ok(!dbTask('Escribir medidas DAX'), 'no se borró');
  eq(db.ps_tasks.filter((x) => x.parent_id).length, 0, 'sus pasos deberían haberse ido');
  await undoClick(page);
  ok(dbTask('Escribir medidas DAX'), 'no se recuperó');
  eq(db.ps_tasks.filter((x) => x.parent_id).length, 1, 'el paso no volvió');
  eq((await titles(page, 'review')), ['Escribir medidas DAX']);
});
await step('14. Proyecto en pausa: sus tareas salen del tablero y aparecen en Archivo; reactivar las devuelve', async () => {
  await page.click('.aps-panel .aps-link:has-text("Cerrar")').catch(() => {});
  await view(page, 'Resumen');
  await page.click('.aps-project-title');
  await page.selectOption('#aps-p-status', 'paused');
  await page.click('.aps-panel button[type="submit"]');
  await page.waitForTimeout(300);
  await view(page, 'Tablero');
  await page.selectOption('.aps-filters .aps-select', '');
  eq((await page.$$('.aps-card')).length, 0, 'tareas de un proyecto en pausa en el tablero');
  await view(page, 'Archivo');
  ok((await page.textContent('[aria-labelledby="aps-h-ap"]')).includes('App de retail'), 'no está en Archivo');
  await page.click('[aria-labelledby="aps-h-ap"] .aps-link:has-text("Reactivar")');
  await page.waitForTimeout(300);
  await view(page, 'Tablero');
  ok((await page.$$('.aps-card')).length >= 3, 'las tareas no volvieron');
});
await step('15. Error de guardado: se avisa y se revierte lo mostrado', async () => {
  const [x, y] = await listPoint('inbox');
  const was = await titles(page, 'ready');
  failWrites = true;
  await drag(page, cardSel(was[0]), x, y);
  await page.waitForSelector('.aps-toast.is-error');
  failWrites = false;
  await page.waitForTimeout(300);
  eq(await titles(page, 'ready'), was, 'debía volver a su sitio');
});
await step('16. Eliminar un proyecto pide confirmación y borra sus tareas', async () => {
  await page.click(cardSel((await titles(page, 'ready'))[0]) + ' .aps-card-open');
  await view(page, 'Resumen');
  await page.click('.aps-project-title');
  await page.click('.aps-panel .aps-link:has-text("Eliminar proyecto")');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForTimeout(300);
  eq(db.ps_projects.length, 0); eq(db.ps_tasks.length, 0, 'cascade');
  ok((await page.textContent('.aps-empty-state')).includes('Empieza por un proyecto'), 'estado vacío');
});
await step('17. Accesibilidad (axe): sin fallos serios en Resumen, Tablero y panel', async () => {
  await page.click('[data-role="new-project"]');
  await page.fill('#aps-n-title', 'Proyecto axe');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('.aps-panel');
  await page.click('.aps-panel .aps-link:has-text("Cerrar")');
  await view(page, 'Tablero');
  await capture(page, 'Tarea axe');
  await page.click(cardSel('Tarea axe') + ' .aps-card-open');
  await page.addScriptTag({ content: AXE });
  for (const v of ['Tablero', 'Resumen', 'Archivo']) {
    await view(page, v);
    const bad = await page.evaluate(async () => (await axe.run('.aps', { resultTypes: ['violations'] })).violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => x.id + ' (' + x.nodes.length + ')'));
    eq(bad, [], 'axe en ' + v);
  }
});
await step('18. Sin errores de consola en toda la sesión', async () => { eq(errors, []); });
await ctx.close();

await step('19. Móvil: sin desbordamiento horizontal y el panel cabe en pantalla', async () => {
  const m = await open({ width: 390, height: 800 });
  pagePtr.page = m.page;
  await view(m.page, 'Tablero');
  const ov = await m.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(ov <= 1, 'desborda ' + ov + ' px');
  await m.page.click('.aps-card-open');
  await m.page.waitForSelector('.aps-panel');
  const b = await bbox('.aps-panel');
  ok(b.x >= 0 && b.x + b.width <= 391, 'panel fuera de pantalla: ' + JSON.stringify(b));
  eq(m.errors, []);
  await m.ctx.close();
});
await step('20. Hoy sigue funcionando (Centro de trabajo intacto)', async () => {
  const h = await open(null, '#/');
  ok(await h.page.isVisible('.apk-title'), 'el Centro de trabajo no se monta');
  eq(await h.page.getAttribute('.ap-tabs a[data-tab="hoy"]', 'aria-current'), 'page');
  eq(h.errors, []);
  await h.ctx.close();
});

await browser.close();
server.close();
for (const [mark, name] of results) console.log(mark + ' ' + name);
console.log(`\n${results.length - failed} de ${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);
