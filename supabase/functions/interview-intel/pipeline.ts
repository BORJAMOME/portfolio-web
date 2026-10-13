// ═══════════════════════════════════════════════
// pipeline.ts — detección y procesamiento de entrevistas (sin E/S directa: todo por «deps»)
// ───────────────────────────────────────────────
// Cada llamada del cron hace dos cosas:
//   1. detect(): recorre los eventos próximos de calendar_events y registra/actualiza las
//      entrevistas en ii_interviews. Idempotente: la clave es (calendario, UID del evento).
//   2. advance(): toma UNA entrevista pendiente con un bloqueo temporal (lease) y avanza UN paso:
//        queued / needs_update → investigar (correos + búsqueda web)  → generating
//        generating            → redactar y validar el informe      → ready
//      Un paso por llamada mantiene cada ejecución dentro del límite de tiempo de la
//      Edge Function y permite reanudar tras cualquier corte.
// Errores: reintento con espera progresiva (5, 15, 45 min); al tercero → failed.
// Un fallo nunca borra ni sustituye un informe que ya existía.
// ═══════════════════════════════════════════════
import { classify, fingerprints, norm } from "./classify.ts";
import { validateReport } from "./report.ts";
import type { CalendarEvent, EmailExcerpt, Interview, LinkedProcess, Report, Research, Status, Usage } from "./types.ts";

export type Run = {
  id: string; interview_id: string; kind: "research" | "generate"; status: "running" | "ok" | "failed";
  started_at: string; finished_at: string | null; model: string | null; usage: Usage | null;
  error: string | null; output: Research | null;
};

export interface Store {
  upcomingEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]>;
  syncState(): Promise<{ calendar: string; ran_at: string; ok: boolean }[]>;
  links(): Promise<LinkedProcess[]>;
  interviews(): Promise<Interview[]>;
  /** inserta si no existe (calendar, event_uid); devuelve null si ya existía */
  insertInterview(row: Omit<Interview, "id" | "detected_at" | "updated_at">): Promise<Interview | null>;
  patchInterview(id: string, patch: Partial<Interview>): Promise<void>;
  /** toma una entrevista lista para avanzar y la bloquea leaseSec segundos (o null) */
  claim(leaseSec: number): Promise<Interview | null>;
  insertRun(run: Omit<Run, "id">): Promise<string>;
  finishRun(id: string, patch: Partial<Run>): Promise<void>;
  getRun(id: string): Promise<Run | null>;
  insertReport(r: { interview_id: string; research_run_id: string; content: Report; sources: Research["sources"]; quality: string; word_count: number; warnings: string[]; fingerprint: string; model: string | null; usage: Usage | null }): Promise<string>;
  aiCallsSince(iso: string): Promise<number>;
  profile(): Promise<string | null>;
}

export type ResearchInput = {
  interview: Interview; emails: EmailExcerpt[]; event_description: string | null;
};
export type ReportInput = {
  interview: Interview; research: Research; profile: string | null; emails: EmailExcerpt[]; link: LinkedProcess | null;
  /** correcciones de un intento anterior (p. ej. «demasiado largo») */
  feedback?: string[];
};
export interface AIProvider {
  research(input: ResearchInput): Promise<{ research: Research; usage: Usage; model: string }>;
  writeReport(input: ReportInput): Promise<{ report: Report; usage: Usage; model: string }>;
}
export interface EmailSource {
  find(i: Interview): Promise<EmailExcerpt[]>;
}

export type Config = {
  ownEmails: string[];
  scanDays: number;       // hasta cuántos días vista se buscan entrevistas
  leadDays: number;       // a cuántos días de la entrevista empieza a prepararse
  maxAttempts: number;
  maxAiCallsPerDay: number;
  paused: boolean;
  leaseSec: number;
};
export type Deps = { store: Store; ai: AIProvider; email: EmailSource | null; now: () => Date; config: Config; log?: (msg: string) => void };

/* Transiciones permitidas (las que no están aquí no se hacen). Las de la web van por RPC
   en supabase/interview-intel.sql y respetan esta misma tabla. */
