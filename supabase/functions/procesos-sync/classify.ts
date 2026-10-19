// ═══════════════════════════════════════════════
// classify.ts — ¿qué dice este correo sobre un proceso de selección? (reglas, sin IA)
// ───────────────────────────────────────────────
// tipo:      candidatura (la envías tú) · acuse · entrevista · prueba · rechazo · oferta · otro
// empresa:   del asunto («tu interés en X», «proceso de selección - X»), del subdominio de la
//            herramienta de selección (x.teamtailor-mail.com) o del dominio del remitente
// confianza: alta → se aplica solo · media → «por revisar» en la web · baja → se ignora
// El correo es dato NO confiable: solo se buscan palabras; nunca se ejecuta nada de él.
// ═══════════════════════════════════════════════

export type Mail = {
  message_id: string; thread_id?: string | null; direccion: "recibido" | "enviado";
  remitente: string; destinatario?: string | null; asunto: string; fecha: string; texto: string;
};
export type Tipo = "candidatura" | "acuse" | "entrevista" | "prueba" | "rechazo" | "oferta" | "otro";
export type Resultado = {
  tipo: Tipo; empresa: string | null; empresa_clave: string | null; puesto: string | null; fuente: string | null;
  motivo: string | null; confianza: "alta" | "media" | "baja"; senales: string[];
};

export const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const has = (t: string, ws: string[]) => ws.find((w) => t.includes(w)) ?? null;

// ─── Frases por tipo (sin tildes, minúsculas). El orden de comprobación importa: rechazo primero ───
const RECHAZO = [
  "no podemos contar contigo", "no podremos contar contigo", "no continuar con tu candidatura", "no continuaremos",
  "no seguir adelante", "no vamos a seguir", "otros candidatos", "otras candidaturas", "otro perfil", "no ha sido seleccionad",
  "no has sido seleccionad", "no encaja con las necesidades", "no encaja con lo que", "tu perfil no encaja", "no se ajusta",
  "lamentamos comunicarte", "lamentamos informarte", "sentimos decirte", "sentimos comunicarte", "hemos decidido avanzar",
  "no disponemos de vacantes", "hemos cubierto la posicion", "la posicion ha sido cubierta", "proceso ha finalizado",
  "unfortunately", "not to move forward", "other candidates", "not be moving forward", "decided to pursue",
  "position has been filled", "will not be progressing",
];
const OFERTA = ["nos complace ofrecerte", "queremos ofrecerte", "propuesta economica", "oferta formal", "carta de oferta", "offer letter", "pleased to offer", "job offer"];
const PRUEBA = ["prueba tecnica", "caso practico", "test de competencias", "cuestionario", "assessment", "technical test", "coding challenge", "take-home", "prueba de nivel"];
const ENTREVISTA = [
  "entrevista", "interview", "seguimos con el proceso", "siguiente fase", "siguiente etapa", "queremos conocerte",
  "primer contacto", "videollamada", "invitacion a la reunion", "reunion de microsoft teams", "meet.google.com", "teams.microsoft.com",
  "agendar una llamada", "llamada telefonica", "te he llamado",
];
const ACUSE = [
  "hemos recibido tu candidatura", "hemos recibido tu solicitud", "gracias por tu candidatura", "gracias por enviarnos tu",
  "gracias por inscribirte", "gracias por aplicar", "gracias por tu interes", "recepcion de tu candidatura", "completa la solicitud",
  "tu solicitud ha sido", "application received", "thank you for applying", "thanks for applying", "we have received your application",
];
const CANDIDATURA = ["candidatura", "curriculum", "adjunto mi cv", "adjunto cv", "te comparto mi perfil", "me gustaria incorporarme", "vacante", "application for"];

// remitentes que nunca son procesos (formación, alertas, recordatorios, finanzas)
const IGNORAR = /(mailsuite\.com|jobalerts-noreply@linkedin|medium\.com|neoland\.es|namasdata\.com|pepperfinance|revolut|noreply@google\.com|forms-receipts|calendar-notification@google)/i;

// herramientas de selección: la empresa va en el subdominio o en el asunto
const ATS = ["teamtailor-mail.com", "teamtailor.com", "talentclue.com", "viterbit-mail.com", "viterbit.com", "greenhouse.io", "lever.co",
  "workable.com", "personio.de", "personio.com", "smartrecruiters.com", "ashbyhq.com", "recruitee.com", "bamboohr.com",
  "factorialhr.com", "myworkday.com", "successfactors.com", "jobvite.com", "icims.com", "join.com", "hirehive.com", "grupofacthum.com"];
