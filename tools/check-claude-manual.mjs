/* ═══════════════════════════════════════════════
   tools/check-claude-manual.mjs: prueba de la interfaz del Manual de Claude (área privada → Portfolio)
     npm i --no-save playwright axe-core && npx playwright install chromium
     node tools/check-claude-manual.mjs            (CLAUDE_SHOTS=<carpeta> guarda capturas)
   Sirve el sitio en local y sustituye Supabase por un PostgREST en memoria (solo cm_docs, portfolio y ap_opciones) con la
   semilla del manual. NO toca la base real. Siempre con la CSP real del área privada. Recorre: enlace desde Portfolio,
   inicio, temas (búsqueda), ficha (visual, quiz y progreso), mapa (selección, ruta, teclado, filtros, lista), glosario,
   buscador Ctrl K, aislamiento del Shadow DOM, saneado del HTML que llega de la base, tabla sin crear, tabla vacía,
   móvil sin scroll horizontal, tema oscuro y axe.
   ═══════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';
import { loadContent, toRows } from './claude-academy/load.mjs';

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
const { data } = await loadContent({ local: false, fixtures: true });
const real = await loadContent();   // tu .claude-academy/, si existe (en CI no existe: ese paso se omite)
const seedRows = toRows(data);
const HOSTILE = {
  id: 'topic:hostil', kind: 'topic', pos: 99,
  data: {
    id: 'hostil', b: 'prueba', t: 'Tema <img src=x onerror=window.__pwned=1> hostil', lvl: 1, q: 'Pregunta <script>window.__pwned=1</script>con script',
    one: 'Frase <b>segura</b> <i onclick="window.__pwned=1">cursiva</i> <a href="javascript:window.__pwned=1">enlace malo</a> <a href="https://example.com/ok">enlace bueno</a> <iframe src="https://evil.example"></iframe>',
    friend: 'f', steps: ['a', 'b', 'c'], ex: 'x', key: 'k', viz: 'guia-recorrer', vizNote: 'n',
    caso: { sec: 's', q: 'q', html: '<p style="color:red">texto <svg onload="window.__pwned=1"></svg></p>' }, yes: ['y'], no: ['n'], conf: [{ t: 'a', d: 'b' }], rec: ['a', 'b', 'c'],
    quiz: { q: 'q', o: ['a', 'b'], a: 0, w: 'w' }, pro: [{ k: 'k', t: 't' }], src: [{ t: 'Fuente <b>x</b>', k: 'oficial', u: 'javascript:alert(1)', d: '2026-10-01' }], kw: ['hostil', 'prueba'], rel: [], ver: { e: 'pendiente' },
  },
};
const BLOCK_X = { id: 'block:prueba', kind: 'block', pos: 1, data: { id: 'prueba', n: 1, t: 'Bloque de prueba', s: 'Solo para la prueba E2E.' } };
let docs = seedRows.concat(BLOCK_X, HOSTILE), missing = false;
async function route(r) {
  const req = r.request(), url = new URL(req.url()), method = req.method();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const json = (status, body) => r.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (/\/auth\/v1\/token/.test(url.pathname)) return json(200, { access_token: 'x', refresh_token: 'y', expires_in: 3600 });
  if (/\/auth\/v1\/user$/.test(url.pathname)) return json(200, { id: 'u', email: 'x@ejemplo.org' });
  const m = /\/rest\/v1\/(\w+)/.exec(url.pathname);
  if (!m) return json(200, {});
  if (m[1] === 'cm_docs') {
    if (missing) return json(404, { code: 'PGRST205', message: 'Could not find the table' });
    return json(200, docs.slice().sort((a, b) => a.pos - b.pos));
  }
  return json(200, []);
}

/* ── Utilidades ── */
const browser = await chromium.launch();
let failed = 0;
const results = [];
async function step(name, fn) {
  if (process.env.CLAUDE_ONLY && !name.includes(process.env.CLAUDE_ONLY)) return;
  try { await fn(); results.push(['✔', name]); } catch (e) { failed++; results.push(['✖', name + ' → ' + e.message.split('\n')[0]]); }
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'distinto') + ': esperado ' + JSON.stringify(b) + ', recibido ' + JSON.stringify(a)); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const shot = async (page, name) => { if (process.env.CLAUDE_SHOTS) await page.screenshot({ path: join(process.env.CLAUDE_SHOTS, name + '.png'), fullPage: true }); };
async function open(hash, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 1000 }, bypassCSP: false, hasTouch: !!(viewport && viewport.width < 600), reducedMotion: 'reduce' });
  await ctx.route(/googletagmanager|google-analytics|fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await ctx.route(/supabase\.co/, route);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('bm_ap_session', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'borja.mora.mendez@gmail.com' })); } catch (e) { /* noop */ }
    document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI + ' «' + (e.sample || '') + '» ' + location.hash); });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + hash);
  await page.waitForSelector(opts.wait || '.cm-host:not([hidden]) .wrap, .ap-empty, .app-section');
  return { ctx, page, errors };
}
async function axe(page, label) {
  await page.evaluate(AXE);      // por CDP: addScriptTag crearía un <script> en línea y la CSP real lo bloquea
  const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
  const v = r.violations.map((x) => x.id + ' (' + x.nodes.length + '): ' + x.nodes.slice(0, 2).map((n) => n.target.join(' ') + ' «' + n.html.slice(0, 90) + '» ' + ((n.any[0] && n.any[0].message) || '')).join(' | '));
  if (v.length) throw new Error(label + ': ' + v.join('; '));
}
const go = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(300); };
/* Los selectores de Playwright atraviesan el Shadow DOM abierto; no se usa new Function (la CSP real bloquea eval). */
const T = (page, sel) => page.$eval(sel, (e) => e.textContent);
const Tall = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim()));
const N = async (page, sel) => (await page.$$(sel)).length;
const Q = (page, sel, fn, arg) => page.$eval(sel, fn, arg);
const clean = async (c) => { eq(await c.page.evaluate(() => window.__csp || []), [], 'violaciones de CSP'); eq(c.errors, [], 'errores de JS'); };

