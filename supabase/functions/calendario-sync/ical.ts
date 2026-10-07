// Parser del feed iCal: separado de index.ts para poder probarlo (ical.test.ts).
import ICAL from "npm:ical.js@2.1.0";

const DAY = 86_400_000;
const MAX_OCCURRENCES = 2000;

const toDate = (t: ICAL.Time) => (t.isDate
  ? new Date(Date.UTC(t.year, t.month - 1, t.day))          // día completo: medianoche UTC
  : new Date(t.toUnixTime() * 1000));
const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);

export type Row = { uid: string; starts_at: string; ends_at: string; all_day: boolean; title: string; location: string | null; description: string | null; url: string | null };

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
    rows.push({
      uid: e.uid,
      starts_at: s.toISOString(),
      ends_at: (en > s ? en : new Date(s.getTime() + (start.isDate ? DAY : 0))).toISOString(),
      all_day: start.isDate,
      title: clip(e.summary, 300) ?? "(sin título)",
      location: clip(e.location, 300),
      description: clip(e.description, 2000),
      url: clip(comp.getFirstPropertyValue("url"), 1000),
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

