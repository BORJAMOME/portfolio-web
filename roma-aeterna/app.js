"use strict";
/* Roma Aeterna — lanzador de Caesar III (Augustus → WebAssembly) para iOS */
/* ===================================================================
   Roma Aeterna — lanzador de Caesar III (Julius → WebAssembly) para iOS
   =================================================================== */
const DATA = "/c3";
const $ = (id) => document.getElementById(id);
const isIOS = /iP(hone|ad|od)/.test(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/* ---------- Ajustes (localStorage, opcional) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("ra." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ra." + k, JSON.stringify(v)); } catch {} },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};
const settings = {
  ui: store.get("ui", "auto"),
  dpr: store.get("dpr", "2"),
  videos: store.get("videos", false),
  dock: store.get("dock", true),
};

/* ---------- Registro ---------- */
const logLines = [];
function log(...a) {
  const line = a.join(" ");
  logLines.push(line); if (logLines.length > 300) logLines.shift();
  const el = $("log"); if (el) el.textContent = logLines.join("\n");
  console.log(line);
}

/* ---------- Utilidades ---------- */
const fmtMB = (b) => (b / 1048576).toLocaleString("es-ES", { maximumFractionDigits: b < 10485760 ? 1 : 0 }) + " MB";
function toRoman(n) {
  const m = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let s = ""; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s;
}
$("auc").textContent = "Anno Urbis Conditae " + toRoman(new Date().getFullYear() + 753);

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}
function show(view) {
  for (const v of ["vLoading", "vSetup", "vImport", "vReady", "vFatal"]) $(v).hidden = v !== view;
}
function fatal(msg) { $("fatalText").textContent = msg; show("vFatal"); }

/* ---------- Fondo de mosaico (opus tessellatum) ---------- */
(function mosaic() {
  const c = $("mosaic"), ctx = c.getContext("2d");
  function draw() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = innerWidth, h = innerHeight;
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#140c12"; ctx.fillRect(0, 0, w, h);
    const s = 13; let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tones = ["#1b1118", "#1e1219", "#21141c", "#1a0f16", "#24161e"];
    for (let y = 0; y < h + s; y += s) {
      const off = (Math.floor(y / s) % 2) * (s / 2);
      for (let x = -s; x < w + s; x += s) {
        ctx.fillStyle = tones[(rnd() * tones.length) | 0];
        const j = () => (rnd() - .5) * 1.6;
        ctx.fillRect(x + off + 1 + j(), y + 1 + j(), s - 2.2, s - 2.2);
      }
    }
    // banda de teselas doradas y rojas, muy tenue
    const band = Math.round(h * .5 / s) * s;
    for (let x = -s; x < w + s; x += s) {
      ctx.fillStyle = (Math.floor(x / s) % 2) ? "rgba(217,180,106,.07)" : "rgba(178,58,47,.08)";
      ctx.fillRect(x + 1, band + 1, s - 2.2, s - 2.2);
    }
    const g = ctx.createRadialGradient(w / 2, h * .42, 0, w / 2, h * .42, Math.max(w, h) * .75);
    g.addColorStop(0, "rgba(20,12,18,0)"); g.addColorStop(1, "rgba(10,5,9,.86)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  draw(); let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 150); });
})();

/* ===================================================================
   Sistema de archivos persistente (IDBFS)
   =================================================================== */
let fsReady = false, syncing = false, syncAgain = false;
function syncFS(populate = false) {
  return new Promise((res, rej) => FS.syncfs(populate, (err) => (err ? rej(err) : res())));
}
async function persist() {
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  try { do { syncAgain = false; await syncFS(false); } while (syncAgain); }
  catch (e) { log("syncfs:", e && e.message || e); toast("No se pudo guardar en el dispositivo"); }
  finally { syncing = false; }
}
function walk(dir, out = []) {
  let names; try { names = FS.readdir(dir); } catch { return out; }
  for (const n of names) {
    if (n === "." || n === "..") continue;
    const p = dir + "/" + n, st = FS.stat(p);
    if (FS.isDir(st.mode)) walk(p, out); else out.push({ path: p, name: n, size: st.size, mtime: st.mtime });
  }
  return out;
}
function mkdirp(path) {
  let cur = "";
  for (const part of path.split("/").filter(Boolean)) {
    cur += "/" + part;
    try { FS.mkdir(cur); } catch (e) { /* existe */ }
  }
}
function rmrf(dir, keep) {
  let names; try { names = FS.readdir(dir); } catch { return; }
  for (const n of names) {
    if (n === "." || n === "..") continue;
    const p = dir + "/" + n;
    if (FS.isDir(FS.stat(p).mode)) { rmrf(p, keep); try { FS.rmdir(p); } catch {} }
    else if (!(keep && keep(p))) FS.unlink(p);
  }
}
function findFile(lowerName) {
  return walk(DATA).find((f) => f.name.toLowerCase() === lowerName);
}
function gameStats() {
  const files = walk(DATA);
  const saves = files.filter((f) => /\.sav$/i.test(f.name) && f.path.split("/").length === 3);
  return { files, saves, bytes: files.reduce((a, f) => a + f.size, 0), valid: files.some((f) => f.name.toLowerCase() === "c3.sg2") };
}

/* ---------- Filtro de importación ---------- */
const SKIP_EXT = /\.(exe|dll|ico|url|lnk|pdf|info|hashdb|ds_store|mp3|ogg|bak|tmp|db)$/i;
const SKIP_DIR = /(^|\/)(__macosx|directx|support|__support|commonappdata|_commonredist)(\/|$)/i;
function wanted(rel) {
  const base = rel.split("/").pop();
  if (!base || base.startsWith("._") || base.startsWith(".")) return false;
  if (SKIP_DIR.test(rel) || SKIP_EXT.test(base)) return false;
  if (/^unins/i.test(base) || /^goggame/i.test(base)) return false;
  if (/\.smk$/i.test(base) && !settings.videos) return false;
  return true;
}
function rootOf(paths) {
  // la carpeta del juego es la que contiene c3.sg2
  const hit = paths.filter((p) => p.split("/").pop().toLowerCase() === "c3.sg2").sort((a, b) => a.length - b.length)[0];
  if (!hit) return null;
  return hit.slice(0, hit.length - hit.split("/").pop().length);
}

/* ---------- Lector ZIP por directorio central (bajo consumo de memoria) ---------- */
async function zipEntries(file) {
  const tailLen = Math.min(file.size, 65557);
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let e = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("El archivo no es un ZIP válido.");
  let count = tail.getUint16(e + 10, true), cdSize = tail.getUint32(e + 12, true), cdOff = tail.getUint32(e + 16, true);
  if (cdOff === 0xffffffff || count === 0xffff || cdSize === 0xffffffff) {
    const locAt = file.size - tailLen + e - 20;
    const loc = new DataView(await file.slice(locAt, locAt + 20).arrayBuffer());
    if (loc.getUint32(0, true) === 0x07064b50) {
      const z64At = Number(loc.getBigUint64(8, true));
      const z = new DataView(await file.slice(z64At, z64At + 56).arrayBuffer());
      count = Number(z.getBigUint64(32, true)); cdSize = Number(z.getBigUint64(40, true)); cdOff = Number(z.getBigUint64(48, true));
    }
  }
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const u8 = new Uint8Array(cd.buffer), dec = new TextDecoder("utf-8");
  const list = []; let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const flags = cd.getUint16(p + 8, true), method = cd.getUint16(p + 10, true);
    let csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true);
    const nlen = cd.getUint16(p + 28, true), xlen = cd.getUint16(p + 30, true), clen = cd.getUint16(p + 32, true);
    let off = cd.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, "/");
    // extra ZIP64
    let x = p + 46 + nlen; const xend = x + xlen;
    while (x + 4 <= xend) {
      const id = cd.getUint16(x, true), sz = cd.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = Number(cd.getBigUint64(q, true)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(cd.getBigUint64(q, true)); q += 8; }
        if (off === 0xffffffff) { off = Number(cd.getBigUint64(q, true)); }
      }
      x += 4 + sz;
    }
    if (!name.endsWith("/")) list.push({ name, method, csize, usize, off, encrypted: !!(flags & 1) });
    p = xend + clen;
  }
  return list;
}
async function zipRead(file, ent) {
  const h = new DataView(await file.slice(ent.off, ent.off + 30).arrayBuffer());
  if (h.getUint32(0, true) !== 0x04034b50) throw new Error("ZIP dañado (" + ent.name + ").");
  const start = ent.off + 30 + h.getUint16(26, true) + h.getUint16(28, true);
  const comp = new Uint8Array(await file.slice(start, start + ent.csize).arrayBuffer());
  if (ent.method === 0) return comp;
  if (ent.method === 8) return fflate.inflateSync(comp, { out: new Uint8Array(ent.usize) });
  throw new Error("Compresión no soportada en " + ent.name + ". Comprime la carpeta con la app Archivos o con el compresor del sistema.");
}

