/* Red IGN del visor con las mismas correcciones que aplica atlas.js al cargar, para que Cabina, la tabla de rutas y el
   visor midan la red igual:
   - ancho completado (capas/ancho.json · applyGauge): Adif, IGN mixto, red métrica y topología;
   - electrificación y ancho de la línea de Adif donde el IGN no los da (capas/lineas-adif.json · relleno, fillFromLine);
   - clasificación con las reglas del visor (filtros.js · AtlasFilters.prepare) y ámbito peninsular (capas-config.js).
   Uso: const {datos, rail, F, C, CFG} = loadRed(V); `datos.rail.features[fid]` conserva el índice que usan los
   recorridos de servicios.json (`edges`). */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function visorModules(V) {
  const ctx = {console};
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['filtros.js', 'cartography.js', 'capas-config.js']) vm.runInContext(fs.readFileSync(path.join(V, f), 'utf8'), ctx, {filename: f});
  return {F: ctx.AtlasFilters, C: ctx.AtlasCartography, CFG: ctx.AtlasConfig};
}

export function loadRed(V) {
  const read = f => JSON.parse(fs.readFileSync(path.join(V, f), 'utf8'));
  const {F, C, CFG} = visorModules(V);
  const datos = read('datos.json'), ancho = read('capas/ancho.json'), adif = read('capas/lineas-adif.json');
  const gaugeFix = new Map();
  for (const [key, ids] of Object.entries(ancho.groups)) { const [value, src] = key.split('|'); if (value === 'unknown') continue; for (const id of ids) gaugeFix.set('FFCC_TR' + id, [value, src]); }
  for (const f of datos.rail.features) {
    const p = f.properties, x = gaugeFix.get(p.id); if (x) { p.gauge_fix = x[0]; p.gauge_src = x[1]; }
    const r = adif.relleno?.[p.id];
    if (r) {
      if ('e' in r && (p.electrified === null || p.electrified === undefined)) { p.electrified = r.e === 1; p.fill_e = 1; }
      if ('g' in r && !(p.nominalgauge > 0)) { p.nominalgauge = r.g; p.fill_g = 1; }
    }
    F.prepare(f);
  }
  const rail = datos.rail.features.filter(f => CFG.peninsular(f.geometry.coordinates[0]));
  return {datos, rail, ancho, F, C, CFG};
}
