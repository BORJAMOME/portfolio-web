#!/usr/bin/env node
/* Cabina del visor ferroviario: precalcula TODOS sus indicadores en visor-ferroviario/capas/cabina.json y escribe
   los titulares en cabina.html, así la página no calcula nada en el navegador ni enseña «Calculando…».

   - Red: reglas del visor (filtros.js, cartography.js, «peninsular» de capas-config.js) y las mismas correcciones que
     aplica atlas.js al cargar: ancho completado (capas/ancho.json) y electrificación y ancho de la línea de Adif
     (capas/lineas-adif.json · relleno). Base: ejes IGN con atributos (attr ≠ 0), 19.559 km.
   - Oferta, población servida, huecos, Pareto, velocidad y competencia: capas/oferta.json y capas/rutas.json
     (tools/build-rutas.mjs), con todos los trenes de viajeros con horario público (también Cercanías de ancho
     ibérico e iryo, que las fichas del visor aún no incluyen).
     node tools/build-cabina.mjs          escribe el JSON y los titulares
     node tools/build-cabina.mjs --check  falla si algo no está al día */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRed} from './rutas/red.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = path.join(ROOT, 'visor-ferroviario');
const OUT = path.join(V, 'capas', 'cabina.json');
const read = f => JSON.parse(fs.readFileSync(path.join(V, f), 'utf8'));


const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const tally = (items, key, val = () => 1) => {
  const m = new Map();
  for (const x of items) { const k = key(x); m.set(k, (m.get(k) || 0) + val(x)); }
  return m;
};

/* ── Red IGN (ámbito peninsular, mismas reglas y correcciones que el visor: tools/rutas/red.mjs) ── */
const {datos, rail, ancho, F, C, CFG} = loadRed(V);
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
  // De dónde sale el ancho de cada km (historia de calidad del dato): IGN directo → Adif → inferido.
  ancho_origen: kmBy(f => {
    const p = f.properties, g = F.value(f, 'gauge');
    if (['unknown', 'narrow', 'notApplicable', 'pending', 'other'].includes(g)) return 'none';
    return p.gauge_fix ? 'fix_' + p.gauge_src : p.fill_g ? 'linea' : 'ign';
  }, ['ign', 'fix_adif', 'linea', 'fix_ign', 'fix_net', 'fix_topo', 'none']),
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
  /* Hermes es de 2024. El «en servicio» ya se contrasta con los horarios (high_speed_trains); las obras y los proyectos se
     revisaron a mano con el Ministerio el 21-11-2026 y no ha cambiado ninguno: Murcia–Almería, Burgos–Vitoria y la Y vasca
     siguen en obras, y València–La Encina también (sus trenes van por la variante de ancho ibérico abierta en 2023, a
     menos de 150 m del trazado). Si Hermes publica una versión nueva, revisar de nuevo. */
  verificado: {fecha: '2026-11-21', nota: 'Ningún tramo en obras o en proyecto de Hermes se ha abierto desde 2024 según el Ministerio de Transportes; València–La Encina tiene trenes por la variante de ancho ibérico, no por la línea de alta velocidad.',
    fuentes: ['https://www.lamoncloa.gob.es/serviciosdeprensa/notasprensa/transportes-movilidad-sostenible/paginas/2026/110826-puente-visita-obras-ave-almeria.aspx',
      'https://www.transportes.gob.es/ministerio/comunicacion/sala-prensa/vie-25092026-1125',
      'https://www.lamoncloa.gob.es/serviciosdeprensa/notasprensa/transportes-movilidad-sostenible/paginas/2026/220426-puente-corredor-mediterraneo.aspx']},
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

/* ── Oferta del universo completo (capas/oferta.json y capas/rutas.json, de tools/build-rutas.mjs) ── */
const OF = read('capas/oferta.json'), RU = read('capas/rutas.json');
const ST = OF.estaciones, PE = OF.por_estacion;   // mismo índice
const metres = (a, b) => { const k = Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111320; };
const spain = i => ST[i].ca && ST[i].ca !== 'Fuera de España';
const withTrains = ST.map((s, i) => ({i, n: s.n, c: s.c, ca: s.ca, pr: s.pr, lab: PE[i][0], fam: PE[i][3], av: PE[i][4], pri: PE[i][5], ult: PE[i][6], dest: PE[i][7]}))
  .filter(s => s.lab > 0 && s.c && spain(s.i));
