// handler.ts: la parte HTTP de kanban-ia, separada de index.ts para poder probarla sin red.
// Solo POST, cuerpo JSON de como mucho 24 KB, llamante miembro del área privada y tope diario.
import type { KanbanAI } from "./ai.ts";
import { parseRequest, remaining, sanitize } from "./logic.ts";

export const CORS = {
  "Access-Control-Allow-Origin": "https://borjamora.es",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export interface Usage { read(): Promise<unknown>; write(v: { fecha: string; n: number }): Promise<void> }
export interface Deps {
  isMember: (req: Request) => Promise<boolean>;
  ai: KanbanAI | null;            // null = IA desactivada
  usage: Usage;
  maxPerDay: number;
  today: () => string;            // AAAA-MM-DD en Europe/Madrid
}

export function makeHandler(d: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return json(405, { error: "Solo POST" });
    if (!(await d.isMember(req))) return json(401, { error: "No autorizado" });
    let body: unknown;
    try {
      const t = await req.text();
      if (t.length > 24_000) return json(413, { error: "Petición demasiado grande" });
      body = t ? JSON.parse(t) : {};
    } catch { return json(400, { error: "JSON no válido" }); }
    const r = parseRequest(body);
    if ("error" in r) return json(400, { error: r.error });
    try {
      const uso = await d.usage.read();
      const left = remaining(uso, d.today(), d.maxPerDay);
      if (r.action === "estado") return json(200, { enabled: !!d.ai, provider: d.ai?.name ?? "off", remaining: left });
      if (!d.ai) return json(503, { error: "La IA está desactivada" });
      if (left <= 0) return json(429, { error: "Has llegado al tope diario de llamadas a la IA" });
      // se cuenta antes de llamar: un fallo también gasta (así un error en bucle no dispara el coste)
      await d.usage.write({ fecha: d.today(), n: d.maxPerDay - left + 1 });
      const raw = await d.ai.run(r);
      return json(200, { ...(sanitize(r, raw) as object), remaining: left - 1, provider: d.ai.name });
    } catch (err) {
      console.error("[kanban-ia]", err);
      return json(502, { error: "La IA no ha respondido. Inténtalo de nuevo en un momento." });
    }
  };
}
