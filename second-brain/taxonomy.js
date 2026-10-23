/* ═══════════════════════════════════════════════
   second-brain/taxonomy.js: jerarquía del conocimiento (lógica pura, sin DOM)
   ─────────────────────────────────────────────────
   Área → disciplina → subdisciplina → técnica → proyecto que la aplica.
   Todo se calcula sobre el snapshot ya validado (campos parent, stage, branch, sources…):
   no se inventa ninguna relación ni ningún nivel. La interfaz solo pinta lo que devuelve.
   ═══════════════════════════════════════════════ */

/** Etapas de conocimiento: describen qué clase de evidencia hay; no son una nota de dominio. */
export const STAGES = [
  { id: 'sin_evidencia', label: 'Sin evidencia', short: 'Sin evidencia', hint: 'No hay evidencia en las fuentes analizadas. No significa que no se sepa.' },
  { id: 'identificado', label: 'Identificado', short: 'Identificado', hint: 'Aparece en listas o menciones declarativas, sin documentación ni práctica.' },
  { id: 'estudiado', label: 'Estudiado o documentado', short: 'Estudiado', hint: 'Hay documentación o apuntes, pero no práctica detectable.' },
  { id: 'aplicado', label: 'Aplicado', short: 'Aplicado', hint: 'Se ha usado en el código o los artefactos de un proyecto.' },
  { id: 'reforzado', label: 'Reforzado', short: 'Reforzado', hint: 'Aplicado en más de un proyecto.' },
  { id: 'evaluado', label: 'Evaluado', short: 'Evaluado', hint: 'Evaluado con una prueba o evidencia verificable que has registrado tú.' },
  { id: 'dominio', label: 'Dominio confirmado', short: 'Dominio', hint: 'Confirmado por ti con criterios definidos. El motor nunca lo deduce.' },
];
export const STAGE_BY_ID = new Map(STAGES.map((s, i) => [s.id, { ...s, order: i }]));

/** Qué falta, con las reglas del motor, para pasar a la siguiente etapa. */
export function stageNext(node) {
  switch (node && node.stage) {
    case 'sin_evidencia': return 'Para llegar a «estudiado» haría falta documentarlo (README, apuntes) y, para «aplicado», usarlo en el código de un proyecto.';
    case 'identificado': return 'Está solo declarado. Documentarlo lo llevaría a «estudiado»; usarlo en un proyecto, a «aplicado».';
    case 'estudiado': return 'Falta aplicarlo: aparece en documentación pero no se detecta en el código o los artefactos de ningún proyecto.';
    case 'aplicado': return 'Para ser «reforzado» tendría que aparecer también en el código de otro proyecto.';
    case 'reforzado': return 'Para ser «evaluado» tendrías que registrar una evaluación verificable (assessments, con motivo y origen). No se deduce.';
    case 'evaluado': return 'Para ser «dominio confirmado» tendrías que confirmarlo tú con criterios definidos.';
    case 'dominio': return 'Es la etapa más alta; la has registrado tú.';
    default: return '';
  }
}

const isKnowledge = (n) => n.type !== 'proyecto' && n.stage !== undefined;