const FAM = Object.keys(OF.familias);
const oferta = {
  referencia: OF.referencia, universo: OF.universo, fuentes: OF.fuentes,
  familias: FAM.map(f => ({nombre: f, ...OF.familias[f]})),
  trenes: FAM.reduce((a, f) => ({lab: a.lab + OF.familias[f].lab, sab: a.sab + OF.familias[f].sab, dom: a.dom + OF.familias[f].dom}), {lab: 0, sab: 0, dom: 0}),
  estaciones_con_tren: withTrains.length, estaciones_total: ST.filter((s, i) => spain(i)).length,
  paradas: withTrains.reduce((a, s) => a + s.lab, 0),
  semana: OF.semana,
  // Alta velocidad comercial por marca (AVE incluye AVE Euromed): laborable, sábado, domingo y lunes a domingo.
  marcas_av: [['AVE', ['AVE', 'AVE Euromed']], ['Avlo', ['Avlo']], ['OUIGO', ['OUIGO']], ['iryo', ['iryo']]].map(([nombre, ks]) => {
    const M = ks.map(k => OF.marcas?.[k]).filter(Boolean);
    return {nombre, lab: M.reduce((a, m) => a + m.lab, 0), sab: M.reduce((a, m) => a + m.sab, 0), dom: M.reduce((a, m) => a + m.dom, 0),
      dias: [0, 1, 2, 3, 4, 5, 6].map(i => M.reduce((a, m) => a + m.dias[i], 0))};
  }),
  tramos: [['1–2', 1, 2], ['3–10', 3, 10], ['11–30', 11, 30], ['31–100', 31, 100], ['101–300', 101, 300], ['más de 300', 301, 1e9]]
    .map(([label, a, b]) => ({label, n: withTrains.filter(s => s.lab >= a && s.lab <= b).length}))
};
// Pareto: estaciones de más a menos paradas; qué % de estaciones suma el 50 % (y el 80 %) de las paradas. Gini aparte.
{
  const v = withTrains.map(s => s.lab).sort((a, b) => b - a), tot = v.reduce((a, b) => a + b, 0);
  let acc = 0, p50 = null, p80 = null; const pts = [[0, 0]], step = Math.max(1, Math.floor(v.length / 60));
  v.forEach((x, i) => { acc += x; const xs = (i + 1) / v.length, ys = acc / tot;
    if (p50 === null && ys >= .5) p50 = xs; if (p80 === null && ys >= .8) p80 = xs;
    if (i % step === 0 || i === v.length - 1) pts.push([round(xs * 100, 1), round(ys * 100, 1)]); });
  const asc = [...v].reverse(); let g = 0; asc.forEach((x, i) => { g += (2 * (i + 1) - asc.length - 1) * x; });
  oferta.pareto = {puntos: pts, p50: round(p50 * 100, 1), p80: round(p80 * 100, 1), n50: Math.round(p50 * v.length), gini: round(g / (asc.length * tot), 2)};
}
// Competencia en alta velocidad comercial por estación (AVE+Euromed, Avlo, OUIGO, iryo; Avant aparte).
oferta.competencia = withTrains.filter(s => s.av[3] + s.av[4] > 0)
  .map(s => ({n: s.n, c: s.c, ave: s.av[0], avlo: s.av[1], ouigo: s.av[3], iryo: s.av[4], avant: s.av[2]}))
  .sort((a, b) => (b.ave + b.avlo + b.ouigo + b.iryo) - (a.ave + a.avlo + a.ouigo + a.iryo));

