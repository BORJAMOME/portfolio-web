// deno test supabase/functions/interview-intel/
// Modo gratuito (sin IA): lectura web segura, noticias, perfil y briefing válido. Sin red real.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { FreeProvider, isPublicHttps, pageMeta, parseNewsRss, parseProfile, rankProjects, toolEvidence } from "./free.ts";
import { classify, fingerprints } from "./classify.ts";
import { validateReport } from "./report.ts";
import { ev, ME, NOW } from "./test_helpers.ts";
import type { Interview } from "./types.ts";

const PROFILE = `# Perfil
## Experiencia laboral
- **Junior Data Analyst · NTT DATA (Reino Unido) · 2021–2022** [laboral]. Power BI.
- **Operations Executive · Negronis (Reino Unido) · 2022–2023** [laboral].
## Competencias (dónde está la evidencia)
- Power BI, DAX, Power Query: [laboral] NTT DATA + PL-300.
- SQL / SQL Server: [proyecto] Casa Origen.
- Microsoft Fabric: [formación].
## Proyectos
### Informe Financiero Completo (informe-financiero.html)
- Problema: contabilidad de tres empresas sin Balance, PyG y Cash Flow conectados.
- Decisiones: real y presupuesto en hechos separados.
- Resultados del análisis: EBITDA 342.142 €.
- Limitación a saber explicar: proyecto de portfolio.
### Kosta Cálida · reporting para una red de tiendas (kosta-calida.html)
- Problema: datos de TPV de una red de tiendas.
- Modelo: estrella con ventas y presupuestos.
- Hallazgo: cierre en 717.304 € frente a 776.000 € (−7,56 %).
## Temas técnicos para repasar siempre
CALCULATE; contexto de filtro; RLS
## PENDIENTE DE VERIFICAR
- Boutike Digital.`;

