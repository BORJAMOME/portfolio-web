// ═══════════════════════════════════════════════
// free.ts, FreeProvider: briefing automático SIN IA y SIN COSTE (proveedor por defecto)
// ───────────────────────────────────────────────
// Investigación (solo fuentes públicas gratuitas, sin claves):
//   · web de la empresa (dominio del correo de quien convoca): título y descripción de la portada
//   · página de la oferta, si la invitación la enlaza (salvo LinkedIn, que no se lee)
//   · noticias recientes: RSS público de Google News (titular, medio, fecha y enlace)
//   · entrevistadores: lo que dice la invitación + enlaces de búsqueda para que los mires tú
//     (no se consulta LinkedIn ni se hace scraping: quedan «sin verificar»)
// Informe: plantillas por tipo de entrevista rellenadas con TU nota de perfil
//   (proyectos elegidos por afinidad con el puesto, brechas, preguntas, presentación).
//   Nada se inventa: lo que no está en el perfil o en las fuentes no aparece.
// Cada lectura web tiene tiempo máximo, tamaño máximo y solo https a dominios públicos.
// ═══════════════════════════════════════════════
import { norm } from "./classify.ts";
import type { AIProvider, ReportInput, ResearchInput } from "./pipeline.ts";
import type { EvidenceClass, Report, Research, Source, Usage } from "./types.ts";

const ZERO: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, web_search_requests: 0, web_fetch_requests: 0, usd: 0 };
const MAX_BYTES = 400_000;

