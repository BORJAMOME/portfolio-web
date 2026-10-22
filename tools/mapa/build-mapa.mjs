/* ═══════════════════════════════════════════════
   tools/mapa/build-mapa.mjs: genera el mapa de estructura (pestaña «Mapa» del área privada)
   ─────────────────────────────────────────────────
     node tools/mapa/build-mapa.mjs           → escribe mapa/estructura.js
     node tools/mapa/build-mapa.mjs --check   → no escribe: falla si está desactualizado (CI)
     node tools/mapa/build-mapa.mjs --json    → imprime el mapa en JSON (para inspeccionarlo)

   Lee el propio repositorio, sin tocar nada más:
     · portfolio web ...... páginas, proyectos que enseña cada una y enlaces (tools/mapa/web.mjs)
     · dónde vive ......... plataformas y repositorios a los que apuntan esos proyectos
     · área privada ....... pestañas de area-privada.html y MODULES de area-privada.js
     · datos y servicios .. supabase/*.sql (tablas, funciones) y supabase/functions/*
     · herramientas ....... tools/ y .github/workflows/
   Las relaciones salen de lo que cada archivo menciona (tablas, módulos, páginas, URL, scripts).
   Lo que no encaja en ningún grupo aparece en «sin clasificar/»; los enlaces que no reconoce,
   en `sinExplicar`: nada se pierde en silencio.
   Los textos y agrupaciones a mano están en tools/mapa/mapa.config.json.
   Después de regenerar: node tools/version-assets.mjs (el ?v= del archivo generado).
   Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeWeb } from './web.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = 'mapa/estructura.js';
const CHECK = process.argv.includes('--check');
const AS_JSON = process.argv.includes('--json');

// mismo contenido, mismo resultado en Windows (CRLF) y en CI (LF)
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const exists = (p) => existsSync(join(ROOT, p));
// Un archivo suelto sin añadir a git (un borrador, un arnés de pruebas) no debe cambiar el mapa ni romper --check:
// se ve lo que git conoce (rastreado o ya añadido); sin git, el árbol de trabajo.
let tracked = null;
try { tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean)); } catch { /* sin git: se usa el disco */ }
const known = (rel, isDir) => !tracked || (isDir ? [...tracked].some((f) => f.startsWith(rel + '/')) : tracked.has(rel));
const entries = (p) => (exists(p) ? readdirSync(join(ROOT, p), { withFileTypes: true }).filter((e) => known(p === '.' ? e.name : `${p}/${e.name}`, e.isDirectory())) : []);
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cfg = JSON.parse(read('tools/mapa/mapa.config.json'));
const uniq = (list) => [...new Set(list)];
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/* ── Lectura de código: qué menciona cada archivo ── */
const TOOL_EXT = 'm?js|cjs|ts|py|sh|gs';
const TOOL_FILE = new RegExp(`\\.(${TOOL_EXT})$`);
const CODE = /\.(m?js|cjs|ts|py|sh|gs|yml|yaml)$/;
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

/* Familia (color y forma en la leyenda) de cada tipo de nodo */
const FAMILIA = { capitulo: 'manual', pestana: 'privada', modulo: 'privada', esquema: 'dato', tabla: 'dato', funcion: 'dato', herramienta: 'herramienta', workflow: 'herramienta' };
const withFamily = (n) => {
  if (n.tipo !== 'grupo' && n.tipo !== 'columna') n.familia = cfg.familias[n.tipo] ? n.tipo : (FAMILIA[n.tipo] || (n.tipo === 'carpeta' ? 'pagina' : undefined));
  (n.hijos || []).forEach(withFamily);
  return n;
};

/* ═══════════ 1 · PORTFOLIO WEB ═══════════ */
const A = analyzeWeb({ ROOT, read, exists, entries, cfg });
const { P, E } = A;
const W = cfg.web;
const pageKeys = Object.keys(P);

