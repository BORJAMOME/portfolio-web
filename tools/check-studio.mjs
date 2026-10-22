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
const db = { ps_projects: [], ps_tasks: [], ps_settings: [], ps_activity: [], ps_ideas: [], ps_notes: [], ps_deliverables: [], ps_milestones: [], ps_links: [] };
let failWrites = false, extMissing = false, roadMissing = false;      // extMissing / roadMissing: aún no se han ejecutado studio-ideas.sql / studio-roadmap.sql
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
  } else if (t === 'ps_milestones') {
    if (!old) { if (row.status === 'done') row.done_at = now; return; }
    if (row.status !== old.status) row.done_at = row.status === 'done' ? now : null;
    row.updated_at = now;
  } else if (t === 'ps_links') {            // ps_links_before + índices únicos + checks de studio-roadmap.sql
    const tables = { project: db.ps_projects, milestone: db.ps_milestones, idea: db.ps_ideas };
    if (!tables[row.kind] || !tables[row.kind].some((x) => x.id === row.from_id) || !tables[row.kind].some((x) => x.id === row.to_id)) throw new Error('Uno de los elementos enlazados no existe');
    if (row.rel === 'depends_on') {
      const seen = new Set(), stack = [row.to_id];
      while (stack.length) { const c = stack.pop(); if (c === row.from_id) throw new Error('La dependencia crearía un ciclo'); if (seen.has(c)) continue; seen.add(c); db.ps_links.forEach((l) => { if (l.rel === 'depends_on' && l.from_id === c) stack.push(l.to_id); }); }
      if (row.kind === 'idea') throw new Error('violates check constraint');
    }
    if (db.ps_links.some((l) => l.rel === row.rel && ((l.from_id === row.from_id && l.to_id === row.to_id) || (row.rel === 'relates_to' && l.from_id === row.to_id && l.to_id === row.from_id)))) throw new Error('duplicate key value violates unique constraint');
  } else if (t === 'ps_ideas') {
    if (!old) return act(row.project_id, null, 'idea_created', row.title);
    if (row.status === 'converted' && old.status !== 'converted') act(row.project_id, null, 'idea_converted', row.title);
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
  ps_ideas: { body: null, kind: null, topic: null, status: 'new', project_id: null },
  ps_notes: { kind: 'note', body: null, url: null },
  ps_deliverables: { kind: 'other', url: null, status: 'planned' },
  ps_milestones: { target_date: null, status: 'pending', done_at: null },
  ps_links: {},
  ps_tasks: { board_status: 'inbox', position: 0, priority: 2, due_date: null, blocked: false, blocked_reason: null, next_step: null, notes: null, archived_at: null, completed_at: null, parent_id: null, project_id: null }
};
async function route(r) {
  const req = r.request(), url = new URL(req.url()), m = /\/rest\/v1\/(\w+)/.exec(url.pathname), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (/\/functions\/v1\//.test(url.pathname)) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ enabled: false, provider: 'off', remaining: 0 }) });
  if (!m) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' });
  const t = m[1], json = (status, body) => r.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (t === 'rpc' && /ps_convert_idea/.test(url.pathname)) {      // lo que hace ps_convert_idea en studio-ideas.sql, en una sola operación
    if (failWrites) return json(500, { message: 'Fallo simulado de guardado' });
    log.push('RPC ps_convert_idea');
    const i = db.ps_ideas.find((x) => x.id === JSON.parse(req.postData()).p_idea);
    if (!i) return json(400, { message: 'La idea no existe' });
    if (i.status === 'converted') return json(400, { message: 'La idea ya se convirtió en proyecto' });
    const p = Object.assign({ id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, DEFAULT_ROW.ps_projects, { title: i.title.slice(0, 160), kind: i.kind, goal: i.body ? i.body.slice(0, 1000) : null });
    db.ps_projects.push(p); trigger('ps_projects', p, null);
    i.status = 'converted'; i.project_id = p.id; act(p.id, null, 'idea_converted', i.title);
    return json(200, p);
  }
  if (extMissing && ['ps_ideas', 'ps_notes', 'ps_deliverables'].includes(t)) return json(404, { code: 'PGRST205', message: 'Could not find the table' });
  if (roadMissing && ['ps_milestones', 'ps_links'].includes(t)) return json(404, { code: 'PGRST205', message: 'Could not find the table' });
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
        trigger(t, row, null); rows.push(row); return row;       // como un trigger BEFORE: si rechaza, la fila no se guarda
      });
      return json(201, out);
    }
    const hit = rows.filter((x) => matches(x, params));
    if (method === 'PATCH') { hit.forEach((x) => { const old = { ...x }; Object.assign(x, body); trigger(t, x, old); }); return json(200, hit); }
    if (method === 'DELETE') {
      hit.forEach((x) => rows.splice(rows.indexOf(x), 1));
      if (t === 'ps_tasks') { const ids = new Set(hit.map((x) => x.id)); db.ps_tasks = db.ps_tasks.filter((x) => !ids.has(x.parent_id)); }
      if (t === 'ps_projects') {
        const ids = new Set(hit.map((x) => x.id));
        db.ps_tasks = db.ps_tasks.filter((x) => !ids.has(x.project_id));
        db.ps_notes = db.ps_notes.filter((x) => !ids.has(x.project_id)); db.ps_deliverables = db.ps_deliverables.filter((x) => !ids.has(x.project_id));
        db.ps_ideas.forEach((x) => { if (ids.has(x.project_id)) x.project_id = null; });       // on delete set null
        db.ps_milestones.filter((x) => ids.has(x.project_id)).forEach((x) => ids.add(x.id));  // hitos en cascada: sus enlaces también se limpian
        db.ps_milestones = db.ps_milestones.filter((x) => !ids.has(x.project_id));
        db.ps_links = db.ps_links.filter((l) => !ids.has(l.from_id) && !ids.has(l.to_id));
      }
      if (t === 'ps_milestones' || t === 'ps_ideas') { const ids = new Set(hit.map((x) => x.id)); db.ps_links = db.ps_links.filter((l) => !ids.has(l.from_id) && !ids.has(l.to_id)); }   // ps_links_cleanup
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

async function open(viewport, hash, realCsp) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 1000 }, bypassCSP: !realCsp, hasTouch: !!(viewport && viewport.width < 600), reducedMotion: 'reduce' });
  await ctx.route(/googletagmanager|google-analytics|fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await ctx.route(/supabase\.co/, route);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('bm_ap_session', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'borja.mora.mendez@gmail.com' })); localStorage.setItem('bm_cookie_consent', 'rejected'); } catch (e) { /* noop */ }
  });
  await ctx.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); }); });
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
const titlesIdeas = (page) => page.$$eval('.aps-idea .aps-row-title', (e) => e.map((x) => x.textContent));
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
await step('H2-1. Idea Lab: vacío y captura rápida de ideas', async () => {
  await view(page, 'Ideas');
  ok((await page.textContent('.aps-main')).includes('Aún no hay ideas'), 'sin estado vacío');
  for (const t of ['Mapa de calor de ventas', 'Cuadro de mando de RRHH', 'Previsión con SARIMA']) {
    await page.fill('#aps-idea-cap', t); await page.keyboard.press('Enter');
    await page.waitForFunction((x) => [...document.querySelectorAll('.aps-idea .aps-row-title')].some((e) => e.textContent === x), t);
  }
  eq(db.ps_ideas.length, 3); eq(db.ps_ideas.every((i) => i.status === 'new'), true);
  eq(await page.$$eval('.aps-idea-group .aps-block-title', (e) => e.map((x) => x.textContent)), ['Sin grupo']);
});
await step('H2-2. Estructurar una idea: tipo, grupo y estado; se reagrupa y se filtra', async () => {
  await page.click('.aps-idea .aps-row-title:text-is("Previsión con SARIMA")');
  await page.fill('#aps-i-body', 'Comparar con Prophet');
  await page.selectOption('#aps-i-kind', 'ml');
  await page.fill('#aps-i-topic', 'Previsión');
  await page.selectOption('#aps-i-status', 'exploring');
  await page.click('.aps-panel button[type="submit"]');
  await page.waitForTimeout(300);
  const i = db.ps_ideas.find((x) => x.title === 'Previsión con SARIMA');
  eq([i.kind, i.topic, i.status, i.body], ['ml', 'Previsión', 'exploring', 'Comparar con Prophet']);
  eq(await page.$$eval('.aps-idea-group .aps-block-title', (e) => e.map((x) => x.textContent)), ['Previsión', 'Sin grupo']);
  await shot(page, 'ideas');
  await page.fill('[data-role="search"]', 'prophet');
  eq(await page.$$eval('.aps-idea .aps-row-title', (e) => e.map((x) => x.textContent)), ['Previsión con SARIMA']);
  await page.fill('[data-role="search"]', '');
});
await step('H2-3. Convertir una idea en proyecto: atómico, con su descripción como objetivo', async () => {
  await page.click('.aps-panel .aps-link:has-text("Convertir en proyecto")');
  await page.waitForSelector('.aps-panel #aps-p-title');
  eq(await page.inputValue('#aps-p-title'), 'Previsión con SARIMA');
  eq(await page.inputValue('#aps-p-goal'), 'Comparar con Prophet');
  const i = db.ps_ideas.find((x) => x.title === 'Previsión con SARIMA'), p = db.ps_projects.find((x) => x.title === 'Previsión con SARIMA');
  eq([i.status, i.project_id, p.kind], ['converted', p.id, 'ml']);
  eq(log.filter((l) => l === 'RPC ps_convert_idea').length, 1);
  await page.click('.aps-panel .aps-link:has-text("Cerrar")');
  ok(!(await titlesIdeas(page)).includes('Previsión con SARIMA'), 'una idea convertida no debe seguir entre las activas');
  await page.selectOption('.aps-filters .aps-select', 'todas');
  ok((await page.textContent('.aps-idea:has-text("Previsión con SARIMA")')).includes('Convertida'), 'estado Convertida');
  await page.selectOption('.aps-filters .aps-select', 'activas');
  await view(page, 'Resumen');
  ok((await page.textContent('.aps-projects')).includes('Previsión con SARIMA'), 'el proyecto no aparece en el Resumen');
  ok((await page.textContent('[aria-labelledby="aps-h-idea"]')).includes('Mapa de calor'), 'ideas recientes en el Resumen');
});
await step('H2-4. Conectar una idea a un proyecto existente', async () => {
  await view(page, 'Ideas');
  await page.click('.aps-idea .aps-row-title:text-is("Mapa de calor de ventas")');
  await page.selectOption('#aps-i-proj', { label: 'Previsión con SARIMA' });
  await page.click('.aps-panel button[type="submit"]');
  await page.waitForTimeout(300);
  eq(db.ps_ideas.find((x) => x.title === 'Mapa de calor de ventas').project_id, db.ps_projects[0].id);
  ok((await page.textContent('.aps-idea:has-text("Mapa de calor")')).includes('Previsión con SARIMA'), 'chip del proyecto');
  await page.click('.aps-panel .aps-link:has-text("Cerrar")');
});
await step('H2-5. Notas del proyecto: crear con enlace, rechazar enlaces no http(s), editar, quitar y deshacer', async () => {
  await view(page, 'Resumen');
  await page.click('.aps-project-title');
  await page.click('.aps-sec-sum:has-text("Notas e investigación")');
  await page.click('[data-role="add-note"]');
  await page.selectOption('#aps-nt-kind', 'hypothesis');
  await page.fill('#aps-nt-title', 'Prophet gana en estacionalidad');
  await page.fill('#aps-nt-url', 'javascript:alert(1)');
  await page.click('dialog[open] button[type="submit"]');
  ok((await page.textContent('dialog[open] .ap-msg')).includes('http'), 'debía rechazar javascript:');
  eq(db.ps_notes.length, 0, 'no debía guardarse');
  await page.fill('#aps-nt-url', 'https://facebook.github.io/prophet/');
  await page.fill('#aps-nt-body', 'Probar con 3 años de histórico');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('.aps-note');
  eq([db.ps_notes[0].kind, db.ps_notes[0].url, db.ps_notes[0].project_id], ['hypothesis', 'https://facebook.github.io/prophet/', db.ps_projects[0].id]);
  const a = await page.$eval('.aps-note .aps-ext', (e) => [e.getAttribute('href'), e.getAttribute('rel'), e.getAttribute('target')]);
  eq(a, ['https://facebook.github.io/prophet/', 'noopener noreferrer', '_blank']);
  await page.click('.aps-note .aps-row-title');
  await page.fill('#aps-nt-title', 'Prophet gana con estacionalidad');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForTimeout(300);
  eq(db.ps_notes[0].title, 'Prophet gana con estacionalidad');
  await page.click('.aps-note .aps-link:has-text("Quitar")');
  await page.waitForTimeout(300);
  eq(db.ps_notes.length, 0);
  await undoClick(page);
  eq(db.ps_notes.length, 1, 'deshacer no la recuperó');
});
await step('H2-6. Entregables: crear con enlace y estado, y quitar', async () => {
  await page.click('.aps-sec-sum:has-text("Entregables")');
  await page.click('[data-role="add-deliv"]');
  await page.selectOption('#aps-dl-kind', 'repo');
  await page.selectOption('#aps-dl-status', 'in_progress');
  await page.fill('#aps-dl-title', 'Repositorio de previsión');
  await page.fill('#aps-dl-url', 'https://github.com/BORJAMOME/prevision');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('.aps-sec:nth-of-type(2) .aps-row') || [...document.querySelectorAll('.aps-ext')].length > 1);
  eq([db.ps_deliverables[0].kind, db.ps_deliverables[0].status], ['repo', 'in_progress']);
  ok((await page.textContent('.aps-panel')).includes('Repositorio de previsión') && (await page.textContent('.aps-panel')).includes('En curso'), 'no se ve en el panel');
  await page.evaluate(() => document.querySelector('.aps-panel').scrollIntoView());
  await shot(page, 'proyecto-panel');
});
await step('H2-7. Persistencia: tras recargar siguen ideas, notas y entregables', async () => {
  await page.reload(); await page.waitForSelector('.aps-head');
  await view(page, 'Ideas');
  ok((await titlesIdeas(page)).includes('Mapa de calor de ventas'), 'ideas');
  await view(page, 'Resumen');
  await page.click('.aps-project-title');
  ok((await page.textContent('.aps-panel')).includes('Prophet gana con estacionalidad'), 'nota');
  ok((await page.textContent('.aps-panel')).includes('Repositorio de previsión'), 'entregable');
});
await step('H2-8. Borrar el proyecto: sus notas y entregables se van; las ideas sobreviven sin proyecto', async () => {
  await page.click('.aps-panel .aps-link:has-text("Eliminar proyecto")');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForTimeout(300);
  eq([db.ps_notes.length, db.ps_deliverables.length], [0, 0]);
  eq(db.ps_ideas.length, 3, 'las ideas no se borran');
  eq(db.ps_ideas.every((i) => i.project_id === null), true);
  await view(page, 'Ideas');
  ok((await titlesIdeas(page)).includes('Mapa de calor de ventas'), 'idea desaparecida');
});
await step('H2-9. Eliminar una idea con confirmación y deshacer', async () => {
  await page.click('.aps-idea .aps-row-title:text-is("Cuadro de mando de RRHH")');
  await page.click('.aps-panel .aps-link:has-text("Eliminar")');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForTimeout(300);
  ok(!db.ps_ideas.some((i) => i.title === 'Cuadro de mando de RRHH'), 'no se borró');
  await undoClick(page);
  ok(db.ps_ideas.some((i) => i.title === 'Cuadro de mando de RRHH'), 'no se recuperó');
});
await step('H2-10. Error al convertir: se avisa y la idea no cambia', async () => {
  await page.click('.aps-idea .aps-row-title:text-is("Cuadro de mando de RRHH")');
  failWrites = true;
  await page.click('.aps-panel .aps-link:has-text("Convertir en proyecto")');
  await page.waitForSelector('.aps-toast.is-error');
  failWrites = false;
  await page.waitForTimeout(300);
  eq(db.ps_ideas.find((i) => i.title === 'Cuadro de mando de RRHH').status, 'new');
  eq(db.ps_projects.length, 0);
});
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const day = (n) => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const openSec = async (page, name) => { const d = await page.$(`.aps-sec:has(.aps-sec-sum:has-text("${name}"))`); if ((await d.getAttribute('open')) === null) await page.click(`.aps-sec-sum:has-text("${name}")`); };
const mrow = (title) => '.aps-ms-row[data-id="' + db.ps_milestones.find((m) => m.title === title).id + '"]';       // por id: el título de un hito también aparece en los chips de otros
const markerLeft = (page, label) => page.$eval(`.aps-ms[aria-label^="${label}"]`, (e) => parseFloat(e.style.left));
const newProject = async (page, name) => {
  await page.click('[data-role="new-project"]');
  await page.fill('#aps-n-title', name);
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('.aps-panel #aps-p-title');
};
await step('R-1. Hoja de ruta sin proyectos activos: lo explica', async () => {
  await view(page, 'Hoja de ruta');
  ok((await page.textContent('.aps-main')).includes('No hay proyectos activos'), 'sin mensaje');
});
await step('R-2. Sin fechas pide ponerlas; con la fecha objetivo del proyecto aparece la línea de tiempo con «hoy»', async () => {
  await newProject(page, 'Plan A');
  await page.click('.aps-panel .aps-link:has-text("Cerrar")');
  await view(page, 'Hoja de ruta');
  ok((await page.textContent('.aps-empty-state')).includes('Pon fecha a lo que importa'), 'sin estado vacío');
  await view(page, 'Resumen');
  await page.click('.aps-project:has-text("Plan A") .aps-project-title');
  await page.fill('#aps-p-target', day(60));
  await page.click('.aps-panel button[type="submit"]');
  await page.waitForTimeout(300);
  await view(page, 'Hoja de ruta');
  eq(await page.$$eval('.aps-ms--target', (e) => e.length), 1);
  ok((await page.$$('.aps-road-today')).length >= 1, 'sin línea de hoy');
  eq(db.ps_projects.find((p) => p.title === 'Plan A').target_date, day(60));
});
await step('R-3. Hitos: se crean desde el panel del proyecto y se colocan por fecha en la línea de tiempo', async () => {
  await page.click('.aps-road-label .aps-row-title:has-text("Plan A")');
  await page.waitForSelector('.aps-panel #aps-p-title');
  await openSec(page, 'Hitos');
  for (const [t, d] of [['Datos listos', day(20)], ['Informe', day(40)], ['Sin fecha', '']]) {
    await page.click('[data-role="add-ms"]');
    await page.fill('#aps-m-title', t); if (d) await page.fill('#aps-m-date', d);
    await page.click('dialog[open] button[type="submit"]');
    await page.waitForFunction((x) => [...document.querySelectorAll('.aps-panel .aps-ms-row .aps-row-title')].some((e) => e.textContent === x), t);
  }
  eq(db.ps_milestones.length, 3);
  eq(db.ps_milestones.every((m) => m.project_id === db.ps_projects[0].id), true);
  ok((await page.textContent('.aps-panel')).includes('0/3'), 'contador de hitos');
  await view(page, 'Hoja de ruta');
  eq(await page.$$eval('.aps-ms', (e) => e.length), 3, 'dos hitos con fecha y la bandera del objetivo');
  const [a, b, c] = [await markerLeft(page, 'Hito «Datos listos'), await markerLeft(page, 'Hito «Informe'), await markerLeft(page, 'Fecha objetivo')];
  ok(a > 0 && a < b && b < c && c <= 100, `orden de marcadores: ${a} < ${b} < ${c}`);
  ok((await page.textContent(`${mrow('Sin fecha')}`)).includes('Sin fecha'), 'el hito sin fecha va a la lista');
  await shot(page, 'hoja-de-ruta');
});
await step('R-4. Marcar un hito como hecho: el marcador cambia, la base guarda done_at y «Próximos hitos» lo omite', async () => {
  await page.check(`${mrow('Datos listos')} input[type="checkbox"]`);
  await page.waitForTimeout(300);
  const m = db.ps_milestones.find((x) => x.title === 'Datos listos');
  eq([m.status, !!m.done_at], ['done', true]);
  eq(await page.$$eval('.aps-ms--done', (e) => e.length), 1);
  await view(page, 'Resumen');
  const up = await page.textContent('[aria-labelledby="aps-h-up"]');
  ok(up.includes('Informe') && !up.includes('Datos listos'), 'próximos hitos: ' + up);
  ok((await page.textContent('.aps-project:has-text("Plan A")')).includes('Próximo hito: Informe'), 'tarjeta del proyecto');
});
await step('R-5. Dependencia entre hitos con fechas incoherentes: avisa; rechaza ciclos y duplicados', async () => {
  await view(page, 'Hoja de ruta');
  await page.click(`${mrow('Datos listos')} .aps-link:has-text("Relación")`);
  await page.selectOption('#aps-l-rel', 'depends_on');
  await page.selectOption('#aps-l-to', { label: 'Informe (Plan A)' });
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('.aps-wipwarn');
  eq([db.ps_links.length, db.ps_links[0].rel, db.ps_links[0].kind], [1, 'depends_on', 'milestone']);
  ok((await page.textContent('.aps-wipwarn')).includes('1 dependencia con fechas incoherentes'), 'banner');
  ok((await page.textContent(`${mrow('Datos listos')} .aps-rel`)).includes('prevista 20 días después'), 'chip de la dependencia');
  ok((await page.textContent(`${mrow('Informe')} .aps-rel`)).includes('Lo necesita'), 'se ve también desde el otro hito');
  await page.click(`${mrow('Informe')} .aps-link:has-text("Relación")`);         // Informe depende de Datos listos: ciclo
  await page.selectOption('#aps-l-rel', 'depends_on');
  await page.selectOption('#aps-l-to', { label: 'Datos listos (Plan A)' });
  await page.click('dialog[open] button[type="submit"]');
  ok((await page.textContent('dialog[open] .ap-msg')).includes('ciclo'), 'debía rechazar el ciclo');
  await page.click('dialog[open] button:has-text("Cancelar")');
  await page.click(`${mrow('Datos listos')} .aps-link:has-text("Relación")`);     // duplicado
  await page.selectOption('#aps-l-rel', 'depends_on');
  await page.selectOption('#aps-l-to', { label: 'Informe (Plan A)' });
  await page.click('dialog[open] button[type="submit"]');
  ok((await page.textContent('dialog[open] .ap-msg')).includes('ya existe'), 'debía rechazar el duplicado');
  await page.click('dialog[open] button:has-text("Cancelar")');
  eq(db.ps_links.length, 1);
});
await step('R-6. Quitar la relación con la ×: desaparece el aviso y la base queda limpia', async () => {
  await page.click(`${mrow('Datos listos')} .aps-rel-x`);
  await page.waitForTimeout(300);
  eq(db.ps_links.length, 0);
  eq(await page.$$eval('.aps-wipwarn', (e) => e.length), 0);
});
await step('R-7. Relaciones entre proyectos: dependencia y relación conviven; la lista y el aviso las reflejan', async () => {
  await newProject(page, 'Plan B');
  await page.fill('#aps-p-target', day(90));
  await page.click('.aps-panel button[type="submit"]');
  await page.waitForTimeout(300);
  await page.click('.aps-panel .aps-link:has-text("Cerrar")');
  await view(page, 'Resumen');
  await page.click('.aps-project:has-text("Plan A") .aps-project-title');
  await openSec(page, 'Relaciones del proyecto');
  for (const rel of ['depends_on', 'relates_to']) {
    await page.click('[data-role="add-rel"]');
    await page.selectOption('#aps-l-rel', rel);
    await page.selectOption('#aps-l-to', { label: 'Plan B' });
    await page.click('dialog[open] button[type="submit"]');
    await page.waitForFunction((n) => document.querySelectorAll('.aps-panel .aps-rel').length === n, rel === 'depends_on' ? 1 : 2);
  }
  eq(db.ps_links.map((l) => [l.kind, l.rel]), [['project', 'depends_on'], ['project', 'relates_to']]);
  await view(page, 'Hoja de ruta');
  const txt = await page.textContent('[aria-labelledby="aps-h-pl"]');
  ok(txt.includes('«Plan A» depende de «Plan B»') && txt.includes('«Plan A» se relaciona con «Plan B»'), 'lista: ' + txt);
  ok((await page.textContent('.aps-wipwarn')).includes('30 días'), 'Plan A (+60) depende de Plan B (+90): 30 días');
  await page.click('.aps-road-label .aps-row-title:has-text("Plan B")');
  await page.waitForSelector('.aps-panel #aps-p-title');
  await openSec(page, 'Relaciones del proyecto');
  ok((await page.textContent('.aps-panel')).includes('Lo necesita «Plan A»'), 'visible desde Plan B');
});
await step('R-8. Relaciones entre ideas: simétricas y sin «depende de»', async () => {
  await view(page, 'Ideas');
  await page.click('.aps-idea .aps-row-title:text-is("Mapa de calor de ventas")');
  await openSec(page, 'Relaciones con otras ideas');
  await page.click('[data-role="add-rel"]');
  eq(await page.$$eval('#aps-l-rel option', (o) => o.map((x) => x.value)), ['relates_to'], 'las ideas solo admiten relates_to');
  await page.selectOption('#aps-l-to', { label: 'Cuadro de mando de RRHH' });
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('.aps-panel .aps-rel');
  eq(db.ps_links.filter((l) => l.kind === 'idea').length, 1);
  await page.click('.aps-idea .aps-row-title:text-is("Cuadro de mando de RRHH")');
  await openSec(page, 'Relaciones con otras ideas');
  ok((await page.textContent('.aps-panel .aps-rel')).includes('Mapa de calor de ventas'), 'simetría');
  await page.click('[data-role="add-rel"]');                                                  // la inversa ya existe
  await page.selectOption('#aps-l-to', { label: 'Mapa de calor de ventas' });
  await page.click('dialog[open] button[type="submit"]');
  ok((await page.textContent('dialog[open] .ap-msg')).includes('ya existe'), 'relación inversa duplicada');
  await page.click('dialog[open] button:has-text("Cancelar")');
});
await step('R-9. Borrar un hito limpia sus relaciones; deshacer lo recupera; borrar el proyecto se lleva hitos y relaciones', async () => {
  await view(page, 'Hoja de ruta');
  await page.click(`${mrow('Datos listos')} .aps-link:has-text("Relación")`);
  await page.selectOption('#aps-l-to', { label: 'Informe (Plan A)' });
  await page.selectOption('#aps-l-rel', 'relates_to');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.aps-ms-row .aps-rel').length >= 2);
  const before = db.ps_links.length;
  await page.click(`${mrow('Informe')} .aps-link--danger`);
  await page.waitForTimeout(300);
  eq(db.ps_milestones.some((m) => m.title === 'Informe'), false);
  eq(db.ps_links.length, before - 1, 'su relación debía borrarse');
  await undoClick(page);
  eq(db.ps_milestones.some((m) => m.title === 'Informe'), true, 'deshacer no recuperó el hito');
  await view(page, 'Resumen');
  await page.click('.aps-project:has-text("Plan A") .aps-project-title');
  await page.click('.aps-panel .aps-link:has-text("Eliminar proyecto")');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForTimeout(300);
  eq(db.ps_milestones.length, 0, 'hitos en cascada');
  eq(db.ps_links.filter((l) => l.kind !== 'idea').length, 0, 'relaciones de proyectos e hitos');
  eq(db.ps_links.filter((l) => l.kind === 'idea').length, 1, 'la relación entre ideas no depende de proyectos');
});
await step('R-10. Persistencia: tras recargar siguen los hitos y las relaciones', async () => {
  await view(page, 'Hoja de ruta');
  await newProject(page, 'Plan C');
  await page.fill('#aps-p-target', day(45));
  await page.click('.aps-panel button[type="submit"]');
  await openSec(page, 'Hitos');
  await page.click('[data-role="add-ms"]');
  await page.fill('#aps-m-title', 'Primer corte'); await page.fill('#aps-m-date', day(25));
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('.aps-panel .aps-ms-row');
  await page.reload(); await page.waitForSelector('.aps-head');
  await view(page, 'Hoja de ruta');
  await page.waitForSelector('.aps-ms');
  ok((await page.textContent(`${mrow('Primer corte')}`)).includes('Plan C'), 'el hito no persistió');
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
  for (const v of ['Tablero', 'Resumen', 'Ideas', 'Hoja de ruta', 'Archivo']) {
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
await step('CSP real: sin violaciones y la barra de progreso se pinta (no usa estilos en línea)', async () => {
  const c = await open(null, '#/studio', true);
  pagePtr.page = c.page;
  await c.page.click('[data-role="new-project"]');
  await c.page.fill('#aps-n-title', 'Proyecto CSP');
  await c.page.click('dialog[open] button[type="submit"]');
  await c.page.waitForSelector('.aps-panel');
  await c.page.click('.aps-panel .aps-link:has-text("Cerrar")');
  await view(c.page, 'Tablero');
  await c.page.selectOption('.aps-filters .aps-select', { label: 'Proyecto CSP' });
  await capture(c.page, 'Tarea CSP');
  await drag(c.page, cardSel('Tarea CSP'), ...(await listPoint('done')));
  await view(c.page, 'Resumen');
  const info = await c.page.$eval('.aps-project:has-text("Proyecto CSP") .aps-bar span', (e) => ({ inline: e.style.width, computed: getComputedStyle(e).width, parent: e.parentNode.getBoundingClientRect().width, count: e.closest('.aps-project').querySelector('.aps-project-count').textContent }));
  ok(parseFloat(info.computed) > 50, 'la barra de progreso no se pinta: ' + JSON.stringify(info));
  eq(await c.page.evaluate(() => window.__csp || []), [], 'violaciones de CSP');
  eq(c.errors, []);
  await c.ctx.close();
});
await step('20. Hoy sigue funcionando (Centro de trabajo intacto)', async () => {
  const h = await open(null, '#/');
  ok(await h.page.isVisible('.apk-title'), 'el Centro de trabajo no se monta');
  eq(await h.page.getAttribute('.ap-tabs a[data-tab="hoy"]', 'aria-current'), 'page');
  eq(h.errors, []);
  await h.ctx.close();
});

await step('H2-11. Accesibilidad (axe): panel de idea y panel de proyecto con sus secciones abiertas', async () => {
  const a = await open();
  pagePtr.page = a.page;
  await view(a.page, 'Ideas');
  await a.page.fill('#aps-idea-cap', 'Idea para axe'); await a.page.keyboard.press('Enter');
  await a.page.waitForSelector('.aps-idea');
  await a.page.click('.aps-idea .aps-row-title');
  await a.page.addScriptTag({ content: AXE });
  const scan = () => a.page.evaluate(async () => (await axe.run('.aps', { resultTypes: ['violations'] })).violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => x.id + ' (' + x.nodes.length + ')'));
  eq(await scan(), [], 'axe con el panel de idea');
  await a.page.click('.aps-panel .aps-link:has-text("Convertir en proyecto")');
  await a.page.waitForSelector('.aps-panel #aps-p-title');
  for (const s of ['Notas e investigación', 'Entregables']) { const d = await a.page.$(`.aps-sec:has(.aps-sec-sum:has-text("${s}"))`); if (!(await d.getAttribute('open') !== null)) await a.page.click(`.aps-sec-sum:has-text("${s}")`); }
  eq(await scan(), [], 'axe con el panel de proyecto');
  eq(a.errors, []);
  await a.ctx.close();
});
await step('H2-12. Sin studio-ideas.sql: el Studio sigue funcionando y avisa dónde falta', async () => {
  extMissing = true;
  const a = await open();
  pagePtr.page = a.page;
  await view(a.page, 'Ideas');
  ok((await a.page.textContent('.aps-setup')).includes('studio-ideas.sql'), 'sin aviso en Ideas');
  await view(a.page, 'Tablero');
  ok(await a.page.isVisible('.aps-board'), 'el tablero debería funcionar');
  await view(a.page, 'Resumen');
  await a.page.click('.aps-project-title');
  ok((await a.page.textContent('.aps-panel')).includes('studio-ideas.sql'), 'sin aviso en el panel de proyecto');
  eq(a.errors, []);
  await a.ctx.close();
  extMissing = false;
});

await step('R-11. CSP real: la hoja de ruta se pinta sin estilos en línea (posiciones y anchos por CSSOM)', async () => {
  const c = await open(null, '#/studio', true);
  pagePtr.page = c.page;
  await view(c.page, 'Hoja de ruta');
  await c.page.waitForSelector('.aps-ms');
  const lefts = await c.page.$$eval('.aps-ms', (es) => es.map((e) => parseFloat(getComputedStyle(e).left)));
  ok(lefts.length >= 2 && lefts.every((x) => x > 0), 'marcadores sin posición: ' + JSON.stringify(lefts));
  const widths = await c.page.$$eval('.aps-road-month', (es) => es.map((e) => parseFloat(getComputedStyle(e).width)));
  ok(widths.length >= 3 && widths.every((x) => x > 20), 'meses sin ancho: ' + JSON.stringify(widths));
  eq(await c.page.evaluate(() => window.__csp || []), [], 'violaciones de CSP');
  eq(c.errors, []);
  await c.ctx.close();
});
await step('R-12. Sin studio-roadmap.sql: el resto del Studio funciona y avisa dónde falta', async () => {
  roadMissing = true;
  const a = await open();
  pagePtr.page = a.page;
  await view(a.page, 'Hoja de ruta');
  ok((await a.page.textContent('.aps-setup')).includes('studio-roadmap.sql'), 'sin aviso en la hoja de ruta');
  await view(a.page, 'Tablero');
  ok(await a.page.isVisible('.aps-board'), 'el tablero debería funcionar');
  await view(a.page, 'Resumen');
  await a.page.click('.aps-project-title');
  ok((await a.page.textContent('.aps-panel')).includes('studio-roadmap.sql'), 'sin aviso en el panel de proyecto');
  eq(a.errors, []);
  await a.ctx.close();
  roadMissing = false;
});
await step('R-13. Accesibilidad (axe): hoja de ruta y panel de proyecto con hitos y relaciones abiertos', async () => {
  const a = await open();
  pagePtr.page = a.page;
  await a.page.addScriptTag({ content: AXE });
  const scan = () => a.page.evaluate(async () => (await axe.run('.aps', { resultTypes: ['violations'] })).violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => x.id + ' (' + x.nodes.length + ')'));
  await view(a.page, 'Hoja de ruta');
  await a.page.waitForSelector('.aps-ms');
  eq(await scan(), [], 'axe en la hoja de ruta');
  await a.page.click('.aps-road-label .aps-row-title');
  await a.page.waitForSelector('.aps-panel #aps-p-title');
  await openSec(a.page, 'Hitos'); await openSec(a.page, 'Relaciones del proyecto');
  eq(await scan(), [], 'axe con el panel de proyecto');
  eq(a.errors, []);
  await a.ctx.close();
});
await step('R-14. Móvil: la hoja de ruta no desborda la página (la línea de tiempo se desplaza dentro de su caja)', async () => {
  const m = await open({ width: 390, height: 800 });
  pagePtr.page = m.page;
  await view(m.page, 'Hoja de ruta');
  await m.page.waitForSelector('.aps-road');
  const o = await m.page.evaluate(() => ({ page: document.documentElement.scrollWidth - innerWidth, inner: document.querySelector('.aps-road').scrollWidth - document.querySelector('.aps-road').clientWidth }));
  ok(o.page <= 1, 'desborda la página ' + o.page + ' px');
  ok(o.inner > 0, 'la línea de tiempo debería desplazarse por dentro');
  eq(m.errors, []);
  await m.ctx.close();
});

await browser.close();
server.close();
for (const [mark, name] of results) console.log(mark + ' ' + name);
console.log(`\n${results.length - failed} de ${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);
