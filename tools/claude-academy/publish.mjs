/* ═══════════════════════════════════════════════
   tools/claude-academy/publish.mjs: sube el contenido del Manual de Claude a tu Supabase
   ─────────────────────────────────────────────────
     node tools/claude-academy/publish.mjs --dry-run     valida y enseña qué contrastar con la fuente (sin red, sin contraseña)
     node tools/claude-academy/publish.mjs --diff        además compara con la base (nuevas / cambiadas / iguales) y NO escribe
     node tools/claude-academy/publish.mjs               valida y sube (upsert por id)
     node tools/claude-academy/publish.mjs --prune --yes además borra de la base lo que ya no está en los archivos (sin --yes se niega)
   Usa el MISMO acceso que la web (como tools/second-brain/publish.mjs): inicia sesión como tú con la clave pública y
   escribe a través de las políticas RLS de supabase/claude-manual.sql. No hace falta la service_role.
   Contraseña: variable de entorno CM_PASSWORD o, mejor, el prompt que sale al ejecutarlo en tu terminal (no se muestra ni queda
   en el historial). Sin terminal interactivo (p. ej. dentro de una sesión de Claude Code) y sin CM_PASSWORD, no sube: es a propósito.
     CM_EMAIL      opcional; por defecto el OWNER_EMAIL de area-privada.js
     CM_SUPABASE_URL / CM_SUPABASE_KEY   opcionales; por defecto los de area-privada.js
   Si el contenido no valida (tools/claude-academy/validate.mjs), no sube nada.
   ═══════════════════════════════════════════════ */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { ROOT, loadContent, toRows } from './load.mjs';
import { validate } from './validate.mjs';
import { riesgos, cargarDossiers, formatear } from './riesgos.mjs';

function fromShell(name) {
  const m = new RegExp(`var ${name} = '([^']+)'`).exec(readFileSync(join(ROOT, 'area-privada.js'), 'utf8'));
  return m ? m[1] : null;
}

const j = async (r) => { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return {}; } };

async function login(env, fetchImpl) {
  const url = (env.CM_SUPABASE_URL || fromShell('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = env.CM_SUPABASE_KEY || fromShell('SUPABASE_KEY');
  const email = env.CM_EMAIL || fromShell('OWNER_EMAIL');
  const password = env.CM_PASSWORD;
  if (!url || !key || !email) throw new Error('Falta la URL, la clave pública o el email de Supabase.');
  if (!password) throw new Error('Falta la contraseña: ejecuta el comando en tu terminal (te la pedirá sin mostrarla) o define CM_PASSWORD. No se guarda en ningún archivo.');
  const auth = await fetchImpl(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const a = await j(auth);
  if (!auth.ok || !a.access_token) throw new Error(`Inicio de sesión rechazado (HTTP ${auth.status}).`);
  return { url, headers: { apikey: key, Authorization: `Bearer ${a.access_token}`, 'Content-Type': 'application/json' } };
}

/* JSON con las claves ordenadas: jsonb no conserva el orden, y la comparación no debe depender de él */
const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v));
const hashDoc = (d) => createHash('sha256').update(canon(d)).digest('hex');

/* Compara las filas locales con las de la base (remote: [{id, data}]). Pura. */
export function diffRows(rows, remote) {
  const r = new Map(remote.map((x) => [x.id, hashDoc(x.data)])), local = new Set(rows.map((x) => x.id));
  const out = { nuevas: [], cambiadas: [], iguales: [], soloBase: remote.map((x) => x.id).filter((id) => !local.has(id)) };
  for (const x of rows) (!r.has(x.id) ? out.nuevas : r.get(x.id) === hashDoc(x.data) ? out.iguales : out.cambiadas).push(x.id);
  return out;
}

export async function leerRemoto({ env = process.env, fetchImpl = fetch } = {}) {
  const { url, headers } = await login(env, fetchImpl);
  const r = await fetchImpl(`${url}/rest/v1/cm_docs?select=id,data&limit=5000`, { headers });
  if (!r.ok) throw new Error(`No se pudo leer la base (HTTP ${r.status}). ¿Ejecutaste supabase/claude-manual.sql?`);
  return await j(r);
}

export async function publishRows(rows, { prune = false, env = process.env, fetchImpl = fetch, log = () => {} } = {}) {
  const { url, headers } = await login(env, fetchImpl);
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

/* Pide la contraseña sin mostrarla. Solo con terminal interactivo: dentro de una sesión de Claude Code no hay, y así una
   sesión no puede publicar sola (la publicación es el paso humano). */
async function askPassword() {
  if (!process.stdin.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const write = rl._writeToOutput.bind(rl); let muted = false;
  rl._writeToOutput = (s) => { if (!muted) write(s); };
  process.stdout.write('Contraseña del área privada (no se muestra): '); muted = true;
  const pw = await new Promise((res) => rl.question('', res));
  rl.close(); process.stdout.write('\n');
  return pw;
}

const lista = (t, ids) => (ids.length ? `  ${t} (${ids.length}): ${ids.join(', ')}` : `  ${t}: 0`);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), dry = args.includes('--dry-run'), prune = args.includes('--prune'), diff = args.includes('--diff'), yes = args.includes('--yes');
  try {
    const { data, files, hasLocal } = await loadContent();
    files.forEach((f) => console.log('· ' + f));
    if (!hasLocal || !data.TOPICS.length) throw new Error('No hay contenido que publicar: crea .claude-academy/ con temas/*.js (ver claude-manual/README.md).');
    const v = await validate(data);
    v.warns.forEach((w) => console.log('⚠ ' + w));
    if (v.errors.length) { v.errors.forEach((e) => console.error('✗ ' + e)); console.error('\n✗ El contenido no valida: no se sube nada.'); process.exit(1); }
    const rows = toRows(data);
    console.log(`${rows.length} documentos: ${data.BLOCKS.length} bloques, ${data.TOPICS.length} fichas, ${data.COURSES.length} cursos, ${data.GLOSS.length} términos, ${data.LOG.length} registros.`);
    const rs = formatear(riesgos(data, cargarDossiers(data)));
    console.log(rs.length ? '\nPara contrastar con la fuente (anclado contra el dossier; ver riesgos.mjs):\n' + rs.join('\n') : '\nNada que contrastar con la fuente: todo número e identificador está en el dossier y no hay ejemplos propios ni lecturas de imagen.');
    if (dry && !diff) { console.log('\nSimulacro: no se ha tocado la base (sin red).'); process.exit(0); }
    const env = { ...process.env };
    if (!env.CM_PASSWORD) env.CM_PASSWORD = await askPassword();
    if (diff || prune) {
      const d = diffRows(rows, await leerRemoto({ env }));
      console.log('\nComparado con la base:\n' + [lista('nuevas', d.nuevas), lista('cambiadas', d.cambiadas), `  iguales: ${d.iguales.length}`, lista('solo en la base (las borraría --prune)', d.soloBase)].join('\n'));
      if (diff || dry) { console.log('\nSolo informe: no se ha escrito nada.'); process.exit(0); }
      if (prune && d.soloBase.length && !yes) throw new Error(`--prune borraría ${d.soloBase.length} documento(s) que no están en tus archivos locales. Revisa la lista y repite con --yes.`);
    }
    const r = await publishRows(rows, { prune, env, log: console.log });
    console.log(`✓ Publicado: ${r.sent} documentos${prune ? `, ${r.pruned} borrados` : ''}. Recarga el manual en el área privada (los datos se cachean 5 min).`);
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