await step('Portfolio: sección «Manuales privados» con enlace al manual dentro del área privada', async () => {
  const c = await open('#/portfolio', null, { wait: '.app-section' });
  const t = await c.page.textContent('#app-s-privados');
  ok(t.includes('Manuales privados'), 'sin sección');
  eq(await c.page.getAttribute('.app-card .app-link--main[href="#/claude"]', 'href'), '#/claude');
  await c.page.fill('#app-q', 'zzz-inexistente'); await c.page.waitForTimeout(150);
  eq(await c.page.$('#app-s-privados'), null, 'sale con una búsqueda que no encaja');
  await c.page.fill('#app-q', 'claude'); await c.page.waitForTimeout(150);
  ok(await c.page.$('#app-s-privados'), 'no sale al buscar «claude» aunque no haya nada más');
  await c.page.click('.app-link--main[href="#/claude"]');
  await c.page.waitForSelector('.cm-host:not([hidden]) .wrap');
  eq(await c.page.getAttribute('.ap-tabs a[data-tab="portfolio"]', 'aria-current'), 'page', 'la pestaña Portfolio no queda activa');
  await clean(c); await c.ctx.close();
});

await step('Inicio: Shadow DOM aislado, datos de la semilla y sin violaciones de CSP', async () => {
  const c = await open('#/claude');
  const info = await c.page.evaluate(() => {
    const h = document.querySelector('.cm-host'), r = h.shadowRoot;
    return { title: r.querySelector('h1').textContent, stats: [...r.querySelectorAll('.hs .n')].map((n) => n.textContent), docLinks: document.querySelectorAll('link[href*="claude-manual.css"][rel=stylesheet]').length,
      sheets: [...document.styleSheets].filter((s) => /claude-manual/.test(s.href || '')).length, bodyMargin: getComputedStyle(document.body).marginLeft, inShadow: r.querySelectorAll('link[rel=stylesheet]').length, bar: r.querySelector('.bar i').style.width };
  });
  eq(info.title, 'Manual de Claude'); eq(info.stats, ['6', '2', '0', '5'], 'estadísticas');
  eq(info.docLinks + info.sheets, 0, 'la hoja del manual se ha colado en el documento'); eq(info.inShadow, 1);
  ok(info.bar === '0%', 'barra de progreso sin ancho por CSSOM: ' + info.bar);
  const font = await c.page.evaluate(() => [getComputedStyle(document.querySelector('.ap-top')).fontFamily, getComputedStyle(document.querySelector('.cm-host').shadowRoot.querySelector('h1')).fontFamily]);
  ok(/Newsreader/.test(font[1]), 'el título no usa la tipografía del manual'); ok(font[0] !== font[1], 'el área privada hereda la tipografía del manual');
  await shot(c.page, 'inicio'); await clean(c); await c.ctx.close();
});

