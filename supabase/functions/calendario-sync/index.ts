// ═══════════════════════════════════════════════
// supabase/functions/calendario-sync — Google Calendar (iCal) → public.calendar_events
// ───────────────────────────────────────────────
// Lee la «dirección secreta en formato iCal» de uno o varios calendarios de Google,
// expande los eventos recurrentes dentro de una ventana (−60 días … +365 días) y
// sustituye la caché con public.calendar_replace() en una sola transacción.
//
// Quién puede llamarla
//   · pg_cron, cada 15 min, con «Authorization: Bearer <CRON_SECRET>»
//   · la página (botón «Sincronizar ahora») con el token de sesión de un miembro
// Se despliega con --no-verify-jwt porque la comprobación la hace ella misma (abajo).
//
// Secretos (supabase secrets set …): ver README.md de esta carpeta.
//   GCAL_ICS     una línea por calendario: «nombre|https://calendar.google.com/…/basic.ics»
//   CRON_SECRET  cadena larga aleatoria, la misma que guarda el Vault para pg_cron
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.
// ═══════════════════════════════════════════════
import { parse } from "./ical.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SOURCES = (Deno.env.get("GCAL_ICS") ?? "")
  .split(/[\n,]+/).map((l) => l.trim()).filter(Boolean)
  .map((l, i) => {
    const [name, url] = l.includes("|") ? l.split("|", 2) : [i ? `calendario ${i + 1}` : "principal", l];
    return { name: name.trim(), url: url.trim() };
  });

const DAY = 86_400_000;
const PAST_DAYS = 60, FUTURE_DAYS = 365;
const CORS = {
  "Access-Control-Allow-Origin": "https://borjamora.es",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const service = (path: string, init: RequestInit = {}) =>
  fetch(SUPABASE_URL + path, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

// Comparación en tiempo constante para el secreto del cron
function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function authorized(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (safeEqual(token, CRON_SECRET)) return true;
  // token de sesión: tiene que ser un usuario válido y estar en public.members
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!u.ok) return false;
  const { id } = await u.json();
  const m = await service(`/rest/v1/members?select=user_id&user_id=eq.${encodeURIComponent(id)}`);
  return m.ok && (await m.json()).length > 0;
}

async function syncOne(src: { name: string; url: string }, winStart: Date, winEnd: Date) {
  try {
    const res = await fetch(src.url, { headers: { Accept: "text/calendar" } });
    if (!res.ok) throw new Error(`Google respondió ${res.status}`);
    const rows = parse(await res.text(), winStart, winEnd);
    const r = await service("/rest/v1/rpc/calendar_replace", {
      method: "POST",
      body: JSON.stringify({ cal: src.name, win_start: winStart.toISOString(), win_end: winEnd.toISOString(), evs: rows }),
    });
    if (!r.ok) throw new Error(`Base de datos: ${r.status} ${await r.text()}`);
    return { calendar: src.name, ok: true, events: rows.length };
  } catch (err) {
    const error = String((err as Error).message ?? err).slice(0, 500);
    await service("/rest/v1/calendar_sync?on_conflict=calendar", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ calendar: src.name, ran_at: new Date().toISOString(), ok: false, error }),
    });
    return { calendar: src.name, ok: false, error };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Solo POST" });
  if (!(await authorized(req))) return json(401, { error: "No autorizado" });
  if (!SOURCES.length) return json(500, { error: "Falta el secreto GCAL_ICS" });

  const now = Date.now();
  const winStart = new Date(now - PAST_DAYS * DAY), winEnd = new Date(now + FUTURE_DAYS * DAY);
  const results = await Promise.all(SOURCES.map((s) => syncOne(s, winStart, winEnd)));
  return json(results.every((r) => r.ok) ? 200 : 502, { results });
});