const RSS = `<rss><channel>
<item><title>Acme abre un almacén en Valencia - Diario Logístico</title><link>https://news.example/acme-valencia</link><pubDate>Tue, 08 Sep 2026 10:00:00 GMT</pubDate><source url="https://news.example">Diario Logístico</source></item>
<item><title>Noticia antigua de Acme</title><link>https://news.example/vieja</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
<item><title>Enlace no seguro</title><link>http://news.example/x</link><pubDate>Tue, 08 Sep 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

function fakeFetch(map: Record<string, string | number>) {
  const calls: string[] = [];
  const f = (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    const key = Object.keys(map).find((k) => url.startsWith(k));
    const v = key ? map[key] : 404;
    return Promise.resolve(typeof v === "number" ? new Response("x", { status: v }) : new Response(v, { status: 200 }));
  };
  return { f: f as typeof fetch, calls };
}
function interview(p: Partial<Interview> = {}): Interview {
  const e = ev({ description: "Proceso de selección para Analista Power BI en una red de tiendas. Se valora SQL y Fabric." });
  const c = classify(e, [ME]);
  const fp = fingerprints(e, c.external);
  return { id: "x", calendar: "principal", event_uid: e.uid, starts_at: e.starts_at, ends_at: e.ends_at, title: e.title, location: null,
    conference_url: e.conference_url, organizer: e.organizer, attendees: c.external, my_response: c.my_response, event_status: "CONFIRMED",
    sequence: 0, last_modified: null, classification: c.classification, interview_kind: "tecnica", confidence: c.confidence, signals: c.signals,
    company: "Acme", company_domain: "acme.com", role_title: "Analista Power BI", job_url: "https://acme.com/empleo/pbi", entrevista_id: null,
    major_fp: fp.major, minor_fp: fp.minor, status: "researching", status_note: null, attempts: 0, next_attempt_at: null, locked_until: null,
    last_error: null, research_run_id: null, current_report_id: null, report_fp: null, email_context: null,
    detected_at: NOW.toISOString(), updated_at: NOW.toISOString(), last_seen_at: NOW.toISOString(), ...p };
}

Deno.test("lectura web segura: solo https a dominios públicos", () => {
  for (const u of ["http://acme.com", "https://localhost/x", "https://127.0.0.1/", "https://[::1]/", "https://intranet/", "file:///etc/passwd"]) assertEquals(isPublicHttps(u), false, u);
  assert(isPublicHttps("https://acme.com/empleo"));
});

Deno.test("noticias: solo de los últimos 6 meses, https, sin el medio repetido en el titular", () => {
  const n = parseNewsRss(RSS, "2026-04-13");
  assertEquals(n, [{ title: "Acme abre un almacén en Valencia", url: "https://news.example/acme-valencia", source: "Diario Logístico", date: "2026-09-08" }]);
});

Deno.test("perfil: proyectos, experiencia y afinidad con el puesto", () => {
  const p = parseProfile(PROFILE);
  assertEquals(p.projects.map((x) => x.name), ["Informe Financiero Completo", "Kosta Cálida"]);
  assertEquals(p.jobs.length, 2);
  assertEquals(rankProjects(p.projects, "Analista Power BI para una red de tiendas, reporting de ventas")[0].name, "Kosta Cálida");
  assertEquals(rankProjects(p.projects, "controller financiero, presupuesto y contabilidad")[0].name, "Informe Financiero Completo");
  const t = toolEvidence("Power BI, SQL, Fabric y Tableau", p.skills);
  assertEquals(Object.fromEntries(t.map((x) => [x.tool, x.cls])), { "Power BI": "demostrado", SQL: "demostrado", Fabric: "formacion", Tableau: "brecha" });
});

Deno.test("briefing gratuito completo: web, oferta y noticias reales con fuente; entrevistadores sin verificar; válido y gratis", async () => {
  const { f, calls } = fakeFetch({
    "https://acme.com/empleo": "<html><title>Analista Power BI | Acme</title><body><p>Buscamos Analista Power BI con SQL y Tableau.</p></body></html>",
    "https://acme.com/": '<html><head><title>Acme</title><meta name="description" content="Operador logístico para gran consumo."></head></html>',
    "https://news.google.com/rss": RSS,
  });
  const prov = new FreeProvider(() => NOW, f);
  const i = interview();
  const { research, usage } = await prov.research({ interview: i, emails: [], event_description: "Red de tiendas" });
  assertEquals(usage.usd, 0);
  assert(!calls.some((u) => /linkedin\.com/.test(u)), "no se consulta LinkedIn");
  assertEquals(research.company.facts[0].text, "La empresa se describe como: «Operador logístico para gran consumo.»");
  assertEquals(research.company.news.length, 1);
  assertEquals(research.people.map((p) => p.identified), ["no_verificado"]);
  const { report } = await prov.writeReport({ interview: i, research, profile: PROFILE, emails: [], link: null });
  const v = validateReport(report, research, PROFILE);
  assertEquals(v.errors, []);
  assert(v.words <= 900, "palabras: " + v.words);
  assertEquals(v.report.strategy.projects[0].name, "Kosta Cálida");
  assert(v.report.questions.some((q) => q.q.includes("Tableau") && q.evidence === "brecha"));
  assert(v.report.intro.includes("PL-300") || !PROFILE.includes("PL-300"));
  assert(!v.warnings.some((w) => w.startsWith("Cifra sin respaldo")), v.warnings.join(" | "));
  assert(!JSON.stringify(v.report).includes("Boutike"), "lo pendiente de verificar no se usa");
});

Deno.test("briefing gratuito sin red ni dominio: parcial y honesto, sin inventar", async () => {
  const { f } = fakeFetch({});
  const prov = new FreeProvider(() => NOW, f);
  const i = interview({ company_domain: null, job_url: "https://www.linkedin.com/jobs/view/1/" });
  const { research } = await prov.research({ interview: i, emails: [], event_description: null });
  assertEquals(research.company.facts, []);
  assert(research.gaps.some((g) => g.includes("LinkedIn")));
  const { report } = await prov.writeReport({ interview: i, research, profile: null, emails: [], link: null });
  const v = validateReport(report, research, null);
  assertEquals(v.errors, []);
  assertEquals(v.report.quality, "parcial");
  assert(v.report.limitations.some((l) => l.includes("perfil")));
});
