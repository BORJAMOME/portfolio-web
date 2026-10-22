-- ═══════════════════════════════════════════════
-- supabase/studio.sql: Studio de proyectos (proyectos, tareas con subtareas, ajustes y actividad)
-- ───────────────────────────────────────────────
-- Requiere area-privada.sql (is_member) y entrevistas.sql (touch_updated_at).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
-- Reversión: supabase/studio-rollback.sql
-- Independiente del Centro de trabajo de «Hoy» (kb_*): no lee ni escribe esas tablas.
--
-- Modelo (hito 1):
--   ps_projects  → un proyecto: objetivo, alcance, fase (stage) y estado (status) son cosas distintas
--   ps_tasks     → tarea del tablero; parent_id la convierte en subtarea (un solo nivel)
--   ps_settings  → límites WIP
--   ps_activity  → cambios relevantes; los escribe un trigger, la web solo los lee
-- Las ideas, notas, hitos, entregables, relaciones y coordenadas del lienzo llegarán en hitos posteriores
-- con sus propias tablas (el lienzo guardará x/y aparte: mover una nota no cambia el orden del tablero).
-- ═══════════════════════════════════════════════

create table if not exists public.ps_projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 160),
  kind        text check (kind in ('powerbi', 'analytics', 'sql', 'python', 'ml', 'streamlit', 'ux', 'portfolio', 'experiment')),
  goal        text check (char_length(goal) <= 1000),
  scope       text check (char_length(scope) <= 4000),
  stage       text not null default 'capture' check (stage in ('capture', 'explore', 'define', 'plan', 'build', 'validate', 'publish')),
  status      text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  priority    smallint not null default 2 check (priority between 1 and 4),      -- 1 baja · 2 normal · 3 alta · 4 urgente
  next_action text check (char_length(next_action) <= 300),
  target_date date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ps_projects_status_idx on public.ps_projects (status);

create table if not exists public.ps_tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references public.ps_projects on delete cascade,          -- null = tarea suelta
  parent_id      uuid references public.ps_tasks on delete cascade,             -- no null = subtarea
  title          text not null check (char_length(title) between 1 and 200),
  board_status   text not null default 'inbox' check (board_status in ('inbox', 'ready', 'in_progress', 'review', 'done')),
  position       double precision not null default 0,
  priority       smallint not null default 2 check (priority between 1 and 4),
  due_date       date,
  blocked        boolean not null default false,
  blocked_reason text check (char_length(blocked_reason) <= 300),
  next_step      text check (char_length(next_step) <= 300),
  notes          text check (char_length(notes) <= 8000),
  archived_at    timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index if not exists ps_tasks_col_idx on public.ps_tasks (board_status, position) where archived_at is null and parent_id is null;
create index if not exists ps_tasks_project_idx on public.ps_tasks (project_id);
create index if not exists ps_tasks_parent_idx on public.ps_tasks (parent_id, position);

