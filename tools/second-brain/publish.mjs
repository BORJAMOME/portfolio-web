/* ═══════════════════════════════════════════════
   tools/second-brain/publish.mjs: sube el snapshot a tu Supabase
   ─────────────────────────────────────────────────
   Usa el MISMO acceso que la web: inicia sesión como tú con la clave pública y escribe
   a través de las políticas RLS (supabase/second-brain.sql). Por tanto:
     · no hace falta la service_role (que no debe salir de Supabase);
     · sin sesión de miembro, la base rechaza la escritura.

   Credenciales: SOLO por variables de entorno, nunca en archivos ni argumentos.
     SB_PASSWORD   contraseña del usuario del área privada (obligatoria)
     SB_EMAIL      opcional; por defecto el OWNER_EMAIL de area-privada.js
     SB_SUPABASE_URL / SB_SUPABASE_KEY   opcionales; por defecto los de area-privada.js
   ═══════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fromShell(name) {
  const src = readFileSync(join(ROOT, 'area-privada.js'), 'utf8');
  const m = new RegExp(`var ${name} = '([^']+)'`).exec(src);
  return m ? m[1] : null;
}

export async function publish({ snapshot, run, env = process.env, fetchImpl = fetch }) {
  const url = (env.SB_SUPABASE_URL || fromShell('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = env.SB_SUPABASE_KEY || fromShell('SUPABASE_KEY');
  const email = env.SB_EMAIL || fromShell('OWNER_EMAIL');
  const password = env.SB_PASSWORD;
  if (!url || !key || !email) throw new Error('Falta la URL, la clave pública o el email de Supabase.');
  if (!password) throw new Error('Define la variable de entorno SB_PASSWORD (la contraseña del área privada). No se guarda en ningún archivo.');

  const j = async (r) => { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return {}; } };
  const auth = await fetchImpl(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const a = await j(auth);
  if (!auth.ok || !a.access_token) throw new Error(`Inicio de sesión rechazado (HTTP ${auth.status}).`);
  const headers = { apikey: key, Authorization: `Bearer ${a.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

  let snapshotId = null;
  if (snapshot) {
    if (snapshot.mode !== 'real') throw new Error('Solo se publican snapshots reales; los de demostración nunca se guardan en la base.');
    const r = await fetchImpl(`${url}/rest/v1/sb_snapshots?select=id`, {
      method: 'POST', headers,
      body: JSON.stringify({ generated_at: snapshot.generatedAt, mode: snapshot.mode, engine_version: snapshot.engine.version, schema_version: snapshot.schema, stats: snapshot.stats, graph: snapshot }),
    });
    const d = await j(r);
    if (!r.ok) throw new Error(`La base rechazó el snapshot (HTTP ${r.status}${d.code ? `, ${d.code}` : ''}). ¿Ejecutaste supabase/second-brain.sql?`);
    snapshotId = Array.isArray(d) && d[0] ? d[0].id : null;
  }
  const rr = await fetchImpl(`${url}/rest/v1/sb_runs`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ started_at: run.startedAt, finished_at: run.finishedAt, status: run.status, message: run.message, stats: run.stats || null, snapshot_id: snapshotId }),
  });
  if (!rr.ok) throw new Error(`No se pudo registrar el intento (HTTP ${rr.status}).`);
  return { snapshotId };
}
