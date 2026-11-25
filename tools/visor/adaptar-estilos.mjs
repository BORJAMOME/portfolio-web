#!/usr/bin/env node
/* Adapta estilos vectoriales públicos al visor ferroviario, igual que se hizo con Positron:
   - IDs y fuentes con prefijo propio (conviven con el estilo del atlas).
   - Solo la tipografía local (Noto Sans Regular) y sin iconos de sprite ni tramas.
   - Rótulos en español (name_es) con respaldo al nombre local.
   - Sin las capas de ferrocarril: la simbología ferroviaria es del atlas.
   Uso: node tools/visor/adaptar-estilos.mjs [--check]   (--check falla si el resultado cambia) */
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "visor-ferroviario", "styles");
const STYLES = [
  {id: "versatiles-gris", upstream: "https://tiles.versatiles.org/assets/styles/gray/style.json", name: "VersaTiles Graybeard"},
  {id: "versatiles-color", upstream: "https://tiles.versatiles.org/assets/styles/colorful/style.json", name: "VersaTiles Colorful"}
];
const FONT = ["Noto Sans Regular"];
const check = process.argv.includes("--check");
const sha = text => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const RAIL = /(^|-)transport-(rail|subway|minorrail|tram|monorail|funicular|light_rail|narrow_gauge)|transit-station|transit-tram/;

function labels(value) {
  // ["get","name"] → nombre en español si existe.
  if (Array.isArray(value)) {
    if (value.length === 2 && value[0] === "get" && value[1] === "name") return ["coalesce", ["get", "name_es"], ["get", "name"]];
    return value.map(labels);
  }
  return value;
}

function adapt(style, {id, upstream, name}) {
  const prefix = id + "-";
  // Las fuentes se comparten entre estilos (mismas teselas): «basemap-<fuente>».
  const sourceId = key => "basemap-" + key;
  const sources = {};
  for (const [key, source] of Object.entries(style.sources)) {
    const copy = {...source};
    delete copy.vector_layers;
    copy.attribution = (copy.attribution || "").replace(/ target="_blank"/g, "") + " · <a href=\"https://versatiles.org/\">VersaTiles</a> (estilos CC0)";
    sources[sourceId(key)] = copy;
  }
  const layers = [];
  for (const layer of style.layers) {
    if (layer.id.startsWith("slot-")) continue;
    if (RAIL.test(layer.id)) continue;
    const layout = {...(layer.layout || {})}, paint = {...(layer.paint || {})};
    if (layout["icon-image"]) {
      if (!layout["text-field"]) continue;
      for (const key of Object.keys(layout)) if (key.startsWith("icon-")) delete layout[key];
    }
    if (Object.keys(paint).some(key => key.endsWith("-pattern"))) continue;
    if (layout["text-font"]) layout["text-font"] = FONT;
    if (layout["text-field"]) layout["text-field"] = labels(layout["text-field"]);
    const copy = {...layer, id: prefix + layer.id, layout, paint};
    if (layer.source) copy.source = sourceId(layer.source);
    if (!Object.keys(layout).length) delete copy.layout;
    layers.push(copy);
  }
  return {version: 8, name: `${name} · adaptado al visor ferroviario`,
    metadata: {upstream, license: "CC0 1.0 (estilo) · datos © OpenStreetMap contributors (ODbL) · ESA WorldCover 2021 (CC BY 4.0)"},
    sources, layers};
}

const provenancePath = join(OUT, "provenance.json");
const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
provenance.extra_styles ||= {};
let stale = false;
for (const def of STYLES) {
  const response = await fetch(def.upstream);
  if (!response.ok) throw new Error(`${def.upstream}: ${response.status}`);
  const raw = await response.text();
  const text = JSON.stringify(adapt(JSON.parse(raw), def)) + "\n";
  const file = join(OUT, def.id + ".json");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (current !== text) {
    stale = true;
    if (!check) writeFileSync(file, text);
  }
  if (!check) provenance.extra_styles[def.id] = {
    upstream: def.upstream, upstream_style_sha256: sha(raw), adapted_style_sha256: sha(text),
    checked: new Date().toISOString().slice(0, 10),
    adaptations: ["Prefixed IDs and sources", "Noto Sans Regular from local glyphs; no sprite icons or patterns",
      "Spanish labels with name_es/name fallback", "Railway and tram layers removed; atlas owns railway symbology"]
  };
  console.log(`${def.id}: ${text.length} bytes${current === text ? " (sin cambios)" : ""}`);
}
if (check) {
  if (stale) { console.error("Los estilos adaptados no coinciden con el original actual."); process.exit(1); }
} else writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