/* ---------- Importación ---------- */
function progress(frac, text) {
  $("impBar").style.width = Math.max(0, Math.min(100, frac * 100)).toFixed(1) + "%";
  if (text) $("impText").textContent = text;
}
let lastPicked = "";
function importError(msg, detail) {
  const el = $("importErr");
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><div style="display:grid;gap:8px;min-width:0"><span></span><code style="font:12px/1.4 ui-monospace,Menlo,monospace;color:var(--stone);white-space:pre-wrap;overflow-wrap:anywhere"></code></div>';
  el.querySelector("span").textContent = msg;
  const d = [lastPicked, detail].filter(Boolean).join("\n");
  el.querySelector("code").textContent = d ? "Detalle técnico:\n" + d : "";
  el.hidden = false;
  log("importación:", msg, d);
  show("vSetup");
}
async function writeAll(items, getData) {
  // items: [{rel, size}] relativos a la raíz del juego; las partidas (.sav) se conservan
  rmrf(DATA, (p) => /\.sav$/i.test(p) && p.split("/").length === 3);
  const total = items.reduce((a, i) => a + i.size, 0) || 1; let done = 0, n = 0;
  for (const it of items) {
    const data = await getData(it);
    const dest = DATA + "/" + it.rel;
    mkdirp(dest.slice(0, dest.lastIndexOf("/")));
    FS.writeFile(dest, data, { canOwn: true });
    done += it.size; n++;
    if (n % 4 === 0 || done === total) {
      progress(done / total * .9, `${n} de ${items.length} archivos · ${fmtMB(done)} de ${fmtMB(total)}`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}
async function finishImport() {
  $("impTitle").textContent = "Guardando en el iPhone…";
  progress(.94, "Esto solo se hace una vez");
  await persist();
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
  progress(1, "Hecho");
  $("importErr").hidden = true;
  refreshReady();
  toast("Archivos importados. ¡Ave, gobernador!");
}
async function importZip(file) {
  show("vImport"); $("impTitle").textContent = "Leyendo el ZIP…"; progress(0, file.name);
  try {
    const list = await zipEntries(file);
    const root = rootOf(list.map((e) => e.name));
    if (root === null) return importError("Ese ZIP no contiene Caesar III: falta el archivo c3.sg2. Comprime la carpeta de instalación completa del juego.");
    const items = list.filter((e) => e.name.startsWith(root)).map((e) => ({ ...e, rel: e.name.slice(root.length), size: e.usize })).filter((e) => wanted(e.rel));
    if (items.some((e) => e.encrypted)) return importError("El ZIP está protegido con contraseña. Comprímelo de nuevo sin contraseña.");
    $("impTitle").textContent = "Trasladando archivos al Foro…";
    await writeAll(items, (e) => zipRead(file, e));
    await finishImport();
  } catch (e) {
    log("import zip:", e && e.stack || e);
    importError((e && e.message) || "No se pudo leer el ZIP.");
  }
}
// Reconoce cada archivo por su contenido, no por el nombre (Safari a veces lo cambia)
async function sniff(f) {
  try {
    const b = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    const t = String.fromCharCode(...b);
    if (t.startsWith("PK\x03\x04") || t.startsWith("PK\x05\x06")) return "zip";
    if (t.startsWith("MZ")) return "exe";
    if (t.startsWith("idska") || t.startsWith("zlb\x1a")) return "bin";
    return "otro";
  } catch (e) { return "ilegible"; }
}
async function importAny(files) {
  const kinds = await Promise.all(files.map(sniff));
  lastPicked = files.map((f, i) => `• ${f.name} — ${fmtMB(f.size)} — ${kinds[i]}${f.type ? " (" + f.type + ")" : ""}`).join("\n");
  log("Elegidos:\n" + lastPicked);
  if (files.some((f) => f.size === 0)) return importError("Uno de los archivos está vacío (0 MB). Puede que la descarga no terminara: descárgalo de nuevo desde GOG.");
  const exeIdx = kinds.indexOf("exe");
  if (exeIdx >= 0) {
    const parts = files.filter((f, i) => kinds[i] === "exe" || kinds[i] === "bin");
    return importInstaller(parts, files[exeIdx].name);
  }
  if (kinds.includes("bin")) return importError("Ese es solo el archivo .bin. Elige también el instalador .exe (puedes seleccionar los dos a la vez).");
  if (files.length === 1 && kinds[0] === "zip") return importZip(files[0]);
  if (files.length === 1 && kinds[0] !== "zip") return importError("No reconozco ese archivo: no es el instalador de GOG (.exe) ni un ZIP. Comprueba en la app Archivos que la descarga se completó y que pesa unos 600 MB.");
  return importFiles(files);
}

/* ---------- Instalador de GOG (Inno Setup) → innoextract en WebAssembly ---------- */
function importInstaller(files, mainName) {
  show("vImport"); $("impTitle").textContent = "Desempaquetando el instalador de GOG…";
  progress(0, "Preparando el extractor…");
  rmrf(DATA, (p) => /\.sav$/i.test(p) && p.split("/").length === 3);
  const total = files.reduce((a, f) => a + f.size, 0);
  const tailLog = [];
  let count = 0, bytes = 0, t0 = Date.now();
  return new Promise((resolve) => {
    let worker;
    try { worker = new Worker("extract-worker.js"); }
    catch (e) { importError("Este navegador no permite desempaquetar el instalador.", String(e && e.message || e)); return resolve(); }
    const fail = (msg) => { try { worker.terminate(); } catch {} importError(msg, tailLog.join("\n")); resolve(); };
    worker.onerror = (e) => { tailLog.push("worker: " + (e.message || "error") + (e.filename ? " @ " + e.filename + ":" + e.lineno : "")); fail("El extractor se ha detenido. Si el iPhone anda justo de memoria, cierra otras apps y vuelve a intentarlo."); };
    worker.onmessage = async (e) => {
      const m = e.data;
      if (m.type === "file") {
        if (!wanted(m.path)) return;
        const dest = DATA + "/" + m.path;
        mkdirp(dest.slice(0, dest.lastIndexOf("/")));
        FS.writeFile(dest, m.data, { canOwn: true });
        count++; bytes += m.data.byteLength;
      } else if (m.type === "progress") {
        const f = Math.min(.99, m.read / m.total), secs = (Date.now() - t0) / 1000;
        const eta = f > .03 ? Math.max(1, Math.round(secs / f - secs)) : null;
        if (f >= .99) progress(.9, `Colocando los últimos archivos… · ${count} archivos · ${fmtMB(bytes)}`);
        else progress(f * .9, `${Math.round(f * 100)} % · ${count} archivos · ${fmtMB(bytes)}` + (eta !== null ? ` · quedan ~${eta < 60 ? eta + " s" : Math.round(eta / 60) + " min"}` : ""));
      } else if (m.type === "log") {
        tailLog.push(m.text); if (tailLog.length > 12) tailLog.shift();
      } else if (m.type === "done") {
        worker.terminate();
        if (m.status !== 0) return fail("No se pudo desempaquetar el instalador" + (m.error ? " (" + m.error + ")" : "") + ". Comprueba que la descarga terminó bien y, si hay un .bin, selecciónalo junto al .exe.");
        // La carpeta del juego es la que contiene c3.sg2: súbela a la raíz
        const hit = walk(DATA).filter((f) => f.name.toLowerCase() === "c3.sg2").sort((a, b) => a.path.length - b.path.length)[0];
        if (!hit) { rmrf(DATA, (p) => /\.sav$/i.test(p) && p.split("/").length === 3); return fail("Ese instalador no contiene Caesar III (falta c3.sg2)."); }
        const root = hit.path.slice(0, hit.path.lastIndexOf("/"));
        if (root !== DATA) {
          const tops = FS.readdir(DATA).filter((n) => n !== "." && n !== "..");
          for (const n of FS.readdir(root)) {
            if (n === "." || n === "..") continue;
            const dest = DATA + "/" + n;
            try { if (FS.analyzePath(dest).exists) { if (FS.isDir(FS.stat(dest).mode)) { rmrf(dest); FS.rmdir(dest); } else FS.unlink(dest); } } catch {}
            FS.rename(root + "/" + n, dest);
          }
          // fuera los restos del instalador (app/, tmp/, __support/…); las partidas se quedan
          for (const n of tops) {
            if (/\.sav$/i.test(n)) continue;
            const p = DATA + "/" + n;
            if (!FS.analyzePath(p).exists) continue;
            if (FS.isDir(FS.stat(p).mode)) { rmrf(p); try { FS.rmdir(p); } catch {} } else FS.unlink(p);
          }
        }
        log("Instalador desempaquetado:", count, "archivos,", fmtMB(bytes), "en", Math.round((Date.now() - t0) / 1000), "s");
        await finishImport();
        resolve();
      }
    };
    const skip = settings.videos ? "\\.(exe|dll|ico|lnk|url|pdf|mp3|ogg)$" : "\\.(exe|dll|ico|lnk|url|pdf|mp3|ogg|smk)$";
    worker.postMessage({ type: "extract", files, skip, main: mainName });
    log("Desempaquetando", files.map((f) => f.name + " (" + fmtMB(f.size) + ")").join(", "), "total", fmtMB(total));
  });
}

async function importFiles(fileList) {
  const files = [...fileList];
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) return importZip(files[0]);
  show("vImport"); $("impTitle").textContent = "Trasladando archivos al Foro…"; progress(0, "");
  try {
    const paths = files.map((f) => (f.webkitRelativePath || f.name).replace(/\\/g, "/"));
    let root = rootOf(paths);
    if (root === null) return importError("Falta c3.sg2. Selecciona todos los archivos de la carpeta del juego (o mejor, importa la carpeta comprimida en ZIP).");
    const items = files.map((f, i) => ({ f, rel: paths[i].slice(root.length), size: f.size }))
      .filter((it, i) => paths[i].startsWith(root) && wanted(it.rel));
    await writeAll(items, async (it) => new Uint8Array(await it.f.arrayBuffer()));
    await finishImport();
  } catch (e) {
    log("import files:", e && e.stack || e);
    importError((e && e.message) || "No se pudieron copiar los archivos.");
  }
}
$("zipInput").addEventListener("change", (e) => { if (e.target.files.length) importAny([...e.target.files]); e.target.value = ""; });
$("filesInput").addEventListener("change", (e) => { if (e.target.files.length) importAny([...e.target.files]); e.target.value = ""; });
$("dirInput").addEventListener("change", (e) => { if (e.target.files.length) importFiles(e.target.files); e.target.value = ""; });

// Escritorio: arrastrar y soltar (ZIP o carpeta)
if (!isIOS && matchMedia("(pointer: fine)").matches) {
  $("drop").hidden = false; $("dirLink").hidden = false;
  const d = $("drop");
  addEventListener("dragover", (e) => { e.preventDefault(); d.classList.add("over"); });
  addEventListener("dragleave", () => d.classList.remove("over"));
  addEventListener("drop", async (e) => {
    e.preventDefault(); d.classList.remove("over");
    if (!fsReady) return;
    const items = [...(e.dataTransfer.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (items.every((i) => i.isFile)) return importAny([...e.dataTransfer.files]);
    const out = [];
    const readEntry = (entry, prefix) => new Promise((res) => {
      if (entry.isFile) entry.file((f) => { Object.defineProperty(f, "webkitRelativePath", { value: prefix + f.name }); out.push(f); res(); }, res);
      else {
        const r = entry.createReader(), all = [];
        const next = () => r.readEntries(async (batch) => {
          if (!batch.length) { for (const c of all) await readEntry(c, prefix + entry.name + "/"); res(); }
          else { all.push(...batch); next(); }
        }, res);
        next();
      }
    });
    for (const it of items) await readEntry(it, "");
    importFiles(out);
  });
}

/* ---------- Estado "listo" ---------- */
function refreshReady() {
  const s = gameStats();
  if (!s.valid) { show("vSetup"); return; }
  $("stFiles").textContent = s.files.length.toLocaleString("es-ES");
  $("stSize").textContent = fmtMB(s.bytes);
  $("stSaves").textContent = s.saves.length;
  $("installHint").hidden = !(isIOS && !isStandalone);
  show("vReady");
  renderSaves(s.saves);
}
function renderSaves(saves) {
  const box = $("saveList");
  box.innerHTML = "";
  if (!saves.length) {
    const d = document.createElement("div"); d.style.textAlign = "left";
    d.innerHTML = "<dd style='font-size:15px;font-weight:400;color:var(--stone)'>Todavía no hay partidas guardadas.</dd>";
    box.appendChild(d); return;
  }
  for (const s of saves.sort((a, b) => b.mtime - a.mtime)) {
    const d = document.createElement("div");
    d.style.cssText = "display:flex;justify-content:space-between;gap:12px;text-align:left;align-items:baseline";
    const n = document.createElement("dd"); n.style.cssText = "font-size:16px;min-width:0;overflow-wrap:anywhere"; n.textContent = s.name.replace(/\.sav$/i, "");
    const m = document.createElement("dt"); m.style.cssText = "letter-spacing:.06em;flex:none"; m.textContent = new Date(s.mtime).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    d.append(n, m); box.appendChild(d);
  }
}

/* ---------- Partidas: exportar / importar ---------- */
$("exportBtn").addEventListener("click", async () => {
  const saves = gameStats().saves;
  if (!saves.length) return toast("Aún no hay partidas que exportar");
  const files = {};
  for (const s of saves) files[s.name] = FS.readFile(s.path);
  const zip = fflate.zipSync(files, { level: 6 });
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `partidas-caesar3-${stamp}.zip`;
  await offerFile(new Blob([zip], { type: "application/zip" }), name);
});
// Entrega un archivo: hoja de compartir de iOS (Guardar en Archivos, AirDrop…) o descarga
async function offerFile(blob, name) {
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- Idioma del juego ----------
   El texto del juego vive en dos archivos: c3.eng (menús, edificios, consejeros) y
   c3_mm.eng (mensajes y misiones). Se exportan para traducirlos y se importan después;
   los originales quedan en /c3/idioma-original para poder volver atrás. */
const LANG_FILES = { "c3.eng": [28 + 1000 * 8, 28 + 1000 * 8 + 400000], "c3_mm.eng": [32024, 32024 + 800000] };
const LANG_BACKUP = DATA + "/idioma-original";
function rootFile(lower) {
  try { const n = FS.readdir(DATA).find((x) => x.toLowerCase() === lower); return n ? DATA + "/" + n : null; } catch { return null; }
}
const hasLangBackup = () => FS.analyzePath(LANG_BACKUP).exists;
function refreshLanguage() {
  if (!fsReady) return;
  const translated = hasLangBackup();
  $("langState").textContent = translated ? "Traducción importada (el original en inglés está guardado)" : "Original de tu copia del juego";
  $("langRestoreBtn").hidden = !translated;
}
$("langExportBtn").addEventListener("click", async () => {
  const files = {};
  for (const name of Object.keys(LANG_FILES)) {
    // si ya hay traducción, se exporta el original guardado
    const src = hasLangBackup() && FS.analyzePath(LANG_BACKUP + "/" + name).exists ? LANG_BACKUP + "/" + name : rootFile(name);
    if (!src) return toast("No encuentro " + name + ". Reimporta el juego.");
    files[name] = FS.readFile(src);
  }
  const zip = fflate.zipSync(files, { level: 9 });
  log("Textos exportados:", Object.entries(files).map(([k, v]) => k + " " + fmtMB(v.length)).join(", "));
  await offerFile(new Blob([zip], { type: "application/zip" }), "textos-caesar3.zip");
});
$("langInput").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  try {
    const got = {};
    if (/^PK/.test(String.fromCharCode(...new Uint8Array(await f.slice(0, 2).arrayBuffer())))) {
      const unz = fflate.unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [k, v] of Object.entries(unz)) {
        const base = k.split("/").pop().toLowerCase();
        if (LANG_FILES[base]) got[base] = v;
      }
    }
    for (const [name, [min, max]] of Object.entries(LANG_FILES)) {
      const d = got[name];
      if (!d) return toast("El ZIP debe contener c3.eng y c3_mm.eng");
      if (d.length < min || d.length > max) return toast(name + " no tiene un tamaño válido (" + d.length + " bytes)");
    }
    if (!hasLangBackup()) {
      mkdirp(LANG_BACKUP);
      for (const name of Object.keys(LANG_FILES)) FS.writeFile(LANG_BACKUP + "/" + name, FS.readFile(rootFile(name)));
    }
    for (const name of Object.keys(LANG_FILES)) FS.writeFile(rootFile(name) || DATA + "/" + name, got[name]);
    await persist(); refreshLanguage();
    toast("Traducción instalada. Se verá en la próxima partida");
  } catch (err) {
    log("idioma:", err && err.stack || err);
    toast("No se pudo leer ese archivo");
  }
});
$("langRestoreBtn").addEventListener("click", async () => {
  if (!hasLangBackup()) return;
  for (const name of Object.keys(LANG_FILES)) {
    const b = LANG_BACKUP + "/" + name;
    if (FS.analyzePath(b).exists) FS.writeFile(rootFile(name) || DATA + "/" + name, FS.readFile(b));
  }
  rmrf(LANG_BACKUP); try { FS.rmdir(LANG_BACKUP); } catch {}
  await persist(); refreshLanguage();
  toast("Vuelves a tener el idioma original");
});
$("savInput").addEventListener("change", async (e) => {
  const list = [...e.target.files]; e.target.value = "";
  let n = 0;
  for (const f of list) {
    if (/\.zip$/i.test(f.name)) {
      const unz = fflate.unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [k, v] of Object.entries(unz)) if (/\.sav$/i.test(k)) { FS.writeFile(DATA + "/" + k.split("/").pop(), v); n++; }
    } else if (/\.sav$/i.test(f.name)) { FS.writeFile(DATA + "/" + f.name, new Uint8Array(await f.arrayBuffer())); n++; }
  }
  if (!n) return toast("No había archivos .sav");
  await persist(); refreshReady(); toast(n === 1 ? "1 partida importada" : `${n} partidas importadas`);
});

/* ---------- Hojas ---------- */
function openSheet(name) { if (name === "settings") refreshLanguage(); $("sheet-" + name).hidden = false; }
function closeSheets() { document.querySelectorAll(".scrim").forEach((s) => (s.hidden = true)); $("wipeConfirm").hidden = true; }
document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]"); if (o) { openSheet(o.dataset.open); return; }
  if (e.target.closest("[data-close]") || e.target.classList.contains("scrim")) closeSheets();
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.body.classList.contains("playing")) closeSheets(); });

