/* ═══════════════════════════════════════════════
   tools/color-studio/wada-import.mjs: archivo de importación con las 348 combinaciones de Sanzo Wada
     node tools/color-studio/wada-import.mjs [salida.json] [--from colors.json]
   Descarga colors.json de mattdesl/dictionary-of-colour-combinations (MIT) en un commit fijo,
   comprueba su huella SHA-256, lo convierte al formato de importación de Color Studio y lo valida
   con el mismo código que usa la web (color-studio/data.js). No escribe en Supabase:
   el archivo se importa a mano desde Biblioteca → Importar, con revisión previa.
   Los datos del libro NO se versionan en el repositorio ni se sirven desde la web.
   ═══════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseImportJSON, reviewImport, EXPORT_FORMAT, EXPORT_VERSION } from '../../color-studio/data.js';

const COMMIT = 'c142bd0bc8049ea48db4da5eb397981f047e8ef4';
const SHA256 = '555f11c32eb8133078fd470dd7d5320533aaa8b636f12fa06a8dd3d0ee2703b4';
const REPO = 'https://github.com/mattdesl/dictionary-of-colour-combinations';
const RAW = `https://raw.githubusercontent.com/mattdesl/dictionary-of-colour-combinations/${COMMIT}/colors.json`;

const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const from = fromIdx >= 0 ? args[fromIdx + 1] : null;
const out = args.find((a, i) => !a.startsWith('--') && i !== fromIdx + 1) || 'sanzo-wada-348.color-studio.json';

const text = from ? readFileSync(from, 'utf8') : await fetch(RAW).then((r) => { if (!r.ok) throw new Error('Descarga fallida: HTTP ' + r.status); return r.text(); });
const hash = createHash('sha256').update(text).digest('hex');
if (hash !== SHA256) throw new Error('colors.json no coincide con la versión revisada (SHA-256 ' + hash + '). Revisa los cambios del dataset antes de actualizar la huella.');
const colors = JSON.parse(text);

// combinación → colores, en el orden del índice del dataset (el libro no fija un orden distinto en los datos)
const combos = new Map();
colors.forEach((c) => c.combinations.forEach((id) => { if (!combos.has(id)) combos.set(id, []); combos.get(id).push(c); }));
const ids = [...combos.keys()].sort((a, b) => a - b);
if (ids.length !== 348 || ids[0] !== 1 || ids[ids.length - 1] !== 348) throw new Error('Se esperaban las combinaciones 1–348; hay ' + ids.length);

const NOTE = 'Datos de un dataset de terceros con licencia MIT (mattdesl/dictionary-of-colour-combinations, commit ' + COMMIT.slice(0, 7) +
  '), recopilado originalmente por Dain M. Blodorn Kim. El libro da los colores en CMYK; el HEX es una conversión aproximada ' +
  '(perfil U.S. Web Coated SWOP v2 → sRGB) y puede no coincidir con el ejemplar impreso. El orden de los colores sigue el índice del dataset. ' +
  'No verificado contra el libro.';
const palettes = ids.map((id) => {
  const list = combos.get(id);
  const n = String(id).padStart(3, '0');
  return {
    name: 'Wada n.º ' + n,
    colors: list.map((c) => ({ original: 'CMYK ' + c.cmyk.join(' '), hex: c.hex, name: c.name, role: null, note: 'Capítulo ' + (c.swatch + 1) + ' del libro' })),
    tags: ['sanzo wada', list.length + ' colores'],
    source_type: 'book',
    source_title: 'A Dictionary of Color Combinations (Sanzo Wada, Seigensha), combinación n.º ' + id,
    source_url: REPO,
    source_notes: NOTE,
    notes: null,
    is_favorite: false
  };
});
const file = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exported_at: new Date().toISOString(),
  note: 'Combinaciones 1–348 de Sanzo Wada para importar en Color Studio. ' + NOTE, palettes };
const json = JSON.stringify(file, null, 1);

// validación con el código de la web: todas válidas y sin duplicados entre sí
const parsed = parseImportJSON(json);
if (!parsed.ok) throw new Error(parsed.error);
const bad = parsed.rows.filter((r) => r.errors.length);
if (bad.length) throw new Error('Filas no válidas: ' + bad.map((r) => r.row + ' (' + r.errors[0] + ')').join(', '));
const dups = reviewImport(parsed.rows, []).filter((r) => r.duplicates.length);
const sizes = {};
palettes.forEach((p) => { sizes[p.colors.length] = (sizes[p.colors.length] || 0) + 1; });

writeFileSync(out, json);
console.log('✓ ' + out + ': ' + palettes.length + ' paletas (' + Object.entries(sizes).map(([k, v]) => v + ' de ' + k).join(', ') + '), ' +
  new Set(colors.map((c) => c.hex)).size + ' colores, ' + (json.length / 1024).toFixed(0) + ' KB, ' +
  (dups.length ? dups.length + ' con duplicados: ' + dups.map((r) => r.value.name).join(', ') : 'sin duplicados') + '.');
