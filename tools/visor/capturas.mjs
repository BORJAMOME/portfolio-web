#!/usr/bin/env node
/* Capturas comparables del visor ferroviario (antes/después) y mediciones de carga.
   Uso: node tools/visor/capturas.mjs --out <carpeta> [--base http://127.0.0.1:8765/visor-ferroviario/] [--only nombre]
   Sirve el repo antes: python -m http.server 8765 --bind 127.0.0.1 (desde la raíz). */
import {createRequire} from "node:module";
// require respeta NODE_PATH (Playwright global); en CI vale npm i --no-save playwright.
const {chromium, devices} = createRequire(import.meta.url)("playwright");
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = opt("--out", "capturas"); mkdirSync(out, {recursive: true});
const base = opt("--base", "http://127.0.0.1:8765/visor-ferroviario/");
const only = opt("--only", null);
const h = o => "#" + encodeURIComponent(JSON.stringify(o));
// Mismos encuadres, filtros y tamaño de ventana antes y después.
const SCENES = [
  {name: "peninsular", hash: h({t: "corridors", k: "sur,noreste,norte,levante,litoral", st: "service,construction,project"})},
  {name: "corredor-norte", hash: h({t: "corridors", k: "norte", st: "service", c: [-4.2, 41.6, 6.6, 0, 0]})},
  {name: "red-regional", hash: h({t: "all", c: [-3.75, 40.45, 8.6, 0, 0]})},
  {name: "red-local", hash: h({t: "all", c: [-3.69, 40.41, 12.4, 0, 0]})},
  {name: "guadarrama-inclinado", hash: h({t: "all", m: 1, c: [-4.07, 40.78, 10.6, -25, 60]})},
  {name: "explorador-3d", hash: h({t: "all", c: [-4.02, 40.77, 9, 0, 0]}), explorer: true},
  // Solo existen después del rediseño (se omiten con --antes).
  {name: "aerea-pnoa", hash: h({t: "corridors", k: "sur,noreste,norte,levante,litoral", st: "service,construction,project", b: "pnoa", c: [-3.69, 40.42, 11, 0, 0]}), nuevo: true},
  {name: "piloto-inclinado", hash: h({t: "all", m: 1, c: [-4.035, 40.765, 12.6, 30, 62]}), nuevo: true},
  {name: "explorador-corredor", hash: h({t: "corridors", k: "norte", st: "service", c: [-4.02, 40.77, 9, 0, 0]}), explorer: true, nuevo: true},
  {name: "mdt25-vs-mdt05", hash: h({t: "all", c: [-4.03, 40.77, 12, 0, 0]}), compare: true, nuevo: true}
];
const before = args.includes("--antes");
const VIEWPORTS = [
  {id: "escritorio", context: {viewport: {width: 1440, height: 900}, deviceScaleFactor: 1}},
  {id: "movil", context: {...devices["Pixel 7"]}}
];
const results = [];
const browser = await chromium.launch({args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
for (const vp of VIEWPORTS) for (const scene of SCENES) {
  if (only && !scene.name.includes(only)) continue;
  if (before && scene.nuevo) continue;
  const context = await browser.newContext(vp.context);
  const page = await context.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  let bytes = 0; page.on("response", async r => { try { const len = Number(r.headers()["content-length"]); if (len) bytes += len; } catch {} });
  const t0 = Date.now();
  await page.goto(base + scene.hash, {waitUntil: "load"});
  await page.waitForFunction(() => document.querySelector("#loading")?.hidden !== false || getComputedStyle(document.querySelector("#loading")).display === "none", null, {timeout: 120000}).catch(() => {});
  await page.waitForFunction(() => typeof map !== "undefined" && map.loaded() && map.areTilesLoaded(), null, {timeout: 90000}).catch(() => {});
  await page.waitForTimeout(1500);
  const mapReady = Date.now() - t0;
  const rec = {viewport: vp.id, scene: scene.name, mapReadyMs: mapReady};
  if (scene.explorer) {
    // Abrir el explorador desde la interfaz, como un usuario.
    await page.evaluate(() => { document.querySelector('[data-cat="relieve"]')?.click(); });
    await page.waitForTimeout(400);
    const t1 = Date.now();
    const opener = page.locator(".terrain-model, #terrain-open-scene").first();
    await opener.click({timeout: 10000}).catch(e => errors.push("abrir explorador: " + e.message));
    await page.waitForFunction(() => document.querySelector(".terrain-studio")?.dataset.state === "ready", null, {timeout: 120000}).catch(() => errors.push("explorador no listo"));
    rec.explorerReadyMs = Date.now() - t1;
    await page.waitForFunction(() => ["positron", "natural", "error", "pnoa"].includes(document.querySelector(".terrain-studio")?.dataset.basemap), null, {timeout: 60000}).catch(() => {});
    rec.explorer = await page.evaluate(() => globalThis.AtlasTerrainScene?.stats?.() || null);
    await page.waitForTimeout(1500);
  }
  if (scene.compare) {
    // Aísla el efecto del MDT: misma zona, malla, cámara, luz y escala vertical; solo cambia el MDT usado.
    const area = {name: "Guadarrama · Cercedilla–Cotos", bounds: [-4.10, 40.715, -3.94, 40.835]};
    let cameraState = null;
    for (const [label, demMaxZoom] of [["mdt25", 12], ["mdt05", undefined]]) {
      const t1 = Date.now();
      cameraState = await page.evaluate(async ({area, demMaxZoom, cameraState}) => {
        await import("./terrain-scene.mjs");
        await AtlasTerrainScene.open({area, network: {base: []}, stations: [], demMaxZoom, segments: 560, maxSegments: 560});
        const dialog = document.querySelector(".terrain-studio");
        dialog.querySelector(".terrain-studio-surface select").value = "natural";
        dialog.querySelector(".terrain-studio-surface select").dispatchEvent(new Event("change"));
        const contours = dialog.querySelector(".terrain-studio-toggles input"); contours.checked = false; contours.dispatchEvent(new Event("change"));
        const fixed = cameraState || {position: [-3.2, 4.1, 4.6], target: [0, 1.1, 0]};
        AtlasTerrainScene.camera(fixed);
        return fixed;
      }, {area, demMaxZoom, cameraState});
      await page.waitForTimeout(1500);
      rec[label] = {readyMs: Date.now() - t1, ...(await page.evaluate(() => AtlasTerrainScene.stats()))};
      await page.locator(".terrain-studio-stage canvas").screenshot({path: join(out, `${vp.id}-${scene.name}-${label}.png`)});
      await page.evaluate(() => AtlasTerrainScene.close());
    }
  }
  rec.bytes = bytes; rec.errors = errors.slice(0, 8);
  await page.screenshot({path: join(out, `${vp.id}-${scene.name}.png`)});
  results.push(rec); console.log(JSON.stringify(rec));
  await context.close();
}
await browser.close();
writeFileSync(join(out, "mediciones.json"), JSON.stringify(results, null, 2));