/* ── Población servida y huecos (municipios INE 2025, centroide del polígono, distancia en línea recta) ── */
const demo = read('capas/demografia.json');
function centroid(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates; let best = null, ba = -1;
  for (const poly of polys) {
    const r = poly[0]; let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; }
    if (a && Math.abs(a) > ba) { ba = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  }
  return best;
}
// Distancia municipio–estación: 0 si la estación está dentro del término municipal; si no, desde el centroide del
// polígono. (Solo con el centroide, Badajoz, Jerez o Cáceres saldrían «sin tren»: su término es enorme y el centroide
// queda lejos de la ciudad.) Sigue siendo línea recta, no acceso real.
const inRing = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const inGeom = (pt, g, bb) => { if (pt[0] < bb[0] || pt[0] > bb[2] || pt[1] < bb[1] || pt[1] > bb[3]) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return polys.some(p => inRing(pt, p[0]) && !p.slice(1).some(h => inRing(pt, h))); };
const bbox = g => { const b = [Infinity, Infinity, -Infinity, -Infinity]; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } return b; };
const munis = demo.municipalities.features.map(f => ({id: f.properties.id, n: f.properties.name, pr: f.properties.province, pob: f.properties.population, c: centroid(f.geometry), g: f.geometry, bb: bbox(f.geometry)}))
  .filter(m => m.c && CFG.peninsular(m.c) && m.pob > 0);
const POB = munis.reduce((a, m) => a + m.pob, 0), DIST = [2, 5, 10], NS = [1, 2, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300];
for (const m of munis) {
  m.best = DIST.map(() => 0); m.near10 = null;
  for (const s of withTrains) {
    const d = inGeom(s.c, m.g, m.bb) ? 0 : metres(m.c, s.c);
    DIST.forEach((km, k) => { if (d <= km * 1000 && s.lab > m.best[k]) m.best[k] = s.lab; });
    if (s.lab >= 10 && (!m.near10 || d < m.near10.d)) m.near10 = {n: s.n, d, lab: s.lab};
  }
}
const cobertura = {
  poblacion: POB, municipios: munis.length, fecha: demo.meta.municipalityDate, distancias: DIST, umbrales: NS,
  curva: DIST.map((km, k) => NS.map(N => round(100 * munis.filter(m => m.best[k] >= N).reduce((a, m) => a + m.pob, 0) / POB, 1))),
  // Huecos: municipios de más de 20.000 habitantes sin estación con ≥ 10 trenes/día a ≤ 10 km.
  huecos: munis.filter(m => m.pob > 20000 && m.best[2] < 10).sort((a, b) => b.pob - a.pob)
    .map(m => ({id: m.id, n: m.n, pr: m.pr, pob: m.pob, c: m.c.map(x => round(x, 4)), cerca: m.near10 ? {n: m.near10.n, km: round(m.near10.d / 1000, 1), lab: m.near10.lab} : null}))
};
// Habitantes (no solo %) de cada punto de la curva, para la tabla completa.
cobertura.curva_pob = DIST.map((km, k) => NS.map(N => munis.filter(m => m.best[k] >= N).reduce((a, m) => a + m.pob, 0)));
// Lista de estaciones con tren (Pareto, ranking filtrable por servicio y territorio). Municipio = término que contiene la
// estación (INE). Campos: [nombre, [lon, lat], comunidad, provincia, municipio, trenes, [AV, Avant, Intercity, Regional, Cercanías]].
{
  const muniOf = s => munis.find(m => inGeom(s.c, m.g, m.bb))?.n || null;
  oferta.estaciones = withTrains.sort((a, b) => b.lab - a.lab).map(s => [s.n, s.c, s.ca, s.pr, muniOf(s), s.lab, s.fam]);
}
cobertura.kpi = {n10_5: cobertura.curva[1][NS.indexOf(10)], n1_5: cobertura.curva[1][NS.indexOf(1)], n30_5: cobertura.curva[1][NS.indexOf(30)]};
cobertura.huecos_pob = cobertura.huecos.reduce((a, m) => a + m.pob, 0);

