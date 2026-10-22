/* ═══════════════════════════════════════════════
   tools/mapa/build-mapa.mjs: genera el mapa de estructura (pestaña «Mapa» del área privada)
   ─────────────────────────────────────────────────
     node tools/mapa/build-mapa.mjs           → escribe mapa/estructura.js
     node tools/mapa/build-mapa.mjs --check   → no escribe: falla si está desactualizado (CI)
     node tools/mapa/build-mapa.mjs --json    → imprime el mapa en JSON (para inspeccionarlo)

   Lee el propio repositorio, sin tocar nada más:
     · páginas públicas   → *.html de la raíz y carpetas con index.html
     · área privada       → pestañas de area-privada.html y MODULES de area-privada.js
     · datos y servicios  → supabase/*.sql (tablas, funciones) y supabase/functions/*
     · herramientas       → tools/ y .github/workflows/
   Las relaciones salen de lo que cada archivo menciona (tablas, módulos, páginas, scripts).
   Lo que no encaja en ningún grupo aparece en «sin clasificar/»: nunca se pierde.
   Los textos y agrupaciones a mano están en tools/mapa/mapa.config.json.
   Después de regenerar: node tools/version-assets.mjs (el ?v= del archivo generado).
   Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = 'mapa/estructura.js';
const CHECK = process.argv.includes('--check');
const AS_JSON = process.argv.includes('--json');

// mismo contenido, mismo resultado en Windows (CRLF) y en CI (LF)
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const exists = (p) => existsSync(join(ROOT, p));
const entries = (p) => (exists(p) ? readdirSync(join(ROOT, p), { withFileTypes: true }) : []);
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cfg = JSON.parse(read('tools/mapa/mapa.config.json'));
const uniq = (list) => [...new Set(list)];

/* ── Lectura de código: qué menciona cada archivo ── */
const CODE = /\.(m?js|cjs|ts|yml|yaml)$/;
const isTest = (f) => /(^|[./_-])(test|tests|e2e)([./_-]|$)|test_helpers|\.test\./.test(f);
function codeFiles(path, { skipTests = false } = {}) {
  const out = [];
  (function walk(p) {
    for (const e of entries(p)) {
      if (e.name === 'node_modules' || e.name === 'fixtures' || e.name.startsWith('.')) continue;
      const rel = p === '.' ? e.name : `${p}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (CODE.test(e.name) && !(skipTests && isTest(e.name))) out.push(rel);
    }
  })(path);
  return out.sort(byName);
}
const textOf = (files) => files.map(read).join('\n');

const grab = (text, re) => [...text.matchAll(re)].map((m) => m[1]);

/* ═══════════ 1 · PORTFOLIO WEB ═══════════ */
const titleOf = (file) => (/<title>([^<]*)<\/title>/.exec(read(file)) || [, ''])[1].trim();
const shortTitle = (t) => t.split(/\s[|·]\s/)[0].split(':')[0].trim();

const skipPages = new Set(cfg.web.excluir);
const pageFiles = entries('.').filter((e) => e.isFile() && e.name.endsWith('.html') && !skipPages.has(e.name)).map((e) => e.name).sort(byName);
const webDirs = [];
for (const e of entries('.').filter((x) => x.isDirectory() && !x.name.startsWith('.') && !cfg.web.ignorarCarpetas.includes(x.name))) {
  if (exists(`${e.name}/index.html`)) webDirs.push(e.name);
  else for (const s of entries(e.name).filter((x) => x.isDirectory())) if (exists(`${e.name}/${s.name}/index.html`)) webDirs.push(`${e.name}/${s.name}`);
}
webDirs.sort(byName);

const webItems = [
  ...pageFiles.map((f) => ({
    key: f, text: read(f),
    node: { id: `p:${f.replace(/\.html$/, '')}`, tipo: 'pagina', etiqueta: cfg.web.etiquetas[f] || shortTitle(titleOf(f)), href: `./${f}`, archivo: f },
  })),
  ...webDirs.map((d) => ({
    key: d, text: read(`${d}/index.html`),
    node: { id: `p:${d}`, tipo: 'carpeta', etiqueta: cfg.web.etiquetas[d] || shortTitle(titleOf(`${d}/index.html`)), href: `./${d}/`, archivo: `${d}/` },
  })),
];
const webGroups = cfg.web.grupos.map((g) => ({ ...g, hijos: [] }));
const unclassified = [];
for (const it of webItems) {
  const g = webGroups.find((x) => (x.paginas || []).includes(it.key) || (x.carpetas || []).includes(it.key)
    || (x.usaScript && new RegExp(`src="[^"]*${x.usaScript.replace('.', '\\.')}`).test(it.text)));
  (g ? g.hijos : unclassified).push(it.node);
}
const enCount = entries('en').filter((e) => e.isFile() && e.name.endsWith('.html')).length;
const webTree = webGroups.filter((g) => g.hijos.length).map((g) => ({
  id: `g:web:${g.id}`, tipo: 'grupo', etiqueta: g.etiqueta, nota: g.nota,
  hijos: g.id === 'casos' ? g.hijos : g.hijos,
}));
if (unclassified.length) webTree.push({ id: 'g:web:sin-clasificar', tipo: 'grupo', etiqueta: 'sin clasificar/', nota: 'añádela a un grupo en mapa.config.json', hijos: unclassified });
if (enCount) webTree.push({
  id: 'g:web:ingles', tipo: 'grupo', etiqueta: cfg.web.ingles.etiqueta, nota: cfg.web.ingles.nota,
  hijos: [{ id: 'x:en', tipo: 'carpeta', etiqueta: `${enCount} páginas en inglés`, archivo: 'en/', href: './en/' }],
});

/* ═══════════ 2 · ÁREA PRIVADA ═══════════ */
const apHtml = read('area-privada.html');
const apJs = read('area-privada.js');
const tabs = [...apHtml.matchAll(/<a href="#\/([^"]*)" data-tab="([^"]+)">([^<]+)<\/a>/g)].map((m) => ({ ruta: m[1], id: m[2], etiqueta: m[3].trim() }));
const modulesBlock = (/var MODULES = \{([\s\S]*?)\n  \};/.exec(apJs) || [, ''])[1];
const modules = [...modulesBlock.matchAll(/(?:'([\w-]+)'|(\w+)):\s*\{\s*global:\s*'(\w+)',\s*title:\s*'([^']+)'(?:,\s*tab:\s*'([\w-]+)')?/g)]
  .map((m) => ({ name: m[1] || m[2], global: m[3], title: m[4], tab: m[5] || (m[1] || m[2]) }));
const moduleFile = (name) => (exists(`area-privada-${name}.js`) ? `area-privada-${name}.js` : null);
// las pestañas sin módulo (Archivos y notas) viven en el shell
const fileOfTab = (tab) => moduleFile(tab) || 'area-privada.js';
const noteOf = (id) => cfg.privada.notas[id];

const privTree = tabs.map((t) => {
  const subs = modules.filter((m) => m.tab === t.id && m.name !== t.id).map((m) => ({
    id: `m:${m.name}`, tipo: 'modulo', etiqueta: cfg.privada.etiquetas[m.name] || m.title,
    nota: noteOf(m.name), archivo: moduleFile(m.name) || undefined,
  }));
  for (const x of cfg.privada.extras.filter((e) => e.tab === t.id && exists(e.ruta))) {
    subs.push({ id: `m:${x.id}`, tipo: 'carpeta', etiqueta: x.etiqueta, archivo: x.ruta });
  }
  return {
    id: `t:${t.id}`, tipo: 'pestana', etiqueta: cfg.privada.etiquetas[t.id] || t.etiqueta, nota: noteOf(t.id),
    href: `#/${t.ruta}`, archivo: fileOfTab(t.id), ...(subs.length ? { hijos: subs } : {}),
  };
});
// módulos sin pestaña que apunten a una pestaña inexistente: se muestran igualmente
for (const m of modules.filter((x) => !tabs.some((t) => t.id === x.tab))) {
  privTree.push({ id: `m:${m.name}`, tipo: 'modulo', etiqueta: cfg.privada.etiquetas[m.name] || m.title, nota: noteOf(m.name), archivo: moduleFile(m.name) || undefined });
}

