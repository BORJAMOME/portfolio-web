/* ═══════════════════════════════════════════════
   tools/check-briefing.mjs — el briefing de entrevista cabe en dos A4 y se lee bien en móvil
   ─────────────────────────────────────────────────
   Pinta el briefing con el código real (area-privada-preparacion.js + css/area-privada.css)
   sobre datos FICTICIOS (tools/fixtures/briefing-ejemplo.json), sin Supabase ni sesión, y:
     1. lo imprime a PDF A4 y cuenta páginas: el ejemplo y el peor caso que acepta la
        validación del servidor (900 palabras, WORDS_MAX) tienen que caber en 2
     2. a 375 px de ancho no hay desplazamiento horizontal
     3. axe-core: sin infracciones WCAG 2.2 AA en el briefing ni en la lista
     4. sin errores de JavaScript
   Uso:  node tools/check-briefing.mjs [--pdf ruta.pdf] [--shots carpeta]   (capturas para revisarlo a ojo)
   Requiere: npm i --no-save playwright axe-core && npx playwright install chromium
   ═══════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const { chromium } = require('playwright');
const axePath = require.resolve('axe-core/axe.min.js');
const fixture = JSON.parse(readFileSync(join(ROOT, 'tools/fixtures/briefing-ejemplo.json'), 'utf8'));
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const pdfOut = arg('--pdf'), shots = arg('--shots');

// mismo recuento que supabase/functions/interview-intel/report.ts (visibleText + words)
const words = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%€-]*/gu) || []).length;
function visibleWords(c) {
  const t = [c.interview_type, ...c.limitations, c.know.context, ...c.know.facts.map((f) => f.text), c.know.why_it_matters,
    ...c.people.flatMap((p) => [p.name, p.title || '', p.role_in_interview, p.note || '']),
    ...c.strategy.highlight, ...c.strategy.projects.flatMap((p) => [p.name, p.why, p.highlight, p.decisions, p.follow_up, p.limitation]),
    ...c.strategy.review, c.strategy.gap ? c.strategy.gap.topic + ' ' + c.strategy.gap.honest_answer : '',
    c.intro, ...c.questions.flatMap((q) => [q.q, q.guide]), ...c.ask,
    c.reminder.fit, c.reminder.example, c.reminder.question, c.reminder.technical].join('\n');
  return words(t);
}
/** Alarga las guías de respuesta hasta llegar a n palabras (el máximo que guarda el servidor) */
function inflate(f, n) {
  const g = structuredClone(f), c = g.report.content;
  const filler = 'Detalle adicional con contexto concreto del proyecto y del resultado obtenido.'.split(' ');
  let i = 0;
  while (visibleWords(c) < n) { const q = c.questions[i % c.questions.length]; q.guide += ' ' + filler[i % filler.length]; i++; }
  return g;
}

const SHELL_H = `
function h(tag, attrs, kids) {
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  });
  (function add(list) { [].concat(list || []).forEach(function (c) { if (c == null || c === false) return; if (Array.isArray(c)) return add(c); el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); })(kids);
  return el;
}`;

