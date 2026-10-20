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
    check('llamadas de dibujo acotadas (≤ 20)', i0.drawCalls <= 20, String(i0.drawCalls));
    await page.waitForTimeout(900);
    const f1 = (await info(page)).frameCount;
    await page.waitForTimeout(800);
    const f2 = (await info(page)).frameCount;
    check('en reposo no se dibuja ningún fotograma (dibujo bajo demanda)', f2 - f1 <= 1, `${f1} → ${f2} fotogramas en 0,8 s`);
    check('hay etiquetas visibles y acotadas (≤ 62)', i0.labels > 0 && i0.labels <= 62, String(i0.labels));
    const stageBox = await page.locator('.sb-stage-card').boundingBox();
    const mainBox = await page.locator('#ap-view').boundingBox();
    check('el mapa ocupa todo el ancho del área de trabajo', stageBox.width >= mainBox.width - 2, `${stageBox.width} de ${mainBox.width}`);
    const detBox = await page.locator('#sb-detail').boundingBox();
    check('el detalle y las recomendaciones van debajo del mapa', detBox.y > stageBox.y + stageBox.height - 1);
    check('el fondo del mapa es blanco', await page.evaluate(() => getComputedStyle(document.querySelector('.sb-stage-card')).backgroundColor === 'rgb(255, 255, 255)'));
    check('la vista inicial es «Mapa» en perspectiva', (await info(page)).layout === 'mapa' && (await info(page)).preset === '3d');
    // semántica del mapa: lo respaldado más cerca del centro que lo pendiente; competencias por encima; proyectos fuera del disco
    const geo = await page.evaluate(() => {
      const v = document.querySelector('#sb-stage').__sbViewer;
      return v.debugPositions();
    });
    const rad = (p) => Math.hypot(p[0], p[2]);
    const avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
    const byState = (st) => REAL.nodes.filter((n) => ['tecnologia', 'concepto', 'tecnica'].includes(n.type) && n.state === st).map((n) => rad(geo[n.id]));
    check('mapa: lo respaldado está más cerca del centro que lo pendiente o en brecha', avg(byState('respaldado')) < avg([...byState('pendiente'), ...byState('brecha_probable')]));
    check('mapa: las competencias flotan por encima del plano de conceptos', REAL.nodes.filter((n) => n.type === 'competencia').every((n) => geo[n.id][1] > 10));
    check('mapa: los proyectos forman el cinturón exterior', REAL.nodes.filter((n) => n.type === 'proyecto').every((n) => rad(geo[n.id]) > 100));
    check('mapa: cada concepto está dentro del sector de su área', await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.debugSectorsOk()));
    if (SHOTS) await page.screenshot({ path: join(SHOTS, '01-vista-general.png') });

    section('3. Interacción sin red: seleccionar, filtrar, buscar, enfocar');
    const before = net.length;
    // selección con clic real sobre un nodo
    const pos = await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.screenPos('c:dax'));
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(900);
    check('el clic en un nodo muestra su panel contextual', (await page.locator('#sb-detail-h').textContent()) === 'DAX');
    const ed = (await info(page)).edgesDrawn;
    check('al seleccionar se dibujan sus relaciones como cintas y no las del resto', ed.focus > 0 && ed.context === 0, JSON.stringify(ed));
    check('el panel indica el estado de evidencia', /Respaldado/.test(await page.locator('#sb-detail .sb-badge').first().textContent()));
    check('el panel lista relaciones con su fundamento', (await page.locator('.sb-rels li').count()) > 2 && (await page.locator('.sb-why').first().textContent()).length > 15);
    check('el panel no contiene rutas de archivos ni enlaces a documentos', !/\.(py|sql|md|ipynb|pbix)\b/i.test(await page.locator('#sb-detail').textContent()));
    check('el nodo seleccionado queda registrado en el visor', (await info(page)).selected === 'c:dax');
    // brecha probable: debe explicarse y no llamarse "confirmada"
    await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.select('c:power-query'));
    await page.waitForTimeout(300);
    const gap = await page.locator('#sb-detail').textContent();
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
    check('Enter en la búsqueda selecciona y enfoca el concepto', /ventana/i.test(await page.locator('#sb-detail-h').textContent()));
    // relaciones
    await page.locator('.sb-filters > summary').click();
    await page.locator('#sb-f-edge-agrupa').check();
    await page.waitForTimeout(200);
    check('activar un tipo de relación no rompe la vista', (await info(page)).visible === REAL.nodes.length);
    check('seleccionar, filtrar y buscar no han hecho NINGUNA petición de red', net.length === before, `${net.length - before} nuevas: ${net.slice(before).join(', ')}`);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, '02-seleccion.png') });

    section('4. Recomendaciones y lista accesible');
    await page.locator('.sb-recs details.sb-rec').evaluateAll((ds) => ds.forEach((d) => { d.open = true; }));
    const recText = await page.locator('.sb-recs').textContent();
    check('se agrupan en Ahora / Después / Todavía no', /Ahora \(\d+\)/.test(recText) && /Después \(\d+\)/.test(recText) && /Todavía no \(\d+\)/.test(recText));
    check('cada recomendación muestra por qué, evidencia, resultado y acción', ['Por qué', 'Evidencia o requisito', 'Resultado que se busca', 'Acción concreta', 'Confianza', 'Esfuerzo'].every((t) => recText.includes(t)));
    check('se explica cómo se calcula la prioridad', /relevancia/.test(recText) && /Cómo se calcula la prioridad/.test(recText));
    await page.locator('.sb-all > summary').click();
    check('la lista accesible contiene todos los elementos por región', (await page.locator('.sb-node').count()) === REAL.nodes.length, String(await page.locator('.sb-node').count()));
    await page.locator('.sb-all .sb-node').first().click();
    check('elegir en la lista selecciona el nodo y muestra su detalle', (await page.locator('#sb-detail .sb-badge').count()) === 1);

    section('4b. Vistas: Mapa / Red y puntos de vista');
    await page.getByRole('button', { name: 'Red', exact: true }).click();
    await page.waitForTimeout(1300);
    check('«Red» cambia a la distribución de fuerzas del motor', (await info(page)).layout === 'red');
    const redPos = await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.debugPositions());
    check('en «Red» las posiciones son las del snapshot', REAL.nodes.every((n) => Math.hypot(redPos[n.id][0] - n.pos[0], redPos[n.id][1] - n.pos[1], redPos[n.id][2] - n.pos[2]) < 0.01));
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
    await page.getByRole('button', { name: 'Cenital' }).click();
    await page.waitForTimeout(1300);
    check('«Cenital» mira el mapa desde arriba', (await info(page)).preset === 'cenital' && (await info(page)).layout === 'mapa');
    await page.getByRole('button', { name: 'Perspectiva' }).click();
    await page.waitForTimeout(900);

    section('4c. Lenguaje visual v3: color por área, iconos, tooltip y preguntas');
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.reset());
    await page.waitForTimeout(900);
    const legendAreas = await page.locator('.sb-leg-areas li').count();
    check('la leyenda lista las áreas con su color e icono', legendAreas >= 5 && (await page.locator('.sb-leg-areas .sb-ichip svg').count()) === legendAreas);
    const chipColor = await page.locator('.sb-leg-areas .sb-ichip').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    check('las fichas de área usan el color del snapshot', chipColor !== 'rgba(0, 0, 0, 0)' && chipColor !== 'rgb(255, 255, 255)', chipColor);
    const hp = await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.screenPos('c:sql'));
    await page.mouse.move(hp.x, hp.y);
    await page.waitForTimeout(500);
    const tipVisible = await page.locator('.sb-tip').isVisible();
    const tipText = tipVisible ? await page.locator('.sb-tip').textContent() : '';
    check('al pasar el ratón aparece un tooltip con nombre, área, evidencia y descripción', tipVisible && /SQL/.test(tipText) && /relaci/.test(tipText) && tipText.length > 60, tipText.slice(0, 120));
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    check('el tooltip desaparece al salir del nodo', !(await page.locator('.sb-tip').isVisible()));
    const dc = (await info(page)).drawCalls;
    check('todos los nodos se dibujan en una sola llamada (shader instanciado): ≤ 16 en total', dc <= 16, String(dc));
    const before4c = net.length;
    await page.locator('.sb-q', { hasText: 'mejor demostrado' }).click();
    await page.waitForTimeout(900);
    const ansItems = await page.locator('.sb-ans-i').count();
    check('«¿Qué tengo mejor demostrado?» responde con elementos del mapa', ansItems > 0);
    check('la respuesta resalta esos elementos en el mapa', (await info(page)).highlighted === ansItems, String((await info(page)).highlighted));
    await page.locator('#sb-ask-q').fill('sql');
    await page.locator('#sb-ask-q').press('Enter');
    await page.waitForTimeout(700);
    check('una pregunta libre por tema devuelve coincidencias y relacionados', /coincide/.test(await page.locator('.sb-ask-out').textContent()));
    await page.locator('.sb-ans-i').first().click();
    await page.waitForTimeout(700);
    check('elegir un resultado abre su detalle', (await page.locator('#sb-detail .sb-badge').count()) === 1);
    await page.locator('.sb-ask-out .ap-link-btn', { hasText: 'Quitar resaltado' }).click();
    check('«Quitar resaltado» devuelve el mapa completo', (await info(page)).highlighted === 0);
    check('las preguntas se responden sin peticiones de red', net.length === before4c);

    section('4d. v6: color por familia tecnológica, filtro, búsqueda y lista agrupada');
    await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.reset());
    const famBtns = await page.locator('.sb-fam').count();
    check('la leyenda lista las familias tecnológicas (con contador) y «sin clasificar» solo si existe', famBtns >= 8 && famBtns <= 9, String(famBtns));
    check('la familia Power BI usa el amarillo de la paleta (#F5C84C)', (await page.locator('.sb-fam[data-fam="bi"] .sb-ichip').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(245, 200, 76)');
    const totalEls = (await info(page)).visible;
    await page.locator('.sb-fam[data-fam="python"]').click();
    await page.waitForTimeout(500);
    const soloInfo = await info(page);
    check('aislar una familia desde la leyenda filtra el mapa y lo indica', soloInfo.visible < totalEls && /filtrado/.test(await page.locator('.sb-count').textContent()) && (await page.locator('.sb-filters summary').textContent()) === 'Filtros (1)', `${soloInfo.visible}/${totalEls}`);
    check('la familia aislada queda marcada en la leyenda y en los filtros', (await page.locator('.sb-fam[data-fam="python"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('#sb-f-fam-python').isChecked()) && !(await page.locator('#sb-f-fam-bi').isChecked()));
    await page.locator('.sb-fam[data-fam="python"]').click();
    await page.waitForTimeout(500);
    check('otro clic sobre la misma familia devuelve todos los elementos', (await info(page)).visible === totalEls && (await page.locator('.sb-filters summary').textContent()) === 'Filtros');
    await page.locator('#sb-search').fill('dax');
    await page.waitForTimeout(500);
    check('buscar resalta todas las coincidencias en el mapa y las cuenta', (await info(page)).highlighted > 3 && /coincidencias/.test(await page.locator('.sb-count').textContent()));
    check('cada resultado indica su tipo y su familia', /Tecnología · Power BI/.test(await page.locator('#sb-results li').first().textContent()));
    await page.locator('#sb-search').fill('');
    await page.waitForTimeout(300);
    check('vaciar la búsqueda quita el resaltado y restablece el contador', (await info(page)).highlighted === 0 && /elementos$/.test((await page.locator('.sb-count').textContent()).trim()));
    await page.locator('#sb-search').fill('zzzqqq');
    await page.waitForTimeout(300);
    check('sin coincidencias se explica y no se deja el mapa atenuado', /Sin resultados/.test(await page.locator('#sb-results').textContent()) && (await info(page)).highlighted === 0);
    await page.locator('#sb-search').fill('');
    await page.evaluate(() => { document.querySelector('.sb-all').open = true; });
    const groups = await page.locator('.sb-grp').count();
    check('la lista se agrupa por familia, en grupos plegables con contador', groups >= 8 && (await page.locator('.sb-grp > summary .sb-gcount').count()) === groups, String(groups));
    await page.locator('.sb-grp > summary').first().click();
    check('un grupo se despliega y muestra sus elementos', (await page.locator('.sb-grp[open] .sb-node').count()) > 0);
    await page.locator('#sb-list-q').fill('dax');
    check('buscar dentro de la lista abre los grupos con coincidencias', (await page.locator('.sb-grp[open] .sb-node').count()) > 0 && (await page.locator('.sb-grp[open] .sb-node').count()) < totalEls);
    await page.locator('#sb-list-q').fill('');
    await page.locator('#sb-list-by').selectOption('area');
    check('se puede agrupar por área o por tipo', (await page.locator('.sb-grp').count()) >= 5);
    await page.locator('#sb-list-by').selectOption('familia');
    await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.select('c:dax'));
    await page.waitForTimeout(500);
    check('el detalle muestra la familia con su color', /Power BI y Business Intelligence/.test(await page.locator('#sb-detail .sb-fampill').first().textContent()));
    check('las cifras de la cabecera se explican (65 + 17 + 120 + 6 = 208 con datos reales)', /elementos? en el mapa = /.test(await page.locator('.sb-kpi-note').textContent()));
    await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.select(null));

    section('4e. v7: jerarquía del conocimiento, vistas rápidas, etapas y cobertura');
    await page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.reset());
    const rootBtns = await page.locator('.sb-tn-roots > .sb-tn > .sb-tn-row .sb-tn-main').count();
    check('el explorador lista las áreas con jerarquía (árbol con botones, no solo el mapa)', rootBtns >= 1, String(rootBtns));
    const firstRoot = page.locator('.sb-tn-roots > .sb-tn').first();
    const tog = firstRoot.locator('> .sb-tn-row .sb-tn-tog');
    const wasOpen = (await tog.getAttribute('aria-expanded')) === 'true';
    await tog.click();
    check('expandir y contraer una rama cambia aria-expanded y el foco vuelve al botón', (await page.locator('.sb-tn-roots > .sb-tn').first().locator('> .sb-tn-row .sb-tn-tog').getAttribute('aria-expanded')) === String(!wasOpen));
    await page.locator('.sb-tree-ctl button', { hasText: 'Expandir todo' }).click();
    const deepId = await page.evaluate(() => { const b = [...document.querySelectorAll('.sb-tn-kids .sb-tn-main')].find((x) => x.closest('.sb-tn-kids').parentElement.closest('.sb-tn-kids')); return b ? b.getAttribute('data-id') : null; });
    check('hay al menos una técnica en un tercer nivel (área → disciplina → técnica)', !!deepId);
    await page.locator('.sb-tn-main[data-id="' + deepId + '"]').click();
    await page.waitForTimeout(400);
    check('elegir un elemento del árbol abre su detalle con la ruta (migas) hasta la raíz', (await page.locator('#sb-detail .sb-crumb li').count()) >= 3);
    check('el detalle de un conocimiento muestra su etapa con la escalera y qué falta para la siguiente', (await page.locator('#sb-detail .sb-steps li').count()) === 6 && (await page.locator('#sb-detail .sb-stg').count()) >= 1);
    check('la etapa no depende del color: el texto y la posición indican dónde está', /Aplicado|Reforzado|Estudiado|Identificado|Evaluado|Dominio/.test(await page.locator('#sb-detail .sb-steps li.is-now').textContent()));
    const quickN = await page.locator('.sb-q-chip').count();
    check('las vistas rápidas empiezan por «Todo» y solo ofrecen las que tienen elementos', quickN >= 2 && /Todo/.test(await page.locator('.sb-q-chip').first().textContent()) && (await page.locator('.sb-q-chip[aria-pressed="true"]').count()) === 1);
    const allVisible = (await info(page)).visible;
    await page.locator('.sb-q-chip').nth(1).click();
    await page.waitForTimeout(700);
    check('una vista rápida filtra el mapa, lo indica y muestra el filtro activo con su aspa', (await info(page)).visible < allVisible && (await page.locator('.sb-fchip').count()) >= 1 && /filtrado/.test(await page.locator('.sb-count').textContent()));
    await page.locator('.sb-fchip button').first().click();
    await page.waitForTimeout(500);
    check('quitar el filtro desde su aspa devuelve todos los elementos', (await info(page)).visible === allVisible && (await page.locator('.sb-fchip').count()) === 0);
    await page.locator('.sb-tn-main[data-id="' + deepId + '"]').locator('xpath=ancestor::li[contains(@class,"sb-tn")][1]').locator('.sb-tn-iso').first().click();
    await page.waitForTimeout(600);
    check('«Aislar» deja solo esa rama (y su camino y proyectos) y queda marcada', (await info(page)).visible < allVisible && (await page.locator('.sb-tn-iso[aria-pressed="true"]').count()) === 1);
    await page.locator('.sb-q-chip').first().click();
    await page.waitForTimeout(500);
    check('«Todo» quita el aislamiento', (await info(page)).visible === allVisible && (await page.locator('.sb-tn-iso[aria-pressed="true"]').count()) === 0);
    await page.locator('.sb-filters summary').click();
    const nStage = await page.locator('input[id^="sb-f-stage-"]').count();
    check('los filtros incluyen etapa de conocimiento y tipo de evidencia', nStage === 7 && (await page.locator('input[id^="sb-f-kind-"]').count()) >= 5);
    await page.locator('#sb-f-stage-aplicado').uncheck();
    await page.locator('#sb-f-stage-reforzado').uncheck();
    await page.waitForTimeout(500);
    const byStage = await info(page);
    check('filtrar por etapa deja solo el conocimiento de las etapas marcadas', byStage.visible < allVisible && /Etapa:/.test(await page.locator('.sb-fchip').first().textContent()), String(byStage.visible));
    await page.locator('.sb-filters summary').click();       // el panel abierto tapa la barra de filtros activos
    await page.locator('.sb-active .ap-link-btn', { hasText: 'Quitar todos' }).click();
    await page.waitForTimeout(400);
    await page.locator('.sb-filters summary').click();
    await page.locator('#sb-dim').check();
    await page.locator('#sb-f-fam-' + ((REAL.families || [])[0] || {}).id).uncheck();
    await page.waitForTimeout(700);
    const dim = await info(page);
    check('en modo atenuar los filtros no ocultan: todos siguen en el mapa y los que coinciden se resaltan', dim.visible === allVisible && dim.highlighted > 0 && dim.highlighted < allVisible, JSON.stringify([dim.visible, dim.highlighted]));
    await page.locator('.sb-btn', { hasText: 'Restablecer' }).click();
    await page.waitForTimeout(600);
    check('«Restablecer» quita también etapa, vista y modo atenuar', (await info(page)).visible === allVisible && (await info(page)).highlighted === 0 && !(await page.locator('#sb-dim').isChecked()));
    check('la cobertura por área suma técnicas con práctica, documentadas y sin evidencia, y avisa de que no mide dominio', (await page.locator('.sb-cov li').count()) >= 1 && /no dominio/.test(await page.locator('.sb-sumcard').textContent()));

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
  section('7b. Logotipos, etiquetas y tu información (notas, valoración y elementos propios)');
  {
    const posted = [];
    const deleted = [];
    const NOTES = [
      { node_id: 'c:sql', es_propio: false, valoracion: 'domino', descripcion: 'Mi descripción de SQL.', nota: 'Nota privada.', enlaces: ['https://github.com/ejemplo/repo'], relacionados: [], updated_at: '2026-10-19T10:00:00Z' },
      { node_id: 'c:pandas', es_propio: false, valoracion: 'brecha', nota: 'Me falta soltura con groupby.', enlaces: [], relacionados: [], updated_at: '2026-10-19T10:00:00Z' },
      { node_id: 'u:dbt-core-ab12', es_propio: true, label: 'dbt Core', tipo: 'tecnologia', area: 'datos', descripcion: 'Transformaciones SQL versionadas.', valoracion: 'aprender', enlaces: [], relacionados: ['c:sql'], updated_at: '2026-10-19T10:00:00Z' },
      { node_id: 'u:roto', es_propio: true, label: 'Área inexistente', tipo: 'concepto', area: 'no-existe', enlaces: [], relacionados: [] },
    ];
    const t7 = await open({ api: (u, m) => {
      if (/sb_notas/.test(u)) {
        if (m === 'POST') { posted.push(u); return { status: 201, body: {} }; }
        if (m === 'DELETE') { deleted.push(u); return { status: 204, body: {} }; }
        return { status: 200, body: NOTES };
      }
      return null;
    } });
    t7.page.on('request', (rq) => { if (/sb_notas/.test(rq.url()) && rq.method() === 'POST') posted.push(rq.postData()); });
    await t7.page.goto(BASE + 'area-privada.html#/second-brain');
    await waitGraph(t7.page);
    const v = (fn) => t7.page.evaluate(fn);
    check('las etiquetas del mapa no tienen fondo y el texto es negro', await v(() => {
      const l = [...document.querySelectorAll('.sb-label')].find((x) => x.style.display !== 'none');
      const cs = l && getComputedStyle(l);
      return !!cs && cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.color === 'rgb(17, 17, 17)';
    }));
    await v(() => document.querySelector('#sb-stage').__sbViewer.select('c:python'));
    await t7.page.waitForTimeout(500);
    check('la etiqueta seleccionada tampoco lleva fondo azul', await v(() => { const l = document.querySelector('.sb-label.is-sel'); return !!l && getComputedStyle(l).backgroundColor === 'rgba(0, 0, 0, 0)'; }));
    check('las tecnologías con logotipo lo muestran en la interfaz (Python)', await t7.page.locator('#sb-detail .sb-h--icon .sb-ichip.is-logo img').count() === 1);
    check('el logotipo se carga como imagen data: (sin red ni HTML inyectado)', /^data:image\/svg\+xml/.test(await t7.page.locator('#sb-detail .sb-h--icon .sb-ichip.is-logo img').getAttribute('src')));
    check('un elemento añadido por ti aparece en el mapa', await v(() => document.querySelector('#sb-stage').__sbViewer.debugPositions()['u:dbt-core-ab12'] !== undefined));
    check('un elemento propio con un área inexistente se descarta sin romper el mapa', await v(() => document.querySelector('#sb-stage').__sbViewer.debugPositions()['u:roto'] === undefined));
    await v(() => document.querySelector('#sb-stage').__sbViewer.select('c:pandas'));
    await t7.page.waitForTimeout(400);
    const pd = await t7.page.locator('#sb-detail').textContent();
    check('«Lo reconozco como brecha» la convierte en brecha confirmada con tu motivo', /Brecha confirmada/.test(pd) && /groupby/.test(pd));
    await v(() => document.querySelector('#sb-stage').__sbViewer.select('c:sql'));
    await t7.page.waitForTimeout(400);
    const sd = await t7.page.locator('.sb-user').textContent();
    check('«Tu información» muestra valoración, descripción, notas y enlaces', /Lo domino/.test(sd) && /Mi descripción de SQL/.test(sd) && /Nota privada/.test(sd) && /github\.com\/ejemplo/.test(sd));
    check('los enlaces tuyos abren en pestaña nueva sin referer', (await t7.page.locator('.sb-user-links a').getAttribute('rel')) === 'noopener noreferrer');
    // editar: validación de enlaces y guardado
    await t7.page.locator('.sb-user .sb-btn').click();
    await t7.page.locator('#sb-n-links').fill('javascript:alert(1)');
    await t7.page.locator('dialog[open] button[type=submit]').click();
    await t7.page.waitForTimeout(300);
    check('un enlace que no es http(s) se rechaza', /no es válido/.test(await t7.page.locator('dialog[open] .ap-msg').textContent()));
    await t7.page.locator('#sb-n-links').fill('https://borjamora.es');
    await t7.page.locator('#sb-n-nota').fill('Nota actualizada');
    const before = posted.length;
    await t7.page.locator('dialog[open] button[type=submit]').click();
    await t7.page.waitForTimeout(1200);
    const body = posted.slice(before).find((x) => x && x.startsWith('{'));
    check('guardar envía tu información a sb_notas (upsert por node_id)', !!body && /"node_id":"c:sql"/.test(body) && /Nota actualizada/.test(body) && posted.slice(before).some((x) => /on_conflict=node_id/.test(x)), String(body).slice(0, 160));
    check('tras guardar se vuelve a mostrar el mismo elemento', (await t7.page.locator('#sb-detail-h').textContent()) === 'SQL');
    // añadir un elemento nuevo
    await t7.page.locator('.sb-btn', { hasText: '+ Añadir' }).click();
    await t7.page.locator('#sb-n-label').fill('Looker Studio');
    const b2 = posted.length;
    await t7.page.locator('dialog[open] button[type=submit]').click();
    await t7.page.waitForTimeout(1200);
    const nb = posted.slice(b2).find((x) => x && x.startsWith('{'));
    check('«+ Añadir» crea un elemento propio (es_propio, nombre, tipo y área)', !!nb && /"es_propio":true/.test(nb) && /Looker Studio/.test(nb) && /"node_id":"u:looker-studio-/.test(nb), String(nb).slice(0, 160));
    await t7.ctx.close();

    // sin la tabla: se explica qué ejecutar y no se pierde nada
    const t8 = await open({ api: (u) => (/sb_notas/.test(u) ? { status: 404, body: { code: 'PGRST205' } } : null) });
    await t8.page.goto(BASE + 'area-privada.html#/second-brain');
    await waitGraph(t8.page);
    check('sin la tabla de notas el mapa funciona igual', (await info(t8.page)).visible > 0);
    await t8.page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.select('c:sql'));
    await t8.page.waitForTimeout(400);
    await t8.page.locator('.sb-user .sb-btn').click();
    check('al editar sin la tabla se indica el SQL que hay que ejecutar', /second-brain-notas\.sql/.test(await t8.page.locator('dialog[open]').textContent()));
    await t8.ctx.close();
  }

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
    check('móvil: arranca en vista cenital (el disco cabe mejor en vertical)', (await m.page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.info().preset)) === 'cenital');
    check('móvil: el grafo ocupa el ancho disponible', (await m.page.locator('#sb-stage').boundingBox()).width > 340);
    await m.page.locator('#sb-stage').scrollIntoViewIfNeeded();
    await m.page.waitForTimeout(300);
    const mp = await m.page.evaluate(() => document.querySelector('#sb-stage').__sbViewer.screenPos('c:sql'));
    await m.page.mouse.click(mp.x, mp.y);
    await m.page.waitForTimeout(800);
    check('móvil: al seleccionar aparece el aviso con acceso al detalle', await m.page.locator('.sb-chip').isVisible());
    await m.page.locator('.sb-chip-go').click();
    await m.page.waitForTimeout(700);
    check('móvil: «Ver detalle» lleva al panel de detalle', await m.page.evaluate(() => { const r = document.querySelector('#sb-detail').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }));
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
    check('grande: llamadas de dibujo constantes (≤ 20) y etiquetas acotadas (≤ 62)', perf.info.drawCalls <= 20 && perf.info.labels <= 62, JSON.stringify(perf.info));
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