// Padre de cada página: la primera que la enlaza desde su contenido, recorriendo en el orden de prioridad
// (los listados de Power BI mandan sobre la portada, que enlaza a casi todo).
const roots = W.raiz.filter((k) => P[k]);
const prio = [...W.prioridad.filter((k) => P[k]), ...pageKeys.filter((k) => !W.prioridad.includes(k))];
const parent = {};
const seen = new Set(roots);
const queue = prio.filter((k) => seen.has(k));
for (let i = 0; i < queue.length; i++) {
  for (const c of A.internal[queue[i]].filter((x) => P[x])) if (!seen.has(c)) { seen.add(c); parent[c] = queue[i]; queue.push(c); }
}

const pageNode = (k) => {
  const p = P[k];
  const c = A.caso[k];
  return {
    id: p.id, tipo: p.tipo, etiqueta: p.etiqueta, nota: [cut(p.desc, 200), p.conteo].filter(Boolean).join(' · ') || undefined, href: p.href, archivo: p.archivo,
    ...(c && c.techs.length ? { tec: c.techs } : {}),
  };
};
const entityNode = (id) => {
  const e = E[id];
  return { id, tipo: e.tipo, etiqueta: e.etiqueta, href: e.url || e.hrefInterno || undefined, externo: e.url ? true : undefined, ...(e.techs.length ? { tec: e.techs } : {}), ...(e.ruta ? { archivo: e.ruta } : {}), ...(e.fecha ? { nota: e.fecha } : {}), ...(e.soloDatos ? { nota: 'Solo figura en los datos estructurados (JSON-LD) de la página; no hay tarjeta visible.' } : {}) };
};

// Referencias: un proyecto que una página enseña pero que cuelga de otra (la portada enseña casos y apps) aparece también bajo ella
const refsOf = {};
const refNodes = [];
for (const [target, from] of Object.entries(A.showsPage)) {
  for (const k of uniq(from)) {
    const tPage = Object.values(P).find((p) => p.id === target);
    if (tPage && parent[tPage.key] === k) continue;                       // ya cuelga de ella en el árbol
    if (E[target] && E[target].dueña === k) continue;
    const base = tPage ? pageNode(tPage.key) : E[target] ? entityNode(target) : null;
    if (!base) continue;
    const node = { ...base, id: `r:${P[k].key}:${target}`, ref: target };
    delete node.hijos; delete node.nota;
    (refsOf[k] ??= []).push(node);
    refNodes.push({ id: node.id, target });
  }
}
function childrenOf(key) {
  const pages = uniq([...A.internal[key].filter((c) => parent[c] === key), ...Object.keys(parent).filter((c) => parent[c] === key)]);
  const groups = [], direct = [];
  const bucket = (label, node) => { let g = groups.find((x) => x.etiqueta === label); if (!g) groups.push((g = { id: `g:${key}:${slug(label)}`, tipo: 'grupo', etiqueta: label, hijos: [] })); g.hijos.push(node); };
  for (const c of pages) {
    const node = { ...pageNode(c), hijos: childrenOf(c) };
    if (!node.hijos.length) delete node.hijos;
    if (P[c].tipo === 'caso') bucket('dashboards/', node);
    else if (P[c].tipo === 'manual') bucket('manuales/', node);
    else if (P[c].tipo === 'app') bucket('apps/', node);
    else direct.push(node);
  }
  const own = Object.values(E).filter((e) => e.dueña === key).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.pos - b.pos || A.order.indexOf(a.id) - A.order.indexOf(b.id));
  for (const e of own) bucket(`${e.grupo}/`, entityNode(e.id));
  for (const r of refsOf[key] || []) bucket(W.referencias, r);
  return [...direct, ...groups];
}