function bindSeg(id, key) {
  const seg = $(id);
  const paint = () => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === settings[key])));
  seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; settings[key] = b.dataset.v; store.set(key, settings[key]); paint(); });
  paint();
}
bindSeg("segUi", "ui"); bindSeg("segDpr", "dpr");
$("optVideos").checked = settings.videos;
$("optVideos").addEventListener("change", (e) => { settings.videos = e.target.checked; store.set("videos", settings.videos); toast(settings.videos ? "Los vídeos se incluirán en la próxima importación" : "Los vídeos no se importarán"); });
$("optPrecision").checked = store.get("precision", true) !== false;
$("optPrecision").addEventListener("change", (e) => { try { localStorage.setItem("ra.precision", String(e.target.checked)); } catch {} });
$("optDock").checked = settings.dock;
$("optDock").addEventListener("change", (e) => { settings.dock = e.target.checked; store.set("dock", settings.dock); });
$("reimportBtn").addEventListener("click", () => { closeSheets(); show("vSetup"); });
$("wipeBtn").addEventListener("click", () => ($("wipeConfirm").hidden = false));
$("wipeNo").addEventListener("click", () => ($("wipeConfirm").hidden = true));
$("wipeYes").addEventListener("click", async () => {
  rmrf(DATA); await persist(); closeSheets(); show("vSetup"); toast("Datos borrados");
});

