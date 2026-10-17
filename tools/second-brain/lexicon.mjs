/* ═══════════════════════════════════════════════
   tools/second-brain/lexicon.mjs: detección de conceptos
   ─────────────────────────────────────────────────
   Determinista y explicable: cada coincidencia viene de un término del marco
   (framework.json), un patrón de código para su lenguaje o un artefacto.
   No hay modelo de lenguaje ni red: el mismo contenido da siempre el mismo resultado.

   Regla clave: un TÉRMINO dentro de código cuenta como mención (explicativa);
   solo un PATRÓN DE CÓDIGO o un ARTEFACTO cuentan como práctica. Y el motor cuenta
   archivos distintos, no repeticiones: el volumen no es un indicador de dominio.
   ═══════════════════════════════════════════════ */
import { fold, escapeRe } from './text.mjs';

const WORD = '(?<![\\p{L}\\p{N}_])';
const WORD_END = '(?![\\p{L}\\p{N}_])';

/** Acrónimos y términos cortos: distinguen mayúsculas ("EDA" ≠ "eda", "UI" ≠ "ui"). */
const isStrictCase = (t) => t.length <= 4 || (t === t.toUpperCase() && /[A-Z]/.test(t));

export function compileLexicon(framework) {
  return framework.conceptos.map((c) => {
    const strict = [], loose = [];
    for (const t of c.terminos || []) (isStrictCase(t) ? strict : loose).push(escapeRe(fold(t)).replace(/\\? /g, '\\s+'));
    const mk = (parts, flags) => (parts.length ? new RegExp(`${WORD}(?:${parts.join('|')})${WORD_END}`, flags) : null);
    const code = {};
    for (const [lang, pats] of Object.entries(c.codigo || {})) code[lang] = pats.map((p) => new RegExp(p, 'im'));
    const artifacts = (c.artefactos || []).map((a) => {
      const [name, cls] = a.split(':');
      return { name, cls: cls || 'practica' };
    });
    return { id: c.id, strict: mk(strict, 'u'), loose: mk(loose, 'iu'), code, artifacts };
  });
}

/**
 * Detecta conceptos en los segmentos y artefactos de UN archivo.
 * @returns {Record<string, {practica:number, explicativa:number, declarativa:number}>}
 *   por concepto, la clase de evidencia que ese archivo aporta (0/1: se cuenta el archivo, no las repeticiones)
 */
export function detect(lexicon, segments, artifacts) {
  const out = {};
  const mark = (id, cls) => { (out[id] ||= { practica: 0, explicativa: 0, declarativa: 0 })[cls] = 1; };
  const folded = segments.map((s) => fold(s.text));

  for (const c of lexicon) {
    segments.forEach((s, i) => {
      // 1) patrones de código para el lenguaje del segmento (o de prosa, si el patrón es de «markdown»)
      const pats = c.code[s.lang] || [];
      if (pats.some((re) => re.test(s.text))) mark(c.id, s.cls === 'practica' ? 'practica' : s.cls);
      // 2) términos: siempre menciones; en código, nunca práctica
      const text = folded[i];
      if ((c.strict && c.strict.test(text)) || (c.loose && c.loose.test(text))) {
        mark(c.id, s.cls === 'practica' ? 'explicativa' : s.cls);
      }
    });
    // 3) artefactos
    for (const a of c.artifacts) if (artifacts.includes(a.name)) mark(c.id, a.cls);
  }
  return out;
}
