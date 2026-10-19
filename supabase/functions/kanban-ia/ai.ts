// ═══════════════════════════════════════════════
// ai.ts: proveedor de IA del Centro de trabajo
// ───────────────────────────────────────────────
// ClaudeProvider  API de Claude (de pago; clave ANTHROPIC_API_KEY). Una sola llamada por acción,
//                 salida estructurada con el esquema de logic.ts, esfuerzo bajo y respaldo del
//                 lado del servidor si el modelo principal declina.
// MockProvider    sin red ni coste, para pruebas (KB_AI_PROVIDER=mock). Sus textos dicen «SIMULADO».
// ═══════════════════════════════════════════════
import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import { type Req, SCHEMAS, SYSTEM, userPrompt } from "./logic.ts";

export interface KanbanAI { run(r: Req): Promise<unknown>; readonly name: string }

export class ClaudeProvider implements KanbanAI {
  readonly name = "claude";
  private client: Anthropic;
  constructor(apiKey: string, private model = "claude-opus-5-5") {
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  }
  async run(r: Req) {
    if (r.action === "estado") return {};
    const res: any = await (this.client.beta.messages.create as any)({
      model: this.model, max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: SYSTEM,
      // tareas cortas y acotadas: esfuerzo bajo (en Opus 5.5 el razonamiento no se puede apagar)
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMAS[r.action] } },
      messages: [{ role: "user", content: userPrompt(r) }],
    });
    if (res.stop_reason === "refusal") throw new Error("El modelo ha declinado la petición");
    if (res.stop_reason === "max_tokens") throw new Error("Respuesta incompleta");
    const text = (res.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    try { return JSON.parse(text); } catch { throw new Error("La respuesta no es un JSON válido"); }
  }
}

export class MockProvider implements KanbanAI {
  readonly name = "mock";
  async run(r: Req) {
    if (r.action === "desglosar") return { pasos: ["SIMULADO: Revisar el objetivo", "SIMULADO: Preparar los datos", "SIMULADO: Comprobar el resultado"] };
    if (r.action === "siguiente_paso") return { siguiente_paso: "SIMULADO: Abrir el archivo y anotar el primer cambio", motivo: "Es lo más pequeño que desbloquea el resto." };
    if (r.action === "plan_dia") return { resumen: "SIMULADO: acaba lo empezado antes de abrir frentes nuevos.", elegidas: (r.cards ?? []).slice(0, r.capacidad ?? 3).map((c) => ({ id: c.id, motivo: "SIMULADO" })) };
    if (r.action === "capturar") return { tarjetas: (r.texto ?? "").split(/[.\n;]+/).map((t) => t.trim()).filter(Boolean).slice(0, 10).map((t) => ({ titulo: t, estado: "pendiente", prioridad: 2, fecha_limite: null, proyecto_id: null, siguiente_paso: null })) };
    return {};
  }
}
