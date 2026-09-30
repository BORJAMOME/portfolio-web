/* ═══════════════════════════════════════════════
   tools/build-en.mjs — genera las versiones inglesas del portfolio
   ─────────────────────────────────────────────────
   Fuente única: la página española. El script la lee, sustituye cada frase por su
   traducción (inglés británico) y escribe la página en en/.

     node tools/build-en.mjs                    → todas las páginas
     node tools/build-en.mjs index              → solo una (index · sobre-mi · descargas · data-storytelling)
     node tools/build-en.mjs index --missing    → además guarda las frases sin traducir

   · Cada página tiene su diccionario (ver PAGES):
       units  — { "frase en español (con su marcado en línea)": "English" }
       keep   — ["frases que no cambian"] (marcas, siglas, nombres)
       raw    — [["texto literal", "reemplazo"]] para lo que no es una frase (scripts, URLs…)
   · Una «frase» es un tramo de texto con su marcado en línea (<b>, <em>, <a>, <span>…)
     entre dos elementos de bloque. Si no está en el diccionario, se queda en español y
     aparece en el aviso: cualquier cambio en la versión española se detecta.
   · El selector ES | EN (.ds-lang) se invierte solo: en inglés, EN activo y ES enlace.
   Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = {
  index: { src: 'index.html', out: 'en/index.html', dict: 'i18n/index.en.json', missing: 'i18n/index.en.missing.json' },
  descargas: { src: 'descargas.html', out: 'en/downloads.html', dict: 'i18n/descargas.en.json', missing: 'i18n/descargas.en.missing.json' },
  'sobre-mi': { src: 'sobre-mi.html', out: 'en/about.html', dict: 'i18n/sobre-mi.en.json', missing: 'i18n/sobre-mi.en.missing.json' },
  'data-storytelling': {
    src: 'data-storytelling.html', out: 'en/data-storytelling.html', dict: 'ds/i18n/en.page.json', missing: 'ds/i18n/en.missing.json',
    // los textos que genera ds/manual.js se traducen con este diccionario, cargado antes
    script: { before: /<script src="\.\.\/ds\/manual\.js(\?v=[^"]*)?" defer><\/script>/, src: '../ds/i18n/en.js' }
  }
};
// páginas que ya existen en inglés: sus enlaces apuntan a la versión inglesa
const EN_EXISTS = { 'index.html': 'index.html', 'sobre-mi.html': 'about.html', 'descargas.html': 'downloads.html', 'data-storytelling.html': 'data-storytelling.html' };

const INLINE = new Set(['a', 'b', 'strong', 'em', 'i', 'span', 'small', 'code', 'br', 'sup', 'sub', 'abbr', 'kbd', 'mark', 'cite', 'q', 'u', 's', 'time', 'wbr']);
const ATTRS = ['aria-label', 'alt', 'title', 'placeholder', 'data-v'];
const META = /^(description|og:title|og:description|og:image:alt|twitter:title|twitter:description)$/;
const hasWords = (s) => /[A-Za-zÁÉÍÓÚÑáéíóúñü]{2,}/.test(s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' '));
const TOK = /<!--[\s\S]*?-->|<![^>]*>|<(script|style|svg|template)\b[\s\S]*?<\/\1>|<\/?([a-zA-Z][\w-]*)\b[^>]*>|[^<]+|</g;

function build(name, P, wantMissing) {
  const DICT = JSON.parse(readFileSync(join(ROOT, P.dict), 'utf8'));
  const UNITS = DICT.units || {}, KEEP = new Set(DICT.keep || []);
  const seen = new Set(), missing = [];
  const tr = (k) => {
    if (!hasWords(k)) return k;
    if (Object.prototype.hasOwnProperty.call(UNITS, k)) return UNITS[k];
    if (KEEP.has(k)) return k;
    if (!seen.has(k)) { seen.add(k); missing.push(k); }
    return k;
  };
  const trTag = (tag) => tag.replace(/\s([a-z-]+)="([^"]*)"/g, (m, a, v) => {
    const isAttr = ATTRS.includes(a) || a.startsWith('data-n-');
    const prop = tag.match(/(?:name|property)="([^"]+)"/);
    const isMeta = a === 'content' && prop && META.test(prop[1]);
    if (!(isAttr || isMeta) || !hasWords(v)) return m;
    return ' ' + a + '="' + tr(v) + '"';
  });

  const src = readFileSync(join(ROOT, P.src), 'utf8');
  let out = '', run = [];
  /* Una frase = texto suelto + marcado en línea. Si el texto suelto (fuera de etiquetas) no
     tiene palabras —p. ej. enlaces o chips seguidos—, cada texto interior se traduce aparte. */
  const flush = () => {
    if (!run.length) return;
    const txt = run.map((r) => r.t).join(''), lead = txt.match(/^\s*/)[0], trail = txt.match(/\s*$/)[0];
    let depth = 0, bare = '';
    for (const r of run) { if (r.k === 'open') depth++; else if (r.k === 'close') depth--; else if (r.k === 'text' && depth <= 0) bare += r.t; }
    if (hasWords(bare)) out += lead + tr(txt.trim()) + trail;
    else out += run.map((r) => (r.k === 'text' && r.t.trim() ? r.t.replace(r.t.trim(), tr(r.t.trim())) : r.t)).join('');
    run = [];
  };
  for (const m of src.matchAll(TOK)) {
    const t = m[0];
    if (t.startsWith('<!') || t === '<') { flush(); out += t; continue; }
    if (m[1]) {   // script / style / svg: se copian tal cual (sus textos van por «raw» o por un diccionario JS)
      flush();
      out += m[1] === 'svg' ? t.replace(/<[a-zA-Z][^>]*>/g, trTag) : t;
      continue;
    }
    if (m[2]) {
      const tn = m[2].toLowerCase(), close = t.startsWith('</'), tag = close ? t : trTag(t);
      if (INLINE.has(tn)) { run.push({ t: tag, k: close ? 'close' : (tn === 'br' || tn === 'wbr' ? 'void' : 'open') }); continue; }
      flush(); out += tag; continue;
    }
    // texto: un salto de línea entre elementos cierra la frase (separa hermanos, no palabras)
    if (!t.trim() && t.includes('\n')) { flush(); out += t; continue; }
    run.push({ t, k: 'text' });
  }
  flush();

  // ── ajustes de la versión inglesa: la página vive en en/, un nivel más abajo ──
  const rel = (u) => {
    if (/^(https?:|#|\/|mailto:|tel:|data:|javascript:|\.\.\/)/.test(u) || !u) return u;
    const clean = u.replace(/^\.\//, '');
    if (clean.startsWith('en/')) return './' + clean.slice(3);
    const [path, rest = ''] = clean.split(/(?=[?#])/);
    if (EN_EXISTS[path]) return './' + EN_EXISTS[path] + rest;
    return '../' + clean;
  };
  let en = out.replace('<html lang="es"', '<html lang="en"')
    .replace(/\s(href|src|poster)="([^"]*)"/g, (m, a, v) => ` ${a}="${rel(v)}"`)
    .replace(/\ssrcset="([^"]*)"/g, (m, v) => ` srcset="${v.split(',').map((p) => p.trim().replace(/^\S+/, rel)).join(', ')}"`)
    // rutas dentro de scripts (window.location = './x.html', etc.)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (blk) => blk.replace(/(['"])\.\/([\w-]+\.html)/g, (m, q, f) => q + rel('./' + f)));

  // selector de idioma: EN activo y ES como enlace a la página española
  const TOGGLE = `<div class="ds-lang" role="group" aria-label="Language · Idioma">
    <a href="../${P.src === 'index.html' ? 'index.html' : P.src}" class="ds-lang-b" hreflang="es" lang="es" data-lang-to="es" title="Leer en español" aria-label="Leer en español">ES</a>
    <span class="ds-lang-a" aria-current="true" lang="en" title="English">EN</span>
  </div>`;
  if (!/<div class="ds-lang"[\s\S]*?<\/div>/.test(en)) console.warn(`  · ${name}: no encuentro el selector de idioma`);
  en = en.replace(/<div class="ds-lang"[\s\S]*?<\/div>/, TOGGLE);
  if (P.script) en = en.replace(P.script.before, (m, v) => `<script src="${P.script.src}${v || ''}" defer></script>\n${m}`);

  // cadenas literales dentro de <script> (datos de tarjetas, JSON-LD…): "texto" o 'texto' exactos
  const JS = DICT.js || {}, jsUsed = new Set();
  if (Object.keys(JS).length) {
    en = en.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (blk) => blk.replace(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g, (m, d, s) => {
      const v = d != null ? d : s;
      if (!Object.prototype.hasOwnProperty.call(JS, v)) return m;
      jsUsed.add(v);
      const t = JS[v];
      // clave y valor se escriben como en el código fuente (un \n es «\n»): solo se escapa la comilla
      return d != null ? '"' + t.replace(/(?<!\\)"/g, '\\"') + '"' : "'" + t.replace(/(?<!\\)'/g, "\\'") + "'";
    }));
    const unused = Object.keys(JS).filter((k) => !jsUsed.has(k));
    if (unused.length) console.warn(`  · ${name}: ${unused.length} cadenas js sin uso:`, unused.slice(0, 3).map((u) => u.slice(0, 40)));
  }

  for (const [a, b] of DICT.raw || []) {
    if (!en.includes(a)) console.warn(`  · ${name}: raw sin coincidencia:`, a.slice(0, 70));
    en = en.split(a).join(b);
  }
  writeFileSync(join(ROOT, P.out), en);
  console.log(`${P.out} · ${Object.keys(UNITS).length} frases en el diccionario · ${missing.length} sin traducir`);
  if (wantMissing) {
    writeFileSync(join(ROOT, P.missing), JSON.stringify(Object.fromEntries(missing.map((k) => [k, ''])), null, 2));
    console.log('  → ' + P.missing);
  }
}

const args = process.argv.slice(2), only = args.filter((a) => !a.startsWith('--'));
const names = only.length ? only : Object.keys(PAGES);
for (const n of names) { if (!PAGES[n]) { console.error('Página desconocida: ' + n); process.exit(1); } build(n, PAGES[n], args.includes('--missing')); }