const webTree = roots.map((k) => {
  const node = pageNode(k);
  const kids = childrenOf(k);
  return kids.length ? { ...node, hijos: kids } : node;
});
const orphans = pageKeys.filter((k) => !seen.has(k));
if (orphans.length) webTree.push({
  id: 'g:web:huerfanas', tipo: 'grupo', etiqueta: W.huerfanas.etiqueta, nota: W.huerfanas.nota,
  hijos: orphans.map((k) => { const n = { ...pageNode(k), hijos: childrenOf(k) }; if (!n.hijos.length) delete n.hijos; return n; }),
});
const enCount = entries('en').filter((e) => e.isFile() && e.name.endsWith('.html')).length;
if (enCount) webTree.push({
  id: 'g:web:ingles', tipo: 'grupo', etiqueta: W.ingles.etiqueta, nota: W.ingles.nota,
  hijos: [{ id: 'x:en', tipo: 'carpeta', etiqueta: `${enCount} páginas en inglés`, archivo: 'en/', href: './en/' }],
});

/* ═══════════ 1b · DÓNDE VIVE ═══════════ */
const repoNames = Object.keys(A.repos).sort(byName);
const viveTree = W.plataformas.filter((p) => A.plat[p.id] || (p.id === 'github' && repoNames.length)).map((p) => {
  const n = { id: `z:${p.id}`, tipo: 'plataforma', etiqueta: p.etiqueta };
  const members = A.plat[p.id] ? A.plat[p.id].size : 0;
  if (p.id === 'github') {
    n.hijos = repoNames.map((r) => ({ id: `z:gh:${slug(r)}`, tipo: 'repo', etiqueta: r, href: `https://github.com/${r.includes('/') ? r : `BORJAMOME/${r}`}`, externo: true }));
  } else if (members) n.nota = `${members} ${members === 1 ? 'elemento' : 'elementos'}`;
  return n;
});