export function buildTaxonomy(g) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const tree = g.nodes.filter(isKnowledge);
  const kids = new Map(tree.map((n) => [n.id, []]));
  for (const n of tree) if (n.parent && kids.has(n.parent)) kids.get(n.parent).push(n);
  const cmp = (a, b) => (b.evidence ? b.evidence.projects : 0) - (a.evidence ? a.evidence.projects : 0) || a.label.localeCompare(b.label, 'es');
  for (const l of kids.values()) l.sort(cmp);
  const roots = tree.filter((n) => !n.parent || !kids.has(n.parent)).sort(cmp);

  // proyectos que demuestran cada concepto (relación «demuestra»: proyecto → concepto)
  const appliers = new Map();
  const techniques = new Map();
  for (const e of g.edges) {
    if (e.type !== 'demuestra') continue;
    const p = byId.get(e.source), c = byId.get(e.target);
    if (!p || !c || p.type !== 'proyecto') continue;
    if (!appliers.has(c.id)) appliers.set(c.id, new Set());
    appliers.get(c.id).add(p.id);
    if (!techniques.has(p.id)) techniques.set(p.id, []);
    techniques.get(p.id).push({ node: c, edge: e });
  }
  for (const l of techniques.values()) l.sort((a, b) => (b.node.depth || 0) - (a.node.depth || 0) || (b.edge.evidenceCount || 0) - (a.edge.evidenceCount || 0) || a.node.label.localeCompare(b.node.label, 'es'));

  const descCache = new Map();
  function descendants(id) {
    if (descCache.has(id)) return descCache.get(id);
    const out = new Set();
    for (const k of kids.get(id) || []) { out.add(k.id); for (const d of descendants(k.id)) out.add(d); }
    descCache.set(id, out);
    return out;
  }
  /** Camino de raíz a nodo (para el «migas de pan»); sirve también para proyectos, a través de su técnica principal. */
  function pathOf(id) {
    const out = [];
    const seen = new Set();
    for (let n = byId.get(id); n && !seen.has(n.id) && out.length < 12; n = n.parent ? byId.get(n.parent) : null) { seen.add(n.id); out.unshift(n); }
    return out;
  }
  /** Proyectos que aplican el concepto (con `deep`, también cualquiera de sus descendientes). */
  function projectsOf(id, deep = true) {
    const ids = new Set(appliers.get(id) || []);
    if (deep) for (const d of descendants(id)) for (const p of appliers.get(d) || []) ids.add(p);
    return [...ids].map((p) => byId.get(p)).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }
  /** Lo que se ve al aislar una rama: su camino hasta la raíz, la propia rama, sus descendientes y los proyectos que la aplican. */
  function branchSet(id) {
    const out = new Set(pathOf(id).map((n) => n.id));
    out.add(id);
    for (const d of descendants(id)) out.add(d);
    for (const p of projectsOf(id, true)) out.add(p.id);
    return out;
  }
  const isLeaf = (n) => !(kids.get(n.id) || []).length;

  /** Cobertura de una rama: hojas con práctica, solo documentadas y sin evidencia. Mide documentación y práctica, no dominio. */
  function coverage(n) {
    if (n.branch) return { leaves: n.branch.leaves, aplicado: n.branch.aplicado, documentado: n.branch.documentado, sinEvidencia: n.branch.sinEvidencia };
    return null;
  }

  return { byId, tree, kids, roots, appliers, techniques, descendants, pathOf, projectsOf, branchSet, isLeaf, coverage };
}

/**
 * Vistas rápidas calculadas con los datos reales. Solo se ofrecen las que tienen al menos un elemento.
 * Cada vista: { id, label, hint, count, branch? | stages? | test(n) }
 */
export function quickViews(g, tax) {
  const out = [];
  for (const r of tax.roots.filter((x) => (tax.kids.get(x.id) || []).length)) {
    out.push({ id: 'branch:' + r.id, label: r.label.replace(/^Machine learning$/, 'Machine Learning'), hint: 'Aísla esta área con sus técnicas y los proyectos que las aplican.', branch: r.id, count: tax.branchSet(r.id).size });
  }
  const pend = tax.tree.filter((n) => ['identificado', 'estudiado'].includes(n.stage));
  if (pend.length) out.push({ id: 'pendiente-practica', label: 'Pendiente de práctica', hint: 'Conocimientos identificados o estudiados que todavía no se detectan aplicados en ningún proyecto.', stages: ['identificado', 'estudiado'], count: pend.length });
  const sinProyecto = tax.tree.filter((n) => tax.isLeaf(n) && !(tax.appliers.get(n.id) || new Set()).size && n.stage !== 'sin_evidencia');
  if (sinProyecto.length) {
    const ids = new Set(sinProyecto.map((n) => n.id));
    out.push({ id: 'sin-proyecto', label: 'Sin proyecto asociado', hint: 'Técnicas y conceptos con evidencia pero que ningún proyecto demuestra.', test: (n) => ids.has(n.id), count: ids.size });
  }
  const sinDoc = g.nodes.filter((n) => n.type === 'proyecto' && n.noReadme);
  if (sinDoc.length) { const ids = new Set(sinDoc.map((n) => n.id)); out.push({ id: 'sin-documentar', label: 'Proyectos sin documentar', hint: 'Proyectos sin README ni documentación escrita.', test: (n) => ids.has(n.id), count: ids.size }); }
  const disc = g.nodes.filter((n) => n.type === 'proyecto' && n.docOnly && n.docOnly.length);
  if (disc.length) { const ids = new Set(disc.map((n) => n.id)); out.push({ id: 'discrepancias', label: 'Carpeta y código no coinciden', hint: 'Proyectos cuya carpeta declara una técnica que el código no confirma.', test: (n) => ids.has(n.id), count: ids.size }); }
  const sinClase = g.nodes.filter((n) => n.type === 'proyecto' && !n.family);
  if (sinClase.length) { const ids = new Set(sinClase.map((n) => n.id)); out.push({ id: 'sin-clasificar', label: 'Proyectos sin clasificar', hint: 'Proyectos sin ninguna técnica reconocida.', test: (n) => ids.has(n.id), count: ids.size }); }
  return out;
}

