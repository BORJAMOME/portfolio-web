// ═══════════════════════════════════════════════
// research.ts — de la respuesta del modelo a una investigación verificada
// ───────────────────────────────────────────────
// El modelo devuelve un JSON con hechos, personas y fuentes. No nos fiamos de él:
//   · una fuente solo se acepta si su URL está entre las que la búsqueda/lectura web
//     devolvió de verdad en esa misma llamada (o la aportaron la oferta o los correos).
//     Así no pueden colarse URLs inventadas.
//   · un hecho sin fuente aceptada pasa a «inferencia» (y las noticias sin fuente se quitan)
//   · una persona sin fuente aceptada queda «no_verificado»
//   · fechas solo con formato AAAA, AAAA-MM o AAAA-MM-DD
// ═══════════════════════════════════════════════
import type { Fact, FactKind, Research, ResearchPerson, Source, SourceType } from "./types.ts";

const TRACKING = /^(utm_[a-z]+|gclid|fbclid|mc_cid|mc_eid|trk|trackingId|refId|originalSubdomain)$/i;

/** URL normalizada para comparar: sin #, sin parámetros de seguimiento, host en minúsculas, sin «/» final */
export function canonicalUrl(u: string): string | null {
  try {
    const url = new URL(String(u).trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^[a-z]{2}\.linkedin\.com$/, "linkedin.com");
    url.protocol = "https:";
    return url.toString().replace(/\/(\?|$)/, "$1");
  } catch { return null; }
}
const domain = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Último bloque ```json … ``` de la respuesta, o el primer «{» hasta el último «}» */
export function extractJson(text: string): unknown {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = blocks.length ? blocks.reverse() : [text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const c of candidates) { try { return JSON.parse(c); } catch { /* siguiente */ } }
  throw new Error("La investigación no devolvió un JSON válido");
}

export type Retrieved = Map<string, { url: string; title: string | null; page_age: string | null }>;
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const KINDS: FactKind[] = ["confirmado", "empresa", "tercero", "inferencia"];
const TYPES: SourceType[] = ["oficial", "empresa", "prensa", "perfil", "oferta", "otro"];
const s = (v: unknown, n = 400) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const strs = (v: unknown, n = 160, max = 12) => arr(v).map((x) => s(x, n)).filter((x): x is string => !!x).slice(0, max);

/**
 * raw: JSON del modelo. retrieved: URLs que devolvió la herramienta en esta llamada.
 * extra: URLs que no vienen de la búsqueda pero son de confianza (oferta enlazada, enlaces de los correos).
 */
export function verifyResearch(raw: any, retrieved: Retrieved, extra: string[], nowIso: string): Research {
  const allowed = new Map(retrieved);
  for (const u of extra) { const c = canonicalUrl(u); if (c && !allowed.has(c)) allowed.set(c, { url: u, title: null, page_age: null }); }

  const sources: Source[] = [];
  const idMap = new Map<number, number>();
  let rejected = 0;
  for (const src of arr(raw?.sources)) {
    const c = canonicalUrl(src?.url ?? "");
    const hit = c ? allowed.get(c) : undefined;
    if (!hit) { rejected++; continue; }
    const id = sources.length + 1;
    idMap.set(Number(src.id), id);
    const pub = s(src.published, 10);
    sources.push({
      id, url: hit.url, title: s(src.title, 200) ?? hit.title ?? domain(hit.url), domain: domain(hit.url),
      published: pub && DATE.test(pub) ? pub : (hit.page_age && DATE.test(hit.page_age.slice(0, 10)) ? hit.page_age.slice(0, 10) : null),
      retrieved_at: nowIso, type: TYPES.includes(src.type) ? src.type : "otro",
    });
  }
  const ids = (v: unknown) => [...new Set(arr(v).map((x) => idMap.get(Number(x))).filter((x): x is number => !!x))];
  const fact = (f: any): Fact | null => {
    const text = s(f?.text, 400);
    if (!text) return null;
    const source_ids = ids(f?.source_ids);
    const kind: FactKind = !source_ids.length ? "inferencia" : KINDS.includes(f?.kind) ? f.kind : "tercero";
    return { text, kind, source_ids };
  };

  const c = raw?.company ?? {};
  const news = arr(c.news).map((n: any) => {
    const f = fact(n);
    if (!f || !f.source_ids.length) return null;           // una noticia sin fuente no es una noticia
    const date = s(n?.date, 10);
    return { ...f, date: date && DATE.test(date) ? date : null, why: s(n?.why, 300) };
  }).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 4);

  const people: ResearchPerson[] = arr(raw?.people).slice(0, 6).map((p: any) => {
    const source_ids = ids(p?.source_ids);
    const identified = source_ids.length && (p?.identified === "alto" || p?.identified === "medio") ? p.identified : "no_verificado";
    return {
      name: s(p?.name, 120) ?? "", current_title: identified === "no_verificado" ? s(p?.current_title_from_invitation, 160) : s(p?.current_title, 160),
      area: identified === "no_verificado" ? null : s(p?.area, 120), identified,
      background: identified === "no_verificado" ? null : s(p?.background, 400),
      public_activity: identified === "no_verificado" ? null : s(p?.public_activity, 300),
      likely_role: s(p?.likely_role, 200), source_ids: identified === "no_verificado" ? [] : source_ids,
    } as ResearchPerson;
  }).filter((p) => p.name);

  const roleIds = ids(raw?.role?.source_ids);
  const gaps = strs(raw?.gaps, 240, 8);
  if (rejected) gaps.unshift(rejected === 1 ? "Se descartó 1 fuente que no aparecía en los resultados de búsqueda." : `Se descartaron ${rejected} fuentes que no aparecían en los resultados de búsqueda.`);

  return {
    company: {
      name: s(c.name, 160) ?? "", domain: s(c.domain, 120), confirmed: !!c.confirmed && sources.some((x) => x.type === "oficial" || x.type === "empresa"),
      ambiguity: s(c.ambiguity, 300), summary: s(c.summary, 700) ?? "", business_model: s(c.business_model, 400),
      facts: arr(c.facts).map(fact).filter((x): x is Fact => !!x).slice(0, 8),
      news,
      data_initiatives: arr(c.data_initiatives).map(fact).filter((x): x is Fact => !!x).slice(0, 4),
    },
    role: {
      title: s(raw?.role?.title, 200), available: !!raw?.role?.available && (roleIds.length > 0 || raw?.role?.from_email === true), level: s(raw?.role?.level, 80),
      responsibilities: strs(raw?.role?.responsibilities), must: strs(raw?.role?.must), nice: strs(raw?.role?.nice),
      tools: strs(raw?.role?.tools, 60, 20), languages: strs(raw?.role?.languages, 60, 6),
      location: s(raw?.role?.location, 120), mode: s(raw?.role?.mode, 60), source_ids: roleIds,
    },
    people, sources, gaps,
  };
}