create table if not exists public.ps_settings (
  key        text primary key check (char_length(key) <= 60),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ps_activity (
  id         bigint generated always as identity primary key,
  project_id uuid references public.ps_projects on delete cascade,
  task_id    uuid references public.ps_tasks on delete set null,
  kind       text not null,                   -- task_created · task_status · task_archived · task_restored · project_created · project_stage · project_status
  label      text,                            -- título en el momento del cambio (la tarea puede borrarse después)
  from_value text,
  to_value   text,
  created_at timestamptz not null default now()
);
create index if not exists ps_activity_recent_idx on public.ps_activity (created_at desc);

-- ─── Triggers ───
drop trigger if exists ps_projects_touch on public.ps_projects;
create trigger ps_projects_touch before update on public.ps_projects
  for each row execute function public.touch_updated_at();
drop trigger if exists ps_tasks_touch on public.ps_tasks;
create trigger ps_tasks_touch before update on public.ps_tasks
  for each row execute function public.touch_updated_at();

-- Validación y fechas de una tarea. Una subtarea hereda el proyecto de su padre y el padre no puede ser subtarea.
create or replace function public.ps_tasks_before() returns trigger
language plpgsql as $$
declare par record;
begin
  if new.parent_id is not null then
    select project_id, parent_id into par from public.ps_tasks where id = new.parent_id;
    if not found then raise exception 'La tarea padre no existe'; end if;
    if par.parent_id is not null then raise exception 'Las subtareas solo tienen un nivel'; end if;
    new.project_id := par.project_id;
  end if;
  if tg_op = 'INSERT' then
    if new.board_status = 'done' and new.completed_at is null then new.completed_at := now(); end if;
    return new;
  end if;
  if new.board_status is distinct from old.board_status then
    new.completed_at := case when new.board_status = 'done' then now() else null end;
    if new.parent_id is null then
      insert into public.ps_activity (project_id, task_id, kind, label, from_value, to_value)
      values (new.project_id, new.id, 'task_status', new.title, old.board_status, new.board_status);
    end if;
  end if;
  if new.archived_at is distinct from old.archived_at and new.parent_id is null then
    insert into public.ps_activity (project_id, task_id, kind, label)
    values (new.project_id, new.id, case when new.archived_at is null then 'task_restored' else 'task_archived' end, new.title);
  end if;
  return new;
end $$;

create or replace function public.ps_tasks_after_insert() returns trigger
language plpgsql as $$
begin
  if new.parent_id is null then
    insert into public.ps_activity (project_id, task_id, kind, label, to_value)
    values (new.project_id, new.id, 'task_created', new.title, new.board_status);
  end if;
  return new;
end $$;

create or replace function public.ps_projects_log() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ps_activity (project_id, kind, label, to_value) values (new.id, 'project_created', new.title, new.stage);
  else
    if new.stage is distinct from old.stage then
      insert into public.ps_activity (project_id, kind, label, from_value, to_value) values (new.id, 'project_stage', new.title, old.stage, new.stage);
    end if;
    if new.status is distinct from old.status then
      insert into public.ps_activity (project_id, kind, label, from_value, to_value) values (new.id, 'project_status', new.title, old.status, new.status);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ps_tasks_before on public.ps_tasks;
create trigger ps_tasks_before before insert or update on public.ps_tasks
  for each row execute function public.ps_tasks_before();
drop trigger if exists ps_tasks_after_insert on public.ps_tasks;
create trigger ps_tasks_after_insert after insert on public.ps_tasks
  for each row execute function public.ps_tasks_after_insert();
drop trigger if exists ps_projects_log on public.ps_projects;
create trigger ps_projects_log after insert or update on public.ps_projects
  for each row execute function public.ps_projects_log();

-- Los triggers escriben en ps_activity con los permisos de quien los define, no del usuario.
alter function public.ps_tasks_before() security definer set search_path = public;
alter function public.ps_tasks_after_insert() security definer set search_path = public;
alter function public.ps_projects_log() security definer set search_path = public;

-- ─── RLS: solo el miembro (mismo patrón que kanban.sql y agenda.sql) ───
do $$
declare t text;
begin
  foreach t in array array['ps_projects', 'ps_tasks', 'ps_settings', 'ps_activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "%1$s: leer" on public.%1$I', t);
    execute format('create policy "%1$s: leer" on public.%1$I for select to authenticated using (public.is_member())', t);
    if t <> 'ps_activity' then   -- la actividad la escriben los triggers; la web solo la lee
      execute format('drop policy if exists "%1$s: crear" on public.%1$I', t);
      execute format('drop policy if exists "%1$s: editar" on public.%1$I', t);
      execute format('drop policy if exists "%1$s: borrar" on public.%1$I', t);
      execute format('create policy "%1$s: crear" on public.%1$I for insert to authenticated with check (public.is_member())', t);
      execute format('create policy "%1$s: editar" on public.%1$I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
      execute format('create policy "%1$s: borrar" on public.%1$I for delete to authenticated using (public.is_member())', t);
    end if;
  end loop;
end $$;

-- ─── Ajustes iniciales ───
insert into public.ps_settings (key, value) values
  ('wip', '{"in_progress": 3, "review": 3}')
on conflict do nothing;
