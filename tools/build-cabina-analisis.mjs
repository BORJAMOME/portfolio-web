#!/usr/bin/env node
/* Análisis de la Cabina (cabina-analisis.html): precalcula las once lecturas de la página en
   visor-ferroviario/capas/analisis.json y el mapa de trenes por tramo en capas/analisis-mapa.json.
   Solo usa datos que ya están en el proyecto (sin red):
     - capas/rutas.json, capas/rutas-actividad.json y capas/oferta.json (tools/build-rutas.mjs): oferta del miércoles de
       la semana de referencia, trenes de cada ruta y trazados;
     - capas/cabina.json (tools/build-cabina.mjs): velocidad comercial entre capitales;
     - capas/cnmc.json (tools/build-cnmc.mjs): cuota y precio en los cinco corredores de alta velocidad;
     - capas/poblacion.json, capas/demografia.json y la red IGN del visor (tools/rutas/red.mjs).
   Todo lo que se cuenta por ruta o por estación es OFERTA (trenes programados), nunca viajeros.
     node tools/build-cabina-analisis.mjs          escribe los dos JSON
     node tools/build-cabina-analisis.mjs --check  falla si no están al día */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRed} from './rutas/red.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = path.join(ROOT, 'visor-ferroviario');
const OUT = path.join(V, 'capas', 'analisis.json'), OUT_MAP = path.join(V, 'capas', 'analisis-mapa.json');
const read = f => JSON.parse(fs.readFileSync(path.join(V, f), 'utf8'));
const round = (x, d = 1) => x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d;
const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const metres = (a, b) => { const r = Math.PI / 180, la = (b[1] - a[1]) * r, lo = (b[0] - a[0]) * r, h = Math.sin(la / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(lo / 2) ** 2; return 12742000 * Math.asin(Math.min(1, Math.sqrt(h))); };

const R = read('capas/rutas.json'), A = read('capas/rutas-actividad.json'), OF = read('capas/oferta.json');
const CB = read('capas/cabina.json'), CN = read('capas/cnmc.json'), POB = read('capas/poblacion.json'), DEMO = read('capas/demografia.json');
const {datos, rail, F, CFG} = loadRed(V);
const E = R.estaciones, WD = R.referencia.laborable;
if (A.referencia[2] !== WD || OF.referencia?.laborable && OF.referencia.laborable !== WD) throw new Error('rutas.json, rutas-actividad.json y oferta.json no son de la misma semana: node tools/build-rutas.mjs');
const FAMS = ['Alta velocidad', 'Avant', 'Intercity', 'Regional', 'Cercanías'];
const name = r => r.fam === 'Cercanías' ? (r.marca + ' · ' + (r.nuc || '')) : E[r.o].n + ' → ' + E[r.d].n;
const pairKey = r => [Math.min(r.o, r.d), Math.max(r.o, r.d)].join('-') + '|' + r.marca;

/* Una fila por sentido: para no contar dos veces una relación, se queda el sentido con más trenes el miércoles
   (a igualdad, el primero en el orden de rutas.json, que es estable). */
function oneWay(rows) {
  const best = new Map();
  for (const r of rows) { const k = pairKey(r), b = best.get(k); if (!b || r.lab > b.lab) best.set(k, r); }
  return [...best.values()];
}
const ld = R.rutas.filter(r => r.fam !== 'Cercanías' && r.lab > 0 && r.o !== null && r.d !== null && r.o !== r.d);

/* ── 1 · Capitales: trenes directos desde Madrid y velocidad del tren directo más rápido ── */
const caps = POB.units.filter(u => u.kind === 'capital' && CFG.peninsular(u.coordinates));
const MAD = caps.find(u => u.name === 'Madrid');
const direct = new Map(OF.capitales_trenes.filter(([a]) => a === MAD.id).map(([, b, n]) => [b, n]));
const back = new Map(OF.capitales_trenes.filter(([, b]) => b === MAD.id).map(([a, , n]) => [a, n]));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const speedOf = new Map();
for (const v of CB.oferta.velocidad) { const [a, b] = v.rel.split(' – '); const other = a === 'Madrid' ? b : b === 'Madrid' ? a : null; if (other) speedOf.set(norm(other), v); }
/* Velocidad en línea recta = distancia en recta entre las dos estaciones ÷ tiempo del tren directo más rápido
   (oferta.json · capitales). Se puede medir en todas las capitales con tren directo; la comercial (km por la vía,
   capas/cabina.json) falta en 12 porque el tren más rápido pasa por tramos con el trazado incompleto. */
const coordK = new Map(E.map(s => [s.k, s.c])), fastestMad = new Map();
for (const [a, b, min, marca, , fam, ca, cb] of OF.capitales) {
  const other = ca === MAD.id ? cb : cb === MAD.id ? ca : null; if (!other || !coordK.get(a) || !coordK.get(b)) continue;
  const x = fastestMad.get(other); if (!x || min < x.min) fastestMad.set(other, {min, marca, fam, recta: metres(coordK.get(a), coordK.get(b)) / 1000});
}
const capitales = caps.filter(u => u !== MAD).map(u => {
  const v = speedOf.get(norm(u.name)), f = fastestMad.get(u.id), ida = direct.get(u.id) || 0, vuelta = back.get(u.id) || 0;
  return {n: u.name, pr: u.province, pob: u.population, trenes: ida, vuelta,
    min: f ? f.min : null, marca: f ? f.marca : null, recta: f ? round(f.recta, 0) : null, kmh_recta: f ? round(f.recta / (f.min / 60), 0) : null,
    kmh: v ? v.kmh : null, km: v ? v.km : null};
}).sort((a, b) => b.pob - a.pob);

/* ── 2 · Velocidad por tipo de vía (rutas con km del trazado IGN completo y duración) ── */
const velRows = oneWay(ld.filter(r => r.via && r.via.km && r.via.vel && r.via.tipo && r.dur));
const TIPOS = ['Alta velocidad', 'Mixta', 'Convencional'];
const velocidad = {
  rutas: velRows.map(r => ({n: name(r), marca: r.marca, fam: r.fam, tipo: r.via.tipo, km: r.via.km, min: r.dur, kmh: r.via.vel, trenes: r.lab, av: r.via.av}))
    .sort((a, b) => b.kmh - a.kmh),
  tipos: TIPOS.map(t => { const s = velRows.filter(r => r.via.tipo === t).map(r => r.via.vel); return {tipo: t, rutas: s.length, mediana: round(median(s), 0), p10: round(quantile(s, .1), 0), p90: round(quantile(s, .9), 0), max: Math.max(...s)}; }),
  sin_trazado: oneWay(ld).length - velRows.length
};

/* ── 3 · Exceso de recorrido: km del tren frente a la línea recta entre origen y destino ── */
const rodeoRows = velRows.map(r => { const recta = metres(E[r.o].c, E[r.d].c) / 1000; return {r, recta}; })
  .filter(x => x.recta >= 50)
  // El trazado no puede ser más corto que la recta: hasta un −2 % es imprecisión de las coordenadas de estación (las rutas
  // con más diferencia ya salen como trazado incompleto en build-rutas), y cuenta como 0 %.
  .map(({r, recta}) => ({n: name(r), marca: r.marca, fam: r.fam, km: r.via.km, recta: round(recta, 0), exceso: Math.max(0, round(100 * (r.via.km - recta) / recta, 0)), trenes: r.lab, tipo: r.via.tipo}));
const rankRodeo = (rows, dir) => [...rows].sort((a, b) => dir * (a.exceso - b.exceso) || b.trenes - a.trenes).slice(0, 12);
const rodeo = {
  minimo_recta_km: 50, minimo_trenes: 3, rutas: rodeoRows.length, mediana: round(median(rodeoRows.map(x => x.exceso)), 0),
  mas: rankRodeo(rodeoRows.filter(x => x.trenes >= 3), -1), menos: rankRodeo(rodeoRows.filter(x => x.trenes >= 3), 1),
  mas_todas: rankRodeo(rodeoRows, -1), menos_todas: rankRodeo(rodeoRows, 1),
  tipos: TIPOS.map(t => ({tipo: t, rutas: rodeoRows.filter(x => x.tipo === t).length, mediana: round(median(rodeoRows.filter(x => x.tipo === t).map(x => x.exceso)), 0)}))
};

/* ── 4 · Lo que cuesta cada parada: dentro de una misma relación, trenes con más paradas tardan más.
   Pendiente (mínimos cuadrados) de minutos de viaje frente a número de paradas, solo con relaciones donde conviven
   trenes con distinto número de paradas (al menos 2 valores distintos y 3 trenes). ── */
function slope(pts) {
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, sxy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
  return sxx ? sxy / sxx : null;
}
const paradaRows = [];
for (const r of oneWay(R.rutas.filter(r => r.lab > 0 && r.o !== null && r.d !== null && r.o !== r.d))) {
  const t = A.tiempos[r.id]; if (!t || t.length < 3) continue;
  const pts = t.map(([, d, s]) => [s - 2, d]).filter(([s, d]) => d > 0 && s >= 0), xs = new Set(pts.map(p => p[0]));
  if (pts.length < 3 || xs.size < 2) continue;
  const m = slope(pts); if (m === null) continue;
  const minS = Math.min(...xs), maxS = Math.max(...xs);
  const fast = median(pts.filter(p => p[0] === minS).map(p => p[1])), slow = median(pts.filter(p => p[0] === maxS).map(p => p[1]));
  paradaRows.push({id: r.id, n: name(r), marca: r.marca, fam: r.fam, trenes: pts.length, min_paradas: minS, max_paradas: maxS,
    min_directo: fast, min_parador: slow, por_parada: round(m, 1), pts});
}
const paradas = {
  familias: FAMS.map(f => { const s = paradaRows.filter(r => r.fam === f); return {fam: f, relaciones: s.length, mediana: round(median(s.map(r => r.por_parada)), 1), p25: round(quantile(s.map(r => r.por_parada), .25), 1), p75: round(quantile(s.map(r => r.por_parada), .75), 1)}; }).filter(f => f.relaciones),
  // Todas las relaciones con sus trenes (un punto = un tren: paradas intermedias, minutos), de más a menos diferencia
  // entre el tren más directo y el que más para. El ejemplo inicial de cada servicio: la relación con más trenes.
  relaciones: paradaRows.map(({id, pts, ...x}) => ({...x, puntos: pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])}))
    .sort((a, b) => (b.min_parador - b.min_directo) - (a.min_parador - a.min_directo)),
  ejemplo: Object.fromEntries(FAMS.map(f => [f, [...paradaRows].filter(r => r.fam === f && r.max_paradas - r.min_paradas >= 2).sort((a, b) => b.trenes - a.trenes)[0]?.n]).filter(x => x[1]))
};

