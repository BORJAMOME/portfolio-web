/* ═══════════════════════════════════════════════
   tools/check-claude-academy.mjs: Manual de Claude (área privada → Portfolio)
   ─────────────────────────────────────────────────
     node tools/check-claude-academy.mjs

   Sin DOM, sin red y sin tocar la base:
   1. Valida el contenido (ficha de prueba de tools/claude-academy/fixtures/ + tu carpeta local .claude-academy/ si existe)
      con tools/claude-academy/validate.mjs.
   2. Comprueba el cableado: módulo registrado en area-privada.js, scripts y hoja de estilos precargados en area-privada.html,
      archivos que existen, enlace desde Portfolio.
   3. Mapa: ningún nodo sobre otro, con el manual real y con uno sintético de 139 temas.
   4. Publicador: con un fetch simulado, comprueba que inicia sesión como tú, sube con upsert por lotes, que SOLO poda con --prune
      y que no usa jamás la service_role.
   5. Dossier, riesgos contra la fuente y diff con la base (casos que se detectan y casos que no deben marcarse).
   6. Privacidad: el contenido de los cursos no está versionado (.claude-academy/ ignorada y sin archivos rastreados) y la carpeta
      pública antigua claude-academy/ no existe.
   Errores → salida 1. Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadContent, toRows } from './claude-academy/load.mjs';
import { validate } from './claude-academy/validate.mjs';
import { publishRows, diffRows, leerRemoto } from './claude-academy/publish.mjs';
import { riesgos, formatear } from './claude-academy/riesgos.mjs';
import { hashTexto, parseLecturas, dossierDir } from './claude-academy/dossier.mjs';

const errors = [];
const err = (m) => errors.push(m);
const imp = (f) => import(pathToFileURL(join(ROOT, 'claude-manual', f)).href);
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

/* 1 · contenido */
/* La ficha de prueba y el contenido real se validan POR SEPARADO: son dos manuales independientes (cada uno con su bloque 0). */
const { data } = await loadContent({ local: false, fixtures: true });
const v = await validate(data);
v.errors.forEach((m) => err('ficha de prueba: ' + m));
const { data: realData, hasLocal } = await loadContent();   // solo .claude-academy/, si existe en este equipo (en CI no existe)
if (hasLocal) {
  const rv = await validate(realData);
  rv.errors.forEach((m) => err('contenido real (.claude-academy/): ' + m));
  v.warns.push(...rv.warns.map((w) => 'real: ' + w));
}
const GR = await imp('grafo.js'), { RELTYPES } = await imp('config.js');

