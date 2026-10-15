// ═══════════════════════════════════════════════
// ai.ts: proveedores de IA detrás de una interfaz (AIProvider en pipeline.ts)
// ───────────────────────────────────────────────
// ClaudeProvider  API de Claude (de pago, clave ANTHROPIC_API_KEY):
//                 · investigación con las herramientas de servidor web_search y web_fetch
//                   (corren en Anthropic; el modelo no tiene ninguna herramienta con efectos)
//                 · informe con structured outputs (esquema REPORT_SCHEMA)
// MockProvider    sin red ni coste: para pruebas y para el ensayo de extremo a extremo
//                 (II_AI_PROVIDER=mock). Sus informes dicen «SIMULADO».
// Cambiar de proveedor = otra clase con research() y writeReport().
// ═══════════════════════════════════════════════
import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import type { AIProvider, ReportInput, ResearchInput } from "./pipeline.ts";
import { reportSystem, reportUser, researchSystem, researchUser } from "./prompts.ts";
import { REPORT_SCHEMA } from "./report.ts";
import { canonicalUrl, extractJson, type Retrieved, verifyResearch } from "./research.ts";
import type { Report, Research, Usage } from "./types.ts";

// $ por millón de tokens (entrada, salida, lectura de caché) y por búsqueda web.
// Fuente: tabla de modelos de la documentación de Claude (octubre de 2026). Revísalo si cambian.
const PRICES: Record<string, [number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2], "claude-opus-5": [5, 25, 0.5], "claude-opus-4-8": [5, 25, 0.5],
  "claude-sonnet-5-5": [2, 10, 0.2], "claude-haiku-5-5": [0.1, 0.5, 0.01],
};
const WEB_SEARCH_USD = 0.01;   // 10 $ por 1.000 búsquedas

export function usageOf(model: string, u: any): Usage {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const input = u?.input_tokens ?? 0, output = u?.output_tokens ?? 0, cache = u?.cache_read_input_tokens ?? 0;
  const searches = u?.server_tool_use?.web_search_requests ?? 0, fetches = u?.server_tool_use?.web_fetch_requests ?? 0;
  const usd = (input * p[0] + output * p[1] + cache * p[2]) / 1e6 + searches * WEB_SEARCH_USD;
  return { input_tokens: input, output_tokens: output, cache_read_input_tokens: cache, web_search_requests: searches, web_fetch_requests: fetches, usd: Math.round(usd * 10000) / 10000 };
}
const add = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  web_search_requests: a.web_search_requests + b.web_search_requests, web_fetch_requests: a.web_fetch_requests + b.web_fetch_requests,
  usd: Math.round((a.usd + b.usd) * 10000) / 10000,
});
const ZERO: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, web_search_requests: 0, web_fetch_requests: 0, usd: 0 };

/** URLs que las herramientas devolvieron de verdad (resultados de búsqueda y páginas leídas) */
export function retrievedUrls(content: any[]): Retrieved {
  const out: Retrieved = new Map();
  const put = (url: unknown, title: unknown, age: unknown) => {
    const c = typeof url === "string" ? canonicalUrl(url) : null;
    if (c && !out.has(c)) out.set(c, { url: String(url), title: typeof title === "string" ? title : null, page_age: typeof age === "string" ? age : null });
  };
  for (const b of content ?? []) {
    if (b?.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) put(r?.url, r?.title, r?.page_age);
    if (b?.type === "web_fetch_tool_result" && b.content?.type === "web_fetch_result") put(b.content.url, b.content.content?.title, b.content.retrieved_at);
  }
  return out;
}

function checkStop(r: any) {
  if (r.stop_reason === "refusal") throw new Error("El modelo rechazó la petición" + (r.stop_details?.category ? " (" + r.stop_details.category + ")" : ""));
  if (r.stop_reason === "max_tokens") throw new Error("Respuesta incompleta (límite de tokens)");
}

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  constructor(apiKey: string, private model = "claude-opus-5-5", private now = () => new Date()) {
    // sin reintentos del SDK: los hace pipeline.ts con espera progresiva, y así una ejecución
    // nunca supera el límite de tiempo de la Edge Function
    this.client = new Anthropic({ apiKey, maxRetries: 0, timeout: 135_000 });
  }

  // Petición con respaldo del lado del servidor: si el modelo principal declina por sus
  // salvaguardas, la API reintenta con el modelo de respaldo que elige ella («default»).
  private create(params: Record<string, unknown>) {
    return (this.client.beta.messages.create as any)({
      model: this.model, max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", ...params,
    });
  }

  async research(input: ResearchInput) {
    const tools = [
      { type: "web_search_20260209", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "ES", city: "Madrid", timezone: "Europe/Madrid" } },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4, max_content_tokens: 8000 },
    ];
    const messages: any[] = [{ role: "user", content: researchUser(input.interview, input.emails, input.event_description) }];
    let usage = ZERO, model = this.model;
    const content: any[] = [];
    // las herramientas de servidor pueden pausar el turno (pause_turn): se reanuda hasta 3 veces
    for (let i = 0; i < 4; i++) {
      const r = await this.create({ system: researchSystem(this.now().toISOString()), tools, thinking: { type: "adaptive" }, output_config: { effort: "medium" }, messages });
      model = r.model ?? model;
      usage = add(usage, usageOf(model, r.usage));
      content.push(...r.content);
      if (r.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: r.content }); continue; }
      checkStop(r);
      break;
    }
    const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const extra = [input.interview.job_url, ...input.emails.flatMap((e) => e.links)].filter((u): u is string => !!u);
    const research: Research = verifyResearch(extractJson(text), retrievedUrls(content), extra, this.now().toISOString());
    return { research, usage, model };
  }

  async writeReport(input: ReportInput) {
    const r = await this.create({
      system: reportSystem(this.now().toISOString()),
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: REPORT_SCHEMA } },
      messages: [{ role: "user", content: reportUser(input.interview, input.research, input.profile, input.emails, input.link, input.feedback) }],
    });
    checkStop(r);
    const text = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    let report: Report;
    try { report = JSON.parse(text); } catch { throw new Error("El informe no es un JSON válido"); }
    return { report, usage: usageOf(r.model ?? this.model, r.usage), model: r.model ?? this.model };
  }
}

