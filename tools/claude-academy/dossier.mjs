/* ═══════════════════════════════════════════════
   tools/claude-academy/dossier.mjs: dossier de fuente de cada curso (texto crudo, local)
   ─────────────────────────────────────────────────
   Una ficha se redacta a partir del DOSSIER, no de la memoria. Es texto crudo, sin parafrasear, para poder comprobar después
   que lo que dice la ficha está en la fuente. Vive en .claude-academy/fuentes/<curso>/ (ignorada por git; nunca se sube a Supabase):
     fuente.txt    el texto literal de la página (o el texto pegado / convertido de un PDF)
     lecturas.md   lo que NO es texto corrido: valores de widgets, gráficos, capturas. Una línea por dato:
                   «- [texto|dom|imagen] (id-del-tema) qué es: valor»   (imagen = leído de un dibujo o captura → la ficha no puede ser «verificado»)
     capturas/     imágenes de apoyo (quita datos de cuenta antes de guardarlas)
     meta.json     {curso, url, capturado, sha256, caracteres, metodo}   (lo escribe esta herramienta)

     node tools/claude-academy/dossier.mjs capturar <curso> <url>                  abre la URL con Playwright y guarda el texto
     node tools/claude-academy/dossier.mjs registrar <curso> <url> --texto <ruta>  guarda un texto que ya tienes (pegado, PDF…)
     node tools/claude-academy/dossier.mjs comprobar <curso>                       vuelve a capturar y avisa si la página cambió
   <curso> es el id del curso en COURSES (minúsculas, números y guiones). Solo https. No necesita contraseña ni toca la base.
   ═══════════════════════════════════════════════ */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LOCAL } from './load.mjs';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const dossierDir = (curso) => {
  if (!SLUG.test(curso)) throw new Error(`«${curso}» no es un id de curso válido (minúsculas, números y guiones)`);
  return join(LOCAL, 'fuentes', curso);
};
/* El hash ignora espacios y saltos de línea para que un cambio de maquetación no cuente como cambio de contenido */
export const hashTexto = (t) => createHash('sha256').update(String(t).replace(/\s+/g, ' ').trim()).digest('hex');

/* [{tipo, temas, t}] de lecturas.md: «- [dom] (id-del-tema, otro-id) descripción: valor». Los temas entre paréntesis son opcionales:
   sirven para que el aviso de «leído de una imagen» solo afecte a las fichas que usan ese dato. */
export function parseLecturas(md) {
  return String(md || '').split('\n').map((l) => /^\s*-\s*\[(texto|dom|imagen)\]\s*(?:\(([a-z0-9, -]+)\)\s*)?(.+)$/i.exec(l)).filter(Boolean)
    .map((m) => ({ tipo: m[1].toLowerCase(), temas: m[2] ? m[2].split(',').map((x) => x.trim()).filter(Boolean) : [], t: m[3].trim() }));
}

/* {meta, texto, lecturas} o null si el curso no tiene dossier */
export function leerDossier(curso) {
  const d = dossierDir(curso);
  if (!existsSync(join(d, 'fuente.txt'))) return null;
  const meta = existsSync(join(d, 'meta.json')) ? JSON.parse(readFileSync(join(d, 'meta.json'), 'utf8')) : {};
  const lec = existsSync(join(d, 'lecturas.md')) ? readFileSync(join(d, 'lecturas.md'), 'utf8') : '';
  return { meta, texto: readFileSync(join(d, 'fuente.txt'), 'utf8'), lecturas: parseLecturas(lec), lecturasTexto: lec };
}

export function guardar(curso, url, texto, metodo) {
  if (!/^https:\/\//.test(url)) throw new Error('La URL debe ser https.');
  if (!String(texto).trim()) throw new Error('El texto está vacío: no se guarda un dossier sin contenido.');
  const d = dossierDir(curso);
  mkdirSync(join(d, 'capturas'), { recursive: true });
  writeFileSync(join(d, 'fuente.txt'), texto, 'utf8');
  const meta = { curso, url, capturado: new Date().toISOString().slice(0, 10), sha256: hashTexto(texto), caracteres: texto.length, metodo };
  writeFileSync(join(d, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  if (!existsSync(join(d, 'lecturas.md'))) writeFileSync(join(d, 'lecturas.md'), '# Lecturas que no son texto corrido (widgets, gráficos, capturas)\n# Una línea por dato: - [texto|dom|imagen] qué es: valor\n', 'utf8');
  return meta;
}

/* Captura con Playwright (ya lo usan las comprobaciones del repo): carga la página, baja hasta el final para que se pinte lo
   diferido y guarda el texto de <main>. Los widgets que exigen clics NO salen aquí: se anotan a mano en lecturas.md. */
export async function capturar(url) {
  if (!/^https:\/\//.test(url)) throw new Error('La URL debe ser https.');
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { throw new Error('Falta Playwright: npm i --no-save playwright && npx playwright install chromium (o usa «registrar» con el texto ya copiado).'); }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 200)); } });
    await page.waitForTimeout(800);
    return await page.evaluate(() => (document.querySelector('main') || document.body).innerText);
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, curso, url, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'capturar') { const m = guardar(curso, url, await capturar(url), 'playwright'); console.log(`✓ ${m.caracteres} caracteres guardados en .claude-academy/fuentes/${curso}/ (sha256 ${m.sha256.slice(0, 12)}…).\n  Falta lo que no es texto: anótalo en lecturas.md.`); }
    else if (cmd === 'registrar') {
      const i = rest.indexOf('--texto'); if (i < 0 || !rest[i + 1]) throw new Error('Falta --texto <ruta>');
      const m = guardar(curso, url, readFileSync(rest[i + 1], 'utf8'), 'manual'); console.log(`✓ ${m.caracteres} caracteres registrados (sha256 ${m.sha256.slice(0, 12)}…).`);
    } else if (cmd === 'comprobar') {
      const d = leerDossier(curso); if (!d) throw new Error('No hay dossier de ese curso.');
      const nuevo = hashTexto(await capturar(d.meta.url));
      console.log(nuevo === d.meta.sha256 ? `✓ La página no ha cambiado desde el ${d.meta.capturado}.` : `⚠ La página ha cambiado desde el ${d.meta.capturado}: revisa las fichas del curso (el hash ya no coincide).`);
    } else throw new Error('Uso: dossier.mjs capturar|registrar|comprobar <curso> [url] (ver la cabecera del archivo).');
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
