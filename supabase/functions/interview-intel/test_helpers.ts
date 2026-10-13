// Ayudas para las pruebas: eventos ficticios y un Store en memoria que imita a Supabase
// (incluida la clave única calendario+UID, el bloqueo de ii_claim y la versión de informes).
import type { Run, Store } from "./pipeline.ts";
import type { CalendarEvent, Interview, LinkedProcess } from "./types.ts";

export const ME = "borja.mora.mendez@gmail.com";
export const NOW = new Date("2026-10-13T08:00:00Z");

let seq = 0;
export function ev(p: Partial<CalendarEvent> = {}): CalendarEvent {
  seq++;
  return {
    uid: `ev${seq}@google.com`, calendar: "principal",
    starts_at: "2026-10-20T08:00:00.000Z", ends_at: "2026-10-20T09:00:00.000Z", all_day: false,
    title: "Entrevista Data Analyst - Acme", location: null, description: null, url: null,
    organizer: { name: "Laura Gómez", email: "laura.gomez@acme.com" },
    attendees: [
      { name: "Laura Gómez", email: "laura.gomez@acme.com", partstat: "ACCEPTED", role: "REQ-PARTICIPANT" },
      { name: null, email: ME, partstat: "ACCEPTED", role: "REQ-PARTICIPANT" },
    ],
    status: "CONFIRMED", sequence: 0, last_modified: "2026-10-10T10:00:00Z", conference_url: "https://meet.google.com/abc-defg-hij",
    ...p,
  };
}

export class MemoryStore implements Store {
  events: CalendarEvent[] = [];
  syncs = [{ calendar: "principal", ran_at: NOW.toISOString(), ok: true }];
  linksList: LinkedProcess[] = [];
  rows: Interview[] = [];
  runs: Run[] = [];
  reports: any[] = [];
  profileText: string | null = "Perfil de prueba. NTT DATA (UK) 2021–2022: dashboards en Power BI, Power Query y DAX. Kosta Cálida: 92 medidas DAX, desviación −7,56 %.";
  constructor(private now: () => Date) {}

  upcomingEvents(from: string, to: string) {
    return Promise.resolve(this.events.filter((e) => e.starts_at >= from && e.starts_at <= to).map((e) => structuredClone(e)));
  }
  syncState() { return Promise.resolve(this.syncs); }
  links() { return Promise.resolve(this.linksList); }
  interviews() { return Promise.resolve(this.rows.map((r) => structuredClone(r))); }
  insertInterview(row: Omit<Interview, "id" | "detected_at" | "updated_at">) {
    if (this.rows.some((r) => r.calendar === row.calendar && r.event_uid === row.event_uid)) return Promise.resolve(null);
    const r = { ...structuredClone(row), id: crypto.randomUUID(), detected_at: this.now().toISOString(), updated_at: this.now().toISOString() } as Interview;
    this.rows.push(r);
    return Promise.resolve(structuredClone(r));
  }
  patchInterview(id: string, patch: Partial<Interview>) {
    const r = this.rows.find((x) => x.id === id)!;
    Object.assign(r, structuredClone(patch), { updated_at: this.now().toISOString() });
    return Promise.resolve();
  }
  claim(leaseSec: number) {
    const now = this.now().toISOString();
    const cand = this.rows
      .filter((r) => ["queued", "researching", "generating", "needs_update"].includes(r.status))
      .filter((r) => !r.next_attempt_at || r.next_attempt_at <= now)
      .filter((r) => !r.locked_until || r.locked_until < now)
      .filter((r) => r.starts_at > new Date(this.now().getTime() - 36e5).toISOString())
      .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))[0];
    if (!cand) return Promise.resolve(null);
    cand.locked_until = new Date(this.now().getTime() + leaseSec * 1000).toISOString();
    return Promise.resolve(structuredClone(cand));
  }
  insertRun(run: Omit<Run, "id">) { const id = crypto.randomUUID(); this.runs.push({ ...structuredClone(run), id }); return Promise.resolve(id); }
  finishRun(id: string, patch: Partial<Run>) { Object.assign(this.runs.find((r) => r.id === id)!, structuredClone(patch)); return Promise.resolve(); }
  getRun(id: string) { return Promise.resolve(structuredClone(this.runs.find((r) => r.id === id) ?? null)); }
  insertReport(rep: any) {
    const version = this.reports.filter((r) => r.interview_id === rep.interview_id).length + 1;
    const id = crypto.randomUUID();
    this.reports.push({ ...structuredClone(rep), id, version });
    return Promise.resolve(id);
  }
  aiCallsSince(iso: string) { return Promise.resolve(this.runs.filter((r) => r.started_at >= iso && r.model !== "mock").length); }
  profile() { return Promise.resolve(this.profileText); }
}