/* 2 · cableado */
const shell = read('area-privada.js'), html = read('area-privada.html'), portfolio = read('area-privada-portfolio.js');
if (!/claude:\s*\{\s*global:\s*'APClaude'[^}]*tab:\s*'portfolio'/.test(shell)) err("area-privada.js: falta MODULES.claude con global 'APClaude' y tab 'portfolio'");
for (const [kind, name, file] of [['module', 'claude', 'area-privada-claude.js'], ['asset', 'cm-config', 'claude-manual/config.js'], ['asset', 'cm-grafo', 'claude-manual/grafo.js'],
  ['asset', 'cm-mapa', 'claude-manual/mapa.js'], ['asset', 'cm-viz', 'claude-manual/viz.js'], ['asset', 'cm-css', 'css/claude-manual.css']]) {
  const m = new RegExp(`<link rel="prefetch"[^>]*href="\\./${file.replace(/[./]/g, '\\$&')}(\\?v=[^"]*)?"[^>]*data-ap-${kind}="${name}"`).exec(html);
  if (!m) err(`area-privada.html: falta <link rel="prefetch" … data-ap-${kind}="${name}"> hacia ${file}`);
  if (!existsSync(join(ROOT, file))) err(`no existe ${file}`);
}
if (!/href:\s*'#\/claude'/.test(portfolio)) err("area-privada-portfolio.js: falta el enlace a '#/claude' (Manuales privados)");
if (!existsSync(join(ROOT, 'supabase', 'claude-manual.sql'))) err('falta supabase/claude-manual.sql');
if (/\sstyle=["']|setAttribute\(\s*['"]style['"]/.test(read('area-privada-claude.js') + read('claude-manual/mapa.js') + read('claude-manual/viz.js'))) err('hay atributos style="" en el módulo: la CSP del área privada los bloquea (usa clases de css/claude-manual.css)');

/* 3 · mapa sin solapes */
function minDist(G, expanded) {
  const L = GR.layout(G, { expanded }), pts = Object.entries(L.pos);
  let best = Infinity, pair = '';
  for (let i = 0; i < pts.length; i++) {
    const [ka, a] = pts[i];
    if (![a.x, a.y].every(Number.isFinite)) return { d: NaN, pair: ka };
    for (let j = i + 1; j < pts.length; j++) { const [kb, b] = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d < best) { best = d; pair = `${ka} ↔ ${kb}`; } }
  }
  return { d: best, pair };
}
const MIN = 58, real = GR.build({ TOPICS: data.TOPICS, BLOCKS: data.BLOCKS, COURSES: data.COURSES, RELTYPES });
const r1 = minDist(real, undefined);
if (!(r1.d >= MIN)) err(`mapa de la ficha de prueba: nodos demasiado juntos (${r1.d.toFixed(1)} px entre ${r1.pair})`);
if (hasLocal) {
  const rr = minDist(GR.build({ TOPICS: realData.TOPICS, BLOCKS: realData.BLOCKS, COURSES: realData.COURSES, RELTYPES }), undefined);
  if (!(rr.d >= MIN)) err(`mapa del contenido real: nodos demasiado juntos (${rr.d.toFixed(1)} px entre ${rr.pair})`);
}
const sizes = [30, 12, 8, 25, 3, 1, 40, 20];
const sb = sizes.map((_, i) => ({ id: 'b' + i, n: i, t: 'Bloque ' + i, s: '' }));
const st = sizes.flatMap((n, bi) => Array.from({ length: n }, (_, k) => ({ id: `b${bi}-t${k}`, b: 'b' + bi, t: 'Tema ' + bi + '.' + k, rel: [], src: k % 7 === 0 ? [{ t: 'x', k: 'oficial', c: 'c' + (bi % 3) }] : [] })));
const big = GR.build({ TOPICS: st, BLOCKS: sb, COURSES: [0, 1, 2].map((i) => ({ id: 'c' + i, t: 'Curso ' + i })), RELTYPES });
for (const [name, exp] of [['todo desplegado', Object.fromEntries(sb.map((b) => [b.id, true]))], ['plegado por defecto', undefined]]) {
  const r = minDist(big, exp);
  if (!(r.d >= MIN)) err(`mapa sintético (${st.length} temas, ${name}): nodos demasiado juntos (${r.d.toFixed(1)} px entre ${r.pair})`);
}

/* 4 · publicador (fetch simulado) */
{
  const calls = [], base = { CM_PASSWORD: 'secreto-de-prueba', CM_EMAIL: 'yo@example.com', CM_SUPABASE_URL: 'https://x.supabase.co', CM_SUPABASE_KEY: 'sb_publishable_test' };
  const fake = (existing = []) => async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const ok = (b) => new Response(JSON.stringify(b), { status: 200 });
    if (url.includes('/auth/v1/token')) return ok({ access_token: 'tok' });
    if (url.includes('select=id')) return ok(existing.map((id) => ({ id })));
    return new Response('', { status: 201 });
  };
  const rows = toRows(data);
  let r = await publishRows(rows, { env: base, fetchImpl: fake() });
  const posts = calls.filter((c) => c.method === 'POST' && c.url.includes('/rest/v1/cm_docs'));
  if (r.sent !== rows.length || r.pruned !== 0) err('publicador: no subió todas las filas o podó sin --prune');
  if (calls.some((c) => c.method === 'DELETE')) err('publicador: borró sin --prune');
  if (!posts.length || posts.some((c) => !c.url.includes('on_conflict=id') || !String(c.headers.Prefer).includes('merge-duplicates'))) err('publicador: la subida no es un upsert por id');
  if (posts.some((c) => JSON.parse(c.body).length > 40)) err('publicador: lotes de más de 40 filas');
  if (calls.some((c) => /service_role/i.test(JSON.stringify(c)))) err('publicador: aparece service_role');
  if (calls.filter((c) => c.url.includes('/auth/v1/token')).length !== 1 || !calls.every((c) => c.url.includes('/auth/v1/') || c.headers.Authorization === 'Bearer tok')) err('publicador: no usa la sesión del usuario en todas las escrituras');
  calls.length = 0;
  r = await publishRows(rows, { env: base, prune: true, fetchImpl: fake(['topic:ya-no-existe', rows[0].id]) });
  const del = calls.filter((c) => c.method === 'DELETE');
  if (r.pruned !== 1 || del.length !== 1 || !del[0].url.includes('topic%3Aya-no-existe')) err('publicador: --prune no borra exactamente lo que sobra');
  let threw = false; try { await publishRows(rows, { env: { ...base, CM_PASSWORD: '' }, fetchImpl: fake() }); } catch { threw = true; }
  if (!threw) err('publicador: debería negarse a subir sin CM_PASSWORD');
}

