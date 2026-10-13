// Tipos compartidos de «Interview Intelligence». Sin dependencias: los usan las pruebas y la función.

export type Person = { name: string | null; email: string | null; partstat?: string | null; role?: string | null };

/** Fila de public.calendar_events (lo que deja calendario-sync) */
export type CalendarEvent = {
  uid: string; calendar: string; starts_at: string; ends_at: string; all_day: boolean;
  title: string; location: string | null; description: string | null; url: string | null;
  organizer: Person | null; attendees: Person[] | null; status: string | null;
  sequence: number | null; last_modified: string | null; conference_url: string | null;
};

/** Proceso y entrevista registrados a mano en la pestaña Entrevistas (fuente más fiable) */
export type LinkedProcess = {
  entrevista_id: string; calendar_uid: string; fase: string | null; entrevistadores: string | null;
  empresa: string; puesto: string; url: string | null; ubicacion: string | null; modalidad: string | null;
};

export type Classification = "interview" | "candidate" | "not_interview";
export type InterviewKind = "rrhh" | "tecnica" | "negocio" | "final" | "mixta" | "desconocida";

/**
 * Estados persistentes (public.ii_interviews.status). Transiciones en pipeline.ts → TRANSITIONS.
 *   detected        detectada, aún fuera de la ventana de preparación
 *   pending_review  posible entrevista: espera a que la confirme o la descarte desde la web
 *   queued          en cola para investigar
 *   researching     investigando (empresa, oferta, entrevistadores)
 *   generating      redactando el informe
 *   ready           informe listo
 *   needs_update    el evento cambió de forma relevante: se regenerará (el informe anterior sigue visible)
 *   cancelled       evento cancelado, rechazado o desaparecido (se conserva todo)
 *   failed          agotó los reintentos; se puede reintentar desde la web
 *   dismissed       la descarté yo («no es una entrevista»)
 */
export type Status =
  | "detected" | "pending_review" | "queued" | "researching" | "generating"
  | "ready" | "needs_update" | "cancelled" | "failed" | "dismissed";

export type Interview = {
  id: string;
  calendar: string; event_uid: string;
  starts_at: string; ends_at: string;
  title: string; location: string | null; conference_url: string | null;
  organizer: Person | null; attendees: Person[];
  my_response: string | null; event_status: string | null;
  sequence: number | null; last_modified: string | null;
  classification: Classification; interview_kind: InterviewKind; confidence: number; signals: string[];
  company: string | null; company_domain: string | null; role_title: string | null; job_url: string | null;
  entrevista_id: string | null;
  major_fp: string; minor_fp: string;
  status: Status; status_note: string | null;
  attempts: number; next_attempt_at: string | null; locked_until: string | null; last_error: string | null;
  research_run_id: string | null; current_report_id: string | null; report_fp: string | null;
  email_context: EmailExcerpt[] | null;
  detected_at: string; updated_at: string; last_seen_at: string;
};

export type EmailExcerpt = {
  thread_id: string; message_id: string; subject: string; from: string; date: string; excerpt: string; links: string[];
};

/* ─── Investigación (salida verificada de la llamada con búsqueda web) ─── */
export type SourceType = "oficial" | "empresa" | "prensa" | "perfil" | "oferta" | "otro";
export type Source = { id: number; url: string; title: string; domain: string; published: string | null; retrieved_at: string; type: SourceType };
export type FactKind = "confirmado" | "empresa" | "tercero" | "inferencia";
export type Fact = { text: string; kind: FactKind; source_ids: number[] };
export type ResearchPerson = {
  name: string; current_title: string | null; area: string | null;
  identified: "alto" | "medio" | "no_verificado";
  background: string | null; public_activity: string | null; likely_role: string | null; source_ids: number[];
};
export type Research = {
  company: {
    name: string; domain: string | null; confirmed: boolean; ambiguity: string | null;
    summary: string; business_model: string | null;
    facts: Fact[]; news: (Fact & { date: string | null; why: string | null })[]; data_initiatives: Fact[];
  };
  role: {
    title: string | null; available: boolean; level: string | null; responsibilities: string[];
    must: string[]; nice: string[]; tools: string[]; languages: string[]; location: string | null; mode: string | null;
    source_ids: number[];
  };
  people: ResearchPerson[];
  sources: Source[];
  gaps: string[];
};

/* ─── Informe (lo que se guarda en ii_reports.content y pinta la web) ─── */
export type EvidenceClass = "demostrado" | "formacion" | "transferible" | "brecha";
export type Report = {
  quality: "completo" | "parcial";
  limitations: string[];
  interview_type: string;
  know: { context: string; facts: { text: string; source_ids: number[] }[]; why_it_matters: string };
  people: { name: string; title: string | null; role_in_interview: string; note: string | null; verified: boolean; source_ids: number[] }[];
  strategy: {
    highlight: string[];
    projects: { name: string; why: string; highlight: string; decisions: string; follow_up: string; limitation: string }[];
    review: string[];
    gap: { topic: string; honest_answer: string } | null;
  };
  intro: string;
  questions: { q: string; guide: string; evidence: EvidenceClass }[];
  ask: string[];
  reminder: { fit: string; example: string; question: string; technical: string };
  matrix: { requirement: string; class: EvidenceClass; evidence: string }[];
};

export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; web_search_requests: number; web_fetch_requests: number; usd: number };
