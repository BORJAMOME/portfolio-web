-- ═══════════════════════════════════════════════
-- supabase/studio-roadmap.sql: Studio (hito 3): hitos, hoja de ruta y relaciones
-- ───────────────────────────────────────────────
-- Requiere supabase/studio.sql y supabase/studio-ideas.sql (ps_projects, ps_ideas) y entrevistas.sql (touch_updated_at).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
-- Reversión: supabase/studio-roadmap-rollback.sql
--
-- Modelo:
--   ps_milestones → hito de un proyecto, con fecha objetivo y estado
--   ps_links      → relación entre dos elementos del MISMO tipo (proyecto, hito o idea):
--                     depends_on = «A depende de B» (proyectos e hitos; sin ciclos)
--                     relates_to = «A se relaciona con B» (simétrica; proyectos, hitos e ideas)
-- Como un enlace apunta a tablas distintas no puede llevar claves foráneas: los triggers comprueban que los dos
-- extremos existen, impiden duplicados y ciclos, y borran los enlaces cuando se borra un extremo.
-- Las dependencias entre tareas no están en este hito.
-- ═══════════════════════════════════════════════

create table if not exists public.ps_milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.ps_projects on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  target_date date,                                                         -- null = aún sin fecha
  status      text not null default 'pending' check (status in ('pending', 'done')),
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ps_milestones_project_idx on public.ps_milestones (project_id, target_date);

create table if not exists public.ps_links (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('project', 'milestone', 'idea')),   -- tipo de AMBOS extremos
  from_id    uuid not null,
  to_id      uuid not null,
  rel        text not null check (rel in ('depends_on', 'relates_to')),
  created_at timestamptz not null default now(),
  check (from_id <> to_id),
  check (rel <> 'depends_on' or kind in ('project', 'milestone'))
);
create index if not exists ps_links_from_idx on public.ps_links (from_id);
create index if not exists ps_links_to_idx on public.ps_links (to_id);
create unique index if not exists ps_links_dep_uniq on public.ps_links (from_id, to_id) where rel = 'depends_on';
create unique index if not exists ps_links_rel_uniq on public.ps_links (least(from_id, to_id), greatest(from_id, to_id)) where rel = 'relates_to';

-- ─── Triggers ───
drop trigger if exists ps_milestones_touch on public.ps_milestones;
create trigger ps_milestones_touch before update on public.ps_milestones
  for each row execute function public.touch_updated_at();

create or replace function public.ps_milestones_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'done' and new.done_at is null then new.done_at := now(); end if;
  elsif new.status is distinct from old.status then
    new.done_at := case when new.status = 'done' then now() else null end;
  end if;
  return new;
end $$;
drop trigger if exists ps_milestones_before on public.ps_milestones;
create trigger ps_milestones_before before insert or update on public.ps_milestones
  for each row execute function public.ps_milestones_before();

create or replace function public.ps_entity_exists(p_kind text, p_id uuid) returns boolean
language sql stable as $$
  select case p_kind
    when 'project'   then exists (select 1 from public.ps_projects where id = p_id)
    when 'milestone' then exists (select 1 from public.ps_milestones where id = p_id)
    when 'idea'      then exists (select 1 from public.ps_ideas where id = p_id)
    else false end
$$;

create or replace function public.ps_links_before() returns trigger
language plpgsql as $$
declare cyc boolean;
begin
  if not public.ps_entity_exists(new.kind, new.from_id) or not public.ps_entity_exists(new.kind, new.to_id) then
    raise exception 'Uno de los elementos enlazados no existe';
  end if;
  if new.rel = 'depends_on' then
    -- A depende de B crea un ciclo si B ya depende (directa o indirectamente) de A
    with recursive r(id) as (
      select new.to_id
      union
      select l.to_id from public.ps_links l join r on l.from_id = r.id where l.rel = 'depends_on'
    )
    select exists (select 1 from r where id = new.from_id) into cyc;
    if cyc then raise exception 'La dependencia crearía un ciclo'; end if;
  end if;
  return new;
end $$;
drop trigger if exists ps_links_before on public.ps_links;
create trigger ps_links_before before insert on public.ps_links
  for each row execute function public.ps_links_before();

-- Al borrar un proyecto, un hito o una idea se borran sus enlaces (también cuando el borrado viene en cascada).
create or replace function public.ps_links_cleanup() returns trigger
language plpgsql as $$
begin
  delete from public.ps_links where from_id = old.id or to_id = old.id;
  return old;
end $$;
alter function public.ps_links_cleanup() security definer set search_path = public;
drop trigger if exists ps_links_cleanup on public.ps_projects;
create trigger ps_links_cleanup after delete on public.ps_projects for each row execute function public.ps_links_cleanup();
drop trigger if exists ps_links_cleanup on public.ps_milestones;
create trigger ps_links_cleanup after delete on public.ps_milestones for each row execute function public.ps_links_cleanup();
drop trigger if exists ps_links_cleanup on public.ps_ideas;
create trigger ps_links_cleanup after delete on public.ps_ideas for each row execute function public.ps_links_cleanup();

-- ─── RLS: solo el miembro (mismo patrón que studio.sql) ───
do $$
declare t text;
begin
  foreach t in array array['ps_milestones', 'ps_links'] loop
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
