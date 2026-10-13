// deno test supabase/functions/interview-intel/
// Investigación (verificación de fuentes) y generación (validación del informe). Sin red.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { retrievedUrls } from "./ai.ts";
import { unsupportedFigures, validateReport, visibleText, WORDS_MAX } from "./report.ts";
import { canonicalUrl, extractJson, type Retrieved, verifyResearch } from "./research.ts";
import type { Report, Research } from "./types.ts";

const NOW = "2026-10-13T08:00:00.000Z";
const got = (...urls: string[]): Retrieved => new Map(urls.map((u) => [canonicalUrl(u)!, { url: u, title: "t", page_age: null }]));

const RAW = {
  company: {
    name: "Acme", domain: "acme.com", confirmed: true, ambiguity: null, summary: "Acme hace software de logística.", business_model: "SaaS",
    facts: [
      { text: "Acme tiene 300 empleados", kind: "empresa", source_ids: [1] },
      { text: "Acme usa Power BI", kind: "confirmado", source_ids: [9] },          // fuente inventada
    ],
    news: [
      { text: "Acme compra Beta", date: "2026-09-02", why: "Integración de datos", kind: "tercero", source_ids: [2] },
      { text: "Noticia sin fuente", date: "2026-08-01", why: "", kind: "tercero", source_ids: [] },
    ],
    data_initiatives: [],
  },
  role: { title: "Data Analyst", available: true, level: "Junior", responsibilities: ["Dashboards"], must: ["Power BI", "SQL"], nice: ["Python"], tools: ["Power BI"], languages: ["Inglés B2"], location: "Madrid", mode: "Híbrido", source_ids: [3] },
  people: [
    { name: "Laura Gómez", current_title: "BI Lead", area: "Datos", identified: "alto", background: "8 años en BI", public_activity: null, likely_role: "Técnica", source_ids: [4] },
    { name: "Pedro Ruiz", current_title: "CTO de otra empresa", area: "?", identified: "alto", background: "Homónimo", public_activity: null, likely_role: null, source_ids: [] },
  ],
  sources: [
    { id: 1, url: "https://www.acme.com/about?utm_source=x", title: "Sobre Acme", published: null, type: "oficial" },
    { id: 2, url: "https://prensa.example/acme-compra-beta", title: "Acme compra Beta", published: "2026-09-02", type: "prensa" },
    { id: 3, url: "https://acme.com/careers/data-analyst", title: "Oferta", published: "ayer", type: "oferta" },
    { id: 4, url: "https://es.linkedin.com/in/laura-gomez", title: "Laura Gómez - BI Lead - Acme | LinkedIn", published: null, type: "perfil" },
    { id: 9, url: "https://inventada.example/acme-power-bi", title: "Inventada", published: null, type: "prensa" },
  ],
  gaps: [],
};
const RETRIEVED = got("https://acme.com/about", "https://prensa.example/acme-compra-beta", "https://acme.com/careers/data-analyst", "https://linkedin.com/in/laura-gomez");

/* ─── 15.2 Investigación ─── */
Deno.test("fuentes: solo las URLs devueltas por la búsqueda; la inventada se descarta y su hecho pasa a inferencia", () => {
  const r = verifyResearch(RAW, RETRIEVED, [], NOW);
  assertEquals(r.sources.map((s) => s.domain), ["acme.com", "prensa.example", "acme.com", "linkedin.com"]);
  assert(!r.sources.some((s) => s.url.includes("inventada")));
  assertEquals(r.company.facts[1], { text: "Acme usa Power BI", kind: "inferencia", source_ids: [] });
  assert(r.gaps[0].includes("Se descartó 1 fuente"));
  assertEquals(r.sources[2].published, null);              // «ayer» no es una fecha válida
});

Deno.test("empresa identificada correctamente → confirmada (hay fuente oficial)", () => {
  assertEquals(verifyResearch(RAW, RETRIEVED, [], NOW).company.confirmed, true);
});

Deno.test("empresa ambigua sin fuente oficial → no confirmada", () => {
  const raw = { ...RAW, company: { ...RAW.company, ambiguity: "Hay dos Acme en España" }, sources: RAW.sources.filter((s) => s.type !== "oficial" && s.type !== "oferta") };
  const r = verifyResearch(raw, RETRIEVED, [], NOW);
  assertEquals(r.company.confirmed, false);
  assertEquals(r.company.ambiguity, "Hay dos Acme en España");
});

