#!/usr/bin/env node
/* Repara los anillos mal anidados de visor-ferroviario/capas/demografia.json.
   En 13 territorios un anillo llegaba como «agujero» de un islote de 4 puntos. En Cataluña era el contorno principal:
   un punto de Barcelona quedaba fuera de la comunidad (195 estaciones y 2.155 km de vía, en un cálculo de punto en
   polígono). En el resto eran islotes y no cambiaban el resultado. La reparación reconstruye cada polígono por inclusión: un anillo contenido en un número par de
   anillos es exterior; en uno impar, es agujero del exterior más pequeño que lo contiene. Exteriores en sentido
   antihorario y agujeros en horario (RFC 7946). Solo se reescriben las geometrías afectadas; el resto del archivo queda igual.
     node tools/repair-demografia.mjs          repara
     node tools/repair-demografia.mjs --check  falla si queda algún territorio mal anidado */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'visor-ferroviario', 'capas', 'demografia.json');
const LEVELS = ['municipalities', 'provinces', 'communities'];

const signed = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };   // > 0: antihorario
const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const bbox = r => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of r) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } return b; };
const within = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const polys = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;

export function misnested(g) {
  return polys(g).some(p => { const o = Math.abs(signed(p[0])); return p.slice(1).some(h => Math.abs(signed(h)) > o * 1.0001); });
}

export function repair(g) {
  const rings = polys(g).flat().map(r => ({r, a: Math.abs(signed(r)), b: bbox(r)}));
  // Punto de prueba: varios vértices y mayoría, por si un anillo comparte algún vértice con otro.
  const contains = (outer, inner) => { if (outer.a <= inner.a || !within(inner.b, outer.b)) return false;
    const step = Math.max(1, Math.floor(inner.r.length / 5)); let yes = 0, n = 0; for (let i = 0; i < inner.r.length - 1 && n < 5; i += step, n++) if (inRing(inner.r[i], outer.r)) yes++; return yes * 2 > n; };
  for (const x of rings) { x.parents = rings.filter(y => y !== x && contains(y, x)); x.depth = x.parents.length; }
  const outers = rings.filter(x => x.depth % 2 === 0), out = new Map(outers.map(o => [o, [o.r]]));
  for (const h of rings.filter(x => x.depth % 2 === 1)) {
    const parent = h.parents.filter(p => p.depth === h.depth - 1).sort((a, b) => a.a - b.a)[0];
    if (parent) out.get(parent).push(h.r);
  }
  const orient = (r, ccw) => (signed(r) > 0) === ccw ? r : [...r].reverse();
  const coords = [...out.values()].map(([o, ...hs]) => [orient(o, true), ...hs.map(h => orient(h, false))]);
  return coords.length === 1 ? {type: 'Polygon', coordinates: coords[0]} : {type: 'MultiPolygon', coordinates: coords};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let text = fs.readFileSync(FILE, 'utf8');
  const data = JSON.parse(text), fixed = [];
  for (const level of LEVELS) for (const f of data[level].features) {
    if (!misnested(f.geometry)) continue;
    if (process.argv.includes('--check')) { fixed.push(level + ': ' + f.properties.name); continue; }
    // Una comunidad uniprovincial (Cantabria, Illes Balears) repite la geometría de su provincia: se reparan las dos.
    const before = JSON.stringify(f.geometry), g = repair(f.geometry), after = JSON.stringify(g);
    if (misnested(g)) throw new Error('La reparación no basta para ' + f.properties.name);
    if (!text.includes(before)) { if (text.includes(after)) { fixed.push(level + ': ' + f.properties.name + ' (misma geometría que su provincia)'); continue; } throw new Error('No encuentro la geometría de ' + f.properties.name); }
    text = text.split(before).join(after);
    fixed.push(level + ': ' + f.properties.name);
  }
  if (process.argv.includes('--check')) {
    if (fixed.length) { console.error('Territorios con anillos mal anidados en demografia.json (node tools/repair-demografia.mjs):\n  ' + fixed.join('\n  ')); process.exit(1); }
    console.log('demografia.json sin anillos mal anidados');
  } else {
    if (fixed.length) fs.writeFileSync(FILE, text);
    console.log(fixed.length ? 'Reparados ' + fixed.length + ':\n  ' + fixed.join('\n  ') : 'Nada que reparar');
  }
}