/* ── 5 · Espera media en Cercanías en la estación con más trenes de cada línea (en el sentido con más salidas),
   en hora punta y en hora valle.
   Espera esperada de quien llega al andén sin mirar el horario: Σ intervalo² ÷ (2 · Σ intervalo), que con
   intervalos regulares es la mitad del intervalo y con irregulares es mayor (los huecos largos pesan más). ── */
const PUNTA = [420, 570], VALLE = [600, 780];   // 7:00–9:30 y 10:00–13:00
const waitIn = (deps, [a, b]) => { const s = deps.filter(m => m >= a && m <= b).sort((x, y) => x - y); if (s.length < 2) return {trenes: s.length, espera: null, intervalo: null};
  const h = s.slice(1).map((m, i) => m - s[i]), sh = h.reduce((x, y) => x + y, 0); return {trenes: s.length, espera: round(h.reduce((x, y) => x + y * y, 0) / (2 * sh), 1), intervalo: round(sh / h.length, 1)}; };
const espera = {
  punta: PUNTA, valle: VALLE,
  lineas: R.rutas.filter(r => r.fam === 'Cercanías' && r.lab > 0 && A.esperas?.[r.id]).map(r => {
    const x = A.esperas[r.id], p = waitIn(x.sal, PUNTA), v = waitIn(x.sal, VALLE);
    return {linea: r.marca, nuc: r.nuc, desde: E[x.est].n, hacia: E[x.hacia].n, trenes: r.lab, punta: p, valle: v};
  }).filter(l => l.punta.espera !== null || l.valle.espera !== null).sort((a, b) => (a.punta.espera ?? 999) - (b.punta.espera ?? 999))
};

