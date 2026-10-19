// ═══════════════════════════════════════════════
// supabase/functions/kanban-ia: IA del Centro de trabajo (Hoy)
// ───────────────────────────────────────────────
// La llama la página con el token de sesión de un miembro. Se despliega con --no-verify-jwt:
// la comprobación de miembro la hace ella (mismo criterio que interview-intel).
// Acciones: estado · desglosar · siguiente_paso · plan_dia · capturar. Solo PROPONE:
// la web enseña la propuesta y no guarda nada sin confirmación.
//
// Secretos (supabase secrets set …; ver README.md):
//   KB_AI_PROVIDER        off (por defecto: la web oculta los botones de IA) | claude (de pago) | mock (simulado)
//   ANTHROPIC_API_KEY     clave de la API de Claude (la misma que usa interview-intel)
//   KB_MODEL              modelo (por defecto claude-opus-5-5)
//   KB_MAX_CALLS_PER_DAY  tope diario de llamadas (por defecto 30)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.
// ═══════════════════════════════════════════════
import { ClaudeProvider, type KanbanAI, MockProvider } from "./ai.ts";
import { makeHandler } from "./handler.ts";

const env = (k: string, d = "") => Deno.env.get(k)?.trim() || d;
const SUPABASE_URL = env("SUPABASE_URL"), SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const admin = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function isMember(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!u.ok) return false;
  const { id } = await u.json();
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  const m = await fetch(`${SUPABASE_URL}/rest/v1/members?select=user_id&user_id=eq.${id}`, { headers: admin });
  return m.ok && (await m.json()).length > 0;
}

function provider(): KanbanAI | null {
  const p = env("KB_AI_PROVIDER", "off");
  if (p === "claude") return env("ANTHROPIC_API_KEY") ? new ClaudeProvider(env("ANTHROPIC_API_KEY"), env("KB_MODEL", "claude-opus-5-5")) : null;
  if (p === "mock") return new MockProvider();
  return null;
}

const usage = {
  async read() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/kb_ajustes?select=valor&clave=eq.ia_uso`, { headers: admin });
    return r.ok ? ((await r.json())[0]?.valor ?? null) : null;
  },
  async write(v: { fecha: string; n: number }) {
    await fetch(`${SUPABASE_URL}/rest/v1/kb_ajustes?on_conflict=clave`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ clave: "ia_uso", valor: v, updated_at: new Date().toISOString() }),
    });
  },
};

const max = Number(env("KB_MAX_CALLS_PER_DAY", "30"));
Deno.serve(makeHandler({
  isMember, ai: provider(), usage,
  maxPerDay: Number.isFinite(max) && max >= 0 ? max : 30,
  today: () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date()),
}));
