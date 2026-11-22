import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { collect } from './incidencias-ledger.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = JSON.parse(await readFile(resolve(root, 'visor-ferroviario/capas/incidencias.json'), 'utf8'));
// El test sigue comprobando el reinicio aunque el archivo real ya contenga 2027.
const instant = '2026-11-20T09:00:00Z';
const data = collect({ ...base, records: [], snapshots: [] }, { header: { timestamp: String(Date.parse(instant) / 1000) }, entity: Array.from({ length: 13 }, (_, i) => ({ id: 'TEST_' + i, alert: { descriptionText: { translation: [{ language: 'es', text: 'Aviso de prueba ' + i }] } } })) }, instant);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('https://cabina.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/capas/incidencias.json')) return route.fulfill({ json: data });
    try {
      const body = await readFile(resolve(root, '.' + path));
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
      await route.fulfill({ body, contentType: types[extname(path)] || 'application/octet-stream' });
    } catch { await route.fulfill({ status: 404, body: '404' }); }
  });
  await context.route(/fonts\.(googleapis|gstatic)/, route => route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-11-20T23:00:00Z') });
  await page.goto('https://cabina.test/visor-ferroviario/cabina.html');
  await page.locator('#ci-year').waitFor();
  await page.locator('#ci-year').selectOption('2026');
  const count = data.records.filter(r => r.firstSeen.startsWith('2026-')).length;
  assert.match(await page.locator('.ci-total').innerText(), new RegExp('^' + count + ' avisos'));
  if (count) {
    const id = data.records[0].id;
    await page.locator('#ci-search').fill(id);
    assert.equal(await page.locator('#c-incidencias table').last().locator('tbody tr').count(), 1);
    await page.locator('#ci-search').fill('');
    assert.equal(await page.locator('#c-incidencias table').last().locator('tbody tr').count(), Math.min(10, count));
    if (count > 10) {
      await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
      assert.match(await page.locator('#c-incidencias').innerText(), /Página 2 de/);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#incidencias').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Sin desbordamiento de página en móvil');
  const screenshot = process.env.CABINA_SCREENSHOT || resolve(tmpdir(), 'cabina-incidencias-mobile.png');
  await page.screenshot({ path: screenshot });
  console.log('Captura móvil: ' + screenshot);
  await page.clock.setFixedTime(new Date('2027-01-01T00:30:00Z'));
  await page.reload();
  await page.locator('#ci-year').waitFor();
  assert.equal(await page.locator('#ci-year').inputValue(), '2027');
  assert.match(await page.locator('.ci-total').innerText(), /^0 avisos únicos incorporados en 2027$/);
  await page.locator('#ci-year').selectOption('2026');
  assert.match(await page.locator('.ci-total').innerText(), new RegExp('^' + count + ' avisos'));
  assert.deepEqual(errors, []);
  console.log('✓ Tabla, búsqueda, paginación, móvil y cambio de año con histórico conservado.');
} finally { await browser.close(); }
