// ═══════════════════════════════════════════════
// classify.ts: ¿este evento del calendario es una entrevista de trabajo?
// ───────────────────────────────────────────────
// Reglas deterministas y explicables (cada señal queda en «signals»), sin IA ni coste:
//   · entrevista enlazada a mano en la pestaña Entrevistas → segura
//   · palabras de selección en el título o la descripción, organizador de una empresa
//     o de un ATS, videollamada con gente de fuera…
//   · palabras de reunión interna, clase o cita personal restan
// Resultado: interview (≥ 0,7) · candidate (0,35–0,7, se revisa en la web) · not_interview.
// El evento es dato NO confiable: aquí solo se buscan palabras, nunca se ejecuta nada.
// ═══════════════════════════════════════════════
import type { CalendarEvent, Classification, InterviewKind, LinkedProcess, Person } from "./types.ts";

export const THRESHOLD_INTERVIEW = 0.7;
export const THRESHOLD_CANDIDATE = 0.35;

export function norm(s: unknown) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// palabras que indican selección (sin tildes, en minúsculas)
const INTERVIEW_WORDS = [
  "entrevista", "interview", "proceso de seleccion", "selection process", "recruitment", "reclutamiento",
  "screening", "talent acquisition", "recruiter", "candidatura", "candidate", "candidato", "prueba tecnica",
  "technical test", "hiring manager", "llamada con rrhh", "llamada rrhh", "toma de contacto", "primera llamada",
  "conversacion inicial", "phone screen", "assessment", "case study", "caso practico", "oferta de empleo",
  "vacante", "posicion de", "position", "job offer",
];
const NEGATIVE_WORDS = [
  "daily", "standup", "stand-up", "1:1", "one on one", "retro", "sprint", "reunion de equipo", "team meeting",
  "webinar", "clase", "formacion", "tutoria", "masterclass", "bootcamp", "cumpleanos", "dentista", "medico",
  "gimnasio", "cena", "comida con", "vacaciones", "festivo", "seguimiento semanal", "mentoria",
];
const ATS_DOMAINS = [
  "greenhouse.io", "lever.co", "workable.com", "teamtailor.com", "personio.de", "personio.com", "smartrecruiters.com",
  "ashbyhq.com", "recruitee.com", "bamboohr.com", "factorialhr.com", "jobvite.com", "icims.com", "myworkday.com",
  "successfactors.com", "taleo.net", "hirehive.com", "join.com", "manatal.com",
];
const FREE_MAIL = ["gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "yahoo.es", "icloud.com", "me.com", "proton.me", "protonmail.com", "msn.com"];
const JOB_URL = /https?:\/\/(?:[\w-]+\.)*(?:linkedin\.com\/jobs|infojobs\.net|indeed\.(?:com|es)|tecnoempleo\.com|glassdoor\.(?:com|es)|welcometothejungle\.com|greenhouse\.io|lever\.co|workable\.com|teamtailor\.com|personio\.(?:de|com)|smartrecruiters\.com|ashbyhq\.com|recruitee\.com|join\.com)[^\s"<>)]*/i;

const KIND_WORDS: [InterviewKind, string[]][] = [
  ["rrhh", ["rrhh", "recursos humanos", "talent", "recruiter", "screening", "toma de contacto", "primera llamada", "conversacion inicial", "phone screen", "people", "hr "]],
  ["tecnica", ["tecnica", "technical", "prueba", "test", "caso practico", "case study", "live coding", "power bi", "sql", "assessment", "challenge"]],
  ["negocio", ["hiring manager", "responsable", "manager", "director", "head of", "negocio", "business", "equipo"]],
  ["final", ["final", "ultima", "last round", "offer", "oferta final", "ceo", "cfo"]],
];

export const domainOf = (email: string | null | undefined) => {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(String(email ?? "").trim());
  return m ? m[1].toLowerCase() : null;
};
const isFree = (d: string | null) => !!d && FREE_MAIL.includes(d);
const isAts = (d: string | null) => !!d && ATS_DOMAINS.some((a) => d === a || d.endsWith("." + a));
const has = (text: string, words: string[]) => words.filter((w) => text.includes(w));

/** Nombre legible a partir de un dominio corporativo: «grupo-acme.es» → «Grupo Acme» */
export function companyFromDomain(d: string | null) {
  if (!d || isFree(d) || isAts(d)) return null;
  const parts = d.split(".");
  const base = parts.length > 2 && ["co", "com", "org", "gob"].includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2];
  if (!base || base.length < 2) return null;
  return base.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const NOT_COMPANY = ["rrhh", "recursos humanos", "hr", "talent", "talent acquisition", "equipo", "el equipo", "team", "nosotros", "google meet", "teams", "zoom", "online", "videollamada", "llamada", "call"];

/** Empresa y puesto que se pueden leer en el título («Entrevista Data Analyst – Acme», «Acme | Interview»).
 *  people: nombres de los participantes, para no confundir «Entrevista con Laura» con una empresa. */
export function parseTitle(title: string, people: string[] = []) {
  const t = title.replace(/\s+/g, " ").trim();
  const ROLE = /\b((?:junior|jr\.?|senior|sr\.?)?\s*(?:data analyst|analista(?: de datos| bi| power bi)?|power bi developer|bi developer|business intelligence(?: analyst| developer)?|bi analyst|reporting analyst|data scientist|data engineer|analytics engineer|consultor(?:a)? bi|consultant)\s*(?:junior|jr\.?|senior|sr\.?)?)\b/i;
  const role = ROLE.exec(t)?.[1]?.trim() ?? null;
  let company: string | null = null;
  const m1 = /(?:with|con|en|at|@)\s+([A-ZÁÉÍÓÚÑ][\w&.'’ -]{1,60}?)(?:\s*[-–|·:(]|$)/.exec(t);
  if (m1) company = m1[1].trim();
  if (!company) {
    // «Algo – Empresa» o «Empresa | Algo»: el trozo que no contiene palabras de entrevista ni el puesto
    const pieces = t.split(/\s+[-–|·:]\s+|\s*[|·]\s*/).map((p) => p.trim()).filter(Boolean);
    const cand = pieces.filter((p) => !has(norm(p), INTERVIEW_WORDS).length && !(role && norm(p).includes(norm(role))) && p.length <= 60);
    if (pieces.length > 1 && cand.length) company = cand[cand.length - 1];
  }
  if (company) {
    const c = norm(company);
    const isPerson = people.some((p) => { const n = norm(p); return !!n && (n === c || n.split(" ").includes(c) || c.split(" ").every((w) => n.includes(w))); });
    if (NOT_COMPANY.includes(c) || isPerson) company = null;
  }
  return { company, role };
}

export type ClassifyResult = {
  classification: Classification; kind: InterviewKind; confidence: number; signals: string[];
  company: string | null; company_domain: string | null; role_title: string | null; job_url: string | null;
  my_response: string | null; external: Person[];
};

/**
 * ownEmails: tus direcciones (para saber cuál es tu respuesta y quién es «de fuera»).
 * link: si la entrevista ya está registrada a mano en la pestaña Entrevistas.
 */
export function classify(ev: CalendarEvent, ownEmails: string[], link?: LinkedProcess | null): ClassifyResult {
  const own = new Set(ownEmails.map((e) => e.toLowerCase()));
  const title = norm(ev.title), desc = norm(ev.description);
  const attendees = (ev.attendees ?? []).filter((a) => a && (a.email || a.name));
  const mine = attendees.find((a) => a.email && own.has(a.email));
  const my_response = mine?.partstat ?? null;
  const people = [ev.organizer, ...attendees].filter((p): p is Person => !!p && !!(p.email || p.name));
  const external: Person[] = [];
  const seen = new Set<string>();
  for (const p of people) {
    const k = (p.email ?? p.name ?? "").toLowerCase();
    if (!k || seen.has(k) || (p.email && own.has(p.email))) continue;
    // las salas, los grupos y el propio calendario de Google no son personas
    if (p.email && /(resource\.calendar\.google\.com|group\.calendar\.google\.com|calendar-notification|noreply|no-reply)/i.test(p.email)) continue;
    seen.add(k);
    external.push(p.partstat !== undefined ? p : { ...p });
  }

  const signals: string[] = [];
  let score = 0;
  if (link) { score += 1; signals.push("Enlazada a mano en la pestaña Entrevistas"); }
  const tw = has(title, INTERVIEW_WORDS), dw = has(desc, INTERVIEW_WORDS);
  if (tw.length) { score += 0.6; signals.push("El título menciona: " + tw.slice(0, 3).join(", ")); }
  if (dw.length) { score += tw.length ? 0.15 : 0.3; signals.push("La descripción menciona: " + dw.slice(0, 3).join(", ")); }

  const domains = external.map((p) => domainOf(p.email)).filter((d): d is string => !!d);
  // la invitación de un ATS suele llegar desde una dirección «no-reply»: aquí cuentan todos
  const ats = people.map((p) => domainOf(p.email)).find(isAts);
  if (ats) { score += 0.3; signals.push("Convoca una herramienta de selección (" + ats + ")"); }
  const corp = domains.filter((d) => !isFree(d) && !isAts(d));
  const orgDomain = domainOf(ev.organizer?.email);
  if (corp.length && ev.conference_url) { score += 0.15; signals.push("Videollamada con personas de " + [...new Set(corp)].slice(0, 2).join(", ")); }
  else if (corp.length) { score += 0.1; signals.push("Participantes de " + [...new Set(corp)].slice(0, 2).join(", ")); }

  const neg = has(title, NEGATIVE_WORDS);
  if (neg.length && !link) { score -= 0.5; signals.push("Parece otra cosa: " + neg.slice(0, 2).join(", ")); }
  if (!external.length && !tw.length && !link) { score -= 0.2; signals.push("Sin participantes externos"); }
  if (ev.all_day) { score -= 0.6; signals.push("Evento de día completo"); }

  const confidence = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  const classification: Classification = confidence >= THRESHOLD_INTERVIEW ? "interview" : confidence >= THRESHOLD_CANDIDATE ? "candidate" : "not_interview";

  // tipo de entrevista: por palabras del título (y de la fase si está enlazada)
  const kindText = title + " " + (link?.fase ? norm(link.fase.replace("_", " ")) : "");
  const kinds = KIND_WORDS.filter(([, ws]) => has(" " + kindText + " ", ws).length).map(([k]) => k);
  const LINK_KIND: Record<string, InterviewKind> = { rrhh: "rrhh", tecnica: "tecnica", caso: "tecnica", hiring_manager: "negocio", cultural: "negocio", final: "final" };
  const kind: InterviewKind = link?.fase && LINK_KIND[link.fase] ? LINK_KIND[link.fase]
    : kinds.length === 1 ? kinds[0] : kinds.length > 1 ? (kinds.includes("final") ? "final" : "mixta") : "desconocida";

  const parsed = parseTitle(ev.title, people.map((p) => p.name ?? "").filter(Boolean));
  const corpDomain = (orgDomain && !isFree(orgDomain) && !isAts(orgDomain) ? orgDomain : corp[0]) ?? null;
  const jobUrl = link?.url ?? JOB_URL.exec(ev.description ?? "")?.[0] ?? (ev.url && JOB_URL.test(ev.url) ? ev.url : null);

  return {
    classification, kind, confidence, signals,
    company: link?.empresa ?? parsed.company ?? companyFromDomain(corpDomain),
    company_domain: corpDomain,
    role_title: link?.puesto ?? parsed.role,
    job_url: jobUrl ? jobUrl.replace(/[).,;]+$/, "").slice(0, 2000) : null,
    my_response, external,
  };
}

/* ─── Huellas para detectar cambios ───
   major: lo que cambia la investigación (título, descripción, personas)  → informe a actualizar
   minor: hora, lugar o enlace                                             → solo se actualiza la cabecera */
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
export function fingerprints(ev: CalendarEvent, external: Person[]) {
  const people = external.map((p) => (p.email ?? norm(p.name))).sort().join(",");
  return {
    major: fnv([norm(ev.title), norm(ev.description).slice(0, 1500), people].join("§")),
    minor: fnv([ev.starts_at, ev.ends_at, norm(ev.location), ev.conference_url ?? ""].join("§")),
  };
}
