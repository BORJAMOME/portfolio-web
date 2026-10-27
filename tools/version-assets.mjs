/* ═══════════════════════════════════════════════
   tools/version-assets.mjs: versiones de caché automáticas
   ─────────────────────────────────────────────────
     node tools/version-assets.mjs           → actualiza los ?v= de todas las páginas
     node tools/version-assets.mjs --check   → no escribe: falla si alguno está desactualizado (CI)

   Cada referencia a un CSS o JS propio (shared.css, css/, ds/, *.js de la raíz…)
   lleva ?v=<hash del contenido>. Si el archivo cambia, cambia el hash y los
   navegadores descargan la versión nueva; si no cambia, siguen usando la caché.
   Sustituye a las fechas escritas a mano (?v=20260930i), fáciles de olvidar o repetir.
   Después de ejecutarlo no hace falta regenerar el inglés: se actualizan las dos versiones.
   Módulos ES que se importan entre sí (MODULE_DIRS): sus imports relativos también llevan ?v=. Así la página
   y los módulos piden la MISMA URL de cada dependencia (una sola descarga e instancia) y, tras publicar,
   no se mezclan versiones nuevas con dependencias viejas de la caché (auditoría de Color Studio, CS-05).
   Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const pages = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => join(ROOT, f)),
  ...readdirSync(join(ROOT, 'en')).filter((f) => f.endsWith('.html')).map((f) => join(ROOT, 'en', f)),
];
const hashes = {};
const memory = {};                         // contenido ya reescrito (o por reescribir, con --check) de los módulos
const read = (file) => memory[file] ?? readFileSync(file, 'utf8');
// el hash ignora los finales de línea (CRLF en Windows, LF en Git/CI): mismo contenido, misma versión en cualquier equipo
const hashOf = (file) => (hashes[file] ??= createHash('sha256').update(read(file).replace(/\r\n/g, '\n')).digest('hex').slice(0, 10));

let changed = 0;
/* ── Imports entre módulos: de las hojas hacia arriba, hasta que nada cambie (el grafo no tiene ciclos) ── */
const MODULE_DIRS = ['color-studio'];
const IMPORT = /(\bfrom\s*'|\bimport\(\s*')(\.{1,2}\/[^'?#]+\.js)(?:\?v=[^']*)?'/g;
const modules = MODULE_DIRS.flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => join(ROOT, d, f)));
for (let pass = 0, dirty = true; dirty; pass++) {
  if (pass > modules.length + 1) throw new Error('Los imports entre módulos no convergen (¿hay un ciclo?)');
  dirty = false;
  for (const m of modules) {
    const src = read(m);
    const out = src.replace(IMPORT, (all, pre, path) => {
      const dep = resolve(dirname(m), path);
      return existsSync(dep) ? `${pre}${path}?v=${hashOf(dep)}'` : all;
    });
    if (out !== src) { memory[m] = out; dirty = true; for (const k of Object.keys(hashes)) delete hashes[k]; }
  }
}
for (const m of modules) {
  if (memory[m] === undefined || memory[m] === readFileSync(m, 'utf8')) continue;
  changed++;
  if (CHECK) console.log(`✗ ${relative(ROOT, m)} · versiones de los imports desactualizadas`);
  else writeFileSync(m, memory[m]);
}

for (const p of pages) {
  const src = readFileSync(p, 'utf8');
  const out = src.replace(/(\s(?:href|src)=")((?:\.{1,2}\/|\/(?!\/))[^"?#]+\.(?:css|js))(?:\?v=[^"#]*)?"/g, (m, pre, path) => {
    const file = path.startsWith('/') ? join(ROOT, path) : resolve(dirname(p), path);   // /x.css: desde la raíz (404.html)
    if (!existsSync(file) || relative(ROOT, file).startsWith('vendor')) return m;   // vendor/ ya lleva la versión en el nombre
    return `${pre}${path}?v=${hashOf(file)}"`;
  });
  if (out !== src) {
    changed++;
    if (CHECK) console.log(`✗ ${relative(ROOT, p)} · versiones de caché desactualizadas`);
    else writeFileSync(p, out);
  }
}
if (CHECK && changed) { console.error(`\nEjecuta: node tools/version-assets.mjs`); process.exit(1); }
console.log(CHECK ? `✓ versiones de caché al día en ${pages.length} páginas y ${modules.length} módulos.` : `${changed} archivo(s) actualizados.`);