function harness(data, route) {
  const url = (p) => pathToFileURL(join(ROOT, p)).href;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prueba del briefing</title>
<link rel="stylesheet" href="${url('shared.css')}"><link rel="stylesheet" href="${url('css/area-privada.css')}">
</head><body><header class="ap-top"><p class="ap-top-title">Área personal de trabajo</p></header>
<main id="main-content"><section class="ap-app"><div class="ap-shell"><h1 class="ap-app-title">Entrevistas</h1>
<p class="ap-status" id="st" role="status"></p><div class="ap-view" id="view"></div></div></section></main>
<script>${SHELL_H}
var DATA = ${JSON.stringify(data)};
function api(path) {
  var r = DATA;
  if (path.indexOf('/rest/v1/ii_interviews') === 0) return Promise.resolve(path.indexOf('id=eq.') > -1 ? [r.interview] : r.list);
  if (path.indexOf('/rest/v1/ii_reports?select=*') === 0) return Promise.resolve([r.report]);
  if (path.indexOf('/rest/v1/ii_reports') === 0) return Promise.resolve(path.indexOf('interview_id=eq.') > -1 ? r.versions : r.versions.map(function (v) { return Object.assign({ interview_id: r.interview.id }, v); }));
  if (path.indexOf('/rest/v1/ii_runs') === 0) return Promise.resolve(r.runs);
  return Promise.resolve([]);
}
</script>
<script src="${url('area-privada-preparacion.js')}"></script>
<script>
APPreparacion.render({ api: api, h: h, view: document.getElementById('view'), arg: ${JSON.stringify(route)},
  setStatus: function (m) { document.getElementById('st').textContent = m || ''; }, fail: function (e) { throw e; }, isCurrent: function () { return false; }
}).then(function (paint) { paint(); document.body.setAttribute('data-ready', '1'); });
</script></body></html>`;
}

const dir = mkdtempSync(join(tmpdir(), 'briefing-'));
const browser = await chromium.launch();
const problems = [];
async function open(data, route, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => problems.push('Error JS: ' + e.message));
  const file = join(dir, Math.random().toString(36).slice(2) + '.html');
  writeFileSync(file, harness(data, route));
  await page.goto(pathToFileURL(file).href);
  await page.waitForSelector('body[data-ready]', { timeout: 10000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return page;
}
async function pages(data, label, save) {
  const page = await open(data, data.interview.id, { width: 1280, height: 900 });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  if (save && shots) { await page.setViewportSize({ width: 794, height: 1123 }); await page.screenshot({ path: join(shots, 'briefing-impresion.png'), fullPage: true }); }
  if (save) writeFileSync(save, pdf);
  const n = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
  console.log(`${n <= 2 ? '✓' : '✗'} ${label}: ${n} página(s) A4 (${visibleWords(data.report.content)} palabras)`);
  if (n > 2) problems.push(`${label}: ocupa ${n} páginas`);
  await page.close();
}
async function axe(page, label) {
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
  const v = r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  console.log(`${v.length ? '✗' : '✓'} axe-core ${label}: ${v.length} infracciones graves`);
  v.forEach((x) => problems.push(`axe ${label}: ${x.id} — ${x.help} (${x.nodes.length})`));
}

const data = { ...fixture, list: [] };
await pages(data, 'Ejemplo', pdfOut || (shots ? join(shots, 'briefing.pdf') : null));
await pages(inflate(data, 900), 'Peor caso aceptado', null);   // = WORDS_MAX de report.ts

const mobile = await open(data, data.interview.id, { width: 375, height: 812 });
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(`${overflow > 0 ? '✗' : '✓'} Móvil 375 px: ${overflow > 0 ? overflow + ' px de desplazamiento horizontal' : 'sin desplazamiento horizontal'}`);
if (overflow > 0) problems.push('Desplazamiento horizontal en móvil');
if (shots) await mobile.screenshot({ path: join(shots, 'briefing-movil.png'), fullPage: true });
await axe(mobile, 'briefing');

const statuses = ['pending_review', 'queued', 'researching', 'ready', 'needs_update', 'failed', 'cancelled', 'dismissed'];
const soon = Date.now() + 3 * 864e5;
const list = statuses.map((s, i) => ({ ...fixture.interview, id: fixture.interview.id.slice(0, -2) + String(10 + i), status: s,
  starts_at: new Date(soon + i * 36e5).toISOString(), ends_at: new Date(soon + i * 36e5 + 36e5).toISOString(),
  current_report_id: ['ready', 'needs_update', 'cancelled'].includes(s) ? fixture.report.id : null,
  last_error: s === 'failed' ? 'Proveedor no disponible' : null, signals: ['La descripción menciona: candidatura'] }));
const listPage = await open({ ...data, list }, '', { width: 1280, height: 900 });
const rows = await listPage.locator('tbody tr').count();
console.log(`${rows === statuses.length ? '✓' : '✗'} Lista: ${rows} filas para ${statuses.length} estados`);
if (rows !== statuses.length) problems.push('La lista no muestra todas las entrevistas');
if (shots) await listPage.screenshot({ path: join(shots, 'preparacion-lista.png'), fullPage: true });
await axe(listPage, 'lista');

await browser.close();
if (problems.length) { console.error('\n' + problems.map((p) => '· ' + p).join('\n')); process.exit(1); }
console.log('\nTodo correcto.');