export const TRANSITIONS: Record<Status, Status[]> = {
  detected:       ["queued", "pending_review", "cancelled", "dismissed"],
  pending_review: ["queued", "dismissed", "cancelled", "detected"],
  queued:         ["researching", "generating", "cancelled", "failed", "dismissed"],
  researching:    ["generating", "queued", "cancelled", "failed"],
  generating:     ["ready", "needs_update", "queued", "cancelled", "failed"],
  ready:          ["needs_update", "queued", "cancelled", "dismissed"],
  needs_update:   ["researching", "generating", "ready", "cancelled", "failed", "queued"],
  cancelled:      ["detected", "queued", "pending_review", "ready", "dismissed"],
  failed:         ["queued", "cancelled", "dismissed"],
  dismissed:      ["pending_review"],
};
export const canMove = (from: Status, to: Status) => from === to || TRANSITIONS[from].includes(to);

const HOUR = 36e5, DAY = 864e5;
const BACKOFF_MIN = [5, 15, 45];

/* ═══════════ 1. DETECCIÓN ═══════════ */
export async function detect(d: Deps) {
  const { store, config } = d, now = d.now();
  const from = new Date(now.getTime() - 2 * HOUR), to = new Date(now.getTime() + config.scanDays * DAY);
  const [events, links, existing, syncs] = await Promise.all([
    store.upcomingEvents(from.toISOString(), to.toISOString()), store.links(), store.interviews(), store.syncState(),
  ]);

  // un evento recurrente llega como varias ocurrencias: nos quedamos con la próxima
  const byKey = new Map<string, CalendarEvent>();
  for (const ev of events) {
    if (ev.all_day) continue;
    const k = ev.calendar + "|" + ev.uid, prev = byKey.get(k);
    if (!prev || ev.starts_at < prev.starts_at) byKey.set(k, ev);
  }
  const linkByUid = new Map<string, LinkedProcess>();
  for (const l of links) linkByUid.set(l.calendar_uid.split("|")[0], l);   // calendar_uid = «uid|inicio»
  const rows = new Map(existing.map((r) => [r.calendar + "|" + r.event_uid, r]));
  const stats = { seen: byKey.size, created: 0, updated: 0, cancelled: 0 };

  for (const [k, ev] of byKey) {
    const link = linkByUid.get(ev.uid) ?? null;
    const c = classify(ev, config.ownEmails, link);
    const fp = fingerprints(ev, c.external);
    const declined = c.my_response === "DECLINED" || (ev.status ?? "").toUpperCase() === "CANCELLED";
    const within = new Date(ev.starts_at).getTime() - now.getTime() <= config.leadDays * DAY;
    const fields = {
      starts_at: ev.starts_at, ends_at: ev.ends_at, title: ev.title, location: ev.location, conference_url: ev.conference_url,
      organizer: ev.organizer, attendees: c.external, my_response: c.my_response, event_status: ev.status,
      sequence: ev.sequence, last_modified: ev.last_modified, last_seen_at: now.toISOString(),
    };
    const row = rows.get(k);

    if (!row) {
      if (c.classification === "not_interview") continue;
      const status: Status = declined ? "cancelled" : c.classification === "candidate" ? "pending_review" : within ? "queued" : "detected";
      const created = await store.insertInterview({
        calendar: ev.calendar, event_uid: ev.uid, ...fields,
        classification: c.classification, interview_kind: c.kind, confidence: c.confidence, signals: c.signals,
        company: c.company, company_domain: c.company_domain, role_title: c.role_title, job_url: c.job_url,
        entrevista_id: link?.entrevista_id ?? null, major_fp: fp.major, minor_fp: fp.minor,
        status, status_note: declined ? "Invitación rechazada o evento cancelado" : null,
        attempts: 0, next_attempt_at: null, locked_until: null, last_error: null,
        research_run_id: null, current_report_id: null, report_fp: null, email_context: null,
      });
      if (created) stats.created++;
      continue;
    }

    // ya registrada: actualizar datos del evento y decidir si cambia de estado
    const patch: Partial<Interview> = { ...fields };
    if (!row.company && c.company) patch.company = c.company;
    if (!row.company_domain && c.company_domain) patch.company_domain = c.company_domain;
    if (!row.role_title && c.role_title) patch.role_title = c.role_title;
    if (!row.job_url && c.job_url) patch.job_url = c.job_url;
    if (link && row.entrevista_id !== link.entrevista_id) {
      patch.entrevista_id = link.entrevista_id;
      // lo que registré a mano manda sobre lo deducido del título
      patch.company = link.empresa; patch.role_title = link.puesto; if (link.url) patch.job_url = link.url;
    }
    // la clasificación solo sube (si la confirmé, no vuelve a «posible» por un cambio de título)
    if (c.confidence > row.confidence) { patch.confidence = c.confidence; patch.signals = c.signals; patch.classification = c.classification; }
    if (row.interview_kind === "desconocida" && c.kind !== "desconocida") patch.interview_kind = c.kind;
    const majorChanged = row.major_fp !== fp.major;
    patch.major_fp = fp.major; patch.minor_fp = fp.minor;

    let next: Status = row.status;
    if (row.status === "dismissed") { /* descartada a mano: solo se actualizan los datos */ }
    else if (declined) next = "cancelled";
    else if (row.status === "cancelled") next = row.current_report_id ? (majorChanged ? "needs_update" : "ready") : (row.classification === "candidate" ? "pending_review" : within ? "queued" : "detected");
    else if (row.status === "detected" && within) next = "queued";
    else if (row.status === "pending_review" && link) next = within ? "queued" : "detected";
    else if (majorChanged && row.current_report_id && row.report_fp !== fp.major && (row.status === "ready")) next = "needs_update";
    // queued / researching / generating: el siguiente paso ya leerá los datos nuevos

    if (next !== row.status && canMove(row.status, next)) {
      patch.status = next;
      patch.status_note = next === "cancelled" ? "Invitación rechazada o evento cancelado"
        : next === "needs_update" ? "El evento cambió (título, descripción o participantes)" : null;
      if (next === "queued" || next === "needs_update") { patch.attempts = 0; patch.next_attempt_at = null; }
      if (next === "cancelled") stats.cancelled++;
    }
    await store.patchInterview(row.id, patch);
    stats.updated++;
    rows.delete(k);
  }

  // registradas cuyo evento ya no aparece: cancelado o borrado en Google. Solo si la última
  // sincronización de ese calendario fue buena y posterior a la última vez que lo vimos.
  for (const row of rows.values()) {
    if (["cancelled", "dismissed"].includes(row.status)) continue;
    if (new Date(row.starts_at) < from || new Date(row.starts_at) > to) continue;
    const s = syncs.find((x) => x.calendar === row.calendar);
    if (!s || !s.ok || s.ran_at <= row.last_seen_at) continue;
    if (!canMove(row.status, "cancelled")) continue;
    await store.patchInterview(row.id, { status: "cancelled", status_note: "El evento ya no está en el calendario", locked_until: null });
    stats.cancelled++;
  }
  return stats;
}

