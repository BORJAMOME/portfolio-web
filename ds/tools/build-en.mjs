/* ═══════════════════════════════════════════════
   ds/tools/build-en.mjs — genera la versión inglesa del manual
   ─────────────────────────────────────────────────
   Fuente única: data-storytelling.html (español). Este script la lee,
   sustituye cada frase por su traducción y escribe en/data-storytelling.html.

     node ds/tools/build-en.mjs            → genera la página y avisa de lo que falta
     node ds/tools/build-en.mjs --missing  → además guarda ds/i18n/en.missing.json

   · Diccionario de la página: ds/i18n/en.page.json
       units  — { "frase en español (con su marcado en línea)": "English" }
       keep   — ["frases que no cambian"] (marcas, siglas, nombres)
       raw    — [["texto literal", "reemplazo"]] para lo que no es una frase (scripts, URLs…)
   · Textos que genera el JavaScript (dashboards, etiquetas): ds/i18n/en.js
   Una «frase» es un tramo de texto con su marcado en línea (<b>, <em>, <a>, <span>…)
   entre dos elementos de bloque. Si una frase no está en el diccionario, se queda en
   español y aparece en el aviso: así, cualquier cambio en la versión española se detecta.
   Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'data-storytelling.html');
const OUT = join(ROOT, 'en', 'data-storytelling.html');
const DICT = JSON.parse(readFileSync(join(ROOT, 'ds', 'i18n', 'en.page.json'), 'utf8'));
const UNITS = DICT.units || {};
const KEEP = new Set(DICT.keep || []);   // iguales en los dos idiomas (marcas, siglas…)
const WANT_MISSING = process.argv.includes('--missing');

const INLINE = new Set(['a', 'b', 'strong', 'em', 'i', 'span', 'small', 'code', 'br', 'sup', 'sub', 'abbr', 'kbd', 'mark', 'cite', 'q', 'u', 's', 'time', 'wbr']);
const ATTRS = ['aria-label', 'alt', 'title', 'placeholder', 'data-v'];
const META = /^(description|og:title|og:description|og:image:alt|twitter:title|twitter:description)$/;
const hasWords = (s) => /[A-Za-zÁÉÍÓÚÑáéíóúñü]{2,}/.test(s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' '));

const seen = [], missing = [];
const tr = (k) => {
  if (!hasWords(k)) return k;
  if (Object.prototype.hasOwnProperty.call(UNITS, k)) return UNITS[k];
  if (KEEP.has(k)) return k;
  if (!seen.includes(k)) { seen.push(k); missing.push(k); }
  return k;
};

// atributos traducibles dentro de una etiqueta de apertura
function trTag(tag) {
  return tag.replace(/\s([a-z-]+)="([^"]*)"/g, (m, a, v) => {
    const isAttr = ATTRS.includes(a) || a.startsWith('data-n-');
    const isMeta = a === 'content' && /(name|property)="([^"]+)"/.test(tag) && META.test(tag.match(/(?:name|property)="([^"]+)"/)[1]);
    if (!(isAttr || isMeta) || !hasWords(v)) return m;
    return ' ' + a + '="' + tr(v) + '"';
  });
}

const src = readFileSync(SRC, 'utf8');
const TOK = /<!--[\s\S]*?-->|<![^>]*>|<(script|style|svg|template)\b[\s\S]*?<\/\1>|<\/?([a-zA-Z][\w-]*)\b[^>]*>|[^<]+|</g;
let out = '', run = [];
/* Una frase = texto suelto + marcado en línea. Si el texto suelto (fuera de etiquetas) no
   tiene palabras —p. ej. enlaces o chips seguidos—, cada texto interior se traduce aparte. */
function flush() {
  if (!run.length) return;
  const txt = run.map((r) => r.t).join(''), lead = txt.match(/^\s*/)[0], trail = txt.match(/\s*$/)[0];
  let depth = 0, bare = '';
  for (const r of run) { if (r.k === 'open') depth++; else if (r.k === 'close') depth--; else if (r.k === 'text' && depth <= 0) bare += r.t; }
  if (hasWords(bare)) out += lead + tr(txt.trim()) + trail;
  else out += run.map((r) => (r.k === 'text' && r.t.trim() ? r.t.replace(r.t.trim(), tr(r.t.trim())) : r.t)).join('');
  run = [];
}
for (const m of src.matchAll(TOK)) {
  const t = m[0];
  if (t.startsWith('<!') || t === '<') { flush(); out += t; continue; }
  if (m[1]) {   // script / style / svg: se copian tal cual (sus textos van por en.js)
    flush();
    out += m[1] === 'svg' ? t.replace(/<[a-zA-Z][^>]*>/g, trTag) : t;
    continue;
  }
  if (m[2]) {
    const name = m[2].toLowerCase(), close = t.startsWith('</'), tag = close ? t : trTag(t);
    if (INLINE.has(name)) { run.push({ t: tag, k: close ? 'close' : (name === 'br' || name === 'wbr' ? 'void' : 'open') }); continue; }
    flush(); out += tag; continue;
  }
  // texto: un salto de línea entre elementos cierra la frase (separa hermanos, no palabras)
  if (!t.trim() && t.includes('\n')) { flush(); out += t; continue; }
  run.push({ t, k: 'text' });
}
flush();

// ── ajustes de la versión inglesa ──
let en = out
  .replace('<html lang="es"', '<html lang="en"')
  // rutas: la página vive en en/, un nivel más abajo
  .replace(/(href|src|srcset)="\.\/(?!en\/)/g, '$1="../')
  .replace(/(href)="\.\.\/en\//g, '$1="./')
  // el portfolio en inglés tiene estas páginas; el resto enlaza a la versión española
  .replace(/href="\.\.\/index\.html"/g, 'href="./index.html"')
  .replace(/href="\.\.\/descargas\.html"/g, 'href="./downloads.html"');
// selector de idioma: en la versión inglesa, EN activo y ES como enlace
const TOGGLE = `<div class="ds-lang" role="group" aria-label="Language · Idioma">
    <a href="../data-storytelling.html" class="ds-lang-b" hreflang="es" lang="es" data-lang-to="es" title="Leer en español" aria-label="Leer en español">ES</a>
    <span class="ds-lang-a" aria-current="true" lang="en" title="English">EN</span>
  </div>`;
if (!/<div class="ds-lang"[\s\S]*?<\/div>/.test(en)) console.warn('  · no encuentro el selector de idioma');
en = en.replace(/<div class="ds-lang"[\s\S]*?<\/div>/, TOGGLE);
// el diccionario de textos del JavaScript se carga antes que el motor
en = en.replace(/<script src="\.\.\/ds\/manual\.js(\?v=[^"]*)?" defer><\/script>/, (m, v) => `<script src="../ds/i18n/en.js${v || ''}" defer></script>\n${m}`);

for (const [a, b] of DICT.raw || []) {
  if (!en.includes(a)) console.warn('  · raw sin coincidencia:', a.slice(0, 70));
  en = en.split(a).join(b);
}
writeFileSync(OUT, en);

console.log(`en/data-storytelling.html · ${Object.keys(UNITS).length} frases en el diccionario · ${missing.length} sin traducir`);
if (WANT_MISSING) {
  writeFileSync(join(ROOT, 'ds', 'i18n', 'en.missing.json'), JSON.stringify(Object.fromEntries(missing.map((k) => [k, ''])), null, 2));
  console.log('→ ds/i18n/en.missing.json');
}
