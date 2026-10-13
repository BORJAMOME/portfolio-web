// ═══════════════════════════════════════════════
// report.ts — esquema del informe y validación antes de guardarlo
// ───────────────────────────────────────────────
// El modelo devuelve JSON con este esquema (structured outputs). Antes de guardar:
//   · extensión: el informe visible tiene que caber en dos A4 (≈ 650–850 palabras;
//     WORDS_RETRY pide un segundo intento más corto, WORDS_MAX lo rechaza)
//   · bloques: 3–5 preguntas, 2–3 preguntas para hacer, 1–2 proyectos
//   · fuentes: cada hecho apunta a fuentes que existen en la investigación; si no, se quita
//   · entrevistadores: solo «verificado» si la investigación lo identificó con fuente
//   · cifras: un número con %, €, k o M que no aparece ni en el perfil ni en la
//     investigación queda marcado como «sin respaldo» (aviso visible en el informe)
// El informe no lleva URLs: los enlaces salen de research.sources por su id.
// ═══════════════════════════════════════════════
import type { EvidenceClass, Report, Research } from "./types.ts";

export const WORDS_TARGET = 800;
export const WORDS_RETRY = 900;
export const WORDS_MAX = 1000;

const str = { type: "string" };
const strArr = { type: "array", items: str };
const ids = { type: "array", items: { type: "integer" } };
const evidence = { type: "string", enum: ["demostrado", "formacion", "transferible", "brecha"] };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

export const REPORT_SCHEMA = obj({
  quality: { type: "string", enum: ["completo", "parcial"] },
  limitations: strArr,
  interview_type: str,
  know: obj({ context: str, facts: { type: "array", items: obj({ text: str, source_ids: ids }) }, why_it_matters: str }),
  people: { type: "array", items: obj({ name: str, title: { anyOf: [str, { type: "null" }] }, role_in_interview: str, note: { anyOf: [str, { type: "null" }] }, verified: { type: "boolean" }, source_ids: ids }) },
  strategy: obj({
    highlight: strArr,
    projects: { type: "array", items: obj({ name: str, why: str, highlight: str, decisions: str, follow_up: str, limitation: str }) },
    review: strArr,
    gap: { anyOf: [obj({ topic: str, honest_answer: str }), { type: "null" }] },
  }),
  intro: str,
  questions: { type: "array", items: obj({ q: str, guide: str, evidence }) },
  ask: strArr,
  reminder: obj({ fit: str, example: str, question: str, technical: str }),
  matrix: { type: "array", items: obj({ requirement: str, class: evidence, evidence: str }) },
});

// sin URLs en el texto: los enlaces del informe salen solo de fuentes verificadas
const clip = (s: unknown, n: number) => String(s ?? "").replace(/(?:https?:\/\/|www\.)\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, n);
const words = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%€-]*/gu) ?? []).length;
const EVIDENCE: EvidenceClass[] = ["demostrado", "formacion", "transferible", "brecha"];

/** Texto que se ve en el informe (la matriz interna no cuenta: va plegada y no se imprime) */
export function visibleText(r: Report) {
  return [
    r.interview_type, ...r.limitations, r.know.context, ...r.know.facts.map((f) => f.text), r.know.why_it_matters,
    ...r.people.flatMap((p) => [p.name, p.title ?? "", p.role_in_interview, p.note ?? ""]),
    ...r.strategy.highlight, ...r.strategy.projects.flatMap((p) => [p.name, p.why, p.highlight, p.decisions, p.follow_up, p.limitation]),
    ...r.strategy.review, r.strategy.gap ? r.strategy.gap.topic + " " + r.strategy.gap.honest_answer : "",
    r.intro, ...r.questions.flatMap((q) => [q.q, q.guide]), ...r.ask,
    r.reminder.fit, r.reminder.example, r.reminder.question, r.reminder.technical,
  ].join("\n");
}

// cifras con unidad («174 medidas» no, «−7,56 %», «717.304 €», «198K €», «3,46» sí si llevan decimales)
const FIGURE = /[-−+]?\d[\d.,]*\s?(?:%|€|k€|K€|M€|k\b|K\b|M\b|millones|mil\b)|\b\d+,\d+\b/g;
const digits = (s: string) => s.replace(/[^\d]/g, "");

export function unsupportedFigures(text: string, ...corpus: (string | null)[]) {
  const hay = corpus.filter(Boolean).join(" ");
  const hayDigits = new Set((hay.match(/\d[\d.,]*/g) ?? []).map(digits).filter((x) => x.length));
  const out = new Set<string>();
  for (const m of text.match(FIGURE) ?? []) {
    const d = digits(m);
    if (!d || d.length < 2 && !/,/.test(m)) continue;          // «5 %» suelto no merece aviso
    if (!hayDigits.has(d)) out.add(m.trim());
  }
  return [...out];
}

export type Validation = { report: Report; words: number; errors: string[]; warnings: string[]; retry: string[] };

