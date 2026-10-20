/* ═══════════════════════════════════════════════
   tools/second-brain/identity.mjs: una sola entidad por proyecto
   ─────────────────────────────────────────────────
   Un mismo proyecto puede existir como carpeta del portfolio de GitHub, como repositorio propio (la app),
   como caso de estudio publicado en la web o como informe de Power BI. Aquí se unen esas apariencias
   en UNA entidad con todas sus fuentes, y solo con vínculos explícitos y comprobables:

     · el README de un proyecto enlaza a la carpeta o al repositorio del otro (los enlaces son de ida y vuelta);
     · una entrada del catálogo publicado declara el repositorio (campo «repo» del JSON-LD de su página).

   No se une nada por parecido de nombre. Los índices (README que enlazan a muchos proyectos) nunca se unen.
   Es determinista y no toca los archivos: solo reasigna a qué proyecto pertenece cada uno.
   ═══════════════════════════════════════════════ */

const PRIORITY = (pj) => (pj.kind === 'catalogo' ? 3 : pj.dir ? 1 : 2);   // carpeta de portfolio < repositorio propio < catálogo

/** Alias verificables de un proyecto: «owner/repo» o «owner/repo/ruta», en minúsculas. */
function aliasesOf(pj) {
  const out = new Set();
  if (pj.repo && !pj.container) out.add((pj.dir ? `${pj.repo.slug}/${pj.dir}` : pj.repo.slug).toLowerCase());
  if (pj.catalog && pj.catalog.repo) out.add(`borjamome/${pj.catalog.repo}`.toLowerCase());
  return out;
}

/** Fuentes legibles de un proyecto (solo URLs https): repositorio, carpeta, página del portfolio e informe publicado. */
export function sourcesOf(pj) {
  const out = [];
  const add = (kind, label, url) => { if (url && /^https:\/\//.test(url) && !out.some((x) => x.url === url)) out.push({ kind, label: String(label).slice(0, 110), url: String(url).slice(0, 500) }); };
  if (pj.repo && !pj.container) {
    const base = `https://github.com/${pj.repo.slug}`;
    add('repositorio', pj.dir ? `${pj.repo.slug.split('/')[1]} › ${pj.dir}` : pj.repo.slug, pj.dir ? `${base}/tree/${pj.repo.branch}/${pj.dir.split('/').map(encodeURIComponent).join('/')}` : base);
  }
  if (pj.catalog) {
    if (pj.catalog.repo) add('repositorio', pj.catalog.repo, `https://github.com/BORJAMOME/${pj.catalog.repo}`);
    add(pj.group === 'Manual' ? 'manual' : 'portfolio', pj.group ? `Portfolio · ${pj.group}` : 'Portfolio', pj.catalog.page);
    if (pj.catalog.url && pj.catalog.url !== pj.catalog.page) add('informe', 'Informe publicado', pj.catalog.url);
  }
  return out;
}

/**
 * Une los proyectos que son el mismo y reasigna sus archivos. Modifica `scan` (projects y files) y devuelve
 * { merges, indexes } para el inventario: qué se ha unido, por qué vínculo y qué índices se han ignorado.
 */
export function mergeIdentities(scan) {
  const projects = scan.projects;
  const parent = new Map([...projects.keys()].map((k) => [k, k]));
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const union = (a, b, why) => { const ra = find(a), rb = find(b); if (ra !== rb) { parent.set(rb, ra); reasons.push({ a, b, why }); } };
  const reasons = [];

  const byAlias = new Map();
  for (const [key, pj] of projects) for (const a of aliasesOf(pj)) { if (!byAlias.has(a)) byAlias.set(a, []); byAlias.get(a).push(key); }

  // 1) vínculos entre README: A enlaza a algo que es alias de B
  const asIndex = [];
  for (const [key, pj] of projects) {
    if (pj.container) continue;
    const targets = [];
    for (const link of (pj.readme && pj.readme.links) || []) {
      for (const other of byAlias.get(link) || []) {
        if (other !== key && !projects.get(other).container && !targets.some((t) => t.other === other)) targets.push({ other, link });
      }
    }
    // un README que enlaza a varios proyectos es un índice (p. ej. la home del portfolio): no identifica a ninguno
    if (targets.length > 1) { asIndex.push({ key, label: (pj.readme && pj.readme.title) || pj.label }); continue; }
    for (const t of targets) union(key, t.other, `el README de «${(pj.readme && pj.readme.title) || pj.label}» enlaza a ${t.link}`);
  }
  // 2) el catálogo declara el repositorio de un caso de estudio
  for (const [key, pj] of projects) {
    if (!pj.catalog || !pj.catalog.repo) continue;
    const alias = `borjamome/${pj.catalog.repo}`.toLowerCase();
    for (const other of byAlias.get(alias) || []) {
      if (other === key || projects.get(other).kind === 'catalogo') continue;
      union(key, other, `la página publicada declara el repositorio ${pj.catalog.repo}`);
    }
  }

  const groups = new Map();
  for (const key of projects.keys()) { const r = find(key); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(key); }

  const merges = [];
  const remap = new Map();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const list = members.map((k) => projects.get(k)).sort((a, b) => PRIORITY(a) - PRIORITY(b) || a.key.localeCompare(b.key));
    const main = list[0];
    const withTitle = list.find((p) => p.readme && p.readme.title && p.kind !== 'catalogo') || list.find((p) => p.readme && p.readme.title);
    const cat = list.find((p) => p.kind === 'catalogo');
    const all = [];
    for (const p of list) for (const s of sourcesOf(p)) if (!all.some((x) => x.url === s.url)) all.push(s);
    main.merged = list.slice(1).map((p) => ({ key: p.key, label: p.readme && p.readme.title ? p.readme.title : p.label, source: p.source }));
    main.sources = all;
    if (withTitle && withTitle !== main) main.readme = { ...withTitle.readme, depth: 0 };
    if (cat) { main.link = cat.link || main.link; main.group = cat.group; }
    for (const p of list.slice(1)) { for (const a of p.artifacts) main.artifacts.add(a); main.noReadme = main.noReadme && p.noReadme; remap.set(p.key, main.key); projects.delete(p.key); }
    merges.push({ into: main.key, title: (main.readme && main.readme.title) || main.label, from: main.merged, reasons: reasons.filter((r) => members.includes(r.a) || members.includes(r.b)).map((r) => r.why) });
  }
  for (const f of scan.files) if (remap.has(f.project)) f.project = remap.get(f.project);
  for (const pj of projects.values()) if (!pj.sources) pj.sources = sourcesOf(pj);

  const indexes = [...projects.values()].filter((p) => p.container).map((p) => ({ key: p.key, label: (p.readme && p.readme.title) || p.label })).concat(asIndex);
  return { merges, indexes };
}
