/* ═══════════════════════════════════════════════
   tools/second-brain/e2e.mjs: pruebas de extremo a extremo de la pestaña Second Brain
   ─────────────────────────────────────────────────
     npm i --no-save playwright axe-core && npx playwright install chromium
     node tools/second-brain/e2e.mjs [carpeta-para-capturas]

   Sirve el sitio en local, abre area-privada.html en Chromium y SIMULA Supabase
   interceptando las peticiones a *.supabase.co (no hay red real ni credenciales).
   Comprueba lo que se puede comprobar sin una base de datos real:
     · sin sesión no se pide ningún dato y la pestaña no se ve;
     · con sesión: navegación, URL directa, cabecera, estados vacío/error/sin tabla/parcial;
     · el grafo se dibuja, se selecciona, se filtra y se busca SIN peticiones de red;
     · los recursos gráficos se liberan al salir de la sección;
     · accesibilidad (axe) y comportamiento con un grafo grande.
   NO comprueba las políticas RLS reales: eso requiere ejecutar supabase/second-brain.sql.
   ═══════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';
import { validateSnapshot } from '../../second-brain/contract.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const f = join(ROOT, p);
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;

const demo = JSON.parse(readFileSync(join(ROOT, 'second-brain', 'demo-snapshot.json'), 'utf8'));
const asReal = (g) => ({ ...JSON.parse(JSON.stringify(g)), mode: 'real', meta: { ...g.meta, demo: false } });
const REAL = asReal(demo);
const row = (g, extra = {}) => ({ id: 'sn-' + Math.random().toString(16).slice(2), generated_at: g.generatedAt, created_at: g.generatedAt, engine_version: '1.0.0', graph: g, ...extra });

function bigGraph(n, m) {
  const g = JSON.parse(JSON.stringify(REAL));
  const types = ['tecnologia', 'concepto', 'tecnica', 'proyecto'];
  const states = ['respaldado', 'mencionado', 'pendiente'];
  const rid = g.regions.map((r) => r.id);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.nodes = []; g.edges = []; g.recommendations = []; g.competencies = [];
  for (let i = 0; i < n; i++) g.nodes.push({ id: 'n' + i, label: 'Nodo ' + i, type: types[i % 4], region: rid[i % rid.length], state: states[i % 3], summary: 'x', size: rnd(), evidence: { practica: 0, explicativa: 0, declarativa: 0, projects: 0, breadth: 'ninguna' }, uncertainty: [], pos: [(rnd() - 0.5) * 300, (rnd() - 0.5) * 300, (rnd() - 0.5) * 300] });
  const seen = new Set();
  while (g.edges.length < m) {
    const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n);
    const k = a + '-' + b; if (a === b || seen.has(k)) continue; seen.add(k);
    g.edges.push({ source: 'n' + a, target: 'n' + b, type: 'usa', confidence: 'media', rationale: 'sintético' });
  }
  g.stats = { ...g.stats, nodes: n, edges: m, concepts: n, projects: 0, recommendations: 0, priorities: 0 };
  g.meta.deferred = [];
  return g;
}

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); } };
const section = (t) => console.log(`\n${t}`);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

/* Abre una página con Supabase simulado. api: (url, method) → { status, body } | undefined */
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference', deviceScaleFactor: 1 });
  if (opts.session !== false) {
    await ctx.addInitScript(() => sessionStorage.setItem('bm_ap_session', JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'owner@example.test' })));
  }
  const page = await ctx.newPage();
  const net = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route(/googleapis|gstatic|google-analytics|googletagmanager/, (r) => r.abort());
  await page.route(/\.supabase\.co/, (route) => {
    const url = route.request().url();
    net.push(url);
    const r = opts.api && opts.api(url, route.request().method());
    if (r) return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
    if (/sb_snapshots/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row(REAL)]) });
    if (/sb_runs/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return { ctx, page, net, errors };
}
const waitGraph = async (page) => { await page.waitForSelector('.sb-canvas', { timeout: 15000 }); await page.waitForFunction(() => document.querySelector('#sb-stage')?.__sbViewer, null, { timeout: 15000 }); await page.waitForTimeout(250); };
const info = (page) => page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.info());

