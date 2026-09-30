/* ═══════════════════════════════════════════════
   tools/check-a11y.mjs — accesibilidad (WCAG 2.2 AA) y errores de JavaScript
   ─────────────────────────────────────────────────
     npm i --no-save playwright axe-core && npx playwright install chromium
     node tools/check-a11y.mjs              → todas las páginas
     node tools/check-a11y.mjs index.html   → solo las indicadas

   Sirve el sitio en local, abre cada página en Chromium (escritorio, «reducir
   movimiento» activado para ver el estado final), la recorre entera para que
   aparezca todo el contenido y pasa axe-core. Falla si hay infracciones WCAG A/AA
   o errores de JavaScript. Analytics y fuentes externas se bloquean: no afectan.
   ═══════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml', '.pdf': 'application/pdf' };

const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;

const all = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.html') && f !== 'proyectos.html'),
  ...readdirSync(join(ROOT, 'en')).filter((f) => f.endsWith('.html')).map((f) => 'en/' + f),
];
const pages = process.argv.slice(2).length ? process.argv.slice(2) : all;

const browser = await chromium.launch();
let failed = 0;
for (const p of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await ctx.route(/googletagmanager|google-analytics|fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('bm_cookie_consent', 'rejected'); } catch (e) {} });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message.split('\n')[0]));
  await page.goto(BASE + p, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(40); }
  await page.waitForTimeout(1500);
  await page.addScriptTag({ content: AXE });
  const violations = await page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return r.violations.map((v) => `${v.id} ×${v.nodes.length} · ${v.help} · ${v.nodes[0].target.join(' ')}`);
  });
  const bad = violations.length + jsErrors.length;
  failed += bad ? 1 : 0;
  console.log(`${bad ? '✗' : '✓'} ${p}`);
  violations.forEach((v) => console.log('    ' + v));
  jsErrors.forEach((e) => console.log('    JS: ' + e));
  await ctx.close();
}
await browser.close();
server.close();
if (failed) { console.error(`\n✗ ${failed} página(s) con problemas.`); process.exit(1); }
console.log(`\n✓ ${pages.length} páginas sin infracciones WCAG A/AA ni errores de JavaScript.`);
