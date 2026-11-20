#!/usr/bin/env node
/* Atributos de línea de Adif para el visor ferroviario, tomados de la capa «Red ferroviaria (Adif)»
   del Atlas Estratégico de España (CC BY 4.0), que los transcribe del WFS INSPIRE de IDEADIF.

   Genera visor-ferroviario/capas/lineas-adif.json con dos partes:
   - lineas: por código de línea de Adif (eje + línea, 5 caracteres), los atributos de la línea y su
     estado de verificación en el Atlas.
   - relleno: para los tramos IGN de Adif sin electrificación o sin ancho, el valor de su línea, SOLO si
     la línea es uniforme (electrificación «total» o «ninguna»; un único ancho) y el tramo se identifica
     con una sola línea del catálogo (la misma regla que la ficha, line-identity.js). Es una deducción:
     el visor la muestra como «dato de la línea», no como dato del tramo.

   Uso:
     node tools/visor-atlas-adif.mjs                      # descarga la capa del Atlas
     node tools/visor-atlas-adif.mjs --atlas ruta.geojson # usa una copia local
     --release 2026.11.183                                # release de la ficha, para la cita
     node tools/visor-atlas-adif.mjs --check              # falla si el JSON no está al día con esa copia
*/
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "visor-ferroviario");
const out = join(root, "capas", "lineas-adif.json");
const URL_CAPA = "https://atlas.eltercioviejo.com/datos/capas/ferrocarril.geojson";
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const check = args.includes("--check");

const atlas = opt("--atlas")
  ? JSON.parse(readFileSync(opt("--atlas"), "utf8"))
  : await fetch(URL_CAPA).then(r => { if (!r.ok) throw new Error("Atlas: HTTP " + r.status); return r.json(); });

// El GeoJSON no trae la release (solo «verificado_a»): se pasa a mano, copiada de la ficha de la capa.
const release = opt("--release") ?? null;
const verificado = atlas.atlas?.verificado_a ?? null;
const CAMPOS = ["velocidad_diseno_kmh", "uso", "electrificacion", "tramos_electrificados", "n_tramos",
  "ancho_via_mm", "n_vias_max", "longitud_medida_km"];
const lineas = {};
for (const f of atlas.features) {
  const p = f.properties;
  if (!/^[0-9A-Z]{5}$/.test(p.codigo_linea ?? "")) throw new Error("Código de línea inesperado: " + p.codigo_linea);
  if (lineas[p.codigo_linea]) throw new Error("Código de línea repetido: " + p.codigo_linea);
  const linea = {nombre: p.nombre};
  for (const c of CAMPOS) if (p[c] !== undefined && p[c] !== null) linea[c] = p[c];
  // Solo se guarda la verificación cuando no es «confirmado» (p. ej. la longitud, medida por el Atlas).
  const v = Object.fromEntries(CAMPOS.filter(c => p[c + "__v"] && p[c + "__v"] !== "confirmado").map(c => [c, p[c + "__v"]]));
  if (Object.keys(v).length) linea.verif = v;
  lineas[p.codigo_linea] = linea;
}

/* ── relleno de tramos ── */
const require = createRequire(import.meta.url);
const {AtlasLineIdentity} = require(join(root, "line-identity.js"));
const match = AtlasLineIdentity.build(JSON.parse(readFileSync(join(root, "line-catalog.geojson"), "utf8")));
const datos = JSON.parse(readFileSync(join(root, "datos.json"), "utf8"));
// Ancho IGN por categoría: un tramo «narrow» solo puede recibir el métrico.
const compatible = {narrow: [1000]};
const relleno = {};
const cuenta = {electrificacion: 0, ancho: 0, sin_linea: 0, linea_no_uniforme: 0};
for (const f of datos.rail.features) {
  const p = f.properties;
  if (!["adif", "adifav"].includes(p.net)) continue;
  const faltaE = p.electrified === null || p.electrified === undefined;
  const cat = p.gauge_category ?? null;
  const faltaG = !(p.nominalgauge > 0) && (cat === null || cat in compatible);
  if (!faltaE && !faltaG) continue;
  const identidad = match(f.geometry.coordinates);
  const linea = identidad && lineas[identidad.code];
  if (!linea) { cuenta.sin_linea++; continue; }
  const r = {};
  if (faltaE) {
    if (linea.electrificacion === "total") r.e = 1;
    else if (linea.electrificacion === "ninguna") r.e = 0;
    else cuenta.linea_no_uniforme++;
  }
  if (faltaG && linea.ancho_via_mm && (!compatible[cat] || compatible[cat].includes(linea.ancho_via_mm))) r.g = linea.ancho_via_mm;
  if ("e" in r) cuenta.electrificacion++;
  if ("g" in r) cuenta.ancho++;
  if (Object.keys(r).length) relleno[p.id] = {...r, l: identidad.code};
}

const resultado = {
  meta: {
    fuente: "Atlas Estratégico de España · capa «Red ferroviaria (Adif)»",
    url: "https://atlas.eltercioviejo.com/ficha/ferrocarril/",
    release,
    verificado_a: verificado,
    licencia: "CC BY 4.0",
    cita: "«Red ferroviaria (Adif)» · Vázquez Paumard, A. D., Atlas Estratégico de España" + (release ? ", release " + release : "") + " · datos CC BY 4.0",
    fuente_primaria: "Adif · IDEADIF, servicio WFS INSPIRE (tn-ra:RailwayLine y propiedades por tramo)",
    regla_relleno: "Solo tramos IGN de Adif sin el dato, identificados con una única línea; valor de la línea cuando es uniforme.",
    lineas: Object.keys(lineas).length,
    tramos_rellenos: cuenta
  },
  lineas,
  relleno
};
const texto = JSON.stringify(resultado) + "\n";
if (check) {
  const actual = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (actual !== texto) { console.error("capas/lineas-adif.json no está al día: node tools/visor-atlas-adif.mjs --atlas …"); process.exit(1); }
  console.log("capas/lineas-adif.json al día.");
} else {
  writeFileSync(out, texto);
  console.log(`Escrito ${out}: ${resultado.meta.lineas} líneas · relleno`, cuenta, `· ${Math.round(texto.length / 1024)} KB`);
}