/* ═══════════ 2. PROCESAMIENTO ═══════════ */
export async function advance(d: Deps): Promise<{ action: string; id?: string; error?: string }> {
  const { store, config } = d, now = d.now();
  if (config.paused) return { action: "paused" };
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  if (await store.aiCallsSince(dayStart.toISOString()) >= config.maxAiCallsPerDay) return { action: "daily_limit" };

  const job = await store.claim(config.leaseSec);
  if (!job) return { action: "idle" };
  const step = job.status === "generating" ? "generate" : "research";
  try {
    if (step === "research") await researchStep(d, job);
    else await generateStep(d, job);
    return { action: step, id: job.id };
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 500);
    const attempts = job.attempts + 1;
    const failed = attempts >= config.maxAttempts;
    // vuelve al paso en el que estaba; el informe anterior (si lo hay) no se toca
    const back: Status = failed ? "failed" : step === "generate" ? "generating" : (job.status === "needs_update" ? "needs_update" : "queued");
    await store.patchInterview(job.id, {
      status: back, attempts, last_error: msg, locked_until: null,
      next_attempt_at: failed ? null : new Date(now.getTime() + BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60e3).toISOString(),
      status_note: failed ? "Falló " + attempts + " veces. Puedes reintentarlo desde la web." : "Reintento programado",
    });
    d.log?.(`[interview-intel] ${step} ${job.id}: ${msg}`);
    return { action: step, id: job.id, error: msg };
  }
}

