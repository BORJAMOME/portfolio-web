// logic.ts: lógica pura de inspiracion-meta (sin red), probada en inspiracion_meta.test.ts.
// · checkUrl / isPrivateAddress: solo http(s) públicos (nada de localhost, redes privadas, puertos raros ni credenciales).
// · parseMeta: título, fuente, imagen, fecha y descripción de las etiquetas <meta> (Open Graph, Twitter) y <title>.

export const MAX_HTML = 1_500_000;          // bytes de HTML que se leen como mucho
export const MAX_IMAGE = 10 * 1024 * 1024;  // bytes de imagen
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type Meta = { title: string | null; siteName: string | null; image: string | null; published: string | null; description: string | null; url: string };

export function parseRequest(body: unknown): { action: "meta" | "image"; url: URL } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.action !== "meta" && b.action !== "image") return { error: "Acción desconocida" };
  if (typeof b.url !== "string" || b.url.length > 2000) return { error: "Falta el enlace" };
  const url = checkUrl(b.url);
  if (!url) return { error: "Enlace no admitido: solo páginas públicas http(s)" };
  return { action: b.action, url };
}

/** URL pública http(s) o null. No resuelve DNS (eso lo hace el handler con isPrivateAddress). */
export function checkUrl(raw: string, base?: string): URL | null {
  let u: URL;
  try { u = base ? new URL(raw, base) : new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(host) || !host.includes(".") && !host.startsWith("[")) return null;
  const ip = host.replace(/^\[|\]$/g, "");
  if (isIpLiteral(ip) && isPrivateAddress(ip)) return null;
  return u;
}

export function isIpLiteral(h: string) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":"); }

function v4(ip: string): number[] | null {
  const p = ip.split(".").map(Number);
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}
/** ¿Dirección no pública? IPv4 privadas, bucle, enlace local, CGNAT, multidifusión, reservadas; IPv6 equivalentes y mapeadas. */
export function isPrivateAddress(ip: string): boolean {
  const a = v4(ip);
  if (a) {
    const [x, y] = a;
    return x === 0 || x === 10 || x === 127 || x >= 224 || (x === 100 && y >= 64 && y <= 127) || (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 192 && y === 0 && a[2] === 0) || (x === 198 && (y === 18 || y === 19));
  }
  const s = ip.toLowerCase();
  if (!s.includes(":")) return true;                       // ni IPv4 ni IPv6: no se acepta
  if (s === "::" || s === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (/^::ffff:/.test(s) || /^(fc|fd)/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^64:ff9b:/.test(s) || /^2001:db8/.test(s)) return true;
  return false;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
}
const clean = (s: string | undefined | null, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Metadatos de una página. baseUrl resuelve imágenes relativas; solo se devuelven imágenes http(s) públicas. */
export function parseMeta(html: string, baseUrl: string): Meta {
  const head = html.slice(0, MAX_HTML);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (key && a.content != null && !(key in meta)) meta[key] = a.content;
  }
  let canonical: string | null = null;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if ((a.rel || "").toLowerCase().split(/\s+/).includes("canonical") && a.href) { canonical = a.href; break; }
  }
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const imgRaw = meta["og:image:secure_url"] || meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || meta["twitter:image:src"] || meta["image"] || null;
  const img = imgRaw ? checkUrl(imgRaw.trim(), baseUrl) : null;
  const pub = meta["article:published_time"] || meta["og:published_time"] || meta["datepublished"] || meta["date"] || meta["pubdate"] || null;
  const d = pub ? /^(\d{4}-\d{2}-\d{2})/.exec(pub.trim()) : null;
  const canon = canonical ? checkUrl(canonical, baseUrl) : null;
  return {
    title: clean(meta["og:title"] || meta["twitter:title"] || (t ? decodeEntities(t[1]) : null), 160),
    siteName: clean(meta["og:site_name"] || meta["application-name"], 120),
    image: img ? img.href : null,
    published: d ? d[1] : null,
    description: clean(meta["og:description"] || meta["twitter:description"] || meta["description"], 600),
    url: canon ? canon.href : baseUrl,
  };
}

/** Tipo de imagen admitido a partir de la cabecera Content-Type (o null). */
export function imageType(contentType: string | null): string | null {
  const t = (contentType || "").split(";")[0].trim().toLowerCase();
  return IMAGE_TYPES.includes(t) ? t : t === "image/jpg" ? "image/jpeg" : null;
}
