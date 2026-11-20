#!/usr/bin/env node
/* Cabina del visor ferroviario: precalcula los indicadores ESTÁTICOS (red IGN, estaciones, corredores,
   territorio, intermodalidad, turismo, redes urbanas y catálogo de servicios) en visor-ferroviario/capas/cabina.json.
   La oferta de trenes por día (horarios) NO se precalcula: Cabina la calcula en el navegador con oferta.js,
   igual que las fichas del visor, para que las cifras de las dos páginas coincidan el mismo día.

   Reutiliza las reglas del visor (filtros.js, cartography.js y la regla «peninsular» de capas-config.js):
   si cambian allí, basta con volver a ejecutar este script.
     node tools/build-cabina.mjs          escribe el JSON
     node tools/build-cabina.mjs --check  falla si el JSON no está al día */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = path.join(ROOT, 'visor-ferroviario');
const OUT = path.join(V, 'capas', 'cabina.json');
const read = f => JSON.parse(fs.readFileSync(path.join(V, f), 'utf8'));

// Módulos del visor en un contexto con `window` (sin DOM: solo lógica pura).
const ctx = {console};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['filtros.js', 'cartography.js', 'capas-config.js']) vm.runInContext(fs.readFileSync(path.join(V, f), 'utf8'), ctx, {filename: f});
const {AtlasFilters: F, AtlasCartography: C, AtlasConfig: CFG} = ctx;

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const tally = (items, key, val = () => 1) => {
  const m = new Map();
  for (const x of items) { const k = key(x); m.set(k, (m.get(k) || 0) + val(x)); }
  return m;
};

/* ── Red IGN (ámbito peninsular, misma regla que el visor) ── */
const datos = read('datos.json');
const rail = datos.rail.features.filter(f => CFG.peninsular(f.geometry.coordinates[0]));
rail.forEach(f => F.prepare(f));
const unique = [...new Map(rail.map(f => [f.properties.id, f])).values()];
const km = f => f.properties.attr !== 0 ? (Number(f.properties.length_m) || 0) / 1000 : 0;   // misma regla que AtlasCartography.metrics
const m = C.metrics(rail);
const kmBy = (key, order) => {
  const t = tally(unique, key, km), n = tally(unique, key);
  const ids = order || [...t.keys()].sort((a, b) => t.get(b) - t.get(a));
  return ids.filter(id => n.has(id)).map(id => ({id, km: round(t.get(id) || 0, 0), tramos: n.get(id) || 0}));
};
const gaugeGroup = v => (CFG.classifications.gauge.items.find(i => (i.values || [i.id]).includes(v)) || {id: 'unknown'}).id;
const red = {
  tramos: m.sections, km: round(m.km, 0), cobertura_ancho: round(m.gaugeCoverage, 1),
  tramos_sin_atributos: unique.filter(f => f.properties.attr === 0).length,
  ancho: kmBy(f => gaugeGroup(F.value(f, 'gauge')), CFG.classifications.gauge.items.map(i => i.id)),
  electrificacion: kmBy(f => F.value(f, 'electric'), ['yes', 'no', 'unknown', 'notApplicable', 'pending']),
  vias: kmBy(f => F.value(f, 'tracks'), ['1', '2', '3', '4', 'unknown', 'notApplicable', 'pending']),
  prestaciones: kmBy(f => f.properties.perf || 'none', CFG.classifications.perf.items.map(i => i.id)),
  titularidad: kmBy(f => f.properties.net || 'none', CFG.classifications.net.items.map(i => i.id)),
  // Cruce prestaciones × electrificación (km): ¿cuánta red convencional sigue sin electrificar?
  perf_electric: CFG.classifications.perf.items.map(p => {
    const sub = unique.filter(f => (f.properties.perf || 'none') === p.id);
    const t = tally(sub, f => F.value(f, 'electric'), km);
    return {id: p.id, yes: round(t.get('yes') || 0, 0), no: round(t.get('no') || 0, 0), unknown: round([...t].filter(([k]) => !['yes', 'no'].includes(k)).reduce((a, [, v]) => a + v, 0), 0)};
  }),
  // Cruce titularidad × prestaciones (km): la titularidad «Adif AV» no siempre es vía de alta velocidad.
  net_perf: CFG.classifications.net.items.map(n => {
    const t = tally(unique.filter(f => (f.properties.net || 'none') === n.id), f => f.properties.perf || 'none', km);
    return {id: n.id, hs: round(t.get('hs') || 0, 0), conv: round(t.get('conv') || 0, 0), none: round(t.get('none') || 0, 0)};
  }).filter(r => r.hs + r.conv + r.none > 0)
};