/* ===================================================================
   Juego
   =================================================================== */
let started = false;
let pendingStart = false;
let box = null; // lienzo en horizontal (px CSS), fijo durante toda la partida

const isLandscape = () => innerWidth > innerHeight;
function safeInsets() {
  const cs = getComputedStyle($("safeProbe"));
  const n = (v) => parseFloat(v) || 0;
  return { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
}
// El lienzo solo cambia de tamaño en horizontal. En vertical conserva el último tamaño
// (queda tapado por el aviso de girar), así SDL nunca ve una pantalla más estrecha
// que su mínimo de 640×480 lógicos, que es lo que deformaba la imagen.
function fitStage() {
  if (!isLandscape()) return false;
  const i = safeInsets();
  const w = Math.floor(innerWidth - i.l - i.r), h = Math.floor(innerHeight - i.t - i.b);
  if (box && box.w === w && box.h === h) return false;
  box = { w, h };
  const c = $("canvas");
  c.style.width = w + "px"; c.style.height = h + "px";
  return true;
}
function computeScale() {
  const W = box ? box.w : Math.max(innerWidth, innerHeight), H = box ? box.h : Math.min(innerWidth, innerHeight);
  const max = Math.floor(Math.min(W * 100 / 640, H * 100 / 480));
  const phone = H < 600;
  const pick = {
    auto: phone ? max : Math.min(max, Math.round(H * 100 / 768)),
    large: max,
    medium: Math.round(max * .86),
    small: Math.round(max * .72),
  }[settings.ui] || max;
  return Math.max(50, Math.min(max, pick));
}
function capPixelRatio() {
  // SDL lee devicePixelRatio para dimensionar el lienzo; limitarlo ahorra batería
  const real = window.devicePixelRatio || 1, cap = Math.min(real, Number(settings.dpr) || 2);
  try { Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => cap }); } catch {}
}