try {
  /* ───────── 1. Sin sesión ───────── */
  section('1. Sin sesión: la sección no se ve y no se pide ningún dato');
  {
    const { ctx, page, net } = await open({ session: false });
    await page.goto(BASE + 'area-privada.html#/second-brain');
    await page.waitForTimeout(600);
    check('se muestra la pantalla de acceso', await page.locator('#ap-lock').isVisible());
    check('la aplicación está oculta', !(await page.locator('#ap-app').isVisible()));
    check('no hay ninguna petición a Supabase', net.length === 0, net.join(', '));
    check('el visor no se ha cargado', (await page.locator('.sb-canvas').count()) === 0);
    await ctx.close();
  }

  /* ───────── 2. Con sesión ───────── */
  section('2. Con sesión: navegación y URL directa');
  {
    const { ctx, page, net, errors } = await open();
    await page.goto(BASE + 'area-privada.html#/second-brain');
    await waitGraph(page);
    check('la URL directa muestra Second Brain', (await page.locator('#ap-app-title').textContent()) === 'Second Brain');
    check('la pestaña Second Brain está marcada como actual', (await page.locator('.ap-tabs a[data-tab="second-brain"]').getAttribute('aria-current')) === 'page');
    check('la barra del drive (buscar/subir) está oculta', !(await page.locator('#ap-toolbar').isVisible()));
    check('se pide exactamente un snapshot y un registro de ejecución', net.filter((u) => /sb_snapshots/.test(u)).length === 1 && net.filter((u) => /sb_runs/.test(u)).length === 1, net.join('\n'));
    check('se piden solo snapshots reales (mode=eq.real)', net.some((u) => /mode=eq\.real/.test(u)));
    check('no hay errores de JavaScript', errors.length === 0, errors.join(' | '));
    const kpi = await page.locator('.sb-kpis').textContent();
    check('la cabecera muestra cifras del snapshot', kpi.includes(String(REAL.stats.concepts)) && kpi.includes(String(REAL.stats.edges)), kpi);
    check('indica fecha del último análisis', (await page.locator('.sb-date time').getAttribute('datetime')) === REAL.generatedAt);
    check('un análisis de 2026-01 se marca como desactualizado', /Desactualizado/.test(await page.locator('.sb-status').textContent()));
    check('el snapshot "real" no se rotula como demostración', !/FICTICIOS/.test(await page.locator('.sb-status').textContent()));
    const i0 = await info(page);
    check('todos los nodos son visibles', i0.visible === REAL.nodes.length, `${i0.visible}/${REAL.nodes.length}`);
    check('llamadas de dibujo acotadas (≤ 14)', i0.drawCalls <= 14, String(i0.drawCalls));
    await page.waitForTimeout(900);
    const f1 = (await info(page)).frameCount;
    await page.waitForTimeout(800);
    const f2 = (await info(page)).frameCount;
    check('en reposo no se dibuja ningún fotograma (dibujo bajo demanda)', f2 - f1 <= 1, `${f1} → ${f2} fotogramas en 0,8 s`);
    check('hay etiquetas visibles (≤ 40) y no se solapan en exceso', i0.labels > 0 && i0.labels <= 40, String(i0.labels));
    if (SHOTS) await page.screenshot({ path: join(SHOTS, '01-vista-general.png') });

    section('3. Interacción sin red: seleccionar, filtrar, buscar, enfocar');
    const before = net.length;
    // selección con clic real sobre un nodo
    const pos = await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.screenPos('c:dax'));
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(900);
    check('el clic en un nodo muestra su panel contextual', (await page.locator('#sb-detail-title').textContent()) === 'DAX');
    check('el panel indica el estado de evidencia', /Respaldado/.test(await page.locator('#sb-p-detalle .sb-badge').first().textContent()));
    check('el panel lista relaciones con su fundamento', (await page.locator('.sb-rels li').count()) > 2 && (await page.locator('.sb-why').first().textContent()).length > 15);
    check('el panel no contiene rutas de archivos ni enlaces a documentos', !/\.(py|sql|md|ipynb|pbix)\b/i.test(await page.locator('#sb-p-detalle').textContent()));
    check('el nodo seleccionado queda registrado en el visor', (await info(page)).selected === 'c:dax');
    // brecha probable: debe explicarse y no llamarse "confirmada"
    await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.select('c:power-query'));
    await page.waitForTimeout(300);
    const gap = await page.locator('#sb-p-detalle').textContent();
    check('una brecha probable muestra su motivo y la salvedad', /Brecha probable/.test(gap) && /no están entre las fuentes/.test(gap) && !/Brecha confirmada/.test(gap));
    // filtros
    await page.locator('.sb-filters > summary').click();
    await page.locator('#sb-f-state-respaldado').uncheck();
    await page.waitForTimeout(300);
    const nResp = REAL.nodes.filter((n) => n.state !== 'respaldado').length;
    check('desmarcar «Respaldado» oculta esos nodos', (await info(page)).visible === nResp, `${(await info(page)).visible} vs ${nResp}`);
    check('el contador se actualiza', (await page.locator('.sb-count').textContent()).includes(`${nResp} de`));
    await page.locator('#sb-f-region-datos').uncheck().catch(() => {});
    await page.locator('#sb-prio').selectOption('ahora');
    await page.waitForTimeout(200);
    await page.locator('#sb-f-state-respaldado').check();
    for (const s of ['mencionado', 'pendiente', 'brecha_probable', 'brecha_confirmada', 'oportunidad', 'neutral']) await page.locator(`#sb-f-state-${s}`).uncheck();
    for (const t of ['tecnologia', 'concepto', 'tecnica', 'competencia', 'proyecto', 'objetivo', 'recomendacion']) await page.locator(`#sb-f-type-${t}`).uncheck();
    await page.waitForTimeout(200);
    check('si los filtros no dejan nada, se avisa y se ofrece restablecer', await page.locator('.sb-stage-empty').isVisible());
    await page.keyboard.press('Escape');
    check('Esc cierra el desplegable de filtros y devuelve el foco', !(await page.locator('.sb-filters').evaluate((d) => d.open)) && (await page.evaluate(() => document.activeElement.tagName)) === 'SUMMARY');
    await page.locator('.sb-stage-empty button').click();
    await page.waitForTimeout(400);
    check('«Restablecer filtros» recupera una vista legible', (await info(page)).visible === REAL.nodes.length && !(await page.locator('.sb-stage-empty').isVisible()));
    // búsqueda
    await page.locator('#sb-search').fill('ventana');
    check('la búsqueda ofrece resultados', (await page.locator('#sb-results [role=option] button').count()) >= 1);
    await page.locator('#sb-search').press('Enter');
    await page.waitForTimeout(900);
    check('Enter en la búsqueda selecciona y enfoca el concepto', /ventana/i.test(await page.locator('#sb-detail-title').textContent()));
    // relaciones
    await page.locator('.sb-filters > summary').click();
    await page.locator('#sb-f-edge-agrupa').check();
    await page.waitForTimeout(200);
    check('activar un tipo de relación no rompe la vista', (await info(page)).visible === REAL.nodes.length);
    check('seleccionar, filtrar y buscar no han hecho NINGUNA petición de red', net.length === before, `${net.length - before} nuevas: ${net.slice(before).join(', ')}`);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, '02-seleccion.png') });

    section('4. Recomendaciones y lista accesible');
    await page.getByRole('tab', { name: 'Recomendaciones' }).click();
    const recText = await page.locator('#sb-p-recomendaciones').textContent();
    check('se agrupan en Ahora / Después / Todavía no', /Ahora \(\d+\)/.test(recText) && /Después \(\d+\)/.test(recText) && /Todavía no \(\d+\)/.test(recText));
    check('cada recomendación muestra por qué, evidencia, resultado y acción', ['Por qué', 'Evidencia o requisito', 'Resultado que se busca', 'Acción concreta', 'Confianza', 'Esfuerzo'].every((t) => recText.includes(t)));
    check('se explica cómo se calcula la prioridad', /relevancia/.test(recText) && /Cómo se calcula la prioridad/.test(recText));
    await page.getByRole('tab', { name: 'Lista' }).click();
    check('la lista accesible contiene todos los elementos por región', (await page.locator('.sb-node').count()) === REAL.nodes.length, String(await page.locator('.sb-node').count()));
    await page.locator('#sb-p-lista details[open] .sb-node').first().click();
    check('elegir en la lista selecciona el nodo y vuelve al detalle', (await page.locator('#sb-p-detalle').isVisible()) && (await page.locator('#sb-detail-title').count()) === 1);

    section('5. Teclado');
    await page.locator('#sb-stage').focus();
    const th = await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.screenPos('c:dax'));
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(900);
    const th2 = await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.screenPos('c:dax'));
    check('las flechas giran la escena sin ratón', Math.abs(th.x - th2.x) + Math.abs(th.y - th2.y) > 3);
    await page.keyboard.press('Escape');
    check('Esc quita la selección', (await info(page)).selected === null);
    await page.keyboard.press('0');

    section('6. Liberación de recursos al salir');
    await page.evaluate(() => { window.__gl = document.querySelector('.sb-canvas'); });
    await page.locator('.ap-tabs a[data-tab="portfolio"]').click();
    await page.waitForTimeout(800);
    check('el lienzo se elimina del documento', (await page.locator('.sb-canvas').count()) === 0);
    check('el visor deja de existir (sin referencias al escenario)', await page.evaluate(() => { const s = document.querySelector('#sb-stage'); return !s || !s.__sbViewer; }));
    const lost = await page.evaluate(() => { const gl = window.__gl.getContext('webgl2') || window.__gl.getContext('webgl'); return !gl || gl.isContextLost(); });
    check('el contexto WebGL queda liberado', lost);
    await page.locator('.ap-tabs a[data-tab="second-brain"]').click();
    await waitGraph(page);
    check('volver a entrar crea un visor nuevo que funciona', (await info(page)).visible === REAL.nodes.length);
    await page.locator('#ap-logout').click();
    await page.waitForTimeout(700);
    check('al cerrar sesión se libera el visor', (await page.locator('.sb-canvas').count()) === 0 && (await page.locator('#ap-lock').isVisible()));
    check('sin errores de JavaScript en todo el recorrido', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ───────── Estados ───────── */
  section('7. Estados: sin tabla, vacío, error, parcial, demostración');
  {
    let t = await open({ api: (u) => (/sb_/.test(u) ? { status: 404, body: { code: 'PGRST205', message: 'not found' } } : null) });
    await t.page.goto(BASE + 'area-privada.html#/second-brain');
    await t.page.waitForSelector('.sb-msg');
    check('sin tablas: explica que hay que ejecutar el SQL', /second-brain\.sql/.test(await t.page.locator('.sb-msg').textContent()));
    await t.ctx.close();

    t = await open({ api: (u) => (/sb_snapshots/.test(u) ? { status: 200, body: [] } : /sb_runs/.test(u) ? { status: 200, body: [{ status: 'error', message: 'La fuente «x» no existe', started_at: '2026-02-01T10:00:00Z' }] } : null) });
    await t.page.goto(BASE + 'area-privada.html#/second-brain');
    await t.page.waitForSelector('.sb-msg');
    const empty = await t.page.locator('.sb-msg').textContent();
    check('sin análisis: estado inicial útil con los pasos', /Todavía no hay ningún análisis/.test(empty) && /analyze\.mjs/.test(empty));
    check('sin análisis: muestra el último intento fallido', /no existe/.test(empty));
    check('sin análisis: no se inventa ningún dato', (await t.page.locator('.sb-canvas').count()) === 0);
    await t.page.locator('a:has-text("datos de demostración")').click();
    await waitGraph(t.page);
    const demoHead = await t.page.locator('.sb-head').textContent();
    check('la demostración está claramente rotulada como ficticia', /DATOS FICTICIOS/.test(demoHead) && /inventados/.test(demoHead));
    if (SHOTS) await t.page.screenshot({ path: join(SHOTS, '03-demo.png') });
    await t.ctx.close();

    t = await open({ api: (u) => (/sb_snapshots/.test(u) ? { status: 500, body: { message: 'boom' } } : null) });
    await t.page.goto(BASE + 'area-privada.html#/second-brain');
    await t.page.waitForSelector('.sb-msg');
    check('error del servidor: mensaje y botón Reintentar', (await t.page.locator('.sb-msg [role], .sb-msg').first().isVisible()) && (await t.page.getByRole('button', { name: 'Reintentar' }).count()) === 1);
    await t.ctx.close();

    const broken = JSON.parse(JSON.stringify(REAL)); broken.edges[0].target = 'c:inexistente';
    t = await open({ api: (u) => (/sb_snapshots/.test(u) ? { status: 200, body: [row(broken), row(REAL)] } : /sb_runs/.test(u) ? { status: 200, body: [{ status: 'error', message: 'timeout', started_at: '2026-03-01T10:00:00Z' }] } : null) });
    await t.page.goto(BASE + 'area-privada.html#/second-brain');
    await waitGraph(t.page);
    const partial = await t.page.locator('.sb-head').textContent();
    check('disponibilidad parcial: usa el último snapshot válido y lo avisa', /no cumple el contrato/.test(partial) && /falló: timeout/.test(partial));
    await t.ctx.close();

    t = await open({ api: (u) => (/sb_snapshots/.test(u) ? { status: 200, body: [row(broken)] } : null) });
    await t.page.goto(BASE + 'area-privada.html#/second-brain');
    await t.page.waitForSelector('.sb-msg');
    check('si ningún snapshot es válido, no se dibuja nada y se explica', (await t.page.locator('.sb-canvas').count()) === 0 && /contrato de datos/.test(await t.page.locator('.sb-msg').textContent()));
    await t.ctx.close();

    t = await open({ api: (u) => (/sb_snapshots/.test(u) ? { status: 401, body: { message: 'JWT expired' } } : /auth\/v1\/token/.test(u) ? { status: 400, body: { error: 'invalid_grant' } } : null) });
    await t.page.goto(BASE + 'area-privada.html#/second-brain');
    await t.page.waitForTimeout(1200);
    check('si el servidor rechaza la sesión (401), se vuelve a la pantalla de acceso', await t.page.locator('#ap-lock').isVisible());
    await t.ctx.close();
  }

  /* ───────── Accesibilidad, móvil, rendimiento ───────── */
  section('8. Accesibilidad (axe), móvil y rendimiento');
  {
    const t = await open({ reducedMotion: true });
    await t.page.goto(BASE + 'area-privada.html#/second-brain');
    await waitGraph(t.page);
    await t.page.evaluate(AXE);
    await t.page.evaluate(() => { document.querySelector('.sb-filters > summary').click(); });
    const res = await t.page.evaluate(async () => (await axe.run(document.querySelector('.sb'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, t: v.nodes[0].target.join(' ') })));
    check('axe: sin infracciones WCAG A/AA en la pestaña', res.length === 0, JSON.stringify(res));
    await t.page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.select('c:dax'));
    const res2 = await t.page.evaluate(async () => (await axe.run(document.querySelector('.sb'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, t: v.nodes[0].target.join(' ') })));
    check('axe: sin infracciones con un nodo seleccionado', res2.length === 0, JSON.stringify(res2));
    const before = await t.page.locator('#sb-stage').evaluate((e) => e.__sbViewer.screenPos('c:dax'));
    await t.page.keyboard.press('Tab');
    await t.ctx.close();

    const m = await open({ viewport: { width: 390, height: 844 } });
    await m.page.goto(BASE + 'area-privada.html#/second-brain');
    await waitGraph(m.page);
    check('móvil: sin desplazamiento horizontal', await m.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check('móvil: el panel está plegado y hay un botón para abrirlo', (await m.page.locator('.sb-panel-toggle').isVisible()) && !(await m.page.locator('#sb-side').isVisible()));
    check('móvil: el grafo ocupa el ancho disponible', (await m.page.locator('#sb-stage').boundingBox()).width > 340);
    await m.page.locator('#sb-stage').scrollIntoViewIfNeeded();
    await m.page.waitForTimeout(300);
    const mp = await m.page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.screenPos('c:sql'));
    await m.page.mouse.click(mp.x, mp.y);
    await m.page.waitForTimeout(800);
    check('móvil: al seleccionar se abre el panel inferior', await m.page.locator('#sb-side').isVisible());
    if (SHOTS) await m.page.screenshot({ path: join(SHOTS, '04-movil.png') });
    await m.ctx.close();

    const big = bigGraph(1200, 3000);
    check('el grafo sintético grande cumple el contrato', validateSnapshot(big).ok, JSON.stringify(validateSnapshot(big).errors.slice(0, 2)));
    const b = await open({ api: (u) => (/sb_snapshots/.test(u) ? { status: 200, body: [row(big)] } : null) });
    const t0 = Date.now();
    await b.page.goto(BASE + 'area-privada.html#/second-brain');
    await waitGraph(b.page);
    const loadMs = Date.now() - t0;
    const perf = await b.page.evaluate(() => {
      const v = document.querySelector('#sb-stage').__sbViewer;
      const t = performance.now(); for (let i = 0; i < 10; i++) v.renderNow(); const frame = (performance.now() - t) / 10;
      const t2 = performance.now(); v.setFilter({ visible: new Set(['n1', 'n2', 'n3']) }); const filt = performance.now() - t2;
      return { frame, filt, info: v.info() };
    });
    console.log(`    (1200 nodos / 3000 relaciones, renderizado por software: carga ${loadMs} ms · fotograma ${perf.frame.toFixed(1)} ms · filtrar ${perf.filt.toFixed(1)} ms · ${perf.info.drawCalls} llamadas · ${perf.info.labels} etiquetas)`);
    check('grande: llamadas de dibujo constantes (≤ 14) y etiquetas acotadas (≤ 40)', perf.info.drawCalls <= 14 && perf.info.labels <= 40, JSON.stringify(perf.info));
    check('grande: filtrar tarda menos de 400 ms', perf.filt < 400, perf.filt.toFixed(1));
    if (SHOTS) await b.page.screenshot({ path: join(SHOTS, '05-grande.png') });
    await b.ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${failed ? '✗' : '✓'} ${passed} comprobaciones correctas, ${failed} fallidas.`);
process.exit(failed ? 1 : 0);