/* ── 6 · Fin de semana: trenes del sábado y del domingo frente a un laborable (miércoles) ── */
const act = R.rutas.filter(r => r.lab > 0);
const ratio = (rows, k) => { const l = rows.reduce((a, r) => a + r.lab, 0); return l ? round(100 * rows.reduce((a, r) => a + r[k], 0) / l, 0) : null; };
const finde = {
  familias: FAMS.map(f => { const s = act.filter(r => r.fam === f); return {fam: f, rutas: s.length, lab: s.reduce((a, r) => a + r.lab, 0), sab: ratio(s, 'sab'), dom: ratio(s, 'dom')}; }),
  nucleos: [...new Set(act.filter(r => r.fam === 'Cercanías').map(r => r.nuc))].map(n => { const s = act.filter(r => r.nuc === n); return {nuc: n, lineas: s.length, lab: s.reduce((a, r) => a + r.lab, 0), sab: ratio(s, 'sab'), dom: ratio(s, 'dom')}; }).sort((a, b) => b.lab - a.lab),
  // Rutas de media y larga distancia con 10 trenes o más un laborable que más servicio pierden el domingo. Cercanías se
  // compara por núcleo: por línea saldrían caídas falsas (la R2 circula el fin de semana como R2N y R2S).
  caidas: oneWay(act.filter(r => r.lab >= 10 && r.fam !== 'Cercanías' && r.o !== r.d)).map(r => ({n: name(r), marca: r.marca, fam: r.fam, lab: r.lab, sab: r.sab, dom: r.dom, pct_dom: round(100 * r.dom / r.lab, 0)}))
    .sort((a, b) => a.pct_dom - b.pct_dom || b.lab - a.lab).slice(0, 15),
  total: {lab: act.reduce((a, r) => a + r.lab, 0), sab: act.reduce((a, r) => a + r.sab, 0), dom: act.reduce((a, r) => a + r.dom, 0)}
};