/* ═══════════ 3 · DATOS Y SERVICIOS ═══════════ */
const sqlFiles = entries('supabase').filter((e) => e.isFile() && e.name.endsWith('.sql') && !cfg.datos.ignorarSql.some((w) => e.name.includes(w))).map((e) => e.name).sort(byName);
const tableOwner = {};   // tabla → archivo sql
const rpcOwner = {};     // función SQL → archivo sql
const sqlGroups = [];
for (const f of sqlFiles) {
  const sql = read(`supabase/${f}`);
  const tablesIn = uniq(grab(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_]\w*)"?/gi));
  for (const fn of grab(sql, /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_]\w*)"?/gi)) rpcOwner[fn] = f;
  if (!tablesIn.length) continue;
  for (const t of tablesIn) tableOwner[t] = f;
  const base = f.replace(/\.sql$/, '');
  sqlGroups.push({
    id: `d:${base}`, tipo: 'esquema', etiqueta: f, archivo: `supabase/${f}`,
    hijos: tablesIn.map((t) => ({ id: `q:${t}`, tipo: 'tabla', etiqueta: t })),
  });
}
const fnDirs = entries('supabase/functions').filter((e) => e.isDirectory() && exists(`supabase/functions/${e.name}/index.ts`)).map((e) => e.name).sort(byName);
const fnGroup = fnDirs.length ? [{
  id: 'g:datos:functions', tipo: 'grupo', etiqueta: cfg.datos.etiquetaFunciones, nota: cfg.datos.notaFunciones,
  hijos: fnDirs.map((n) => ({ id: `f:${n}`, tipo: 'funcion', etiqueta: n, archivo: `supabase/functions/${n}/` })),
}] : [];
const groupOfFile = (f) => `d:${f.replace(/\.sql$/, '')}`;