/** Limpia, recorta y comprueba el informe. errors → no se guarda; warnings → se guarda marcado. */
export function validateReport(raw: Report, research: Research, profile: string | null): Validation {
  const errors: string[] = [], warnings: string[] = [], retry: string[] = [];
  const valid = new Set(research.sources.map((s) => s.id));
  const keepIds = (a: unknown) => (Array.isArray(a) ? a.map(Number).filter((n) => valid.has(n)) : []);
  const known = new Map(research.people.map((p) => [p.name.toLowerCase(), p]));

  const r: Report = {
    quality: raw?.quality === "completo" ? "completo" : "parcial",
    limitations: (raw?.limitations ?? []).map((s) => clip(s, 240)).filter(Boolean).slice(0, 4),
    interview_type: clip(raw?.interview_type, 80) || "Sin determinar",
    know: {
      context: clip(raw?.know?.context, 700),
      facts: [], why_it_matters: clip(raw?.know?.why_it_matters, 400),
    },
    people: (raw?.people ?? []).slice(0, 5).map((p) => {
      const src = keepIds(p.source_ids), found = known.get(String(p.name ?? "").toLowerCase());
      const verified = !!p.verified && !!found && found.identified !== "no_verificado" && src.length > 0;
      return { name: clip(p.name, 120), title: p.title ? clip(p.title, 160) : null, role_in_interview: clip(p.role_in_interview, 240), note: p.note ? clip(p.note, 300) : null, verified, source_ids: verified ? src : [] };
    }).filter((p) => p.name),
    strategy: {
      highlight: (raw?.strategy?.highlight ?? []).map((s) => clip(s, 260)).filter(Boolean).slice(0, 4),
      projects: (raw?.strategy?.projects ?? []).slice(0, 2).map((p) => ({
        name: clip(p.name, 100), why: clip(p.why, 260), highlight: clip(p.highlight, 300), decisions: clip(p.decisions, 300),
        follow_up: clip(p.follow_up, 200), limitation: clip(p.limitation, 220),
      })).filter((p) => p.name),
      review: (raw?.strategy?.review ?? []).map((s) => clip(s, 200)).filter(Boolean).slice(0, 5),
      gap: raw?.strategy?.gap?.topic ? { topic: clip(raw.strategy.gap.topic, 120), honest_answer: clip(raw.strategy.gap.honest_answer, 400) } : null,
    },
    intro: clip(raw?.intro, 1100),
    questions: (raw?.questions ?? []).slice(0, 5).map((q) => ({ q: clip(q.q, 240), guide: clip(q.guide, 600), evidence: EVIDENCE.includes(q.evidence) ? q.evidence : "brecha" })).filter((q) => q.q && q.guide),
    ask: (raw?.ask ?? []).map((s) => clip(s, 260)).filter(Boolean).slice(0, 3),
    reminder: {
      fit: clip(raw?.reminder?.fit, 260), example: clip(raw?.reminder?.example, 200),
      question: clip(raw?.reminder?.question, 220), technical: clip(raw?.reminder?.technical, 200),
    },
    matrix: (raw?.matrix ?? []).slice(0, 20).map((m) => ({ requirement: clip(m.requirement, 160), class: EVIDENCE.includes(m.class) ? m.class : "brecha", evidence: clip(m.evidence, 240) })),
  };

  // hechos: sin fuente válida no se publican como hechos
  let dropped = 0;
  for (const f of raw?.know?.facts ?? []) {
    const src = keepIds(f.source_ids);
    if (!src.length) { dropped++; continue; }
    r.know.facts.push({ text: clip(f.text, 320), source_ids: src });
  }
  r.know.facts = r.know.facts.slice(0, 5);
  if (dropped) warnings.push(dropped === 1 ? "Se quitó 1 afirmación sin fuente verificable." : `Se quitaron ${dropped} afirmaciones sin fuente verificable.`);
  const unverified = r.people.filter((p) => !p.verified).length;
  if (unverified) warnings.push(unverified === 1 ? "1 entrevistador sin verificar en fuentes públicas." : `${unverified} entrevistadores sin verificar en fuentes públicas.`);

  // bloques obligatorios
  if (!r.know.context) errors.push("Falta el contexto de la empresa");
  if (r.questions.length < 3) retry.push("Incluye entre 3 y 5 preguntas probables con su guía.");
  if (r.ask.length < 2) retry.push("Incluye 2 o 3 preguntas para hacer al entrevistador.");
  if (!r.intro) retry.push("Falta la presentación «Háblame de ti».");
  if (!r.reminder.fit || !r.reminder.example) retry.push("Completa el recordatorio final.");
  if (r.questions.length < 3 || !r.intro) errors.push("Faltan bloques obligatorios (preguntas o presentación)");

  // extensión
  const n = words(visibleText(r));
  if (n > WORDS_RETRY) retry.push(`El informe tiene ${n} palabras; acórtalo a ${WORDS_TARGET} como máximo sin perder fuentes ni datos críticos.`);
  if (n > WORDS_MAX) errors.push(`Demasiado largo para dos páginas (${n} palabras)`);

  // cifras sin respaldo en el perfil ni en la investigación
  const figs = unsupportedFigures(visibleText(r), profile, JSON.stringify(research));
  if (figs.length) warnings.push("Cifra sin respaldo en tus fuentes, compruébala: " + figs.slice(0, 5).join(", "));

  if (research.gaps.length && r.quality === "completo" && !research.company.confirmed) r.quality = "parcial";
  return { report: r, words: n, errors, warnings, retry };
}