/** Ids visibles de una vista basada en un predicado: los elementos y su camino en la jerarquía (contexto). */
export function viewSet(g, tax, view) {
  const out = new Set();
  for (const n of g.nodes) {
    if (!view.test(n)) continue;
    out.add(n.id);
    for (const a of tax.pathOf(n.id)) out.add(a.id);
  }
  return out;
}

/** Resumen de cobertura por área y distribución por etapas. Son métricas de cobertura y aplicación; nunca de dominio. */
export function summary(g, tax) {
  const withKids = tax.roots.filter((x) => (tax.kids.get(x.id) || []).length);
  const single = tax.roots.filter((x) => !(tax.kids.get(x.id) || []).length);
  const areas = withKids.map((r) => {
    const ids = new Set([r.id, ...tax.descendants(r.id)]);
    const leaves = [...ids].map((id) => tax.byId.get(id)).filter((n) => tax.isLeaf(n));
    const aplicado = leaves.filter((n) => ['aplicado', 'reforzado', 'evaluado', 'dominio'].includes(n.stage)).length;
    const documentado = leaves.filter((n) => ['identificado', 'estudiado'].includes(n.stage)).length;
    return { node: r, leaves: leaves.length, aplicado, documentado, sinEvidencia: leaves.length - aplicado - documentado, projects: tax.projectsOf(r.id, true).length };
  });
  const done = ['aplicado', 'reforzado', 'evaluado', 'dominio'];
  const others = { nodes: single.length, aplicado: single.filter((n) => done.includes(n.stage)).length, documentado: single.filter((n) => ['identificado', 'estudiado'].includes(n.stage)).length };
  const stages = STAGES.map((s) => ({ ...s, count: tax.tree.filter((n) => n.stage === s.id && tax.isLeaf(n)).length }));
  const q = g.quality || {};
  return {
    areas, others, stages,
    quality: {
      projects: g.nodes.filter((n) => n.type === 'proyecto').length,
      noReadme: (q.noReadme || []).length, docOnly: q.docOnly || 0,
      merged: (q.merged || []).length, indexes: (q.indexes || []).length,
      unclassified: g.nodes.filter((n) => n.type === 'proyecto' && !n.family).length,
    },
  };
}

/* ═══════════ Exploración progresiva ═══════════
   El mapa arranca como orientación (núcleo + áreas) y cada elemento se despliega al explorarlo.
   Todo es visibilidad: las posiciones no cambian, así que expandir nunca reorganiza el mapa y contraer no borra nada. */
const OBJ_TYPES = new Set(['objetivo', 'recomendacion']);

