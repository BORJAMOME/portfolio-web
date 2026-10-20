/* ═══════════════════════════════════════════════
   second-brain/contract.js: contrato de datos del snapshot de Second Brain
   ─────────────────────────────────────────────────
   Lo usan los dos lados con el mismo código:
     · el motor (tools/second-brain) valida el snapshot ANTES de guardarlo;
     · el visor (área privada) lo valida al recibirlo, antes de dibujar nada.
   Es un módulo ES sin dependencias ni APIs de Node ni del navegador.

   El snapshot es un grafo ya calculado. El visor no interpreta documentos:
   solo representa lo que este contrato describe.
   ═══════════════════════════════════════════════ */

export const SCHEMA_VERSION = 1;

/* Estado de evidencia. «oportunidad» es una acción posible (no implica carencia);
   «neutral» es para nodos que no son conocimiento (objetivos, proyectos). */
export const STATES = ['respaldado', 'mencionado', 'pendiente', 'brecha_probable', 'brecha_confirmada', 'oportunidad', 'neutral'];
export const NODE_TYPES = ['tecnologia', 'concepto', 'tecnica', 'competencia', 'proyecto', 'objetivo', 'recomendacion'];
export const EDGE_TYPES = ['usa', 'parte-de', 'requiere', 'mejora', 'habilita', 'demuestra', 'agrupa', 'necesita', 'recomienda'];
export const CONFIDENCE = ['alta', 'media', 'baja'];
export const BUCKETS = ['ahora', 'despues', 'todavia_no'];
export const MODES = ['real', 'demo'];

export const LIMITS = { nodes: 1500, edges: 6000, recommendations: 200, text: 600, label: 120 };

