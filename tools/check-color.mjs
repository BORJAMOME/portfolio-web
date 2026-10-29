/* ═══════════════════════════════════════════════
   tools/check-color.mjs: prueba de la interfaz de Color Studio
     npm i --no-save playwright axe-core && npx playwright install chromium
     node tools/check-color.mjs            (COLOR_SHOTS=<carpeta> guarda capturas)
   Sirve el sitio en local y sustituye Supabase por un PostgREST y un Storage en memoria
   (solo cs_* y el bucket «armario»). NO toca la base real. Recorre: navegación, vacíos, modo ejemplo,
   paletas (crear, validar, duplicados, importar), armario (color a mano y foto), Studio (pesos,
   distribución que suma 100, ajuste manual, referencias, guardar), recarga, calcetines,
   direcciones (lectura, comparar, aplicar y volver al original, hipotéticos), paletas como inspiración,
   calcetines dentro del Studio y tipo de calzado,
   errores de guardado, sesión caducada, tablas sin crear, móvil sin scroll horizontal, axe y CSP real.
   Inspiración: alta con enlace (función inspiracion-meta simulada) e imagen, sin enlace, con la lectura caída, con la
   extracción fallida; paleta, clasificación, estilos nuevos, colecciones, búsqueda, filtros, favoritas, notas, duplicados,
   borrar (con sus fotos), recarga, aislamiento entre usuarios (RLS simulada), «Usar en Studio», móvil, axe y CSP.
   ═══════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';
import * as E from '../color-studio/engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const f = join(ROOT, p);
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const BASE = `http://localhost:${server.address().port}/area-privada.html`;

/* ── Supabase en memoria ── */
let seq = 0;
const uid = () => '00000000-0000-4000-8000-' + String(++seq).padStart(12, '0');
const db = { cs_garments: [], cs_palettes: [], cs_outfits: [], cs_inspirations: [], ap_opciones: [] };
['Casual', 'Smart casual', 'Formal', 'Minimalista', 'Streetwear', 'Workwear', 'Deportivo'].forEach((v, i) => db.ap_opciones.push({ id: 'op-' + i, grupo: 'inspiracion.estilo', valor: v, posicion: i + 1 }));
const USER_A = 'aaaaaaaa-0000-4000-8000-000000000001', USER_B = 'bbbbbbbb-0000-4000-8000-000000000002';
let currentUser = USER_A, inspMissing = false, fnMode = 'ok', fnImage = null;   // fnMode: ok | missing | blocked | noimage
const objects = new Map();                     // ruta en el bucket → { body, type }
let failWrites = false, missing = false, unauth = false, readDelay = 0;
const SEASON_IDS = ['primavera', 'verano', 'otono', 'invierno', 'entretiempo'];
const log = [];
const HEX = /^#[0-9A-F]{6}$/;
const CATS = ['camisetas', 'camisas', 'jerseis', 'chaquetas', 'pantalones', 'vaqueros', 'calzado', 'calcetines', 'accesorios'];
function check(t, r) {                         // lo esencial de los checks de supabase/color-studio.sql
  if (t === 'cs_garments') {
    if (!CATS.includes(r.category)) return 'category';
    if (!HEX.test(r.primary_color || '')) return 'primary_color';
    if ((r.secondary_colors || []).some((x) => !HEX.test(x))) return 'secondary_colors';
  }
  if (t === 'cs_palettes') {
    if (!Array.isArray(r.colors) || !r.colors.length || r.colors.length > 12 || r.colors.some((c) => !HEX.test(c.hex || ''))) return 'colors';
    if (r.source_url && !/^https?:\/\//i.test(r.source_url)) return 'source_url';
  }
  if (t === 'cs_inspirations') {               // lo esencial de supabase/color-studio-inspiracion.sql
    if (!Array.isArray(r.palette) || r.palette.length > 12 || r.palette.some((c) => !HEX.test(c.hex || '') || ('weight' in c && (typeof c.weight !== 'number' || c.weight < 0 || c.weight > 100)) ||
      ('label' in c && c.label !== null && (typeof c.label !== 'string' || c.label.length > 60)) || ('source' in c && !['manual', 'auto'].includes(c.source)))) return 'palette';
    if (!Array.isArray(r.suggestions) || r.suggestions.length > 8 || r.suggestions.some((c) => !HEX.test(c.hex || '') || typeof c.weight !== 'number')) return 'suggestions';
    if (!['none', 'auto', 'reviewed', 'failed'].includes(r.palette_status)) return 'palette_status';
    if ((r.seasons || []).some((x) => !SEASON_IDS.includes(x))) return 'seasons';
    if (r.source_url && !/^https?:\/\//i.test(r.source_url)) return 'source_url';
    if (r.rating != null && !(r.rating >= 1 && r.rating <= 5)) return 'rating';
    if (r.image_hash != null && !/^[0-9a-f]{16}$/.test(r.image_hash)) return 'image_hash';
  }
  if (t === 'cs_outfits') {
    if (!r.name) return 'name';
    if (!Array.isArray(r.items) || r.items.some((i) => !i.slot || i.weight < 0 || (!i.garment_id && !HEX.test(i.hex || '')))) return 'items';
  }
  return null;
}
const DEFAULT_ROW = {
  cs_garments: { name: null, subcategory: null, image_path: null, secondary_colors: [], color_shares: null, pattern: 'liso', material: null, notes: null },
  cs_palettes: { name: null, tags: [], source_type: 'own', source_title: null, source_url: null, source_notes: null, notes: null, is_favorite: false },
  cs_outfits: { items: [], palette_id: null, distribution_override: null, occasion: null, formality: null, notes: null, is_favorite: false },
  cs_inspirations: { title: null, source_url: null, source_name: null, published_on: null, image_path: null, thumb_path: null, image_hash: null, description: null, notes: null,
    styles: [], collections: [], seasons: [], rating: null, is_favorite: false, palette: [], suggestions: [], palette_status: 'none', palette_id: null },
  ap_opciones: { posicion: 0 }
};
const OWNED = new Set(['cs_inspirations']);   // RLS simulada: owner = auth.uid() (la pone la base, no el navegador)
function matches(row, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (v.startsWith('eq.') && String(row[k]) !== v.slice(3)) return false;
  }
  return true;
}
async function route(r) {
  const req = r.request(), url = new URL(req.url()), method = req.method();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const json = (status, body) => r.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (/\/auth\/v1\/token/.test(url.pathname)) return unauth ? json(400, { error: 'invalid_grant' }) : json(200, { access_token: 'x', refresh_token: 'y', expires_in: 3600 });
  if (unauth) return json(401, { message: 'JWT expired' });
  if (/\/auth\/v1\/user$/.test(url.pathname)) return json(200, { id: currentUser, email: 'x@ejemplo.org' });
  if (/\/functions\/v1\/inspiracion-meta$/.test(url.pathname)) {
    const b = JSON.parse(req.postData() || '{}');
    log.push('FN ' + b.action + ' ' + b.url);
    if (fnMode === 'missing') return json(404, { message: 'Function not found' });
    if (fnMode === 'blocked') return json(422, { error: 'La página responde 403' });
    if (b.action === 'meta') return json(200, { title: 'Look de prueba E2E', siteName: 'Revista Prueba', image: fnMode === 'noimage' ? null : 'https://cdn.ejemplo.org/look.png', published: '2026-03-02', description: 'Descripción de prueba', url: b.url });
    return r.fulfill({ status: 200, headers: cors, contentType: 'image/png', body: fnImage });
  }
  const so = /\/storage\/v1\/object\/(?:authenticated\/)?armario\/?(.*)$/.exec(url.pathname);
  if (so) {
    const path = decodeURIComponent(so[1]);
    const seg = path.split('/');
    if (seg[0] === 'inspiracion' && seg[1] !== currentUser && method !== 'DELETE') return json(403, { message: 'new row violates row-level security policy' });
    if (method === 'GET') { const o = objects.get(path); return o ? r.fulfill({ status: 200, headers: cors, contentType: o.type, body: o.body }) : json(404, { message: 'Object not found' }); }
    if (failWrites) return json(500, { message: 'Fallo simulado de guardado' });
    if (method === 'POST') { log.push('UPLOAD ' + path); objects.set(path, { body: req.postDataBuffer(), type: req.headers()['content-type'] }); return json(200, { Key: 'armario/' + path }); }
    if (method === 'DELETE') { const { prefixes } = JSON.parse(req.postData()); prefixes.forEach((p) => objects.delete(p)); log.push('DELETE-OBJ ' + prefixes.join(',')); return json(200, []); }
  }
  const m = /\/rest\/v1\/(\w+)/.exec(url.pathname);
  if (!m) return json(200, {});
  const t = m[1];
  if (!(t in db)) return json(200, []);
  if (missing || (inspMissing && t === 'cs_inspirations')) return json(404, { code: 'PGRST205', message: 'Could not find the table' });
  const all = db[t], params = [...url.searchParams.entries()];
  const rows = OWNED.has(t) ? all.filter((x) => x.owner === currentUser) : all;
  if (method === 'GET') { if (readDelay) await new Promise((res) => setTimeout(res, readDelay)); return json(200, rows.filter((x) => matches(x, params))); }
  log.push(method + ' ' + t);
  if (failWrites) return json(500, { message: 'Fallo simulado de guardado' });
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const now = new Date().toISOString();
  if (method === 'POST') {
    if (OWNED.has(t) && [].concat(body).some((b) => b.owner && b.owner !== currentUser)) return json(403, { message: 'new row violates row-level security policy' });
    const list = [].concat(body).map((b) => Object.assign({ id: uid(), created_at: now, updated_at: now }, DEFAULT_ROW[t], OWNED.has(t) ? { owner: currentUser } : {}, b));
    const bad = list.map((x) => check(t, x)).find(Boolean);
    if (bad) return json(400, { message: 'violates check constraint (' + bad + ')' });
    all.push(...list);
    return json(201, list);
  }
  const hit = rows.filter((x) => matches(x, params));
  if (method === 'PATCH') {
    const bad = hit.map((x) => check(t, Object.assign({}, x, body))).find(Boolean);
    if (bad) return json(400, { message: 'violates check constraint (' + bad + ')' });
    hit.forEach((x) => Object.assign(x, body, { updated_at: now }));
    return json(200, hit);
  }
  if (method === 'DELETE') {
    hit.forEach((x) => all.splice(all.indexOf(x), 1));
    if (t === 'cs_palettes') db.cs_outfits.forEach((o) => { if (hit.some((x) => x.id === o.palette_id)) o.palette_id = null; });
    return json(204, null);
  }
  return json(400, {});
}

/* ── Utilidades ── */
const browser = await chromium.launch();
let failed = 0;
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['✔', name]); } catch (e) { failed++; results.push(['✖', name + ' → ' + e.message.split('\n')[0]]); }
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'distinto') + ': esperado ' + JSON.stringify(b) + ', recibido ' + JSON.stringify(a)); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const shot = async (page, name) => { if (process.env.COLOR_SHOTS) await page.screenshot({ path: join(process.env.COLOR_SHOTS, name + '.png'), fullPage: true }); };

