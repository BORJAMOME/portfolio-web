// Escribe el bloque de clasificación `tx` en servicios.json y rutas.json con los ids del diccionario único
// (visor-ferroviario/taxonomia.js). Fase 2 del plan de filtros (FILTROS_ARQUITECTURA.md, secciones 3 y 4).
// El bloque se llama `tx` y no `d` porque en rutas.json `d` ya es la estación de destino.
//   node tools/visor/anotar-taxonomia.mjs           anota los dos archivos (idempotente)
//   node tools/visor/anotar-taxonomia.mjs --check   falla si algún archivo no está anotado o está desfasado
// Se ejecuta en la tarea semanal (rutas-semanal.yml) después de regenerar los datos.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V = path.join(ROOT, 'visor-ferroviario');
const T = createRequire(import.meta.url)(path.join(V, 'taxonomia.js'));
const FILES = {servicios: path.join(V, 'capas', 'servicios.json'), rutas: path.join(V, 'capas', 'rutas.json'), cortes: path.join(V, 'capas', 'cortes.json')};

const addDays = (iso, d) => {const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10);};
// Regla única de vigencia (sección 2): la misma que usa el visor (capas.js y ruta.js leen el corte de servicios.json).
export const futureFrom = cutoff => addDays(cutoff, 31);
export function vigenciaDe(validity, cutoff) {
  if (!validity) return 'sin-oferta';
  if (validity.to < cutoff) return 'sin-oferta';
  if (validity.from >= futureFrom(cutoff)) return 'futura';
  return 'vigente';
}

const OP_BY_SOURCE = {'renfe-national': 'renfe', 'renfe-commuter': 'renfe', 'ouigo-horarios': 'ouigo', renfe: 'renfe', cercanias: 'renfe', ouigo: 'ouigo', iryo: 'iryo'};
const CAL_BY_SOURCE = {'renfe-national': 'oficial', 'renfe-commuter': 'oficial', 'ouigo-horarios': 'reconstruido', renfe: 'oficial', cercanias: 'oficial', ouigo: 'reconstruido', iryo: 'comunitario'};
export const marcaDeVariante = v => v.source === 'renfe-commuter' ? 'cercanias' : T.get('marca', v.published_brand)?.id || null;

/* Cortes de vía (capas/cortes.json): una relación queda «suspendida» si pasa por las dos estaciones de un corte activo
   y el corte está confirmado (`aplicar: true`). Sin confirmar, el corte se documenta pero no cambia la vigencia. */
const norm = T.normalize;
const activos = (cortes, cutoff) => (cortes?.cortes || []).filter(c => c.aplicar && c.desde <= cutoff && (!c.hasta || c.hasta >= cutoff));
const cruza = (names, corte) => corte.entre.every(lado => lado.some(n => names.some(s => norm(s).startsWith(norm(n)))));

export function clasificarVariante(v, {stations, cutoff, cortes}) {
  const marca = marcaDeVariante(v);
  const nuc = v.network ? T.get('nucleo', String(v.network))?.id || null : null;
  const fuera = (v.calls || []).map(c => stations[c.s]).filter(s => s && s.spain === false);
  const amb = !fuera.length ? 'nacional' : fuera.some(s => s.coordinates[0] < -6) ? 'internacional-pt' : 'internacional-fr';
  let vig = vigenciaDe(v.validity, cutoff);
  if (vig === 'vigente') {
    const names = (v.calls || []).map(c => stations[c.s]?.name).filter(Boolean);
    if (activos(cortes, cutoff).some(c => cruza(names, c))) vig = 'suspendida';
  }
  const cal = !(v.edges?.length) && !v.geometry ? 'sin-trazado' : CAL_BY_SOURCE[v.source] || null;
  return {op: OP_BY_SOURCE[v.source] || null, fam: T.familiaDe(marca), marca,
    reg: T.regimenDe(marca, {origen: v.origin, destino: v.destination, nucleo: v.network ? String(v.network) : null}),
    amb, nuc, lin: marca === 'cercanias' ? v.published_brand || null : null, vig, cal};
}

export function clasificarRuta(row, {estaciones, variantes}) {
  const marca = row.src === 'cercanias' ? 'cercanias' : T.get('marca', row.marca)?.id || null;
  const nuc = row.nuc ? T.get('nucleo', row.nuc)?.id || null : null;
  const name = i => estaciones[i]?.n;
  const ligada = row.via?.variante ? variantes.get(row.via.variante) : null;
  return {op: OP_BY_SOURCE[row.src] || null, fam: T.familiaDe(marca), marca,
    reg: T.regimenDe(marca, {origen: name(row.o), destino: name(row.d), nucleo: nuc}),
    amb: ligada?.tx?.amb || 'nacional', nuc, lin: marca === 'cercanias' ? row.marca : null,
    vig: row.sem > 0 ? 'vigente' : 'sin-oferta', cal: CAL_BY_SOURCE[row.src] || null};
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function anotar({servicios, rutas, cortes}) {
  const cutoff = servicios.meta.cutoff;
  let cambios = 0;
  for (const v of servicios.variants) {
    const tx = clasificarVariante(v, {stations: servicios.stations, cutoff, cortes});
    if (!same(v.tx, tx)) {v.tx = tx; cambios++;}
  }
  const variantes = new Map(servicios.variants.map(v => [v.id, v]));
  for (const row of rutas.rutas) {
    const tx = clasificarRuta(row, {estaciones: rutas.estaciones, variantes});
    if (!same(row.tx, tx)) {row.tx = tx; cambios++;}
  }
  const meta = {diccionario: T.version, bloque: 'tx', regla_vigencia: 'validity.to >= corte y validity.from < corte + 31 días'};
  if (!same(servicios.meta.taxonomia, meta)) {servicios.meta.taxonomia = meta; cambios++;}
  return cambios;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const data = {servicios: read(FILES.servicios), rutas: read(FILES.rutas), cortes: fs.existsSync(FILES.cortes) ? read(FILES.cortes) : null};
  const cambios = anotar(data);
  if (process.argv.includes('--check')) {
    if (cambios) {console.error(`✗ ${cambios} bloques tx sin anotar o desfasados. Ejecuta: node tools/visor/anotar-taxonomia.mjs`); process.exit(1);}
    console.log('✓ servicios.json y rutas.json anotados con el diccionario');
  } else {
    // Mismo formato que los generadores: servicios.json compacto, rutas.json compacto.
    fs.writeFileSync(FILES.servicios, JSON.stringify(data.servicios));
    fs.writeFileSync(FILES.rutas, JSON.stringify(data.rutas) + '\n');
    console.log(`Anotados: ${cambios} bloques tx actualizados.`);
  }
}
