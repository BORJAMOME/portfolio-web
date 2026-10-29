/* ═══════════════════════════════════════════════
   tools/check-claude-academy.mjs: datos del Manual de Claude (claude-academy/)
   ─────────────────────────────────────────────────
     node tools/check-claude-academy.mjs

   Carga content.js, grafo.js, viz.js y temas/*.js en un sandbox (sin DOM, sin red) y comprueba lo que
   el navegador no avisa: identificadores únicos y estables, relaciones que apuntan a temas que existen
   (con su justificación y sin ciclos en «necesita conocer»), fuentes con URL y fecha, cursos con registro
   en el LOG, temas con su entrada de incorporación, glosario y visuales enlazados, scripts de index.html
   y que el mapa no solapa nodos ni con el manual real ni con uno sintético de 139 temas.
   Errores → salida 1. Avisos (longitudes orientativas de la skill) → solo se muestran.
   Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'claude-academy');
const errors = [], warns = [];
const err = (m) => errors.push(m), warn = (m) => warns.push(m);

/* ── scripts de index.html: existen y se cargan los de datos; los de DOM (mapa.js, app.js) solo se compilan ── */
const html = readFileSync(join(DIR, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="\.\/([^"?]+)(?:\?v=[^"]*)?"/g)].map((m) => m[1]);
const DOM = new Set(['mapa.js', 'app.js']);
const ctx = vm.createContext({});
for (const f of scripts) {
  const p = join(DIR, f);
  if (!existsSync(p)) { err(`index.html carga ${f}, que no existe`); continue; }
  const src = readFileSync(p, 'utf8');
  try { DOM.has(f) ? new vm.Script(src, { filename: f }) : vm.runInContext(src, ctx, { filename: f }); }
  catch (e) { err(`${f}: ${e.message}`); }
}
for (const f of readdirSync(join(DIR, 'temas')).filter((x) => x.endsWith('.js'))) {
  if (!scripts.includes('temas/' + f)) err(`temas/${f} no está en index.html: sus temas no se cargan`);
}
if (errors.length) { for (const e of errors) console.error('✗ ' + e); process.exit(1); }

const get = (n) => vm.runInContext(`typeof ${n} === 'undefined' ? undefined : ${n}`, ctx);
const [MANUAL, BLOCKS, COURSES, TOPICS, GLOSS, LOG, SRCKINDS, VERSTATES, RELTYPES, VIZ, CAGrafo] =
  ['MANUAL', 'BLOCKS', 'COURSES', 'TOPICS', 'GLOSS', 'LOG', 'SRCKINDS', 'VERSTATES', 'RELTYPES', 'VIZ', 'CAGrafo'].map(get);
for (const [n, v] of Object.entries({ MANUAL, BLOCKS, COURSES, TOPICS, GLOSS, LOG, SRCKINDS, VERSTATES, RELTYPES, VIZ, CAGrafo })) {
  if (v === undefined) err(`falta ${n}`);
}
if (errors.length) { for (const e of errors) console.error('✗ ' + e); process.exit(1); }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/, ISO = /^\d{4}-\d{2}-\d{2}$/;
const words = (h) => String(h).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const str = (v) => typeof v === 'string' && v.trim().length > 0;
const isoOk = (d) => ISO.test(d) && !isNaN(Date.parse(d));
const unique = (arr, what) => { const s = new Set(); for (const x of arr) { if (s.has(x)) err(`${what} repetido: ${x}`); s.add(x); } return s; };

/* ── bloques ── */
const blockIds = unique(BLOCKS.map((b) => b.id), 'bloque');
BLOCKS.forEach((b, i) => {
  if (!SLUG.test(b.id)) err(`bloque «${b.id}»: el id debe ser minúsculas, números y guiones`);
  if (b.n !== i) err(`bloque «${b.id}»: n debe ser ${i} (consecutivo desde 0), es ${b.n}`);
  if (!str(b.t) || !str(b.s)) err(`bloque «${b.id}»: faltan t o s`);
  if (!TOPICS.some((t) => t.b === b.id)) err(`bloque «${b.id}» sin temas: no se crean capítulos vacíos`);
});

