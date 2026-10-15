// ═══════════════════════════════════════════════
// gmail.ts: correos relacionados con una entrevista (OPCIONAL, solo lectura)
// ───────────────────────────────────────────────
// Se activa si existen los secretos GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN
// (permiso gmail.readonly; guía en README.md). Sin ellos el sistema funciona con el evento.
//
// No recorre la bandeja: hace UNA búsqueda dirigida con los correos y el dominio de los
// participantes (y, si no hay, con el nombre de la empresa en el asunto) en los últimos
// 90 días, y lee como mucho 5 hilos. Solo usa peticiones GET: no marca como leído, no
// envía, no borra, no etiqueta.
// Minimización: de cada hilo se guarda el asunto, el remitente, la fecha, un extracto de
// 1.800 caracteres sin el texto citado de respuestas anteriores, y los enlaces http(s).
// ═══════════════════════════════════════════════
import { domainOf, norm } from "./classify.ts";
import type { EmailSource } from "./pipeline.ts";
import type { EmailExcerpt, Interview } from "./types.ts";

const FREE = /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|proton|protonmail|msn)\./i;
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Consulta de Gmail para esta entrevista (o null si no hay nada fiable por lo que buscar) */
export function buildQuery(i: Interview, ownEmails: string[]): string | null {
  const own = new Set(ownEmails.map((e) => e.toLowerCase()));
  const emails = [...new Set([i.organizer, ...i.attendees].map((p) => p?.email?.toLowerCase()).filter((e): e is string => !!e && !own.has(e)))].slice(0, 6);
  const domains = [...new Set(emails.filter((e) => !FREE.test(e)).map(domainOf).filter((d): d is string => !!d))].slice(0, 2);
  const terms = [...emails.flatMap((e) => [`from:${e}`, `to:${e}`]), ...domains.map((d) => `from:${d}`)];
  if (!terms.length) {
    const company = (i.company ?? "").replace(/["(){}]/g, "").trim();
    if (company.length < 3) return null;
    return `subject:"${company}" (entrevista OR interview OR candidatura OR proceso OR selección) newer_than:90d -in:chats`;
  }
  return `(${terms.join(" OR ")}) newer_than:90d -in:chats -in:spam -in:trash`;
}

function b64(data: string) {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
const htmlToText = (h: string) => h
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<a\s[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, " $2 ($1) ")
  .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Texto de un mensaje de la API (prefiere text/plain; si no, HTML convertido) */
export function bodyText(payload: any): string {
  let plain = "", html = "";
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !plain) plain = b64(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = b64(p.body.data);
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  return plain || htmlToText(html);
}

/** Quita lo citado de mensajes anteriores y las firmas largas */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) continue;
    if (/^(El|On) .{5,120}(escribió|wrote):\s*$/i.test(l.trim())) break;
    if (/^-{2,}\s*(Original Message|Mensaje original|Forwarded message|Mensaje reenviado)/i.test(l.trim())) break;
    if (/^De:\s.+|^From:\s.+/.test(l.trim()) && out.length > 3) break;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractLinks(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s"<>)\]]+/g) ?? [];
  return [...new Set(urls.map((u) => u.replace(/[.,;:]+$/, "")))]
    .filter((u) => !/(unsubscribe|baja|tracking|click\.|list-manage|googleusercontent|accounts\.google)/i.test(u)).slice(0, 15);
}

const header = (m: any, name: string) => (m.payload?.headers ?? []).find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

export class GmailSource implements EmailSource {
  private token: { value: string; exp: number } | null = null;
  constructor(private creds: { clientId: string; clientSecret: string; refreshToken: string }, private ownEmails: string[], private fetchFn: typeof fetch = fetch) {}

  private async accessToken() {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const r = await this.fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.creds.clientId, client_secret: this.creds.clientSecret, refresh_token: this.creds.refreshToken, grant_type: "refresh_token" }),
    });
    if (!r.ok) throw new Error(`Google OAuth ${r.status}: revisa GMAIL_REFRESH_TOKEN (¿revocado o caducado?)`);
    const d = await r.json();
    this.token = { value: d.access_token, exp: Date.now() + (d.expires_in ?? 3000) * 1000 };
    return this.token.value;
  }
  private async get(path: string) {
    const r = await this.fetchFn(API + path, { headers: { Authorization: `Bearer ${await this.accessToken()}` } });
    if (!r.ok) throw new Error(`Gmail ${r.status}`);
    return r.json();
  }

  async find(i: Interview): Promise<EmailExcerpt[]> {
    const q = buildQuery(i, this.ownEmails);
    if (!q) return [];
    const list = await this.get(`/threads?maxResults=5&q=${encodeURIComponent(q)}`);
    const out: EmailExcerpt[] = [];
    const company = norm(i.company);
    for (const t of (list.threads ?? []).slice(0, 5)) {
      const th = await this.get(`/threads/${encodeURIComponent(t.id)}?format=full`);
      const msgs = (th.messages ?? []) as any[];
      if (!msgs.length) continue;
      // del hilo: el primer mensaje (invitación) y el último (lo más reciente)
      for (const m of msgs.length > 1 ? [msgs[0], msgs[msgs.length - 1]] : [msgs[0]]) {
        const text = stripQuoted(bodyText(m.payload));
        out.push({
          thread_id: String(t.id), message_id: String(m.id), subject: header(m, "Subject").slice(0, 200),
          from: header(m, "From").slice(0, 200), date: new Date(Number(m.internalDate) || Date.now()).toISOString(),
          excerpt: text.slice(0, 1800), links: extractLinks(text),
        });
      }
    }
    // primero los que nombran la empresa o hablan de entrevista; como mucho 6 extractos
    const score = (e: EmailExcerpt) => (company && norm(e.subject + " " + e.excerpt).includes(company) ? 2 : 0) + (/entrevista|interview|proceso|candidat/i.test(e.subject) ? 1 : 0);
    return out.sort((a, b) => score(b) - score(a) || (a.date < b.date ? 1 : -1)).slice(0, 6);
  }
}
