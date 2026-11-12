/* ═══════════════════════════════════════════════
   tools/manual-estudio/publish.mjs: sube el «Manual de estudio» a tu Supabase (tabla me_docs, privada con RLS)
   ─────────────────────────────────────────────────
     node tools/manual-estudio/publish.mjs --src <carpeta> --dry-run   valida y enseña qué subiría (sin red ni contraseña)
     node tools/manual-estudio/publish.mjs --src <carpeta>             valida y sube (upsert por id)
     node tools/manual-estudio/publish.mjs --src <carpeta> --prune --yes   además borra de la base lo que ya no está en los archivos
   Origen del contenido: una carpeta LOCAL fuera de este repositorio con content.js, capitulos.js e indicadores.js, tal como
   los genera su build.py. Se indica con --src <ruta> o con la variable ME_SRC (no hay ruta por defecto: el nombre de la
   carpeta no debe quedar en este repositorio público).
   Usa el MISMO acceso que la web: inicia sesión como tú con la clave pública y escribe a través de las políticas RLS de
   supabase/manual-estudio.sql. No hace falta la service_role.
   En una terminal interactiva pide el correo y la contraseña del área privada (la contraseña no se muestra).
   Sin terminal interactiva, usa ME_EMAIL y ME_PASSWORD.
   ═══════════════════════════════════════════════ */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_BYTES = 380000;   // la tabla admite < 400000 por documento

function fromShell(name, source = readFileSync(join(ROOT, 'area-privada.js'), 'utf8')) {
  const m = new RegExp(`var ${name} = '([^']+)'`).exec(source);
  return m ? m[1] : null;
}

function configuredOwner(env) {
  const url = fromShell('SUPABASE_URL');
  if (env.ME_SUPABASE_URL && env.ME_SUPABASE_URL.replace(/\/$/, '') !== url) return '';
  const owner = fromShell('OWNER_EMAIL');
  if (owner) return owner;
  try {
    const committed = execFileSync('git', ['show', 'HEAD:area-privada.js'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
    return fromShell('SUPABASE_URL', committed) === url ? fromShell('OWNER_EMAIL', committed) || '' : '';
  } catch {
    return '';
  }
}
const j = async (r) => { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return {}; } };
const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'x';

/* Carga los tres archivos de datos (scripts de navegador con «var …») en un contexto aislado.
   glosario.js es opcional: si existe, aporta el glosario completo (GFAM, SIGLAS, GTERMS, GVIS, GMERGE). */
export function loadSource(src) {
  const files = ['content.js', 'capitulos.js', 'indicadores.js'].map((f) => join(src, f));
  files.forEach((f) => { if (!existsSync(f)) throw new Error(`No encuentro ${f}. Ejecuta antes «python build.py» en la carpeta del manual.`); });
  const code = files.map((f) => readFileSync(f, 'utf8')).join('\n;\n') +
    '\n;({ MANUAL, BLOCKS, GLOSS, TOPICS, BOOK, INDIC: typeof INDIC === "undefined" ? [] : INDIC, INDFAM: typeof INDFAM === "undefined" ? [] : INDFAM })';
  const d = vm.runInNewContext(code, {}, { timeout: 5000 });
  const g = join(src, 'glosario.js');
  d.GLOSARIO = null;
  if (existsSync(g)) {
    const sb = {}; sb.window = sb;
    vm.runInNewContext(readFileSync(g, 'utf8'), sb, { timeout: 5000 });
    d.GLOSARIO = { GFAM: sb.GFAM || [], SIGLAS: sb.SIGLAS || [], GTERMS: sb.GTERMS || [], GVIS: sb.GVIS || {}, GMERGE: sb.GMERGE || {} };
    d.GLOSARIO.IMG = svgImages(src, d.GLOSARIO.GVIS);
  }
  return d;
}

/* Los esquemas del glosario son SVG que en la web local toman los colores del tema por CSS.
   El área privada no admite SVG en línea (clean() lo descarta), así que cada esquema se publica como
   imagen autónoma (data:image/svg+xml): fondo blanco y colores del tema claro, resueltos aquí a partir de
   styles.css (:root) y de las reglas .gvis svg / .gv-* de libro.css. Una imagen SVG no ejecuta scripts. */
export function svgImages(src, GVIS) {
  const read = (f) => (existsSync(join(src, f)) ? readFileSync(join(src, f), 'utf8') : '');
  const rootBlock = (/:root\s*\{([^}]*)\}/.exec(read('styles.css')) || [])[1] || '';
  const vars = {}; rootBlock.replace(/--([\w-]+)\s*:\s*([^;]+);/g, (m, k, v) => { vars[k] = v.trim(); return m; });
  const css = read('libro.css').replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '')
    .split('\n').filter((l) => /^\.(gvis svg|gv-)/.test(l.trim()))
    .map((l) => l.trim().replace(/\.gvis svg /g, '').replace(/var\(--([\w-]+)\)/g, (m, k) => vars[k] || '#000')).join('');
  const out = {};
  Object.keys(GVIS).forEach((id) => {
    const svg = GVIS[id] && GVIS[id].svg; if (!svg) return;
    const doc = svg.replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(/(<svg[^>]*>)/, `$1<style>text{font-family:'Segoe UI',system-ui,sans-serif}${css}</style><rect width="100%" height="100%" fill="#FFFFFF"/>`);
    out[id] = 'data:image/svg+xml;base64,' + Buffer.from(doc, 'utf8').toString('base64');
  });
  return out;
}

