// Cercanías de todos los núcleos para el visor (fase 4 del plan de filtros, FILTROS_ARQUITECTURA.md sección 4).
// Genera visor-ferroviario/capas/cercanias.json a partir de lo que ya produce la tarea semanal:
//   - rutas.json: una fila por línea y núcleo, con su color, nombre y bloque tx (anotar-taxonomia.mjs).
//   - rutas-actividad.json: los dibujos de cada línea (shapes.txt del GTFS oficial fomento_transit.zip).
// Los dibujos se simplifican (Douglas-Peucker, TOL_M) y se redondean a 5 decimales (~1 m) para que el archivo
// sea pequeño: el visor lo carga solo al marcar Cercanías.
//   node tools/visor/build-cercanias.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const C = path.join(ROOT, 'visor-ferroviario', 'capas');
const OUT = path.join(C, 'cercanias.json');
const TOL_M = 12;

const metres = (a, b) => {const k = Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111320;};
function segDist(p, a, b) {
  const k = Math.cos(p[1] * Math.PI / 180), ax = a[0] * k, ay = a[1], bx = b[0] * k, by = b[1], px = p[0] * k, py = p[1];
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111320;
}
function simplify(pts) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop(); let m = -1, md = TOL_M;
    for (let k = i + 1; k < j; k++) {const d = segDist(pts[k], pts[i], pts[j]); if (d > md) {md = d; m = k;}}
    if (m > 0) {keep[m] = 1; stack.push([i, m], [m, j]);}
  }
  return pts.filter((_, k) => keep[k]);
}
const r5 = x => Math.round(x * 1e5) / 1e5;

export function buildCercanias(rutas, actividad) {
  const traces = actividad.traces || {routes: {}, geometries: {}};
  const geoms = {}, lineas = [];
  for (const row of rutas.rutas.filter(x => x.src === 'cercanias')) {
    const ids = (traces.routes[row.id] || []).filter(g => traces.geometries[g]);
    for (const g of ids) geoms[g] ??= simplify(traces.geometries[g]).map(([x, y]) => [r5(x), r5(y)]);
    lineas.push({id: row.id, nuc: row.tx?.nuc || null, nucleo: row.nuc, lin: row.marca, nombre: row.linea, color: row.color,
      tx: row.tx || null, lab: row.lab, sem: row.sem, km: row.via?.km ?? null, ancho: row.via?.ancho ?? null, geom: ids});
  }
  const km = Math.round(Object.values(geoms).reduce((s, g) => s + g.slice(1).reduce((a, p, i) => a + metres(g[i], p), 0), 0) / 1000);
  return {meta: {version: 1, generado_con: 'tools/visor/build-cercanias.mjs', semana: rutas.referencia?.semana || null,
    fuente: 'Renfe · GTFS Cercanías fomento_transit.zip (shapes.txt), CC BY 4.0 · Origen de los datos: Renfe Operadora',
    simplificacion_m: TOL_M, lineas: lineas.length, sin_dibujo: lineas.filter(l => !l.geom.length).map(l => l.id), km_dibujados: km},
    lineas, geometries: geoms};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const read = f => JSON.parse(fs.readFileSync(path.join(C, f), 'utf8'));
  const txt = JSON.stringify(buildCercanias(read('rutas.json'), read('rutas-actividad.json'))) + '\n';
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== txt) {console.error('✗ capas/cercanias.json desactualizado. Ejecuta: node tools/visor/build-cercanias.mjs'); process.exit(1);}
    console.log('✓ capas/cercanias.json al día');
  } else {
    fs.writeFileSync(OUT, txt); const m = JSON.parse(txt).meta;
    console.log(`capas/cercanias.json: ${m.lineas} líneas, ${m.km_dibujados} km, ${(txt.length / 1024).toFixed(0)} KB; sin dibujo: ${m.sin_dibujo.join(', ') || 'ninguna'}`);
  }
}