/* ═══════════ 4 · HERRAMIENTAS ═══════════ */
const toolEntries = entries('tools').filter((e) => !cfg.herramientas.excluir.includes(e.name) && (e.isDirectory() || /\.(m?js|cjs)$/.test(e.name)));
const toolNodes = toolEntries.map((e) => {
  const slug = e.name.replace(/\.(m?js|cjs)$/, '');
  return { e, slug, node: { id: `h:${slug}`, tipo: 'herramienta', etiqueta: e.isDirectory() ? `${e.name}/` : e.name, archivo: `tools/${e.name}${e.isDirectory() ? '/' : ''}` } };
});
const toolGroups = cfg.herramientas.grupos.map((g) => ({ ...g, hijos: [] }));
const toolsLoose = [];
for (const t of toolNodes) {
  const g = toolGroups.find((x) => (x.carpetas || []).includes(t.slug) || (x.patron && !t.e.isDirectory() && new RegExp(x.patron).test(t.e.name)));
  (g ? g.hijos : toolsLoose).push(t.node);
}
const toolTree = toolGroups.filter((g) => g.hijos.length).map((g) => ({ id: `g:tools:${g.id}`, tipo: 'grupo', etiqueta: g.etiqueta, nota: g.nota, hijos: g.hijos.sort((a, b) => byName(a.etiqueta, b.etiqueta)) }));
if (toolsLoose.length) toolTree.push({ id: 'g:tools:otras', tipo: 'grupo', etiqueta: 'sin clasificar/', nota: 'añádela a un grupo en mapa.config.json', hijos: toolsLoose });
const workflows = entries('.github/workflows').filter((e) => e.isFile() && /\.ya?ml$/.test(e.name)).map((e) => e.name).sort(byName);
if (workflows.length) toolTree.push({
  id: 'g:tools:ci', tipo: 'grupo', etiqueta: cfg.herramientas.workflows.etiqueta, nota: cfg.herramientas.workflows.nota,
  hijos: workflows.map((w) => ({ id: `w:${w.replace(/\.ya?ml$/, '')}`, tipo: 'workflow', etiqueta: w, archivo: `.github/workflows/${w}` })),
});

