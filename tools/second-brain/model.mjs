/* ═══════════════════════════════════════════════
   tools/second-brain/model.mjs: del resultado del escaneo al snapshot
   ─────────────────────────────────────────────────
   Aquí viven las reglas de negocio de Second Brain. Están escritas para poder
   explicarse en una frase cada una (ver tools/second-brain/README.md):

   · Evidencia = archivos DISTINTOS, nunca líneas ni menciones repetidas.
   · «respaldado»  → hay práctica detectable (código o artefactos) o, en conceptos
                     explicativos, al menos dos documentos propios.
   · «mencionado»  → solo aparece en prosa o en listas declarativas.
   · «brecha_probable» → relevante para el objetivo, sin evidencia, y las fuentes
                     que habría que mirar SÍ se han analizado. Siempre con motivo.
   · «pendiente»   → sin evidencia, pero no se han analizado las fuentes donde estaría.
   · «brecha_confirmada» → SOLO si el usuario la declara en `assessments`. Nunca se infiere.
   ═══════════════════════════════════════════════ */
import { slug, hash32 } from './text.mjs';
// identificador estable y único para rutas largas: prefijo legible + hash de la ruta completa
const keyId = (k) => slug(k).slice(0, 50) + '-' + hash32(k).toString(36);
import { layout } from './layout.mjs';
import { SCHEMA_VERSION } from '../../second-brain/contract.js';

export const ENGINE_VERSION = '1.4.0';

const TYPE_MAP = { tecnologia: 'tecnologia', concepto: 'concepto', tecnica: 'tecnica', 'competencia-blanda': 'concepto' };
const CLS_LABEL = { practica: 'práctica', explicativa: 'documentación', declarativa: 'declarada' };
const PBIX_AFFECTED = new Set(['dax', 'dax-contexto', 'time-intelligence', 'power-query', 'modelo-estrella']);

/* Distancia al objetivo según el estado de la competencia (0 = nada que hacer, 1 = máxima).
   Son los pesos de la metodología documentada en README; no son una medición. */
const DISTANCE = { respaldado: 0.1, ampliable: 0.25, parcial: 0.4, documentado: 0.6, declarado: 0.7, pendiente: 0.5, brecha_probable: 0.9, brecha_confirmada: 1.0 };
const CONF_WEIGHT = { alta: 1, media: 0.8, baja: 0.6 };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const round2 = (n) => Math.round(n * 100) / 100;

function aggregate(files) {
  const ev = new Map();
  const get = (id) => {
    if (!ev.has(id)) ev.set(id, { practica: new Map(), explicativa: new Map(), declarativa: new Map() });
    return ev.get(id);
  };
  for (const f of files) {
    for (const [id, h] of Object.entries(f.hits)) {
      const e = get(id);
      for (const cls of ['practica', 'explicativa', 'declarativa']) {
        if (!h[cls]) continue;
        const key = `${f.source}::${f.rel}`;
        e[cls].set(key, { project: f.project, rel: f.rel, source: f.source, kind: f.kind, ext: f.ext });
      }
    }
  }
  return ev;
}

const projectsOf = (m) => new Set([...m.values()].map((v) => v.project));

function conceptEvidence(c, e) {
  const p = e ? e.practica.size : 0, x = e ? e.explicativa.size : 0, d = e ? e.declarativa.size : 0;
  const prj = e ? projectsOf(c.naturaleza === 'practica' ? e.practica : new Map([...e.practica, ...e.explicativa])) : new Set();
  // documentación dentro de proyectos vs. apuntes de estudio (fuentes «manual»): estos últimos
  // muestran que se ha estudiado el tema, no que se haya aplicado
  const xProj = e ? [...e.explicativa.values()].filter((v) => v.kind === 'proyectos').length : 0;
  let state = null, why = null;
  const docWhy = x > 0 && xProj === 0 && p === 0 ? 'estudio' : 'documentado';
  if (c.naturaleza === 'practica') {
    if (p >= 1) state = 'respaldado';
    else if (x >= 1) { state = 'mencionado'; why = docWhy; }
    else if (d >= 1) { state = 'mencionado'; why = 'declarado'; }
  } else {
    if (p + xProj >= 2) state = 'respaldado';
    else if (p + x >= 1) { state = 'mencionado'; why = docWhy; }
    else if (d >= 1) { state = 'mencionado'; why = 'declarado'; }
  }
  return { state, why, p, x, d, projects: prj.size };
}

/**
 * @param {object} a
 * @param {object} a.framework   framework.json
 * @param {object} a.scan        resultado de scanSources
 * @param {object} a.config      configuración (targetLevel, assessments, sources)
 * @param {Date}   a.now
 * @param {'real'|'demo'} a.mode
 */