/* ═══════════ 2 · ÁREA PRIVADA ═══════════ */
const apHtml = read('area-privada.html');
const apJs = read('area-privada.js');
const tabs = [...apHtml.matchAll(/<a href="#\/([^"]*)" data-tab="([^"]+)">([^<]+)<\/a>/g)].map((m) => ({ ruta: m[1], id: m[2], etiqueta: m[3].trim() }));
const modulesBlock = (/var MODULES = \{([\s\S]*?)\n  \};/.exec(apJs) || [, ''])[1];
const modules = [...modulesBlock.matchAll(/(?:'([\w-]+)'|(\w+)):\s*\{\s*global:\s*'(\w+)',\s*title:\s*'([^']+)'(?:,\s*tab:\s*'([\w-]+)')?/g)]
  .map((m) => ({ name: m[1] || m[2], global: m[3], title: m[4], tab: m[5] || (m[1] || m[2]) }));
// El mapa depende del formato de area-privada.html y de MODULES (CLAUDE.md lo documenta): si cambia, que falle con una pista.
if (!tabs.length) throw new Error('area-privada.html: no encuentro ninguna pestaña (<a href="#/…" data-tab="…">); ¿cambió el formato del menú?');
if (!modules.length) throw new Error('area-privada.js: no encuentro MODULES (var MODULES = { … }); ¿cambió el formato?');
for (const m of grab(apHtml, /data-ap-module="([\w-]+)"/g)) if (!modules.some((x) => x.name === m)) throw new Error(`area-privada.html declara data-ap-module="${m}" pero MODULES no lo tiene`);
for (const m of modules) if (!apHtml.includes(`data-ap-module="${m.name}"`)) throw new Error(`MODULES tiene «${m.name}» pero area-privada.html no declara su <link data-ap-module>`);
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
    subs.push({ id: `m:${x.id}`, tipo: 'carpeta', etiqueta: x.etiqueta, archivo: x.ruta, familia: 'privada' });
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
  const sql = read(`supabase/${f}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  const tablesIn = uniq(grab(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:\w+\.)?"?([a-z_]\w*)"?/gi));
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
const toolEntries = entries('tools').filter((e) => !cfg.herramientas.excluir.includes(e.name) && (e.isDirectory() || TOOL_FILE.test(e.name)));
const toolNodes = toolEntries.map((e) => {
  const sl = e.name.replace(TOOL_FILE, '');
  return { e, slug: sl, node: { id: `h:${sl}`, tipo: 'herramienta', etiqueta: e.isDirectory() ? `${e.name}/` : e.name, archivo: `tools/${e.name}${e.isDirectory() ? '/' : ''}` } };
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
  { id: 'vive', hijos: viveTree },
  { id: 'privada', hijos: privTree },
  { id: 'datos', hijos: [...sqlGroups, ...fnGroup] },
  { id: 'herramientas', hijos: toolTree },
].map((c) => ({ id: `col:${c.id}`, tipo: 'columna', etiqueta: COL[c.id].titulo, nota: COL[c.id].nota, hijos: c.hijos.map(withFamily) }));

const ids = new Set();
(function walk(list) { for (const n of list) { if (ids.has(n.id)) throw new Error(`Identificador repetido en el mapa: ${n.id}`); ids.add(n.id); walk(n.hijos || []); } })(columnas);

/* ═══════════ 6 · RELACIONES ═══════════ */
const rel = new Map();
const descartadas = [];
const pairs = new Set();
function link(de, a, tipo, detalle) {
  if (!de || !a || de === a) return;
  if (!ids.has(de) || !ids.has(a)) { descartadas.push(`${de} → ${a} (${tipo})`); return; }
  const key = `${de}|${a}|${tipo}`;
  const r = rel.get(key) || { de, a, tipo, detalle: [] };
  if (detalle) r.detalle = uniq([...r.detalle, ...[].concat(detalle).filter(Boolean)]).sort(byName);
  rel.set(key, r);
  pairs.add(`${de}|${a}`);
}
const knownTables = new Set(Object.keys(tableOwner));
const pageFilesAll = pageKeys.filter((k) => k.endsWith('.html'));
function scan(text) {
  const tables = uniq([
    ...grab(text, /\/rest\/v1\/([a-z_]\w*)/g), ...grab(text, /\.from\(\s*['"`]([a-z_]\w*)['"`]/g), ...grab(text, /\btable:\s*['"]([a-z_]\w*)['"]/g),
  ]).filter((t) => knownTables.has(t));
  const rpcs = uniq([...grab(text, /\/rest\/v1\/rpc\/([a-z_]\w*)/g), ...grab(text, /\.rpc\(\s*['"]([a-z_]\w*)['"]/g)]).filter((r) => rpcOwner[r]);
  return {
    tables, rpcs,
    modules: uniq(grab(text, /\bmodule\(\s*['"]([\w-]+)['"]/g)),
    modFiles: uniq(grab(text, /area-privada-([\w-]+)\.js/g)),
    pages: uniq(grab(text, /([\w-]+\.html)\b/g)).filter((p) => pageFilesAll.includes(p)),
    tools: uniq([...text.matchAll(new RegExp(`tools\\/([\\w.-]+?)(?:\\.(?:${TOOL_EXT})|\\/|\\s|["'\`)]|$)`, 'g'))].map((m) => m[1])),
  };
}
function dataLinks(from, s) {
  const perGroup = {};
  for (const t of s.tables) (perGroup[tableOwner[t]] ??= []).push(t);
  for (const r of s.rpcs) (perGroup[rpcOwner[r]] ??= []).push(`${r}()`);
  for (const [f, list] of Object.entries(perGroup)) link(from, groupOfFile(f), 'usa', list);
}

/* 6a · Web: qué enseña cada página y cómo se enlazan */
// una página enseña un proyecto ajeno (misma URL de informe, de app, de repositorio…)
for (const r of refNodes) link(r.id, r.target, 'igual');
for (const l of A.lives.filter((x) => x.enlaza)) link(l.de, l.a, 'enlaza');
for (const k of pageKeys) {
  for (const c of A.internal[k]) {
    if (c === 'area-privada.html') { link(P[k].id, 'col:privada', 'enlaza'); continue; }
    if (!P[c] || parent[c] === k || parent[k] === c || pairs.has(`${P[k].id}|${P[c].id}`)) continue;
    link(P[k].id, P[c].id, 'enlaza');
  }
  if (A.siguiente[k] && P[A.siguiente[k]]) link(P[k].id, P[A.siguiente[k]].id, 'siguiente');
}
for (const l of A.lives.filter((x) => !x.enlaza)) link(l.de, l.a, 'aloja', l.detalle);
for (const d of A.derive) link(d.de, d.a, 'deriva');
// el área privada enlaza a páginas públicas (Caesar III → roma-aeterna/)
for (const k of pageKeys) if (apHtml.includes(`href="./${k}"`) || apHtml.includes(`href="./${k}/"`)) link('col:privada', P[k].id, 'enlaza');
// las páginas públicas que apuntan al área privada (también desde carpetas: roma-aeterna)
for (const k of pageKeys) if (A.internal[k].includes('area-privada.html')) link(P[k].id, 'col:privada', 'enlaza');

/* 6b · Área privada y datos */
const moduleIds = new Set(modules.map((m) => m.name));
const idOfModule = (name) => (tabs.some((t) => t.id === name) ? `t:${name}` : `m:${name}`);
for (const t of tabs) {
  const s = scan(read(fileOfTab(t.id)));
  dataLinks(`t:${t.id}`, s);
  for (const m of s.modules.filter((x) => moduleIds.has(x))) link(`t:${t.id}`, idOfModule(m), 'compone');
}
for (const m of modules.filter((x) => x.name !== x.tab)) {
  const f = moduleFile(m.name);
  if (f) dataLinks(`m:${m.name}`, scan(read(f)));
}
for (const n of fnDirs) dataLinks(`f:${n}`, scan(textOf(codeFiles(`supabase/functions/${n}`, { skipTests: true }))));

/* 6c · Herramientas */
const toolBySlug = Object.fromEntries(toolNodes.map((t) => [t.slug, t.node.id]));
const tabOrModule = (name) => (moduleIds.has(name) ? idOfModule(name) : null);
for (const t of toolNodes) {
  const files = t.e.isDirectory() ? codeFiles(`tools/${t.e.name}`, { skipTests: true }) : [`tools/${t.e.name}`];
  const s = scan(textOf(files));
  const id = t.node.id;
  // el generador del mapa lee todo el repositorio: ninguna de sus menciones es una relación
  if (t.slug === 'mapa') { link(id, 't:mapa', 'alimenta'); continue; }
  // los motores locales (carpetas) publican en sus tablas y leen páginas del sitio; los scripts sueltos solo comprueban
  if (t.e.isDirectory()) dataLinks(id, s);
  const targets = [
    ...s.modFiles.map(tabOrModule).filter(Boolean).map((x) => [x, 'verifica']),
    ...(t.e.isDirectory() ? s.pages.map((p) => [P[p].id, 'lee']) : []),
  ];
  // una herramienta que menciona muchos destinos las recorre todas (enlaces, accesibilidad): no es una relación concreta
  if (targets.length <= 4) for (const [to, kind] of targets) link(id, to, kind);
  // mismo nombre que una pestaña: comprobación (test-x, check-x) o motor (carpeta x)
  const same = tabOrModule(t.slug.replace(/^(check|test|build)-/, ''));
  if (same) link(id, same, t.e.isDirectory() ? 'alimenta' : 'verifica');
  if (t.slug === 'build-en' && ids.has('x:en')) link(id, 'x:en', 'genera');
}
for (const w of workflows) {
  for (const name of scan(read(`.github/workflows/${w}`)).tools) {
    link(`w:${w.replace(/\.ya?ml$/, '')}`, toolBySlug[name.replace(TOOL_FILE, '')], 'ejecuta');
  }
}

const relaciones = [...rel.values()].sort((a, b) => byName(a.de + a.a + a.tipo, b.de + b.a + b.tipo));

/* ═══════════ 7 · SALIDA ═══════════ */
const count = (type) => { let n = 0; (function walk(l) { for (const x of l) { if (x.tipo === type) n++; walk(x.hijos || []); } })(columnas); return n; };
const revisados = new Set(cfg.web.revisados || []);   // enlaces que se han mirado y se dejan sin clasificar a propósito
const sinExplicar = Object.entries(A.sinExplicar).filter(([url]) => !revisados.has(url)).map(([url, p]) => ({ url, paginas: uniq(p).sort(byName) })).sort((a, b) => byName(a.url, b.url));
const recuento = {
  paginas: pageKeys.length,
  proyectos: count('caso') + count('app') + count('proyecto') + count('visual'),
  recursos: count('lab') + count('grafico') + count('post'),
  perfil: count('perfil'),
  capitulos: count('capitulo'),
  plataformas: count('plataforma') + count('repo'),
  pestanas: count('pestana'),
  tablas: count('tabla'),
  funciones: count('funcion'),
  herramientas: count('herramienta') + count('workflow'),
  relaciones: relaciones.length,
  sinExplicar: sinExplicar.length,
};
const ignorados = Object.entries(A.ignorados).map(([dominio, n]) => ({ dominio, n })).sort((a, b) => byName(a.dominio, b.dominio));
const body = {
  columnas, relaciones, sinExplicar, ignorados,
  tipos: cfg.tipos, verbos: cfg.relaciones,
  familias: cfg.familias,
};
const huella = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 7);
const data = { huella, recuento, ...body };

if (AS_JSON) { console.log(JSON.stringify(data, null, 1)); process.exit(0); }

const resumen = `${recuento.paginas} páginas, ${recuento.proyectos} proyectos, ${recuento.pestanas} pestañas, ${recuento.tablas} tablas, ${recuento.relaciones} relaciones`;
if (sinExplicar.length) console.warn(`⚠ ${sinExplicar.length} enlaces del contenido que el mapa no reconoce (campo sinExplicar):\n` + sinExplicar.slice(0, 12).map((x) => `   ${x.url}  ← ${x.paginas.join(', ')}`).join('\n'));
const avisos = [...A.avisos, ...(descartadas.length ? [`${descartadas.length} relaciones descartadas por apuntar a un nodo que no existe: ${descartadas.slice(0, 4).join('; ')}`] : [])];
for (const a of avisos) console.warn('⚠ ' + a);
const source = `/* Generado por tools/mapa/build-mapa.mjs: no se edita a mano. */\nexport default ${JSON.stringify(data, null, 1)};\n`;
const current = exists(OUT) ? read(OUT) : null;
if (CHECK) {
  const fallos = [...sinExplicar.map((m) => `enlace sin clasificar: ${m.url} (${m.paginas.join(', ')})`), ...avisos];
  if (fallos.length) {
    console.error(`✗ El mapa necesita atención:\n${fallos.map((f) => '   · ' + f).join('\n')}\n\nClasifícalo en tools/mapa/mapa.config.json (grupos, tipos, etiquetas) o añade la URL a web.revisados si es a propósito.`);
    process.exit(1);
  }
  if (current !== source) {
    console.error(`✗ ${OUT} está desactualizado: la estructura del repositorio ha cambiado.\n\nEjecuta: node tools/mapa/build-mapa.mjs && node tools/version-assets.mjs`);
    process.exit(1);
  }
  console.log(`✓ mapa al día (v${huella}): ${resumen}.`);
} else if (current === source) {
  console.log(`Sin cambios (v${huella}).`);
} else {
  mkdirSync(join(ROOT, 'mapa'), { recursive: true });
  writeFileSync(join(ROOT, OUT), source);
  console.log(`✓ ${OUT} actualizado (v${huella}): ${resumen}.`);
}
