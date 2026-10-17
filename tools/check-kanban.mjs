/* ═══════════════════════════════════════════════
   tools/check-kanban.mjs: prueba de la interfaz del Centro de trabajo (Hoy)
     npm i --no-save playwright axe-core && npx playwright install chromium
     node tools/check-kanban.mjs
   Sirve el sitio en local y sustituye Supabase por un PostgREST en memoria (solo las tablas
   kb_*; el resto devuelve vacío). NO toca la base real. Recorre los flujos principales con
   Chromium: crear, editar, arrastrar, reordenar, recargar, proyectos, pasos, filtros,
   archivar, error de guardado, deshacer, teclado, móvil y axe.
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
const db = { kb_tarjetas: [], kb_proyectos: [], kb_subtareas: [], kb_historial: [], kb_ajustes: [{ clave: 'capacidad', valor: { hoy: 2 } }] };
let failWrites = false, writeDelay = 0, writes = 0;
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
function trigger(row, old) {            // lo que hace supabase/kanban.sql en el servidor
  const now = new Date().toISOString();
  if (!old) { row.completada_en = row.estado === 'hecho' ? now : null; db.kb_historial.push({ tarjeta_id: row.id, tipo: 'creada', a: row.estado, created_at: now }); return; }
  if (row.estado !== old.estado) { db.kb_historial.push({ tarjeta_id: row.id, tipo: 'estado', de: old.estado, a: row.estado, created_at: now }); row.completada_en = row.estado === 'hecho' ? now : null; }
  row.updated_at = now;
}
async function route(r) {
  const req = r.request(), url = new URL(req.url()), m = /\/rest\/v1\/(\w+)/.exec(url.pathname), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (!m) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' });
  const t = m[1], json = (status, body) => r.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (!(t in db)) return json(200, []);
  const method = req.method(), rows = db[t], params = [...url.searchParams.entries()];
  if (method === 'GET') return json(200, rows.filter((x) => matches(x, params)));
  writes++;
  log.push(method + ' ' + t);
  if (writeDelay) await new Promise((res) => setTimeout(res, writeDelay));
  if (failWrites) return json(500, { message: 'Fallo simulado de guardado' });
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  if (method === 'POST') {
    const list = [].concat(body).map((b) => {
      const prior = t === 'kb_ajustes' ? rows.find((x) => x.clave === b.clave) : null;
      if (prior) { Object.assign(prior, b); return prior; }
      const row = Object.assign({ id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archivada_en: null, hoy_fecha: null, bloqueada: false, prioridad: 2, etiquetas: [], hecho: false, estado: 'activo' }, t === 'kb_tarjetas' ? { estado: 'pendiente', tipo: 'tarea' } : {}, b);
      rows.push(row); if (t === 'kb_tarjetas') trigger(row, null); return row;
    });
    return json(201, list);
  }
  const hit = rows.filter((x) => matches(x, params));
  if (method === 'PATCH') { hit.forEach((x) => { const old = { ...x }; Object.assign(x, body); if (t === 'kb_tarjetas') trigger(x, old); }); return json(200, hit); }
  if (method === 'DELETE') { hit.forEach((x) => rows.splice(rows.indexOf(x), 1)); if (t === 'kb_tarjetas') db.kb_subtareas = db.kb_subtareas.filter((s) => rows.some((c) => c.id === s.tarjeta_id)); return json(204, null); }
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

async function open(viewport) {
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
  await page.goto(BASE);
  await page.waitForSelector('.apk-head');
  return { ctx, page, errors };
}
// el tablero se repinta al cerrar un diálogo: se espera a que el elemento exista y tenga caja antes de medirlo
async function bbox(sel) {
  for (let i = 0; i < 60; i++) {
    const el = await pagePtr.page.$(sel);
    const b = el && await el.boundingBox().catch(() => null);
    if (b) return b;
    await pagePtr.page.waitForTimeout(50);
  }
  throw new Error('sin caja para ' + sel);
}
const pagePtr = {};
const titles = (page, estado) => page.$$eval(`.apk-col[data-estado="${estado}"] .apk-card .apk-card-open`, (els) => els.map((e) => e.textContent));
const goBoard = async (page) => { await page.click('.apk-seg-btn:has-text("Tablero")'); await page.waitForSelector('.apk-board'); };
async function addInline(page, estado, text) {
  await page.click(`.apk-col[data-estado="${estado}"] .apk-add`);
  await page.fill(`.apk-col[data-estado="${estado}"] .apk-add-form input`, text);
  await page.keyboard.press('Enter');
  await page.waitForFunction((t) => [...document.querySelectorAll('.apk-card-open')].some((e) => e.textContent === t), text);
  await page.keyboard.press('Escape');
}
async function drag(page, fromSel, toX, toY) {
  const b = await bbox(fromSel);
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.3 + 12, b.y + b.height / 2 + 12, { steps: 3 });
  await page.mouse.move(toX, toY, { steps: 12 });
  await page.waitForSelector('.apk-ghost');
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const cardSel = (t) => `.apk-card:has(.apk-card-open:text-is("${t}"))`;
const colCenter = async (page, estado, yOff) => { const b = await bbox(`.apk-col[data-estado="${estado}"] .apk-list`); return [b.x + b.width / 2, b.y + (yOff == null ? 20 : yOff)]; };

const { page, ctx, errors } = await open();
pagePtr.page = page;

await step('Hoy: se ve el centro de trabajo y la agenda existente sigue ahí', async () => {
  ok(await page.isVisible('.apk-title'), 'sin cabecera del módulo');
  const t = await page.$$eval('.aph-card h2', (e) => e.map((x) => x.textContent));
  eq(t, ['Próximos 7 días', 'Entrevistas programadas', 'Pendientes de seguimiento'], 'tarjetas de agenda');
});
await step('Vacío: columnas con ayuda y sin botones muertos', async () => {
  await goBoard(page);
  ok((await page.textContent('.apk-col[data-estado="ideas"] .apk-empty')).includes('explorando'), 'texto de columna vacía');
});
await step('1. Crear tarjetas desde la columna (estado automático)', async () => {
  await addInline(page, 'pendiente', 'Estudiar DAX');
  await addInline(page, 'pendiente', 'Revisar CV');
  await addInline(page, 'ideas', 'Kanban personal');
  eq(await titles(page, 'pendiente'), ['Estudiar DAX', 'Revisar CV']);
  eq(db.kb_tarjetas.find((c) => c.titulo === 'Kanban personal').tipo, 'idea', 'tipo idea');
});
await step('1b. Crear con el botón «Nueva tarjeta»', async () => {
  await page.click('[data-role="new"]');
  await page.fill('#apk-n-t', 'Publicar proyecto');
  await page.selectOption('#apk-n-e', 'en_curso');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('.apk-col[data-estado="en_curso"] .apk-card');
  eq(await titles(page, 'en_curso'), ['Publicar proyecto']);
});
await step('2. Editar: título, prioridad, fecha, bloqueo, siguiente paso y notas', async () => {
  await page.click(cardSel('Estudiar DAX') + ' .apk-card-open');
  await page.fill('#apk-d-t', 'Estudiar DAX avanzado');
  await page.selectOption('#apk-d-pr', '4');
  await page.fill('#apk-d-f', '2026-10-15');
  await page.fill('#apk-d-p', 'Resolver 3 ejercicios');
  await page.fill('#apk-d-n', 'Notas de prueba');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const c = db.kb_tarjetas.find((x) => x.titulo === 'Estudiar DAX avanzado');
  ok(c && c.prioridad === 4 && c.fecha_limite === '2026-10-15' && c.notas === 'Notas de prueba', 'no se guardó');
  ok((await page.textContent(cardSel('Estudiar DAX avanzado'))).includes('Urgente'), 'sin marca de prioridad');
});
await step('2b. Bloqueo exige motivo y se muestra', async () => {
  await page.click(cardSel('Revisar CV') + ' .apk-card-open');
  await page.check('dialog[open] .apk-check input');
  await page.click('dialog[open] button[type="submit"]');
  ok((await page.textContent('dialog[open] .ap-msg')).includes('bloquea'), 'sin aviso de motivo');
  await page.fill('#apk-d-b', 'Falta feedback');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  ok((await page.textContent(cardSel('Revisar CV'))).includes('Bloqueada'), 'sin indicador de bloqueo');
});
await step('3. Arrastrar a otra columna (y persiste)', async () => {
  const [x, y] = await colCenter(page, 'en_curso', 90);
  await drag(page, cardSel('Estudiar DAX avanzado'), x, y);
  ok((await titles(page, 'en_curso')).includes('Estudiar DAX avanzado'), 'no cambió de columna');
  eq(db.kb_tarjetas.find((c) => c.titulo === 'Estudiar DAX avanzado').estado, 'en_curso', 'servidor');
});
await step('4. Reordenar dentro de la misma columna', async () => {
  if (process.env.DBG) { const f0 = (await titles(page, 'en_curso'))[0]; const bb = await bbox(cardSel(f0)); console.log('DBG', f0, JSON.stringify(bb), await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.className + '|' + e.tagName + '|' + (e.closest('.apk-card') ? 'card' : 'nocard'); }, [bb.x + bb.width * 0.3, bb.y + bb.height / 2])); }
  const first = (await titles(page, 'en_curso'))[0];
  const [x, y] = await colCenter(page, 'en_curso', 400);
  await drag(page, cardSel(first), x, y);
  const after = await titles(page, 'en_curso');
  eq(after[after.length - 1], first, 'debería quedar la última');
  const pos = db.kb_tarjetas.filter((c) => c.estado === 'en_curso').sort((a, b) => a.posicion - b.posicion).map((c) => c.titulo);
  eq(pos, after, 'el orden del servidor coincide con la pantalla');
});
await step('15. Límite WIP: avisa al superarlo pero no bloquea', async () => {
  await addInline(page, 'pendiente', 'Tercera');
  await addInline(page, 'pendiente', 'Cuarta');
  for (const t of ['Tercera', 'Cuarta']) { await page.click(cardSel(t) + ' [data-role="adv"]'); await page.waitForTimeout(100); }
  ok(await page.isVisible('.apk-col[data-estado="en_curso"] .apk-wipwarn'), 'sin aviso de límite');
  eq((await titles(page, 'en_curso')).length, 4, 'se permitió el movimiento');
  ok((await page.textContent('.apk-col[data-estado="en_curso"] .apk-count')).replace(/\s/g, '') === '4/3', 'contador 4/3');
});
await step('5. Recargar conserva todo', async () => {
  const before = { c: await titles(page, 'en_curso'), p: await titles(page, 'pendiente') };
  await page.reload(); await page.waitForSelector('.apk-head'); await goBoard(page);
  eq(await titles(page, 'en_curso'), before.c, 'en curso'); eq(await titles(page, 'pendiente'), before.p, 'pendiente');
});
await step('6. Proyectos: crear y asignar tareas', async () => {
  await page.click('.apk-btn:has-text("Proyectos")');
  await page.click('dialog[open] button:has-text("Nuevo proyecto")');
  await page.fill('#apk-p-t', 'Portfolio 2026'); await page.fill('#apk-p-o', 'Tener 3 proyectos publicados');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.click(cardSel('Publicar proyecto') + ' .apk-card-open');
  await page.selectOption('#apk-d-proy', { label: 'Portfolio 2026' });
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  ok((await page.textContent(cardSel('Publicar proyecto'))).includes('Portfolio 2026'), 'proyecto no visible en la tarjeta');
  eq(db.kb_tarjetas.find((c) => c.titulo === 'Publicar proyecto').proyecto_id, db.kb_proyectos[0].id, 'relación en servidor');
});
await step('7. Pasos: añadir, marcar y contar', async () => {
  await page.click(cardSel('Publicar proyecto') + ' .apk-card-open');
  for (const t of ['Escribir README', 'Subir capturas']) { await page.fill('dialog[open] input[aria-label="Nuevo paso"]', t); await page.keyboard.press('Enter'); await page.waitForSelector(`dialog[open] .apk-sub:has-text("${t}")`); }
  await page.check('dialog[open] .apk-sub input[type="checkbox"]');
  await page.waitForTimeout(100);
  await page.click('dialog[open] button:has-text("Cerrar")');
  await page.waitForTimeout(100);
  ok((await page.textContent(cardSel('Publicar proyecto'))).includes('1/2 pasos'), 'contador de pasos');
});
await step('8/9. Filtros y búsqueda (se activan y se quitan)', async () => {
  await page.fill('.apk-filters input[type="search"]', 'dax');
  eq((await page.$$('.apk-card')).length, 1, 'búsqueda');
  await page.click('.apk-filters .apk-link:has-text("Quitar filtros")');
  ok((await page.$$('.apk-card')).length >= 6, 'quitar filtros');
  await page.click('.apk-chipbtn');
  eq((await page.$$('.apk-card')).length, 1, 'solo bloqueadas');
  await page.click('.apk-chipbtn');
  await page.selectOption('.apk-filters select[aria-label="Filtrar por proyecto"]', db.kb_proyectos[0].id);
  eq(await page.$$eval('.apk-card .apk-card-open', (e) => e.map((x) => x.textContent)), ['Publicar proyecto'], 'por proyecto');
  await page.selectOption('.apk-filters select[aria-label="Filtrar por proyecto"]', '');
});
await step('10/11. Completar, archivar y recuperar', async () => {
  await page.click(cardSel('Cuarta') + ' [data-role="adv"]');       // en curso → revisión
  await page.click(cardSel('Cuarta') + ' [data-role="adv"]');       // revisión → hecho
  ok((await titles(page, 'hecho')).includes('Cuarta'), 'no llegó a Hecho');
  ok(db.kb_tarjetas.find((c) => c.titulo === 'Cuarta').completada_en, 'sin fecha de finalización');
  await page.click(cardSel('Cuarta') + ' .apk-card-open');
  await page.click('dialog[open] button:has-text("Archivar")');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  ok(!(await titles(page, 'hecho')).includes('Cuarta'), 'sigue en el tablero');
  ok(db.kb_tarjetas.find((c) => c.titulo === 'Cuarta').archivada_en, 'sin archivar en servidor');
  await page.click('.apk-seg-btn:has-text("Archivo")');
  await page.waitForSelector('.apk-arch .apk-card');
  await page.click('.apk-arch button:has-text("Recuperar")');
  await goBoard(page);
  ok((await titles(page, 'hecho')).includes('Cuarta'), 'no se recuperó');
});
await step('12. Error de guardado: se revierte y avisa', async () => {
  const before = await titles(page, 'pendiente');
  failWrites = true;
  const first = before[0];
  await page.click(cardSel(first) + ' [data-role="adv"]');
  await page.waitForSelector('.apk-toast.is-error.is-on');
  failWrites = false;
  eq(await titles(page, 'pendiente'), before, 'debe volver a su sitio');
  ok((await page.textContent('.apk-toast')).includes('No se ha guardado'), 'mensaje');
});
await step('13. Deshacer un movimiento', async () => {
  const t = (await titles(page, 'pendiente'))[0];
  await page.click(cardSel(t) + ' [data-role="adv"]');
  ok(!(await titles(page, 'pendiente')).includes(t), 'no se movió');
  await page.click('.apk-toast .apk-link:has-text("Deshacer")');
  await page.waitForFunction((x) => [...document.querySelectorAll('.apk-col[data-estado="pendiente"] .apk-card-open')].some((e) => e.textContent === x), t);
  eq(db.kb_tarjetas.find((c) => c.titulo === t).estado, 'pendiente', 'servidor tras deshacer');
});
await step('14. Teclado: Mayús+flechas mueve y reordena', async () => {
  const col = await titles(page, 'pendiente');
  ok(col.length >= 1, 'necesita tarjeta');
  const t = col[0];
  await page.focus(cardSel(t) + ' .apk-card-open');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForFunction((x) => [...document.querySelectorAll('.apk-col[data-estado="en_curso"] .apk-card-open')].some((e) => e.textContent === x), t);
  ok(await page.evaluate(() => document.activeElement.classList.contains('apk-card-open')), 'el foco se conserva en la tarjeta');
  await page.waitForFunction(() => /posición/.test((document.querySelector('[role="status"].sr-only') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  ok((await page.textContent('[role="status"].sr-only')).includes('posición'), 'sin anuncio para lector de pantalla');
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForFunction((x) => (document.querySelector('.apk-col[data-estado="en_curso"] .apk-card:nth-child(2) .apk-card-open') || {}).textContent === x, t);
  eq(db.kb_tarjetas.filter((c) => c.estado === 'en_curso').sort((a, b) => a.posicion - b.posicion)[1].titulo, t, 'orden en servidor tras reordenar con teclado');
});
await step('Hoy (vista de foco): elegir, capacidad y sugerencias con motivo', async () => {
  await page.click('.apk-seg-btn:has-text("Hoy")');
  ok((await page.textContent('.apk-sug')).includes('Porque:'), 'sin motivo en sugerencias');
  const btns = await page.$$('.apk-sug button[data-role="hoy"]');
  ok(btns.length >= 1, 'sin sugerencias');
  for (let i = 0; i < 3; i++) { const b = await page.$('.apk-sug button[data-role="hoy"]'); if (b) { await b.click(); await page.waitForTimeout(80); } }
  ok(await page.isVisible('.apk-hoy-grid .apk-wipwarn'), 'sin aviso de capacidad superada');
  ok(db.kb_tarjetas.filter((c) => c.hoy_fecha).length === 3, 'no se guardó hoy_fecha');
});
await step('Táctil: solo el asa arrastra (eventos de puntero táctiles)', async () => {
  await goBoard(page);
  const t = (await titles(page, 'en_curso'))[0];
  // el borde de la ventana activa el autoscroll: se coloca el tablero a media altura para que el destino no quede en esa zona
  await page.evaluate(() => { const r = document.querySelector('.apk-board').getBoundingClientRect(); scrollBy(0, r.top - 300); });
  await page.waitForTimeout(100);
  const dest = await bbox('.apk-col[data-estado="revision"] .apk-list');
  const g = await bbox(cardSel(t) + ' .apk-grip');
  const fire = (type, x, y, sel) => page.evaluate(([type, x, y, sel]) => {
    const target = sel ? document.querySelector(sel) : document;
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y }));
  }, [type, x, y, sel]);
  // 1) tocar el cuerpo de la tarjeta no inicia arrastre
  const body = await bbox(cardSel(t) + ' .apk-card-open');
  const tid = db.kb_tarjetas.find((c) => c.titulo === t).id;
  await fire('pointerdown', body.x + 5, body.y + 5, '[data-id="' + tid + '"] .apk-card-open');
  await fire('pointermove', body.x + 60, body.y + 80); await page.waitForTimeout(60);
  eq(await page.$$('.apk-ghost').then((a) => a.length), 0, 'el cuerpo no debe arrastrar con el dedo');
  await fire('pointerup', body.x + 60, body.y + 80);
  // 2) desde el asa sí
  await fire('pointerdown', g.x + 4, g.y + 4, '[data-id="' + tid + '"] .apk-grip');
  for (let i = 1; i <= 6; i++) await fire('pointermove', g.x + 4 + ((dest.x + 100 - g.x) * i) / 6, g.y + 4 + ((dest.y + 20 - g.y) * i) / 6);
  await page.waitForSelector('.apk-ghost');
  await fire('pointerup', dest.x + 100, dest.y + 20);      // sin esperar un fotograma: el destino se recalcula al soltar
  await page.waitForTimeout(150);
  ok((await titles(page, 'revision')).includes(t), 'no llegó a En revisión');
  eq(db.kb_tarjetas.find((c) => c.titulo === t).estado, 'revision', 'servidor');
});
await step('Regresión: editar una tarjeta archivada guarda y se ve al reabrir', async () => {
  const c = db.kb_tarjetas.find((x) => x.titulo === 'Cuarta');
  c.archivada_en = new Date().toISOString();
  await page.reload(); await page.waitForSelector('.apk-head');
  await page.click('.apk-seg-btn:has-text("Archivo")');
  await page.waitForSelector('.apk-arch .apk-card');
  await page.click('.apk-arch .apk-card-open');
  await page.fill('#apk-d-t', 'Cuarta editada'); await page.fill('#apk-d-n', 'Notas nuevas');
  await page.click('dialog[open] button[type="submit"]'); await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.click('.apk-arch .apk-card-open');
  eq(await page.inputValue('#apk-d-t'), 'Cuarta editada', 'el diálogo debe mostrar lo guardado');
  eq(await page.inputValue('#apk-d-n'), 'Notas nuevas');
  await page.click('dialog[open] button:has-text("Cerrar")');
  c.archivada_en = null; c.titulo = 'Cuarta';
});
await step('Regresión: «Deshacer» deshace la última acción aunque el guardado vaya lento', async () => {
  await page.reload(); await page.waitForSelector('.apk-head'); await goBoard(page);
  const col = await titles(page, 'pendiente');
  if (col.length < 2) { await addInline(page, 'pendiente', 'Lenta A'); await addInline(page, 'pendiente', 'Lenta B'); }
  const [x, y] = (await titles(page, 'pendiente')).slice(-2);
  writeDelay = 600;
  await page.click(cardSel(x) + ' [data-role="adv"]'); await page.waitForTimeout(80);
  await page.click(cardSel(y) + ' [data-role="adv"]'); await page.waitForTimeout(80);
  await page.click('.apk-toast .apk-link:has-text("Deshacer")');
  await page.waitForTimeout(1800); writeDelay = 0;
  const estadoDe = (t) => db.kb_tarjetas.find((c) => c.titulo === t).estado;
  eq(estadoDe(y), 'pendiente', 'la última acción (y) se deshace');
  eq(estadoDe(x), 'en_curso', 'la anterior (x) no se toca');
  ok((await titles(page, 'pendiente')).includes(y) && !(await titles(page, 'pendiente')).includes(x), 'la pantalla coincide con el servidor');
});
await step('Regresión: con filtro activo, soltar entre dos visibles respeta el orden real', async () => {
  const ids = {};
  [['A', 3, 1e6], ['H1', 2, 2e6], ['H2', 2, 3e6], ['B', 3, 4e6], ['C', 3, 5e6]].forEach(([t, pr, pos]) => { const id = uid(); ids[t] = id; db.kb_tarjetas.push({ id, titulo: 'F-' + t, estado: 'ideas', tipo: 'idea', posicion: pos, prioridad: pr, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archivada_en: null, hoy_fecha: null, bloqueada: false, etiquetas: [] }); });
  await page.reload(); await page.waitForSelector('.apk-head'); await goBoard(page);
  await page.selectOption('.apk-filters select[aria-label="Filtrar por prioridad"]', '3');
  const bBox = await bbox(cardSel('F-B'));
  await drag(page, cardSel('F-A'), bBox.x + bBox.width / 2, bBox.y + bBox.height - 4);
  const pos = (t) => db.kb_tarjetas.find((c) => c.titulo === t).posicion;
  ok(pos('F-A') > pos('F-B') && pos('F-A') < pos('F-C'), 'A debe quedar entre B y C: ' + [pos('F-B'), pos('F-A'), pos('F-C')]);
  ok(pos('F-H1') < pos('F-B') && pos('F-H2') < pos('F-B'), 'las ocultas no se mueven de sitio');
});
await step('«Quedó de ayer»: lo no terminado se ofrece mantener o quitar', async () => {
  const yest = new Date(Date.now() - 864e5); const k = yest.getFullYear() + '-' + String(yest.getMonth() + 1).padStart(2, '0') + '-' + String(yest.getDate()).padStart(2, '0');
  const h1 = db.kb_tarjetas.find((c) => c.titulo === 'F-H1'); h1.hoy_fecha = k; h1.estado = 'pendiente';
  await page.reload(); await page.waitForSelector('.apk-head');
  await page.click('.apk-seg-btn:has-text("Hoy")');
  ok(await page.isVisible('.apk-block:has-text("Quedó de ayer")'), 'sin bloque');
  await page.click('.apk-block:has-text("Quedó de ayer") button:has-text("Quitar")');
  await page.waitForTimeout(150);
  eq(db.kb_tarjetas.find((c) => c.titulo === 'F-H1').hoy_fecha, null, 'hoy_fecha en servidor');
});
await step('Captura rápida desde Hoy crea una idea', async () => {
  await page.fill('.apk-capture input', 'Idea desde captura'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.apk-toast')?.textContent.includes('Ideas'));
  const c = db.kb_tarjetas.find((x) => x.titulo === 'Idea desde captura');
  ok(c && c.estado === 'ideas' && c.tipo === 'idea', 'no se creó como idea');
});
await step('El aprendizaje se anota desde el aviso y se ve en la tarjeta de Hecho', async () => {
  await goBoard(page);
  const t = (await titles(page, 'pendiente'))[0] || (await titles(page, 'en_curso'))[0];
  const est = db.kb_tarjetas.find((c) => c.titulo === t).estado;
  await page.click(cardSel(t) + ' .apk-card-open'); await page.selectOption('#apk-d-e', 'hecho');
  await page.click('dialog[open] button[type="submit"]'); await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.click(cardSel(t) + ' .apk-card-open');
  await page.fill('#apk-d-a', 'Aprendí a probar con datos simulados');
  await page.click('dialog[open] button[type="submit"]'); await page.waitForSelector('dialog[open]', { state: 'detached' });
  ok((await page.textContent(cardSel(t))).includes('Aprendí a probar'), 'la tarjeta no muestra el aprendizaje (' + est + ')');
});
await step('Sin errores de JavaScript', async () => { eq(errors, [], 'errores de consola'); });
await step('Accesibilidad (axe, WCAG 2 A/AA) en Tablero y Hoy', async () => {
  for (const v of ['Tablero', 'Hoy']) {
    await page.click(`.apk-seg-btn:has-text("${v}")`);
    await page.addScriptTag({ content: AXE });
    const res = await page.evaluate(async () => (await axe.run('.apk', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map((x) => x.id + ': ' + x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')));
    eq(res, [], 'axe en ' + v);
  }
});
if (process.env.SHOTS) {          // capturas para revisar la jerarquía visual: SHOTS=carpeta node tools/check-kanban.mjs
  for (const v of ['Hoy', 'Tablero']) { await page.click(`.apk-seg-btn:has-text("${v}")`); await page.waitForTimeout(200); await page.screenshot({ path: join(process.env.SHOTS, v.toLowerCase() + '.png'), fullPage: true }); }
}
await ctx.close();

await step('Móvil: una columna con selector de estado, sin desbordar', async () => {
  const m = await open({ width: 390, height: 844 });
  await goBoard(m.page);
  ok(await m.page.isVisible('.apk-coltabs'), 'sin selector de columnas');
  const visible = await m.page.$$eval('.apk-col', (cs) => cs.filter((c) => c.offsetParent !== null).length);
  eq(visible, 1, 'columnas visibles');
  await m.page.click('.apk-coltab:has-text("Pendiente")');
  eq(await m.page.$$eval('.apk-col', (cs) => cs.filter((c) => c.offsetParent !== null).map((c) => c.dataset.estado)), ['pendiente']);
  eq(await m.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'scroll horizontal de página');
  if (process.env.SHOTS) await m.page.screenshot({ path: join(process.env.SHOTS, 'movil.png') });
  await m.ctx.close();
});

await step('Permisos: sin sesión no se pide nada a las tablas kb_*', async () => {
  const before = log.length;
  const c2 = await browser.newContext({ bypassCSP: true });
  await c2.route(/supabase\.co/, route);
  const p2 = await c2.newPage();
  const reqs = [];
  p2.on('request', (r) => { if (/kb_/.test(r.url())) reqs.push(r.url()); });
  await p2.goto(BASE); await p2.waitForTimeout(800);
  eq(reqs, [], 'peticiones a kb_* sin sesión'); eq(log.length, before);
  await c2.close();
});

await browser.close(); server.close();
for (const [s, n] of results) console.log(s + ' ' + n);
console.log(`\n${results.length - failed}/${results.length} correctas · ${writes} escrituras simuladas`);
process.exit(failed ? 1 : 0);