/* ── cursos ── */
const courseIds = unique(COURSES.map((c) => c.id), 'curso');
for (const c of COURSES) {
  if (!SLUG.test(c.id)) err(`curso «${c.id}»: id no válido`);
  if (!str(c.t)) err(`curso «${c.id}»: falta t`);
  if (!/^https:\/\//.test(c.u || '')) err(`curso «${c.id}»: u debe ser una URL https`);
  if (!SRCKINDS[c.k]) err(`curso «${c.id}»: k «${c.k}» no es un tipo de fuente`);
  if (!isoOk(c.d || '')) err(`curso «${c.id}»: d debe ser la fecha de consulta (AAAA-MM-DD)`);
  if (!TOPICS.some((t) => (t.src || []).some((s) => s && s.c === c.id))) warn(`curso «${c.id}» sin ningún tema que lo cite (src.c)`);
  if (!LOG.some((l) => l.curso === c.id)) err(`curso «${c.id}» sin entrada en LOG (campo curso)`);
}

/* ── temas ── */
const ids = unique(TOPICS.map((t) => t.id), 'tema');
const titles = new Map();
for (const t of TOPICS) {
  const w = `tema «${t.id}»`;
  if (!SLUG.test(t.id)) err(`${w}: el id debe ser minúsculas, números y guiones`);
  if (!blockIds.has(t.b)) err(`${w}: bloque «${t.b}» no existe`);
  if (![1, 2, 3].includes(t.lvl)) err(`${w}: lvl debe ser 1, 2 o 3`);
  for (const k of ['t', 'q', 'one', 'friend', 'ex', 'key', 'viz', 'vizNote']) if (!str(t[k])) err(`${w}: falta ${k}`);
  if (!Array.isArray(t.steps) || t.steps.length < 3 || t.steps.length > 6) err(`${w}: steps debe tener de 3 a 6 pasos`);
  if (!Array.isArray(t.rec) || t.rec.length < 3 || t.rec.length > 5) err(`${w}: rec debe tener de 3 a 5 ítems`);
  for (const k of ['yes', 'no', 'conf', 'pro']) if (!Array.isArray(t[k]) || !t[k].length) err(`${w}: falta ${k}`);
  (t.conf || []).forEach((c) => { if (!str(c.t) || !str(c.d)) err(`${w}: conf necesita t y d`); });
  (t.pro || []).forEach((c) => { if (!str(c.k) || !str(c.t)) err(`${w}: pro necesita k y t`); });
  if (!t.caso || !str(t.caso.sec) || !str(t.caso.q) || !str(t.caso.html)) err(`${w}: caso necesita sec, q y html`);
  const q = t.quiz;
  if (!q || !str(q.q) || !Array.isArray(q.o) || q.o.length < 2 || !Number.isInteger(q.a) || q.a < 0 || q.a >= q.o.length || !str(q.w)) err(`${w}: quiz incompleto o con a fuera de rango`);
  if (typeof VIZ[t.viz] !== 'function') err(`${w}: no existe VIZ["${t.viz}"]`);
  if (!Array.isArray(t.kw) || t.kw.length < 2) err(`${w}: kw necesita al menos 2 palabras clave (el buscador depende de ellas)`);
  if (t.upd !== undefined && !isoOk(t.upd)) err(`${w}: upd debe ser AAAA-MM-DD`);
  if (!t.ver || !VERSTATES[t.ver.e]) err(`${w}: ver.e debe ser uno de ${Object.keys(VERSTATES).join(', ')}`);
  else if (['verificado', 'parcial'].includes(t.ver.e) && !isoOk(t.ver.d || '')) err(`${w}: un estado «${t.ver.e}» exige ver.d (fecha de contraste)`);
  if (t.lab) {
    for (const k of ['obj', 'res', 'comprobar']) if (!str(t.lab[k])) err(`${w}: lab.${k} vacío`);
    if (!Array.isArray(t.lab.pasos) || !t.lab.pasos.length || t.lab.pasos.some((p) => !str(p.h) || !str(p.w))) err(`${w}: lab.pasos necesita {h, w} en cada paso`);
    if (!Array.isArray(t.lab.antes) || !t.lab.antes.length) err(`${w}: lab.antes vacío`);
  }
  (t.ejer || []).forEach((e) => { if (!str(e.n) || !str(e.q) || !str(e.sol)) err(`${w}: ejer necesita n, q y sol (solución explicada)`); });
  /* fuentes */
  if (!Array.isArray(t.src) || !t.src.length) err(`${w}: src vacío`);
  (t.src || []).forEach((s) => {
    if (typeof s === 'string') { warn(`${w}: una fuente es solo texto; usa {t, u, k, c, d} para que se pueda trazar`); return; }
    if (!str(s.t)) err(`${w}: una fuente no tiene título`);
    if (!SRCKINDS[s.k]) err(`${w}: fuente «${s.t}»: k «${s.k}» no es un tipo válido`);
    if (s.u && !/^https:\/\//.test(s.u)) err(`${w}: fuente «${s.t}»: u debe ser https`);
    if (s.u && !isoOk(s.d || '')) err(`${w}: fuente «${s.t}»: con URL hace falta la fecha de consulta d`);
    if (s.k === 'oficial' && !s.u) err(`${w}: una fuente oficial necesita URL`);
    if (s.c && !courseIds.has(s.c)) err(`${w}: fuente «${s.t}»: el curso «${s.c}» no existe en COURSES`);
  });
  /* relaciones */
  if (!Array.isArray(t.rel)) err(`${w}: rel debe existir (puede ir vacío)`);
  const seen = new Set();
  (t.rel || []).forEach((r) => {
    if (!RELTYPES[r.t]) err(`${w}: relación de tipo «${r.t}» desconocido`);
    if (!ids.has(r.a)) err(`${w}: relación con «${r.a}», que no existe`);
    if (r.a === t.id) err(`${w}: se relaciona consigo mismo`);
    if (!str(r.w)) err(`${w}: la relación ${r.t} → ${r.a} no explica por qué existe (w)`);
    const k = r.t + '>' + r.a; if (seen.has(k)) err(`${w}: relación repetida ${k}`); seen.add(k);
    const other = TOPICS.find((x) => x.id === r.a);
    if (RELTYPES[r.t]?.s && other && (other.rel || []).some((x) => x.t === r.t && x.a === t.id)) warn(`${w}: «${r.t}» es simétrica y también está declarada en «${r.a}»`);
  });
  /* títulos únicos (un concepto, una ficha) */
  const nt = norm(t.t); if (titles.has(nt)) err(`${w}: el título coincide con el de «${titles.get(nt)}»: una sola ficha por concepto`); titles.set(nt, t.id);
  /* longitudes orientativas (REVISION_PEDAGOGICA) */
  if (words(t.one) > 35) warn(`${w}: one tiene ${words(t.one)} palabras (orientativo ≤ 35)`);
  if (words(t.key) > 40) warn(`${w}: key tiene ${words(t.key)} palabras (orientativo ≤ 40)`);
  if (words(t.friend) < 40 || words(t.friend) > 80) warn(`${w}: friend tiene ${words(t.friend)} palabras (orientativo 40-80)`);
}
const cyc = CAGrafo.build({ TOPICS, BLOCKS, COURSES, RELTYPES }).cycles();
if (cyc.length) err(`ciclo en «necesita conocer» entre: ${cyc.join(', ')}`);
if (/<script|javascript:|\son\w+\s*=/i.test(JSON.stringify([TOPICS, GLOSS, COURSES, LOG, MANUAL]))) err('el contenido incluye <script>, javascript: o un manejador on…=');

/* ── glosario y registro ── */
unique(GLOSS.map((g) => norm(g.k)), 'término del glosario');
GLOSS.forEach((g) => { if (!ids.has(g.t)) err(`glosario «${g.k}»: el tema «${g.t}» no existe`); if (!str(g.d)) err(`glosario «${g.k}»: falta la definición`); });
LOG.forEach((l, i) => {
  if (!isoOk(l.d || '') || !str(l.r)) err(`LOG[${i}]: necesita d (AAAA-MM-DD) y r`);
  [...(l.nuevo || []), ...(l.mod || [])].forEach((x) => { if (!ids.has(x)) err(`LOG[${i}]: el tema «${x}» no existe`); });
  if (l.curso && !courseIds.has(l.curso)) err(`LOG[${i}]: el curso «${l.curso}» no existe`);
});
for (const t of TOPICS) if (!LOG.some((l) => (l.nuevo || []).includes(t.id))) err(`tema «${t.id}» sin entrada «nuevo» en LOG: no hay registro de cuándo se incorporó`);

/* ── mapa: ningún nodo sobre otro ── */
function minDist(G, expanded) {
  const L = CAGrafo.layout(G, { expanded });
  const pts = Object.entries(L.pos);
  let best = Infinity, pair = '';
  for (let i = 0; i < pts.length; i++) {
    const [ka, a] = pts[i];
    if (![a.x, a.y].every(Number.isFinite)) return { d: NaN, pair: ka };
    for (let j = i + 1; j < pts.length; j++) {
      const [kb, b] = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < best) { best = d; pair = `${ka} ↔ ${kb}`; }
    }
  }
  return { d: best, pair, n: pts.length };
}
const MIN = 58;
const real = CAGrafo.build({ TOPICS, BLOCKS, COURSES, RELTYPES });
const r1 = minDist(real, undefined);
if (!(r1.d >= MIN)) err(`mapa real: nodos demasiado juntos (${r1.d.toFixed(1)} px entre ${r1.pair})`);
/* manual sintético grande: 8 bloques de tamaños muy desiguales y 3 cursos */
const sizes = [30, 12, 8, 25, 3, 1, 40, 20];
const sb = sizes.map((_, i) => ({ id: 'b' + i, n: i, t: 'Bloque ' + i, s: '' }));
const st = sizes.flatMap((n, bi) => Array.from({ length: n }, (_, k) => ({ id: `b${bi}-t${k}`, b: 'b' + bi, t: 'Tema ' + bi + '.' + k, rel: [], src: k % 7 === 0 ? [{ t: 'x', k: 'oficial', c: 'c' + (bi % 3) }] : [] })));
const sc = [0, 1, 2].map((i) => ({ id: 'c' + i, t: 'Curso ' + i }));
const big = CAGrafo.build({ TOPICS: st, BLOCKS: sb, COURSES: sc, RELTYPES });
const allOpen = Object.fromEntries(sb.map((b) => [b.id, true]));
for (const [name, exp] of [['todo desplegado', allOpen], ['plegado por defecto', undefined]]) {
  const r = minDist(big, exp);
  if (!(r.d >= MIN)) err(`mapa sintético (${st.length} temas, ${name}): nodos demasiado juntos (${r.d.toFixed(1)} px entre ${r.pair})`);
}

/* ── resultado ── */
for (const w of warns) console.log('⚠ ' + w);
if (errors.length) { for (const e of errors) console.error('✗ ' + e); console.error(`\n✗ ${errors.length} problema(s) en claude-academy/.`); process.exit(1); }
console.log(`✓ claude-academy: ${TOPICS.length} temas, ${BLOCKS.length} bloques, ${COURSES.length} cursos, ${real.edges.length} relaciones, ${GLOSS.length} términos; mapa sin solapes (real y sintético de ${st.length} temas).`);