/* ---------- Vigilante de proporciones ----------
   Si el búfer del lienzo y su tamaño en pantalla no tienen la misma proporción, la imagen
   sale estirada y los toques no caen donde se dibuja (p. ej. el menú superior). Pasa cuando
   iOS avisa del giro antes de recolocar la página, o si el juego pide otra resolución desde
   Opciones. Un «resize» hace que SDL vuelva a medir el lienzo y el motor se reajuste. */
let lastHeal = 0, healing = false;
function canvasMismatch() {
  const c = $("canvas"), r = c.getBoundingClientRect();
  if (!c.width || !c.height || !r.width || !r.height) return false;
  return Math.abs(c.width / c.height - r.width / r.height) > 0.01 || Math.abs(c.width - r.width * devicePixelRatio) > 3;
}
function heal(reason) {
  if (!started || !isLandscape() || !canvasMismatch()) return;
  const now = Date.now();
  if (now - lastHeal < 400) return;
  lastHeal = now;
  const c = $("canvas"), r = c.getBoundingClientRect();
  log("Reajuste de pantalla (" + reason + "): búfer " + c.width + "x" + c.height + ", pantalla " + Math.round(r.width) + "x" + Math.round(r.height));
  healing = true;
  try { window.dispatchEvent(new Event("resize")); } finally { healing = false; }
}
function onViewportChange() {
  if (healing) return;
  updateRotate();
  if (pendingStart && isLandscape()) { afterLayout(() => { if (pendingStart && isLandscape()) launch(); }); return; }
  if (!started) return;
  fitStage();
  [80, 300, 800, 1600].forEach((t) => setTimeout(() => heal("giro"), t));
}
// iOS dispara el evento antes de terminar de recolocar: espera dos fotogramas y un poco más
function afterLayout(fn) { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fn, 220))); }

