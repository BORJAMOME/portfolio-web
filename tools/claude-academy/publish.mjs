/* ═══════════════════════════════════════════════
   tools/claude-academy/publish.mjs: sube el contenido del Manual de Claude a tu Supabase
   ─────────────────────────────────────────────────
     node tools/claude-academy/publish.mjs --dry-run     valida y cuenta, sin tocar la base
     node tools/claude-academy/publish.mjs               valida y sube (upsert por id)
     node tools/claude-academy/publish.mjs --prune       además borra de la base lo que ya no está en los archivos
   Usa el MISMO acceso que la web (como tools/second-brain/publish.mjs): inicia sesión como tú con la clave pública y
   escribe a través de las políticas RLS de supabase/claude-manual.sql. No hace falta la service_role.
   Credenciales: SOLO por variables de entorno, nunca en archivos ni argumentos.
     CM_PASSWORD   contraseña del usuario del área privada (obligatoria, salvo --dry-run)
     CM_EMAIL      opcional; por defecto el OWNER_EMAIL de area-privada.js
     CM_SUPABASE_URL / CM_SUPABASE_KEY   opcionales; por defecto los de area-privada.js
   Si el contenido no valida (tools/claude-academy/validate.mjs), no sube nada.
   ═══════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadContent, toRows } from './load.mjs';
import { validate } from './validate.mjs';

function fromShell(name) {
  const m = new RegExp(`var ${name} = '([^']+)'`).exec(readFileSync(join(ROOT, 'area-privada.js'), 'utf8'));
  return m ? m[1] : null;
}

export async function publishRows(rows, { prune = false, env = process.env, fetchImpl = fetch, log = () => {} } = {}) {
  const url = (env.CM_SUPABASE_URL || fromShell('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = env.CM_SUPABASE_KEY || fromShell('SUPABASE_KEY');
  const email = env.CM_EMAIL || fromShell('OWNER_EMAIL');
  const password = env.CM_PASSWORD;
  if (!url || !key || !email) throw new Error('Falta la URL, la clave pública o el email de Supabase.');
  if (!password) throw new Error('Define la variable de entorno CM_PASSWORD (la contraseña del área privada). No se guarda en ningún archivo.');
  const j = async (r) => { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return {}; } };
  const auth = await fetchImpl(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const a = await j(auth);
  if (!auth.ok || !a.access_token) throw new Error(`Inicio de sesión rechazado (HTTP ${auth.status}).`);
  const headers = { apikey: key, Authorization: `Bearer ${a.access_token}`, 'Content-Type': 'application/json' };
  let sent = 0;
  for (let i = 0; i < rows.length; i += 40) {
    const chunk = rows.slice(i, i + 40);
    const r = await fetchImpl(`${url}/rest/v1/cm_docs?on_conflict=id`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk) });
    if (!r.ok) { const d = await j(r); throw new Error(`La base rechazó la subida (HTTP ${r.status}${d.code ? `, ${d.code}` : ''}). ¿Ejecutaste supabase/claude-manual.sql?`); }
    sent += chunk.length; log(`  subidas ${sent}/${rows.length}`);
  }
  let pruned = 0;
  if (prune) {
    const r = await fetchImpl(`${url}/rest/v1/cm_docs?select=id&limit=5000`, { headers });
    if (!r.ok) throw new Error(`No se pudo leer la base para podar (HTTP ${r.status}).`);
    const keep = new Set(rows.map((x) => x.id)), stale = (await j(r)).map((x) => x.id).filter((id) => !keep.has(id));
    for (const id of stale) {
      const d = await fetchImpl(`${url}/rest/v1/cm_docs?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      if (!d.ok) throw new Error(`No se pudo borrar «${id}» (HTTP ${d.status}).`);
      pruned++; log(`  borrado ${id}`);
    }
  }
  return { sent, pruned };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), dry = args.includes('--dry-run'), prune = args.includes('--prune');
  try {
    const { data, files, hasLocal } = await loadContent();
    files.forEach((f) => console.log('· ' + f));
    if (!hasLocal) console.log('· (no hay .claude-academy/: solo se publica la semilla)');
    const v = await validate(data);
    v.warns.forEach((w) => console.log('⚠ ' + w));
    if (v.errors.length) { v.errors.forEach((e) => console.error('✗ ' + e)); console.error('\n✗ El contenido no valida: no se sube nada.'); process.exit(1); }
    const rows = toRows(data);
    console.log(`${rows.length} documentos: ${data.BLOCKS.length} bloques, ${data.TOPICS.length} fichas, ${data.COURSES.length} cursos, ${data.GLOSS.length} términos, ${data.LOG.length} registros.`);
    if (dry) { console.log('Simulacro: no se ha tocado la base.'); process.exit(0); }
    const r = await publishRows(rows, { prune, log: console.log });
    console.log(`✓ Publicado: ${r.sent} documentos${prune ? `, ${r.pruned} borrados` : ''}. Recarga el manual en el área privada (los datos se cachean 5 min).`);
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