/* ── 7 · Horas de servicio: de la primera a la última salida del miércoles, por ruta, comparadas por servicio ── */
const span = oneWay(R.rutas.filter(r => r.lab >= 2 && r.pri !== null && r.ult !== null && (r.fam === 'Cercanías' || (r.o !== null && r.d !== null && r.o !== r.d))));
const horas = {
  familias: FAMS.map(f => { const s = span.filter(r => r.fam === f); return {fam: f, rutas: s.length,
    pri: round(median(s.map(r => r.pri)), 0), ult: round(median(s.map(r => r.ult)), 0),
    pri_p10: round(quantile(s.map(r => r.pri), .1), 0), ult_p90: round(quantile(s.map(r => r.ult), .9), 0),
    horas: round(median(s.map(r => (r.ult - r.pri) / 60)), 1)}; }),
  rutas: span.map(r => ({n: name(r), marca: r.marca, fam: r.fam, pri: r.pri, ult: r.ult, horas: round((r.ult - r.pri) / 60, 1), trenes: r.lab})).sort((a, b) => b.horas - a.horas)
};

/* ── 9 · Electrificación por servicio, ponderada por trenes·km (cuánto servicio circula bajo catenaria) ── */
const elRows = oneWay(ld.filter(r => r.via && r.via.km && r.via.el !== null && r.via.el !== undefined));
const elOf = rows => { const tk = rows.reduce((a, r) => a + r.lab * r.via.km, 0); if (!tk) return null;
  const yes = rows.reduce((a, r) => a + r.lab * r.via.km * r.via.el / 100, 0), unk = rows.reduce((a, r) => a + r.lab * r.via.km * (r.via.elSin || 0) / 100, 0);
  return {trenkm: Math.round(tk), si: round(100 * yes / tk, 1), sin_dato: round(100 * unk / tk, 1), no: round(100 * (tk - yes - unk) / tk, 1)}; };
const electrificacion = {
  familias: FAMS.filter(f => f !== 'Cercanías').map(f => ({fam: f, rutas: elRows.filter(r => r.fam === f).length, ...elOf(elRows.filter(r => r.fam === f))})),
  total: elOf(elRows),
  diesel: elRows.filter(r => r.via.el < 50).map(r => ({n: name(r), marca: r.marca, fam: r.fam, km: r.via.km, el: r.via.el, trenes: r.lab})).sort((a, b) => b.trenes * b.km - a.trenes * a.km).slice(0, 12)
};

/* ── 10 · Cuota y precio en los cinco corredores de alta velocidad (CNMC, 2025) ── */
const competencia = CN.corredores.map(c => {
  const p = CN.precio_2025.find(x => x.trayecto === CN.trayecto_de[c.corredor]) || {};
  return {corredor: c.corredor, trayecto: p.trayecto || null, viajeros: c.a2025.viajeros,
    cuota: Object.entries(c.a2025.operadores).map(([op, o]) => ({op, cuota: o.cuota, viajeros: o.viajeros, ocupacion: o.ocupacion})).sort((a, b) => b.cuota - a.cuota),
    precio: [['Renfe', 'AVE', p['Renfe-AVE']], ['Renfe', 'Avlo', p['Renfe-AVLO']], ['iryo', 'iryo', p.Iryo], ['OUIGO', 'OUIGO', p.OUIGO]].map(([op, producto, eur]) => ({op, producto, eur: eur ?? null})),
    media: p.Total ?? null};
});