const ID = /^[a-z0-9][a-z0-9:_.-]{0,79}$/;
const ICON = /^[a-z0-9-]{1,40}$/;
const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Valida un snapshot. Devuelve { ok, errors, warnings }; nunca lanza. */
export function validateSnapshot(s) {
  const errors = [];
  const warnings = [];
  const err = (m) => { if (errors.length < 40) errors.push(m); };

  if (!isObj(s)) return { ok: false, errors: ['El snapshot no es un objeto.'], warnings };
  if (s.schema !== SCHEMA_VERSION) err(`Versión de esquema no soportada: ${s.schema} (se esperaba ${SCHEMA_VERSION}).`);
  if (!isStr(s.generatedAt, 40) || Number.isNaN(Date.parse(s.generatedAt))) err('generatedAt no es una fecha válida.');
  if (!MODES.includes(s.mode)) err('mode debe ser «real» o «demo».');
  if (!isObj(s.engine) || !isStr(s.engine.version, 40)) err('Falta engine.version.');
  if (!isObj(s.meta)) err('Falta meta.');
  for (const k of ['regions', 'nodes', 'edges', 'recommendations', 'competencies']) {
    if (!Array.isArray(s[k])) err(`Falta la lista «${k}».`);
  }
  if (errors.length) return { ok: false, errors, warnings };

  if (s.nodes.length > LIMITS.nodes) err(`Demasiados nodos (${s.nodes.length} > ${LIMITS.nodes}).`);
  if (s.edges.length > LIMITS.edges) err(`Demasiadas relaciones (${s.edges.length} > ${LIMITS.edges}).`);
  if (s.recommendations.length > LIMITS.recommendations) err('Demasiadas recomendaciones.');
  if (errors.length) return { ok: false, errors, warnings };

  const regionIds = new Set();
  s.regions.forEach((r, i) => {
    if (!isObj(r) || !ID.test(r.id || '') || !isStr(r.label, LIMITS.label)) return err(`Región ${i} inválida.`);
    if (regionIds.has(r.id)) err(`Región duplicada: ${r.id}`);
    regionIds.add(r.id);
    if (!Array.isArray(r.center) || r.center.length !== 3 || !r.center.every(isNum)) err(`Región ${r.id}: centro inválido.`);
    if (r.color != null && !/^#[0-9a-f]{6}$/i.test(r.color)) err(`Región ${r.id}: color inválido.`);
    if (r.icon != null && !ICON.test(r.icon)) err(`Región ${r.id}: icono inválido.`);
  });

  // familias tecnológicas (opcionales: un snapshot antiguo sin ellas se sigue dibujando por áreas)
  const familyIds = new Set();
  if (s.families != null) {
    if (!Array.isArray(s.families)) err('families debe ser una lista.');
    else s.families.forEach((f, i) => {
      if (!isObj(f) || !ID.test(f.id || '') || !isStr(f.label, LIMITS.label)) return err(`Familia ${i} inválida.`);
      if (familyIds.has(f.id)) err(`Familia duplicada: ${f.id}`);
      familyIds.add(f.id);
      if (!/^#[0-9a-f]{6}$/i.test(f.color || '')) err(`Familia ${f.id}: color inválido.`);
      if (f.ink != null && !/^#[0-9a-f]{6}$/i.test(f.ink)) err(`Familia ${f.id}: tinta inválida.`);
      if (f.icon != null && !ICON.test(f.icon)) err(`Familia ${f.id}: icono inválido.`);
    });
  }

  const nodeIds = new Set();
  const nodeById = new Map();
  s.nodes.forEach((n, i) => {
    if (!isObj(n) || !ID.test(n.id || '')) return err(`Nodo ${i}: id inválido.`);
    if (nodeIds.has(n.id)) return err(`Nodo duplicado: ${n.id}`);
    nodeIds.add(n.id);
    nodeById.set(n.id, n);
    if (!isStr(n.label, LIMITS.label)) err(`Nodo ${n.id}: etiqueta inválida.`);
    if (!NODE_TYPES.includes(n.type)) err(`Nodo ${n.id}: tipo desconocido «${n.type}».`);
    if (!STATES.includes(n.state)) err(`Nodo ${n.id}: estado desconocido «${n.state}».`);
    if (!regionIds.has(n.region)) err(`Nodo ${n.id}: región inexistente «${n.region}».`);
    if (typeof n.summary !== 'string' || n.summary.length > LIMITS.text) err(`Nodo ${n.id}: resumen inválido.`);
    if (!Array.isArray(n.pos) || n.pos.length !== 3 || !n.pos.every((v) => isNum(v) && Math.abs(v) < 1000)) err(`Nodo ${n.id}: posición inválida.`);
    if (!isNum(n.size) || n.size < 0 || n.size > 1) err(`Nodo ${n.id}: tamaño fuera de 0..1.`);
    if (n.icon != null && !ICON.test(n.icon)) err(`Nodo ${n.id}: icono inválido.`);
    if (n.area != null && !regionIds.has(n.area)) err(`Nodo ${n.id}: área inexistente «${n.area}».`);
    // enlace a lo publicado: solo https y sin espacios (el visor lo pinta como <a> con textContent)
    if (n.family != null && !familyIds.has(n.family)) err(`Nodo ${n.id}: familia inexistente «${n.family}».`);
    if (n.families != null && (!Array.isArray(n.families) || n.families.length > 6 || n.families.some((f) => !familyIds.has(f)))) err(`Nodo ${n.id}: familias inválidas.`);
    if (n.link != null && !(isStr(n.link, 500) && /^https:\/\/[^\s"'<>]+$/.test(n.link))) err(`Nodo ${n.id}: enlace inválido (solo https).`);
    if (n.group != null && !isStr(n.group, LIMITS.label)) err(`Nodo ${n.id}: grupo inválido.`);
    if (!Array.isArray(n.uncertainty) || n.uncertainty.some((u) => typeof u !== 'string' || u.length > LIMITS.text)) err(`Nodo ${n.id}: incertidumbres inválidas.`);
    // Una brecha confirmada exige una evaluación explícita. La ausencia de documentos nunca basta.
    if (n.state === 'brecha_confirmada' && !(isObj(n.assessment) && isStr(n.assessment.reason, LIMITS.text) && isStr(n.assessment.source, 120))) {
      err(`Nodo ${n.id}: «brecha_confirmada» sin evaluación explícita (assessment.reason y assessment.source).`);
    }
    if (n.state === 'brecha_probable' && !(Array.isArray(n.uncertainty) && n.uncertainty.length)) {
      err(`Nodo ${n.id}: «brecha_probable» debe indicar su motivo en uncertainty.`);
    }
  });

  const edgeKeys = new Set();
  s.edges.forEach((e, i) => {
    if (!isObj(e)) return err(`Relación ${i} inválida.`);
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return err(`Relación ${i}: extremo inexistente (${e.source} → ${e.target}).`);
    if (e.source === e.target) err(`Relación ${i}: es un bucle sobre ${e.source}.`);
    if (!EDGE_TYPES.includes(e.type)) err(`Relación ${i}: tipo desconocido «${e.type}».`);
    if (!CONFIDENCE.includes(e.confidence)) err(`Relación ${i}: confianza inválida.`);
    if (!isStr(e.rationale, LIMITS.text)) err(`Relación ${i}: sin fundamento (rationale).`);
    const key = `${e.source}|${e.target}|${e.type}`;
    if (edgeKeys.has(key)) err(`Relación duplicada: ${key}`);
    edgeKeys.add(key);
  });

  const recIds = new Set();
  s.recommendations.forEach((r, i) => {
    if (!isObj(r) || !ID.test(r.id || '')) return err(`Recomendación ${i}: id inválido.`);
    if (recIds.has(r.id)) err(`Recomendación duplicada: ${r.id}`);
    recIds.add(r.id);
    if (!nodeIds.has(r.nodeId)) err(`Recomendación ${r.id}: nodo inexistente.`);
    if (!nodeIds.has(r.targetId)) err(`Recomendación ${r.id}: objetivo inexistente.`);
    for (const k of ['what', 'why', 'evidence', 'result', 'action', 'objective']) {
      if (!isStr(r[k], LIMITS.text)) err(`Recomendación ${r.id}: falta «${k}».`);
    }
    if (!CONFIDENCE.includes(r.confidence)) err(`Recomendación ${r.id}: confianza inválida.`);
    if (!isObj(r.priority) || !isNum(r.priority.score) || !BUCKETS.includes(r.priority.bucket)) err(`Recomendación ${r.id}: prioridad inválida.`);
    if (!isStr(r.effort, 40)) err(`Recomendación ${r.id}: falta el esfuerzo orientativo.`);
  });

  s.competencies.forEach((c, i) => {
    if (!isObj(c) || !nodeIds.has(c.nodeId)) return err(`Competencia ${i}: nodo inexistente.`);
    if (!STATES.includes(c.state)) err(`Competencia ${c.nodeId}: estado desconocido.`);
    if (!isObj(c.levels)) err(`Competencia ${c.nodeId}: faltan los niveles.`);
    if (!Array.isArray(c.unverified)) err(`Competencia ${c.nodeId}: falta la lista de aspectos sin comprobar.`);
  });

  // Coherencia: las recomendaciones apuntan a nodos de tipo recomendacion
  for (const r of s.recommendations) {
    const n = nodeById.get(r.nodeId);
    if (n && n.type !== 'recomendacion') err(`Recomendación ${r.id}: su nodo no es de tipo «recomendacion».`);
  }

  if (s.mode === 'demo' && !(isObj(s.meta) && s.meta.demo === true)) warnings.push('Un snapshot de demostración debería llevar meta.demo = true.');
  return { ok: errors.length === 0, errors, warnings };
}