/* ── Velocidad comercial programada entre capitales.
   Tiempo: el tren directo más rápido entre las dos capitales, pare donde pare (oferta.json · capitales, de build-rutas).
   Distancia: km del trazado IGN entre esas dos paradas, medidos a lo largo del recorrido inferido de una variante de
   servicios.json que pase por las dos (posición de cada estación = vértice del recorrido más cercano). ── */
{
  const caps = new Map(pob.units.filter(u => u.kind === 'capital').map(u => [u.id, u]));
  const varOf = new Map();   // código de estación → variantes que paran en ella
  sv.variants.forEach((v, vi) => { if (!v.edges?.length) return; for (const c of v.calls) { const k = sv.stations[c.s]?.official_id; if (!k) continue; if (!varOf.has(k)) varOf.set(k, new Set()); varOf.get(k).add(vi); } });
  // Las aristas de una variante no vienen ordenadas: se trata su recorrido como un grafo (nodos = extremos de los tramos
  // IGN) y se busca el camino más corto entre las dos estaciones con Dijkstra, solo por esas aristas.
  const graphCache = new Map(), nodeKey = c => c[0].toFixed(5) + ',' + c[1].toFixed(5);
  const graphOf = vi => {
    if (graphCache.has(vi)) return graphCache.get(vi);
    const adj = new Map(), edges = [], grid = new Map();
    // Extremos a menos de 25 m = el mismo nodo (los tramos IGN contiguos no siempre comparten la coordenada exacta).
    const node = c => {
      const gx = Math.floor(c[0] / 0.0005), gy = Math.floor(c[1] / 0.0005);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [k, p] of grid.get((gx + dx) + ':' + (gy + dy)) || []) if (metres(p, c) < 25) return k;
      const k = nodeKey(c), cell = gx + ':' + gy; if (!grid.has(cell)) grid.set(cell, []); grid.get(cell).push([k, c]); return k;
    };
    for (const fid of sv.variants[vi].edges) {
      const f = datos.rail.features[fid], g = f?.geometry.coordinates; if (!g?.length) continue;
      const a = node(g[0]), b = node(g.at(-1)), w = Number(f.properties.length_m) || 0;
      if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push([b, w]); adj.get(b).push([a, w]);
      edges.push({g, a, b, w});
    }
    const r = {adj, edges}; graphCache.set(vi, r); return r;
  };
  // La estación se engancha al punto más cercano del recorrido (≤ 3 km), dentro del tramo: un nodo virtual unido a los dos
  // extremos del tramo con la parte de longitud que queda a cada lado (en alta velocidad los tramos IGN miden kilómetros).
  const nearestNode = (G, c, key) => {
    let best = null, bd = 3000;
    for (const e of G.edges) for (let i = 0; i < e.g.length; i++) { const d = metres(e.g[i], c); if (d < bd) { bd = d; best = [e, i]; } }
    if (!best) return null;
    const [e, i] = best; let along = 0, tot = 0;
    for (let k = 1; k < e.g.length; k++) { const s = metres(e.g[k - 1], e.g[k]); tot += s; if (k <= i) along += s; }
    const f = tot ? along / tot : 0, v = 'v:' + key;
    G.adj.set(v, [[e.a, e.w * f], [e.b, e.w * (1 - f)]]);
    G.adj.get(e.a).push([v, e.w * f]); G.adj.get(e.b).push([v, e.w * (1 - f)]);
    return v;
  };
  const dijkstra = (G, from, to) => {
    const dist = new Map([[from, 0]]), done = new Set(), q = [[0, from]];
    while (q.length) {
      let mi = 0; for (let i = 1; i < q.length; i++) if (q[i][0] < q[mi][0]) mi = i;
      const [d, u] = q.splice(mi, 1)[0]; if (done.has(u)) continue; if (u === to) return d; done.add(u);
      for (const [v, w] of G.adj.get(u) || []) { const nd = d + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); q.push([nd, v]); } }
    }
    return null;
  };
  const coordOf = new Map(ST.map(s => [s.k, s.c]));
  const kmBetween = (a, b) => {
    const va = varOf.get(a), vb = varOf.get(b); if (!va || !vb) return null; const ks = [];
    for (const vi of va) {
      if (!vb.has(vi)) continue; graphCache.delete(vi);   // grafo nuevo: los nodos virtuales son de este par
      const G = graphOf(vi), na = nearestNode(G, coordOf.get(a), a), nb = nearestNode(G, coordOf.get(b), b);
      let d = na && nb && na !== nb ? dijkstra(G, na, nb) : null;
      // Recorrido con huecos (tramos pendientes de inferir): si las dos estaciones son el origen y el destino de la
      // variante, vale la suma de sus tramos, que mide justo ese trayecto.
      const v = sv.variants[vi], o = sv.stations[v.calls[0].s]?.official_id, z = sv.stations[v.calls.at(-1).s]?.official_id;
      if (!d && ((o === a && z === b) || (o === b && z === a))) d = v.edges.reduce((x, fid) => x + (Number(datos.rail.features[fid]?.properties.length_m) || 0), 0);
      if (d) ks.push(d / 1000); if (ks.length >= 5) break;
    }
    if (!ks.length) return null; ks.sort((x, y) => x - y); return ks[Math.floor(ks.length / 2)];   // mediana de hasta 5 variantes
  };
  // Por cada pareja de capitales, el tren directo más rápido en TIEMPO (cualquier estación de las dos ciudades). Si no se
  // pueden medir los km de ese tren, la pareja no sale: caer en otro tren más lento daría una velocidad engañosa.
  const fastest = new Map();
  for (const x of OF.capitales) { const k = [x[6], x[7]].sort().join('|'); if (!fastest.has(k) || x[2] < fastest.get(k)[2]) fastest.set(k, x); }
  const best = new Map();
  for (const [a, b, min, marca, op, fam, ca, cb] of fastest.values()) {
    const A = caps.get(ca), B = caps.get(cb); if (!A || !B) continue;
    const km = kmBetween(a, b); if (!km) continue;
    const kmh = km / (min / 60), key = [A.name, B.name].sort((x, y) => x.localeCompare(y, 'es')).join(' – ');
    const n = k => ST.find(s => s.k === k)?.n;
    if (!best.has(key) || kmh > best.get(key).kmh)
      best.set(key, {rel: key, de: n(a), a: n(b), marca, fam, op, km: round(km, 0), min, kmh: round(kmh, 0), pob: A.population + B.population});
  }
  oferta.velocidad_pares = best.size;
  oferta.velocidad = [...best.values()].sort((x, y) => y.kmh - x.kmh);
}