const FREE = ["gmail.com", "googlemail.com", "hotmail.com", "hotmail.es", "outlook.com", "outlook.es", "live.com", "yahoo.com", "yahoo.es", "icloud.com", "me.com", "proton.me", "protonmail.com", "msn.com"];
const PORTALES: [RegExp, string][] = [[/linkedin\.com$/, "LinkedIn"], [/infojobs\.net$/, "InfoJobs"], [/indeed\.(com|es)$/, "Indeed"], [/tecnoempleo\.com$/, "Tecnoempleo"]];

export const emailOf = (s: string | null | undefined) => (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.exec(String(s ?? ""))?.[0] ?? "").toLowerCase();
export const domainOf = (s: string | null | undefined) => emailOf(s).split("@")[1] ?? "";
const atsOf = (d: string) => ATS.find((a) => d === a || d.endsWith("." + a)) ?? null;
const isFree = (d: string) => FREE.includes(d);

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
/** «grupo-norte.es» → «Grupo Norte»; «acme.teamtailor-mail.com» → «Acme»; «vidacaixa-peoplexhub.mail.talentclue.com» → «Vidacaixa» */
export function companyFromDomain(d: string): { nombre: string; clave: string } | null {
  if (!d || isFree(d)) return null;
  const ats = atsOf(d);
  let base: string;
  if (ats) {
    const sub = d.slice(0, d.length - ats.length - 1).split(".")[0];   // primer nivel delante del ATS
    if (!sub || /^(mail|email|no-?reply|jobs|careers|app|www)$/.test(sub)) return null;
    base = sub.split("-")[0];
  } else {
    const parts = d.split(".");
    base = parts.length > 2 && ["co", "com", "org", "gob", "mail"].includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2];
  }
  if (!base || base.length < 2) return null;
  return { nombre: base.split(/[-_]/).map(cap).join(" "), clave: norm(base).replace(/[^a-z0-9]/g, "") };
}