/* 6 · dossier, riesgos contra la fuente y diff con la base */
{
  /* dossier: el hash ignora la maquetación, los ids de curso se validan y lecturas.md se interpreta */
  if (hashTexto('Hola   mundo\n') !== hashTexto(' Hola mundo')) err('dossier: el hash depende de los espacios');
  if (hashTexto('Hola mundo') === hashTexto('Hola mundos')) err('dossier: el hash no distingue textos distintos');
  let bad = false; try { dossierDir('../fuera'); } catch { bad = true; }
  if (!bad) err('dossier: acepta un id de curso con «../»');
  const lec = parseLecturas('# c\n- [imagen] (t-uno, t-dos) Un dato: 42\n- [dom] Otro dato\n- texto suelto');
  if (lec.length !== 2 || lec[0].tipo !== 'imagen' || lec[0].temas.join() !== 't-uno,t-dos' || lec[1].temas.length) err('dossier: lecturas.md mal interpretado: ' + JSON.stringify(lec));

  /* riesgos: detecta lo que no está en la fuente y NO marca lo que sí está */
  const fuente = { c1: { texto: 'Ejecuta claude --effort low y luego /usage. Ajuste effortLevel y CLAUDE_CODE_EFFORT_LEVEL. Son 15 minutos y 3,5 puntos. Archivo csv_to_json.py.', lecturas: [{ tipo: 'imagen', temas: ['t1'], t: 'dato de dibujo' }, { tipo: 'dom', temas: [], t: 'otro' }] } };
  const base = { id: 't1', t: 'T', src: [{ t: 's', k: 'oficial', u: 'https://x.es', d: '2026-10-29', c: 'c1' }], ver: { e: 'verificado', d: '2026-10-29' } };
  const T = (o) => ({ ...base, ...o });
  const go = (t, d = fuente) => riesgos({ TOPICS: [t] }, d)[0];
  let r = go(T({ one: 'Dura <b>15</b> minutos, 3,5 puntos; usa <code>claude --effort low</code>, <code>/usage</code>, <code>effortLevel</code> y <code>csv_to_json.py</code>.', key: 'k' }));
  if (r.sinAncla.length) err('riesgos: marca como sin ancla lo que sí está en la fuente: ' + JSON.stringify(r.sinAncla));
  r = go(T({ one: 'Dura 99 minutos y usa <code>--inventado</code>, <code>/nocomando</code>, <code>MI_VARIABLE_FALSA</code> y <code>fakeSetting</code>.' }));
  const vals = r.sinAncla.map((x) => x.valor).sort().join('|');
  if (vals !== '--inventado|/nocomando|99|MI_VARIABLE_FALSA|fakeSetting') err('riesgos: no detecta lo inventado: ' + vals);
  r = go(T({ ex: '<b>Ejemplo mío:</b> tarda 20 s y 40 %', code: [{ l: 'bash', t: 'x', s: 'claude --effort low\n/usage' }] }));
  if (r.sinAncla.length || !r.propios.includes('ex')) err('riesgos: un «ejemplo mío» debe quedar como propio y sin anclar: ' + JSON.stringify(r));
  if (!go(T({ one: 'x' })).verAlto || go(T({ one: 'x', ver: { e: 'parcial', d: '2026-10-29' } })).verAlto || go(T({ id: 't2', one: 'x' })).verAlto) err('riesgos: ver «verificado» + dato de imagen (solo de los temas etiquetados)');
  if (go(T({ one: 'Dura 15 minutos' }), {}).sinDossier.join() !== 'c1') err('riesgos: no avisa de un curso sin dossier');
  if (!formatear([go(T({ one: 'Dura 99 minutos' }))]).some((l) => l.includes('«99»'))) err('riesgos: formatear no enseña los problemas');
  if (formatear(riesgos({ TOPICS: [T({ one: 'x', src: [{ t: 'i', k: 'interna' }], ver: { e: 'verificado', d: '2026-10-29' } })] }, {})).length) err('riesgos: una ficha sin curso y verificada no debería dar avisos');

  /* diff: nuevas / cambiadas / iguales / solo en la base, sin depender del orden de las claves */
  const rows = [{ id: 'a', data: { x: 1, y: { p: 1, q: [1, 2] } } }, { id: 'b', data: { x: 2 } }, { id: 'c', data: { x: 3 } }];
  const remote = [{ id: 'a', data: { y: { q: [1, 2], p: 1 }, x: 1 } }, { id: 'b', data: { x: 99 } }, { id: 'z', data: {} }];
  const d = diffRows(rows, remote);
  if (d.iguales.join() !== 'a' || d.cambiadas.join() !== 'b' || d.nuevas.join() !== 'c' || d.soloBase.join() !== 'z') err('diff: resultado incorrecto ' + JSON.stringify(d));
  const calls = [], env = { CM_PASSWORD: 'secreto-de-prueba', CM_EMAIL: 'yo@example.com', CM_SUPABASE_URL: 'https://x.supabase.co', CM_SUPABASE_KEY: 'sb_publishable_test' };
  const fake = async (url, init = {}) => { calls.push({ url, method: init.method || 'GET' }); return url.includes('/auth/v1/token') ? new Response(JSON.stringify({ access_token: 't' }), { status: 200 }) : new Response(JSON.stringify(remote), { status: 200 }); };
  const rem = await leerRemoto({ env, fetchImpl: fake });
  if (rem.length !== 3 || calls.some((c) => c.method !== 'GET' && !c.url.includes('/auth/v1/token'))) err('diff: leerRemoto debe ser solo lectura');
  let nopw = false; try { await leerRemoto({ env: { ...env, CM_PASSWORD: '' }, fetchImpl: fake }); } catch { nopw = true; }
  if (!nopw) err('diff: debería pedir la contraseña');
}

