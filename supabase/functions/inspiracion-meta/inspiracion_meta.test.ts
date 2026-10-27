// deno test --allow-read supabase/functions/   (sin red: fetch y DNS simulados)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { checkUrl, isPrivateAddress, parseMeta, parseRequest } from "./logic.ts";
import { makeHandler } from "./handler.ts";

Deno.test("checkUrl: solo http(s) públicos", () => {
  assert(checkUrl("https://www.ejemplo.com/look?id=1"));
  assert(checkUrl("http://ejemplo.com:443/"));
  for (const u of ["javascript:alert(1)", "file:///etc/passwd", "ftp://ejemplo.com", "https://localhost/", "http://127.0.0.1/", "http://10.0.0.5/",
    "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://[fd00::1]/", "https://user:pw@ejemplo.com/",
    "https://ejemplo.com:8080/", "http://intranet/", "http://servidor.local/", "http://[::ffff:127.0.0.1]/", "no es una url"]) {
    assertEquals(checkUrl(u), null, u);
  }
  assertEquals(checkUrl("/img/a.jpg", "https://ejemplo.com/look/1")?.href, "https://ejemplo.com/img/a.jpg");
});

Deno.test("isPrivateAddress", () => {
  for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "127.0.0.1", "0.0.0.0", "100.64.0.1", "169.254.1.1", "224.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:10.0.0.1"]) assert(isPrivateAddress(ip), ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "151.101.1.69", "2a00:1450:4003:80e::200e"]) assert(!isPrivateAddress(ip), ip);
});

Deno.test("parseRequest", () => {
  assert("error" in parseRequest({ action: "borrar", url: "https://a.com" }));
  assert("error" in parseRequest({ action: "meta" }));
  assert("error" in parseRequest({ action: "meta", url: "http://127.0.0.1" }));
  const ok = parseRequest({ action: "image", url: "https://a.com/x.jpg" });
  assert(!("error" in ok) && ok.action === "image");
});

Deno.test("parseMeta: Open Graph, Twitter, <title>, entidades, imagen relativa y fecha", () => {
  const html = `<!doctype html><html><head><title>Respaldo &amp; título</title>
    <meta content="Abrigo camel &#8211; look de invierno" property="og:title">
    <meta property="og:site_name" content='Revista Ejemplo'>
    <meta property="og:image" content="/fotos/look.jpg">
    <meta property="article:published_time" content="2026-01-15T09:00:00+01:00">
    <meta name="description" content="Un   look   sencillo">
    <link rel="canonical" href="https://ejemplo.com/look">
  </head><body></body></html>`;
  const m = parseMeta(html, "https://ejemplo.com/look?utm=1");
  assertEquals(m.title, "Abrigo camel – look de invierno");
  assertEquals(m.siteName, "Revista Ejemplo");
  assertEquals(m.image, "https://ejemplo.com/fotos/look.jpg");
  assertEquals(m.published, "2026-01-15");
  assertEquals(m.description, "Un look sencillo");
  assertEquals(m.url, "https://ejemplo.com/look");
  const t = parseMeta("<title>Solo título</title><meta name=twitter:image content=http://10.0.0.1/a.jpg>", "https://b.com/");
  assertEquals(t.title, "Solo título");
  assertEquals(t.image, null, "imagen en red privada");
  assertEquals(parseMeta("", "https://b.com/").title, null);
});

const member = () => Promise.resolve(true);
const publicDns = () => Promise.resolve(["93.184.216.34"]);
function req(body: unknown) { return new Request("https://f/inspiracion-meta", { method: "POST", body: JSON.stringify(body) }); }

Deno.test("handler: requiere miembro y POST", async () => {
  const h = makeHandler({ isMember: () => Promise.resolve(false), fetch: () => { throw new Error("no"); }, resolve: publicDns });
  assertEquals((await h(req({ action: "meta", url: "https://a.com" }))).status, 401);
  assertEquals((await h(new Request("https://f/", { method: "GET" }))).status, 405);
});

Deno.test("handler: meta de una página y redirección comprobada", async () => {
  const calls: string[] = [];
  const fakeFetch = ((u: string) => {
    calls.push(u);
    if (u === "https://a.com/corto") return Promise.resolve(new Response(null, { status: 301, headers: { location: "/look" } }));
    return Promise.resolve(new Response('<meta property="og:title" content="Look"><meta property="og:image" content="https://cdn.a.com/l.webp">', { headers: { "content-type": "text/html; charset=utf-8" } }));
  }) as typeof fetch;
  const h = makeHandler({ isMember: member, fetch: fakeFetch, resolve: publicDns });
  const r = await h(req({ action: "meta", url: "https://a.com/corto" }));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.title, "Look");
  assertEquals(j.image, "https://cdn.a.com/l.webp");
  assertEquals(calls, ["https://a.com/corto", "https://a.com/look"]);
});

Deno.test("handler: rechaza DNS privado y redirección a red interna", async () => {
  const fakeFetch = ((u: string) => Promise.resolve(u.includes("salta") ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }) : new Response("x"))) as typeof fetch;
  const h1 = makeHandler({ isMember: member, fetch: fakeFetch, resolve: () => Promise.resolve(["10.0.0.7"]) });
  assertEquals((await h1(req({ action: "meta", url: "https://interno.ejemplo.com/" }))).status, 422);
  const h2 = makeHandler({ isMember: member, fetch: fakeFetch, resolve: publicDns });
  assertEquals((await h2(req({ action: "meta", url: "https://a.com/salta" }))).status, 422);
});

Deno.test("handler: imagen solo JPEG/PNG/WebP y con tamaño limitado", async () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const ok = makeHandler({ isMember: member, fetch: (() => Promise.resolve(new Response(png, { headers: { "content-type": "image/png" } }))) as typeof fetch, resolve: publicDns });
  const r = await ok(req({ action: "image", url: "https://a.com/x.png" }));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("content-type"), "image/png");
  assertEquals(new Uint8Array(await r.arrayBuffer()), png);
  const gif = makeHandler({ isMember: member, fetch: (() => Promise.resolve(new Response(png, { headers: { "content-type": "image/gif" } }))) as typeof fetch, resolve: publicDns });
  assertEquals((await gif(req({ action: "image", url: "https://a.com/x.gif" }))).status, 415);
  const big = makeHandler({ isMember: member, fetch: (() => Promise.resolve(new Response(png, { headers: { "content-type": "image/png", "content-length": String(50 * 1024 * 1024) } }))) as typeof fetch, resolve: publicDns });
  assertEquals((await big(req({ action: "image", url: "https://a.com/x.png" }))).status, 422);
});

Deno.test("handler: un enlace directo a una imagen se trata como imagen", async () => {
  const h = makeHandler({ isMember: member, fetch: (() => Promise.resolve(new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }))) as typeof fetch, resolve: publicDns });
  const j = await (await h(req({ action: "meta", url: "https://a.com/foto.jpg" }))).json();
  assertEquals(j.direct, true);
  assertEquals(j.image, "https://a.com/foto.jpg");
});