async function open(viewport, hash, realCsp, motion) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 1000 }, bypassCSP: !realCsp, hasTouch: !!(viewport && viewport.width < 600), reducedMotion: motion ? 'no-preference' : 'reduce' });
  await ctx.route(/googletagmanager|google-analytics|fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await ctx.route(/supabase\.co/, route);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('bm_ap_session', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'borja.mora.mendez@gmail.com' })); } catch (e) { /* noop */ }
  });
  await ctx.addInitScript(() => {          // momento (ms desde la navegación) en que se retira la intro
    new MutationObserver((list) => { list.forEach((m) => m.removedNodes.forEach((n) => { if (n.classList && n.classList.contains('csi')) window.__csiGone = performance.now(); })); })
      .observe(document, { childList: true, subtree: true });
  });
  await ctx.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); }); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + (hash || '#/color'));
  await page.waitForSelector('.cs, .apl, .ap-view > *, #ap-lock:not([hidden])');
  return { ctx, page, errors };
}
async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
  const v = r.violations.map((x) => x.id + ' (' + x.nodes.length + '): ' + x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | '));
  if (v.length) throw new Error(label + ': ' + v.join('; '));
}
const go = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(250); };
const toastText = (page) => page.textContent('.cs-toast');
const submit = (page) => page.click('dialog[open] button[type="submit"]');
const dialogMsg = (page) => page.textContent('dialog[open] .ap-msg');
const pcts = (page) => page.$$eval('.cs-dist .cs-pct', (els) => els.map((e) => parseInt(e.textContent, 10)));
async function fillPalette(page, name, hexes) {
  await page.click('[data-key="new-pal"]');
  await page.waitForSelector('dialog[open] #cs-p-name');
  await page.fill('#cs-p-name', name);
  for (let i = 0; i < hexes.length; i++) {
    if (i >= 3) await page.click('dialog[open] .cs-link:has-text("Añadir color")');
    await page.fill('#cs-pc-' + i, hexes[i]);
  }
}
async function pngOf(page, w, h, fill) {     // genera una imagen en el propio navegador
  const b64 = await page.evaluate(({ w, h, fill }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#F0F0EE'; x.fillRect(0, 0, w, h);
    x.fillStyle = fill; x.fillRect(w * 0.2, h * 0.15, w * 0.6, h * 0.7);
    return c.toDataURL('image/png').split(',')[1];
  }, { w, h, fill });
  return { name: 'prenda.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

/* ═══════════ FLUJOS ═══════════ */
const { page, ctx, errors } = await open();

await step('Navegación: modo app en #/color (sin cabecera, pestañas ni pie del área privada) y cinco secciones', async () => {
  for (const sel of ['.ap-top', '.ap-tabs', '.ap-foot', '#ap-logout']) ok(await page.isHidden(sel), sel + ' visible dentro de la app');
  eq(await page.getAttribute('#ap-appbar-back', 'href'), '#/apps');
  ok(await page.isVisible('#ap-appbar-back'), 'sin «Volver al área privada»');
  eq(await page.$$eval('.cs-nav a', (a) => a.map((x) => x.textContent.trim())), ['Studio', 'Inspiración', 'Biblioteca', 'Armario', 'Calcetines']);
  eq(await page.getAttribute('.cs-nav a[href="#/color"]', 'aria-current'), 'page');
  eq(await page.textContent('#ap-app-title'), 'Color Studio');
});
await step('Fondo #FBFBFB solo en Color Studio', async () => {
  eq(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(251, 251, 251)');
});
await step('Vacío: el Studio invita a añadir prendas o probar el modo ejemplo', async () => {
  ok((await page.textContent('.cs-body')).includes('Tu armario está vacío'), 'sin estado vacío');
  ok((await page.textContent('.cs-compose')).includes('Elige al menos una prenda'), 'sin vacío en composición');
  await shot(page, '01-studio-vacio');
});
await step('Modo ejemplo: se señala, no escribe nada y se puede salir', async () => {
  await page.click('.cs-body button:has-text("Ver con datos de ejemplo")');
  await page.waitForSelector('.cs-demo');
  await go(page, '#/color/biblioteca');
  eq(await page.$$eval('.cs-pal', (e) => e.length), 4);
  ok((await page.textContent('.cs-demo')).includes('no proceden de ningún libro'), 'aviso de procedencia');
  await page.click('[data-key="new-pal"]');
  ok((await toastText(page)).includes('Modo ejemplo'), 'sin aviso de bloqueo');
  eq(await page.$('dialog[open]'), null, 'abrió un formulario en modo ejemplo');
  await go(page, '#/color');
  await page.click('[data-key="pick-bottom"]');
  await page.click('dialog[open] .cs-pick-b:has-text("Chino marino")');
  await page.waitForSelector('.cs-dist');
  eq(log.length, 0, 'escrituras en modo ejemplo');
  await page.click('.cs-demo .cs-link');
  await page.waitForSelector('.cs:not(:has(.cs-demo))');
  ok(!(await page.$('.cs-dist')), 'el borrador del ejemplo se quedó en los datos reales');
});

await step('Paleta: crear con 3 colores, origen web y enlace; el HEX se normaliza y se conserva el original', async () => {
  await go(page, '#/color/biblioteca');
  ok((await page.textContent('.cs-body')).includes('Todavía no hay paletas'), 'sin vacío en biblioteca');
  await fillPalette(page, 'Otoño urbano', ['1f2a44', '#B48A5A', '#f4f2ec']);
  await page.fill('#cs-p-tags', 'Otoño, neutros');
  await page.selectOption('#cs-p-type', 'web');
  await page.fill('#cs-p-url', 'javascript:alert(1)');
  await submit(page);
  await page.waitForFunction(() => /enlace/i.test(document.querySelector('dialog[open] .ap-msg').textContent));
  eq(db.cs_palettes.length, 0, 'guardó con un enlace no válido');
  await page.fill('#cs-p-url', 'https://ejemplo.org/paleta');
  await submit(page);
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const p = db.cs_palettes[0];
  eq(p.colors.map((c) => c.hex), ['#1F2A44', '#B48A5A', '#F4F2EC']);
  eq(p.colors[0].original, '1f2a44');
  eq(p.tags, ['otoño', 'neutros']);
  eq(p.source_type, 'web');
  ok((await toastText(page)).includes('Paleta guardada'), 'sin confirmación');
  eq(await page.$$eval('.cs-pal', (e) => e.length), 1);
});
await step('Paleta: duplicado idéntico bloqueado; HEX no válido señalado', async () => {
  await fillPalette(page, 'Repetida', ['#1F2A44', '#B48A5A', '#F4F2EC']);
  await submit(page);
  await page.waitForFunction(() => /Ya tienes una paleta/.test(document.querySelector('dialog[open] .ap-msg').textContent));
  await page.fill('#cs-pc-1', '#12');
  await submit(page);
  await page.waitForFunction(() => /no es un HEX válido/.test(document.querySelector('dialog[open] .ap-msg').textContent));
  await page.click('dialog[open] button:has-text("Cancelar")');
  eq(db.cs_palettes.length, 1);
});
await step('Importar: JSON malformado da error claro; uno válido se revisa (duplicados) antes de importar', async () => {
  await page.click('.cs-actions button:has-text("Importar")');
  await page.setInputFiles('#cs-imp-file', { name: 'mal.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
  await page.waitForFunction(() => /No es un JSON válido/.test(document.querySelector('dialog[open] .ap-msg').textContent));
  const file = JSON.stringify([
    { name: 'Copia exacta', colors: ['#1F2A44', '#B48A5A', '#F4F2EC'] },
    { name: 'Dos', colors: ['#5E6B3A', '#B9AE96'] },
    { name: 'Cuatro', colors: ['#6B1F2A', '#9A9A97', '#2E3F5C', '#C9A23A'], tags: ['contraste'] },
    { name: 'Cinco', colors: ['#A9C1DC', '#1F2A44', '#F2F1EE', '#B8B09B', '#6E2230'], source_type: 'book', source_title: 'Libro de prueba, p. 1' },
    { name: 'Rota', colors: ['nada'] }
  ]);
  await page.setInputFiles('#cs-imp-file', { name: 'paletas.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await page.waitForSelector('.cs-imp');
  ok((await page.textContent('.cs-imp')).includes('Idéntica a «Otoño urbano»'), 'no marca el duplicado');
  eq(await page.$$eval('.cs-imp input', (e) => e.map((x) => x.checked)), [false, true, true, true, false]);
  await page.click('dialog[open] .cs-sheet-actions .btn-primary');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  eq(db.cs_palettes.length, 4);
  ok((await toastText(page)).includes('3 paletas importadas'), 'sin confirmación de importación');
});
await step('Biblioteca: filtros por número de colores, origen y favoritas', async () => {
  await page.click('.cs-seg-b[aria-label="2 colores"]');
  eq(await page.$$eval('.cs-pal-n', (e) => e.map((x) => x.textContent)), ['Dos']);
  await page.click('.cs-seg-b[aria-label="Todas las paletas"]');
  await page.selectOption('#cs-f-src', 'book');
  eq(await page.$$eval('.cs-pal-n', (e) => e.map((x) => x.textContent)), ['Cinco']);
  await page.selectOption('#cs-f-src', '');
  await page.click('.cs-pal:has-text("Cuatro") .cs-fav');
  await page.waitForFunction(() => document.querySelector('.cs-pal:has(.cs-pal-n) .cs-fav.is-on'));
  ok(db.cs_palettes.find((p) => p.name === 'Cuatro').is_favorite, 'favorita no guardada');
  await page.check('.cs-filters .cs-check input');
  eq(await page.$$eval('.cs-pal-n', (e) => e.map((x) => x.textContent)), ['Cuatro']);
  await page.uncheck('.cs-filters .cs-check input');
  await shot(page, '02-biblioteca');
});
await step('Detalle de paleta: procedencia, enlace seguro y duplicar', async () => {
  await page.click('.cs-pal-open:has-text("Otoño urbano")');
  await page.waitForSelector('dialog[open] .cs-swatches');
  eq(await page.getAttribute('dialog[open] .cs-prov a', 'href'), 'https://ejemplo.org/paleta');
  eq(await page.getAttribute('dialog[open] .cs-prov a', 'rel'), 'noopener noreferrer');
  ok((await page.textContent('dialog[open] .cs-swatches')).includes('Registrado como «1f2a44»'), 'no muestra el original');
  await page.click('dialog[open] button:has-text("Duplicar")');
  await page.waitForSelector('dialog[open] #cs-p-name');
  eq(await page.inputValue('#cs-p-name'), 'Otoño urbano (copia)');
  await page.click('dialog[open] button:has-text("Cancelar")');
});

await step('Armario: prenda con color a mano (sin foto); la categoría es obligatoria', async () => {
  await go(page, '#/color/armario');
  await page.click('[data-key="new-garment"]');
  await page.waitForSelector('dialog[open] #cs-g-cat');
  await page.fill('#cs-g-primary', '#1f2a44');
  await submit(page);
  await page.waitForFunction(() => /categoría/i.test(document.querySelector('dialog[open] .ap-msg').textContent));
  await page.selectOption('#cs-g-cat', 'pantalones');
  await page.fill('#cs-g-name', 'Chino marino');
  await submit(page);
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  eq(db.cs_garments[0].primary_color, '#1F2A44');
  eq(db.cs_garments[0].image_path, null);
});
await step('Armario: foto → vista previa, colores propuestos, corrección y subida privada', async () => {
  await page.click('[data-key="new-garment"]');
  await page.waitForSelector('dialog[open] #cs-g-cat');
  await page.selectOption('#cs-g-cat', 'calzado');
  await page.setInputFiles('dialog[open] .cs-photo-act label:has-text("Elegir imagen") input', await pngOf(page, 600, 800, '#4A2E1F'));
  await page.waitForSelector('dialog[open] .cs-photo img');
  await page.waitForSelector('dialog[open] .cs-prop-row');
  const proposed = await page.inputValue('#cs-g-primary');
  ok(proposed && proposed !== '', 'no propone color principal');
  await page.fill('#cs-g-primary', '#4A2E1F');                     // corrección manual
  await page.click('dialog[open] .cs-link:has-text("Añadir color secundario")');
  await page.fill('#cs-g-sec-0', '#F0F0EE');
  await page.fill('#cs-g-name', 'Bota marrón');
  await submit(page);
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const g = db.cs_garments.find((x) => x.name === 'Bota marrón');
  ok(g && g.image_path && /^prendas\/.+\.(webp|jpg)$/.test(g.image_path), 'sin ruta de foto: ' + (g && g.image_path));
  ok(objects.has(g.image_path), 'la foto no se subió');
  ok(/image\/(webp|jpeg)/.test(objects.get(g.image_path).type), 'tipo de la foto subida: ' + objects.get(g.image_path).type);
  eq(g.primary_color, '#4A2E1F');
  eq(g.secondary_colors, ['#F0F0EE']);
  await page.waitForSelector('.cs-garment:has-text("Bota marrón") img');
  await shot(page, '03-armario');
});
await step('Armario: quitar la foto la borra del bucket; eliminar la prenda también', async () => {
  const g = db.cs_garments.find((x) => x.name === 'Bota marrón'), path = g.image_path;
  await page.click('.cs-garment-b:has-text("Bota marrón")');
  await page.waitForSelector('dialog[open] .cs-photo img');
  await page.click('dialog[open] button:has-text("Quitar foto")');
  await submit(page);
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.waitForTimeout(200);
  eq(db.cs_garments.find((x) => x.id === g.id).image_path, null);
  ok(!objects.has(path), 'la foto anterior sigue en el bucket');
  // añadir y eliminar una prenda con foto
  await page.click('[data-key="new-garment"]');
  await page.selectOption('#cs-g-cat', 'camisetas');
  await page.setInputFiles('dialog[open] .cs-photo-act label:has-text("Elegir imagen") input', await pngOf(page, 300, 300, '#9A9A97'));
  await page.waitForSelector('dialog[open] .cs-prop-row');
  await page.fill('#cs-g-name', 'Camiseta de prueba');
  await submit(page);
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const t = db.cs_garments.find((x) => x.name === 'Camiseta de prueba');
  ok(objects.has(t.image_path), 'no se subió');
  await page.click('.cs-garment-b:has-text("Camiseta de prueba")');
  await page.click('dialog[open] button:has-text("Eliminar prenda")');
  await page.click('#ap-dialog-ok');
  await page.waitForFunction(() => !document.querySelector('.cs-garment-b') || ![...document.querySelectorAll('.cs-slot-n')].some((e) => e.textContent === 'Camiseta de prueba'));
  await page.waitForTimeout(200);
  ok(!db.cs_garments.some((x) => x.id === t.id), 'la prenda sigue');
  ok(!objects.has(t.image_path), 'la foto sigue en el bucket');
});

await step('CS-17: cuentagotas sobre la foto con puntero y con teclado; el color se lleva al principal', async () => {
  await go(page, '#/color/armario');
  await page.click('[data-key="new-garment"]');
  await page.waitForSelector('dialog[open] #cs-g-cat');
  ok(await page.isHidden('[data-key="eyedropper"]'), 'cuentagotas sin foto');
  ok((await page.textContent('dialog[open] .cs-photo-field')).includes('balance de blancos'), 'sin consejo de captura');
  await page.setInputFiles('dialog[open] .cs-photo-act label:has-text("Elegir imagen") input', await pngOf(page, 600, 800, '#4A2E1F'));
  await page.waitForSelector('dialog[open] .cs-prop-row');
  await page.click('[data-key="eyedropper"]');
  await page.waitForSelector('[data-key="pick-area"]');
  eq(await page.getAttribute('[data-key="eyedropper"]', 'aria-pressed'), 'true');
  eq(await page.evaluate(() => document.activeElement && document.activeElement.dataset.key), 'pick-area', 'el foco no pasa a la foto');
  await page.keyboard.press('Enter');                                     // centro: la prenda
  await page.waitForSelector('.cs-pick-out .cs-hex');
  eq(await page.textContent('.cs-pick-out .cs-hex'), '#4A2E1F');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');   // x = 0,1: el fondo
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.cs-pick-out .cs-hex').textContent === '#F0F0EE');
  await page.click('[data-key="pick-primary"]');
  eq(await page.inputValue('#cs-g-primary'), '#F0F0EE');
  const box = await page.$eval('[data-key="pick-area"] img', (i) => { const r = i.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  ok(Math.abs(box.w / box.h - 600 / 800) < 0.02, 'la foto se recorta en modo cuentagotas: ' + JSON.stringify(box));
  await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.5);       // puntero: la prenda
  await page.waitForFunction(() => document.querySelector('.cs-pick-out .cs-hex').textContent === '#4A2E1F');
  await shot(page, '10-cuentagotas');
  await axe(page, 'formulario con cuentagotas');
  await page.click('[data-key="eyedropper"]');
  await page.waitForSelector('dialog[open] .cs-photo img:not([alt=""])');
  await page.click('dialog[open] button:has-text("Cancelar")');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
});
await step('Studio: pantalón y calzado del armario + parte superior con color provisional', async () => {
  await go(page, '#/color');
  await page.click('[data-key="pick-bottom"]');
  await page.click('dialog[open] .cs-pick-b:has-text("Chino marino")');
  await page.click('[data-key="pick-shoes"]');
  await page.click('dialog[open] .cs-pick-b:has-text("Bota marrón")');
  await page.click('[data-key="pick-top"]');
  await page.fill('#cs-pick-hex', '#F4F2EC');
  await page.click('dialog[open] button:has-text("Usar este color")');
  await page.waitForSelector('.cs-dist');
  const p = await pcts(page);
  eq(p.reduce((a, b) => a + b, 0), 100, 'la distribución no suma 100');
  // pesos 30 / 35 / 10 (suma 75) → 40 % / 46,7 % / 13,3 %
  const surf = await page.$$eval('.cs-surf li', (e) => e.map((x) => x.textContent));
  eq(surf, ['Parte superior40 %', 'Pantalón47 %', 'Calzado13 %']);
  await shot(page, '04-studio');
});
await step('Studio: editar un peso recalcula todo; pesos negativos avisan sin romper', async () => {
  await page.fill('#cs-w-bottom', '60');
  await page.press('#cs-w-bottom', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.cs-surf li')].some((e) => e.textContent === 'Pantalón60 %'));
  eq((await pcts(page)).reduce((a, b) => a + b, 0), 100);
  await page.fill('#cs-w-top', '-5');
  await page.press('#cs-w-top', 'Enter');
  await page.waitForSelector('.cs-compose .cs-warn');
  ok((await page.textContent('.cs-compose .cs-warn')).includes('negativo'), 'sin aviso de peso negativo');
  eq((await pcts(page)).reduce((a, b) => a + b, 0), 100);
  await page.fill('#cs-w-top', '30');
  await page.press('#cs-w-top', 'Enter');
  await page.fill('#cs-w-bottom', '35');
  await page.press('#cs-w-bottom', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.cs-surf li')].some((e) => e.textContent === 'Pantalón47 %'));
});
await step('Studio: ajuste manual mantiene el 100 % y se puede volver a la estimación', async () => {
  await page.click('.cs-details summary:has-text("Ajustar la distribución")');
  const id = await page.getAttribute('.cs-slider input', 'id');
  await page.evaluate((id) => { const r = document.getElementById(id); r.value = '70'; r.dispatchEvent(new Event('change')); }, id);
  await page.waitForSelector('.cs-badge--manual');
  const p = await pcts(page);
  eq(p[0], 70);
  eq(p.reduce((a, b) => a + b, 0), 100);
  await page.click('[data-key="reset-manual"]');
  await page.waitForSelector('.cs-badge--est');
});
await step('Studio: referencias compatibles distinguen exacta/aproximada y se elige una', async () => {
  const refs = await page.textContent('.cs-refs');
  ok(refs.includes('Otoño urbano'), 'no aparece la paleta con colores idénticos');
  ok(/Coincidencia (exacta|aproximada)/.test(refs), 'sin tipo de coincidencia');
  ok(refs.includes('Pantalón (#1F2A44) es idéntico'), 'sin explicación de la conexión');
  ok(refs.includes('En el conjunto: pantalón'), 'sin adaptación de la paleta al conjunto');
  await page.click('.cs-ref:has-text("Otoño urbano") [data-key^="ref-"]');
  eq(await page.getAttribute('.cs-ref:has-text("Otoño urbano") [data-key^="ref-"]', 'aria-pressed'), 'true');
});
await step('Studio: guardar el outfit (la confirmación llega después de guardar)', async () => {
  await page.click('[data-key="save-outfit"]');
  await page.waitForSelector('dialog[open] #cs-o-name');
  await submit(page);
  await page.waitForFunction(() => /nombre/i.test(document.querySelector('dialog[open] .ap-msg').textContent));
  await page.fill('#cs-o-name', 'Lunes de oficina');
  await page.selectOption('#cs-o-form', 'smart');
  await submit(page);
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const o = db.cs_outfits[0];
  eq(o.name, 'Lunes de oficina');
  eq(o.items.map((i) => i.slot).sort(), ['bottom', 'shoes', 'top']);
  ok(o.items.find((i) => i.slot === 'top').hex === '#F4F2EC', 'el color provisional no se guardó');
  eq(o.palette_id, db.cs_palettes.find((p) => p.name === 'Otoño urbano').id);
  eq(o.distribution_override, null);
  ok((await page.textContent('.cs-outfits')).includes('Lunes de oficina'), 'no aparece en Mis outfits');
});
await step('Persistencia: tras recargar siguen prendas, paletas, outfit y el borrador', async () => {
  await page.reload();
  await page.waitForSelector('.cs-dist');
  ok((await page.textContent('.cs-outfits')).includes('Lunes de oficina'), 'outfit perdido');
  ok((await page.textContent('.cs-slots')).includes('Chino marino'), 'borrador perdido');
  await go(page, '#/color/biblioteca');
  eq(await page.$$eval('.cs-pal', (e) => e.length), 4);
});

await step('Calcetines: tres propuestas explicadas; formal pone la continuidad primero', async () => {
  await go(page, '#/color/calcetines');
  await page.waitForSelector('.cs-propcard');
  eq(await page.$$eval('.cs-propcard', (e) => e.length), 3);
  const exps = await page.$$eval('.cs-prop-exp', (e) => e.map((x) => x.textContent));
  ok(exps.every((t) => t.length > 30), 'explicaciones vacías');
  const cols = await page.$$eval('.cs-propcard .cs-hex', (e) => e.map((x) => x.textContent));
  eq(new Set(cols).size, 3, 'propuestas repetidas');
  ok((await page.textContent('.cs-propcard')).includes('Contraste: pantalón'), 'sin nivel de contraste frente al pantalón');
  await page.click('[data-key="form-formal"]');
  await page.waitForFunction(() => document.querySelector('.cs-propcard .cs-eyebrow').textContent === 'Continuidad');
  ok((await page.textContent('.cs-propcard')).includes('pantalón'), 'la continuidad no sigue al pantalón');
  await page.click('[data-key="dir-creative"]');
  eq(await page.textContent('.cs-propcard .cs-eyebrow'), 'Continuidad');           // formal manda sobre la dirección
  await page.click('[data-key="form-casual"]');
  await page.waitForFunction(() => document.querySelector('.cs-propcard .cs-eyebrow').textContent === 'Contraste');
  await shot(page, '05-calcetines');
  await page.click('.cs-propcard:nth-child(3) .cs-btn-s');
  ok(/Calcetín .*añadido/.test(await toastText(page)), 'sin confirmación');
  eq(await page.getAttribute('.cs-propcard:nth-child(3) .cs-btn-s', 'aria-pressed'), 'true');
  await go(page, '#/color');
  ok((await page.textContent('.cs-slot:has-text("Calcetines")')).includes('Color a mano') || (await page.textContent('.cs-slot:has-text("Calcetines")')).includes('Calcetín'), 'el calcetín no llegó al Studio');
});
await step('Calcetines: sin pantalón ni calzado explica la limitación', async () => {
  await page.click('.cs-card-head .cs-link:has-text("Vaciar")');
  await go(page, '#/color/calcetines');
  ok((await page.textContent('.cs-socks')).includes('Falta información'), 'sin explicación');
});

await step('CS-13: un color hipotético se guarda como tal y sigue marcado al reabrir el outfit', async () => {
  const g = db.cs_garments.find((x) => x.name === 'Chino marino');
  await page.evaluate((gid) => sessionStorage.setItem('bm_cs_draft', JSON.stringify({ id: null, name: '', palette_id: null, override: null, formality: 'smart', direction: 'balanced', shoeType: '', original: null, occasion: '', notes: '', is_favorite: false,
    slots: { bottom: { garment_id: gid, hex: null, weight: 35 }, accessory: { garment_id: null, hex: '#C9A23A', weight: 3, hypothetical: true } } })), g.id);
  await page.reload(); await go(page, '#/color'); await page.waitForSelector('.cs-slots');
  ok((await page.textContent('.cs-slot:has-text("Accesorio")')).includes('Color hipotético'), 'el borrador no muestra el color hipotético');
  await page.click('[data-key="save-outfit"]');
  await page.waitForSelector('dialog[open] #cs-o-name');
  await page.fill('#cs-o-name', 'Con hipotético');
  await submit(page);
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const o = db.cs_outfits.find((x) => x.name === 'Con hipotético');
  eq(o.items.find((i) => i.slot === 'accessory').hypothetical, true, 'no se guardó la marca');
  ok(!('hypothetical' in o.items.find((i) => i.slot === 'bottom')), 'una prenda real quedó marcada como hipotética');
  await page.click('.cs-card-head .cs-link:has-text("Vaciar")');
  await page.click('.cs-outfit:has-text("Con hipotético") .cs-link:has-text("Abrir")');
  await page.waitForSelector('.cs-slot:has-text("Accesorio")');
  ok((await page.textContent('.cs-slot:has-text("Accesorio")')).includes('Color hipotético'), 'al reabrir se perdió la marca');
  await page.click('.cs-card-head .cs-link:has-text("Vaciar")');
});

/* ── Color Studio 2.0 en modo ejemplo (no escribe nada: lo comprueba el registro de escrituras) ── */
await step('Dirección: lectura del conjunto y propuestas que no tocan el outfit hasta aplicarlas', async () => {
  missing = true;
  const x = await open(null, '#/color');
  globalThis.__x = x;
  x.writes = [];
  x.page.on('request', (r) => { if (/supabase\.co/.test(r.url()) && !['GET', 'OPTIONS'].includes(r.method())) x.writes.push(r.method() + ' ' + r.url()); });
  await x.page.click('button:has-text("Ver con datos de ejemplo")');
  const pick = async (slot, txt) => { await x.page.click(`[data-key="pick-${slot}"]`); await x.page.click(`dialog[open] .cs-pick-b:has-text("${txt}")`); };
  await pick('bottom', 'Chino marino'); await pick('shoes', 'Bota marrón'); await pick('top', 'Jersey burdeos'); await pick('accessory', 'Pañuelo mostaza');
  ok((await x.page.textContent('.cs-reading')).includes('Lectura actual'), 'sin lectura del conjunto');
  ok((await x.page.textContent('.cs-compose')).includes('Acento'), 'sin jerarquía (acento) en la composición');
  await x.page.click('[data-key="dir-minimal"]');
  await x.page.waitForSelector('.cs-prop2');
  eq(await x.page.getAttribute('[data-key="dir-minimal"]', 'aria-pressed'), 'true');
  eq(await x.page.$$eval('.cs-prop2:first-of-type .cs-cmp .cs-band', (e) => e.length), 2, 'sin comparación ahora / propuesta');
  ok((await x.page.textContent('.cs-prop2')).includes('Qué cambia'), 'sin diferencias explicadas');
  ok(!/\d+ ?% de estilo|perfect|óptim/i.test(await x.page.textContent('.cs-dir')), 'puntuación estética inventada');
  const slots = await x.page.textContent('.cs-slots');
  ok(slots.includes('Jersey burdeos') && slots.includes('Pañuelo mostaza'), 'explorar cambió el outfit');
  await shot(x.page, '08-direccion');
});
await step('Dirección: aplicar una propuesta conserva el original y se puede volver a él', async () => {
  const { page: p } = globalThis.__x;
  const before = await p.textContent('.cs-slots');
  await p.click('[data-key="apply-0"]');
  await p.waitForSelector('.cs-orig');
  ok((await p.textContent('.cs-slots')) !== before, 'aplicar no cambió el outfit');
  await p.click('[data-key="restore-original"]');
  await p.waitForSelector('.cs-dir:not(:has(.cs-orig))');
  eq(await p.textContent('.cs-slots'), before, 'no volvió al conjunto original');
});
await step('Dirección creativa: los colores que no tienes se marcan como hipotéticos', async () => {
  const { page: p } = globalThis.__x;
  await p.click('[data-key="dir-creative"]');
  await p.waitForSelector('.cs-prop2');
  const cards = await p.$$eval('.cs-prop2', (e) => e.map((c) => ({ hypo: c.classList.contains('is-hypo'), text: c.textContent })));
  ok(cards.length >= 1, 'sin propuestas creativas');
  cards.forEach((c) => ok(c.hypo ? c.text.includes('Hipotético: no tienes esta prenda') : c.text.includes('De tu armario'), 'procedencia de la prenda sin señalar'));
  ok(cards.some((c) => c.text.includes('paleta «')), 'la paleta de la biblioteca no inspira ninguna propuesta');
});
await step('Paletas que inspiran: comparar con el conjunto abre la propuesta y aplicarla la lleva al outfit', async () => {
  const { page: p } = globalThis.__x;
  await p.click('.cs-ref:has-text("Bosque") [data-key^="cmp-"]');
  await p.waitForSelector('dialog[open] .cs-prop2');
  await p.click('dialog[open] [data-key="apply-pal"]');
  await p.waitForSelector('dialog[open]', { state: 'detached' });
  await p.waitForSelector('.cs-orig');
  await p.click('[data-key="restore-original"]');
});
await step('Calcetines en el Studio: tres propuestas distintas y «Usar» las lleva al outfit sin salir', async () => {
  const { page: p } = globalThis.__x;
  eq(await p.$$eval('.cs-sockline', (e) => e.length), 3);
  await p.click('[data-key="sock-safe"]');
  await p.waitForSelector('[data-key="sock-safe"][aria-pressed="true"]');
  ok(!(await p.textContent('.cs-slot:has-text("Calcetines")')).includes('Sin elegir'), 'el calcetín no llegó al outfit');
});
await step('Tipo de calzado: se deduce de la prenda y se puede corregir', async () => {
  const { page: p } = globalThis.__x;
  await go(p, '#/color/calcetines');
  ok((await p.textContent('#cs-s-shoe')).includes('Automático: bota'), 'no deduce la bota del nombre');
  ok((await p.textContent('.cs-socks')).includes('asoma poco'), 'sin la nota de la bota');
  ok((await p.textContent('[data-key="sock-fit-guide"]')).includes('Media caña o largo'), 'CS-21: sin largo para la bota');
  await p.selectOption('#cs-s-shoe', 'loafer');
  await p.waitForFunction(() => document.querySelector('.cs-socks').textContent.includes('mocasín'));
  ok((await p.textContent('[data-key="sock-fit-guide"]')).includes('Invisible o media caña'), 'CS-21: el largo no sigue al calzado');
  ok((await p.textContent('.cs-socks .cs-warn')).includes('invisible el color no se ve'), 'CS-21: sin aviso del invisible');
  await go(p, '#/color');
  ok((await p.textContent('[data-key="sock-fit"]')).includes('invisible o media caña'), 'CS-21: el Studio no muestra el largo');
  await go(p, '#/color/calcetines');
  await p.selectOption('#cs-s-shoe', '');
  await shot(p, '09-calcetines-calzado');
});
await step('CS-02: lo escrito en la guía de calcetines no cambia los calcetines del Studio', async () => {
  const { page: p } = globalThis.__x;
  await go(p, '#/color');
  const before = await p.textContent('.cs-socklines');
  await go(p, '#/color/calcetines');
  await p.fill('#cs-s-tr', '#E8E0D0');                       // sin pulsar «Actualizar»
  await go(p, '#/color');
  eq(await p.textContent('.cs-socklines'), before, 'cambió sin aplicar');
  await go(p, '#/color/calcetines');
  eq(await p.inputValue('#cs-s-tr'), '#E8E0D0', 'se perdió lo escrito al repintar');
  await p.click('[data-key="sock-apply"]');
  await p.waitForSelector('.cs-note--manual');
  ok((await p.textContent('.cs-prop-meta')).includes('Contraste: pantalón'), 'CS-12: sin contraste frente al pantalón');
  await go(p, '#/color');
  eq(await p.textContent('.cs-socklines'), before, 'el Studio usó los colores escritos en la guía');
  await go(p, '#/color/calcetines');
  await p.click('[data-key="sock-reset"]');
  await p.waitForSelector('.cs-socks:not(:has(.cs-note--manual))');
  ok(!(await p.$('.cs-note--manual')), 'no volvió a los colores del outfit');
});
await step('CS-22: «Qué prenda te falta» sale de las propuestas hipotéticas y nunca propone una prenda que ya tienes', async () => {
  const { page: p } = globalThis.__x;
  await go(p, '#/color');
  await p.waitForSelector('.cs-gaps');
  const gaps = await p.$$eval('.cs-gap', (e) => e.map((x) => x.textContent));
  const none = await p.$('[data-key="gaps-none"]');
  ok(gaps.length || none, 'la tarjeta no dice nada');
  gaps.forEach((t) => ok(/Abriría: (Minimalista|Equilibrada|Creativa)/.test(t), 'sin dirección: ' + t));
  if (gaps.length) ok((await p.textContent('.cs-gaps')).includes('No es una valoración de tu armario'), 'sin aclaración');
  if (process.env.COLOR_SHOTS) {
    await p.setViewportSize({ width: 390, height: 844 });
    await (await p.$('.cs-gaps')).screenshot({ path: join(process.env.COLOR_SHOTS, '11-falta.png') });
    await p.setViewportSize({ width: 1440, height: 1000 });
  }
});
await step('CS-14 y CS-15: a 320 px se ve la etiqueta de rol y los controles miden al menos 44 px', async () => {
  const { page: p } = globalThis.__x;
  await p.setViewportSize({ width: 320, height: 740 });
  await go(p, '#/color');
  const roles = await p.$$eval('.cs-dist-row', (rows) => rows.map((r) => { const b = r.querySelector('.cs-role'); if (!b) return null; const x = b.getBoundingClientRect(), n = r.querySelector('.cs-dist-name').getBoundingClientRect(); return x.width > 20 && x.right <= n.right + 1; }).filter((v) => v !== null));
  ok(roles.length && roles.every(Boolean), 'etiqueta de rol recortada: ' + JSON.stringify(roles));
  const small = await p.$$eval('.cs .cs-btn-s, .cs .cs-weight, .cs summary, .cs input[type="range"]', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.height && r.height < 44; }).map((e) => e.className || e.tagName));
  eq(small, [], 'controles por debajo de 44 px');
  await p.setViewportSize({ width: 1440, height: 1000 });
});
await step('CS-07: sin colores próximos, las paletas relacionadas por familia aparecen señaladas como tales', async () => {
  const { page: p } = globalThis.__x;
  await go(p, '#/color');
  await p.click('.cs-card-head .cs-link:has-text("Vaciar")');
  const hexIn = async (slot, hex) => { await p.click(`[data-key="pick-${slot}"]`); await p.fill('#cs-pick-hex', hex); await p.click('dialog[open] button:has-text("Usar este color")'); };
  await hexIn('bottom', '#3D4F2A'); await hexIn('top', '#BB9988');
  await p.waitForSelector('.cs-ref');
  const ref = await p.textContent('.cs-refs');
  ok(ref.includes('Relación por familia'), 'sin la etiqueta de relación por familia');
  ok(ref.includes('Misma familia en el conjunto'), 'los colores emparejados por familia no se distinguen de los idénticos');
  ok(!ref.includes('Coincidencia exacta'), 'una relación por familia se presenta como coincidencia exacta');
});
await step('CS-06: en móvil el Studio va por tareas y «Guardar» queda siempre a mano; en escritorio no cambia', async () => {
  const { page: p } = globalThis.__x;
  await go(p, '#/color');
  const top = (sel) => p.$eval(sel, (e) => e.getBoundingClientRect().top + scrollY);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => scrollTo(0, 0));
  const [slots, dir, socks, compose] = [await top('.cs-o-slots'), await top('.cs-o-dir'), await top('.cs-o-socks'), await top('.cs-o-compose')];
  ok(slots < dir && dir < socks && socks < compose, 'orden móvil: ' + [slots, dir, socks, compose].map(Math.round));
  const save = await p.$eval('.cs-save-btn', (b) => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; });
  ok(save.top > 0 && save.bottom < save.h, '«Guardar» no se ve sin desplazarse: ' + JSON.stringify(save));
  const nav = await p.$eval('.cs-nav', (n) => n.getBoundingClientRect().top);
  ok(save.bottom <= nav, '«Guardar» queda tapado por la barra inferior');
  await p.setViewportSize({ width: 1440, height: 1000 });
  ok((await top('.cs-o-compose')) < (await top('.cs-o-slots')), 'en escritorio la composición debería seguir arriba');
});
await step('Modo ejemplo 2.0: sin escrituras, sin errores, axe correcto y sin scroll horizontal a 390 px', async () => {
  const { page: p, ctx: c, errors: errs, writes } = globalThis.__x;
  eq(writes, [], 'escrituras en modo ejemplo');
  await go(p, '#/color');
  await axe(p, 'Studio con direcciones');
  await go(p, '#/color/calcetines');
  await axe(p, 'Calcetines con tipo de calzado');
  await p.setViewportSize({ width: 390, height: 844 });
  for (const h of ['#/color', '#/color/calcetines']) {
    await go(p, h);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= 390, h + ': scroll horizontal (' + sw + ' px)');
  }
  await axe(p, 'móvil Studio 2.0');
  eq(errs, []);
  await c.close();
  missing = false;
});
/* ── Inspiración ── */
async function outfitPng(page, transparent) {     // «foto de outfit»: fondo claro, abrigo camel, pantalón marino (o transparente, sin color)
  const b64 = await page.evaluate((transparent) => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1500;
    const x = c.getContext('2d');
    if (!transparent) {
      x.fillStyle = '#ECECE9'; x.fillRect(0, 0, 1200, 1500);
      x.fillStyle = '#B48A5A'; x.fillRect(250, 150, 700, 650);
      x.fillStyle = '#1F2A44'; x.fillRect(325, 800, 550, 600);
      for (let i = 0; i < 400; i++) { x.fillStyle = 'rgba(0,0,0,' + (i % 7) / 60 + ')'; x.fillRect((i * 97) % 1200, (i * 53) % 1500, 9, 9); }   // textura: que la compresión tenga trabajo
    }
    return c.toDataURL('image/png').split(',')[1];
  }, !!transparent);
  return { name: 'outfit.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
const inspFile = 'dialog[open] .cs-ins-photo label:has-text("Elegir imagen") input';
const inspSaveFlow = async (page) => { await submit(page); await page.waitForSelector('dialog[open]', { state: 'detached' }); };
await step('Inspiración: vacío claro y acción principal visible', async () => {
  await go(page, '#/color/inspiracion');
  await page.waitForSelector('.cs[data-view="inspiracion"]');
  ok((await page.textContent('.cs-body')).includes('Tu archivo de inspiración está vacío'), 'sin estado vacío');
  ok(await page.isVisible('[data-key="new-insp"]'), 'sin «Añadir inspiración»');
  eq(await page.getAttribute('.cs-nav a[href="#/color/inspiracion"]', 'aria-current'), 'page');
});
await step('Inspiración: enlace + «Leer enlace» trae título, fuente, fecha e imagen; la paleta se extrae y se guarda en privado', async () => {
  fnImage = (await outfitPng(page)).buffer;
  fnMode = 'ok';
  await page.click('[data-key="new-insp"]');
  await page.waitForSelector('dialog[open] #cs-i-url');
  await page.fill('#cs-i-url', 'https://www.ejemplo.org/look/1?utm_source=x');
  await page.click('[data-key="insp-read"]');
  await page.waitForFunction(() => /Obtenido: .*imagen/.test(document.querySelector('dialog[open] .cs-ins-urlrow + .apf-hint').textContent), null, { timeout: 8000 });
  eq(await page.inputValue('#cs-i-title'), 'Look de prueba E2E');
  eq(await page.inputValue('#cs-i-src'), 'Revista Prueba');
  eq(await page.inputValue('#cs-i-pub'), '2026-03-02');
  ok(await page.isVisible('dialog[open] .cs-ins-preview img'), 'sin vista previa');
  ok(/colores sugeridos/.test(await page.textContent('dialog[open] .cs-ins-palprev')), 'sin sugerencias en el formulario');
  eq(await page.$('dialog[open] .cs-ins-pallist'), null, 'las sugerencias entraron solas en la paleta');
  await page.click('dialog[open] [data-key="cs-i-sty-1"]');               // Smart casual
  await page.click('dialog[open] [data-key="cs-i-sea-2"]');               // Otoño
  await inspSaveFlow(page);
  const r = db.cs_inspirations[0];
  eq(r.owner, USER_A);
  eq(r.title, 'Look de prueba E2E');
  eq(r.source_url, 'https://www.ejemplo.org/look/1?utm_source=x');
  eq(r.styles, ['Smart casual']);
  eq(r.seasons, ['otono']);
  eq(r.palette_status, 'auto');
  eq(r.palette, [], 'la extracción escribió en la paleta');
  ok(r.suggestions.length >= 2 && r.suggestions.length <= 8, 'sugerencias: ' + r.suggestions.length);
  eq(Math.round(r.suggestions.reduce((t, c) => t + c.weight, 0)), 100);
  ok(r.suggestions.some((c) => /^#1[0-9A-F]2[0-9A-F]4[0-9A-F]$/.test(c.hex) || c.hex === '#1F2A44'), 'falta el marino: ' + r.suggestions.map((c) => c.hex));
  ok(!r.suggestions.some((c) => /^#E[A-F0-9]E[A-F0-9]E[A-F0-9]$/.test(c.hex)), 'el fondo de la foto sigue en las sugerencias: ' + r.suggestions.map((c) => c.hex));
  ok(new RegExp('^inspiracion/' + USER_A + '/[0-9a-f-]{36}\\.(webp|jpg)$').test(r.image_path), 'ruta de la imagen: ' + r.image_path);
  ok(r.thumb_path && objects.has(r.image_path) && objects.has(r.thumb_path), 'imagen o miniatura sin subir');
  ok(objects.get(r.thumb_path).body.length < objects.get(r.image_path).body.length, 'la miniatura no es más ligera');
  ok(/^[0-9a-f]{16}$/.test(r.image_hash), 'sin huella');
  ok((await toastText(page)).includes('Elige sus colores'), 'sin aviso de revisión');
  await page.waitForSelector('.cs-ins-card .cs-ins-media img');
  ok((await page.textContent('.cs-ins-card')).includes('Paleta por revisar'), 'sin indicador de revisión');
  await shot(page, '10-inspiracion');
});
await step('Inspiración: sin enlace (solo imagen) y con la lectura caída (solo enlace) se guarda igual', async () => {
  await page.click('[data-key="new-insp"]');
  await page.setInputFiles(inspFile, await pngOf(page, 400, 500, '#6B1F2A'));
  await page.waitForFunction(() => /sugerido/.test(document.querySelector('dialog[open] .cs-ins-photo').textContent));
  await page.fill('#cs-i-title', 'Jersey burdeos');
  await inspSaveFlow(page);
  const b = db.cs_inspirations.find((x) => x.title === 'Jersey burdeos');
  ok(b && !b.source_url && b.image_path && b.suggestions.length, 'no se guardó la referencia sin enlace');
  fnMode = 'missing';
  await page.click('[data-key="new-insp"]');
  await page.fill('#cs-i-url', 'https://tienda.ejemplo.org/producto/9');
  await page.click('[data-key="insp-read"]');
  await page.waitForFunction(() => /no está activada/.test(document.querySelector('dialog[open] .cs-ins-urlrow + .apf-hint').textContent));
  eq(await page.inputValue('#cs-i-src'), 'tienda.ejemplo.org', 'sin fuente deducida del enlace');
  fnMode = 'blocked';
  await page.click('[data-key="insp-read"]');
  await page.waitForFunction(() => /No se ha podido leer la página \(La página responde 403\)/.test(document.querySelector('dialog[open] .cs-ins-urlrow + .apf-hint').textContent));
  ok(!(await page.$('dialog[open] .cs-ins-preview img')), 'dice que hay imagen sin haberla');
  await inspSaveFlow(page);
  const c = db.cs_inspirations.find((x) => x.source_url === 'https://tienda.ejemplo.org/producto/9');
  ok(c && !c.image_path && c.palette_status === 'none' && c.source_name === 'tienda.ejemplo.org', 'no se guardó solo con el enlace');
  fnMode = 'ok';
});
await step('Inspiración: si la extracción de color falla, se guarda con la paleta marcada como no extraída', async () => {
  await page.click('[data-key="new-insp"]');
  await page.setInputFiles(inspFile, await outfitPng(page, true));
  await page.waitForFunction(() => /no ha encontrado colores/.test(document.querySelector('dialog[open] .cs-ins-photo').textContent));
  await page.fill('#cs-i-title', 'Imagen transparente');
  await inspSaveFlow(page);
  const r = db.cs_inspirations.find((x) => x.title === 'Imagen transparente');
  eq(r.palette_status, 'failed'); eq(r.palette, []); eq(r.suggestions, []);
  ok(r.image_path, 'perdió la imagen');
});
await step('Inspiración: un duplicado (mismo enlace) avisa y solo se guarda si se confirma', async () => {
  await page.click('[data-key="new-insp"]');
  await page.fill('#cs-i-url', 'https://ejemplo.org/look/1/');
  await page.fill('#cs-i-title', 'Repetida');
  await submit(page);
  await page.waitForFunction(() => /Ya guardaste este enlace en «Look de prueba E2E»/.test(document.querySelector('dialog[open] .ap-msg').textContent));
  ok(!db.cs_inspirations.some((x) => x.title === 'Repetida'), 'guardó sin confirmar');
  await page.click('dialog[open] button:has-text("Cancelar")');
});
await step('Inspiración: detalle con sugerencias aparte; aceptar una la lleva a la paleta (HEX, RGB, Lab); editar HEX la marca como manual', async () => {
  const r = db.cs_inspirations[0];
  await page.click('[data-key="insp-' + r.id + '"]');
  await page.waitForSelector('dialog[open] .cs-ins-suglist');
  const txt = await page.textContent('dialog[open]');
  ok(txt.includes('Ver la publicación original') && txt.includes('Revista Prueba') && txt.includes('2 de marzo de 2026'), 'faltan fuente, enlace o fecha');
  ok(txt.includes('Aún no has elegido colores') && txt.includes('No forman parte de la paleta'), 'no distingue paleta y sugerencias');
  eq(await page.getAttribute('dialog[open] .cs-ins-link', 'rel'), 'noopener noreferrer');
  ok(await page.isVisible('dialog[open] [data-key="insp-pick"]'), 'sin «Seleccionar colores»');
  ok(await page.isVisible('dialog[open] img[alt^="Foto guardada: Look de prueba E2E"]'), 'imagen sin texto alternativo útil');
  await axe(page, 'detalle de inspiración');
  await shot(page, '12-inspiracion-detalle');
  const first = r.suggestions[0].hex, nSug = r.suggestions.length;
  await page.click('dialog[open] [data-key="insp-sug-0"]');
  await page.waitForSelector('dialog[open] .cs-ins-colors');
  const x = db.cs_inspirations[0];
  eq([x.palette.length, x.palette[0].hex, x.palette[0].source, x.suggestions.length, x.palette_status], [1, first, 'auto', nSug - 1, 'reviewed']);
  ok(/RGB \d+ \d+ \d+Lab/.test(await page.textContent('dialog[open]')) && (await page.textContent('dialog[open]')).includes('Sugerencia aceptada'), 'sin datos del color o sin procedencia');
  await page.click('[data-key="insp-palette"]');
  await page.waitForSelector('dialog[open] #cs-ip-0');
  await page.fill('#cs-ip-0', '#2A2A2A');
  await submit(page);
  await page.waitForFunction(() => /Cuentagotas/.test((document.querySelector('dialog[open]') || {}).textContent || ''));
  const p0 = db.cs_inspirations[0].palette[0];
  eq([p0.hex, p0.source, 'weight' in p0], ['#2A2A2A', 'manual', false]);
  eq(db.cs_inspirations[0].suggestions.length, nSug - 1, 'editar la paleta tocó las sugerencias');
  await page.click('dialog[open] .cs-sheet-head .cs-link');
});
await step('Inspiración: estilo y colección nuevos (van a Configuración), notas y valoración; se conservan', async () => {
  const r = db.cs_inspirations[0];
  await page.click('[data-key="insp-' + r.id + '"]');
  await page.click('[data-key="insp-edit"]');
  await page.waitForSelector('dialog[open] #cs-i-sty-new');
  await page.fill('#cs-i-sty-new', 'Prueba E2E');
  await page.press('#cs-i-sty-new', 'Enter');
  ok(await page.$('dialog[open]'), 'Intro en el campo nuevo envió el formulario');
  await page.fill('#cs-i-col-new', 'Oficina E2E');
  await page.click('dialog[open] .cs-ins-newrow:has(#cs-i-col-new) button');
  await page.$eval('dialog[open] .cs-ins-more', (d) => { d.open = true; });   // abierto ya si la referencia tiene fecha
  await page.fill('#cs-i-notes', 'Me gusta la proporción abrigo-pantalón.');
  await page.selectOption('#cs-i-rate', '4');
  await inspSaveFlow(page);
  const x = db.cs_inspirations[0];
  eq(x.styles, ['Smart casual', 'Prueba E2E']);
  eq(x.collections, ['Oficina E2E']);
  eq(x.notes, 'Me gusta la proporción abrigo-pantalón.');
  eq(x.rating, 4);
  eq(x.palette[0].hex, '#2A2A2A', 'editar los datos cambió la paleta');
  ok(db.ap_opciones.some((o) => o.grupo === 'inspiracion.estilo' && o.valor === 'Prueba E2E'), 'el estilo nuevo no llegó a Configuración');
  ok(db.ap_opciones.some((o) => o.grupo === 'inspiracion.coleccion' && o.valor === 'Oficina E2E'), 'la colección nueva no llegó a Configuración');
});
await step('Inspiración: buscar, filtrar (colección, temporada, color, por revisar) y ordenar', async () => {
  const titles = () => page.$$eval('.cs-ins-t', (e) => e.map((x) => x.textContent));
  await page.fill('#cs-in-q', 'proporcion abrigo');                          // sin tildes, en las notas
  await page.waitForFunction(() => document.querySelectorAll('.cs-ins-card').length === 1);
  eq(await titles(), ['Look de prueba E2E']);
  await page.fill('#cs-in-q', '');
  await page.selectOption('#cs-in-col', 'Oficina E2E');
  eq(await titles(), ['Look de prueba E2E']);
  ok((await page.textContent('[data-key="insp-filters"]')).includes('(1)'), 'sin contador de filtros');
  await page.click('[data-key="insp-clear"]');
  await page.selectOption('#cs-in-season', 'otono');
  eq((await titles()).length, 1);
  await page.selectOption('#cs-in-season', '');
  await page.selectOption('#cs-in-fam', 'rojo');
  ok((await titles()).includes('Jersey burdeos') && !(await titles()).includes('Look de prueba E2E'), 'filtro por color');
  await page.selectOption('#cs-in-fam', '');
  await page.check('[data-key="insp-review"]');
  const rev = await titles();
  ok(rev.includes('Imagen transparente') && !rev.includes('Look de prueba E2E'), 'filtro por revisar: ' + rev);
  await page.click('[data-key="insp-clear"]');
  await page.selectOption('#cs-in-sort', 'saved-asc');
  eq((await titles())[0], 'Look de prueba E2E');
  await page.selectOption('#cs-in-sort', 'saved');
});
await step('Inspiración: favorita desde la tarjeta (y quitarla) y «Solo favoritas»', async () => {
  const r = db.cs_inspirations.find((x) => x.title === 'Jersey burdeos');
  await page.click('[data-key="ifav-' + r.id + '"]');
  await page.waitForFunction((id) => document.querySelector('[data-key="ifav-' + id + '"]').getAttribute('aria-pressed') === 'true', r.id);
  eq(r.is_favorite, true);
  await page.check('[data-key="insp-fav"]');
  eq(await page.$$eval('.cs-ins-card', (e) => e.length), 1);
  await page.click('[data-key="ifav-' + r.id + '"]');
  await page.waitForFunction(() => document.querySelectorAll('.cs-ins-card').length === 0);
  eq(r.is_favorite, false);
  await page.click('[data-key="insp-clear"]');
});
/* ── Cuentagotas: imagen de cuadrantes con colores conocidos y píxeles sueltos (ruido) ── */
const QUAD = { tl: '#1F2A44', tr: '#B48A5A', bl: '#6B1F2A', br: '#F4F2EC' };
async function quadPng(page) {
  const b64 = await page.evaluate((Q) => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1500;
    const x = c.getContext('2d');
    x.fillStyle = Q.tl; x.fillRect(0, 0, 600, 750); x.fillStyle = Q.tr; x.fillRect(600, 0, 600, 750);
    x.fillStyle = Q.bl; x.fillRect(0, 750, 600, 750); x.fillStyle = Q.br; x.fillRect(600, 750, 600, 750);
    x.fillStyle = '#FFFFFF'; for (let i = 0; i < 4000; i++) x.fillRect((i * 131) % 1200, (i * 197) % 1500, 1, 1);     // reflejos sueltos
    return c.toDataURL('image/png').split(',')[1];
  }, QUAD);
  return { name: 'cuadrantes.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
// punto relativo (0–1) de la imagen del cuentagotas en coordenadas de la pantalla
const pkPoint = (pg, fx, fy) => pg.$eval('dialog[open] .cs-pk-img', (img, f) => { const r = img.getBoundingClientRect(); return { x: r.left + r.width * f[0], y: r.top + r.height * f[1], w: r.width, nw: img.naturalWidth }; }, [fx, fy]);
const pendingHex = (pg) => pg.$eval('dialog[open] .cs-pk-pending .cs-hex', (e) => e.textContent.slice(0, 7));
await step('Cuentagotas (ratón): imagen escalada, mediana que ignora reflejos, varios colores, etiquetas, corregir, eliminar y sin peticiones de red', async () => {
  await go(page, '#/color/inspiracion');
  await page.click('[data-key="new-insp"]');
  await page.setInputFiles(inspFile, await quadPng(page));
  await page.waitForSelector('dialog[open] [data-key="insp-form-pick"]');
  await page.fill('#cs-i-title', 'Cuadrantes');
  await page.click('[data-key="insp-form-pick"]');
  await page.waitForSelector('dialog.cs-sheet--picker[open] .cs-pk-stage.is-ready');
  const reqs = [];
  const onReq = (r) => reqs.push(r.url());
  page.on('request', onReq);
  let pt = await pkPoint(page, 0.25, 0.25);
  ok(pt.w < pt.nw, 'la imagen no se ve reducida (' + pt.w + ' de ' + pt.nw + ' px): la prueba de escala no vale');
  await page.mouse.move(pt.x, pt.y);
  ok(await page.isVisible('dialog[open] .cs-pk-loupe'), 'sin lupa al pasar el ratón');
  await shot(page, '15a-lupa');
  eq(await page.$eval('dialog[open] .cs-pk-pending', (e) => e.hidden), true, 'pasar el ratón ya añadió una muestra');
  await page.mouse.click(pt.x, pt.y);
  eq(await pendingHex(page), QUAD.tl, 'muestra del cuadrante superior izquierdo');
  await page.fill('#cs-pk-newlabel', 'Pantalón');
  await page.click('[data-key="pk-add"]');
  pt = await pkPoint(page, 0.75, 0.25); await page.mouse.click(pt.x, pt.y);
  eq(await pendingHex(page), QUAD.tr);
  await page.click('[data-key="pk-add"]');
  pt = await pkPoint(page, 0.5, 0.75); await page.mouse.click(pt.x, pt.y);           // frontera entre dos colores
  ok(await page.isVisible('dialog[open] .cs-pk-pending .cs-pk-warn'), 'no avisa de una zona mezclada');
  await page.click('[data-key="pk-discard"]');
  eq(await page.$$eval('dialog[open] .cs-pk-item', (e) => e.length), 2, 'cancelar añadió la muestra');
  await page.click('[data-key="pk-del-1"]');
  await page.click('[data-key="pk-fix-0"]');
  pt = await pkPoint(page, 0.25, 0.75); await page.mouse.click(pt.x, pt.y);
  eq(await pendingHex(page), QUAD.bl);
  ok((await page.textContent('[data-key="pk-add"]')).includes('Sustituir'), 'corregir no sustituye');
  await page.click('[data-key="pk-add"]');
  await page.click('[data-key="pk-exact"]');
  pt = await pkPoint(page, 131.5 / 1200, 197.5 / 1500); await page.mouse.click(pt.x, pt.y);   // un reflejo exacto: el punto exacto lo toma
  eq(await pendingHex(page), '#FFFFFF', 'el punto exacto no toma el píxel');
  await page.click('[data-key="pk-zone"]');
  await page.click('[data-key="pk-discard"]');
  await axe(page, 'cuentagotas');
  await shot(page, '15-cuentagotas');
  page.off('request', onReq);
  // las fuentes de Google las pide la propia página (y la prueba las bloquea); nada más puede salir del dispositivo
  eq(reqs.filter((u) => !/^(blob|data):/.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u)), [], 'el cuentagotas hizo peticiones de red');
  await page.click('[data-key="pk-save"]');
  await page.waitForSelector('dialog.cs-sheet--picker', { state: 'detached' });
  ok((await page.textContent('dialog[open] .cs-ins-palprev')).includes('Pantalón'), 'la paleta no vuelve al formulario');
  await inspSaveFlow(page);
  const r = db.cs_inspirations.find((x) => x.title === 'Cuadrantes');
  eq(r.palette.map((c) => [c.hex, c.source, c.label]), [[QUAD.bl, 'manual', 'Pantalón']]);
  ok(/^[A-Za-z0-9_-]+$/.test(r.palette[0].id) && !('weight' in r.palette[0]), 'color sin id o con un peso inventado');
  ok(r.suggestions.length > 0 && r.palette_status === 'reviewed', 'sugerencias perdidas o estado erróneo');
});
await step('Cuentagotas (táctil, móvil 390 px) sobre una referencia guardada: tocar, añadir y guardar; sin scroll horizontal', async () => {
  const m = await open({ width: 390, height: 844 }, '#/color/inspiracion');
  const r = db.cs_inspirations.find((x) => x.title === 'Cuadrantes');
  await m.page.click('[data-key="insp-' + r.id + '"]');
  await m.page.click('dialog[open] [data-key="insp-pick"]');
  await m.page.waitForSelector('dialog.cs-sheet--picker[open] .cs-pk-stage.is-ready');
  eq(await m.page.$$eval('dialog[open] .cs-pk-item', (e) => e.length), 1, 'no carga la paleta guardada');
  const pt = await pkPoint(m.page, 0.75, 0.75);
  await m.page.touchscreen.tap(pt.x, pt.y);
  // la imagen guardada es WebP con pérdida (sin EXIF, ≤ 5 MB): el color puede variar una unidad, imperceptible (ΔE00 < 1,5)
  const got = await pendingHex(m.page);
  ok(E.colorDistance(got, QUAD.br) < 1.5, 'el toque no toma el color: ' + got);
  await m.page.click('[data-key="pk-add"]');
  eq(await m.page.evaluate(() => document.documentElement.scrollWidth), 390);
  const dlgOk = await m.page.$eval('dialog[open]', (d) => d.scrollWidth <= d.clientWidth + 1);
  ok(dlgOk, 'el cuentagotas desborda en horizontal');
  await axe(m.page, 'cuentagotas móvil');
  await shot(m.page, '16-cuentagotas-movil');
  await m.page.click('[data-key="pk-save"]');
  await m.page.waitForSelector('dialog[open] .cs-ins-colors');
  const x = db.cs_inspirations.find((y) => y.id === r.id);
  eq(x.palette.map((c) => c.hex), [QUAD.bl, got]);
  eq(m.errors, []);
  await m.ctx.close();
});
await step('Cuentagotas: cerrar con cambios sin guardar pide confirmación y no escribe nada', async () => {
  const r = db.cs_inspirations.find((x) => x.title === 'Cuadrantes'), before = JSON.stringify(r.palette);
  await page.reload();
  await page.click('[data-key="insp-' + r.id + '"]');
  await page.click('dialog[open] [data-key="insp-pick"]');
  await page.waitForSelector('dialog.cs-sheet--picker[open] .cs-pk-stage.is-ready');
  const pt = await pkPoint(page, 0.75, 0.25); await page.mouse.click(pt.x, pt.y);
  await page.click('[data-key="pk-add"]');
  await page.click('[data-key="pk-close"]');
  await page.waitForSelector('#ap-dialog-ok');
  await page.click('#ap-dialog-ok');
  await page.waitForSelector('dialog.cs-sheet--picker', { state: 'detached' });
  eq(JSON.stringify(db.cs_inspirations.find((x) => x.id === r.id).palette), before, 'se guardó sin confirmar');
});
await step('Sustituir la imagen: sugerencias nuevas y aviso (sin borrar) de que los colores elegidos son de la imagen anterior', async () => {
  const r = db.cs_inspirations.find((x) => x.title === 'Cuadrantes');
  await page.click('[data-key="insp-' + r.id + '"]');
  await page.click('[data-key="insp-edit"]');
  await page.setInputFiles(inspFile, await outfitPng(page));
  await page.waitForSelector('dialog[open] [data-key="insp-stale-clear"]');
  eq(await page.$$eval('dialog[open] .cs-ins-pallist li', (e) => e.length), 2, 'la paleta se borró en silencio');
  await page.click('dialog[open] button:has-text("Cancelar")');
  eq(db.cs_inspirations.find((x) => x.id === r.id).palette.length, 2);
});
await step('Referencia guardada antes del cuentagotas (paleta con pesos, sin id ni sugerencias): se abre, se confirma y admite colores nuevos', async () => {
  const old = { id: uid(), owner: USER_A, created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z', title: 'Antigua', source_url: null, source_name: null, published_on: null, image_path: null, thumb_path: null,
    image_hash: null, description: null, notes: null, styles: [], collections: [], seasons: [], rating: null, is_favorite: false, palette: [{ hex: '#B48A5A', weight: 60, source: 'auto' }, { hex: '#1F2A44', weight: 40, source: 'auto' }], palette_status: 'auto', palette_id: null,
    suggestions: [] };   // tras la migración la columna nueva llega con su valor por defecto
  db.cs_inspirations.push(old);
  await page.reload();
  await page.click('[data-key="insp-' + old.id + '"]');
  await page.waitForSelector('dialog[open] .cs-ins-colors');
  const txt = await page.textContent('dialog[open]');
  ok(txt.includes('Dominante') && /60 %/.test(txt), 'la paleta antigua no se lee con sus pesos');
  await page.click('[data-key="insp-confirm"]');
  await page.waitForFunction(() => /Paleta revisada/.test((document.querySelector('dialog[open]') || {}).textContent || ''));
  const x = db.cs_inspirations.find((y) => y.id === old.id);
  eq([x.palette_status, x.palette.map((c) => c.hex)], ['reviewed', ['#B48A5A', '#1F2A44']], 'confirmar cambió los colores');
  await page.click('dialog[open] .cs-sheet-head .cs-link');
});
await step('Inspiración: persistencia tras recargar y aislamiento entre usuarios (RLS simulada)', async () => {
  db.cs_inspirations.push(Object.assign({ id: uid(), owner: USER_B, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, DEFAULT_ROW.cs_inspirations, { title: 'De otra persona' }));
  await page.reload();
  await page.waitForSelector('.cs-ins-card');
  const titles = await page.$$eval('.cs-ins-t', (e) => e.map((x) => x.textContent));
  ok(titles.includes('Look de prueba E2E') && titles.includes('Jersey burdeos'), 'se perdieron tras recargar');
  ok(!titles.includes('De otra persona'), 'se ve una referencia de otra persona');
  const st = await page.evaluate(async () => {
    const t = JSON.parse(sessionStorage.getItem('bm_ap_session')).access_token;
    const r = await fetch('https://x.supabase.co/storage/v1/object/armario/inspiracion/bbbbbbbb-0000-4000-8000-000000000002/a.webp', { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: 'x' });
    return r.status;
  });
  eq(st, 403, 'se puede subir a la carpeta de otra persona');
  db.cs_inspirations = db.cs_inspirations.filter((x) => x.owner === USER_A);
});
await step('Inspiración: «Con tu armario» y «Usar en Studio» crean la paleta en la Biblioteca y la eligen, sin tocar el armario', async () => {
  const r = db.cs_inspirations[0];
  const garments = db.cs_garments.length, pals = db.cs_palettes.length;
  await page.click('[data-key="insp-' + r.id + '"]');
  await page.waitForSelector('dialog[open] .cs-adapt');
  ok((await page.textContent('dialog[open]')).includes('Coincidir en color no basta'), 'sin aviso de que no es reproducible por color');
  await page.click('[data-key="insp-studio"]');
  await page.waitForSelector('.cs[data-view="studio"]');
  eq(db.cs_palettes.length, pals + 1);
  const p = db.cs_palettes[db.cs_palettes.length - 1];
  eq(p.colors.map((c) => c.hex), r.palette.map((c) => c.hex));
  ok(p.tags.includes('inspiración') && p.source_type === 'web', 'paleta sin procedencia');
  eq(db.cs_inspirations[0].palette_id, p.id);
  eq(db.cs_garments.length, garments, 'tocó el armario');
  ok((await toastText(page)).includes('creada en tu Biblioteca'), 'sin aviso');
  ok(await page.$('.cs-ref.is-on'), 'el Studio no la muestra como referencia elegida');
  // segunda vez: reutiliza la misma paleta
  await go(page, '#/color/inspiracion');
  await page.click('[data-key="insp-' + r.id + '"]');
  await page.click('[data-key="insp-studio"]');
  await page.waitForSelector('.cs[data-view="studio"]');
  eq(db.cs_palettes.length, pals + 1, 'duplicó la paleta');
});
await step('Inspiración: eliminar pide confirmación y borra la referencia y sus imágenes', async () => {
  await go(page, '#/color/inspiracion');
  const r = db.cs_inspirations.find((x) => x.title === 'Jersey burdeos');
  await page.click('[data-key="insp-' + r.id + '"]');
  await page.click('[data-key="insp-del"]');
  await page.waitForSelector('#ap-dialog-ok');
  ok(db.cs_inspirations.includes(r), 'borró antes de confirmar');
  await page.click('#ap-dialog-ok');
  await page.waitForFunction(() => /Inspiración eliminada/.test(document.querySelector('.cs-toast').textContent));
  ok(!db.cs_inspirations.includes(r), 'no se borró');
  ok(!objects.has(r.image_path) && !objects.has(r.thumb_path), 'quedaron imágenes huérfanas');
});
await step('Inspiración: tabla sin crear → aviso solo en esa vista; el resto de Color Studio sigue', async () => {
  inspMissing = true;
  const c = await open(null, '#/color/inspiracion');
  await c.page.waitForSelector('.cs[data-view="inspiracion"]');
  ok((await c.page.textContent('.cs-body')).includes('color-studio-inspiracion.sql'), 'sin instrucciones');
  await go(c.page, '#/color/biblioteca');
  await c.page.waitForSelector('.cs-pal');
  inspMissing = false;
  eq(c.errors, []);
  await c.ctx.close();
});
await step('Inspiración en móvil 390 px: filtros plegados, rejilla de dos columnas, alta usable y sin scroll horizontal', async () => {
  const m = await open({ width: 390, height: 844 }, '#/color/inspiracion');
  await m.page.waitForSelector('.cs-ins-card');
  ok(await m.page.isHidden('#cs-ins-panel'), 'los filtros ocupan la pantalla de inicio');
  await m.page.click('[data-key="insp-filters"]');
  ok(await m.page.isVisible('#cs-in-style'), 'el botón no abre los filtros');
  const cols = await m.page.$$eval('.cs-ins-card', (e) => new Set(e.slice(0, 2).map((x) => Math.round(x.getBoundingClientRect().top))).size);
  eq(cols, 1, 'las dos primeras tarjetas no comparten fila');
  eq(await m.page.evaluate(() => document.documentElement.scrollWidth), 390);
  await axe(m.page, 'móvil inspiración con filtros');
  await shot(m.page, '11-inspiracion-movil');
  await m.page.click('[data-key="new-insp"]');
  await m.page.waitForSelector('dialog[open] #cs-i-url');
  eq(await m.page.evaluate(() => document.documentElement.scrollWidth), 390);
  await axe(m.page, 'móvil alta de inspiración');
  await shot(m.page, '13-inspiracion-alta-movil');
  const small = await m.page.$$eval('dialog[open] button, dialog[open] .btn', (e) => e.filter((x) => x.offsetParent && x.getBoundingClientRect().height < 40).map((x) => x.textContent.trim()));
  eq(small, [], 'botones con poca área táctil');
  await m.page.click('dialog[open] button:has-text("Cancelar")');
  await m.page.click('[data-key="insp-' + db.cs_inspirations.find((x) => x.title === 'Look de prueba E2E').id + '"]');
  await m.page.waitForSelector('dialog[open] .cs-ins-colors');
  eq(await m.page.evaluate(() => document.documentElement.scrollWidth), 390);
  await shot(m.page, '14-inspiracion-detalle-movil');
  const small2 = await m.page.$$eval('dialog[open] button, dialog[open] .btn', (e) => e.filter((x) => x.offsetParent && x.getBoundingClientRect().height < 40).map((x) => x.textContent.trim()));
  eq(small2, [], 'botones con poca área táctil');
  eq(m.errors, []);
  await m.ctx.close();
});
await step('Móvil 320 px: sin scroll horizontal; direcciones, barra inferior y textos de las tarjetas caben en su caja', async () => {
  const m = await open({ width: 320, height: 700 }, '#/color');
  await m.page.waitForSelector('.cs-dir-b');
  const fit = (sel) => m.page.$$eval(sel, (e) => e.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent.trim()));
  eq(await fit('.cs-dir-b'), [], 'texto fuera de los botones de dirección');
  eq(await fit('.cs-nav-a'), [], 'texto fuera de la barra inferior');
  eq(await m.page.evaluate(() => document.documentElement.scrollWidth), 320);
  await go(m.page, '#/color/inspiracion');
  await m.page.waitForSelector('.cs-ins-card');
  eq(await m.page.evaluate(() => document.documentElement.scrollWidth), 320);
  await m.page.click('[data-key="insp-' + db.cs_inspirations.find((x) => x.title === 'Look de prueba E2E').id + '"]');
  await m.page.waitForSelector('dialog[open] .cs-ins-codes');
  eq(await fit('dialog[open] .cs-ins-codes > span'), [], 'códigos de color cortados');
  eq(await m.page.$eval('dialog[open]', (d) => d.scrollWidth <= d.clientWidth), true, 'el detalle desborda en horizontal');
  eq(m.errors, []);
  await m.ctx.close();
});
await step('Inspiración: CSP real sin violaciones (imágenes privadas por blob:)', async () => {
  const c = await open(null, '#/color/inspiracion', true);
  await c.page.waitForSelector('.cs-ins-card .cs-ins-media img');
  eq(await c.page.evaluate(() => window.__csp || []), []);
  eq(c.errors, []);
  await c.ctx.close();
});
await step('Configuración muestra estilos y colecciones de Inspiración con sus usos', async () => {
  const c = await open(null, '#/configuracion');
  await c.page.waitForSelector('.apx-card');
  const t = await c.page.textContent('.ap-view');
  ok(t.includes('Estilos de inspiración') && t.includes('Colecciones de inspiración') && t.includes('Oficina E2E'), 'faltan las listas');
  eq(c.errors, []);
  await c.ctx.close();
});
await step('CS-05: cada módulo de color-studio/ se descarga una sola vez y siempre con su versión', async () => {
  const x = await open(null, '#/color');
  const reqs = [];
  x.page.on('request', (r) => { const u = new URL(r.url()); if (/\/color-studio\/\w+\.js$/.test(u.pathname)) reqs.push(u.pathname.split('/').pop() + u.search); });
  await x.page.reload(); await x.page.waitForSelector('.cs');
  const by = {}; reqs.forEach((r) => { const f = r.split('?')[0]; (by[f] = by[f] || new Set()).add(r); });
  eq(Object.keys(by).sort(), ['compose.js', 'data.js', 'engine.js', 'image.js', 'inspiration.js', 'socks.js']);
  Object.entries(by).forEach(([f, set]) => {
    eq(set.size, 1, f + ' se pide con URLs distintas: ' + [...set].join(' · '));
    ok([...set][0].includes('?v='), f + ' sin versión');
  });
  await x.ctx.close();
});
await step('Error de guardado: se muestra en el formulario y no hay confirmación falsa', async () => {
  await go(page, '#/color/biblioteca');
  failWrites = true;
  const before = db.cs_palettes.length;
  await fillPalette(page, 'Fallará', ['#123456', '#654321']);
  await submit(page);
  await page.waitForFunction(() => /Fallo simulado/.test(document.querySelector('dialog[open] .ap-msg').textContent));
  ok(await page.$('dialog[open]'), 'el diálogo se cerró');
  eq(db.cs_palettes.length, before);
  ok(!(await toastText(page)).includes('Paleta guardada'), 'confirmación falsa');
  await page.click('dialog[open] button:has-text("Cancelar")');
  failWrites = false;
});
await step('Accesibilidad (axe) en escritorio: Studio, Biblioteca, Armario, Calcetines y un formulario', async () => {
  for (const h of ['#/color', '#/color/inspiracion', '#/color/biblioteca', '#/color/armario', '#/color/calcetines']) { await go(page, h); await axe(page, h); }
  await go(page, '#/color/biblioteca');
  await page.click('[data-key="new-pal"]');
  await page.waitForSelector('dialog[open] #cs-p-name');
  await axe(page, 'formulario de paleta');
  await page.click('dialog[open] button:has-text("Cancelar")');
});
await step('Sin errores de JavaScript en la sesión de escritorio', async () => { eq(errors, []); });
await ctx.close();

await step('Móvil 390 px: barra inferior fija, sin scroll horizontal y axe en las cinco vistas', async () => {
  const m = await open({ width: 390, height: 844 }, '#/color');
  for (const h of ['#/color', '#/color/inspiracion', '#/color/biblioteca', '#/color/armario', '#/color/calcetines']) {
    await go(m.page, h);
    const sw = await m.page.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= 390, h + ': scroll horizontal (' + sw + ' px)');
    eq(await m.page.evaluate(() => getComputedStyle(document.querySelector('.cs-nav')).position), 'fixed');
    const navH = await m.page.evaluate(() => document.querySelector('.cs-nav-a').getBoundingClientRect().height);
    ok(navH >= 44, 'objetivo táctil pequeño: ' + navH);
    await axe(m.page, 'móvil ' + h);
    await shot(m.page, '06-movil-' + (h.split('/')[2] || 'studio'));
  }
  await m.page.click('.cs-nav a[href="#/color"]');
  await m.page.click('[data-key="pick-bottom"]');
  const box = await m.page.$eval('dialog[open]', (d) => { const r = d.getBoundingClientRect(); return { w: r.width, bottom: r.bottom }; });
  ok(box.w >= 389 && box.bottom >= 843, 'el selector no es una hoja inferior en móvil');
  await shot(m.page, '07-movil-selector');
  eq(m.errors, []);
  await m.ctx.close();
});
await step('CSP real: sin violaciones y las muestras se pintan por CSSOM', async () => {
  const c = await open(null, '#/color/biblioteca', true);
  await c.page.waitForSelector('.cs-band-c');
  const bg = await c.page.$eval('.cs-band-c', (e) => getComputedStyle(e).backgroundColor);
  ok(bg !== 'rgba(0, 0, 0, 0)', 'muestra sin color');
  eq(await c.page.evaluate(() => window.__csp || []), []);
  eq(c.errors, []);
  await c.ctx.close();
});
await step('Apps: pestaña del área privada, fichas desde el registro e iconos; 390 px táctil y axe', async () => {
  const c = await open({ width: 390, height: 844 }, '#/apps');
  await c.page.waitForSelector('.apl-app');
  eq(await c.page.getAttribute('.ap-tabs a[data-tab="apps"]', 'aria-current'), 'page');
  eq(await c.page.$$eval('.apl-app', (a) => a.map((x) => [x.querySelector('.apl-name').textContent, x.getAttribute('href')])), [['Caesar III', './roma-aeterna/'], ['Color Studio', '#/color']]);
  ok(await c.page.isVisible('.ap-bar') && await c.page.isHidden('#ap-appbar'), 'el catálogo se pinta en modo app');
  await c.page.waitForFunction(() => [...document.querySelectorAll('.apl-icon')].every((i) => i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
  ok(await c.page.$$eval('.apl-icon', (i) => i.every((x) => x.naturalWidth > 0)), 'icono sin cargar');
  const boxes = await c.page.$$eval('.apl-app', (a) => a.map((x) => { const r = x.getBoundingClientRect(); return [r.width, r.height]; }));
  ok(boxes.every(([w, hh]) => w >= 44 && hh >= 44), 'objetivo táctil menor de 44 px: ' + JSON.stringify(boxes));
  eq(await c.page.evaluate(() => document.documentElement.scrollWidth), 390, 'scroll horizontal');
  await shot(c.page, '00-apps-movil');
  await axe(c.page, 'Apps');
  eq(c.errors, []);
  await c.ctx.close();
});
await step('Modo app desde Apps: vistas internas y «Volver» regresa al catálogo sin apilar historial; Adelante reabre', async () => {
  const c = await open(null, '#/apps');
  await c.page.waitForSelector('.apl-app');
  const len0 = await c.page.evaluate(() => history.length);
  await c.page.click('.apl-app[data-app="color"]');
  await c.page.waitForSelector('.cs');
  eq(await c.page.textContent('#ap-app-title'), 'Color Studio', 'el h1 no nombra la app');
  await c.page.click('.cs-nav a[href="#/color/armario"]');
  await c.page.waitForSelector('.cs[data-view="armario"]');
  await c.page.click('#ap-appbar-back');
  await c.page.waitForSelector('.apl-app');
  eq(await c.page.evaluate(() => location.hash), '#/apps');
  eq(await c.page.evaluate(() => history.length), len0 + 2, 'la vuelta añadió entradas al historial');
  ok(await c.page.isVisible('.ap-tabs') && await c.page.isHidden('#ap-appbar'), 'sigue en modo app');
  await c.page.goForward();
  await c.page.waitForSelector('.cs');
  ok(await c.page.isVisible('#ap-appbar-back'), 'Adelante no vuelve al modo app');
  eq(c.errors, []);
  await c.ctx.close();
});
await step('Modo app por URL directa y recarga: «Volver» (teclado) lleva a Apps y Atrás devuelve a la app', async () => {
  const c = await open(null, '#/color/biblioteca');
  await c.page.waitForSelector('.cs[data-view="biblioteca"]');
  await c.page.reload();
  await c.page.waitForSelector('.cs[data-view="biblioteca"]');
  await c.page.focus('#ap-appbar-back');
  await c.page.keyboard.press('Enter');
  await c.page.waitForSelector('.apl-app');
  ok(await c.page.isVisible('.ap-tabs'), 'sin pestañas en Apps');
  await c.page.goBack();
  await c.page.waitForSelector('.cs[data-view="biblioteca"]');
  ok(await c.page.isHidden('.ap-tabs'), 'Atrás no restaura el modo app');
  eq(c.errors, []);
  await c.ctx.close();
});
await step('Móvil: cabecera compacta y barra inferior (Hoy, Tarjeta, Calendario, Apps, Más); sin pestañas arriba', async () => {
  const c = await open({ width: 390, height: 844 }, '#/');
  await c.page.waitForSelector('.ap-bar-a');
  ok(await c.page.isVisible('.ap-bar'), 'sin barra inferior');
  eq(await c.page.$$eval('.ap-bar > *', (a) => a.map((x) => x.textContent.trim())), ['Hoy', 'Tarjeta', 'Calendario', 'Apps', 'Más']);
  for (const sel of ['.ap-tabs', '#ap-logout', '.ap-top-title', '.ap-now']) ok(await c.page.isHidden(sel), sel + ' visible en móvil');
  eq(await c.page.getAttribute('.ap-bar a[data-tab="hoy"]', 'aria-current'), 'page');
  const boxes = await c.page.$$eval('.ap-bar > *', (a) => a.map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  ok(boxes.every(([w, hh]) => w >= 44 && hh >= 44), 'objetivo táctil menor de 44 px: ' + JSON.stringify(boxes));
  const top = await c.page.$eval('.ap-top', (e) => e.getBoundingClientRect().height);
  ok(top <= 90, 'cabecera de ' + Math.round(top) + ' px: no es compacta');
  const bar = await c.page.$eval('.ap-bar', (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.bottom), innerHeight]; });
  eq(bar[0], bar[1], 'la barra no está pegada abajo');
  eq(await c.page.evaluate(() => document.documentElement.scrollWidth), 390, 'scroll horizontal');
  await axe(c.page, 'Móvil con barra inferior');
  await shot(c.page, '10-movil-barra');
  eq(c.errors, []);
  await c.ctx.close();
});
await step('Móvil: «Más» abre la hoja con el resto de secciones; navegar la cierra y marca «Más»; Esc devuelve el foco', async () => {
  const c = await open({ width: 390, height: 844 }, '#/');
  await c.page.waitForSelector('.ap-bar-more');
  eq(await c.page.getAttribute('.ap-bar-more', 'aria-expanded'), 'false');
  await c.page.click('.ap-bar-more');
  await c.page.waitForSelector('dialog.ap-more[open]');
  eq(await c.page.getAttribute('.ap-bar-more', 'aria-expanded'), 'true');
  eq(await c.page.$$eval('.ap-more-list a', (a) => a.map((x) => x.textContent.trim())), ['Entrevistas', 'Portfolio', 'Second Brain', 'Mapa', 'Archivos y notas', 'Fichero', 'Configuración']);
  ok((await c.page.textContent('.ap-more-out')).includes('Cerrar sesión'), 'sin «Cerrar sesión» en la hoja');
  const rows = await c.page.$$eval('.ap-more-a, .ap-more-x', (a) => a.map((x) => Math.round(x.getBoundingClientRect().height)));
  ok(rows.every((n) => n >= 44), 'fila táctil menor de 44 px: ' + rows);
  await axe(c.page, 'Hoja «Más» abierta');
  await shot(c.page, '11-movil-mas');
  await c.page.click('.ap-more-list a[data-tab="portfolio"]');
  await c.page.waitForSelector('dialog.ap-more:not([open])', { state: 'attached' });
  // el hash cambia al instante, pero hashchange (que repinta título y barra) llega en otra tarea: en el CI, más lento, se leía el título antiguo
  await c.page.waitForFunction(() => location.hash === '#/portfolio' && document.getElementById('ap-app-title').textContent === 'Portfolio');
  ok(await c.page.$eval('.ap-bar-more', (e) => e.classList.contains('is-on')), '«Más» no queda marcado');
  eq(await c.page.$('.ap-bar a[aria-current]'), null, 'queda una sección de la barra marcada');
  await c.page.click('.ap-bar-more');
  await c.page.waitForSelector('dialog.ap-more[open]');
  eq(await c.page.getAttribute('.ap-more-list a[data-tab="portfolio"]', 'aria-current'), 'page');
  await c.page.keyboard.press('Escape');
  await c.page.waitForSelector('dialog.ap-more:not([open])', { state: 'attached' });
  eq(await c.page.evaluate(() => document.activeElement.className.includes('ap-bar-more')), true, 'el foco no vuelve a «Más»');
  await c.page.click('.ap-bar-more');
  await c.page.click('.ap-more-out');
  await c.page.waitForSelector('#ap-lock:not([hidden])');
  ok(await c.page.isHidden('#ap-bar'), 'la barra se ve en la pantalla de acceso');
  eq(c.errors, []);
  await c.ctx.close();
});
await step('Barra inferior: se oculta en modo app y en escritorio (donde siguen las pestañas)', async () => {
  const m = await open({ width: 390, height: 844 }, '#/color');
  await m.page.waitForSelector('.cs');
  ok(await m.page.isHidden('.ap-bar'), 'la barra del área privada se ve dentro de una app');
  ok(await m.page.isVisible('.cs-nav'), 'sin la navegación propia de la app');
  await m.ctx.close();
  const d = await open(null, '#/');
  await d.page.waitForSelector('.ap-view > *');
  ok(await d.page.isHidden('.ap-bar'), 'barra inferior en escritorio');
  eq(await d.page.$$eval('.ap-tabs a', (a) => a.length), 10, 'pestañas en escritorio');
  ok(await d.page.isVisible('#ap-logout') && await d.page.isVisible('.ap-top-title'), 'escritorio cambiado');
  await d.ctx.close();
});
await step('Sesión caducada: vuelve a la pantalla de acceso sin enseñar datos', async () => {
  unauth = true;
  const c = await open(null, '#/color/armario');
  await c.page.waitForSelector('#ap-lock:not([hidden])');
  ok(await c.page.isHidden('#ap-app'), 'el área sigue visible');
  ok(await c.page.isVisible('.ap-top') && !(await c.page.evaluate(() => document.body.classList.contains('ap-in-app'))), 'la pantalla de acceso hereda el modo app');
  unauth = false;
  await c.ctx.close();
});
await step('Tablas sin crear: explica qué ejecutar y permite el modo ejemplo', async () => {
  missing = true;
  const c = await open(null, '#/color');
  await c.page.waitForSelector('.cs-setup');
  ok((await c.page.textContent('.cs-setup')).includes('supabase/color-studio.sql'), 'sin instrucciones');
  await c.page.click('.cs-setup button');
  await c.page.waitForSelector('.cs-demo');
  await c.page.click('.cs-demo .cs-link');
  await c.page.waitForSelector('.cs-setup');
  missing = false;
  eq(c.errors, []);
  await c.ctx.close();
});
/* ── Intro de bienvenida ── */
const introGone = (page, ms) => page.waitForSelector('.csi', { state: 'detached', timeout: ms || 8000 });
await step('Intro: con movimiento reducido no aparece', async () => {
  const c = await open(null, '#/color');
  await c.page.waitForTimeout(300);
  eq(await c.page.$('.csi'), null, 'la intro aparece con prefers-reduced-motion');
  await c.ctx.close();
});
await step('Intro: primera entrada → nombre a pantalla completa sobre #FBFBFB y transición a la aplicación (≈2 s)', async () => {
  const t0 = Date.now();
  const c = await open(null, '#/color', true, true);
  await c.page.waitForSelector('.csi');
  eq((await c.page.textContent('.csi-title')).replace(/\s+/g, ' ').trim(), 'Color Studio');
  eq(await c.page.$eval('.csi', (e) => getComputedStyle(e).backgroundColor), 'rgb(251, 251, 251)');
  eq(await c.page.getAttribute('.csi', 'aria-hidden'), 'true');
  const box = await c.page.$eval('.csi', (e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  eq(box, [1440, 1000], 'no ocupa la pantalla');
  await shot(c.page, '08-intro');
  await introGone(c.page);
  const ms = Date.now() - t0;
  ok(ms >= 1500 && ms < 4500, 'duración fuera de rango: ' + ms + ' ms');
  ok(await c.page.isVisible('.cs-nav'), 'la aplicación no está visible');
  await c.page.click('.cs-nav a[href="#/color/biblioteca"]');
  await c.page.waitForSelector('.cs[data-view="biblioteca"]');
  eq(await c.page.$('.csi'), null, 'se repite al cambiar de sección');
  await c.page.click('#ap-appbar-back');
  await c.page.waitForSelector('.apl-app');
  await c.page.click('.apl-app[data-app="color"]');
  await c.page.waitForSelector('.cs');
  await c.page.waitForTimeout(200);
  eq(await c.page.$('.csi'), null, 'se repite al volver a abrirla desde Apps');
  eq(c.errors, []);
  // recargar la página es una entrada nueva; un clic la adelanta
  await c.page.reload();
  await c.page.waitForSelector('.csi');
  await c.page.waitForTimeout(400);
  const t1 = Date.now();
  await c.page.mouse.click(700, 500);
  await introGone(c.page, 1500);
  ok(Date.now() - t1 < 1200, 'el clic no adelanta la salida');
  await c.ctx.close();
});
await step('Intro: móvil 390 px sin desbordes; salir de Color Studio durante la intro la quita', async () => {
  const c = await open({ width: 390, height: 844 }, '#/color', false, true);
  await c.page.waitForSelector('.csi.is-in');
  await c.page.waitForTimeout(900);
  const w = await c.page.$eval('.csi-title', (e) => e.getBoundingClientRect().width);
  ok(w <= 390 - 32, 'el título se sale en móvil: ' + w);
  eq(await c.page.evaluate(() => document.documentElement.scrollWidth), 390);
  await shot(c.page, '09-intro-movil');
  await c.page.evaluate(() => { location.hash = '#/apps'; });
  await c.page.waitForSelector('.csi', { state: 'detached', timeout: 1000 });
  await c.ctx.close();
});
await step('Intro: con carga lenta espera a los datos reales; con carga muy lenta no pasa de 6 s', async () => {
  readDelay = 2600;
  let t0 = Date.now();
  let c = await open(null, '#/color', false, true);
  await introGone(c.page);
  let ms = Date.now() - t0;
  ok(ms >= 2600 && ms < 4500, 'no se coordina con la carga: ' + ms + ' ms');
  ok(await c.page.isVisible('.cs-nav'), 'sin aplicación tras la intro');
  await c.ctx.close();
  readDelay = 9000;
  c = await open(null, '#/color', false, true);
  ms = await c.page.evaluate(() => window.__csiGone);
  ok(ms && ms < 7500, 'la intro retiene más de lo previsto: ' + ms + ' ms');
  readDelay = 0;
  await c.ctx.close();
});
await step('Intro: un error de sesión la quita y muestra el acceso', async () => {
  unauth = true;
  const c = await open(null, '#/color', false, true);
  await c.page.waitForSelector('#ap-lock:not([hidden])');
  await introGone(c.page, 2000);
  unauth = false;
  await c.ctx.close();
});
await step('Intro: CSP real sin violaciones', async () => {
  const c = await open(null, '#/color', true, true);
  await introGone(c.page);
  eq(await c.page.evaluate(() => window.__csp || []), []);
  eq(c.errors, []);
  await c.ctx.close();
});
await step('El resto del área privada sigue funcionando (Portfolio)', async () => {
  const c = await open(null, '#/portfolio');
  await c.page.waitForSelector('.ap-tabs a[data-tab="portfolio"][aria-current]');
  ok(await c.page.evaluate(() => getComputedStyle(document.body).backgroundColor) !== 'rgb(251, 251, 251)', 'el fondo de Color Studio se filtra a otras pestañas');
  ok(await c.page.isVisible('.ap-tabs') && await c.page.isHidden('#ap-appbar'), 'el modo app se filtra a otras pestañas');
  eq(await c.page.$('.ap-tabs a[data-tab="studio"]'), null, 'sigue la pestaña Studio');
  eq(await c.page.$('#ap-user'), null, 'sigue el email junto a «Cerrar sesión»');
  ok(!(await c.page.textContent('.ap-head')).includes('@'), 'hay un email en la cabecera');
  // reloj LCD: cada dígito lleva su cifra (data-v) y enciende los segmentos que le tocan
  const lcd = await c.page.evaluate(() => {
    const v = (k) => document.querySelector('[data-lcd="' + k + '"]').getAttribute('data-v');
    const on = (k) => document.querySelectorAll('[data-lcd="' + k + '"] .ap-lcd-s.is-on').length;
    return { day: document.querySelector('.ap-lcd-day.is-on').textContent, dd: v('d1') + v('d2'), mm: v('n1') + v('n2'), h: v('h1') + v('h2'), min: v('m1') + v('m2'),
      lit: ['h1', 'h2', 'm1', 'm2', 's1', 's2'].map((k) => [v(k), on(k)]), days: document.querySelectorAll('.ap-lcd-day.is-on').length, now: new Date() };
  });
  const t = new Date(), p2 = (n) => String(n).padStart(2, '0');
  eq(lcd.day, ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'][t.getDay()], 'día de la semana');
  eq(lcd.days, 1, 'más de un día encendido');
  eq(lcd.dd + '-' + lcd.mm, p2(t.getDate()) + '-' + p2(t.getMonth() + 1), 'fecha DD-MM');
  ok(Math.abs((+lcd.h * 60 + +lcd.min) - (t.getHours() * 60 + t.getMinutes())) <= 1, 'hora ' + lcd.h + ':' + lcd.min);
  const SEGS = { 0: 6, 1: 2, 2: 5, 3: 5, 4: 4, 5: 5, 6: 6, 7: 3, 8: 7, 9: 6 };
  ok(lcd.lit.every(([n, k]) => SEGS[n] === k), 'segmentos encendidos que no corresponden a su cifra: ' + JSON.stringify(lcd.lit));
  ok((await c.page.textContent('#ap-now-spoken')).includes(String(t.getFullYear())), 'sin fecha completa para lectores de pantalla');
  await c.ctx.close();
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(s + ' ' + n);
console.log('\n' + (results.length - failed) + ' de ' + results.length + ' comprobaciones correctas');
process.exit(failed ? 1 : 0);