/* ── 11 · Densidad de red por comunidad: km de vía (ejes IGN con atributos, como la Cabina) por superficie y por habitante.
   Cada tramo se asigna a la comunidad donde cae su punto medio. ── */
const inRing = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const polysOf = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
const bboxOf = g => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of polysOf(g)) for (const [x, y] of p[0]) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } return b; };
const OUTSIDE = ['Canarias', 'Illes Balears', 'Balears, Illes', 'Ciudad Autónoma de Ceuta', 'Ciudad Autónoma de Melilla'];
const comms = DEMO.communities.features.filter(f => !OUTSIDE.includes(f.properties.name)).map(f => ({n: f.properties.name, pob: f.properties.population, area: f.properties.area, fecha: f.properties.date, prov: !!f.properties.provisional, g: f.geometry, bb: bboxOf(f.geometry), km: 0}));
const inComm = (pt, c) => pt[0] >= c.bb[0] && pt[0] <= c.bb[2] && pt[1] >= c.bb[1] && pt[1] <= c.bb[3] && polysOf(c.g).some(p => inRing(pt, p[0]) && !p.slice(1).some(h => inRing(pt, h)));
const uniq = [...new Map(rail.map(f => [f.properties.id, f])).values()].filter(f => f.properties.attr !== 0);
let kmTotal = 0, kmFuera = 0;
for (const f of uniq) {
  const g = f.geometry.coordinates, mid = g[Math.floor(g.length / 2)], k = (Number(f.properties.length_m) || 0) / 1000; kmTotal += k;
  let c = comms.find(x => inComm(mid, x));
  if (!c) { let bd = 5000; for (const x of comms) for (const p of polysOf(x.g)) for (let i = 0; i < p[0].length; i += 4) { const d = metres(mid, p[0][i]); if (d < bd) { bd = d; c = x; } } }   // costa y frontera (polígonos generalizados)
  if (c) c.km += k; else kmFuera += k;
}
const areaTot = comms.reduce((a, c) => a + c.area, 0), pobTot = comms.reduce((a, c) => a + c.pob, 0), kmAsig = comms.reduce((a, c) => a + c.km, 0);
const densidad = {
  fecha_poblacion: comms[0].fecha, provisional: comms.some(c => c.prov),
  comunidades: comms.map(c => ({n: c.n, km: round(c.km, 0), area: round(c.area, 0), pob: c.pob, m_km2: round(1000 * c.km / c.area, 0), km_100k: round(100000 * c.km / c.pob, 1)})).sort((a, b) => b.m_km2 - a.m_km2),
  total: {km: round(kmAsig, 0), km_red: round(kmTotal, 0), km_sin_comunidad: round(kmFuera, 0), m_km2: round(1000 * kmAsig / areaTot, 0), km_100k: round(100000 * kmAsig / pobTot, 1)}
};

/* ── 8 · Mapa de trenes por tramo (capas/analisis-mapa.json) ──
   Una sola red, los ejes IGN, con dos cuentas por tramo (trenes del miércoles, los dos sentidos):
   - media y larga distancia (alta velocidad, larga y media distancia, OUIGO e iryo): cada fila de rutas.json es un
     origen → destino de una marca y todos sus trenes hacen el recorrido completo, así que un tramo suma los trenes de las
     filas que pasan por él. Las filas con el trazado incompleto (huecos) suman en los tramos que sí se conocen;
   - Cercanías: los dibujos de línea del GTFS con los trenes que ocupan cada trozo (rutas-actividad.json · carga), ida y
     vuelta sumadas, casados con el eje IGN por el que circulan (a ≤ 35 m y con la misma dirección). Las líneas que
     comparten vía (C2, C7 y C8 en Madrid) se suman. Lo que no casa con ningún eje se dibuja aparte con su dibujo GTFS. */
const simplify = (pts, tol) => {   // Douglas-Peucker en grados (tol ≈ 0,002° ≈ 200 m)
  if (pts.length <= 2) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let mi = -1, md = tol; const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L; if (d > md) { md = d; mi = i; } }
    if (mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
};
const q = p => [round(p[0], 3), round(p[1], 3)];
const SV = read('capas/servicios.json'), VAR = new Map(SV.variants.map(v => [v.id, v])), FEAT = datos.rail.features;