Deno.test("homónimo sin fuente → no verificado y sin datos especulativos", () => {
  const p = verifyResearch(RAW, RETRIEVED, [], NOW).people.find((x) => x.name === "Pedro Ruiz")!;
  assertEquals([p.identified, p.background, p.area, p.source_ids.length], ["no_verificado", null, null, 0]);
});

Deno.test("LinkedIn inaccesible: vale el resultado de búsqueda (es.linkedin.com ≡ linkedin.com), no hace falta abrir el perfil", () => {
  const p = verifyResearch(RAW, RETRIEVED, [], NOW).people[0];
  assertEquals([p.identified, p.source_ids], ["alto", [4]]);
});

Deno.test("sin noticias recientes / noticia sin fuente → no se publica", () => {
  const r = verifyResearch(RAW, RETRIEVED, [], NOW);
  assertEquals(r.company.news.map((n) => n.text), ["Acme compra Beta"]);
  const none = verifyResearch({ ...RAW, company: { ...RAW.company, news: [] } }, RETRIEVED, [], NOW);
  assertEquals(none.company.news, []);
});

Deno.test("oferta no disponible → role.available = false; la oferta del proceso cuenta como fuente de confianza", () => {
  const noJob = verifyResearch({ ...RAW, sources: RAW.sources.filter((s) => s.id !== 3) }, got("https://acme.com/about"), [], NOW);
  assertEquals(noJob.role.available, false);
  const fromLink = verifyResearch(RAW, got(), ["https://acme.com/careers/data-analyst"], NOW);
  assertEquals(fromLink.role.available, true);
});

Deno.test("fuentes contradictorias → se conservan ambas con su tipo (el informe decide con source_ids)", () => {
  const raw = { ...RAW, company: { ...RAW.company, facts: [
    { text: "300 empleados según la empresa", kind: "empresa", source_ids: [1] },
    { text: "250 empleados según la prensa", kind: "tercero", source_ids: [2] },
  ] } };
  const r = verifyResearch(raw, RETRIEVED, [], NOW);
  assertEquals(r.company.facts.map((f) => f.kind), ["empresa", "tercero"]);
});

Deno.test("enlace roto o no http(s) → se rechaza", () => {
  assertEquals(canonicalUrl("javascript:alert(1)"), null);
  assertEquals(canonicalUrl("no es una url"), null);
  const r = verifyResearch({ ...RAW, sources: [{ id: 1, url: "javascript:alert(1)", title: "x", type: "oficial" }] }, RETRIEVED, [], NOW);
  assertEquals(r.sources.length, 0);
});

Deno.test("resultado incompleto del modelo → error claro (se reintenta en pipeline)", () => {
  assertThrows(() => extractJson("Lo siento, no he podido terminar"), Error, "JSON válido");
  assertEquals(extractJson("texto\n```json\n{\"a\":1}\n```"), { a: 1 });
  const r = verifyResearch({}, got(), [], NOW);          // JSON vacío: estructura segura, sin datos
  assertEquals([r.company.name, r.people.length, r.sources.length], ["", 0, 0]);
});

