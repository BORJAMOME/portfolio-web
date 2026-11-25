#!/usr/bin/env node
/* Trenes de viajeros por tramo IGN en un día laborable (ambos sentidos), para el grosor «por tráfico» del visor.
   Entrada (ya generada por tools/build-rutas.mjs con los GTFS públicos):
     - capas/rutas.json: cada ruta con sus trenes en día laborable (`lab`). En AV, larga y media distancia una ruta es
       una relación origen → destino en un sentido; en Cercanías, una línea con los dos sentidos juntos.
     - capas/rutas-actividad.json (`traces.routes`): por dónde va cada ruta. AV/LD/MD: lista de tramos IGN (`ign:<fid>`,
       índice de datos.rail.features). Cercanías: trazado GTFS (`gtfs:<shape>`), que aquí se ajusta a los tramos IGN.
   Ajuste de Cercanías: un tramo IGN pertenece al trazado si al menos el 85 % de sus puntos (vértices y puntos cada 50 m)
   está a menos de 20 m del trazado GTFS. Los tramos paralelos a más de 20 m (p. ej. una línea de alta velocidad junto
   a la convencional) no se asignan.
   Límites: solo viajeros (sin mercancías); una ruta = un recorrido representativo; las rutas sin trazado no suman y
   se cuentan en `cobertura`.
   Salida: visor-ferroviario/capas/trafico-tramos.json   ·   node tools/visor/trafico-tramos.mjs [--check] */
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const V = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "visor-ferroviario");
const OUT = join(V, "capas", "trafico-tramos.json");
const read = f => JSON.parse(readFileSync(join(V, f), "utf8"));
const TOL = 20, SHARE = 0.85, STEP = 50;
const FAMILIES = ["Alta velocidad", "Avant", "Intercity", "Regional", "Cercanías"];

const rutas = read("capas/rutas.json"), traces = read("capas/rutas-actividad.json").traces, rail = read("datos.json").rail.features;

// Proyección local equirectangular (metros), suficiente para distancias de decenas de metros.
const R = 6371008.8, rad = Math.PI / 180;
const project = (lon, lat, lat0) => [lon * rad * R * Math.cos(lat0 * rad), lat * rad * R];
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function bbox(coords) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
}
const railBoxes = rail.map(f => bbox(f.geometry.coordinates));

// Tramos IGN cubiertos por un trazado GTFS (lista de [lon, lat]).
function matchShape(xy) {
  const lat0 = xy[Math.floor(xy.length / 2)][1], cell = 200, grid = new Map();
  const pts = xy.map(([x, y]) => project(x, y, lat0));
  const key = (i, j) => i + "," + j;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const i0 = Math.floor((Math.min(a[0], b[0]) - TOL) / cell), i1 = Math.floor((Math.max(a[0], b[0]) + TOL) / cell);
    const j0 = Math.floor((Math.min(a[1], b[1]) - TOL) / cell), j1 = Math.floor((Math.max(a[1], b[1]) + TOL) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = key(i, j); if (!grid.has(c)) grid.set(c, []); grid.get(c).push(k); }
  }
  const near = p => {
    const list = grid.get(key(Math.floor(p[0] / cell), Math.floor(p[1] / cell)));
    if (list) for (const k of list) if (segDist(p, pts[k], pts[k + 1]) <= TOL) return true;
    return false;
  };
  const sb = bbox(xy), pad = 0.002, out = [];
  rail.forEach((f, fid) => {
    // Cercanías no circula por las líneas de alta velocidad: un tramo así junto al trazado es otra línea.
    if (f.properties.perf === "hs") return;
    const b = railBoxes[fid];
    if (b[2] < sb[0] - pad || b[0] > sb[2] + pad || b[3] < sb[1] - pad || b[1] > sb[3] + pad) return;
    const line = f.geometry.coordinates.map(([x, y]) => project(x, y, lat0)), samples = [];
    for (let k = 0; k < line.length; k++) {
      samples.push(line[k]);
      if (k + 1 < line.length) {
        const a = line[k], c = line[k + 1], n = Math.floor(Math.hypot(c[0] - a[0], c[1] - a[1]) / STEP);
        for (let s = 1; s <= n; s++) samples.push([a[0] + (c[0] - a[0]) * s / (n + 1), a[1] + (c[1] - a[1]) * s / (n + 1)]);
      }
    }
    let hits = 0;
    for (const p of samples) if (near(p)) hits++;
    if (hits / samples.length >= SHARE) out.push(fid);
  });
  return out;
}

