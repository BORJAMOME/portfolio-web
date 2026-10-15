-- ═══════════════════════════════════════════════
-- supabase/interview-intel.sql: «Interview Intelligence» (preparación de entrevistas)
-- ───────────────────────────────────────────────
-- Requiere: area-privada.sql (is_member), entrevistas.sql (procesos, entrevistas,
-- touch_updated_at) y calendario.sql (calendar_events con las columnas de participantes).
-- Se ejecuta en Supabase → SQL Editor. Es idempotente y solo AÑADE objetos: no borra ni
-- cambia tablas existentes. Para deshacerlo, bloque «MARCHA ATRÁS» al final.
--
-- Flujo
--   calendar_events ──(Edge Function interview-intel, cada 10 min)──▶ ii_interviews (estado)
--        ├─ investigación (correos opcionales + búsqueda web) ──▶ ii_runs (resultado y fuentes)
--        └─ informe validado ──────────────────────────────────▶ ii_reports (versiones)
--   La web solo LEE estas tablas; las únicas escrituras desde la web son las acciones
--   de ii_action() (confirmar, descartar, reintentar, regenerar), que validan la transición.
--
-- Modelo mínimo (3 tablas)
--   ii_interviews  una fila por evento de Google (calendario + UID): datos del evento,
--                  clasificación, participantes externos, estado y control de reintentos
--   ii_runs        cada llamada a la IA (investigación o redacción): modelo, coste, error y,
--                  en las de investigación, el resultado verificado con sus fuentes
--   ii_reports     cada versión del informe; la vigente es ii_interviews.current_report_id
-- ═══════════════════════════════════════════════

create table if not exists public.ii_interviews (
  id               uuid primary key default gen_random_uuid(),
  calendar         text not null,
  event_uid        text not null check (char_length(event_uid) <= 1100),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  title            text not null default '(sin título)',
  location         text,
  conference_url   text,
  organizer        jsonb,
  attendees        jsonb not null default '[]',       -- solo personas de fuera (tú no)
  my_response      text,                              -- ACCEPTED | NEEDS-ACTION | TENTATIVE | DECLINED | null
  event_status     text,
  sequence         integer,
  last_modified    timestamptz,
  classification   text not null check (classification in ('interview', 'candidate', 'not_interview')),
  interview_kind   text not null default 'desconocida'
                   check (interview_kind in ('rrhh', 'tecnica', 'negocio', 'final', 'mixta', 'desconocida')),
  confidence       real not null default 0,
  signals          jsonb not null default '[]',
  company          text check (char_length(company) <= 160),
  company_domain   text,
  role_title       text check (char_length(role_title) <= 200),
  job_url          text check (job_url ~* '^https?://' and char_length(job_url) <= 2000),
  entrevista_id    uuid references public.entrevistas(id) on delete set null,
  major_fp         text not null,                     -- huella de título, descripción y personas
  minor_fp         text not null,                     -- huella de hora, lugar y enlace
  status           text not null default 'detected'
                   check (status in ('detected', 'pending_review', 'queued', 'researching', 'generating',
                                     'ready', 'needs_update', 'cancelled', 'failed', 'dismissed')),
  status_note      text,
  attempts         smallint not null default 0,
  next_attempt_at  timestamptz,
  locked_until     timestamptz,
  last_error       text,
  research_run_id  uuid,
  current_report_id uuid,
  report_fp        text,                              -- major_fp con el que se escribió el informe vigente
  email_context    jsonb,                             -- extractos de correo (se vacía 30 días después)
  detected_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  unique (calendar, event_uid)
);
create index if not exists ii_interviews_starts_idx on public.ii_interviews (starts_at);
create index if not exists ii_interviews_work_idx on public.ii_interviews (status, next_attempt_at)
  where status in ('queued', 'researching', 'generating', 'needs_update');

