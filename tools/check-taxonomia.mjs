// Comprueba los datos del atlas ferroviario contra el diccionario único (visor-ferroviario/taxonomia.js).
// Fase 1 del plan de filtros (FILTROS_ARQUITECTURA.md, sección 6, comprobaciones 1 a 4), en modo informe:
// enseña lo que no cuadra y termina bien. Con --strict termina con error si falla alguna de las comprobaciones 1 a 4.
//   node tools/check-taxonomia.mjs [--strict] [--json]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = path.join(ROOT, 'visor-ferroviario');
const T = createRequire(import.meta.url)(path.join(V, 'taxonomia.js'));
const read = f => JSON.parse(fs.readFileSync(path.join(V, f), 'utf8'));
const strict = process.argv.includes('--strict'), asJson = process.argv.includes('--json');

const servicios = read('capas/servicios.json'), rutas = read('capas/rutas.json');
const corredores = read('capas/corredores.geojson'), turismo = read('capas/turismo.json'), adif = read('capas/lineas-adif.json');

const results = [];
const check = (n, title, problems, info = []) => results.push({n, title, ok: problems.length === 0, problems, info});
const tally = (items, key) => {const m = {}; for (const x of items) {const k = key(x) ?? '(sin valor)'; m[k] = (m[k] || 0) + 1;} return m;};
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const fmt = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');

/* ── relaciones del mapa: clave `relation`, con la regla única de vigencia ── */
const cutoff = servicios.meta.cutoff;
const addDays = (iso, d) => {const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10);};
const futureFrom = addDays(cutoff, 31);  // capas.js: CUTOFF + 31 días = FUTURE_FROM
const vigente = v => v.validity && v.validity.to >= cutoff && v.validity.from < futureFrom;
const OP_BY_SOURCE = {'renfe-national': 'renfe', 'renfe-commuter': 'renfe', 'ouigo-horarios': 'ouigo'};
const marcaDeVariante = v => v.source === 'renfe-commuter' ? 'cercanias' : T.get('marca', v.published_brand)?.id || null;

const stations = new Map(Object.entries(servicios.stations));
const ambitoDe = calls => {
  const fuera = calls.map(c => stations.get(c.s)).filter(s => s && s.spain === false);
  if (!fuera.length) return 'nacional';
  return fuera.some(s => s.coordinates[0] < -6) ? 'internacional-pt' : 'internacional-fr';  // D: Portugal al oeste, Francia al este
};
const relaciones = new Map();
for (const v of servicios.variants) {
  if (!vigente(v)) continue;
  const r = relaciones.get(v.relation) || {id: v.relation, variants: []};
  r.variants.push(v); relaciones.set(v.relation, r);
}
for (const r of relaciones.values()) {
  const v = r.variants[0];
  r.op = OP_BY_SOURCE[v.source] || null;
  r.marca = marcaDeVariante(v);
  r.fam = T.familiaDe(r.marca);
  r.nuc = v.network ? T.get('nucleo', String(v.network))?.id || null : null;
  r.reg = T.regimenDe(r.marca, {origen: v.origin, destino: v.destination, nucleo: v.network ? String(v.network) : null});
  r.amb = r.variants.map(x => ambitoDe(x.calls || [])).sort().at(-1);
  r.marcas = new Set(r.variants.map(marcaDeVariante));
  r.legado = new Set(r.variants.flatMap(x => x.categories || []));
}
const rels = [...relaciones.values()];

/* ── 1. todo id de los datos existe en el diccionario ── */
{
  const p = [];
  const unknown = (what, values, ok) => {const bad = [...new Set(values)].filter(x => !ok(x)); if (bad.length) p.push(`${what}: ${bad.join(', ')}`);};
  unknown('servicios.json · marca publicada', servicios.variants.filter(v => v.source !== 'renfe-commuter').map(v => v.published_brand), x => T.get('marca', x));
  unknown('servicios.json · fuente sin operador', servicios.variants.map(v => v.source), x => OP_BY_SOURCE[x]);
  unknown('servicios.json · núcleo', servicios.variants.filter(v => v.network).map(v => String(v.network)), x => T.get('nucleo', x));
  unknown('servicios.json · categoría antigua', servicios.variants.flatMap(v => v.categories || []), x => T.legado.services[x]);
  const filas = rutas.rutas;
  unknown('rutas.json · marca', filas.filter(x => x.src !== 'cercanias').map(x => x.marca), x => T.get('marca', x));
  unknown('rutas.json · operador', filas.map(x => x.op), x => T.get('operador', x));
  unknown('rutas.json · núcleo', filas.filter(x => x.nuc).map(x => x.nuc), x => T.get('nucleo', x));
  unknown('corredores.geojson · estado', corredores.features.map(f => f.properties.status), x => T.has('estado', x));
  unknown('turismo.json · grupo', turismo.experiences.map(e => e.group), x => T.legado.tourism[x]);
  unknown('lineas-adif.json · eje RFIG', Object.keys(adif.lineas).map(T.ejeRfigDe), x => T.has('ejeRfig', x));
  const pend = T.ejeRfig.filter(e => e.pendiente).map(e => `eje ${e.id}: ${e.pendiente}`);
  check(1, 'Todo id de los datos existe en el diccionario', p, pend);
}

