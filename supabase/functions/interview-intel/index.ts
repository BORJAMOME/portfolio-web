// ═══════════════════════════════════════════════
// supabase/functions/interview-intel — preparación automática de entrevistas
// ───────────────────────────────────────────────
// Quién puede llamarla (se despliega con --no-verify-jwt; la comprobación la hace ella):
//   · pg_cron, cada 10 min, con «Authorization: Bearer <CRON_SECRET>»
//   · la página (botón «Comprobar ahora») con el token de sesión de un miembro
// Cualquier otra llamada recibe 401. Solo acepta POST {"action":"tick"} (handler.ts).
//
// Cada «tick»: detect() (barato, sin IA) y advance() (un paso de una entrevista).
//
// Secretos (supabase secrets set …; ver README.md):
//   II_AI_PROVIDER     off (por defecto: solo detecta, sin coste) | mock (simulado) | claude
//   ANTHROPIC_API_KEY  clave de la API de Claude (solo con claude)
//   II_MODEL           modelo (por defecto claude-opus-5-5)
//   II_OWN_EMAILS      tus direcciones, separadas por comas
//   II_LEAD_DAYS       días antes de la entrevista en que empieza a prepararse (14)
//   II_SCAN_DAYS       días vista en que se buscan entrevistas (30)
//   II_MAX_AI_CALLS_PER_DAY  tope diario de llamadas a la IA (8 ≈ 4 informes)
//   II_PAUSED          1 = no hace nada
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN  opcionales (gmail.readonly)
//   CRON_SECRET        el mismo del calendario (es un secreto del proyecto)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.
// ═══════════════════════════════════════════════
import { ClaudeProvider, MockProvider } from "./ai.ts";
import { GmailSource } from "./gmail.ts";
import { type Caller, json, makeHandler, safeEqual } from "./handler.ts";
import { advance, type AIProvider, type Config, detect } from "./pipeline.ts";
import { SupabaseStore } from "./store.ts";

const env = (k: string, d = "") => Deno.env.get(k)?.trim() || d;
const num = (k: string, d: number) => { const n = Number(env(k)); return Number.isFinite(n) && n >= 0 && env(k) !== "" ? n : d; };
const SUPABASE_URL = env("SUPABASE_URL"), SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY"), CRON_SECRET = env("CRON_SECRET");

async function caller(req: Request): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  if (safeEqual(token, CRON_SECRET)) return "cron";
  // token de sesión: tiene que ser un usuario válido y estar en public.members
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!u.ok) return null;
  const { id } = await u.json();
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const m = await fetch(`${SUPABASE_URL}/rest/v1/members?select=user_id&user_id=eq.${id}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  return m.ok && (await m.json()).length > 0 ? "member" : null;
}

function provider(): AIProvider | null {
  const p = env("II_AI_PROVIDER", "off");
  if (p === "claude") return env("ANTHROPIC_API_KEY") ? new ClaudeProvider(env("ANTHROPIC_API_KEY"), env("II_MODEL", "claude-opus-5-5")) : null;
  if (p === "mock") return new MockProvider();
  return null;
}

async function tick(who: Caller) {
  const config: Config = {
    ownEmails: env("II_OWN_EMAILS").split(/[,\s]+/).filter(Boolean),
    scanDays: num("II_SCAN_DAYS", 30), leadDays: num("II_LEAD_DAYS", 14),
    maxAttempts: 3, maxAiCallsPerDay: num("II_MAX_AI_CALLS_PER_DAY", 8),
    paused: env("II_PAUSED") === "1", leaseSec: 300,
  };
  if (config.paused) return json(200, { paused: true });
  const ai = provider();
  const email = env("GMAIL_REFRESH_TOKEN") && env("GMAIL_CLIENT_ID") && env("GMAIL_CLIENT_SECRET")
    ? new GmailSource({ clientId: env("GMAIL_CLIENT_ID"), clientSecret: env("GMAIL_CLIENT_SECRET"), refreshToken: env("GMAIL_REFRESH_TOKEN") }, config.ownEmails)
    : null;
  const store = new SupabaseStore(SUPABASE_URL, SERVICE_KEY);
  const base = { store, email, now: () => new Date(), config, log: (m: string) => console.warn(m) };

  const detected = await detect({ ...base, ai: ai ?? new MockProvider() });
  if (!ai) return json(200, { detected, step: { action: "ai_disabled" } });
  const job = advance({ ...base, ai });
  if (who === "member") {
    // desde la web: responde enseguida y sigue en segundo plano (la página vuelve a leer el estado)
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) { rt.waitUntil(job.catch((e) => console.error(e))); return json(202, { detected, step: { action: "background" } }); }
  }
  return json(200, { detected, step: await job });
}

Deno.serve(makeHandler({ caller, tick }));