// 1 · Media y larga distancia por eje IGN.
const ldLoad = new Map(), marcasOf = new Map();
let trenesSinTrazado = 0, filasSinTrazado = 0, trenesParcial = 0, filasParcial = 0;
for (const r of ld) {
  let ids = A.traces.routes[r.id]?.filter(id => id.startsWith('ign:')).map(id => +id.slice(4));
  if (!ids?.length && r.via?.incompleto) { const v = VAR.get(r.via.variante); if (v?.edges?.length) { ids = [...new Set(v.edges)].filter(f => FEAT[f]); filasParcial++; trenesParcial += r.lab; } }
  if (!ids?.length) { filasSinTrazado++; trenesSinTrazado += r.lab; continue; }
  for (const f of ids) { ldLoad.set(f, (ldLoad.get(f) || 0) + r.lab); if (!marcasOf.has(f)) marcasOf.set(f, new Set()); marcasOf.get(f).add(r.marca); }
}

// 2 · Cercanías: carga por trozo de cada línea (dibujo de ida + vuelta en el punto más cercano, ≤ 300 m).
const perPoint = id => { const g = A.traces.geometries[id], runs = A.traces.carga?.[id]; if (!g || !runs) return null; const n = []; for (const [c, len] of runs) for (let k = 0; k < len; k++) n.push(c); return {g, n}; };
const cerLines = [];
for (const id of Object.keys(A.traces.carga || {})) {
  if (id.endsWith('_INV') && A.traces.carga[id.slice(0, -4)]) continue;
  const fw = perPoint(id), bw = perPoint(id + '_INV'); if (!fw) continue;
  const n = fw.n.map((c, i) => { if (!bw) return c; const mid = [(fw.g[i][0] + fw.g[i + 1][0]) / 2, (fw.g[i][1] + fw.g[i + 1][1]) / 2]; let bi = -1, bd = 300;
    for (let j = 0; j < bw.n.length; j++) { const d = metres(mid, bw.g[j]); if (d < bd) { bd = d; bi = j; } } return c + (bi >= 0 ? bw.n[Math.min(bi, bw.n.length - 1)] : 0); });
  cerLines.push({id, g: fw.g, n});
}
// Geometría local en metros y rejilla de trozos de Cercanías.
const CELL = .0008, cellOf = (x, y) => Math.floor(x / CELL) + ':' + Math.floor(y / CELL);
const KX = lat => 111320 * Math.cos(lat * Math.PI / 180), KY = 110540;
const segDist = (p, a, b) => { const kx = KX(p[1]), ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * KY, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * KY, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0; return Math.hypot(ax + t * dx, ay + t * dy); };
const parallel = (u, v) => { const c = Math.abs(u[0] * v[1] - u[1] * v[0]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1); return c < .42; };   // < 25°
const dirOf = (a, b) => [(b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]];
const cerGrid = new Map(), cerSeg = [];
cerLines.forEach((L, li) => { for (let i = 0; i < L.n.length; i++) { if (!(L.n[i] > 0)) continue; const a = L.g[i], b = L.g[i + 1]; if (!b) continue;
  const k = cerSeg.length; cerSeg.push({li, i, a, b, n: L.n[i], len: metres(a, b), covered: false});
  for (let gx = Math.floor(Math.min(a[0], b[0]) / CELL); gx <= Math.floor(Math.max(a[0], b[0]) / CELL); gx++) for (let gy = Math.floor(Math.min(a[1], b[1]) / CELL); gy <= Math.floor(Math.max(a[1], b[1]) / CELL); gy++) { const key = gx + ':' + gy; if (!cerGrid.has(key)) cerGrid.set(key, []); cerGrid.get(key).push(k); } } });
