// ═══════════════════════════════════════════════
// supabase/functions/inspiracion-meta: datos de un enlace para Color Studio · Inspiración
// ───────────────────────────────────────────────
// La llama la página con el token de sesión de un miembro (se despliega con --no-verify-jwt: la comprobación
// la hace ella, como kanban-ia). Dos acciones:
//   meta  → título, fuente, imagen representativa, fecha y descripción de UNA página (Open Graph / <title>)
//   image → los bytes de UNA imagen JPEG/PNG/WebP, para que el navegador la reduzca y la guarde en el bucket privado
// No guarda nada ni recorre enlaces: lee solo la URL que la persona pega. Muchas redes (Instagram, Pinterest…)
// bloquean estas lecturas; la web lo dice y deja completar la referencia a mano. Sin claves de terceros ni coste.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente. Guía: README.md.
// ═══════════════════════════════════════════════
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

async function resolve(host: string): Promise<string[]> {
  const [a, aaaa] = await Promise.all([
    Deno.resolveDns(host, "A").catch(() => [] as string[]),
    Deno.resolveDns(host, "AAAA").catch(() => [] as string[]),
  ]);
  return [...a, ...aaaa];
}

Deno.serve(makeHandler({ isMember, fetch, resolve }));