let wakeLock = null;
async function keepAwake() {
  try { if ("wakeLock" in navigator && document.visibilityState === "visible") wakeLock = await navigator.wakeLock.request("screen"); } catch {}
}
function resumeAudio() {
  try {
    const ctx = Module.SDL2 && Module.SDL2.audioContext;
    if (ctx && ctx.state !== "running") ctx.resume();
  } catch {}
}
function updateRotate() {
  const portrait = !isLandscape();
  const waiting = pendingStart && portrait;
  $("rotate").hidden = !(waiting || (started && portrait && !ss.get("ra.portraitOk")));
  $("rotateTitle").textContent = waiting ? "Gira el iPhone para empezar" : "Gira el iPhone";
  $("rotateText").textContent = waiting
    ? "La partida arranca en cuanto pongas el móvil en horizontal."
    : "Caesar III se juega en horizontal. Gíralo y la ciudad ocupará toda la pantalla.";
  $("rotateDismiss").hidden = waiting;
  $("rotateCancel").hidden = !waiting;
}
function startGame() {
  if (started) { location.reload(); return; }
  const s = gameStats();
  if (!s.valid) { show("vSetup"); return; }
  document.body.classList.add("playing");
  $("stage").hidden = false;
  keepAwake();
  if (!isLandscape()) { pendingStart = true; updateRotate(); return; }
  launch();
}
function launch() {
  pendingStart = false;
  started = true;
  capPixelRatio();
  fitStage();
  $("dock").hidden = !settings.dock;
  updateRotate();
  const scale = computeScale();
  log("Arrancando Augustus, escala " + scale + "% · lienzo " + box.w + "x" + box.h + " · pantalla " + innerWidth + "x" + innerHeight + " · dpr " + devicePixelRatio);
  try {
    Module.callMain(["--windowed", "--display-scale", (scale / 100).toFixed(2), DATA]);
  } catch (e) {
    if (!(e && e.name === "ExitStatus")) { log("callMain:", e && e.stack || e); }
  }
  $("canvas").focus({ preventScroll: true });
  idleDock();
  // el motor crea la ventana con su tamaño guardado: comprobamos enseguida y luego cada poco
  [300, 900, 2000].forEach((t) => setTimeout(() => heal("arranque"), t));
  setInterval(() => heal("vigilante"), 1000);
}
$("playBtn").addEventListener("click", startGame);
$("retryBtn").addEventListener("click", () => location.reload());
$("relockBtn").addEventListener("click", () => window.RA_ACCESS && window.RA_ACCESS.lock());
$("canvas").addEventListener("contextmenu", (e) => e.preventDefault());
$("rotateDismiss").addEventListener("click", () => { ss.set("ra.portraitOk", "1"); updateRotate(); });
$("rotateCancel").addEventListener("click", () => {
  pendingStart = false; updateRotate();
  document.body.classList.remove("playing"); $("stage").hidden = true;
});
addEventListener("resize", onViewportChange);
addEventListener("orientationchange", () => afterLayout(onViewportChange));
if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener("change", () => afterLayout(onViewportChange));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { if (started) keepAwake(); }
  else if (fsReady) persist();
});
addEventListener("pagehide", () => { if (fsReady) persist(); });

