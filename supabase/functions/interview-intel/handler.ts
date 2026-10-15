// handler.ts: validación HTTP de la función, separada de index.ts para poder probarla.
// Solo POST, cuerpo JSON de como mucho 2 KB, única acción «tick» y llamante autorizado.
export const CORS = {
  "Access-Control-Allow-Origin": "https://borjamora.es",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export type Caller = "cron" | "member";

/** Comparación en tiempo constante (para el secreto del cron) */
export function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function makeHandler(o: { caller: (req: Request) => Promise<Caller | null>; tick: (who: Caller) => Promise<Response> }) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return json(405, { error: "Solo POST" });
    const who = await o.caller(req);
    if (!who) return json(401, { error: "No autorizado" });
    let body: unknown;
    try {
      const t = await req.text();
      if (t.length > 2000) return json(413, { error: "Petición demasiado grande" });
      body = t ? JSON.parse(t) : {};
    } catch { return json(400, { error: "JSON no válido" }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "JSON no válido" });
    const action = (body as { action?: unknown }).action ?? "tick";
    if (action !== "tick") return json(400, { error: "Acción desconocida" });
    try { return await o.tick(who); }
    catch (err) {
      console.error("[interview-intel]", err);
      return json(500, { error: "Error interno: revisa los registros de la función" });
    }
  };
}
