// store.ts — Store (pipeline.ts) sobre la API REST de Supabase con la clave service_role.
// Solo se usa dentro de la Edge Function: la clave nunca sale del servidor.
import type { Run, Store } from "./pipeline.ts";
import type { CalendarEvent, Interview, LinkedProcess } from "./types.ts";

export const PROFILE_TITLE = "Perfil profesional · Interview Intelligence";
const EV_COLS = "uid,calendar,starts_at,ends_at,all_day,title,location,description,url,organizer,attendees,status,sequence,last_modified,conference_url";

export class SupabaseStore implements Store {
  constructor(private url: string, private key: string) {}

  private async req(path: string, init: RequestInit = {}) {
    const r = await fetch(this.url + path, {
      ...init,
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`Base de datos ${r.status}: ${t.slice(0, 300)}`);
    return t ? JSON.parse(t) : null;
  }
  private rep = { Prefer: "return=representation" };

  upcomingEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]> {
    return this.req(`/rest/v1/calendar_events?select=${EV_COLS}&starts_at=gte.${encodeURIComponent(fromIso)}&starts_at=lte.${encodeURIComponent(toIso)}&all_day=is.false&order=starts_at.asc&limit=1000`);
  }
  syncState() { return this.req("/rest/v1/calendar_sync?select=calendar,ran_at,ok"); }

  async links(): Promise<LinkedProcess[]> {
    const rows = await this.req("/rest/v1/entrevistas?select=id,calendar_uid,fase,entrevistadores,procesos(empresa,puesto,url,ubicacion,modalidad)&calendar_uid=not.is.null");
    return (rows ?? []).filter((r: any) => r.procesos).map((r: any) => ({
      entrevista_id: r.id, calendar_uid: r.calendar_uid, fase: r.fase, entrevistadores: r.entrevistadores,
      empresa: r.procesos.empresa, puesto: r.procesos.puesto, url: r.procesos.url, ubicacion: r.procesos.ubicacion, modalidad: r.procesos.modalidad,
    }));
  }
  interviews(): Promise<Interview[]> {
    // las de los últimos 30 días y futuras: lo que la detección puede tocar
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    return this.req(`/rest/v1/ii_interviews?select=*&starts_at=gte.${encodeURIComponent(since)}&order=starts_at.asc`);
  }
  async insertInterview(row: Omit<Interview, "id" | "detected_at" | "updated_at">) {
    // on_conflict + ignore-duplicates: si dos ejecuciones detectan a la vez, solo una inserta
    const r = await this.req("/rest/v1/ii_interviews?on_conflict=calendar,event_uid", {
      method: "POST", headers: { Prefer: "return=representation,resolution=ignore-duplicates" }, body: JSON.stringify(row),
    });
    return r?.[0] ?? null;
  }
  async patchInterview(id: string, patch: Partial<Interview>) {
    await this.req(`/rest/v1/ii_interviews?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  async claim(leaseSec: number) {
    const r = await this.req("/rest/v1/rpc/ii_claim", { method: "POST", body: JSON.stringify({ lease_seconds: leaseSec }) });
    return r?.[0] ?? null;
  }
  async insertRun(run: Omit<Run, "id">) {
    const r = await this.req("/rest/v1/ii_runs?select=id", { method: "POST", headers: this.rep, body: JSON.stringify(run) });
    return r[0].id as string;
  }
  async finishRun(id: string, patch: Partial<Run>) {
    await this.req(`/rest/v1/ii_runs?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  async getRun(id: string) {
    const r = await this.req(`/rest/v1/ii_runs?select=*&id=eq.${id}`);
    return r?.[0] ?? null;
  }
  async insertReport(rep: Parameters<Store["insertReport"]>[0]) {
    const r = await this.req("/rest/v1/ii_reports?select=id", { method: "POST", headers: this.rep, body: JSON.stringify({ ...rep, version: 0 }) });
    return r[0].id as string;
  }
  async aiCallsSince(iso: string) {
    const r = await fetch(`${this.url}/rest/v1/ii_runs?select=id&started_at=gte.${encodeURIComponent(iso)}&model=neq.mock`, {
      method: "HEAD", headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, Prefer: "count=exact" },
    });
    // las ejecuciones aún sin modelo (en curso) también cuentan
    const range = r.headers.get("content-range") ?? "*/0";
    const pending = await this.req(`/rest/v1/ii_runs?select=id&started_at=gte.${encodeURIComponent(iso)}&model=is.null`);
    return Number(range.split("/")[1] || 0) + (pending?.length ?? 0);
  }
  async profile() {
    const r = await this.req(`/rest/v1/items?select=body&kind=eq.note&title=eq.${encodeURIComponent(PROFILE_TITLE)}&limit=1`);
    const body = r?.[0]?.body as string | undefined;
    return body?.trim() ? body : null;
  }
}