await step('Temas: búsqueda por palabras sueltas y sin tildes; filtros', async () => {
  const c = await open('#/claude/temas');
  const count = () => T(c.page, '#tcount');
  ok((await count()).startsWith('6'), 'esperaba 6 temas (5 de la semilla y el hostil): ' + await count());
  await c.page.fill('#tq', 'por donde empiezo');
  eq(await Tall(c.page, '#tcards h3'), ['Cómo recorrer el manual']);
  await c.page.fill('#tq', '');
  await c.page.click('#tfl [data-v="2"]');
  eq(await Tall(c.page, '#tcards h3'), ['Cómo leer el mapa mental'], 'filtro por nivel');
  await clean(c); await c.ctx.close();
});

await step('Ficha: visual, quiz (acierto guarda progreso), «Dónde encaja» y navegación', async () => {
  const c = await open('#/claude/tema/guia-recorrer');
  eq(await T(c.page, '.cm-host h1'), 'Cómo recorrer el manual');
  await c.page.click('#vizHost .vz-row >> nth=0'); await c.page.click('#vizHost .vz-row >> nth=0');
  eq(await T(c.page, '#vz-bt'), '1 de 5 entendidos · 20 %');
  eq(await Q(c.page, '#vz-bi', (e) => e.style.width), '20%', 'ancho por CSSOM');
  await c.page.click('#topicQuiz [data-o="1"]');
  eq(await T(c.page, '#progLbl'), 'Lo entiendo');
  eq(JSON.parse(await c.page.evaluate(() => localStorage.getItem('bm_cm_prog')))['guia-recorrer'], 2, 'progreso en localStorage');
  await c.page.click('.dnav .nx'); await c.page.waitForTimeout(300);
  eq(await c.page.evaluate(() => location.hash), '#/claude/tema/guia-fichas');
  ok((await T(c.page, '.ca-pre')).includes('Cómo recorrer el manual'), 'sin «Antes de empezar»');
  await go(c.page, '#/claude/tema/guia-mapa');
  const route = await Tall(c.page, '#s-encaja .ca-gl');
  ok(route.some((x) => /necesita conocer/i.test(x)), 'sin relaciones: ' + route);
  await go(c.page, '#/claude/tema/guia-busqueda');
  ok((await T(c.page, '#s-lab')).includes('Resultado esperado'), 'sin ejercicio guiado');
  await go(c.page, '#/claude/tema/no-existe'); eq(await c.page.evaluate(() => location.hash), '#/claude/temas', 'tema inexistente no redirige');
  await shot(c.page, 'ficha'); await clean(c); await c.ctx.close();
});

await step('Mapa: selección, ruta de aprendizaje, teclado, filtros, lista y hash compartible', async () => {
  const c = await open('#/claude/mapa/guia-mapa');
  eq(await T(c.page, '#ca-panel h3'), 'Cómo leer el mapa mental');
  eq(await Tall(c.page, '#ca-panel .ca-route li'), ['Cómo recorrer el manual', 'Cómo está hecha una ficha', 'Cómo leer el mapa mental']);
  await c.page.focus('[data-n="guia-fichas"] [role=button]'); await c.page.keyboard.press('Enter');
  eq(await c.page.evaluate(() => location.hash), '#/claude/mapa/guia-fichas', 'Intro no selecciona');
  await c.page.keyboard.press('Enter'); await c.page.waitForTimeout(300);
  eq(await c.page.evaluate(() => location.hash), '#/claude/tema/guia-fichas', 'segundo Intro no abre la ficha');
  await go(c.page, '#/claude/mapa');
  await c.page.click('#ca-fs [data-v="2"]');
  eq(await T(c.page, '#ca-status'), '0 temas coinciden de 6');
  await c.page.click('#ca-fs [data-v=""]');
  await c.page.click('#ca-mode [data-v="lista"]');
  eq(await Q(c.page, '#ca-stage', (e) => getComputedStyle(e).display), 'none', 'la lista no oculta el mapa');
  ok((await N(c.page, '#ca-list .ca-go')) >= 6, 'lista incompleta');
  await c.page.click('#ca-mode [data-v="mapa"]');
  await shot(c.page, 'mapa'); await clean(c); await c.ctx.close();
});