/* ── 2. la familia de cada relación es la de su marca: sin doble pertenencia ── */
{
  const p = rels.filter(r => !r.fam).map(r => `${r.id}: marca sin familia (${r.marca})`);
  p.push(...rels.filter(r => r.marcas.size > 1).map(r => `${r.id}: variantes de marcas distintas (${[...r.marcas].join(', ')})`));
  const dobles = rels.filter(r => [...r.legado].length > 1);
  const info = [`Modelo antiguo: ${dobles.length} relaciones vigentes están en dos categorías a la vez (${fmt(tally(dobles, r => [...r.legado].sort().join('+')))}). En el diccionario cada una tiene una sola marca.`];
  check(2, 'Cada relación tiene una sola familia, la de su marca', p, info);
}

/* ── 3. cada línea de Cercanías aparece una sola vez (núcleo + línea) ── */
{
  const keys = rutas.rutas.filter(x => x.src === 'cercanias').map(x => `${T.get('nucleo', x.nuc)?.id || x.nuc}|${x.marca}`);
  const rep = Object.entries(tally(keys, k => k)).filter(([, n]) => n > 1).map(([k, n]) => `${k} aparece ${n} veces`);
  const nucleos = new Set(keys.map(k => k.split('|')[0]));
  check(3, 'Núcleo + línea de Cercanías únicos (rutas.json)', rep, [`${keys.length} líneas en ${nucleos.size} núcleos; el diccionario tiene ${T.nucleo.length}.`]);
}

/* ── 4. las sumas por familia, régimen y ámbito dan el total ── */
{
  const p = [], info = [];
  for (const [dim, key] of [['familia', r => r.fam], ['régimen', r => r.reg], ['ámbito', r => r.amb]]) {
    const t = tally(rels, key);
    if (sum(t) !== rels.length || t['(sin valor)']) p.push(`mapa · ${dim}: la suma (${sum(t)}) no da el total (${rels.length}) o hay relaciones sin valor`);
    info.push(`Mapa, relaciones vigentes por ${dim}: ${fmt(t)} = ${sum(t)}`);
  }
  const filas = rutas.rutas.map(x => ({...x, marcaId: x.src === 'cercanias' ? 'cercanias' : T.get('marca', x.marca)?.id}));
  const tf = tally(filas, x => T.familiaDe(x.marcaId));
  if (sum(tf) !== filas.length || tf['(sin valor)']) p.push(`tabla · familia: la suma (${sum(tf)}) no da el total (${filas.length})`);
  info.push(`Tabla, filas por familia: ${fmt(tf)} = ${sum(tf)}`);
  check(4, 'La suma por familia, régimen y ámbito es igual al total', p, info);

  /* Vista previa de la comprobación 5 (fase 2): mismo número de relaciones vigentes por marca. */
  const mapa = tally(rels, r => r.marca);
  const tabla = tally(filas.filter(x => x.sem > 0), x => x.marcaId);
  const marcas = [...new Set([...Object.keys(mapa), ...Object.keys(tabla)])].sort();
  const dif = marcas.filter(m => (mapa[m] || 0) !== (tabla[m] || 0)).map(m => `${m}: mapa ${mapa[m] || 0}, tabla ${tabla[m] || 0}`);
  results.push({n: '5 (avance)', title: 'Mapa y tabla con el mismo número de relaciones por marca. Se exige en la fase 2', ok: dif.length === 0, problems: dif,
    info: [`Cortes: mapa ${cutoff}, tabla ${rutas.referencia?.semana || rutas.generado}. Filas de la tabla sin trenes en la semana de referencia: ${filas.filter(x => !(x.sem > 0)).length}.`], advisory: true});
}

/* ── salida ── */
const failed = results.filter(r => !r.ok && !r.advisory);
if (asJson) console.log(JSON.stringify(results, null, 1));
else {
  console.log(`Diccionario v${T.version} · corte del mapa ${cutoff} · ${rels.length} relaciones vigentes\n`);
  for (const r of results) {
    console.log(`${r.ok ? '✓' : r.advisory ? '·' : '✗'} ${r.n}. ${r.title}`);
    for (const x of r.problems) console.log(`    ✗ ${x}`);
    for (const x of r.info) console.log(`    ${x}`);
  }
  console.log(failed.length ? `\n${failed.length} comprobación(es) con problemas${strict ? '' : ' (modo informe: no bloquea)'}.` : '\nComprobaciones 1 a 4 correctas.');
}
process.exit(strict && failed.length ? 1 : 0);
