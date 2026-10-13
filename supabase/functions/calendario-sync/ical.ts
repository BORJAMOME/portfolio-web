// Parser del feed iCal: separado de index.ts para poder probarlo (ical.test.ts).
import ICAL from "npm:ical.js@2.1.0";

const DAY = 86_400_000;
const MAX_OCCURRENCES = 2000;

const toDate = (t: ICAL.Time) => (t.isDate
  ? new Date(Date.UTC(t.year, t.month - 1, t.day))          // día completo: medianoche UTC
  : new Date(t.toUnixTime() * 1000));
const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);

export type Person = { name: string | null; email: string | null; partstat?: string | null; role?: string | null };
export type Row = {
  uid: string; starts_at: string; ends_at: string; all_day: boolean; title: string;
  location: string | null; description: string | null; url: string | null;
  // para «Interview Intelligence»: quién convoca, quién asiste y si el evento ha cambiado
  organizer: Person | null; attendees: Person[]; status: string | null;
  sequence: number | null; last_modified: string | null; conference_url: string | null;
};

const MAX_ATTENDEES = 30;
// enlaces de videollamada conocidos (en la descripción, el lugar o X-GOOGLE-CONFERENCE)
const CONFERENCE = /https:\/\/(?:meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|[\w-]+\.zoom\.us|zoom\.us|[\w-]+\.webex\.com)\/[^\s"<>]+/i;

function person(p: ICAL.Property | null): Person | null {
  if (!p) return null;
  const v = String(p.getFirstValue() ?? "");
  const email = /^mailto:/i.test(v) ? v.slice(7).trim().toLowerCase().slice(0, 320) : null;
  const cn = p.getParameter("cn");
  const name = typeof cn === "string" && cn.trim() && cn.trim().toLowerCase() !== email ? cn.trim().slice(0, 200) : null;
  if (!email && !name) return null;
  return { name, email };
}
function people(comp: ICAL.Component) {
  const organizer = person(comp.getFirstProperty("organizer"));
  const attendees: Person[] = [];
  for (const a of comp.getAllProperties("attendee").slice(0, MAX_ATTENDEES)) {
    const base = person(a);
    if (!base) continue;
    const ps = a.getParameter("partstat"), role = a.getParameter("role");
    attendees.push({ ...base, partstat: typeof ps === "string" ? ps.toUpperCase() : null, role: typeof role === "string" ? role.toUpperCase() : null });
  }
  return { organizer, attendees };
}
function conference(comp: ICAL.Component, location: string | null, description: string | null) {
  const x = comp.getFirstPropertyValue("x-google-conference");
  for (const s of [typeof x === "string" ? x : null, location, description]) {
    const m = s ? CONFERENCE.exec(s) : null;
    if (m) return m[0].replace(/[).,;]+$/, "").slice(0, 1000);
  }
  return null;
}

export function parse(ics: string, winStart: Date, winEnd: Date): Row[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(new ICAL.Timezone(tz));

  const vevents = root.getAllSubcomponents("vevent");
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const c of vevents) {
    const e = new ICAL.Event(c);
    if (e.isRecurrenceException()) exceptions.push(e);
    else masters.set(e.uid, e);
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex);

  const rows: Row[] = [];
  const push = (e: ICAL.Event, start: ICAL.Time, end: ICAL.Time, comp: ICAL.Component) => {
    if (String(comp.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    const s = toDate(start), en = end ? toDate(end) : new Date(s.getTime() + (start.isDate ? DAY : 0));
    if (en <= winStart || s >= winEnd) return;
    const location = clip(e.location, 300), description = clip(e.description, 2000);
    const lm = comp.getFirstPropertyValue("last-modified");
    const seq = Number(comp.getFirstPropertyValue("sequence"));
    rows.push({
      uid: e.uid,
      starts_at: s.toISOString(),
      ends_at: (en > s ? en : new Date(s.getTime() + (start.isDate ? DAY : 0))).toISOString(),
      all_day: start.isDate,
      title: clip(e.summary, 300) ?? "(sin título)",
      location,
      description,
      url: clip(comp.getFirstPropertyValue("url"), 1000),
      ...people(comp),
      status: clip(comp.getFirstPropertyValue("status"), 20)?.toUpperCase() ?? null,
      sequence: Number.isFinite(seq) ? seq : null,
      last_modified: lm instanceof ICAL.Time ? toDate(lm).toISOString() : null,
      conference_url: conference(comp, location, description),
    });
  };

  for (const e of masters.values()) {
    if (!e.isRecurring()) { push(e, e.startDate, e.endDate, e.component); continue; }
    const it = e.iterator();
    for (let next = it.next(), n = 0; next && n < MAX_OCCURRENCES; next = it.next(), n++) {
      if (toDate(next) >= winEnd) break;
      const d = e.getOccurrenceDetails(next);
      push(d.item, d.startDate, d.endDate, d.item.component);
    }
  }
  // excepciones cuyo evento principal no venía en el feed
  for (const ex of exceptions) if (!masters.has(ex.uid)) push(ex, ex.startDate, ex.endDate, ex.component);

  // (uid, inicio) es la clave: sin duplicados
  const seen = new Set<string>();
  return rows.filter((r) => { const k = r.uid + "|" + r.starts_at; return !seen.has(k) && (seen.add(k), true); });
}