/* ── Estaciones Renfe (catálogo, ámbito peninsular) ── */
const st = datos.stations.features.filter(f => CFG.peninsular(f.geometry.coordinates)).map(f => f.properties);
const title = s => s.toLowerCase().replace(/(^|[\s,(/-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase()).replace(/^(.*), (A|La|Las|Los|El)$/u, '$2 $1');
const estaciones = {
  total: st.length, total_catalogo: datos.stations.features.length,
  cercanias: st.filter(s => s.CERCANIAS === 'SI').length,
  ancho_metrico: st.filter(s => s['ANCHO MÉTRICO'] === 'SI').length,
  provincias: [...tally(st, s => s.PROVINCIA)].sort((a, b) => b[1] - a[1]).map(([p, n]) => ({provincia: title(p), estaciones: n}))
};

/* ── Corredores de alta velocidad (Hermes, TEN-T) ── */
const cor = read('capas/corredores.geojson').features.map(f => f.properties);
const corredores = {
  fuente: cor[0]?.source_url || null,
  fecha: [...new Set(cor.map(c => c.source_date))].sort().at(-1),
  por_corredor: CFG.corridors.map(c => {
    const sub = cor.filter(x => x.corridor === c.id), t = tally(sub, x => x.status, x => Number(x.km) || 0);
    return {id: c.id, nombre: c.name, service: round(t.get('service') || 0, 0), construction: round(t.get('construction') || 0, 0), project: round(t.get('project') || 0, 0), tramos: sub.length};
  }),
  total: Object.fromEntries(['service', 'construction', 'project'].map(st => [st, round(cor.filter(x => x.status === st && CFG.corridors.some(c => c.id === x.corridor)).reduce((a, x) => a + (Number(x.km) || 0), 0), 0)])),
  sin_corredor: cor.filter(x => !CFG.corridors.some(c => c.id === x.corridor)).length,
  // Tramos en servicio por los que no pasa ningún tren de alta velocidad de los horarios (regla de 150 m del visor).
  servicio_sin_trenes: cor.filter(x => x.status === 'service' && x.high_speed_trains === false)
    .map(x => ({corredor: x.corridor, nombre: x.name, km: round(Number(x.km) || 0, 1)})).sort((a, b) => b.km - a.km)
};

/* ── Red transeuropea TEN-T (Hermes): km por puntos kilométricos; un tramo de los dos corredores cuenta en cada uno ── */
const tent = read('tramos-ten-t.geojson').features.map(f => f.properties);
const pkKm = x => Math.abs((Number(x.pk_end) || 0) - (Number(x.pk_start) || 0));
const TENT_STATUS = ['En servicio', 'En construcción', 'Planificado'];
const tenT = {
  fecha: [...new Set(tent.map(x => x.source_date))].sort().at(-1),
  tramos: tent.length,
  por_corredor: [['ten-t-atlantico', 'Atlántico'], ['ten-t-mediterraneo', 'Mediterráneo']].map(([id, nombre]) => {
    const t = tally(tent.filter(x => x.corridor_ids?.includes(id)), x => x.status, pkKm);
    return {id, nombre, ...Object.fromEntries(TENT_STATUS.map(s => [s, round(t.get(s) || 0, 0)]))};
  }),
  total: Object.fromEntries(TENT_STATUS.map(s => [s, round(tent.filter(x => x.status === s).reduce((a, x) => a + pkKm(x), 0), 0)]))
};

/* ── Territorio, intermodalidad, turismo y redes urbanas ── */
const pob = read('capas/poblacion.json');
const territorio = {
  fecha: pob.meta.reference_date, fuente: pob.meta.series,
  areas: pob.units.filter(u => u.kind === 'area').sort((a, b) => b.population - a.population).map(u => ({id: u.id, nombre: u.name, poblacion: u.population, municipios: u.municipalities, coord: u.coordinates})),
  capitales: pob.units.filter(u => u.kind === 'capital').sort((a, b) => b.population - a.population).map(u => ({id: u.id, nombre: u.name, poblacion: u.population, coord: u.coordinates}))
};
const tp = read('capas/transporte.json');
const intermodal = {
  fecha: tp.meta.cutoff,
  puertos: tp.ports.map(p => ({id: p.id, nombre: p.name, provincia: p.province, coord: p.coordinates})),
  aeropuertos: tp.airports.map(a => ({id: a.id, iata: a.iata, nombre: a.name, provincia: a.province, categoria: a.category, coord: a.coordinates}))
};
const tur = read('capas/turismo.json');
const turismo = {
  fecha: tur.meta.cutoff,
  total: tur.experiences.length,
  por_tipo: CFG.tourism.map(t => ({id: t.id, nombre: t.name, current: 0, unconfirmed: 0, historical: 0, ...Object.fromEntries(tally(tur.experiences.filter(x => x.group === t.id), x => x.status))})),
  lista: tur.experiences.map(x => ({id: x.id, nombre: x.name, tipo: x.group, estado: x.status, dias: x.days, organizador: x.organizer}))
};
const tc = read('transit-catalog.json');
const urbano = {
  redes: tc.networks.length,
  lineas: tc.lines.length,
  por_red: [...tally(tc.lines, l => l.network_id)].map(([id, n]) => {
    const net = tc.networks.find(x => x.id === id) || {};
    return {id, nombre: net.name, operador: net.operator || '—', modo: net.mode, lineas: n};
  }).sort((a, b) => b.lineas - a.lineas)
};

/* ── Catálogo de servicios (rutas = variantes con paradas distintas) ── */
const sv = read('capas/servicios.json');
const svcOf = v => {
  if (v.brand === 'ouigo' || v.operator === 'OUIGO España') return 'highspeed';
  return CFG.services.find(s => v.categories.includes(s.id))?.id || v.categories[0];
};
const servicios = {
  fecha: sv.meta.cutoff,
  variantes: sv.variants.length,
  estaciones: Object.values(sv.stations).filter(s => s.spain !== false).length,
  por_servicio: CFG.services.map(s => ({id: s.id, nombre: s.name, rutas: sv.variants.filter(v => svcOf(v) === s.id).length})).filter(x => x.rutas),
  por_marca: [...tally(sv.variants, v => v.published_brand || v.operator)].sort((a, b) => b[1] - a[1]).map(([marca, rutas]) => ({marca, rutas}))
};

const fuentes = {
  red: datos.meta.source + ' · descargado ' + datos.meta.retrieved,
  horarios: 'GTFS de Renfe (AV/LD/MD y Cercanías) y PDF oficial de OUIGO',
  poblacion: pob.meta.label
};
const out = JSON.stringify({version: 1, generado_con: 'tools/build-cabina.mjs', fuentes, red, estaciones, corredores, tenT, territorio, intermodal, turismo, urbano, servicios}) + '\n';

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out) { console.error('capas/cabina.json no está al día: node tools/build-cabina.mjs'); process.exit(1); }
  console.log('capas/cabina.json al día');
} else {
  fs.writeFileSync(OUT, out);
  console.log('Escrito', path.relative(ROOT, OUT), (out.length / 1024).toFixed(1) + ' KB',
    '· tramos', red.tramos, '· km', red.km, '· estaciones', estaciones.total, '· rutas', servicios.variantes);
}
