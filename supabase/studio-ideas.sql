-- ═══════════════════════════════════════════════
-- supabase/studio-ideas.sql: Studio (hito 2): ideas, notas e investigación, entregables
-- ───────────────────────────────────────────────
-- Requiere supabase/studio.sql (ps_projects, ps_activity) y entrevistas.sql (touch_updated_at).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
-- Reversión: supabase/studio-ideas-rollback.sql
--
-- Modelo:
--   ps_ideas        → idea capturada sin estructura; se agrupa con `topic`, se clasifica con `kind` y `status`
--                     y se conecta a un proyecto con `project_id` (o se convierte en uno con ps_convert_idea)
--   ps_notes        → notas, investigación, hipótesis, decisiones y referencias de un proyecto
--   ps_deliverables → repositorios, documentos, dashboards y apps de un proyecto
-- Las relaciones entre ideas y las dependencias llegarán con la hoja de ruta (tabla propia).
-- ═══════════════════════════════════════════════

create table if not exists public.ps_ideas (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 200),
  body       text check (char_length(body) <= 4000),
  kind       text check (kind in ('powerbi', 'analytics', 'sql', 'python', 'ml', 'streamlit', 'ux', 'portfolio', 'experiment')),
  topic      text check (char_length(topic) between 1 and 60),                -- grupo libre; null = sin grupo
  status     text not null default 'new' check (status in ('new', 'exploring', 'converted', 'discarded')),
  project_id uuid references public.ps_projects on delete set null,           -- proyecto al que se conecta o en el que se convirtió
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ps_ideas_status_idx on public.ps_ideas (status, created_at desc);
create index if not exists ps_ideas_project_idx on public.ps_ideas (project_id);

create table if not exists public.ps_notes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ps_projects on delete cascade,
  kind       text not null default 'note' check (kind in ('note', 'research', 'hypothesis', 'decision', 'reference')),
  title      text not null check (char_length(title) between 1 and 200),
  body       text check (char_length(body) <= 8000),
  url        text check (url is null or (char_length(url) <= 500 and url ~* '^https?://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ps_notes_project_idx on public.ps_notes (project_id, created_at desc);

create table if not exists public.ps_deliverables (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ps_projects on delete cascade,
  kind       text not null default 'other' check (kind in ('repo', 'document', 'dashboard', 'app', 'other')),
  title      text not null check (char_length(title) between 1 and 200),
  url        text check (url is null or (char_length(url) <= 500 and url ~* '^https?://')),
  status     text not null default 'planned' check (status in ('planned', 'in_progress', 'delivered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ps_deliverables_project_idx on public.ps_deliverables (project_id, created_at);

-- ─── Triggers ───
drop trigger if exists ps_ideas_touch on public.ps_ideas;
create trigger ps_ideas_touch before update on public.ps_ideas
  for each row execute function public.touch_updated_at();
drop trigger if exists ps_notes_touch on public.ps_notes;
create trigger ps_notes_touch before update on public.ps_notes
  for each row execute function public.touch_updated_at();
drop trigger if exists ps_deliverables_touch on public.ps_deliverables;
create trigger ps_deliverables_touch before update on public.ps_deliverables
  for each row execute function public.touch_updated_at();

-- Actividad de las ideas (la escribe el trigger, como la de tareas y proyectos).
create or replace function public.ps_ideas_log() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ps_activity (project_id, kind, label) values (new.project_id, 'idea_created', new.title);
  elsif new.status = 'converted' and old.status is distinct from 'converted' then
    insert into public.ps_activity (project_id, kind, label) values (new.project_id, 'idea_converted', new.title);
  end if;
  return new;
end $$;
alter function public.ps_ideas_log() security definer set search_path = public;
drop trigger if exists ps_ideas_log on public.ps_ideas;
create trigger ps_ideas_log after insert or update on public.ps_ideas
  for each row execute function public.ps_ideas_log();

-- Convierte una idea en proyecto de forma atómica: crea el proyecto, conecta la idea y la marca como convertida.
-- security invoker: las políticas RLS de abajo siguen aplicándose a quien la llama.
create or replace function public.ps_convert_idea(p_idea uuid) returns public.ps_projects
language plpgsql as $$
declare i public.ps_ideas; p public.ps_projects;
begin
  select * into i from public.ps_ideas where id = p_idea for update;
  if not found then raise exception 'La idea no existe'; end if;
  if i.status = 'converted' then raise exception 'La idea ya se convirtió en proyecto'; end if;
  insert into public.ps_projects (title, kind, goal) values (left(i.title, 160), i.kind, left(i.body, 1000)) returning * into p;
  update public.ps_ideas set status = 'converted', project_id = p.id where id = p_idea;
  return p;
end $$;
revoke all on function public.ps_convert_idea(uuid) from public, anon;
grant execute on function public.ps_convert_idea(uuid) to authenticated;

-- ─── RLS: solo el miembro (mismo patrón que studio.sql) ───
do $$
declare t text;
begin
  foreach t in array array['ps_ideas', 'ps_notes', 'ps_deliverables'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "%1$s: leer" on public.%1$I', t);
    execute format('drop policy if exists "%1$s: crear" on public.%1$I', t);
    execute format('drop policy if exists "%1$s: editar" on public.%1$I', t);
    execute format('drop policy if exists "%1$s: borrar" on public.%1$I', t);
    execute format('create policy "%1$s: leer" on public.%1$I for select to authenticated using (public.is_member())', t);
    execute format('create policy "%1$s: crear" on public.%1$I for insert to authenticated with check (public.is_member())', t);
    execute format('create policy "%1$s: editar" on public.%1$I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('create policy "%1$s: borrar" on public.%1$I for delete to authenticated using (public.is_member())', t);
  end loop;
end $$;