// Gestos de iOS que no deben llegar al navegador
["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", (e) => { if (document.body.classList.contains("playing") && !e.target.closest(".sheet")) e.preventDefault(); }, { passive: false });
document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
document.addEventListener("pointerdown", resumeAudio, true);
document.addEventListener("touchend", resumeAudio, true);

/* ---------- Teclas y clic derecho sintéticos ---------- */
const KEYS = {
  pause: { key: "p", code: "KeyP", keyCode: 80 },
  slower: { key: "PageDown", code: "PageDown", keyCode: 34 },
  faster: { key: "PageUp", code: "PageUp", keyCode: 33 },
  overlay: { key: " ", code: "Space", keyCode: 32 },
  rotate: { key: "Home", code: "Home", keyCode: 36 },
  backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  enter: { key: "Enter", code: "Enter", keyCode: 13 },
  ctrl: { key: "Control", code: "ControlLeft", keyCode: 17 },
  s: { key: "s", code: "KeyS", keyCode: 83 },
};
function keyEvent(type, k, charCode = 0) {
  const ev = new KeyboardEvent(type, { key: k.key, code: k.code, bubbles: true, cancelable: true });
  const def = (p, v) => { try { Object.defineProperty(ev, p, { get: () => v }); } catch {} };
  def("keyCode", type === "keypress" ? charCode : k.keyCode); def("which", type === "keypress" ? charCode : k.keyCode); def("charCode", charCode);
  window.dispatchEvent(ev);
}
function tapKey(k) { keyEvent("keydown", k); setTimeout(() => keyEvent("keyup", k), 40); }
// Tecla por nombre: "W", "1", "-", "=", "Space", "Home", "F1", "PageUp"…
function keyFor(name) {
  const special = {
    Space: [" ", "Space", 32], Home: ["Home", "Home", 36], End: ["End", "End", 35],
    PageUp: ["PageUp", "PageUp", 33], PageDown: ["PageDown", "PageDown", 34],
    "-": ["-", "Minus", 189], "=": ["=", "Equal", 187],
  };
  if (special[name]) { const [key, code, keyCode] = special[name]; return { key, code, keyCode }; }
  if (/^F\d{1,2}$/.test(name)) return { key: name, code: name, keyCode: 111 + Number(name.slice(1)) };
  if (/^\d$/.test(name)) return { key: name, code: "Digit" + name, keyCode: 48 + Number(name) };
  return { key: name.toLowerCase(), code: "Key" + name.toUpperCase(), keyCode: name.toUpperCase().charCodeAt(0) };
}
// "Ctrl+S", "Ctrl+F1", "W"… (SDL lleva la cuenta de los modificadores por sus propias teclas)
function sendCombo(combo) {
  const parts = combo.split("+"), main = keyFor(parts.pop()), ctrl = parts.includes("Ctrl");
  if (ctrl) keyEvent("keydown", KEYS.ctrl);
  keyEvent("keydown", main);
  setTimeout(() => { keyEvent("keyup", main); if (ctrl) keyEvent("keyup", KEYS.ctrl); }, 60);
}
// Ctrl+S: abre «Guardar partida»
function saveShortcut() {
  keyEvent("keydown", KEYS.ctrl); keyEvent("keydown", KEYS.s);
  setTimeout(() => { keyEvent("keyup", KEYS.s); keyEvent("keyup", KEYS.ctrl); }, 60);
}
// Zoom con la rueda del ratón, centrado en la pantalla (Augustus: rueda = zoom)
function zoom(dir) {
  const c = $("canvas"), r = c.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  c.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
  c.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY: dir > 0 ? -120 : 120, deltaMode: 0 }));
}
function typeChar(ch) {
  const code = ch.codePointAt(0);
  const k = { key: ch, code: "", keyCode: 0 };
  keyEvent("keypress", k, code);
}
function rightClick() {
  const c = $("canvas"), r = c.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, button: 2 };
  c.dispatchEvent(new MouseEvent("mousedown", { ...opts, buttons: 2 }));
  setTimeout(() => c.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 })), 50);
}