const COMPANY_IN_TEXT = [
  /tu inter[eé]s en ([A-ZÁÉÍÓÚÑ][\w&.'’ -]{1,50}?)(?:[!.,:;]|$|\s+y\s)/,
  /formar parte de(?:l equipo de)? ([A-ZÁÉÍÓÚÑ][\w&.'’ -]{1,50}?)(?:[!.,:;]|$|\s+y\s)/,
  /proceso de selecci[oó]n de ([A-ZÁÉÍÓÚÑ][\w&.'’ -]{1,50}?)(?:[!.,:;]|$|\s+para\s|\s+y\s)/,
  /proceso de selecci[oó]n\s*[-–|:]\s*([A-ZÁÉÍÓÚÑ][\w&.'’ -]{1,50}?)\s*$/,
  /\bdesde ([A-ZÁÉÍÓÚÑ][\w&.'’-]{1,40}(?: [A-ZÁÉÍÓÚÑ][\w&.'’-]{1,30})?)[,.]/,
];
const ROLE_IN_TEXT = [
  /(?:posici[oó]n|puesto|vacante|oferta|rol) de ([^.,;:!\n]{3,80}?)(?:\s*[,.;:!]|\s+en\s|\s+para\s|\s+que\s|$)/i,
  /solicitud para ([^.,;:!\n(]{3,80}?)(?:\s*[(,.;:!]|$)/i,
  /inscribirte en ([^.,;:!\n]{3,80}?)(?:\s*[!,.;:]|$)/i,
  /proceso de selecci[oó]n (?:de|para) (?:el puesto de )?((?:junior |senior )?(?:data|bi|power ?bi|analista|business|reporting|crm)[^.,;:!\n]{2,70}?)(?:\s+para\s|\s*[,.;:!]|$)/i,
];
const ROLE_IN_SUBJECT = /(?:candidatura|application|entrevista(?: t[eé]cnica)?|interview)\s*(?:[-–—:|]\s*|\s+(?:al puesto de|para|de)\s+)(.{3,80}?)(?:\s*[-–—|]\s*(?:borja|francisco)|\s*$)/i;

function firstMatch(text: string, res: RegExp[]) {
  for (const re of res) { const m = re.exec(text); if (m) return m[1].trim(); }
  return null;
}
const cleanRole = (s: string | null) => {
  if (!s) return null;
  const r = s.replace(/\s+/g, " ").replace(/^(?:el |la |un |una )/i, "").replace(/\s*[-–—|]\s*(borja|francisco).*$/i, "").trim();
  return r.length >= 3 && !/^(selecci[oó]n|empleo|trabajo|nuestro equipo)$/i.test(r) ? r.slice(0, 200) : null;
};
const sentence = (text: string, phrase: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  const i = norm(t).indexOf(phrase);
  if (i < 0) return null;
  const start = Math.max(0, t.lastIndexOf(".", i) + 1), end = t.indexOf(".", i + phrase.length);
  return t.slice(start, end < 0 ? undefined : end + 1).trim().slice(0, 400) || null;
};

export function classify(m: Mail, ownEmails: string[]): Resultado {
  const senales: string[] = [];
  const own = new Set(ownEmails.map((e) => e.toLowerCase()));
  const sender = emailOf(m.remitente);
  const enviado = m.direccion === "enviado" || own.has(sender);
  const subject = m.asunto ?? "", body = m.texto ?? "";
  const t = norm(subject + " \n " + body);
  const out: Resultado = { tipo: "otro", empresa: null, empresa_clave: null, puesto: null, fuente: null, motivo: null, confianza: "baja", senales };

  if (IGNORAR.test(sender)) { senales.push("Remitente que no es de selección (" + sender + ")"); return out; }

  // ── tipo ──
  if (enviado) {
    if (/^\s*(re|fwd?|rv)\s*:/i.test(subject)) { senales.push("Respuesta tuya: no cambia el proceso"); return out; }
    const w = has(t, CANDIDATURA);
    if (!w) return out;
    out.tipo = "candidatura"; senales.push("Envías: " + w);
  } else {
    const r = has(t, RECHAZO), o = has(t, OFERTA), p = has(t, PRUEBA), e = has(t, ENTREVISTA), a = has(t, ACUSE);
    if (r) { out.tipo = "rechazo"; out.motivo = sentence(body, r) ?? sentence(subject, r); senales.push("Rechazo: «" + r + "»"); }
    else if (o) { out.tipo = "oferta"; senales.push("Oferta: «" + o + "»"); }
    else if (p) { out.tipo = "prueba"; senales.push("Prueba: «" + p + "»"); }
    else if (e) { out.tipo = "entrevista"; senales.push("Entrevista: «" + e + "»"); }
    else if (a) { out.tipo = "acuse"; senales.push("Acuse de recibo: «" + a + "»"); }
    else return out;
  }

  // ── empresa ──
  const dom = enviado ? domainOf(m.destinatario) : domainOf(m.remitente);
  const portal = PORTALES.find(([re]) => re.test(dom));
  const fromText = firstMatch(subject, COMPANY_IN_TEXT) ?? firstMatch(body.slice(0, 1500), COMPANY_IN_TEXT);
  const fromDomain = portal ? null : companyFromDomain(dom);
  if (fromText && !/^(nuestro|nuestra|la empresa|el equipo|people|rrhh|recursos humanos)/i.test(fromText)) {
    out.empresa = fromText.slice(0, 160);
    out.empresa_clave = fromDomain?.clave ?? norm(fromText).replace(/[^a-z0-9]/g, "").slice(0, 80);
    senales.push("Empresa en el texto: " + fromText);
  } else if (fromDomain) {
    out.empresa = fromDomain.nombre; out.empresa_clave = fromDomain.clave;
    senales.push("Empresa por el dominio: " + dom);
  }

  // ── puesto y fuente ──
  out.puesto = cleanRole(firstMatch(body.slice(0, 2000), ROLE_IN_TEXT) ?? ROLE_IN_SUBJECT.exec(subject)?.[1] ?? null);
  out.fuente = portal ? portal[1] : atsOf(dom) ? "Web de la empresa" : enviado ? "Otra" : null;

  // ── confianza ──
  const corporativo = !!dom && !isFree(dom) && !portal;
  if (!out.empresa) { out.confianza = "media"; senales.push("No se sabe la empresa: por revisar"); }
  else if (out.tipo === "oferta") { out.confianza = "media"; senales.push("Una oferta siempre se revisa a mano"); }
  else if (corporativo || fromText) out.confianza = "alta";
  else { out.confianza = "media"; senales.push("Remitente con correo personal: por revisar"); }
  return out;
}