/* 5 · privacidad */
{
  const ign = existsSync(join(ROOT, '.gitignore')) ? read('.gitignore') : '';
  if (!/^\/?\.claude-academy\/?\s*$/m.test(ign)) err('.gitignore: falta /.claude-academy/ (el contenido de los cursos no debe versionarse)');
  if (existsSync(join(ROOT, 'claude-academy'))) err('existe la carpeta pública claude-academy/: el manual vive solo en el área privada');
  if (existsSync(join(ROOT, 'claude-manual', 'seed'))) err('existe claude-manual/seed/: el repositorio público no debe llevar fichas del manual (solo la de prueba, en tools/claude-academy/fixtures/)');
  if (hasLocal) {   // lo que se publica en el repo no puede nombrar los temas, cursos ni bloques reales (el texto de un visual va en vizData, en la base)
    const pub = ['claude-manual/viz.js', 'claude-manual/config.js', 'area-privada-claude.js', 'css/claude-manual.css'].map((f) => [f, read(f).toLowerCase()]);
    const secrets = [...realData.TOPICS.flatMap((t) => [t.id, t.t]), ...realData.COURSES.map((c) => c.t), ...realData.BLOCKS.map((b) => b.t)].filter((x) => x && x.length > 4);
    for (const [f, txt] of pub) for (const w of secrets) if (txt.includes(w.toLowerCase())) err(`${f} menciona «${w}», que es contenido privado del manual`);
  }
  try {
    const tracked = execFileSync('git', ['ls-files', '.claude-academy', 'claude-academy'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (tracked) err('git rastrea archivos de contenido privado:\n' + tracked);
  } catch { /* sin git (copia sin repositorio): no se puede comprobar */ }
}

v.warns.forEach((w) => console.log('⚠ ' + w));
if (errors.length) { errors.forEach((e) => console.error('✗ ' + e)); console.error(`\n✗ ${errors.length} problema(s) en el Manual de Claude.`); process.exit(1); }
console.log(`✓ Manual de Claude: ${data.TOPICS.length} fichas, ${data.BLOCKS.length} bloques, ${data.COURSES.length} cursos, ${real.edges.length} relaciones, ${data.GLOSS.length} términos (${hasLocal ? 'ficha de prueba + .claude-academy/' : 'solo la ficha de prueba'}); cableado, mapa sin solapes, publicador y privacidad correctos.`);