create table if not exists public.ii_runs (
  id            uuid primary key default gen_random_uuid(),
  interview_id  uuid not null references public.ii_interviews(id) on delete cascade,
  kind          text not null check (kind in ('research', 'generate')),
  status        text not null check (status in ('running', 'ok', 'failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  model         text,
  usage         jsonb,                                -- tokens, búsquedas y coste estimado (usd)
  error         text,
  output        jsonb                                 -- investigación verificada (solo kind = research)
);
create index if not exists ii_runs_interview_idx on public.ii_runs (interview_id, started_at desc);
create index if not exists ii_runs_started_idx on public.ii_runs (started_at);

create table if not exists public.ii_reports (
  id              uuid primary key default gen_random_uuid(),
  interview_id    uuid not null references public.ii_interviews(id) on delete cascade,
  version         integer not null,
  research_run_id uuid references public.ii_runs(id) on delete set null,
  quality         text not null check (quality in ('completo', 'parcial', 'revisar')),
  content         jsonb not null,                     -- informe estructurado (ver report.ts)
  sources         jsonb not null default '[]',        -- copia de las fuentes citables (URL, título, fecha)
  warnings        jsonb not null default '[]',
  word_count      integer,
  fingerprint     text,
  model           text,
  usage           jsonb,
  created_at      timestamptz not null default now(),
  unique (interview_id, version)
);

-- updated_at automático (función de entrevistas.sql)
drop trigger if exists ii_interviews_touch on public.ii_interviews;
create trigger ii_interviews_touch before update on public.ii_interviews
  for each row execute function public.touch_updated_at();

-- Versión siguiente del informe sin carreras: la calcula la base al insertar
create or replace function public.ii_reports_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.interview_id::text));
  select coalesce(max(version), 0) + 1 into new.version from public.ii_reports where interview_id = new.interview_id;
  return new;
end $$;
drop trigger if exists ii_reports_version on public.ii_reports;
create trigger ii_reports_version before insert on public.ii_reports
  for each row execute function public.ii_reports_version();

-- ─── SEGURIDAD ───
-- Lectura: solo miembros. Escritura directa: nadie desde la web (solo la función, con
-- service_role, que se salta RLS). Las acciones de la web van por ii_action().
alter table public.ii_interviews enable row level security;
alter table public.ii_runs       enable row level security;
alter table public.ii_reports    enable row level security;
revoke all on public.ii_interviews, public.ii_runs, public.ii_reports from anon;
revoke insert, update, delete on public.ii_interviews, public.ii_runs, public.ii_reports from authenticated;
drop policy if exists "ii_interviews: leer" on public.ii_interviews;
drop policy if exists "ii_runs: leer"       on public.ii_runs;
drop policy if exists "ii_reports: leer"    on public.ii_reports;
create policy "ii_interviews: leer" on public.ii_interviews for select to authenticated using (public.is_member());
create policy "ii_runs: leer"       on public.ii_runs       for select to authenticated using (public.is_member());
create policy "ii_reports: leer"    on public.ii_reports    for select to authenticated using (public.is_member());

-- ─── ACCIONES DESDE LA WEB ───
--   confirm     es una entrevista: prepárala         (detected | pending_review | cancelled → queued)
--   dismiss     no es una entrevista                  (cualquiera salvo en curso → dismissed)
--   restore     deshacer «no es una entrevista»       (dismissed → pending_review)
--   retry       reintentar tras un fallo              (failed → queued)
--   regenerate  investigar y redactar de nuevo        (ready | needs_update | cancelled → queued)
-- No se puede actuar sobre una entrevista que la función tiene bloqueada en este momento.
create or replace function public.ii_action(target uuid, action text)
returns text
language plpgsql security definer set search_path = '' as $$
declare cur text; locked boolean; nxt text;
begin
  if not public.is_member() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select status, coalesce(locked_until > now(), false) into cur, locked
    from public.ii_interviews where id = target for update;
  if cur is null then raise exception 'No existe' using errcode = 'P0002'; end if;
  if locked then raise exception 'Se está procesando ahora mismo; prueba en unos minutos' using errcode = '55P03'; end if;
  nxt := case
    when action = 'confirm'    and cur in ('detected', 'pending_review', 'cancelled') then 'queued'
    when action = 'dismiss'    and cur not in ('researching', 'generating', 'dismissed') then 'dismissed'
    when action = 'restore'    and cur = 'dismissed' then 'pending_review'
    when action = 'retry'      and cur = 'failed' then 'queued'
    when action = 'regenerate' and cur in ('ready', 'needs_update', 'cancelled', 'failed') then 'queued'
    else null end;
  if nxt is null then raise exception 'Acción «%» no permitida en estado «%»', action, cur using errcode = '22023'; end if;
  update public.ii_interviews set
    status = nxt, attempts = 0, next_attempt_at = null, last_error = null,
    classification = case when action = 'confirm' then 'interview' else classification end,
    confidence = case when action = 'confirm' then greatest(confidence, 1) else confidence end,
    status_note = case action when 'confirm' then 'Confirmada a mano' when 'dismiss' then 'Descartada a mano'
                              when 'regenerate' then 'Regeneración pedida a mano' when 'retry' then 'Reintento pedido a mano' else null end
   where id = target;
  return nxt;