const near = (grid, p) => { const gx = Math.floor(p[0] / CELL), gy = Math.floor(p[1] / CELL), out = new Set(); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const k of grid.get((gx + dx) + ':' + (gy + dy)) || []) out.add(k); return out; };
// Cada trozo de Cercanías se muestrea cada 25 m y cada punto se asigna SOLO al eje IGN más cercano (≤ 35 m, en paralelo y
// con ancho compatible: Cercanías no circula por ancho estándar, el de la alta velocidad). Asignarlo a todos los ejes
// cercanos sumaba Cercanías a la vía de alta velocidad que va pegada a la convencional (el GTFS tiene decenas de metros de
// imprecisión). Por eje y línea cuenta la carga máxima de sus puntos; las líneas que comparten eje se suman.
const MATCH = 35, ignGrid = new Map(), peninsularFeat = FEAT.map((f, k) => k).filter(k => CFG.peninsular(FEAT[k].geometry.coordinates[0]) && FEAT[k].properties.attr !== 0 && F.value(FEAT[k], 'gauge') !== '1435');
for (const k of peninsularFeat) { const g = FEAT[k].geometry.coordinates;
  for (let i = 1; i < g.length; i++) { const a = g[i - 1], b = g[i];
    for (let gx = Math.floor(Math.min(a[0], b[0]) / CELL); gx <= Math.floor(Math.max(a[0], b[0]) / CELL); gx++) for (let gy = Math.floor(Math.min(a[1], b[1]) / CELL); gy <= Math.floor(Math.max(a[1], b[1]) / CELL); gy++) { const key = gx + ':' + gy; if (!ignGrid.has(key)) ignGrid.set(key, []); ignGrid.get(key).push([k, i]); } } }
const cerByEdge = new Map();   // eje → (línea → carga máxima)
for (const S of cerSeg) {
  const steps = Math.max(1, Math.ceil(S.len / 25)), d = dirOf(S.a, S.b); let hits = 0;
  for (let t = 0; t < steps; t++) { const f = (t + .5) / steps, p = [S.a[0] + (S.b[0] - S.a[0]) * f, S.a[1] + (S.b[1] - S.a[1]) * f];
    let best = null, bd = MATCH; for (const [k, i] of near(ignGrid, p)) { const g = FEAT[k].geometry.coordinates, dist = segDist(p, g[i - 1], g[i]); if (dist < bd && parallel(d, dirOf(g[i - 1], g[i]))) { bd = dist; best = k; } }
    if (best === null) continue; hits++;
    if (!cerByEdge.has(best)) cerByEdge.set(best, new Map()); const m = cerByEdge.get(best), x = m.get(S.li) || {n: 0, m: 0}; x.n = Math.max(x.n, S.n); x.m += S.len / steps; m.set(S.li, x); }
  S.covered = hits * 2 >= steps;
}
// Una línea cuenta en un eje solo si lo recorre en al menos el 40 % de su longitud (o 150 m): unos pocos puntos en la boca
// de una estación no bastan (la R2 de Rodalies se sumaba al túnel Sants – Plaça de Catalunya, que no usa).
const edgeLen = k => Number(FEAT[k].properties.length_m) || 0;
const cerLoad = new Map([...cerByEdge].map(([k, m]) => [k, [...m.values()].filter(x => x.m >= Math.min(.4 * edgeLen(k), 150)).reduce((a, x) => a + x.n, 0)]).filter(([, n]) => n > 0));
const cerLen = cerSeg.reduce((a, S) => a + S.len, 0), cerCovered = cerSeg.filter(S => S.covered).reduce((a, S) => a + S.len, 0);
// Control: km de alta velocidad (prestaciones «hs») que reciben trenes de Cercanías. Debería ser casi nada.
const kmAvConCer = [...cerLoad.keys()].filter(k => FEAT[k].properties.perf === 'hs').reduce((a, k) => a + (Number(FEAT[k].properties.length_m) || 0) / 1000, 0);
// Trozos sin casar: se dibujan con su dibujo GTFS (tramos seguidos de la misma línea y la misma carga).
const cerExtra = [];
cerLines.forEach((L, li) => { const segsL = cerSeg.filter(S => S.li === li && !S.covered); let run = null;
  for (const S of segsL) { if (run && run.n === S.n && run.end === S.i) { run.pts.push(S.b); run.end = S.i + 1; } else { if (run) cerExtra.push(run); run = {n: S.n, pts: [S.a, S.b], end: S.i + 1}; } }
  if (run) cerExtra.push(run); });

// Salida: un elemento por eje IGN con trenes [media y larga distancia, Cercanías, geometría].
const edges = [...new Set([...ldLoad.keys(), ...cerLoad.keys()])].map(k => ({k, ld: ldLoad.get(k) || 0, cer: cerLoad.get(k) || 0, g: simplify(FEAT[k].geometry.coordinates, .002).map(q)}))
  .filter(e => e.g.length >= 2);