// --diagnostico: kilómetros IGN asignados frente a kilómetros del trazado GTFS en cada línea de Cercanías.
const diagnose = process.argv.includes("--diagnostico"), diagnostics = [];
const lengthKm = c => { let s = 0; for (let i = 1; i < c.length; i++) s += Math.hypot((c[i][0] - c[i - 1][0]) * 111.32 * Math.cos(c[i][1] * rad), (c[i][1] - c[i - 1][1]) * 110.57); return s; };
const flow = new Map(); // fid → [total, ...por familia]
const coverage = {trenes: 0, trazados: 0, por_familia: {}};
for (const ruta of rutas.rutas) {
  const lab = Number(ruta.lab) || 0, fam = FAMILIES.indexOf(ruta.fam);
  coverage.trenes += lab;
  const pf = coverage.por_familia[ruta.fam] ||= {trenes: 0, trazados: 0};
  pf.trenes += lab;
  const trace = traces.routes[ruta.id];
  if (!trace?.length || !lab) continue;
  const fids = new Set();
  for (const ref of trace) {
    const [kind, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
    if (kind === "ign") fids.add(Number(id));
    else if (kind === "gtfs" && traces.geometries[ref]) for (const fid of matchShape(traces.geometries[ref])) fids.add(fid);
  }
  if (diagnose && trace[0].startsWith("gtfs:")) {
    const shapeKm = Math.max(...trace.map(ref => traces.geometries[ref] ? lengthKm(traces.geometries[ref]) : 0));
    const ignKm = [...fids].reduce((s, fid) => s + (Number(rail[fid]?.properties.length_m) || 0) / 1000, 0);
    diagnostics.push([ruta.id, Math.round(shapeKm * 10) / 10, Math.round(ignKm * 10) / 10, Math.round(ignKm / shapeKm * 100) / 100]);
  }
  if (!fids.size) continue;
  coverage.trazados += lab; pf.trazados += lab;
  for (const fid of fids) {
    if (!rail[fid]) continue;
    const row = flow.get(fid) || new Array(FAMILIES.length + 1).fill(0);
    row[0] += lab; if (fam >= 0) row[fam + 1] += lab;
    flow.set(fid, row);
  }
}

const tramos = [...flow.entries()].sort((a, b) => a[0] - b[0]).map(([fid, row]) => [fid, ...row]);
const result = {
  version: 1,
  generado: rutas.generado,
  generado_con: "tools/visor/trafico-tramos.mjs",
  referencia: rutas.referencia,
  unidad: "trenes de viajeros en día laborable, ambos sentidos",
  columnas: ["fid", "total", ...FAMILIES],
  cobertura: coverage,
  notas: [
    "Solo servicios de viajeros con GTFS público (Renfe, Cercanías, iryo y OUIGO); no incluye mercancías ni otros operadores.",
    "Cada ruta suma sus trenes en todos los tramos de un recorrido representativo; las variantes de itinerario no se separan.",
    "Cercanías: trazado GTFS ajustado a los tramos IGN (85 % de puntos a menos de 20 m)."
  ],
  tramos
};
if (diagnose) { for (const d of diagnostics.sort((x, y) => x[3] - y[3])) console.log(d.join("\t")); process.exit(0); }
const text = JSON.stringify(result) + "\n";
const max = tramos.reduce((m, t) => Math.max(m, t[1]), 0);
console.log(`${tramos.length} tramos con tráfico · máximo ${max} trenes/día · cobertura ${Math.round(coverage.trazados / coverage.trenes * 1000) / 10} % de los trenes · ${(text.length / 1024).toFixed(0)} KB`);
if (process.argv.includes("--check")) {
  if (!existsSync(OUT) || readFileSync(OUT, "utf8") !== text) { console.error("capas/trafico-tramos.json no está al día: node tools/visor/trafico-tramos.mjs"); process.exit(1); }
} else writeFileSync(OUT, text);