export function buildSnapshot({ framework, scan, config, now = new Date(), mode = 'real' }) {
  const level = framework.niveles.find((n) => n.id === (config.targetLevel || 'consolidado')) || framework.niveles[1];
  const conceptById = new Map(framework.conceptos.map((c) => [c.id, c]));
  const ev = aggregate(scan.files);
  const assessments = Array.isArray(config.assessments) ? config.assessments : [];
  const assessOf = (kind, id) => assessments.find((a) => a.tipo === kind && a.id === id && a.estado === 'brecha_confirmada' && a.motivo && a.origen);
  // etapas por encima de «aplicado»: solo existen si las registras tú con motivo y origen (nunca se deducen)
  const stageAssessOf = (kind, id) => assessments.find((a) => a.tipo === kind && a.id === id && ['evaluado', 'dominio'].includes(a.estado) && a.motivo && a.origen);

  /* ── Jerarquía del marco: cada concepto puede tener un «padre». La evidencia de las ramas sube a sus ancestros
     (un área o una disciplina está respaldada si lo está alguna de sus técnicas), y la cobertura de cada rama se
     cuenta aparte para no confundir «tiene una técnica trabajada» con «la domina entera». ── */
  const padreOf = new Map(framework.conceptos.filter((c) => c.padre).map((c) => [c.id, c.padre]));
  const kidsOf = new Map();
  for (const [id, p] of padreOf) { if (!kidsOf.has(p)) kidsOf.set(p, []); kidsOf.get(p).push(id); }
  const ancestorsOf = (id) => { const out = []; let p = padreOf.get(id); while (p) { out.push(p); p = padreOf.get(p); } return out; };
  const depthOf = (id) => ancestorsOf(id).length;
  const leavesOf = (id) => { const k = kidsOf.get(id); return k ? k.flatMap(leavesOf) : [id]; };
  for (const [id, e] of [...ev]) {
    for (const a of ancestorsOf(id)) {
      if (!ev.has(a)) ev.set(a, { practica: new Map(), explicativa: new Map(), declarativa: new Map() });
      const t = ev.get(a);
      for (const cls of ['practica', 'explicativa', 'declarativa']) for (const [k, v] of e[cls]) t[cls].set(k, v);
    }
  }
  const EXT_KIND = { ipynb: 'notebook', py: 'script', sql: 'sql', dax: 'modelo', tmdl: 'modelo', pq: 'modelo', m: 'modelo', pbix: 'informe', pbip: 'informe', md: 'documento', docx: 'documento', txt: 'documento', html: 'documento', catalogo: 'publicado' };
  const kindsOf = (e) => {
    const seen = new Map();
    if (e) for (const cls of ['practica', 'explicativa']) for (const [k, v] of e[cls]) seen.set(k, EXT_KIND[v.ext] || 'otro');
    const out = {};
    for (const k of seen.values()) out[k] = (out[k] || 0) + 1;
    return out;
  };

  /* ── Cobertura: qué clases de evidencia se han podido mirar ── */
  const kinds = { practica: false, explicativa: false, declarativa: false };
  for (const s of scan.coverage.sources) {
    if (!s.supported) continue;
    if (s.kind === 'proyectos') { kinds.practica = true; kinds.explicativa = true; }
    else if (s.kind === 'manual') kinds.explicativa = true;
    else if (s.kind === 'declarativo') kinds.declarativa = true;
  }
  let practicalFiles = 0;
  for (const f of scan.files) if (Object.values(f.hits).some((h) => h.practica)) practicalFiles++;
  const MIN_SCAN = 5;   // con menos archivos con práctica, la ausencia no es representativa
  const coverageOk = (search) => search.every((k) => kinds[k]) && practicalFiles >= MIN_SCAN;
  const missingKinds = (search) => search.filter((k) => !kinds[k]).map((k) => ({ practica: 'código o artefactos de proyectos', explicativa: 'documentación propia', declarativa: 'CV o lista de habilidades' }[k]));

  /* ── Ámbito: conceptos con evidencia + conceptos de competencias relevantes para el objetivo ── */
  const inScope = new Map();   // conceptId → { maxRel, core, search[] }
  for (const k of framework.competencias) {
    const rel = k.niveles[level.id] || 0;
    if (rel < 2) continue;
    for (const [list, core] of [[k.nucleo, true], [k.opcionales, false]]) {
      for (const id of list) {
        const cur = inScope.get(id) || { maxRel: 0, core: false, search: new Set() };
        cur.maxRel = Math.max(cur.maxRel, rel); cur.core ||= core; k.buscarEn.forEach((s) => cur.search.add(s));
        inScope.set(id, cur);
      }
    }
  }

  const nodes = [];
  const nodeIdx = new Map();
  const trace = {};
  const addNode = (n) => { nodeIdx.set(n.id, n); nodes.push(n); return n; };
  const refsOf = (id, order) => {
    const e = ev.get(id);
    if (!e) return [];
    const out = [];
    for (const cls of order) for (const v of e[cls].values()) { if (out.length < 10) out.push({ p: v.project, f: v.rel, c: cls }); }
    return out;
  };
  const pbixNote = (scan.coverage.byExt.pbix || 0) > 0
    ? 'El modelo de los .pbix no es legible (compresión de Microsoft): solo se ven las páginas y las referencias a medidas, no el código DAX.'
    : null;

  /* ── Nodos de concepto ── */
  const cstate = new Map();   // conceptId → { state, ... }
  for (const c of framework.conceptos) {
    const info = conceptEvidence(c, ev.get(c.id));
    const scope = inScope.get(c.id);
    const assessed = assessOf('concepto', c.id);
    if (!info.state && !scope && !assessed) continue;
    let state = info.state, unc = [], motivo = null;
    if (assessed) { state = 'brecha_confirmada'; }
    else if (!state) {
      const search = scope ? [...scope.search] : ['practica'];
      if (coverageOk(search) && scope && scope.core) {
        state = 'brecha_probable';
        motivo = `Es parte del núcleo de una competencia con relevancia ${scope.maxRel}/3 para «${level.label}» y no aparece en ${plural(practicalFiles, 'archivo con práctica', 'archivos con práctica')} de las fuentes analizadas.`;
        unc.push(motivo, 'Puede existir en proyectos o entornos que no están entre las fuentes configuradas.');
      } else {
        state = 'pendiente';
        const miss = missingKinds(search);
        unc.push(miss.length ? `No se ha podido comprobar: no hay fuentes de tipo ${miss.join(' ni ')}.` : 'Sin evidencia en las fuentes analizadas; no se interpreta como carencia.');
      }
    }
    if (state === 'respaldado') unc.push('Indica que se ha trabajado con ello; no mide el nivel de dominio.');
    if (state === 'mencionado') unc.push(info.why === 'declarado' ? 'Solo aparece en una fuente declarativa (lo que se afirma, no lo que se demuestra).'
      : info.why === 'estudio' ? 'Aparece en material de estudio (manuales), pero no se detecta aplicado en ningún proyecto analizado.'
      : 'Aparece en documentación, pero no hay práctica detectable en el código o los artefactos analizados.');
    if (pbixNote && PBIX_AFFECTED.has(c.id)) unc.push(pbixNote);
    const bits = [];
    if (info.p) bits.push(`práctica en ${plural(info.p, 'archivo', 'archivos')}`);
    if (info.x) bits.push(`documentación en ${plural(info.x, 'archivo', 'archivos')}`);
    if (info.d) bits.push(`declarado en ${plural(info.d, 'fuente', 'fuentes')}`);
    const evidenceLine = bits.length ? `Evidencia: ${bits.join('; ')}${info.projects ? `, en ${plural(info.projects, 'proyecto', 'proyectos')}` : ''}.` : 'Sin evidencia detectada en las fuentes analizadas.';
    const node = addNode({
      id: `c:${c.id}`, label: c.label, type: TYPE_MAP[c.tipo] || 'concepto', region: c.region, area: c.region, family: c.familia || null, icon: c.icono || 'dot', state,
      summary: `${c.resumen} ${evidenceLine}`.slice(0, 600),
      size: round2(Math.min(1, 0.3 + 0.1 * (scope ? scope.maxRel : 1) + Math.min(0.2, info.projects * 0.04))),
      evidence: { practica: info.p, explicativa: info.x, declarativa: info.d, projects: info.projects, breadth: info.projects >= 3 ? 'amplia' : info.projects >= 1 ? 'puntual' : 'ninguna' },
      uncertainty: unc, pos: [0, 0, 0],
    });
    if (assessed) node.assessment = { reason: assessed.motivo, source: assessed.origen, date: assessed.fecha || null };
    // etapa de conocimiento: qué clase de evidencia hay, sin convertirla en una nota de dominio
    const sa = stageAssessOf('concepto', c.id);
    node.stage = sa ? sa.estado
      : info.p >= 1 && info.projects >= 2 ? 'reforzado'
      : info.p >= 1 ? 'aplicado'
      : info.x >= 1 ? 'estudiado'
      : info.d >= 1 ? 'identificado' : 'sin_evidencia';
    if (sa) node.stageNote = { reason: sa.motivo, source: sa.origen, date: sa.fecha || null };
    node.depth = depthOf(c.id);
    node.evidence.kinds = kindsOf(ev.get(c.id));
    cstate.set(c.id, { state, node });
    trace[node.id] = refsOf(c.id, ['practica', 'explicativa', 'declarativa']);
  }
  // jerarquía: padre dentro del grafo y cobertura de cada rama (hojas con práctica / solo documentadas / sin evidencia)
  for (const c of framework.conceptos) {
    const st = cstate.get(c.id);
    if (!st) continue;
    if (c.padre && cstate.has(c.padre)) st.node.parent = `c:${c.padre}`;
    if (kidsOf.has(c.id)) {
      const leaves = leavesOf(c.id);
      let aplicado = 0, documentado = 0;
      for (const l of leaves) { const s = cstate.get(l); if (!s) continue; if (s.state === 'respaldado') aplicado++; else if (s.state === 'mencionado') documentado++; }
      st.node.branch = { children: kidsOf.get(c.id).length, leaves: leaves.length, aplicado, documentado, sinEvidencia: leaves.length - aplicado - documentado };
    }
  }

  /* ── Competencias, prioridad y recomendaciones ── */
  const competencies = [];
  const scored = [];
  for (const k of framework.competencias) {
    const rel = k.niveles[level.id] || 0;
    const coreStates = k.nucleo.map((id) => (cstate.get(id) ? cstate.get(id).state : 'ausente'));
    const members = [...k.nucleo, ...k.opcionales];
    const assessed = assessOf('competencia', k.id);
    const okCount = coreStates.filter((s) => s === 'respaldado').length;
    const partial = okCount > 0 && okCount < coreStates.length;
    // núcleo completo, pero con facetas opcionales que solo están mencionadas o sin evidencia: hay recorrido
    const optionalGaps = k.opcionales.filter((id) => { const st = cstate.get(id); return st && st.state !== 'respaldado'; });
    const extendable = okCount === coreStates.length && okCount > 0 && optionalGaps.length > 0;
    const search = k.buscarEn;
    let state, dist, conf, doc = 0;
    // 'ausente' = concepto del núcleo que no entró en el grafo (competencia poco relevante para el objetivo)
    if (assessed) { state = 'brecha_confirmada'; dist = DISTANCE.brecha_confirmada; conf = 'alta'; }
    else if (okCount > 0) { state = 'respaldado'; dist = partial ? DISTANCE.parcial : extendable ? DISTANCE.ampliable : DISTANCE.respaldado; conf = partial ? 'media' : 'alta'; }
    else if (coreStates.includes('mencionado')) {
      state = 'mencionado';
      const docOnly = k.nucleo.some((id) => { const e = ev.get(id); return e && e.explicativa.size > 0; });
      doc = docOnly ? 1 : 0;
      dist = docOnly ? DISTANCE.documentado : DISTANCE.declarado; conf = 'media';
    } else if (rel >= 2 && coverageOk(search)) { state = 'brecha_probable'; dist = DISTANCE.brecha_probable; conf = practicalFiles >= 20 ? 'media' : 'baja'; }
    else { state = 'pendiente'; dist = DISTANCE.pendiente; conf = 'baja'; }

    const unverified = [];
    for (const id of members) {
      const c = conceptById.get(id);
      const st = cstate.get(id) ? cstate.get(id).state : (ev.get(id) ? 'mencionado' : 'sin_evidencia');
      if (st !== 'respaldado') unverified.push(`${c.label}: ${st === 'sin_evidencia' ? 'sin evidencia en las fuentes analizadas' : st === 'mencionado' ? 'solo mencionado' : st.replace('_', ' ')}`);
    }
    const miss = missingKinds(search);
    if (miss.length) unverified.push(`No analizado: ${miss.join(' ni ')}.`);
    if (practicalFiles < MIN_SCAN) unverified.push('Muy pocas fuentes con práctica: la ausencia de evidencia no es representativa.');
    if (pbixNote && k.id === 'powerbi-dax') unverified.push(pbixNote);

    const priority = round2(rel * dist);
    const rank = priority * CONF_WEIGHT[conf];
    const compNode = addNode({
      id: `k:${k.id}`, label: k.label, type: 'competencia', region: k.region, area: k.region, family: k.familia || null, icon: k.icono || 'hexagon', state,
      summary: `Competencia del marco general. Relevancia para «${level.label}»: ${rel}/3. ${okCount ? `Núcleo respaldado: ${okCount} de ${coreStates.length}.` : 'Ningún concepto del núcleo está respaldado por evidencia.'}`.slice(0, 600),
      size: 0.85, evidence: { practica: 0, explicativa: 0, declarativa: 0, projects: 0, breadth: 'ninguna' },
      uncertainty: state === 'respaldado' ? ['Indica evidencia de trabajo; no equivale a una evaluación de nivel.'] : state === 'brecha_probable' ? [`Motivo: relevancia ${rel}/3 y sin evidencia en fuentes que sí se han analizado.`, 'Puede existir fuera de las fuentes configuradas.'] : state === 'pendiente' ? ['No se ha podido comprobar con las fuentes disponibles.'] : state === 'mencionado' ? ['Hay menciones, pero no práctica detectable.'] : [],
      pos: [0, 0, 0],
    });
    if (assessed) compNode.assessment = { reason: assessed.motivo, source: assessed.origen, date: assessed.fecha || null };
    competencies.push({
      nodeId: compNode.id, id: k.id, state, partial, extendable, confidence: conf,
      levels: { ...k.niveles }, relevance: rel, priority: { score: priority, rank: round2(rank) },
      effort: k.esfuerzo, unverified, members: members.map((id) => `c:${id}`).filter((id) => nodeIdx.has(id)),
    });
    scored.push({ k, rel, state, partial, extendable, optionalGaps, conf, priority, rank, dist, doc, compNode, coreStates, search });
    trace[compNode.id] = k.nucleo.flatMap((id) => (trace[`c:${id}`] || []).slice(0, 3)).slice(0, 10);
  }

  // buckets: «ahora» = hasta 3 con prioridad ≥ 1.0 (ordenadas por prioridad × confianza)
  const ordered = [...scored].sort((a, b) => b.rank - a.rank || a.k.label.localeCompare(b.k.label, 'es'));
  let nowCount = 0;
  const bucketOf = new Map();
  for (const s of ordered) {
    let b = 'todavia_no';
    if (s.rel >= 2 && s.priority >= 1.0 && nowCount < 3) { b = 'ahora'; nowCount++; }
    else if (s.rel >= 2 && s.priority >= 0.5) b = 'despues';
    else if (s.rel >= 2 && s.extendable) b = 'despues';          // núcleo demostrado: ampliar, sin urgencia
    bucketOf.set(s.k.id, b);
  }

  const recommendations = [];
  const deferred = [];
  for (const s of ordered) {
    const bucket = bucketOf.get(s.k.id);
    if (bucket === 'todavia_no') {
      deferred.push({ id: s.k.id, label: s.k.label, reason: s.rel < 2 ? `Relevancia ${s.rel}/3 para «${level.label}»: puede esperar.` : s.state === 'respaldado' ? 'Ya hay evidencia suficiente; no es prioridad ahora.' : 'Prioridad baja con la información disponible.' });
      continue;
    }
    const gaps = s.k.nucleo.filter((id) => { const st = cstate.get(id); return !st || st.state !== 'respaldado'; }).map((id) => conceptById.get(id).label);
    const verb = { respaldado: 'Completar', mencionado: 'Demostrar', brecha_probable: 'Demostrar', pendiente: 'Validar', brecha_confirmada: 'Cerrar la brecha de' }[s.state];
    const why = s.state === 'brecha_probable'
      ? `Es relevante para «${level.label}» (${s.rel}/3) y no hay práctica de ${gaps.join(', ')} en las fuentes analizadas.`
      : s.state === 'mencionado' ? `Aparece mencionado (${gaps.join(', ')}), pero no hay práctica detectable que lo demuestre.`
      : s.state === 'pendiente' ? `Es relevante para «${level.label}» (${s.rel}/3) y no se ha podido comprobar con las fuentes disponibles.`
      : s.state === 'brecha_confirmada' ? 'Tú mismo/a has registrado esta brecha en la evaluación.'
      : s.extendable && !gaps.length ? `El núcleo está respaldado; faltan por demostrar ${s.optionalGaps.map((id) => conceptById.get(id).label).join(', ')}.`
      : `Hay evidencia parcial; falta cubrir ${gaps.join(', ')}.`;
    const evidence = s.state === 'brecha_probable' ? `Sin evidencia en ${plural(practicalFiles, 'archivo con práctica', 'archivos con práctica')} analizados. Podría existir fuera de las fuentes configuradas.`
      : s.state === 'pendiente' ? `No analizado: ${missingKinds(s.search).join(' ni ') || 'sin fuentes suficientes'}.`
      : s.state === 'mencionado' ? 'Solo menciones en documentación o listas declarativas.'
      : s.state === 'brecha_confirmada' ? 'Evaluación explícita registrada en la configuración.'
      : s.extendable && !gaps.length ? `Núcleo completo; ${plural(s.optionalGaps.length, 'faceta opcional solo mencionada', 'facetas opcionales solo mencionadas')} o sin práctica detectable.`
      : `Evidencia en ${s.k.nucleo.length - gaps.length} de ${s.k.nucleo.length} conceptos del núcleo.`;
    const recId = `rec-${s.k.id}`;
    const recNode = addNode({
      id: `r:${s.k.id}`, label: `${verb}: ${s.k.label}`.slice(0, 118), type: 'recomendacion', region: 'objetivos', area: s.k.region, family: s.k.familia || null, icon: 'bulb', state: 'oportunidad',
      summary: `${why} ${s.k.resultado}`.slice(0, 600), size: round2(0.5 + 0.12 * s.priority),
      evidence: { practica: 0, explicativa: 0, declarativa: 0, projects: 0, breadth: 'ninguna' }, uncertainty: [`Confianza ${s.conf}. El esfuerzo es una estimación genérica del marco, no una medida.`], pos: [0, 0, 0],
    });
    recNode.recommendationId = recId;
    s.compNode.recommendationId = recId;
    recommendations.push({
      id: recId, nodeId: recNode.id, targetId: s.compNode.id,
      what: `${verb}: ${s.k.label}`, why, evidence, result: s.k.resultado, action: s.k.siguiente,
      objective: `Avanzar hacia «${level.label}»`, confidence: s.conf, effort: `${s.k.esfuerzo} (estimación genérica del marco)`,
      priority: { score: s.priority, bucket },
    });
  }

  /* ── Proyectos ── */
  const projFiles = new Map();
  for (const f of scan.files) {
    const o = projFiles.get(f.project) || { practical: 0, docs: 0, concepts: new Map(), documented: new Set(), routes: new Set(), kinds: {} };
    if (['md', 'txt', 'docx', 'html'].includes(f.ext)) o.docs++;
    const kind = EXT_KIND[f.ext];
    if (kind && kind !== 'documento' && Object.values(f.hits).some((h) => h.practica)) o.kinds[kind] = (o.kinds[kind] || 0) + 1;
    for (const [id, h] of Object.entries(f.hits)) {
      if (h.practica) o.concepts.set(id, (o.concepts.get(id) || 0) + 1);
      if (h.ruta) o.routes.add(id);                       // el nombre de la carpeta declara este tema
      if (h.ruta && !h.practica) o.documented.add(id);   // lo dice la carpeta; el código de este archivo no lo confirma
    }
    if (Object.values(f.hits).some((h) => h.practica)) o.practical++;
    projFiles.set(f.project, o);
  }
  const sourceKind = new Map(scan.coverage.sources.map((s) => [s.id, s.kind]));
  const projectNodes = [];
  // se limita el número de proyectos dibujados (los de más práctica) para que el grafo siga siendo legible
  const maxProjects = config.maxProjects || 160;
  const candidates = [...scan.projects.entries()]
    .map(([key, pj]) => ({ key, pj, pf: projFiles.get(key) }))
    .filter(({ pj, pf }) => ['proyectos', 'catalogo'].includes(sourceKind.get(pj.source)) && pf && pf.practical > 0 && !pj.container && !(pj.root && pf.practical < 3))
    .sort((a, b) => b.pf.practical - a.pf.practical || a.key.localeCompare(b.key))
    .slice(0, maxProjects);
  const GENERIC = new Set(['python', 'pandas', 'jupyter', 'git', 'documentacion', 'data-quality', 'numpy-scipy', 'visualizacion-datos', 'eda']);
  // glifo del proyecto según su naturaleza: informe de BI, notebook, app, SQL, manual, web o visualización
  const projectIcon = (pj, pf) => {
    const has = (id) => pf.concepts.has(id);
    if (pj.group === 'Manual' || /manual|gu[ií]a/i.test(pj.label)) return 'notebook-book';
    if (pj.group === 'Visualización') return 'chart';
    if (pj.artifacts.has('pbix') || has('powerbi')) return 'dashboard';
    if (has('streamlit')) return 'app';
    if (has('sql') && !has('python')) return 'database';
    if (has('jupyter') || has('python')) return 'notebook';
    if (has('desarrollo-web')) return 'code';
    return 'folder';
  };
  const regionOfConcept = new Map(framework.conceptos.map((c) => [c.id, c.region]));
  const familyOfConcept = new Map(framework.conceptos.map((c) => [c.id, c.familia]));
  for (const { key, pj, pf } of candidates) {
    // área principal: la región que más conceptos con práctica acumula en el proyecto
    const votes = {};
    for (const [id, nf] of pf.concepts) { const r = regionOfConcept.get(id); if (r) votes[r] = (votes[r] || 0) + nf * (GENERIC.has(id) ? 0.15 : 1); }
    const area = Object.entries(votes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    // familia principal (color) y secundarias (chips): mismo voto, sin duplicar el proyecto
    const fv = {};
    for (const [id, nf] of pf.concepts) { const f = familyOfConcept.get(id); if (f) fv[f] = (fv[f] || 0) + nf * (GENERIC.has(id) ? 0.15 : 1); }
    const famRank = Object.entries(fv).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((x) => x[0]);
    // técnicas demostradas: las más específicas (hojas de la jerarquía) primero y lo genérico al final
    const ranked = [...pf.concepts.entries()].filter(([id]) => cstate.get(id) && cstate.get(id).state === 'respaldado')
      .sort((x, y) => (GENERIC.has(x[0]) ? 1 : 0) - (GENERIC.has(y[0]) ? 1 : 0) || depthOf(y[0]) - depthOf(x[0]) || y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, 10);
    // posición en el árbol: el tema más específico que la carpeta declara Y el código confirma; si no, la técnica más específica con práctica
    const byRoute = ranked.filter(([id]) => pf.routes.has(id)).sort((x, y) => depthOf(y[0]) - depthOf(x[0]) || y[1] - x[1] || x[0].localeCompare(y[0]))[0];
    const lead = byRoute || ranked.find(([id]) => !GENERIC.has(id) && depthOf(id) >= 1) || ranked.find(([id]) => !GENERIC.has(id)) || ranked[0];
    // técnicas que la carpeta o la documentación declaran, pero que el código del proyecto no confirma
    const isManual = pj.group === 'Manual' || /manual|gu[ií]a/i.test(pj.label);
    const docOnly = isManual ? [] : [...pf.documented].filter((id) => !pf.concepts.has(id) && !kidsOf.has(id) && cstate.has(id) && !GENERIC.has(id) && conceptById.get(id).naturaleza === 'practica')
      .map((id) => conceptById.get(id).label).sort((a, b) => a.localeCompare(b, 'es')).slice(0, 6);
    const title = pj.readme && pj.readme.title && pj.readme.title.length >= 4 ? pj.readme.title : pj.label;
    const desc = pj.readme && pj.readme.desc ? ` ${pj.readme.desc}` : '';
    const n = addNode({
      id: `p:${keyId(key)}`, label: title.slice(0, 118), type: 'proyecto', region: 'practica', area: area ? area[0] : 'practica', family: famRank[0] || null, families: famRank.slice(0, 4), icon: projectIcon(pj, pf), state: 'respaldado',
      summary: `${desc.trim() ? desc.trim().replace(/([^.!?])$/, '$1.') + ' ' : ''}Proyecto analizado: ${plural(pf.practical, 'archivo', 'archivos')} con evidencia práctica en ${plural(pf.concepts.size, 'concepto', 'conceptos')}.${pf.docs ? '' : ' No se ha encontrado documentación escrita en el proyecto.'}`.slice(0, 600),
      size: round2(Math.min(0.75, 0.35 + pf.practical * 0.01)), evidence: { practica: pf.practical, explicativa: pf.docs, declarativa: 0, projects: 1, breadth: 'puntual' },
      uncertainty: ['Un proyecto demuestra trabajo realizado; no mide su calidad ni el nivel de dominio.'], pos: [0, 0, 0],
    });
    if (pj.link && /^https:\/\//.test(pj.link)) n.link = pj.link;
    if (pj.group) n.group = pj.group;
    if (lead) n.parent = `c:${lead[0]}`;
    n.depth = lead ? depthOf(lead[0]) + 1 : 0;
    n.evidence.kinds = pf.kinds;
    if (pj.sources && pj.sources.length) n.sources = pj.sources.slice(0, 8);
    if (pj.noReadme || (pj.kind !== 'catalogo' && pf.docs === 0)) n.noReadme = true;
    if (pj.merged && pj.merged.length) n.merged = pj.merged.map((m) => m.label).slice(0, 6);
    if (docOnly.length) n.docOnly = docOnly;
    projectNodes.push({ node: n, key, pf, ranked });
  }
  // recomendación de documentación: proyectos con práctica y sin ningún documento
  const undocumented = projectNodes.filter((p) => p.pf.docs === 0 && p.pf.practical >= 3).sort((a, b) => b.pf.practical - a.pf.practical).slice(0, 3);
  for (const p of undocumented) {
    const id = `rec-doc-${keyId(p.key)}`;
    const recNode = addNode({
      id: `r:doc-${keyId(p.key)}`, label: `Documentar el proyecto ${p.node.label}`.slice(0, 118), type: 'recomendacion', region: 'objetivos', area: p.node.area, family: p.node.family || null, icon: 'doc', state: 'oportunidad',
      summary: 'El proyecto tiene código, pero ningún documento que explique sus decisiones.', size: 0.55,
      evidence: { practica: 0, explicativa: 0, declarativa: 0, projects: 0, breadth: 'ninguna' }, uncertainty: ['Puede haber documentación fuera de la carpeta analizada.'], pos: [0, 0, 0],
    });
    recNode.recommendationId = id;
    p.node.recommendationId = id;
    recommendations.push({
      id, nodeId: recNode.id, targetId: p.node.id,
      what: `Documentar el proyecto «${p.node.label}»`, why: 'Hay trabajo práctico, pero sin explicación escrita de las decisiones es difícil defenderlo en una entrevista.',
      evidence: `${plural(p.pf.practical, 'archivo con práctica', 'archivos con práctica')} y ningún documento (md, docx, txt, html) en el proyecto.`,
      result: 'Un proyecto que se entiende en cinco minutos.', action: 'Añade un README con problema, datos, método, decisiones, resultados y limitaciones.',
      objective: `Avanzar hacia «${level.label}»`, confidence: 'media', effort: 'bajo (estimación genérica del marco)', priority: { score: 0.7, bucket: 'despues' },
    });
  }

  /* ── Objetivos ── */
  for (const lv of framework.niveles) {
    const target = lv.id === level.id;
    addNode({
      id: `o:${lv.id}`, label: lv.label, type: 'objetivo', region: 'objetivos', area: 'objetivos', icon: 'flag', state: 'neutral',
      summary: `${lv.descripcion}${target ? ' Es el objetivo con el que se calcula la prioridad.' : ''} Son referencias orientativas: varían según empresa y sector.`.slice(0, 600),
      size: target ? 1 : 0.7, evidence: { practica: 0, explicativa: 0, declarativa: 0, projects: 0, breadth: 'ninguna' }, uncertainty: ['Marco general, no un estudio de mercado ni una evaluación oficial.'], pos: [0, 0, 0],
    });
  }

  /* ── Relaciones ── */
  const edges = [];
  const edgeKey = new Set();
  const addEdge = (source, target, type, confidence, rationale, extra = {}) => {
    const key = `${source}|${target}|${type}`;
    if (edgeKey.has(key) || !nodeIdx.has(source) || !nodeIdx.has(target) || source === target) return;
    edgeKey.add(key);
    edges.push({ source, target, type, confidence, rationale: rationale.slice(0, 600), updatedAt: now.toISOString(), ...extra });
  };
  // coocurrencia práctica: solo como dato de apoyo, jamás para crear una relación
  const coProjects = (a, b) => {
    const ea = ev.get(a), eb = ev.get(b);
    if (!ea || !eb) return 0;
    const pa = projectsOf(ea.practica), pb = projectsOf(eb.practica);
    let n = 0; for (const p of pa) if (pb.has(p)) n++;
    return n;
  };
  for (const [a, b, type, why] of framework.relaciones) {
    const na = cstate.get(a), nb = cstate.get(b);
    if (!na || !nb) continue;
    const both = na.state === 'respaldado' && nb.state === 'respaldado';
    const one = na.state === 'respaldado' || nb.state === 'respaldado';
    const co = coProjects(a, b);
    addEdge(`c:${a}`, `c:${b}`, type, both ? 'alta' : one ? 'media' : 'baja', `${why}${co ? ` Aparecen juntos en la práctica de ${plural(co, 'proyecto', 'proyectos')}.` : ''}`, { evidenceCount: co });
  }
  for (const c of framework.conceptos) {
    if (!c.padre) continue;
    const a = cstate.get(c.id), b = cstate.get(c.padre);
    if (!a || !b) continue;
    addEdge(`c:${c.id}`, `c:${c.padre}`, 'parte-de', a.state === 'respaldado' ? 'alta' : 'media', `En la jerarquía del marco, «${c.label}» es una rama de «${conceptById.get(c.padre).label}».`);
  }
  for (const p of projectNodes) {
    for (const [id, nFiles] of p.ranked) {
      addEdge(p.node.id, `c:${id}`, 'demuestra', nFiles >= 2 ? 'alta' : 'media', `${plural(nFiles, 'archivo', 'archivos')} del proyecto contienen código o artefactos de ${conceptById.get(id).label}.`, { evidenceCount: nFiles });
    }
  }
  for (const s of scored) {
    for (const id of [...s.k.nucleo, ...s.k.opcionales]) addEdge(s.compNode.id, `c:${id}`, 'agrupa', 'alta', `En el marco, ${conceptById.get(id).label} forma parte de «${s.k.label}».`);
    for (const lv of framework.niveles) {
      const r = s.k.niveles[lv.id] || 0;
      if (r >= 2) addEdge(`o:${lv.id}`, s.compNode.id, 'necesita', 'media', `Relevancia ${r}/3 para «${lv.label}» según el marco general.`);
    }
  }
  for (const r of recommendations) {
    addEdge(r.nodeId, r.targetId, 'recomienda', r.confidence, `${r.what}: ${r.why}`.slice(0, 600));
  }

  /* ── Regiones y distribución en el espacio ── */
  const families = framework.familias.map((f) => ({ id: f.id, label: f.label, color: f.color, ink: f.ink, icon: f.icono || null, count: 0 }));
  const regions = framework.regiones.map((r, i) => ({ id: r.id, label: r.label, order: i, center: [0, 0, 0], count: 0, color: r.color || null, icon: r.icono || null, family: r.familia || null }));
  layout(regions, nodes, edges);
  for (const r of regions) r.count = nodes.filter((n) => n.region === r.id).length;
  for (const f of families) f.count = nodes.filter((n) => n.family === f.id).length;

  const byState = {};
  for (const n of nodes) if (n.type !== 'proyecto' && n.type !== 'objetivo' && n.type !== 'recomendacion') byState[n.state] = (byState[n.state] || 0) + 1;

  return {
    schema: SCHEMA_VERSION, generatedAt: now.toISOString(), mode,
    engine: { version: ENGINE_VERSION, frameworkVersion: framework.version },
    meta: {
      targetLevel: level.id, targetLabel: level.label, demo: mode === 'demo',
      levels: framework.niveles.map((l) => ({ id: l.id, label: l.label, description: l.descripcion })),
      basis: 'Marco general de competencias de analista de datos. No es un estudio de mercado: no se han consultado ofertas de empleo y no hay porcentajes de demanda.',
      scoring: {
        formula: 'prioridad = relevancia (0-3 según el nivel objetivo) × distancia al objetivo (0-1). Se ordena por prioridad × peso de confianza (alta 1, media 0,8, baja 0,6).',
        distance: { 'respaldado completo': DISTANCE.respaldado, 'respaldado ampliable': DISTANCE.ampliable, 'respaldado parcial': DISTANCE.parcial, 'documentado sin práctica': DISTANCE.documentado, 'solo declarado': DISTANCE.declarado, 'pendiente de validar': DISTANCE.pendiente, 'brecha probable': DISTANCE.brecha_probable, 'brecha confirmada': DISTANCE.brecha_confirmada },
        buckets: 'ahora = hasta 3 con prioridad ≥ 1,0; después = prioridad ≥ 0,5 o núcleo respaldado con facetas opcionales sin práctica; todavía no = el resto o relevancia < 2.',
      },
      limitations: [
        'La evidencia indica que se ha trabajado con algo; no mide el nivel de dominio.',
        'La ausencia de evidencia no se interpreta como desconocimiento: solo se marca «brecha probable» cuando se han analizado las fuentes donde estaría, y «brecha confirmada» solo si se registra expresamente.',
        ...(pbixNote ? [pbixNote] : []),
        ...Object.entries(scan.coverage.unsupported).map(([e, n]) => `${n} archivo(s) .${e} no se han podido leer en esta versión.`),
      ],
      deferred,
    },
    coverage: {
      sources: scan.coverage.sources.map((s) => ({ id: s.id, label: s.label, kind: s.kind, files: s.files, supported: s.supported })),
      byExt: scan.coverage.byExt, kinds, practicalFiles,
      incremental: { reused: scan.coverage.reused, changed: scan.coverage.changed },
    },
    stats: {
      nodes: nodes.length, edges: edges.length, concepts: nodes.filter((n) => ['tecnologia', 'concepto', 'tecnica'].includes(n.type)).length,
      projects: projectNodes.length, recommendations: recommendations.length, byState,
      taxonomy: { roots: nodes.filter((n) => n.type !== 'proyecto' && n.depth === 0 && n.stage).length, maxDepth: nodes.reduce((m, n) => Math.max(m, n.depth || 0), 0), branches: nodes.filter((n) => n.branch).length },
      priorities: recommendations.filter((r) => r.priority.bucket === 'ahora').length,
    },
    quality: {
      noReadme: projectNodes.filter((p) => p.node.noReadme).map((p) => ({ id: p.node.id, label: p.node.label })).slice(0, 40),
      docOnly: projectNodes.filter((p) => p.node.docOnly).length,
      unclassified: projectNodes.filter((p) => !p.node.family).map((p) => ({ id: p.node.id, label: p.node.label })).slice(0, 40),
      merged: (scan.identity ? scan.identity.merges : []).map((m) => ({ title: String(m.title).slice(0, 110), from: m.from.map((x) => String(x.label).slice(0, 110)), why: m.reasons.slice(0, 2).map((x) => String(x).slice(0, 200)) })).slice(0, 40),
      notInspected: (Array.isArray(config.inaccesibles) ? config.inaccesibles : []).filter((x) => x && x.repo).map((x) => ({ label: String(x.repo).slice(0, 110), why: String(x.motivo || 'Sin clon local ni acceso desde el motor.').slice(0, 300) })).slice(0, 20),
      candidates: (scan.identity ? scan.identity.candidates : []).map((c) => ({ title: String(c.title).slice(0, 110) })).slice(0, 20),
      indexes: (scan.identity ? scan.identity.indexes : []).map((x) => String(x.label).slice(0, 110)).slice(0, 20),
    },
    regions, families, nodes, edges, recommendations, competencies, trace,
  };
}