/* ═══════════ Simulado (sin red, sin coste) ═══════════ */
export class MockProvider implements AIProvider {
  constructor(private now = () => new Date(), private fail: { research?: number; report?: number } = {}) {}
  calls = { research: 0, report: 0 };

  research(input: ResearchInput) {
    this.calls.research++;
    if (this.fail.research && this.calls.research <= this.fail.research) return Promise.reject(new Error("Proveedor de búsqueda no disponible (simulado)"));
    const i = input.interview, company = i.company ?? "Empresa de prueba";
    const web = `https://${i.company_domain ?? "example.com"}/`;
    const raw = {
      company: { name: company, domain: i.company_domain, confirmed: true, ambiguity: null, summary: `${company} (SIMULADO): resumen de prueba generado sin búsqueda real.`, business_model: null,
        facts: [{ text: `${company} publica su actividad en su web (SIMULADO).`, kind: "empresa", source_ids: [1] }], news: [], data_initiatives: [] },
      role: { title: i.role_title, available: false, level: null, responsibilities: [], must: ["Power BI", "SQL"], nice: [], tools: [], languages: [], location: null, mode: null, source_ids: [] },
      people: i.attendees.map((p) => ({ name: p.name ?? p.email ?? "?", current_title: null, identified: "no_verificado", source_ids: [] })),
      sources: [{ id: 1, url: web, title: company + ": web oficial", published: null, type: "oficial" }],
      gaps: ["Investigación SIMULADA: no se ha consultado ninguna fuente real."],
    };
    const retrieved: Retrieved = new Map([[canonicalUrl(web)!, { url: web, title: company, page_age: null }]]);
    return Promise.resolve({ research: verifyResearch(raw, retrieved, [], this.now().toISOString()), usage: ZERO, model: "mock" });
  }

  writeReport(input: ReportInput) {
    this.calls.report++;
    if (this.fail.report && this.calls.report <= this.fail.report) return Promise.reject(new Error("Modelo devolvió un resultado incompleto (simulado)"));
    const r = input.research, company = r.company.name || "la empresa";
    const report: Report = {
      quality: "parcial",
      limitations: ["Informe SIMULADO para probar el flujo: no usar para preparar una entrevista real."],
      interview_type: input.interview.interview_kind,
      know: { context: r.company.summary || `Contexto de ${company} no disponible.`, facts: r.company.facts.filter((f) => f.source_ids.length).map((f) => ({ text: f.text, source_ids: f.source_ids })), why_it_matters: "Sirve para comprobar que el informe se guarda y se ve en el área privada." },
      people: r.people.map((p) => ({ name: p.name, title: p.current_title, role_in_interview: "Sin verificar", note: null, verified: false, source_ids: [] })),
      strategy: { highlight: ["Perfil junior centrado en Power BI (prueba)."], projects: [{ name: "Proyecto de prueba", why: "Simulado", highlight: "Simulado", decisions: "Simulado", follow_up: "Simulado", limitation: "Simulado" }], review: ["DAX: contexto de filtro (prueba)"], gap: null },
      intro: "Texto de prueba de la presentación. En un informe real aquí iría tu «Háblame de ti» adaptado al puesto.",
      questions: [1, 2, 3].map((n) => ({ q: `Pregunta de prueba ${n}`, guide: "Guía de respuesta simulada.", evidence: "brecha" as const })),
      ask: ["Pregunta de prueba para el entrevistador 1", "Pregunta de prueba para el entrevistador 2"],
      reminder: { fit: "Prueba", example: "Prueba", question: "Prueba", technical: "Prueba" },
      matrix: [],
    };
    return Promise.resolve({ report, usage: ZERO, model: "mock" });
  }
}