/* ═══════════ Lectura web segura ═══════════ */
export function isPublicHttps(u: string) {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host.startsWith("[")) return false;   // IP literal
    return true;
  } catch { return false; }
}
async function getText(fetchFn: typeof fetch, url: string, timeoutMs = 8000): Promise<{ url: string; text: string } | null> {
  if (!isPublicHttps(url)) return null;
  try {
    const r = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (preparacion de entrevista personal)", Accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9" } });
    if (!r.ok || !r.body) return null;
    const reader = r.body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
    while (n < MAX_BYTES) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; }
    reader.cancel().catch(() => {});
    const buf = new Uint8Array(n); let o = 0; for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, n - o)), o); o += c.length; if (o >= n) break; }
    return { url: r.url || url, text: new TextDecoder().decode(buf) };
  } catch { return null; }
}
const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Título y descripción de una página (meta description u og:description) */
export function pageMeta(html: string) {
  const attr = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
    const tag = re.exec(html)?.[0] ?? "";
    const c = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    return c ? decode(c).slice(0, 400) : null;
  };
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return { title: title ? decode(title).slice(0, 200) : attr("og:title"), description: attr("description") ?? attr("og:description") };
}
/** Texto visible aproximado (para la oferta) */
export function pageText(html: string, max = 6000) {
  return decode(html.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, ". ")).slice(0, max);
}
/** Noticias del RSS de Google News: [{title, url, source, date}] */
export function parseNewsRss(xml: string, sinceIso: string) {
  const out: { title: string; url: string; source: string | null; date: string | null }[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const get = (t: string) => { const x = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(it)?.[1]; return x ? decode(x) : null; };
    const url = get("link"), title = get("title"), pub = get("pubDate");
    if (!url || !title || !/^https:\/\//.test(url)) continue;
    const d = pub ? new Date(pub) : null;
    const date = d && !isNaN(+d) ? d.toISOString().slice(0, 10) : null;
    if (date && date < sinceIso.slice(0, 10)) continue;
    const source = get("source");
    out.push({ title: source && title.endsWith(" - " + source) ? title.slice(0, -(source.length + 3)) : title, url, source, date });
  }
  return out;
}

/* ═══════════ Perfil (nota en Markdown) ═══════════ */
export type ProfileProject = { name: string; body: string; field: (k: string) => string | null };
export function parseProfile(md: string | null) {
  const text = md ?? "";
  const section = (title: string) => {
    const i = text.search(new RegExp("^##\\s+" + title, "mi"));
    if (i < 0) return "";
    const rest = text.slice(i).split("\n").slice(1).join("\n");
    const j = rest.search(/^##\s/m);
    return j < 0 ? rest : rest.slice(0, j);
  };
  const projects: ProfileProject[] = section("Proyectos").split(/^###\s+/m).slice(1).map((chunk) => {
    const [head, ...lines] = chunk.split("\n");
    const body = lines.join("\n");
    return {
      name: head.replace(/\(.*?\)/g, "").split("·")[0].trim(),
      body,
      field: (k: string) => {
        const m = new RegExp("^-\\s*(?:" + k + ")[^:]*:\\s*(.+)$", "mi").exec(body);
        return m ? m[1].trim() : null;
      },
    };
  }).filter((p) => p.name);
  const jobs = [...section("Experiencia laboral").matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
  return { projects, jobs, skills: section("Competencias"), review: section("Temas técnicos para repasar").trim(), pending: section("PENDIENTE DE VERIFICAR"), hasPL300: /PL-300/.test(text), text };
}

const TOPICS = ["power bi", "dax", "power query", "sql", "python", "excel", "finanz", "contab", "presupuest", "ventas", "retail", "tienda", "logist",
  "marketing", "campa", "cliente", "rfm", "segment", "machine learning", "etl", "calidad", "dashboard", "kpi", "ibcs", "reporting", "hostel", "fabric", "modelad", "estrella"];
const TOOLS = ["Power BI", "DAX", "Power Query", "SQL", "Python", "Excel", "Fabric", "Azure", "Databricks", "Snowflake", "Tableau", "Looker", "Qlik", "dbt", "Airflow", "Spark", "AWS", "GCP", "BigQuery", "SAP", "Git", "SSIS", "SSAS"];

export function rankProjects(projects: ProfileProject[], target: string) {
  const t = norm(target);
  const wanted = TOPICS.filter((k) => t.includes(k));
  return projects.map((p, i) => ({ p, i, score: wanted.filter((k) => norm(p.name + " " + p.body).includes(k)).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.p);
}
/** Herramientas que pide el puesto y qué evidencia hay en el perfil */
export function toolEvidence(target: string, skills: string): { tool: string; cls: EvidenceClass; line: string }[] {
  const t = " " + norm(target) + " ", lines = skills.split("\n").filter((l) => l.trim().startsWith("-"));
  // palabra completa: «sql» no casa con «mysql», «sap» no casa con «sapiens»
  const has = (text: string, k: string) => {
    const i = text.indexOf(norm(k)), word = /[a-z0-9]/;
    for (let at = i; at > -1; at = text.indexOf(norm(k), at + 1)) {
      if (!word.test(text[at - 1] ?? " ") && !word.test(text[at + norm(k).length] ?? " ")) return true;
    }
    return false;
  };
  return TOOLS.filter((k) => has(t, k)).map((tool) => {
    const hits = lines.filter((l) => has(norm(l), tool));
    const all = hits.join(" ");
    const cls: EvidenceClass = !hits.length ? "brecha" : /\[laboral\]|\[proyecto\]/.test(all) ? "demostrado" : "formacion";
    return { tool, cls, line: hits[0]?.replace(/^-\s*/, "").slice(0, 200) ?? "Sin evidencia en el perfil" };
  });
}

/* ═══════════ Proveedor ═══════════ */
export class FreeProvider implements AIProvider {
  constructor(private now = () => new Date(), private fetchFn: typeof fetch = fetch) {}

  async research(input: ResearchInput) {
    const i = input.interview, now = this.now().toISOString();
    const company = i.company ?? null;
    const sources: Source[] = [];
    const add = (url: string, title: string, type: Source["type"], published: string | null = null) => {
      const id = sources.length + 1;
      sources.push({ id, url, title: title.slice(0, 200), domain: new URL(url).hostname.replace(/^www\./, ""), published, retrieved_at: now, type });
      return id;
    };
    const facts: Research["company"]["facts"] = [], gaps: string[] = [];

    // 1. web de la empresa
    let summary = "";
    if (i.company_domain) {
      const home = await getText(this.fetchFn, `https://${i.company_domain}/`);
      const meta = home ? pageMeta(home.text) : null;
      if (meta && (meta.title || meta.description)) {
        const id = add(home!.url, meta.title ?? i.company_domain, "oficial");
        summary = meta.description ? `Su web se presenta así: «${meta.description}»` : "";
        facts.push({ text: meta.description ? `La empresa se describe como: «${meta.description}»` : `Web oficial: ${meta.title}`, kind: "empresa", source_ids: [id] });
      } else gaps.push(`No se pudo leer la web ${i.company_domain}.`);
    } else gaps.push("No se conoce el dominio de la empresa (el correo de quien convoca es genérico o de una herramienta de selección).");

    // 2. oferta enlazada (LinkedIn no se lee: requiere sesión)
    let jobText = "";
    if (i.job_url && !/linkedin\.com/i.test(i.job_url)) {
      const job = await getText(this.fetchFn, i.job_url);
      if (job) { jobText = pageText(job.text); add(job.url, pageMeta(job.text).title ?? "Oferta de empleo", "oferta"); }
      else gaps.push("No se pudo leer la oferta enlazada.");
    } else if (i.job_url) { add(i.job_url, "Oferta en LinkedIn (ábrela tú: no se lee automáticamente)", "oferta"); gaps.push("La oferta está en LinkedIn y no se puede leer automáticamente."); }
    else gaps.push("La invitación no enlaza la oferta.");

    // 3. noticias recientes (6 meses)
    const news: Research["company"]["news"] = [];
    if (company) {
      const since = new Date(this.now().getTime() - 183 * 864e5).toISOString();
      const rss = await getText(this.fetchFn, `https://news.google.com/rss/search?q=${encodeURIComponent('"' + company + '"')}&hl=es&gl=ES&ceid=ES:es`);
      const items = rss ? parseNewsRss(rss.text, since).slice(0, 3) : [];
      for (const n of items) {
        const id = add(n.url, n.title + (n.source ? " – " + n.source : ""), "prensa", n.date);
        news.push({ text: n.title, kind: "tercero", source_ids: [id], date: n.date, why: null });
      }
      if (!rss) gaps.push("No se pudieron consultar las noticias.");
      else if (!items.length) gaps.push(`Sin noticias de «${company}» en los últimos 6 meses (o el nombre es ambiguo).`);
    }

    // 4. entrevistadores: solo la invitación + enlaces de búsqueda (no verificados)
    const people = i.attendees.filter((p) => p.name).slice(0, 5).map((p) => {
      const q = encodeURIComponent(`${p.name} ${company ?? ""}`.trim());
      const id = add(`https://www.linkedin.com/search/results/people/?keywords=${q}`, `Buscar a ${p.name} en LinkedIn`, "otro");
      return { name: p.name!, current_title: null, area: null, identified: "no_verificado" as const, background: null, public_activity: null, likely_role: null, source_ids: [id] };
    });
    if (people.length) gaps.push("Entrevistadores sin verificar: revisa sus perfiles con los enlaces de búsqueda.");

    const research: Research = {
      company: { name: company ?? "", domain: i.company_domain, confirmed: !!summary, ambiguity: null, summary, business_model: null, facts, news, data_initiatives: [] },
      role: { title: i.role_title, available: !!jobText, level: null, responsibilities: [], must: [], nice: [], tools: [], languages: [], location: null, mode: null, source_ids: [] },
      people, sources, gaps,
    };
    // texto de la oferta e invitación para elegir proyectos (no se publica tal cual)
    (research as Research & { _target?: string })._target = [i.title, i.role_title, input.event_description, jobText, ...input.emails.map((e) => e.excerpt)].filter(Boolean).join(" ").slice(0, 12000);
    return { research, usage: ZERO, model: "gratuito" };
  }

  writeReport(input: ReportInput) {
    const { interview: i, research: r } = input;
    const prof = parseProfile(input.profile);
    const company = i.company ?? (r.company.name || "la empresa");
    const role = i.role_title ?? "el puesto";
    const target = ((r as Research & { _target?: string })._target ?? "") + " " + role;
    const projects = rankProjects(prof.projects, target).slice(0, 2);
    const tools = toolEvidence(target, prof.skills);
    const gap = tools.find((t) => t.cls === "brecha") ?? tools.find((t) => t.cls === "formacion") ?? null;
    const kind = i.interview_kind;
    const p1 = projects[0]?.name ?? "uno de tus proyectos de Power BI", p2 = projects[1]?.name ?? p1;
    const peopleNames = r.people.map((p) => p.name);

    const banks: Record<string, { q: string; guide: string; evidence: EvidenceClass }[]> = {
      rrhh: [
        { q: "Cuéntame tu trayectoria y por qué te orientaste a datos.", guide: "Hilo: negocio y operaciones → primera experiencia en datos → especialización en Power BI (PL-300). Termina conectando con " + role + ".", evidence: "demostrado" },
        { q: `¿Por qué ${company} y por qué este puesto?`, guide: "Usa un dato concreto de «Lo que necesito saber» y relaciónalo con lo que te gusta: explicar el negocio con datos.", evidence: "transferible" },
        { q: "Háblame de un proyecto del que estés orgulloso.", guide: `${p1}: problema, qué hiciste tú, decisión clave y resultado (solo cifras de tu perfil).`, evidence: "demostrado" },
        { q: "¿Qué buscas en tu próximo puesto? (modalidad, salario, crecimiento)", guide: "Ten preparada una horquilla y tus preferencias; muestra flexibilidad y ganas de aprender en un equipo de datos.", evidence: "transferible" },
      ],
      tecnica: [
        { q: "¿Qué diferencia hay entre contexto de fila y de filtro? ¿Para qué sirve CALCULATE?", guide: "Define ambos con un ejemplo del negocio de la empresa y cuenta un caso real de tu perfil donde lo aplicaste.", evidence: "demostrado" },
        { q: `¿Cómo modelaste ${p1}?`, guide: [projects[0]?.field("Modelo|Decisiones|Datos"), "Explica por qué estrella y no tabla plana."].filter(Boolean).join(" "), evidence: "demostrado" },
        { q: "Cuéntame un problema de calidad de datos que hayas resuelto.", guide: "Contexto → problema → acción → resultado → aprendizaje. Apóyate en lo que tu perfil dice de controles de calidad y validación.", evidence: "demostrado" },
        { q: "¿Cuándo usarías Import, DirectQuery o una relación bidireccional?", guide: "Criterios: volumen, latencia, rendimiento y ambigüedad de filtros. Si solo lo conoces por formación, dilo.", evidence: "formacion" },
      ],
      negocio: [
        { q: `¿Qué indicadores propondrías para seguir el negocio de ${company}?`, guide: "Pocos KPI, ligados a decisiones; cuenta cómo lo hiciste en " + p1 + ".", evidence: "transferible" },
        { q: "Cuéntame un análisis que llevara a una decisión.", guide: `${p1}: el hallazgo y qué se podía decidir con él (usa las cifras del perfil).`, evidence: "demostrado" },
        { q: "¿Cómo explicas un resultado a alguien que no es técnico?", guide: "Mensaje primero, dato después; jerarquía visual y Data Storytelling. Ejemplo: " + p2 + ".", evidence: "demostrado" },
        { q: "Si el informe no cuadra con el Excel de un responsable, ¿qué haces?", guide: "Reproducir su cifra, encontrar la diferencia de definición o filtro, documentarla y acordar el KPI. Conecta con tu experiencia en operaciones.", evidence: "transferible" },
      ],
    };
    const pool = kind === "rrhh" ? banks.rrhh : kind === "tecnica" ? banks.tecnica : kind === "negocio" ? banks.negocio
      : [banks.rrhh[0], banks.tecnica[1], banks.negocio[1], banks.tecnica[0], banks.negocio[2]];
    const questions = pool.slice(0, 4);
    if (gap) questions.push({ q: `¿Qué experiencia tienes con ${gap.tool}?`, guide: gap.cls === "brecha" ? "Respuesta honesta: no hay evidencia en tu perfil. Explica qué sabes de herramientas parecidas y cómo lo aprenderías en las primeras semanas." : "Solo formación: dilo así, cuenta qué has practicado y cómo lo llevarías a producción.", evidence: gap.cls });

    const intro = [
      `Soy Borja Mora, Data Analyst Junior especializado en Power BI${prof.hasPL300 ? " y con la certificación PL-300" : ""}.`,
      prof.jobs[0] ? `Mi primera experiencia en datos fue como ${prof.jobs[0]}.` : "",
      prof.jobs[1] ? `Después pasé a ${prof.jobs[1]}, donde trabajé muy cerca del negocio.` : "",
      projects.length ? `Desde entonces me he especializado con proyectos como ${projects.map((p) => p.name).join(" y ")}.` : "",
      `Me interesa ${role} en ${company} porque une lo que más me gusta: modelar bien los datos y explicarlos para que sirvan para decidir.`,
    ].filter(Boolean).join(" ");

    const report: Report = {
      quality: "parcial",
      limitations: ["Briefing automático gratuito (sin IA): revisa los entrevistadores y adapta la presentación con tus palabras."],
      interview_type: { rrhh: "RRHH / primera toma de contacto", tecnica: "Técnica", negocio: "Negocio / hiring manager", final: "Final", mixta: "Mixta", desconocida: "Sin determinar" }[kind],
      know: {
        context: [r.company.summary || `${company}: no se ha podido leer su web.`, i.role_title ? `Puesto: ${i.role_title}.` : ""].filter(Boolean).join(" "),
        facts: [...r.company.facts, ...r.company.news.map((n) => ({ ...n, text: (n.date ? n.date + " · " : "") + n.text }))].filter((f) => f.source_ids.length).slice(0, 4).map((f) => ({ text: f.text, source_ids: f.source_ids })),
        why_it_matters: r.company.news.length ? "Menciona alguna de estas noticias si encaja: demuestra interés y sirve para preguntar cómo afecta al equipo de datos." : "Sin noticias recientes: lee la web antes y prepara una pregunta sobre sus prioridades.",
      },
      people: r.people.map((p) => ({ name: p.name, title: null, role_in_interview: kind === "rrhh" ? "Probablemente selección / RRHH" : kind === "tecnica" ? "Probablemente evalúa la parte técnica" : "Por confirmar", note: "Revisa su perfil con el enlace de búsqueda.", verified: false, source_ids: [] })),
      strategy: {
        highlight: [
          "Experiencia laboral real en Power BI, Power Query y DAX, con controles de calidad del dato.",
          "Perspectiva de negocio y operaciones: P&L, costes y KPI.",
          kind === "tecnica" ? "Modelado en estrella pensado para poder bajar del KPI al detalle." : "Comunicación: diseño los informes para quien los usa.",
        ],
        projects: projects.map((p) => ({
          name: p.name,
          why: p.field("Problema|Útil") ?? "Encaja con lo que pide el puesto.",
          highlight: p.field("Hallazgo|Resultados") ?? p.field("Pipeline|Datos") ?? "Lo que hiciste tú y por qué.",
          decisions: p.field("Decisiones|Modelo") ?? "Por qué ese modelo de datos.",
          follow_up: "¿Qué harías distinto hoy?",
          limitation: p.field("Limitación|Lección") ?? "Es un proyecto de portfolio: dilo con naturalidad.",
        })),
        review: (prof.review.split("\n")[0] || "CALCULATE; contexto de filtro; modelo en estrella; RLS").replace(/^-\s*/, "").split(/;\s*/).slice(0, 5),
        gap: gap ? { topic: gap.tool, honest_answer: gap.cls === "brecha" ? "No tengo experiencia demostrable; contaré qué sé de herramientas similares y cómo lo aprendería." : "Lo conozco por formación; contaré qué he practicado y cómo lo aplicaría." } : null,
      },
      intro,
      questions,
      ask: [
        "¿Qué informe o decisión os gustaría tener resuelto en los tres primeros meses?",
        "¿De qué fuentes salen los datos y quién mantiene hoy el modelo?",
        peopleNames.length ? "¿Cómo se reparte el trabajo entre el equipo de datos y las áreas de negocio?" : "¿Cómo se mide el éxito en este puesto?",
      ],
      reminder: {
        fit: "Power BI con experiencia laboral y mirada de negocio.",
        example: p1,
        question: "Qué esperan resolver en los tres primeros meses.",
        technical: gap ? gap.tool : "CALCULATE y contexto de filtro",
      },
      matrix: tools.map((t) => ({ requirement: t.tool, class: t.cls, evidence: t.line })),
    };
    if (!input.profile) report.limitations.push("No se encontró tu nota de perfil: no hay proyectos ni experiencia personalizados.");
    return Promise.resolve({ report, usage: ZERO, model: "gratuito" });
  }
}