/* ── Intermodalidad con el universo completo: estación con tren más cercana (≤ 15 km) ── */
const nearest = (c, max = 15000) => { let b = null, bd = max; for (const s of withTrains) { const d = metres(c, s.c); if (d < bd) { bd = d; b = s; } } return b ? {n: b.n, m: Math.round(bd), lab: b.lab} : null; };
intermodal.puertos = intermodal.puertos.map(p => ({...p, cerca: nearest(p.coord)}));
intermodal.aeropuertos = intermodal.aeropuertos.map(p => ({...p, cerca: nearest(p.coord)}));

/* ── Conciliación: una cifra por concepto y de dónde salen las demás ── */
const kmOf = (list, id) => list.find(x => x.id === id)?.km || 0;
const glosario = {
  km_av: {prestaciones: kmOf(red.prestaciones, 'hs'), corredores: corredores.total.service, adifav: kmOf(red.titularidad, 'adifav'),
    adifav_conv: red.net_perf.find(x => x.id === 'adifav')?.conv || 0, adif_hs: red.net_perf.find(x => x.id === 'adif')?.hs || 0},
  estaciones: {catalogo: estaciones.total, horario: oferta.estaciones_total, con_tren: oferta.estaciones_con_tren, variantes: servicios.estaciones},
  av: {comercial: OF.familias['Alta velocidad'].lab, avant: OF.familias['Avant'].lab, total: oferta.trenes.lab}
};

