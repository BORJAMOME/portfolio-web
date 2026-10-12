// Roma Aeterna: extrae el instalador de GOG (Inno Setup) dentro del navegador.
// innoextract compilado a WebAssembly lee el .exe sin cargarlo entero en memoria
// (WORKERFS) y entrega cada archivo a la página en cuanto termina de extraerlo.
"use strict";

let ieJob = null;
let ieReady = false;
let ieSkip = null;
let ieRead = 0;
let ieTotal = 1;
let ieLast = 0;

function ieReport(force) {
  const now = Date.now();
  if (!force && now - ieLast < 200) return;
  ieLast = now;
  postMessage({ type: "progress", read: Math.min(ieRead, ieTotal), total: ieTotal });
}

self.Module = {
  print: (t) => postMessage({ type: "log", text: t }),
  printErr: (t) => postMessage({ type: "log", text: t }),
  onFileDone(path) {
    const rel = path.replace(/^\/out\//, "");
    if (ieSkip && ieSkip.test(rel)) { FS.unlink(path); return; }
    const data = FS.readFile(path);
    FS.unlink(path);
    postMessage({ type: "file", path: rel, data }, [data.buffer]);
  },
  onRuntimeInitialized() {
    // Bytes leídos del instalador: base de la barra de progreso
    const ops = WORKERFS.stream_ops, read = ops.read;
    ops.read = function () {
      const n = read.apply(this, arguments);
      ieRead += n; ieReport(false);
      return n;
    };
    ieReady = true;
    if (ieJob) ieRun(ieJob);
  },
};

function ieRun({ files, skip, main }) {
  ieJob = null;
  ieTotal = files.reduce((a, f) => a + f.size, 0) || 1;
  ieSkip = skip ? new RegExp(skip, "i") : null;
  try {
    FS.mkdir("/in");
    FS.mount(WORKERFS, { files }, "/in");
    FS.mkdir("/out");
    const exe = files.find((f) => f.name === main) || files.find((f) => /\.exe$/i.test(f.name)) || files[0];
    const status = Module.callMain(["--extract", "--silent", "--progress=0", "--color=0", "--output-dir", "/out", "/in/" + exe.name]);
    ieRead = ieTotal; ieReport(true);
    postMessage({ type: "done", status });
  } catch (e) {
    postMessage({ type: "done", status: 1, error: String((e && e.message) || e) });
  }
}

self.onmessage = (e) => {
  if (e.data && e.data.type === "extract") {
    if (ieReady) ieRun(e.data); else ieJob = e.data;
  }
};

importScripts("innoextract.js");
