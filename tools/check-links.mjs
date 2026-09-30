/* ═══════════════════════════════════════════════
   tools/check-links.mjs — enlaces y recursos internos
   ─────────────────────────────────────────────────
     node tools/check-links.mjs

   Recorre todas las páginas (raíz y en/) y falla si encuentra:
   · un enlace, imagen, script o estilo local que no existe (href, src, srcset, poster, url() en CSS);
   · un ancla (#id) que no existe en la página de destino;
   · una URL del sitemap o un hreflang que apunta a un archivo inexistente;
   · un par de idiomas que no se enlaza en los dos sentidos (hreflang es ↔ en).
   Los enlaces externos (http, mailto, tel) no se comprueban: dependen de terceros.
   Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://borjamora.es/';
const errors = [];
const fail = (file, msg) => errors.push(`${relative(ROOT, file).padEnd(30)} ${msg}`);

const pages = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => join(ROOT, f)),
  ...readdirSync(join(ROOT, 'en')).filter((f) => f.endsWith('.html')).map((f) => join(ROOT, 'en', f)),
];
const html = Object.fromEntries(pages.map((p) => [p, readFileSync(p, 'utf8')]));

// ids de cada página (para comprobar anclas)
const ids = {};
for (const p of pages) ids[p] = new Set([...html[p].matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

const isExternal = (u) => /^(https?:|mailto:|tel:|data:|javascript:|blob:|\/\/)/i.test(u);
const isDynamic = (u) => /[`$]|\{\{|\+\s*$/.test(u);  // plantillas JS: no son rutas reales

function checkRef(page, raw, kind) {
  const u = raw.trim().replace(/&amp;/g, '&');
  if (!u || isExternal(u) || isDynamic(u)) return;
  const [pathAndQuery, hash = ''] = u.split('#');
  const path = pathAndQuery.split('?')[0];
  const target = path ? resolve(dirname(page), decodeURIComponent(path)) : page;
  if (path) {
    if (!existsSync(target)) return fail(page, `${kind} roto → ${u}`);
    if (statSync(target).isDirectory() && !existsSync(join(target, 'index.html'))) return fail(page, `${kind} a carpeta sin index → ${u}`);
  }
  if (hash && /\.html$/.test(target) && ids[target] && !ids[target].has(decodeURIComponent(hash))) fail(page, `ancla inexistente → ${u}`);
}

for (const p of pages) {
  // quita scripts (sus cadenas son código, no enlaces), salvo JSON-LD
  const s = html[p].replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g, '');
  for (const m of s.matchAll(/\s(href|src|poster)="([^"]*)"/g)) {
    // #hex de theme-color y similares no son anclas
    if (m[1] === 'href' && /^#[0-9a-f]{3,8}$/i.test(m[2]) && !ids[p].has(m[2].slice(1))) continue;
    checkRef(p, m[2], m[1]);
  }
  for (const m of s.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of m[1].split(',')) checkRef(p, part.trim().split(/\s+/)[0], 'srcset');
  for (const m of s.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)) if (!/^(#|%23)/.test(m[2])) checkRef(p, m[2], 'url()');
  // meta refresh (redirecciones)
  const refresh = s.match(/http-equiv="refresh" content="\d+;\s*url=([^"]+)"/i);
  if (refresh) checkRef(p, refresh[1], 'refresh');
}

// CSS propios: url() relativos al archivo CSS
const cssFiles = [join(ROOT, 'shared.css'), ...['css', 'ds'].flatMap((d) => existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.css')).map((f) => join(ROOT, d, f)) : [])];
for (const c of cssFiles) for (const m of readFileSync(c, 'utf8').matchAll(/url\((['"]?)([^)'"]+)\1\)/g)) if (!/^(#|%23)/.test(m[2])) checkRef(c, m[2], 'url()');

// sitemap y hreflang
const fileFor = (url) => join(ROOT, url.replace(SITE, '').replace(/^$|\/$/, (x) => x + 'index.html') || 'index.html');
const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>|href="([^"]+)"/g)) {
  const url = m[1] || m[2];
  if (!existsSync(fileFor(url))) fail(join(ROOT, 'sitemap.xml'), `URL sin archivo → ${url}`);
}
for (const p of pages) {
  const alt = Object.fromEntries([...html[p].matchAll(/<link rel="alternate" hreflang="(es|en)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  if (!alt.es || !alt.en) continue;
  for (const [lang, url] of Object.entries(alt)) {
    const f = fileFor(url);
    if (!existsSync(f)) { fail(p, `hreflang ${lang} sin archivo → ${url}`); continue; }
    const back = html[f] && html[f].match(/<link rel="alternate" hreflang="(es|en)" href="([^"]+)"/g);
    if (!back || back.join() !== [...html[p].matchAll(/<link rel="alternate" hreflang="(es|en)" href="([^"]+)"/g)].map((m) => m[0]).join()) fail(p, `hreflang no recíproco con ${relative(ROOT, f)}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n✗ ${errors.length} problema(s) en ${pages.length} páginas.`);
  process.exit(1);
}
console.log(`✓ ${pages.length} páginas: enlaces, recursos, anclas, sitemap y hreflang correctos.`);
