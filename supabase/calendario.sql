-- ═══════════════════════════════════════════════
-- supabase/calendario.sql — pestaña «Calendario» del área privada
-- ───────────────────────────────────────────────
-- Requiere haber ejecutado antes supabase/area-privada.sql (usa public.is_member()).
--
-- Cómo funciona (solo lectura)
--   Google Calendar ──(dirección secreta iCal)──▶ Edge Function «calendario-sync»
--   ──▶ public.calendar_events (caché) ──▶ la página lo lee como cualquier otra tabla.
--   La página nunca habla con Google: sin scripts de terceros, sin OAuth y sin tocar la CSP.
--   La dirección iCal es un secreto de la función, nunca llega al navegador.
--
-- Pasos (una vez)
--   1. Ejecuta este archivo en SQL Editor.
--   2. Despliega la función: supabase/functions/calendario-sync/README.md
--   3. Ejecuta el bloque «PROGRAMACIÓN» del final (cambiando el secreto).
-- ═══════════════════════════════════════════════

-- ─── EVENTOS (caché) ───
-- Un evento recurrente se guarda expandido: una fila por ocurrencia (uid + inicio).
-- Los de día completo se guardan a medianoche UTC con all_day = true; la página
-- usa solo la parte de fecha.
create table if not exists public.calendar_events (
  uid         text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  all_day     boolean not null default false,
  calendar    text not null default 'principal',
  title       text not null default '(sin título)',
  location    text,
  description text,
  url         text,
  synced_at   timestamptz not null default now(),
  primary key (uid, starts_at)
);
create index if not exists calendar_events_range_idx on public.calendar_events (starts_at, ends_at);

-- Estado de la última sincronización (una fila por calendario)
create table if not exists public.calendar_sync (
  calendar   text primary key,
  ran_at     timestamptz not null default now(),
  ok         boolean not null,
  events     integer,
  error      text
);

-- Lectura: solo miembros. Escritura: nadie desde la web (solo la función, con service_role).
alter table public.calendar_events enable row level security;
alter table public.calendar_sync   enable row level security;
revoke all on public.calendar_events from anon;
revoke all on public.calendar_sync   from anon;
drop policy if exists "calendar_events: leer" on public.calendar_events;
drop policy if exists "calendar_sync: leer"   on public.calendar_sync;
create policy "calendar_events: leer" on public.calendar_events for select to authenticated using (public.is_member());
create policy "calendar_sync: leer"   on public.calendar_sync   for select to authenticated using (public.is_member());

-- Sustituye los eventos de un calendario dentro de la ventana sincronizada, en una
-- sola transacción: si algo falla, la página sigue viendo la versión anterior.
create or replace function public.calendar_replace(cal text, win_start timestamptz, win_end timestamptz, evs jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.calendar_events
   where calendar = cal and starts_at < win_end and ends_at > win_start;
  insert into public.calendar_events (uid, starts_at, ends_at, all_day, calendar, title, location, description, url)
  select r.uid, r.starts_at, r.ends_at, coalesce(r.all_day, false), cal,
         coalesce(nullif(r.title, ''), '(sin título)'), r.location, r.description, r.url
    from jsonb_to_recordset(evs) as r(uid text, starts_at timestamptz, ends_at timestamptz, all_day boolean,
                                       title text, location text, description text, url text)
  on conflict (uid, starts_at) do update set
    ends_at = excluded.ends_at, all_day = excluded.all_day, calendar = excluded.calendar,
    title = excluded.title, location = excluded.location, description = excluded.description,
    url = excluded.url, synced_at = now();
  get diagnostics n = row_count;
  insert into public.calendar_sync (calendar, ran_at, ok, events, error) values (cal, now(), true, n, null)
  on conflict (calendar) do update set ran_at = now(), ok = true, events = n, error = null;
  -- lo que quedó muy atrás ya no hace falta
  delete from public.calendar_events where ends_at < now() - interval '400 days';
  return n;
end $$;
revoke execute on function public.calendar_replace(text, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant  execute on function public.calendar_replace(text, timestamptz, timestamptz, jsonb) to service_role;

-- ─── PROGRAMACIÓN (cada 15 minutos) ───
-- Ejecuta esto DESPUÉS de desplegar la función. Sustituye <SECRETO> por el mismo
-- valor que guardaste como CRON_SECRET de la función (una cadena larga aleatoria).
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select vault.create_secret('<SECRETO>', 'calendario_cron_secret');
-- select cron.schedule('calendario-sync', '*/15 * * * *', $cron$
--   select net.http_post(
--     url     := 'https://rvizmzjkxunkbqomsvcv.supabase.co/functions/v1/calendario-sync',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'calendario_cron_secret')
--     ),
--     body    := '{}'::jsonb,
--     timeout_milliseconds := 20000
--   );
-- $cron$);
--
-- Comprobar:  select * from cron.job_run_details order by start_time desc limit 5;
--             select * from public.calendar_sync;
-- Quitarla:   select cron.unschedule('calendario-sync');