async function researchStep(d: Deps, job: Interview) {
  const { store } = d;
  await store.patchInterview(job.id, { status: "researching" });
  // 1. correos del proceso (opcional: si Gmail no está configurado o falla, se sigue sin ellos)
  let emails: EmailExcerpt[] = job.email_context ?? [];
  const limitations: string[] = [];
  if (d.email) {
    try { emails = await d.email.find(job); }
    catch (e) { limitations.push("No se pudieron leer los correos: " + String((e as Error).message).slice(0, 120)); }
  }
  const events = await store.upcomingEvents(new Date(new Date(job.starts_at).getTime() - 1000).toISOString(), new Date(new Date(job.starts_at).getTime() + 1000).toISOString());
  const ev = events.find((e) => e.uid === job.event_uid);
  // 2. investigación web
  const runId = await store.insertRun({ interview_id: job.id, kind: "research", status: "running", started_at: d.now().toISOString(), finished_at: null, model: null, usage: null, error: null, output: null });
  try {
    const r = await d.ai.research({ interview: { ...job, email_context: emails }, emails, event_description: ev?.description ?? null });
    r.research.gaps = [...limitations, ...r.research.gaps];
    await store.finishRun(runId, { status: "ok", finished_at: d.now().toISOString(), model: r.model, usage: r.usage, output: r.research });
    const patch: Partial<Interview> = {
      status: "generating", research_run_id: runId, email_context: emails, attempts: 0, last_error: null, next_attempt_at: null,
      status_note: null, locked_until: null,
    };
    // la investigación puede completar lo que el título no decía (nunca pisa lo registrado a mano)
    if (!job.entrevista_id) {
      const rc = r.research.company;
      if (rc.name && (!job.company || rc.confirmed)) patch.company = rc.name;
      if (!job.role_title && r.research.role.title) patch.role_title = r.research.role.title;
    }
    if (!job.company_domain && r.research.company.domain) patch.company_domain = r.research.company.domain;
    await store.patchInterview(job.id, patch);
  } catch (e) {
    await store.finishRun(runId, { status: "failed", finished_at: d.now().toISOString(), error: String((e as Error)?.message ?? e).slice(0, 500) });
    throw e;
  }
}

async function generateStep(d: Deps, job: Interview) {
  const { store } = d;
  const run = job.research_run_id ? await store.getRun(job.research_run_id) : null;
  if (!run || !run.output) {   // sin investigación válida: se repite
    await store.patchInterview(job.id, { status: job.current_report_id ? "needs_update" : "queued", locked_until: null, next_attempt_at: null });
    return;
  }
  const [profile, links] = await Promise.all([store.profile(), store.links()]);
  const link = links.find((l) => l.entrevista_id === job.entrevista_id) ?? null;
  const input: ReportInput = { interview: job, research: run.output, profile, emails: job.email_context ?? [], link };
  const genId = await store.insertRun({ interview_id: job.id, kind: "generate", status: "running", started_at: d.now().toISOString(), finished_at: null, model: null, usage: null, error: null, output: null });
  try {
    let out = await d.ai.writeReport(input);
    let v = validateReport(out.report, run.output, profile);
    if (v.retry.length) {   // un segundo intento si se pasa de largo o le faltan bloques
      const again = await d.ai.writeReport({ ...input, feedback: v.retry });
      const v2 = validateReport(again.report, run.output, profile);
      if (v2.errors.length <= v.errors.length) { out = { ...again, usage: sumUsage(out.usage, again.usage) }; v = v2; }
    }
    if (v.errors.length) throw new Error("Informe no válido: " + v.errors.join("; "));
    if (!profile) v.warnings.unshift("No se encontró la nota «Perfil profesional · Interview Intelligence»: las respuestas no están personalizadas.");
    const quality = v.report.quality === "completo" && !v.warnings.length ? "completo" : v.warnings.some((w) => /^Cifra|^Perfil|No se encontró/.test(w)) ? "revisar" : "parcial";
    const reportId = await store.insertReport({
      interview_id: job.id, research_run_id: run.id, content: v.report, sources: run.output.sources, quality, word_count: v.words, warnings: v.warnings,
      fingerprint: job.major_fp, model: out.model, usage: out.usage,
    });
    await store.finishRun(genId, { status: "ok", finished_at: d.now().toISOString(), model: out.model, usage: out.usage });
    // si el evento cambió mientras se redactaba, el informe nace ya pendiente de actualizar
    const fresh = (await store.interviews()).find((x) => x.id === job.id);
    const stale = fresh && fresh.major_fp !== job.major_fp;
    await store.patchInterview(job.id, {
      status: stale ? "needs_update" : "ready", current_report_id: reportId, report_fp: job.major_fp,
      attempts: 0, last_error: null, next_attempt_at: null, locked_until: null,
      status_note: stale ? "El evento cambió mientras se preparaba el informe" : null,
    });
  } catch (e) {
    await store.finishRun(genId, { status: "failed", finished_at: d.now().toISOString(), error: String((e as Error)?.message ?? e).slice(0, 500) });
    throw e;
  }
}

export function sumUsage(a: Usage, b: Usage): Usage {
  return {
    input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    web_search_requests: a.web_search_requests + b.web_search_requests, web_fetch_requests: a.web_fetch_requests + b.web_fetch_requests,
    usd: Math.round((a.usd + b.usd) * 10000) / 10000,
  };
}

export { norm };