const fuentes = {
  red: datos.meta.source + ' · descargado ' + datos.meta.retrieved + '; ancho completado con Adif (' + (ancho.meta.adif_downloaded || '') + ')',
  horarios: OF.universo,
  poblacion: 'INE · Censo anual de población a ' + demo.meta.municipalityDate + ' (municipios)'
};
for (const m of munis) { delete m.g; delete m.bb; }
/* ── Titulares: la conclusión de cada capítulo, escrita también en cabina.html (sin «Calculando…» en el primer pintado) ── */
const nf = new Intl.NumberFormat('es-ES'), pf = new Intl.NumberFormat('es-ES', {maximumFractionDigits: 1});
const fam = Object.fromEntries(oferta.familias.map(f => [f.nombre, f.lab]));
const cerShare = fam['Cercanías'] / oferta.trenes.lab;
const comp = oferta.competencia.map(c => ({...c, priv: (c.ouigo + c.iryo) / (c.ave + c.avlo + c.ouigo + c.iryo)}));
// Solo estaciones con 30 trenes de alta velocidad o más: en Puertollano, 2 trenes de iryo serían «el 100 %».
const compBig = comp.filter(c => c.ave + c.avlo + c.ouigo + c.iryo >= 30), compMax = compBig.reduce((a, b) => b.priv > a.priv ? b : a, compBig[0]);
const kmAV = kmOf(red.prestaciones, 'hs'), kmNo = kmOf(red.electrificacion, 'no'), kmKnown = red.km - kmOf(red.ancho, 'unknown');
const refDate = new Date(oferta.referencia.laborable + 'T12:00:00').toLocaleDateString('es-ES', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
// Pastilla de la cabecera: día de los horarios y próxima regeneración (rutas-semanal.yml: cada lunes).
const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', {weekday: 'short', day: 'numeric', month: 'short'}).replace(/[.,]/g, '');
const nextMonday = (() => { const d = new Date((OF.generado || oferta.referencia.laborable) + 'T12:00:00'); do d.setDate(d.getDate() + 1); while (d.getDay() !== 1); return d.toISOString().slice(0, 10); })();
oferta.actualizacion = {generado: OF.generado, proxima: nextMonday};
const titulares = {
  ref: 'Horarios del ' + shortDate(oferta.referencia.laborable) + '|Próxima actualización: ' + shortDate(nextMonday),
  cobertura: `El ${Math.round(cobertura.kpi.n10_5)} % de la población tiene a 5 km una estación con 10 trenes al día o más; ${cobertura.huecos.length} municipios grandes, ni a 10 km`,
  servicio: `${Math.round(cerShare * 10)} de cada 10 trenes son de Cercanías, y el ${pf.format(oferta.pareto.p50)} % de las estaciones concentra la mitad de las paradas`,
  competencia: `iryo y OUIGO paran en ${comp.length} estaciones; donde más pesan, en ${compMax.n}, son ${Math.round(compMax.priv * 100)} de cada 100 trenes de alta velocidad`,
  red: `El ${Math.round(100 * kmAV / red.km)} % de la red es de alta velocidad y el ${Math.round(100 * kmNo / red.km)} % sigue sin electrificar; ya se conoce el ancho del ${pf.format(100 * kmKnown / red.km)} % de los km`
};
/* ── Ola 2 · uso (INE, CNMC mercancías, Eurostat): capas/mercado.json, que descarga tools/build-cabina-mercado.mjs.
   Se lee sin red, así este script y su --check siguen funcionando sin conexión. Si falta, el capítulo no se pinta. ── */
const MERC = path.join(V, 'capas', 'mercado.json');
const mercado = fs.existsSync(MERC) ? JSON.parse(fs.readFileSync(MERC, 'utf8')) : null;
if (mercado) {
  const V2 = mercado.viajeros.resumen, S2 = mercado.viajeros.series, keys = Object.keys(S2);
  // Total del tren: suma de los cuatro tipos, últimos 12 meses frente a los 12 anteriores (meses de la serie INE).
  const sumMeses = (a, b) => keys.reduce((t, k) => t + S2[k].meses.slice(a, b).reduce((x, [, v]) => x + v, 0), 0);
  const nM = S2[keys[0]].meses.length, m12 = sumMeses(nM - 12, nM), prev = sumMeses(nM - 24, nM - 12);
  const var12 = round(100 * (m12 / prev - 1));
  mercado.viajeros.total12 = {m12: round(m12, 0), anterior: round(prev, 0), var12};
  titulares.uso = `La alta velocidad tiene un ${Math.round(V2.av.vs2019)} % más viajeros que en 2019; el tren en conjunto, un ${pf.format(Math.abs(var12))} % ${var12 >= 0 ? 'más' : 'menos'} que hace un año`;
}
/* ── Ola 2 · competencia en viajeros (CNMC): capas/cnmc.json, de tools/build-cnmc.mjs. Solo lo que pinta la Cabina. ── */
const CN = path.join(V, 'capas', 'cnmc.json');
let cnmc = null;
if (fs.existsSync(CN)) {
  const c = JSON.parse(fs.readFileSync(CN, 'utf8'));
  const tot = op => c.corredores.reduce((a, x) => a + (x.a2025.operadores[op]?.viajeros || 0), 0);
  const all = ['Renfe', 'OUIGO', 'iryo'].reduce((a, op) => a + tot(op), 0);
  const desde = c.serie.findIndex(s => s.t === '2023T2');
  cnmc = {licencia: c.licencia, fuentes: Object.values(c.fuentes).map(f => f.label), ultimo_trimestre: c.ultimo_trimestre, notas: c.notas,
    corredores: c.corredores.map(x => ({corredor: x.corredor, viajeros: x.a2025.viajeros, op: Object.fromEntries(Object.entries(x.a2025.operadores).map(([k, v]) => [k, {cuota: v.cuota, ocupacion: v.ocupacion}]))})),
    renfe_2025: round(100 * tot('Renfe') / all), ocupacion_5: c.ocupacion_5, serie: c.serie.map(s => [s.t, s.renfe]),
    renfe_desde_2023: round(c.serie.slice(desde).reduce((a, s) => a + s.renfe, 0) / (c.serie.length - desde)), precio_2025: c.precio_2025};
  // Precio: AVE frente a la opción más barata de cada trayecto (2025, año completo), media de los cinco.
  const ratios = c.precio_2025.map(p => p['Renfe-AVE'] / Math.min(...['Renfe-AVLO', 'Iryo', 'OUIGO'].map(k => p[k]).filter(v => v != null)));
  cnmc.ave_vs_barato = round(ratios.reduce((a, b) => a + b, 0) / ratios.length, 2);
  titulares.competencia = `Renfe conserva el ${Math.round(cnmc.renfe_2025)} % de los viajeros de alta velocidad en los cinco corredores con competencia, y el AVE cuesta en torno a ${pf.format(round(cnmc.ave_vs_barato, 1))} veces la opción más barata`;
}

const out = JSON.stringify({version: 2, generado_con: 'tools/build-cabina.mjs', fuentes, red, estaciones, corredores, tenT, territorio, intermodal, turismo, urbano, servicios, oferta, cobertura, glosario, mercado, cnmc, titulares}) + '\n';
// Escribe los titulares en el HTML: <h2 id="X-t">…</h2> y <p id="ref" …>…</p>.
const HTML = path.join(V, 'cabina.html');
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html0 = fs.readFileSync(HTML, 'utf8');
let html = html0;
for (const k of ['cobertura', 'servicio', 'uso', 'competencia', 'red'].filter(k => titulares[k])) html = html.replace(new RegExp('(<h2 id="' + k + '-t">)[^<]*(</h2>)'), (m, a, b) => a + esc(titulares[k]) + b);
{ const [a1, a2] = titulares.ref.split('|');
  html = html.replace(/(<span[^>]*id="ref-date"[^>]*>)[^<]*(<\/span>)/, (m, a, b) => a + esc(a1) + b).replace(/(<span[^>]*id="ref-next"[^>]*>)[^<]*(<\/span>)/, (m, a, b) => a + esc(a2) + b); }

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out || html !== html0) { console.error('capas/cabina.json o los titulares de cabina.html no están al día: node tools/build-cabina.mjs'); process.exit(1); }
  console.log('capas/cabina.json y titulares al día');
} else {
  fs.writeFileSync(OUT, out);
  if (html !== html0) fs.writeFileSync(HTML, html);
  console.log('Escrito', path.relative(ROOT, OUT), (out.length / 1024).toFixed(1) + ' KB',
    '· tramos', red.tramos, '· km', red.km, '· estaciones', estaciones.total, '· rutas', servicios.variantes);
}
