// Comprueba los datos del atlas ferroviario contra el diccionario único (visor-ferroviario/taxonomia.js).
// Plan de filtros (FILTROS_ARQUITECTURA.md, sección 6): comprobaciones 1 a 5 y 9, en modo informe:
// enseña lo que no cuadra y termina bien. Con --strict termina con error si falla una obligatoria (las marcadas como aviso no bloquean).
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

}

/* ── 5. mapa y tabla: mismo corte y mismas relaciones vigentes por marca ──
   iryo queda fuera mientras su trazado sea «sin-trazado» y Cercanías hasta la fase 4 (el mapa solo trae el ancho métrico).
   Es obligatoria cuando los dos archivos tienen el mismo corte; si no, se informa y no bloquea. */
{
  const corteTabla = rutas.referencia?.semana;
  const fuera = new Set(['iryo', 'cercanias']);
  const mapa = tally(rels.filter(r => !fuera.has(r.marca)), r => r.marca);
  const tabla = tally(rutas.rutas.filter(x => x.sem > 0 && !fuera.has(x.tx?.marca)), x => x.tx?.marca);
  const marcas = [...new Set([...Object.keys(mapa), ...Object.keys(tabla)])].sort();
  const dif = marcas.filter(m => (mapa[m] || 0) !== (tabla[m] || 0)).map(m => `${m}: mapa ${mapa[m] || 0}, tabla ${tabla[m] || 0}`);
  const mismoCorte = corteTabla === cutoff;
  const sinTx = servicios.variants.filter(v => !v.tx).length + rutas.rutas.filter(x => !x.tx).length;
  const p = sinTx ? [`${sinTx} filas sin bloque tx: ejecuta node tools/visor/anotar-taxonomia.mjs`] : [];
  results.push({n: 5, title: 'Mapa y tabla con el mismo corte y las mismas relaciones vigentes por marca', ok: !p.length && !dif.length,
    problems: [...p, ...dif], advisory: !p.length && !mismoCorte,
    info: [`Cortes: mapa ${cutoff}, tabla ${corteTabla}. ${mismoCorte ? 'Mismo corte: obligatoria.' : 'Cortes distintos: se informa y no bloquea hasta que la tarea semanal regenere los dos.'} Fuera de la cuenta: iryo y Cercanías.`]});
}

/* ── 6 y 8. ejes de los tramos (capas/ejes.json, fase 3) ── */
{
  const ejes = fs.existsSync(path.join(V, 'capas/ejes.json')) ? read('capas/ejes.json') : null;
  if (!ejes) results.push({n: 6, title: 'Tramos de alta velocidad con eje', ok: false, problems: ['Falta capas/ejes.json: node tools/visor/build-ejes.mjs'], info: []});
  else {
    const rail = read('datos.json').rail.features;
    const sinEje = rail.map((x, i) => [x, i]).filter(([x, i]) => x.properties.perf === 'hs' && ['adif', 'adifav'].includes(x.properties.net) && !ejes.lectura[i]);
    const km = Math.round(sinEje.reduce((s, [x]) => s + (x.properties.length_m || 0), 0) / 1000);
    results.push({n: 6, title: 'Ningún tramo de alta velocidad de Adif queda sin eje', ok: !sinEje.length,
      problems: sinEje.length ? [`${sinEje.length} tramos (${km} km) sin eje; p. ej. ${sinEje.slice(0, 5).map(([x]) => x.properties.id).join(', ')}`] : [],
      info: [`Cobertura: ${ejes.meta.cobertura.adif} tramos con línea de Adif y ${ejes.meta.cobertura.propagado} con la línea deducida por la red.`]});
    const mal = ejes.linea.map((l, i) => [l, i]).filter(([l, i]) => l && ejes.rfig[i] !== l.slice(0, 2));
    results.push({n: 8, title: 'El eje RFIG de cada tramo son las dos primeras cifras de su línea', ok: !mal.length,
      problems: mal.slice(0, 5).map(([l, i]) => `tramo ${i}: línea ${l}, eje ${ejes.rfig[i]}`), info: []});
    const vals = new Set(ejes.lectura.filter(Boolean));
    const bad = [...vals].filter(x => !T.has('ejeLectura', x));
    if (bad.length) results.find(r => r.n === 8).problems.push(`ejes de lectura desconocidos: ${bad.join(', ')}`), results.find(r => r.n === 8).ok = false;
  }
}

/* ── 9. toda relación de osp_relaciones existe en los datos ── */
{
  const empieza = (st, c) => {const a = T.normalize(st), b = T.normalize(c); return a === b || a.startsWith(b + '-') || a.startsWith(b + ' ');};
  const pares = [...servicios.variants.map(v => [v.origin, v.destination]),
    ...rutas.rutas.map(x => [rutas.estaciones[x.o]?.n, rutas.estaciones[x.d]?.n])].filter(([o, d]) => o && d);
  const falta = T.ospRelaciones.filter(r => !pares.some(([o, d]) => (empieza(o, r.origen) && empieza(d, r.destino)) || (empieza(o, r.destino) && empieza(d, r.origen))))
    .map(r => `${r.origen}–${r.destino} (${r.regimen}) no aparece: puede haber cambiado la oferta`);
  results.push({n: 9, title: 'Las relaciones de osp_relaciones existen en los datos', ok: !falta.length, problems: falta, info: [], advisory: true});
}

/* ── 7. ningún nombre de categoría escrito a mano fuera de taxonomia.js (grep sobre los JS del visor) ── */
{
  const VD = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'visor-ferroviario');
  // Listas y campos antiguos que la fase 6 sustituyó por el diccionario: no deben volver.
  const prohibido = [/CFG\.brands\b/, /CFG\.services\b/, /AtlasConfig\.(brands|services)\b/, /\bv\.categories\b/, /\bv\.brand\b/,
    /['"](Alvia · ahora Intercity|Euromed · ahora AVE Euromed|Media Distancia · ahora Regional)['"]/];
  const p = [];
  for (const f of fs.readdirSync(VD).filter(f => f.endsWith('.js') && f !== 'taxonomia.js')) {
    fs.readFileSync(path.join(VD, f), 'utf8').split('\n').forEach((line, i) => {for (const re of prohibido) if (re.test(line)) p.push(`${f}:${i + 1} ${line.trim().slice(0, 90)}`);});
  }
  check(7, 'Ningún nombre de categoría escrito a mano fuera de taxonomia.js', p);
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
  console.log(failed.length ? `\n${failed.length} comprobación(es) con problemas${strict ? '' : ' (modo informe: no bloquea)'}.` : '\nComprobaciones obligatorias correctas.');
}
process.exit(strict && failed.length ? 1 : 0);