/* Parte el HTML de un capítulo en trozos (uno por apartado de primer nivel y el anexo) y reparte sus apartados */
export function chunksOf(tid, book) {
  const parts = String(book.html).split(/(?=<h3 class="s1"|<details class="note")/).filter(Boolean);
  return parts.map((html, i) => {
    const secs = book.secs.filter((s) => html.indexOf(`id="${s.id}"`) > -1);
    return { t: tid, i, html, secs };
  });
}

export function toRows(d) {
  const rows = [];
  const M = d.MANUAL;
  rows.push({ id: 'meta:manual', kind: 'meta', pos: 0, data: { title: M.title, edition: M.edition, heroTitle: M.heroTitle, lead: M.lead, sources: M.sources } });
  d.BLOCKS.forEach((b, i) => rows.push({ id: `block:${b.id}`, kind: 'block', pos: i, data: b }));
  d.TOPICS.forEach((t, i) => {
    rows.push({ id: `topic:${t.id}`, kind: 'topic', pos: i, data: t });
    chunksOf(t.id, d.BOOK[t.id]).forEach((c) => rows.push({ id: `chunk:${t.id}:${String(c.i).padStart(3, '0')}`, kind: 'chunk', pos: i * 1000 + c.i, data: c }));
  });
  const seen = {};
  d.GLOSS.forEach((g, i) => { let k = slugify(g.k); while (seen[k]) k += '-2'; seen[k] = 1; rows.push({ id: `gloss:${k}`, kind: 'gloss', pos: i, data: g }); });
  d.INDFAM.forEach((f, i) => rows.push({ id: `fam:${f.id}`, kind: 'fam', pos: i, data: f }));
  d.INDIC.forEach((x, i) => rows.push({ id: `indic:${x.id}`, kind: 'indic', pos: i, data: x }));
  const G = d.GLOSARIO;
  if (G && G.GTERMS.length) {
    rows.push({ id: 'gconf:main', kind: 'gconf', pos: 0, data: { famT: G.GMERGE.famT || {}, famK: G.GMERGE.famK || {}, dup: G.GMERGE.dup || {} } });
    G.GFAM.forEach((f, i) => rows.push({ id: `gfam:${f.id}`, kind: 'gfam', pos: i, data: f }));
    G.SIGLAS.forEach((r, i) => rows.push({ id: `gsig:${String(i).padStart(3, '0')}`, kind: 'gsig', pos: i, data: r }));
    G.GTERMS.forEach((g, i) => rows.push({ id: `gterm:${g.id}`, kind: 'gterm', pos: i, data: g }));
    Object.keys(G.GVIS).forEach((id, i) => {
      const v = G.GVIS[id];
      rows.push({ id: `gvis:${id}`, kind: 'gvis', pos: i, data: { id, t: v.t, alt: v.alt, img: G.IMG[id] || null, html: v.svg ? null : (v.html || null) } });
    });
  }
  return rows;
}

