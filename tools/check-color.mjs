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
const db = { cs_garments: [], cs_palettes: [], cs_outfits: [] };
const objects = new Map();                     // ruta en el bucket → { body, type }
let failWrites = false, missing = false, unauth = false, readDelay = 0;
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
  if (t === 'cs_outfits') {
    if (!r.name) return 'name';
    if (!Array.isArray(r.items) || r.items.some((i) => !i.slot || i.weight < 0 || (!i.garment_id && !HEX.test(i.hex || '')))) return 'items';
  }
  return null;
}
const DEFAULT_ROW = {
  cs_garments: { name: null, subcategory: null, image_path: null, secondary_colors: [], color_shares: null, pattern: 'liso', material: null, notes: null },
  cs_palettes: { name: null, tags: [], source_type: 'own', source_title: null, source_url: null, source_notes: null, notes: null, is_favorite: false },
  cs_outfits: { items: [], palette_id: null, distribution_override: null, occasion: null, formality: null, notes: null, is_favorite: false }
};
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
  const so = /\/storage\/v1\/object\/(?:authenticated\/)?armario\/?(.*)$/.exec(url.pathname);
  if (so) {
    const path = decodeURIComponent(so[1]);
    if (method === 'GET') { const o = objects.get(path); return o ? r.fulfill({ status: 200, headers: cors, contentType: o.type, body: o.body }) : json(404, { message: 'Object not found' }); }
    if (failWrites) return json(500, { message: 'Fallo simulado de guardado' });
    if (method === 'POST') { log.push('UPLOAD ' + path); objects.set(path, { body: req.postDataBuffer(), type: req.headers()['content-type'] }); return json(200, { Key: 'armario/' + path }); }
    if (method === 'DELETE') { const { prefixes } = JSON.parse(req.postData()); prefixes.forEach((p) => objects.delete(p)); log.push('DELETE-OBJ ' + prefixes.join(',')); return json(200, []); }
  }
  const m = /\/rest\/v1\/(\w+)/.exec(url.pathname);
  if (!m) return json(200, {});
  const t = m[1];
  if (!(t in db)) return json(200, []);
  if (missing) return json(404, { code: 'PGRST205', message: 'Could not find the table' });
  const rows = db[t], params = [...url.searchParams.entries()];
  if (method === 'GET') { if (readDelay) await new Promise((res) => setTimeout(res, readDelay)); return json(200, rows.filter((x) => matches(x, params))); }
  log.push(method + ' ' + t);
  if (failWrites) return json(500, { message: 'Fallo simulado de guardado' });
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const now = new Date().toISOString();
  if (method === 'POST') {
    const list = [].concat(body).map((b) => Object.assign({ id: uid(), created_at: now, updated_at: now }, DEFAULT_ROW[t], b));
    const bad = list.map((x) => check(t, x)).find(Boolean);
    if (bad) return json(400, { message: 'violates check constraint (' + bad + ')' });
    rows.push(...list);
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
    hit.forEach((x) => rows.splice(rows.indexOf(x), 1));
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

await step('Navegación: modo app en #/color (sin cabecera, pestañas ni pie del área privada) y cuatro secciones', async () => {
  for (const sel of ['.ap-top', '.ap-tabs', '.ap-foot', '#ap-logout']) ok(await page.isHidden(sel), sel + ' visible dentro de la app');
  eq(await page.getAttribute('#ap-appbar-back', 'href'), '#/apps');
  ok(await page.isVisible('#ap-appbar-back'), 'sin «Volver al área privada»');
  eq(await page.$$eval('.cs-nav a', (a) => a.map((x) => x.textContent.trim())), ['Studio', 'Biblioteca', 'Armario', 'Calcetines']);
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
  await p.selectOption('#cs-s-shoe', 'loafer');
  await p.waitForFunction(() => document.querySelector('.cs-socks').textContent.includes('mocasín'));
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
  for (const h of ['#/color', '#/color/biblioteca', '#/color/armario', '#/color/calcetines']) { await go(page, h); await axe(page, h); }
  await go(page, '#/color/biblioteca');
  await page.click('[data-key="new-pal"]');
  await page.waitForSelector('dialog[open] #cs-p-name');
  await axe(page, 'formulario de paleta');
  await page.click('dialog[open] button:has-text("Cancelar")');
});
await step('Sin errores de JavaScript en la sesión de escritorio', async () => { eq(errors, []); });
await ctx.close();

await step('Móvil 390 px: barra inferior fija, sin scroll horizontal y axe en las cuatro vistas', async () => {
  const m = await open({ width: 390, height: 844 }, '#/color');
  for (const h of ['#/color', '#/color/biblioteca', '#/color/armario', '#/color/calcetines']) {
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
  await c.page.waitForFunction(() => [...document.querySelectorAll('.apl-icon')].every((i) => i.complete));
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
await step('Móvil: cabecera compacta y barra inferior (Hoy, Apps, Calendario, Entrevistas, Más); sin pestañas arriba', async () => {
  const c = await open({ width: 390, height: 844 }, '#/');
  await c.page.waitForSelector('.ap-bar-a');
  ok(await c.page.isVisible('.ap-bar'), 'sin barra inferior');
  eq(await c.page.$$eval('.ap-bar > *', (a) => a.map((x) => x.textContent.trim())), ['Hoy', 'Apps', 'Calendario', 'Entrevistas', 'Más']);
  for (const sel of ['.ap-tabs', '#ap-logout', '.ap-top-title']) ok(await c.page.isHidden(sel), sel + ' visible en móvil');
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
  eq(await c.page.$$eval('.ap-more-list a', (a) => a.map((x) => x.textContent.trim())), ['Portfolio', 'Second Brain', 'Mapa', 'Archivos y notas', 'Fichero', 'Configuración']);
  ok((await c.page.textContent('.ap-more-out')).includes('Cerrar sesión'), 'sin «Cerrar sesión» en la hoja');
  const rows = await c.page.$$eval('.ap-more-a, .ap-more-x', (a) => a.map((x) => Math.round(x.getBoundingClientRect().height)));
  ok(rows.every((n) => n >= 44), 'fila táctil menor de 44 px: ' + rows);
  await axe(c.page, 'Hoja «Más» abierta');
  await shot(c.page, '11-movil-mas');
  await c.page.click('.ap-more-list a[data-tab="portfolio"]');
  await c.page.waitForSelector('dialog.ap-more:not([open])', { state: 'attached' });
  eq(await c.page.evaluate(() => location.hash), '#/portfolio');
  eq(await c.page.textContent('#ap-app-title'), 'Portfolio');
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