end $$;
revoke execute on function public.ii_action(uuid, text) from public, anon;
grant  execute on function public.ii_action(uuid, text) to authenticated;

-- ─── COLA (solo la función) ───
-- Toma una entrevista que puede avanzar y la bloquea durante lease_seconds. SKIP LOCKED +
-- locked_until garantizan que dos ejecuciones nunca trabajan en la misma a la vez.
create or replace function public.ii_claim(lease_seconds integer default 300)
returns setof public.ii_interviews
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.ii_interviews i set locked_until = now() + make_interval(secs => lease_seconds)
   where i.id = (
     select id from public.ii_interviews
      where status in ('queued', 'researching', 'generating', 'needs_update')
        and (next_attempt_at is null or next_attempt_at <= now())
        and (locked_until is null or locked_until < now())
        and starts_at > now() - interval '1 hour'
      order by starts_at
      limit 1
      for update skip locked)
  returning i.*;
end $$;
revoke execute on function public.ii_claim(integer) from public, anon, authenticated;
grant  execute on function public.ii_claim(integer) to service_role;

-- ─── RETENCIÓN ───
-- · extractos de correo: se vacían 30 días después de la entrevista
-- · resultado bruto de la investigación: se vacía 180 días después (el informe guarda su copia de fuentes)
-- · los informes y el historial se conservan; borrarlos es una decisión manual
create or replace function public.ii_retention()
returns void
language sql security definer set search_path = '' as $$
  update public.ii_interviews set email_context = null
   where email_context is not null and starts_at < now() - interval '30 days';
  update public.ii_runs r set output = null
    from public.ii_interviews i
   where r.interview_id = i.id and r.output is not null and i.starts_at < now() - interval '180 days';
$$;
revoke execute on function public.ii_retention() from public, anon, authenticated;

-- ─── PROGRAMACIÓN ───
-- Ejecuta esto DESPUÉS de desplegar la función (supabase/functions/interview-intel/README.md).
-- Reutiliza el secreto del cron del calendario (vault «calendario_cron_secret»): CRON_SECRET
-- es un secreto del proyecto, común a las dos funciones.
--
-- select cron.schedule('interview-intel', '*/10 * * * *', $cron$
--   select net.http_post(
--     url     := 'https://rvizmzjkxunkbqomsvcv.supabase.co/functions/v1/interview-intel',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'calendario_cron_secret')
--     ),
--     body    := '{"action":"tick"}'::jsonb,
--     timeout_milliseconds := 150000
--   );
-- $cron$);
-- select cron.schedule('interview-intel-retencion', '30 4 * * 1', $$ select public.ii_retention() $$);
--
-- Pausar:    select cron.unschedule('interview-intel');      (o el secreto II_PAUSED=1)
-- Comprobar: select status, count(*) from public.ii_interviews group by 1;
--            select kind, status, started_at, error, usage->>'usd' as usd from public.ii_runs order by started_at desc limit 10;

-- ─── MARCHA ATRÁS (borra los datos de Interview Intelligence; no toca nada más) ───
-- select cron.unschedule('interview-intel'); select cron.unschedule('interview-intel-retencion');
-- drop function if exists public.ii_action(uuid, text), public.ii_claim(integer), public.ii_retention(), public.ii_reports_version();
-- drop table if exists public.ii_reports, public.ii_runs, public.ii_interviews;
-- Las columnas añadidas a calendar_events (calendario.sql) pueden quedarse: no molestan.