Deno.test("retrievedUrls lee resultados de búsqueda y páginas leídas; ignora errores de la herramienta", () => {
  const m = retrievedUrls([
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.com/x?utm_source=y", title: "A", page_age: "2026-09-01" }] },
    { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
    { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://b.com/", content: { title: "B" } } },
    { type: "text", text: "https://c.com" },
  ]);
  assertEquals([...m.keys()], ["https://a.com/x", "https://b.com"]);
});

/* ─── 15.3 Generación ─── */
const research = verifyResearch(RAW, RETRIEVED, [], NOW);
const PROFILE = "NTT DATA (UK) 2021–2022: Power BI, Power Query, DAX. Kosta Cálida: cierre en 717.304 € frente a 776.000 € (−7,56 %).";
function report(p: Partial<Report> = {}): Report {
  return {
    quality: "completo", limitations: [], interview_type: "Técnica",
    know: { context: "Acme hace software de logística y busca un Data Analyst junior.", facts: [{ text: "Acme compra Beta (sept. 2026)", source_ids: [2] }, { text: "Hecho sin fuente", source_ids: [] }], why_it_matters: "La integración de Beta exige unificar reporting." },
    people: [{ name: "Laura Gómez", title: "BI Lead", role_in_interview: "Técnica", note: null, verified: true, source_ids: [4] }, { name: "Pedro Ruiz", title: "CTO", role_in_interview: "?", note: "Experto", verified: true, source_ids: [9] }],
    strategy: { highlight: ["Power BI de extremo a extremo"], projects: [{ name: "Kosta Cálida", why: "Red de tiendas", highlight: "Desviación −7,56 %", decisions: "Estrella con 2 hechos", follow_up: "¿Por qué 2 hechos?", limitation: "Datos de ejemplo" }], review: ["CALCULATE"], gap: { topic: "Fabric", honest_answer: "Solo formación." } },
    intro: "Soy Borja, Data Analyst Junior especializado en Power BI…",
    questions: [1, 2, 3].map((n) => ({ q: "Pregunta " + n, guide: "Guía " + n, evidence: "demostrado" as const })),
    ask: ["¿Qué problema esperáis que resuelva?", "¿Cómo medís el éxito?"],
    reminder: { fit: "Power BI + negocio", example: "Kosta Cálida", question: "Éxito a 3 meses", technical: "CALCULATE" },
    matrix: [{ requirement: "Power BI", class: "demostrado", evidence: "NTT DATA" }],
    ...p,
  };
}

Deno.test("informe con información suficiente → válido; quita hechos sin fuente y no verifica a quien la investigación no verificó", () => {
  const v = validateReport(report(), research, PROFILE);
  assertEquals(v.errors, []);
  assertEquals(v.report.know.facts.length, 1);
  assertEquals(v.report.people.map((p) => p.verified), [true, false]);
  assertEquals(v.report.people[1].source_ids, []);
  assert(v.warnings.some((w) => w.includes("sin fuente verificable")));
  assert(v.warnings.some((w) => w.includes("sin verificar")));
});

Deno.test("informe parcial con información insuficiente → se acepta como parcial con limitaciones", () => {
  const v = validateReport(report({ quality: "parcial", limitations: ["No se encontró la oferta"], people: [] }), research, PROFILE);
  assertEquals(v.errors, []);
  assertEquals(v.report.quality, "parcial");
});

Deno.test("dos páginas como máximo: más de 900 palabras → reintento; más de 1000 → rechazado", () => {
  const long = (chars: number) => "palabra ".repeat(Math.ceil(chars / 8)).trim();
  const big = report({
    questions: [1, 2, 3, 4, 5].map(() => ({ q: long(240), guide: long(600), evidence: "brecha" as const })),
    intro: long(1100), know: { context: long(700), facts: [], why_it_matters: long(400) },
    strategy: { highlight: [1, 2, 3, 4].map(() => long(260)), projects: [], review: [1, 2, 3, 4, 5].map(() => long(200)), gap: null },
  });
  const v = validateReport(big, research, PROFILE);
  assert(v.words > WORDS_MAX, "palabras: " + v.words);
  assert(v.retry.some((r) => r.includes("acórtalo")));
  assert(v.errors.some((e) => e.includes("Demasiado largo")));
  const ok = validateReport(report(), research, PROFILE);
  assert(ok.words < 300 && !ok.retry.length);
});

Deno.test("faltan bloques (modelo incompleto) → error y petición concreta de corrección", () => {
  const v = validateReport(report({ questions: [], intro: "" }), research, PROFILE);
  assert(v.errors.length > 0);
  assert(v.retry.some((r) => r.includes("3 y 5 preguntas")));
});

Deno.test("sin afirmaciones inventadas: una cifra que no está en el perfil ni en la investigación queda marcada", () => {
  const v = validateReport(report({ intro: "Mejoré la eficiencia un 35 % y gestioné 2,5 M€ en NTT DATA; en Kosta Cálida la desviación fue del −7,56 %." }), research, PROFILE);
  const w = v.warnings.find((x) => x.startsWith("Cifra sin respaldo"))!;
  assert(w.includes("35 %") && w.includes("2,5 M€"));
  assert(!w.includes("7,56"));
  assertEquals(unsupportedFigures("717.304 € y 776.000 €", PROFILE), []);
});

Deno.test("enlaces: el informe no lleva URLs propias; solo ids de fuentes verificadas", () => {
  const v = validateReport(report({ know: { context: "Visita https://phishing.example/login ya", facts: [{ text: "y", source_ids: [1, 99] }], why_it_matters: "z" } }), research, PROFILE);
  assertEquals(v.report.know.facts[0].source_ids, [1]);
  assertEquals(v.report.know.context, "Visita ya");
  assert(!/https?:\/\//.test(visibleText(v.report)));
  for (const s of research.sources) assert(/^https:\/\//.test(s.url));
});
