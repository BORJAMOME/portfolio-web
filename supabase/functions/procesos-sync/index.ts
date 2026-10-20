// ═══════════════════════════════════════════════
// supabase/functions/procesos-sync — correos de selección (Gmail) → Entrevistas · Procesos
// ───────────────────────────────────────────────
// Lo llama el script de Google Apps Script de tools/gmail-procesos/ cada 15 minutos con
// «Authorization: Bearer <GMAIL_SYNC_SECRET>» y {"messages": [...]} (máximo 50).
// Clasifica con reglas (classify.ts, sin IA ni coste), guarda en public.procesos_correo y, si
// la confianza es alta, aplica con public.pc_aplicar() (supabase/procesos-correo.sql).
//
// Secretos: GMAIL_SYNC_SECRET (cadena larga aleatoria, la misma que en el script)
//           II_OWN_EMAILS (tus direcciones; ya existe por interview-intel)
// Se despliega con --no-verify-jwt: la autorización es el secreto (comparación en tiempo constante).
// ═══════════════════════════════════════════════
import { MAX_MESSAGES, sync, type SyncStore } from "./sync.ts";

const env = (k: string) => Deno.env.get(k)?.trim() ?? "";
const URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY"), SECRET = env("GMAIL_SYNC_SECRET");
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function rest(path: string, init: RequestInit) {
  const r = await fetch(URL_ + path, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`Base de datos ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const store: SyncStore = {
  async insert(row) {
    const r = await rest("/rest/v1/procesos_correo?on_conflict=message_id&select=id", {
      method: "POST", headers: { Prefer: "return=representation,resolution=ignore-duplicates" }, body: JSON.stringify(row),
    });
    return r?.[0]?.id ?? null;
  },
  async apply(id) {
    return await rest("/rest/v1/rpc/pc_aplicar", { method: "POST", body: JSON.stringify({ target: id }) });
  },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Solo POST" });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!SECRET || !safeEqual(token, SECRET)) return json(401, { error: "No autorizado" });
  let body: any;
  try {
    const t = await req.text();
    if (t.length > 400_000) return json(413, { error: "Petición demasiado grande" });
    body = JSON.parse(t);
  } catch { return json(400, { error: "JSON no válido" }); }
  if (!body || !Array.isArray(body.messages) || body.messages.length > MAX_MESSAGES) return json(400, { error: `Se espera {"messages": [...]} con ${MAX_MESSAGES} como máximo` });
  try {
    const resumen = await sync(body.messages, env("II_OWN_EMAILS").split(/[,\s]+/).filter(Boolean), store);
    return json(200, resumen);
  } catch (e) {
    console.error("[procesos-sync]", e);
    return json(500, { error: "Error interno: revisa los registros de la función" });
  }
});