export function validate(d, rows) {
  const errors = [];
  if (!d.MANUAL || !d.MANUAL.title) errors.push('Falta MANUAL.title en content.js.');
  d.TOPICS.forEach((t) => {
    if (!SLUG.test(t.id)) errors.push(`Capítulo con id no válido: ${t.id}`);
    if (!d.BOOK[t.id]) errors.push(`Falta el texto del capítulo ${t.id} en capitulos.js.`);
  });
  d.BLOCKS.forEach((b) => { if (!SLUG.test(b.id)) errors.push(`Bloque con id no válido: ${b.id}`); });
  d.INDIC.forEach((x) => { if (!SLUG.test(x.id)) errors.push(`Indicador con id no válido: ${x.id}`); });
  d.INDFAM.forEach((f) => { if (!SLUG.test(f.id)) errors.push(`Familia con id no válido: ${f.id}`); });
  const G = d.GLOSARIO;
  if (G && G.GTERMS.length) {
    const fam = new Set(G.GFAM.map((f) => f.id)), ent = new Set(G.GTERMS.map((g) => g.id));
    G.GFAM.forEach((f) => { if (!SLUG.test(f.id)) errors.push(`Familia del glosario con id no válido: ${f.id}`); if (f.v && !G.GVIS[f.v]) errors.push(`Familia ${f.id}: no existe el esquema ${f.v}`); });
    G.GTERMS.forEach((g) => {
      if (!SLUG.test(g.id)) errors.push(`Entrada del glosario con id no válido: ${g.id}`);
      if (!fam.has(g.fam)) errors.push(`Entrada ${g.id}: familia desconocida ${g.fam}`);
      if (g.v && !G.GVIS[g.v]) errors.push(`Entrada ${g.id}: no existe el esquema ${g.v}`);
      (g.cf || []).forEach((c) => { if (!ent.has(c[0])) errors.push(`Entrada ${g.id}: «se confunde con» apunta a ${c[0]}, que no existe`); });
      (g.s || []).forEach((s) => { if (!/^https:\/\//.test(s[1])) errors.push(`Entrada ${g.id}: fuente sin https (${s[1]})`); });
      (g.m || []).forEach((m) => { if (!d.BOOK[m[0]] || !d.BOOK[m[0]].secs.some((s) => s.id === m[1])) errors.push(`Entrada ${g.id}: el apartado ${m[0]}/${m[1]} no existe`); });
    });
    G.SIGLAS.forEach((r) => { if (r.g && !ent.has(r.g)) errors.push(`Sigla ${r.s}: la entrada ${r.g} no existe`); });
    Object.keys(G.GVIS).forEach((id) => { if (!SLUG.test(id)) errors.push(`Esquema con id no válido: ${id}`); if (G.GVIS[id].svg && !G.IMG[id]) errors.push(`Esquema ${id}: no se pudo convertir en imagen`); });
  }
  const ids = new Set();
  rows.forEach((r) => {
    if (ids.has(r.id)) errors.push(`Id repetido: ${r.id}`); ids.add(r.id);
    const n = Buffer.byteLength(JSON.stringify(r.data), 'utf8');
    if (n > MAX_BYTES) errors.push(`${r.id} ocupa ${n} bytes (máximo ${MAX_BYTES}).`);
  });
  return errors;
}

async function login(env) {
  const url = (env.ME_SUPABASE_URL || fromShell('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = env.ME_SUPABASE_KEY || fromShell('SUPABASE_KEY');
  const email = env.ME_EMAIL?.trim();
  const password = env.ME_PASSWORD;
  if (!url || !key) throw new Error('Falta la URL o la clave pública de Supabase. Revisa area-privada.js o define ME_SUPABASE_URL y ME_SUPABASE_KEY.');
  if (!email) throw new Error('Falta el correo del área privada. Ejecuta el comando en una terminal interactiva o define ME_EMAIL.');
  if (!password) throw new Error('Falta la contraseña: ejecuta el comando en tu terminal (te la pedirá sin mostrarla) o define ME_PASSWORD.');
  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const a = await j(auth);
  if (!auth.ok || !a.access_token) throw new Error(`Inicio de sesión rechazado (HTTP ${auth.status}).`);
  return { url, headers: { apikey: key, Authorization: `Bearer ${a.access_token}`, 'Content-Type': 'application/json' } };
}

async function publish(rows, { prune, env, log }) {
  const { url, headers } = await login(env);
  let sent = 0;
  for (let i = 0; i < rows.length; i += 25) {
    const chunk = rows.slice(i, i + 25);
    const r = await fetch(`${url}/rest/v1/me_docs?on_conflict=id`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk) });
    if (!r.ok) { const d = await j(r); throw new Error(`La base rechazó la subida (HTTP ${r.status}${d.code ? `, ${d.code}` : ''}). ¿Ejecutaste supabase/manual-estudio.sql?`); }
    sent += chunk.length; log(`  subidos ${sent}/${rows.length}`);
  }
  let pruned = 0;
  if (prune) {
    const r = await fetch(`${url}/rest/v1/me_docs?select=id&limit=10000`, { headers });
    if (!r.ok) throw new Error(`No se pudo leer la base para podar (HTTP ${r.status}).`);
    const keep = new Set(rows.map((x) => x.id)), stale = (await j(r)).map((x) => x.id).filter((id) => !keep.has(id));
    for (const id of stale) {
      const d = await fetch(`${url}/rest/v1/me_docs?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      if (!d.ok) throw new Error(`No se pudo borrar «${id}» (HTTP ${d.status}).`);
      pruned++; log(`  borrado ${id}`);
    }
  }
  return { sent, pruned };
}

async function askCredentials(env) {
  if (!process.stdin.isTTY || (env.ME_EMAIL?.trim() && env.ME_PASSWORD)) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const cancel = new AbortController();
  rl.once('close', () => cancel.abort());
  const options = { signal: cancel.signal };
  try {
    if (!env.ME_EMAIL?.trim()) env.ME_EMAIL = (await rl.question('Correo del área privada: ', options)).trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(env.ME_EMAIL)) {
      throw new Error('Introduce la dirección de correo con la que entras al área privada. Debe incluir @.');
    }
    if (env.ME_EMAIL && !env.ME_PASSWORD) {
      process.stdout.write('Contraseña del área privada (no se muestra): ');
      const write = rl._writeToOutput;
      rl._writeToOutput = () => {};
      try {
        env.ME_PASSWORD = await rl.question('', options);
      } finally {
        rl._writeToOutput = write;
        process.stdout.write('\n');
      }
    }
  } catch (error) {
    if (!cancel.signal.aborted) throw error;
    throw new Error('Se canceló la entrada de credenciales.');
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), dry = args.includes('--dry-run'), prune = args.includes('--prune'), yes = args.includes('--yes');
  const si = args.indexOf('--src');
  const srcArg = si > -1 ? args[si + 1] : process.env.ME_SRC;
  if (!srcArg) { console.error('✗ Indica la carpeta del manual: --src <ruta> (o la variable ME_SRC).'); process.exit(1); }
  const src = resolve(srcArg);
  try {
    if (src.startsWith(ROOT + '\\') || src.startsWith(ROOT + '/')) throw new Error('La carpeta de origen está dentro del repositorio público: muévela fuera antes de publicar.');
    const d = loadSource(src), rows = toRows(d), errors = validate(d, rows);
    console.log(`Origen: ${src}`);
    if (errors.length) { errors.forEach((e) => console.error('✗ ' + e)); console.error('\n✗ El contenido no valida: no se sube nada.'); process.exit(1); }
    const count = (k) => rows.filter((r) => r.kind === k).length;
    const big = rows.reduce((m, r) => Math.max(m, Buffer.byteLength(JSON.stringify(r.data))), 0);
    console.log(`${rows.length} documentos: ${count('topic')} capítulos en ${count('chunk')} trozos, ${count('block')} bloques, ${count('gloss')} términos, ${count('indic')} indicadores en ${count('fam')} familias${count('gterm') ? `; glosario: ${count('gterm')} entradas, ${count('gsig')} siglas y ${count('gvis')} esquemas` : ''}. El mayor ocupa ${Math.round(big / 1024)} KB.`);
    if (dry) { console.log('\nSimulacro: no se ha tocado la base (sin red).'); process.exit(0); }
    if (prune && !yes) throw new Error('--prune borra de la base lo que no esté en tus archivos. Repite con --yes si es lo que quieres.');
    const env = { ...process.env };
    if (!env.ME_EMAIL?.trim()) env.ME_EMAIL = configuredOwner(env);
    await askCredentials(env);
    const r = await publish(rows, { prune, env, log: console.log });
    console.log(`✓ Publicado: ${r.sent} documentos${prune ? `, ${r.pruned} borrados` : ''}. Recarga el manual en el área privada (los datos se cachean 5 min).`);
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
