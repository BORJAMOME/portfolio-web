-- ═══════════════════════════════════════════════
-- supabase/second-brain.sql: tablas de Second Brain (pestaña «Second Brain» del área privada)
-- ───────────────────────────────────────────────
-- Requiere haber ejecutado antes supabase/area-privada.sql (usa public.is_member()).
-- Se ejecuta UNA vez en Supabase → SQL Editor → New query → pegar → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- sb_snapshots  cada fila es un grafo ya calculado por el motor (tools/second-brain).
--               La página solo lee la más reciente. Los snapshots de demostración NO se guardan aquí.
-- sb_runs       registro de cada intento de análisis (correcto o fallido). Un intento fallido
--               no crea snapshot: la página sigue mostrando el último válido.
--
-- Seguridad: RLS activada y sin acceso para anon. Solo un miembro autenticado lee y escribe;
-- el motor escribe con tu propia sesión (publish.mjs), sin la clave service_role.
-- Para limpiar snapshots antiguos (conserva los 10 últimos):
--   delete from public.sb_snapshots where id not in
--     (select id from public.sb_snapshots order by generated_at desc limit 10);
-- ═══════════════════════════════════════════════

create table if not exists public.sb_snapshots (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  generated_at   timestamptz not null,
  mode           text not null check (mode = 'real'),
  engine_version text not null check (char_length(engine_version) <= 40),
  schema_version int  not null check (schema_version >= 1),
  stats          jsonb not null,
  graph          jsonb not null check (jsonb_typeof(graph) = 'object' and pg_column_size(graph) < 6000000),
  created_by     uuid default auth.uid() references auth.users on delete set null
);
create index if not exists sb_snapshots_generated_idx on public.sb_snapshots (generated_at desc);

create table if not exists public.sb_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null,
  finished_at timestamptz,
  status      text not null check (status in ('ok', 'error')),
  message     text check (char_length(message) <= 500),
  stats       jsonb,
  snapshot_id uuid references public.sb_snapshots on delete set null,
  created_by  uuid default auth.uid() references auth.users on delete set null
);
create index if not exists sb_runs_started_idx on public.sb_runs (started_at desc);

alter table public.sb_snapshots enable row level security;
alter table public.sb_runs      enable row level security;
revoke all on public.sb_snapshots from anon;
revoke all on public.sb_runs      from anon;

drop policy if exists "sb_snapshots: leer"   on public.sb_snapshots;
drop policy if exists "sb_snapshots: crear"  on public.sb_snapshots;
drop policy if exists "sb_snapshots: borrar" on public.sb_snapshots;
create policy "sb_snapshots: leer"   on public.sb_snapshots for select to authenticated using (public.is_member());
create policy "sb_snapshots: crear"  on public.sb_snapshots for insert to authenticated with check (public.is_member());
create policy "sb_snapshots: borrar" on public.sb_snapshots for delete to authenticated using (public.is_member());

drop policy if exists "sb_runs: leer"   on public.sb_runs;
drop policy if exists "sb_runs: crear"  on public.sb_runs;
drop policy if exists "sb_runs: borrar" on public.sb_runs;
create policy "sb_runs: leer"   on public.sb_runs for select to authenticated using (public.is_member());
create policy "sb_runs: crear"  on public.sb_runs for insert to authenticated with check (public.is_member());
create policy "sb_runs: borrar" on public.sb_runs for delete to authenticated using (public.is_member());
