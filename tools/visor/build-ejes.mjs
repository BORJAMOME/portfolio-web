// Eje de cada tramo de la red IGN (fase 3 del plan de filtros, FILTROS_ARQUITECTURA.md 3.2 y 3.3).
// Genera visor-ferroviario/capas/ejes.json con tres listas alineadas con datos.json (índice = tramo):
//   linea: código de línea de Adif · rfig: eje del catálogo (dos primeras cifras) · lectura: eje de lectura.
// Método:
//   1. «adif»: el tramo tiene su línea en lineas-adif.json (relleno).
//   2. «propagado»: tramo de Adif sin línea; hereda la del tramo con línea más cercano siguiendo la red
//      (Dijkstra con varias fuentes, solo por tramos de Adif y hasta MAX_KM). Es una deducción [D] y se marca así.
//      Trozos aislados de Adif: la línea del extremo con línea más cercano en línea recta (≤ 3 km).
//   3. LFP (Figueres–Perpignan, sin código de Adif): eje de lectura «noreste».
//   El resto (redes autonómicas, urbanas, portuarias…) queda sin eje.
//   node tools/visor/build-ejes.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V = path.join(ROOT, 'visor-ferroviario');
const T = createRequire(import.meta.url)(path.join(V, 'taxonomia.js'));
const OUT = path.join(V, 'capas', 'ejes.json');
const MAX_KM = 60;
const ADIF = new Set(['adif', 'adifav']);

export function buildEjes(rail, adif) {
  const f = rail.features, n = f.length;
  const key = c => c[0].toFixed(5) + ',' + c[1].toFixed(5);
  const ends = f.map(x => {const c = x.geometry?.coordinates; return c?.length ? [key(c[0]), key(c.at(-1))] : null;});
  const byNode = new Map();
  ends.forEach((e, i) => e && e.forEach(k => {if (!byNode.has(k)) byNode.set(k, []); byNode.get(k).push(i);}));
  const linea = new Array(n).fill(null), metodo = new Array(n).fill(null), dist = new Float64Array(n).fill(Infinity);
  // Cola de prioridad mínima (montículo binario) sobre [distancia, tramo].
  const heap = [];
  const push = (d, i) => {heap.push([d, i]); let k = heap.length - 1; while (k) {const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p;}};
  const pop = () => {const top = heap[0], last = heap.pop(); if (heap.length) {heap[0] = last; let k = 0; for (;;) {const l = 2 * k + 1, r = l + 1; let m = k;
    if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;}} return top;};
  f.forEach((x, i) => {const l = adif.relleno[x.properties.id]?.l; if (l && T.ejeRfigDe(l)) {linea[i] = l; metodo[i] = 'adif'; dist[i] = 0; push(0, i);}});
  while (heap.length) {
    const [d, i] = pop(); if (d > dist[i]) continue;
    for (const k of ends[i] || []) for (const j of byNode.get(k)) {
      if (j === i || !ADIF.has(f[j].properties.net)) continue;
      const nd = d + (f[j].properties.length_m || 0) / 1000;
      if (nd > MAX_KM || nd >= dist[j]) continue;
      dist[j] = nd; linea[j] = linea[i]; metodo[j] = metodo[j] === 'adif' ? 'adif' : 'propagado'; push(nd, j);
    }
  }
  // Trozos de Adif aislados (sin conexión con un tramo con línea): la del extremo con línea más cercano en línea recta, hasta 3 km.
  const labelled = []; f.forEach((x, i) => {if (linea[i]) {const c = x.geometry.coordinates; labelled.push([c[0], i], [c.at(-1), i]);}});
  const metres = (a, b) => {const k = Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111320;};
  f.forEach((x, i) => {
    if (linea[i] || !ADIF.has(x.properties.net) || !x.geometry?.coordinates?.length) return;
    const c = x.geometry.coordinates; let best = null, bm = 3000;
    for (const [p, j] of labelled) for (const q of [c[0], c.at(-1)]) {const m = metres(p, q); if (m < bm) {bm = m; best = j;}}
    if (best !== null) {linea[i] = linea[best]; metodo[i] = 'propagado';}
  });
  const rfig = linea.map(l => l ? T.ejeRfigDe(l) : null);
  const lectura = rfig.map((r, i) => {
    if (r) return T.ejeLineas[linea[i]] || T.ejeRfig.find(e => e.id === r)?.lectura || 'otros';
    return f[i].properties.net === 'lfp' ? 'noreste' : null;
  });
  const km = (pred) => Math.round(f.reduce((s, x, i) => s + (pred(i) ? x.properties.length_m || 0 : 0), 0) / 1000);
  const meta = {version: 1, generado_con: 'tools/visor/build-ejes.mjs', fuente: adif.meta?.cita || 'lineas-adif.json',
    metodo: `Línea de Adif del tramo (lineas-adif.json) o, si no la tiene, la del tramo de Adif con línea más cercano por la red (hasta ${MAX_KM} km; trozos aislados, el extremo con línea más cercano a menos de 3 km; deducción [D]). LFP → noreste.`,
    cobertura: {tramos: n, adif: metodo.filter(m => m === 'adif').length, propagado: metodo.filter(m => m === 'propagado').length,
      km_adif_con_eje: km(i => lectura[i] && ADIF.has(f[i].properties.net)), km_adif_sin_eje: km(i => !lectura[i] && ADIF.has(f[i].properties.net))}};
  return {meta, linea, metodo: metodo.map(m => m === 'adif' ? 1 : m === 'propagado' ? 2 : 0), rfig, lectura};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const rail = JSON.parse(fs.readFileSync(path.join(V, 'datos.json'), 'utf8')).rail;
  const adif = JSON.parse(fs.readFileSync(path.join(V, 'capas', 'lineas-adif.json'), 'utf8'));
  const txt = JSON.stringify(buildEjes(rail, adif)) + '\n';
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== txt) {console.error('✗ capas/ejes.json desactualizado. Ejecuta: node tools/visor/build-ejes.mjs'); process.exit(1);}
    console.log('✓ capas/ejes.json al día');
  } else {fs.writeFileSync(OUT, txt); const m = JSON.parse(txt).meta.cobertura; console.log('capas/ejes.json:', JSON.stringify(m));}
}
