// Roma Aeterna: caché de la app para jugar sin conexión.
// Los archivos del juego no pasan por aquí: viven en IndexedDB.
const VERSION = "ra-v6";
const SHELL = [
  "./", "index.html", "app.css", "app.js", "acceso.js", "touch.js", "augustus.js", "augustus.wasm", "augustus.data", "fflate.js", "extract-worker.js", "innoextract.js", "innoextract.wasm", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "fonts/cinzel-latin-500-normal.woff2", "fonts/cinzel-latin-700-normal.woff2",
  "fonts/alegreya-sans-latin-400-normal.woff2", "fonts/alegreya-sans-latin-500-normal.woff2",
  "fonts/alegreya-sans-latin-700-normal.woff2",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // red primero para la página (recibe actualizaciones), caché primero para lo demás
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put("index.html", copy)); return r; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return r;
  })));
});