await step('Glosario y buscador Ctrl K (dentro del Shadow DOM)', async () => {
  const c = await open('#/claude/glosario');
  eq(await N(c.page, '.cm-host .card'), 10);
  await c.page.keyboard.press('Control+k');
  await c.page.waitForSelector('.qk-box');
  await c.page.fill('.qk-box input', 'por donde empiezo');
  eq(await T(c.page, '.qk-it .qn'), 'Cómo recorrer el manual');
  await c.page.keyboard.press('Enter'); await c.page.waitForTimeout(300);
  eq(await c.page.evaluate(() => location.hash), '#/claude/tema/guia-recorrer');
  await c.page.click('.ap-tabs a[data-tab="hoy"]').catch(() => {});
  await clean(c); await c.ctx.close();
});

await step('El HTML que llega de la base se sanea: sin scripts, manejadores, iframes ni enlaces javascript:', async () => {
  const c = await open('#/claude/tema/hostil');
  const out = await c.page.evaluate(() => {
    const r = document.querySelector('.cm-host').shadowRoot;
    return { pwned: window.__pwned === undefined, script: !!r.querySelector('script'), iframe: !!r.querySelector('iframe'), svg: !!r.querySelector('#detail svg'), onattr: [...r.querySelectorAll('*')].some((e) => [...e.attributes].some((a) => /^on/i.test(a.name))), style: !!r.querySelector('#s-caso [style]'),
      js: !!r.querySelector('a[href^="javascript:"]'), good: !!r.querySelector('a[href="https://example.com/ok"][rel="noopener noreferrer"]'), bold: !!r.querySelector('#s-frase b'), h1: r.querySelector('h1').textContent, srcLink: !!r.querySelector('.ca-src a') };
  });
  ok(out.pwned, 'se ejecutó código del contenido'); ok(!out.script && !out.iframe && !out.svg && !out.onattr && !out.style && !out.js, 'quedó algo peligroso: ' + JSON.stringify(out));
  ok(out.good && out.bold, 'el saneado quitó lo que debía respetar'); ok(out.h1.includes('<img'), 'el título debería mostrarse como texto, no como HTML: ' + out.h1); eq(out.srcLink, false, 'una URL no https se pintó como enlace');
  await go(c.page, '#/claude/temas');
  ok(!(await Q(c.page, '#tcards', (e) => e.innerHTML)).includes('<img'), 'el título se pintó como HTML en el catálogo');
  // Al analizar el HTML hostil el navegador informa de los manejadores y estilos en línea que la CSP habría bloqueado (defensa en profundidad):
  // es lo esperado. Lo que no puede aparecer es ninguna otra violación (scripts, hojas, conexiones) ni errores de JS.
  const csp = await c.page.evaluate(() => window.__csp || []);
  ok(csp.every((v) => /^(script|style)-src-attr inline/.test(v)), 'violaciones de CSP inesperadas: ' + csp.join(' | '));
  eq(c.errors.filter((e) => !/Content Security Policy/.test(e)), [], 'errores de JS');   // la consola avisa de lo bloqueado: es lo esperado
  await c.ctx.close();
});