/* ═══════════ 5 · ÁRBOL ═══════════ */
const COL = cfg.columnas;
const columnas = [
  { id: 'web', hijos: webTree },
  { id: 'privada', hijos: privTree },
  { id: 'datos', hijos: [...sqlGroups, ...fnGroup] },
  { id: 'herramientas', hijos: toolTree },
].map((c) => ({ id: `col:${c.id}`, tipo: 'columna', etiqueta: COL[c.id].titulo, nota: COL[c.id].nota, hijos: c.hijos }));

const ids = new Set();
(function walk(list) { for (const n of list) { if (ids.has(n.id)) throw new Error(`Identificador repetido en el mapa: ${n.id}`); ids.add(n.id); walk(n.hijos || []); } })(columnas);

/* ═══════════ 6 · RELACIONES ═══════════ */
const rel = new Map();
function link(de, a, tipo, detalle) {
  if (!de || !a || de === a || !ids.has(de) || !ids.has(a)) return;
  const key = `${de}|${a}|${tipo}`;
  const r = rel.get(key) || { de, a, tipo, detalle: [] };
  if (detalle) r.detalle = uniq([...r.detalle, ...[].concat(detalle)]).sort(byName);
  rel.set(key, r);
}
const knownTables = new Set(Object.keys(tableOwner));
function scan(text) {
  const tables = uniq([
    ...grab(text, /\/rest\/v1\/([a-z_]\w*)/g), ...grab(text, /\.from\(\s*['"`]([a-z_]\w*)['"`]/g), ...grab(text, /\btable:\s*['"]([a-z_]\w*)['"]/g),
  ]).filter((t) => knownTables.has(t));
  const rpcs = uniq([...grab(text, /\/rest\/v1\/rpc\/([a-z_]\w*)/g), ...grab(text, /\.rpc\(\s*['"]([a-z_]\w*)['"]/g)]).filter((r) => rpcOwner[r]);
  return {
    tables, rpcs,
    modules: uniq(grab(text, /\bmodule\(\s*['"]([\w-]+)['"]/g)),
    modFiles: uniq(grab(text, /area-privada-([\w-]+)\.js/g)),
    pages: uniq(grab(text, /([\w-]+\.html)\b/g)).filter((p) => pageFiles.includes(p)),
    sqls: uniq(grab(text, /([\w-]+\.sql)\b/g)).filter((s) => sqlFiles.includes(s)),
    tools: uniq([...text.matchAll(/tools\/([\w.-]+?)(?:\.(?:m?js|cjs)|\/|\s|["'`)]|$)/g)].map((m) => m[1])),
  };
}
function dataLinks(from, s) {
  const perGroup = {};
  for (const t of s.tables) (perGroup[tableOwner[t]] ??= []).push(t);
  for (const r of s.rpcs) (perGroup[rpcOwner[r]] ??= []).push(`${r}()`);
  for (const [f, list] of Object.entries(perGroup)) link(from, groupOfFile(f), 'usa', list);
}

// módulos y pestañas → datos, y módulo → módulo
const moduleIds = new Set(modules.map((m) => m.name));
const idOfModule = (name) => (tabs.some((t) => t.id === name) ? `t:${name}` : `m:${name}`);
for (const t of tabs) {
  const file = fileOfTab(t.id);
  const s = scan(read(file));
  dataLinks(`t:${t.id}`, s);
  for (const m of s.modules.filter((x) => moduleIds.has(x))) link(`t:${t.id}`, idOfModule(m), 'compone');
}
for (const m of modules.filter((x) => x.name !== x.tab)) {
  const f = moduleFile(m.name);
  if (f) dataLinks(`m:${m.name}`, scan(read(f)));
}
// páginas públicas → área privada
for (const it of webItems) if (/area-privada\.html/.test(it.text)) link(it.node.id, 'col:privada', 'enlaza');
// Edge Functions → datos
for (const n of fnDirs) dataLinks(`f:${n}`, scan(textOf(codeFiles(`supabase/functions/${n}`, { skipTests: true }))));

// herramientas → lo que mencionan
const toolBySlug = Object.fromEntries(toolNodes.map((t) => [t.slug, t.node.id]));
const tabOrModule = (name) => (moduleIds.has(name) ? idOfModule(name) : null);
for (const t of toolNodes) {
  const files = t.e.isDirectory() ? codeFiles(`tools/${t.e.name}`, { skipTests: true }) : [`tools/${t.e.name}`];
  const text = textOf(files);
  const s = scan(text);
  const id = t.node.id;
  const isBuild = /^build-/.test(t.slug);
  // el generador del mapa lee todo el repositorio: ninguna de sus menciones es una relación
  if (t.slug === 'mapa') { link(id, 't:mapa', 'alimenta'); continue; }
  // los motores locales (carpetas) publican en sus tablas y leen páginas del sitio; los scripts sueltos solo comprueban
  if (t.e.isDirectory()) dataLinks(id, s);
  const targets = [
    ...s.modFiles.map(tabOrModule).filter(Boolean).map((x) => [x, 'verifica']),
    ...(t.e.isDirectory() ? s.pages.map((p) => [`p:${p.replace(/\.html$/, '')}`, 'lee']) : []),
  ];
  // una herramienta que menciona muchos destinos las recorre todas (enlaces, accesibilidad): no es una relación concreta
  if (targets.length <= 4) for (const [to, kind] of targets) link(id, to, kind);
  // mismo nombre que una pestaña: comprobación (test-x, check-x) o motor (carpeta x)
  const slug = t.slug.replace(/^(check|test|build)-/, '');
  const same = tabOrModule(slug);
  if (same) link(id, same, t.e.isDirectory() ? 'alimenta' : 'verifica');
  if (isBuild && t.slug === 'build-en' && ids.has('x:en')) link(id, 'x:en', 'genera');
}
// los workflows ejecutan herramientas
for (const w of workflows) {
  const s = scan(read(`.github/workflows/${w}`));
  for (const name of s.tools) {
    const slug = name.replace(/\.(m?js|cjs)$/, '');
    link(`w:${w.replace(/\.ya?ml$/, '')}`, toolBySlug[slug], 'ejecuta');
  }
}

const relaciones = [...rel.values()].sort((a, b) => byName(a.de + a.a + a.tipo, b.de + b.a + b.tipo));

/* ═══════════ 7 · SALIDA ═══════════ */
const count = (type) => { let n = 0; (function walk(l) { for (const x of l) { if (x.tipo === type) n++; walk(x.hijos || []); } })(columnas); return n; };
const recuento = {
  paginas: count('pagina') + count('carpeta') - (ids.has('x:en') ? 1 : 0) - (ids.has('m:visor') ? 1 : 0),
  pestanas: count('pestana'),
  tablas: count('tabla'),
  funciones: count('funcion'),
  herramientas: count('herramienta') + count('workflow'),
  relaciones: relaciones.length,
};
const body = { columnas, relaciones, tipos: cfg.tipos, verbos: Object.fromEntries(Object.entries(cfg.relaciones).map(([k, v]) => [k, v])) };
const huella = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 7);
const data = { huella, recuento, ...body };

if (AS_JSON) { console.log(JSON.stringify(data, null, 1)); process.exit(0); }

const source = `/* Generado por tools/mapa/build-mapa.mjs: no se edita a mano. */\nexport default ${JSON.stringify(data, null, 1)};\n`;
const current = exists(OUT) ? read(OUT) : null;
if (CHECK) {
  if (current !== source) {
    console.error(`✗ ${OUT} está desactualizado: la estructura del repositorio ha cambiado.\n\nEjecuta: node tools/mapa/build-mapa.mjs && node tools/version-assets.mjs`);
    process.exit(1);
  }
  console.log(`✓ mapa al día (v${huella}): ${recuento.paginas} páginas, ${recuento.pestanas} pestañas, ${recuento.tablas} tablas, ${recuento.relaciones} relaciones.`);
} else if (current === source) {
  console.log(`Sin cambios (v${huella}).`);
} else {
  mkdirSync(join(ROOT, 'mapa'), { recursive: true });
  writeFileSync(join(ROOT, OUT), source);
  console.log(`✓ ${OUT} actualizado (v${huella}): ${recuento.paginas} páginas, ${recuento.pestanas} pestañas, ${recuento.tablas} tablas, ${recuento.funciones} funciones, ${recuento.herramientas} herramientas, ${recuento.relaciones} relaciones.`);
}