/* ---------- Dock ---------- */
let idleTimer;
function idleDock() { const d = $("dock"); d.classList.remove("idle"); clearTimeout(idleTimer); idleTimer = setTimeout(() => d.classList.add("idle"), 3200); }
$("dock").addEventListener("pointerdown", (e) => { e.stopPropagation(); idleDock(); });
$("dock").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const act = b.dataset.act;
  if (act === "back") rightClick();
  else if (act === "fold") $("dock").classList.toggle("folded");
  else if (act === "mando") openMando();
  else if (act === "zoomIn") zoom(1);
  else if (act === "zoomOut") zoom(-1);
  else if (KEYS[act]) tapKey(KEYS[act]);
});

/* ---------- Centro de mando ---------- */
function openMando() { $("mando").hidden = false; }
function closeMando() { $("mando").hidden = true; $("canvas").focus({ preventScroll: true }); }
$("mando").addEventListener("click", (e) => {
  if (e.target === $("mando") || e.target.closest("[data-mando-close]")) return closeMando();
  const b = e.target.closest("button[data-cmd]"); if (!b) return;
  const cmd = b.dataset.cmd;
  closeMando();
  // la orden llega al juego cuando el panel ya está cerrado
  setTimeout(() => {
    if (cmd === "@keyboard") openKeyboard();
    else if (cmd === "@sidebar") { try { Module._ra_toggle_sidebar(); } catch (err) { log("panel:", err); } }
    else sendCombo(cmd);
  }, 80);
});
["touchstart", "touchmove", "touchend"].forEach((t) => $("mando").addEventListener(t, (e) => e.stopPropagation(), { passive: true }));


/* ---------- Teclado del iPhone → texto del juego ---------- */
const kbd = $("kbd"), SENTINEL = "  ";
function openKeyboard() { kbd.value = SENTINEL; kbd.focus({ preventScroll: true }); try { kbd.setSelectionRange(2, 2); } catch {} }
["keydown", "keyup", "keypress"].forEach((t) => kbd.addEventListener(t, (e) => {
  e.stopPropagation(); // que el SDL no reciba las teclas reales del campo oculto
  if (t === "keydown" && e.key === "Enter") { e.preventDefault(); tapKey(KEYS.enter); kbd.blur(); }
}));
kbd.addEventListener("beforeinput", (e) => {
  e.preventDefault();
  if (e.inputType === "deleteContentBackward") tapKey(KEYS.backspace);
  else if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") { tapKey(KEYS.enter); kbd.blur(); }
  else if (e.data) for (const ch of e.data) typeChar(ch);
});
kbd.addEventListener("input", () => { kbd.value = SENTINEL; });
kbd.addEventListener("blur", () => { $("typeBtn").hidden = !textActive; });
$("typeBtn").addEventListener("click", () => { $("typeBtn").hidden = true; openKeyboard(); });
let textActive = false;

/* ===================================================================
   Módulo Emscripten
   =================================================================== */
var Module = {
  canvas: $("canvas"),
  print: (t) => log(t),
  printErr: (t) => log(t),
  setStatus: () => {},
  onAbort: (what) => { log("abort:", what); fatal("El motor se ha detenido de forma inesperada. Cierra la app y vuelve a abrirla. Si se repite, prueba la nitidez Equilibrada en Ajustes."); document.body.classList.remove("playing"); $("stage").hidden = true; $("dock").hidden = true; },
  onRuntimeInitialized() {
    $("loadingText").textContent = "Abriendo tu provincia…";
    try { FS.mkdir(DATA); } catch {}
    FS.mount(IDBFS, {}, DATA);
    FS.syncfs(true, (err) => {
      if (err) { log("syncfs populate:", err); return fatal("No se puede acceder al almacenamiento del navegador. Si usas navegación privada, ábrela en una pestaña normal."); }
      fsReady = true;
      refreshReady();
      if (ss.get("ra.returned")) { ss.del("ra.returned"); toast("Has vuelto al Foro. Pulsa Gobernar para seguir"); }
    });
  },
  // Llamadas desde el motor (C → JS)
  syncFS() { persist(); },
  quitGame(status) {
    log("quitGame", status);
    if (status) {
      ss.del("ra.returned");
      document.body.classList.remove("playing"); $("stage").hidden = true; $("dock").hidden = true; $("rotate").hidden = true;
      const el = $("runErr"); el.hidden = false;
      el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><div>El motor no reconoce estos archivos como una instalación completa de Caesar III. Vuelve a importarlos desde Ajustes → Reimportar.</div>';
      return;
    }
    persist().finally(() => { ss.set("ra.returned", "1"); location.reload(); });
  },
  onTextInput(on) {
    textActive = !!on;
    $("typeBtn").hidden = !on;
    if (!on) kbd.blur();
  },
  onKeyboardShow(on) { if (on) $("typeBtn").hidden = false; },
};
window.Module = Module;

function bootEngine() {
  if (typeof WebAssembly !== "object") {
    fatal("Este navegador no es compatible con WebAssembly. Actualiza iOS a una versión reciente.");
    return;
  }
  const s = document.createElement("script");
  s.src = "augustus.js"; s.async = true;
  s.onerror = () => fatal("No se pudo descargar el motor del juego. Comprueba tu conexión e inténtalo de nuevo.");
  document.body.appendChild(s);
}
// acceso.js decide cuándo arrancar: solo tras comprobar la contraseña del área privada
if (window.RA_ACCESS && window.RA_ACCESS.unlocked()) bootEngine();
else document.addEventListener("ra:unlocked", bootEngine, { once: true });
window.addEventListener("error", (e) => log("error:", e.message));
window.addEventListener("unhandledrejection", (e) => log("promesa:", e.reason && (e.reason.stack || e.reason.message) || e.reason));

/* ---------- PWA: funciona sin conexión ---------- */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch((e) => log("sw:", e && e.message));
}