const nearestSt = (() => { const st = E.map((s, i) => ({s, i})).filter(x => x.s.c && CFG.peninsular(x.s.c)); return c => { let b = null, bd = Infinity; for (const x of st) { const d = metres(c, x.s.c); if (d < bd) { bd = d; b = x.s.n; } } return b; }; })();
// El tramo más cargado de cada zona: se descartan los que están a menos de `radio` km de uno ya elegido (si no, la lista
// entera sería el mismo corredor, tramo a tramo).
const top = (list, val, k, radio) => { const picked = [], out = [];
  for (const x of [...list].filter(x => val(x) > 0).sort((a, b) => val(b) - val(a))) { const mid = x.g[Math.floor(x.g.length / 2)];
    if (picked.some(p => metres(p, mid) < radio * 1000)) continue; picked.push(mid);
    const ends = [nearestSt(x.g[0]), nearestSt(x.g.at(-1))].filter((v, i, a) => a.indexOf(v) === i);
    out.push({trenes: val(x), ld: x.ld || 0, cer: x.cer || 0, entre: ends.join(' – '), marcas: x.k !== undefined && marcasOf.has(x.k) ? [...marcasOf.get(x.k)].sort() : []}); if (out.length >= k) break; }
  return out; };
const mapa = {
  version: 2, referencia: WD,
  nota: 'Trenes programados el miércoles en los dos sentidos, por eje IGN: media y larga distancia y Cercanías (casada con el eje por el que circula).',
  regiones: datos.regions.features.filter(f => !['Canarias', 'Illes Balears', 'Ciudad de Ceuta', 'Ciudad de Melilla', 'Ceuta', 'Melilla'].includes(f.properties.NAME_LATN))
    .map(f => polysOf(f.geometry).map(p => simplify(p[0], .01).map(q)).filter(r => r.length > 3)),
  ign: edges.sort((a, b) => (a.ld + a.cer) - (b.ld + b.cer)).map(e => [e.ld, e.cer, e.g]),
  cer_extra: cerExtra.map(r => [r.n, simplify(r.pts, .002).map(q)]).filter(r => r[1].length >= 2),
  resumen: {tramos: edges.length, max_total: Math.max(...edges.map(e => e.ld + e.cer)), max_ld: Math.max(...edges.map(e => e.ld)), max_cer: Math.max(...edges.map(e => e.cer), ...cerExtra.map(r => r.n)),
    filas_sin_trazado: filasSinTrazado, trenes_sin_trazado: trenesSinTrazado, filas_parcial: filasParcial, trenes_parcial: trenesParcial,
    cobertura_cer: round(100 * cerCovered / cerLen, 1), km_cer_sin_casar: round((cerLen - cerCovered) / 1000, 0), km_av_con_cer: round(kmAvConCer, 1)},
  top: {total: top(edges, x => x.ld + x.cer, 10, 30), ld: top(edges, x => x.ld, 10, 40), cer: top(edges, x => x.cer, 10, 15)}
};
const analisis = {
  version: 1, generado_con: 'tools/build-cabina-analisis.mjs', referencia: R.referencia,
  fuentes: {rutas: 'Horarios publicados (Renfe, OUIGO, iryo): tools/build-rutas.mjs', cnmc: CN.licencia, poblacion: 'INE · ' + densidad.fecha_poblacion + (densidad.provisional ? ' (provisional)' : '')},
  capitales, velocidad, rodeo, paradas, espera, finde, horas, mapa: mapa.resumen, electrificacion, competencia, cnmc_nota: CN.notas, densidad
};
const out = JSON.stringify(analisis) + '\n', outMap = JSON.stringify(mapa) + '\n';
if (process.argv.includes('--check')) {
  const same = f => fs.existsSync(f) && fs.readFileSync(f, 'utf8');
  if (same(OUT) !== out || same(OUT_MAP) !== outMap) { console.error('capas/analisis.json o capas/analisis-mapa.json no están al día: node tools/build-cabina-analisis.mjs'); process.exit(1); }
  console.log('capas/analisis.json y analisis-mapa.json al día');
} else {
  fs.writeFileSync(OUT, out); fs.writeFileSync(OUT_MAP, outMap);
  console.log('Escrito capas/analisis.json', (out.length / 1024).toFixed(0) + ' KB · analisis-mapa.json', (outMap.length / 1024).toFixed(0) + ' KB');
  console.log('  capitales', capitales.length, '· rutas con velocidad', velRows.length, '· rodeo', rodeoRows.length, '· relaciones con paradas distintas', paradaRows.length, '· líneas de Cercanías con espera', espera.lineas.length);
  console.log('  red asignada', densidad.total.km, 'de', densidad.total.km_red, 'km · sin comunidad', densidad.total.km_sin_comunidad, 'km');
  console.log('  mapa', JSON.stringify(mapa.resumen));
}