await step('Visuales genéricos (escala, pestañas, precedencia): se pintan desde vizData, escapados y sin estilos en línea', async () => {
  const mk = (id, viz, vizData) => ({ id: 'topic:' + id, kind: 'topic', pos: 50, data: {
    id, b: 'prueba', t: 'Visual ' + viz, lvl: 1, q: 'q', one: 'o', friend: 'f', steps: ['a', 'b', 'c'], ex: 'x', key: 'k', viz, vizNote: 'n', vizData,
    caso: { sec: 's', q: 'q', html: '<p>c</p>' }, yes: ['y'], no: ['n'], conf: [{ t: 'a', d: 'b' }], rec: ['a', 'b', 'c'], quiz: { q: 'q', o: ['a', 'b'], a: 0, w: 'w' },
    pro: [{ k: 'k', t: 't' }], src: [{ t: 's', k: 'interna' }], kw: ['x', 'y'], rel: [], ver: { e: 'pendiente' },
    code: [{ l: 'bash', t: 'prueba', s: '# comentario\nclaude --effort low\n-- otro comentario' }] } });
  const keep = docs;
  docs = docs.concat(
    mk('v-escala', 'escala', { titulo: 'Escala <b>x</b>', max: 5, dims: ['Lectura', 'Verificación'], niveles: [{ n: 'bajo', d: 'Poco <img src=x onerror=window.__pwned=1>', m: [1, 0] }, { n: 'alto', d: 'Mucho', m: [5, 4] }] }),
    mk('v-pestanas', 'pestanas', { titulo: 'Pestañas', pestanas: [{ n: 'Uno', items: ['a <i>b</i>'], fin: 'Fin uno' }, { n: 'Dos', t: 'Subtítulo', items: ['c'] }] }),
    mk('v-precedencia', 'precedencia', { titulo: 'Capas', etiqueta: 'Gana', vacio: 'el de fábrica', capas: [{ t: 'Arriba', d: 'La más fuerte', v: ['a', 'b'] }, { t: 'Medio', d: 'La segunda', v: ['c'] }, { t: 'Fábrica', d: 'Siempre', fija: true }] }),
    mk('v-vacio', 'escala', undefined));   // sin vizData: no debe romper la ficha
  try {
    let c = await open('#/claude/tema/v-escala');
    eq(await Tall(c.page, '#vizHost .viz-ctrl button'), ['bajo', 'alto']);
    ok((await T(c.page, '#vizHost .vz-h')) === 'bajo', 'el nivel inicial no es el primero');
    eq(await N(c.page, '#vizHost .vz-dim:first-of-type .vz-meter i.on'), 1, 'barras llenas en «bajo»');
    ok(!(await Q(c.page, '#vizHost', (e) => e.innerHTML)).includes('<img'), 'el texto de vizData se pintó como HTML');
    ok((await T(c.page, '#vizHost .vt')).includes('<b>x</b>'), 'el título del visual debería verse como texto');
    await c.page.click('#vizHost .viz-ctrl button >> nth=1');
    eq(await Tall(c.page, '#vizHost .vz-meter'), ['', ''], 'las barras no llevan texto');
    eq(await c.page.$$eval('#vizHost .vz-meter', (els) => els.map((e) => e.getAttribute('aria-label') + '|' + e.querySelectorAll('i.on').length)), ['Lectura: 5 de 5|5', 'Verificación: 4 de 5|4']);
    eq(await c.page.evaluate(() => window.__pwned), undefined, 'se ejecutó código de vizData');
    eq(await Tall(c.page, '.dcode .c'), ['# comentario', '-- otro comentario'], 'un flag --x se pintó como comentario');
    eq(await Q(c.page, '.dcode code', (e) => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)', 'el <code> del bloque de código hereda el fondo de las etiquetas en línea');
    await clean(c); await axe(c.page, 'escala'); await c.ctx.close();
    c = await open('#/claude/tema/v-pestanas');
    eq(await T(c.page, '#vizHost .vz-big'), 'Fin uno');
    await c.page.click('#vizHost .viz-ctrl button >> nth=1');
    eq(await T(c.page, '#vizHost .vz-q'), 'Subtítulo'); eq(await N(c.page, '#vizHost .vz-big'), 0, 'sin conclusión no debería pintarse');
    eq(await c.page.$$eval('#vizHost .viz-ctrl button', (b) => b.map((x) => x.getAttribute('aria-pressed'))), ['false', 'true']);
    await clean(c); await axe(c.page, 'pestañas'); await c.ctx.close();
    c = await open('#/claude/tema/v-precedencia');
    eq(await T(c.page, '#vz-w'), 'Gana: el de fábrica · lo fija la capa 3 (Fábrica).');
    await c.page.selectOption('select[data-i="1"]', 'c');
    eq(await T(c.page, '#vz-w'), 'Gana: c · lo fija la capa 2 (Medio).');
    await c.page.selectOption('select[data-i="0"]', 'b');
    eq(await T(c.page, '#vz-w'), 'Gana: b · lo fija la capa 1 (Arriba).');
    eq(await c.page.$$eval('.vz-lay.on', (e) => e.length), 1, 'solo una capa activa');
    await c.page.click('#vz-rs');
    eq(await T(c.page, '#vz-w'), 'Gana: el de fábrica · lo fija la capa 3 (Fábrica).');
    await shot(c.page, 'visual-precedencia'); await clean(c); await axe(c.page, 'precedencia'); await c.ctx.close();
    c = await open('#/claude/tema/v-vacio');
    eq(await c.page.$$eval('.cm-host h1', (e) => e.length), 1, 'la ficha sin vizData no se pintó');
    await c.ctx.close();
  } finally { docs = keep; }
});

if (real.hasLocal && real.data.TOPICS.length) await step('Contenido real (.claude-academy/): cada ficha se pinta, sin errores, con visual y axe', async () => {
  const keep = docs; docs = toRows(real.data);
  try {
    const c = await open('#/claude');
    ok((await Tall(c.page, '.hs .n')).length === 4, 'sin estadísticas en el inicio');
    await shot(c.page, 'real-inicio');
    for (const t of real.data.TOPICS) {
      await go(c.page, '#/claude/tema/' + t.id);
      await c.page.waitForSelector('#vizHost .viz-b > *', { timeout: 3000 });
      ok(!/no disponible|No se pudo cargar|no tiene datos/.test(await T(c.page, '#vizHost')), t.id + ': el visual no se pintó');
      eq(await T(c.page, '.cm-host h1'), t.t, t.id + ': título');
      ok((await N(c.page, '#detail .ca-src')) >= 1, t.id + ': sin fuente');
      await shot(c.page, 'real-' + t.id);
      await axe(c.page, t.id);
    }
    await go(c.page, '#/claude/mapa'); await shot(c.page, 'real-mapa');
    await go(c.page, '#/claude/glosario'); await axe(c.page, 'glosario real');
    eq(c.errors.filter((e) => !/Content Security Policy/.test(e)), [], 'errores de JS');
    await c.ctx.close();
  } finally { docs = keep; }
});

await step('Tabla sin crear y tabla vacía: mensajes claros', async () => {
  missing = true;
  let c = await open('#/claude', null, { wait: '.ap-empty' });
  ok((await c.page.textContent('.ap-empty-title')).includes('aún no está creado'), 'sin aviso de tabla sin crear');
  await c.ctx.close(); missing = false;
  const keep = docs; docs = [];
  c = await open('#/claude', null, { wait: '.ap-empty' });
  ok((await c.page.textContent('.ap-empty-title')).includes('todavía no tiene contenido'), 'sin aviso de tabla vacía');
  await c.ctx.close(); docs = keep;
});

await step('Móvil (390 px táctil): lista por defecto, sin scroll horizontal en ninguna vista', async () => {
  const c = await open('#/claude', { width: 390, height: 844 });
  for (const h of ['#/claude', '#/claude/temas', '#/claude/mapa', '#/claude/glosario', '#/claude/tema/guia-mapa']) {
    await go(c.page, h);
    const w = await c.page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    ok(w[0] <= w[1], h + ': scroll horizontal ' + w);
  }
  await go(c.page, '#/claude/mapa'); eq(await Q(c.page, '.ca-wrap', (e) => e.dataset.mode), 'lista');
  await clean(c); await c.ctx.close();
});

await step('Tema oscuro y axe (WCAG 2.2 AA) en inicio, temas, mapa con selección, ficha y glosario', async () => {
  const c = await open('#/claude');
  for (const h of ['#/claude', '#/claude/temas', '#/claude/mapa/guia-mapa', '#/claude/tema/guia-fuentes', '#/claude/glosario']) { await go(c.page, h); await axe(c.page, 'claro ' + h); }
  await c.page.click('#themeBtn'); await c.page.waitForTimeout(150);
  eq(await c.page.evaluate(() => document.querySelector('.cm-host').getAttribute('data-theme')), 'dark');
  for (const h of ['#/claude', '#/claude/mapa/guia-mapa', '#/claude/tema/guia-fuentes']) { await go(c.page, h); await axe(c.page, 'oscuro ' + h); }
  await shot(c.page, 'oscuro');
  eq(c.errors.filter((e) => !/Content Security Policy/.test(e)), [], 'errores de JS');   // la CSP no se mide aquí: axe inyecta su propia hoja y pide las fuentes de Google por fetch
  await c.ctx.close();
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(s + ' ' + n);
console.log('\n' + (results.length - failed) + ' de ' + results.length + ' comprobaciones correctas');
process.exit(failed ? 1 : 0);
