#!/usr/bin/env node
/* Versiones de caché (?v=) del visor ferroviario: tools/version-assets.mjs solo versiona rutas con ./, ../ o /,
   y el visor usa rutas relativas simples. Hash = sha256 del contenido (finales de línea LF), 8 caracteres.
   node tools/visor/versionar.mjs          → actualiza visor-ferroviario/index.html y los imports de los módulos 3D
   node tools/visor/versionar.mjs --check  → falla si alguno está desactualizado */
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {join, dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const VISOR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "visor-ferroviario");
const CHECK = process.argv.includes("--check");
const memo = {};
const hash = file => (memo[file] ??= createHash("sha256").update(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0, 8));
// Módulos del relieve: primero las hojas, para que el hash de quien importa incluya las versiones nuevas.
const ORDER = ["terrain-data.mjs", "terrain-basemap.mjs", "terrain-stations.mjs", "terrain-scene.mjs", "terrain-controls.js"];
const IMPORT = /((?:from\s*|import\(\s*|new URL\(\s*)['"`]\.\/)((?:terrain-[a-z-]+\.mjs)|(?:assets\/terrain\/[a-z-]+\.(?:json|glb)))(?:\?v=[0-9a-f]+)?(['"`])/g;
let changed = 0;
for (const name of ORDER) {
  const file = join(VISOR, name), src = readFileSync(file, "utf8");
  const out = src.replace(IMPORT, (all, pre, path, quote) => existsSync(join(VISOR, path)) ? `${pre}${path}?v=${hash(join(VISOR, path))}${quote}` : all);
  if (out !== src) { changed++; console.log(`${CHECK ? "✗" : "✓"} ${name}`); if (!CHECK) { writeFileSync(file, out); delete memo[file]; } }
}
const page = join(VISOR, "index.html"), html = readFileSync(page, "utf8");
const next = html.replace(/((?:href|src)=")((?!https?:|vendor\/)[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g, (all, pre, path) => {
  const file = resolve(VISOR, path);
  return existsSync(file) ? `${pre}${path}?v=${hash(file)}"` : all;
});
if (next !== html) { changed++; console.log(`${CHECK ? "✗" : "✓"} index.html`); if (!CHECK) writeFileSync(page, next); }
if (CHECK && changed) { console.error("\nEjecuta: node tools/visor/versionar.mjs"); process.exit(1); }
console.log(changed ? `${changed} archivo(s) actualizados.` : "✓ versiones del visor al día.");
