// handler.ts: la parte HTTP de inspiracion-meta, separada de index.ts para probarla sin red.
// Solo POST con JSON pequeño y llamante miembro del área privada. Cada salto de una redirección se vuelve a
// comprobar (URL y DNS): nada de localhost ni redes privadas. Tiempo y tamaño limitados.
import { checkUrl, imageType, isPrivateAddress, MAX_HTML, MAX_IMAGE, parseMeta, parseRequest } from "./logic.ts";

export const CORS = {
  "Access-Control-Allow-Origin": "https://borjamora.es",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export interface Deps {
  isMember: (req: Request) => Promise<boolean>;
  fetch: typeof fetch;
  resolve: (host: string) => Promise<string[]>;   // A y AAAA del host
  timeoutMs?: number;
}
const UA = "Mozilla/5.0 (compatible; ColorStudioInspiracion/1.0; +https://borjamora.es)";

class Refused extends Error {}

/** fetch con comprobación de cada salto (máx. 4 redirecciones) y lectura acotada. */
async function safeFetch(d: Deps, start: URL, accept: string, max: number): Promise<{ res: Response; body: Uint8Array<ArrayBuffer>; url: URL }> {
  let url = start;
  const signal = AbortSignal.timeout(d.timeoutMs ?? 8000);
  for (let hop = 0; hop < 5; hop++) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const ips = /^[\d.]+$/.test(host) || host.includes(":") ? [host] : await d.resolve(host).catch(() => []);
    if (!ips.length) throw new Refused("No se encuentra el sitio");
    if (ips.some(isPrivateAddress)) throw new Refused("Enlace no admitido");
    const res = await d.fetch(url.href, { redirect: "manual", signal, headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "es-ES,es;q=0.9,en;q=0.8" } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      const next = loc ? checkUrl(loc, url.href) : null;
      if (!next) throw new Refused("Redirección no admitida");
      url = next;
      continue;
    }
    if (!res.ok) { await res.body?.cancel(); throw new Refused("La página responde " + res.status); }
    const len = Number(res.headers.get("content-length") || 0);
    if (len > max) { await res.body?.cancel(); throw new Refused("Demasiado grande"); }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) { await reader.cancel(); if (accept.startsWith("image")) throw new Refused("Demasiado grande"); break; }
        chunks.push(value);
      }
    }
    const body = new Uint8Array(new ArrayBuffer(Math.min(size, max)));
    let o = 0;
    for (const c of chunks) { body.set(c.subarray(0, body.length - o), o); o += c.length; if (o >= body.length) break; }
    return { res, body, url };
  }
  throw new Refused("Demasiadas redirecciones");
}

export function makeHandler(d: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return json(405, { error: "Solo POST" });
    if (!(await d.isMember(req))) return json(401, { error: "No autorizado" });
    let body: unknown;
    try {
      const t = await req.text();
      if (t.length > 4000) return json(413, { error: "Petición demasiado grande" });
      body = t ? JSON.parse(t) : {};
    } catch { return json(400, { error: "JSON no válido" }); }
    const r = parseRequest(body);
    if ("error" in r) return json(400, { error: r.error });
    try {
      if (r.action === "meta") {
        const { res, body: html, url } = await safeFetch(d, r.url, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", MAX_HTML);
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (imageType(ct)) return json(200, { title: null, siteName: null, image: url.href, published: null, description: null, url: url.href, direct: true });
        if (!/html|xml/.test(ct)) return json(422, { error: "El enlace no es una página web" });
        return json(200, parseMeta(new TextDecoder("utf-8", { fatal: false }).decode(html), url.href));
      }
      const { res, body: bytes } = await safeFetch(d, r.url, "image/webp,image/jpeg,image/png;q=0.9", MAX_IMAGE);
      const type = imageType(res.headers.get("content-type"));
      if (!type) return json(415, { error: "La imagen no es JPEG, PNG ni WebP" });
      return new Response(bytes, { status: 200, headers: { ...CORS, "Content-Type": type, "Cache-Control": "no-store" } });
    } catch (err) {
      if (err instanceof Refused) return json(422, { error: err.message });
      const msg = err instanceof Error && err.name === "TimeoutError" ? "La página tarda demasiado en responder" : "No se ha podido abrir el enlace";
      console.error("[inspiracion-meta]", err instanceof Error ? err.name : err);
      return json(502, { error: msg });
    }
  };
}