export function buildExplore(g, tax) {
  const byId = tax.byId;
  const core = g.nodes.find((n) => n.type === 'nucleo') || null;
  const areas = g.nodes.filter((n) => n.type === 'area');
  const areaOf = (n) => areas.find((a) => a.id === 'a:' + n.area) || null;
  // «agrupa» desde un área: sus conocimientos de primer nivel y sus competencias
  const groupTargets = new Map();
  for (const e of g.edges) if (e.type === 'agrupa' && e.source.startsWith('a:')) { if (!groupTargets.has(e.source)) groupTargets.set(e.source, []); groupTargets.get(e.source).push(e.target); }
  const projByLead = new Map();
  for (const n of g.nodes) if (n.type === 'proyecto' && n.parent) { if (!projByLead.has(n.parent)) projByLead.set(n.parent, []); projByLead.get(n.parent).push(n.id); }
  // proyectos sin técnica principal ni relación «demuestra»: cuelgan de su área
  const demonstrating = new Set(g.edges.filter((e) => e.type === 'demuestra').map((e) => e.source));
  const loose = new Map();
  for (const n of g.nodes) if (n.type === 'proyecto' && !n.parent && !demonstrating.has(n.id)) { const k = 'a:' + n.area; if (!loose.has(k)) loose.set(k, []); loose.get(k).push(n.id); }
  const cmp = (a, b) => a.label.localeCompare(b.label, 'es');

  /** Elementos que se muestran al expandir `id` (sin duplicados). */
  const memo = new Map();
  function childrenOf(id) {
    if (memo.has(id)) return memo.get(id);
    const n = byId.get(id);
    let ids = [];
    if (!n) ids = [];
    else if (n.type === 'nucleo') ids = areas.map((a) => a.id);
    else if (n.type === 'area') ids = [...(groupTargets.get(id) || []), ...(loose.get(id) || [])].filter((x) => byId.has(x));
    else if (n.stage !== undefined && n.type !== 'proyecto') {
      const kids = (tax.kids.get(id) || []).map((k) => k.id);
      const mine = projByLead.get(id) || [];
      // una hoja muestra los proyectos que la aplican; una rama, sus hijos y los proyectos que cuelgan de ella
      const apply = kids.length ? [] : [...(tax.appliers.get(id) || [])];
      ids = [...kids, ...mine, ...apply];
    }
    const out = [...new Set(ids)].filter((x) => x !== id).map((x) => byId.get(x)).filter(Boolean).sort(cmp).map((x) => x.id);
    memo.set(id, out);
    return out;
  }
  const isExpandable = (id) => childrenOf(id).length > 0 && id !== (core && core.id);

  const allMemo = new Map();
  /** Todo lo que cuelga de `id`, a cualquier profundidad. */
  function descendantsAll(id, seen = new Set()) {
    if (allMemo.has(id)) return allMemo.get(id);
    const out = new Set();
    for (const c of childrenOf(id)) { if (seen.has(c)) continue; out.add(c); for (const d of descendantsAll(c, new Set([...seen, id]))) out.add(d); }
    allMemo.set(id, out);
    return out;
  }

  /**
   * Conjunto visible con los ids expandidos. Siempre: el núcleo y las áreas. Objetivos y recomendaciones aparecen
   * cuando lo hace su competencia (o el elemento al que apuntan).
   */
  function visibleSet(expanded) {
    const vis = new Set();
    if (core) vis.add(core.id);
    for (const a of areas) vis.add(a.id);
    const queue = [...vis];
    const done = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (done.has(id)) continue;
      done.add(id);
      if (id !== (core && core.id) && !expanded.has(id)) continue;
      for (const c of childrenOf(id)) { if (!vis.has(c)) vis.add(c); queue.push(c); }
    }
    for (const e of g.edges) {
      if (e.type === 'necesita' && vis.has(e.target) && byId.get(e.source) && byId.get(e.source).type === 'objetivo') vis.add(e.source);
      if (e.type === 'recomienda' && vis.has(e.target)) vis.add(e.source);
    }
    // si ya no se ve ninguna competencia, tampoco sus objetivos
    for (const n of g.nodes) if (n.type === 'objetivo' && !g.edges.some((e) => e.type === 'necesita' && e.source === n.id && vis.has(e.target))) vis.delete(n.id);
    return vis;
  }

  /** Ids que hay que expandir para que `id` sea visible (en orden: del área hacia abajo). */
  function expandPathFor(id, depth = 0) {
    const n = byId.get(id);
    if (!n || n.type === 'nucleo' || n.type === 'area') return [];
    if (OBJ_TYPES.has(n.type)) {
      if (depth > 1) return [];
      const e = g.edges.find((x) => (x.source === id && (x.type === 'recomienda' || x.type === 'necesita')));
      return e ? [...expandPathFor(e.target, depth + 1), e.target].filter((x) => { const m = byId.get(x); return m && m.type !== 'nucleo'; }) : [];
    }
    const chain = tax.pathOf(id).filter((x) => x.id !== id).map((x) => x.id);
    // el área es la de la raíz de su cadena (un concepto puede colgar de una raíz de otra área)
    const rootNode = chain.length ? byId.get(chain[0]) : n;
    const a = areaOf(rootNode || n);
    if (n.type === 'proyecto' && !n.parent) {
      // sin técnica principal: cuelga de alguna técnica que lo aplica
      const via = g.edges.find((e) => e.type === 'demuestra' && e.source === id);
      return via ? [...expandPathFor(via.target, depth + 1), via.target] : (a ? [a.id] : []);
    }
    return [...(a ? [a.id] : []), ...chain];
  }

  return { core, areas, childrenOf, isExpandable, descendantsAll, visibleSet, expandPathFor };
}
