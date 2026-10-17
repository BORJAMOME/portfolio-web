-- ═══════════════════════════════════════════════
-- supabase/kanban.sql: Centro de trabajo de «Hoy» (proyectos, tarjetas, subtareas, historial, ajustes)
-- ───────────────────────────────────────────────
-- Requiere area-privada.sql (is_member) y entrevistas.sql (touch_updated_at).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
-- Reversión: supabase/kanban-rollback.sql
--
-- Modelo:
--   kb_proyectos  → un resultado que quiero conseguir (objetivo, estado, prioridad)
--   kb_tarjetas   → idea o tarea; estado = columna del tablero; posicion = orden dentro de la columna
--   kb_subtareas  → pasos pequeños de una tarjeta
--   kb_historial  → cambios de estado/archivo (los escribe un trigger, no la web)
--   kb_ajustes    → límites WIP, capacidad diaria y resultado principal del día
-- ═══════════════════════════════════════════════

create table if not exists public.kb_proyectos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (char_length(titulo) between 1 and 160),
  objetivo     text check (char_length(objetivo) <= 1000),
  descripcion  text check (char_length(descripcion) <= 4000),
  estado       text not null default 'activo' check (estado in ('activo', 'pausado', 'hecho', 'archivado')),
  prioridad    smallint not null default 2 check (prioridad between 1 and 4),   -- 1 baja · 2 normal · 3 alta · 4 urgente
  fecha_inicio date,
  fecha_objetivo date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.kb_tarjetas (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null default 'tarea' check (tipo in ('idea', 'tarea')),
  titulo        text not null check (char_length(titulo) between 1 and 200),
  estado        text not null default 'pendiente' check (estado in ('ideas', 'pendiente', 'en_curso', 'revision', 'hecho')),
  posicion      double precision not null default 0,
  proyecto_id   uuid references public.kb_proyectos on delete set null,
  prioridad     smallint not null default 2 check (prioridad between 1 and 4),
  fecha_limite  date,
  esfuerzo      smallint check (esfuerzo between 1 and 3),                        -- 1 ≤1 h · 2 ½ día · 3 varios días
  etiquetas     text[] not null default '{}' check (cardinality(etiquetas) <= 8),
  bloqueada     boolean not null default false,
  bloqueo       text check (char_length(bloqueo) <= 300),
  siguiente_paso text check (char_length(siguiente_paso) <= 300),
  notas         text check (char_length(notas) <= 8000),
  aprendizaje   text check (char_length(aprendizaje) <= 2000),
  hoy_fecha     date,                                                              -- día para el que la he elegido (selección manual)
  archivada_en  timestamptz,
  completada_en timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists kb_tarjetas_col_idx on public.kb_tarjetas (estado, posicion) where archivada_en is null;
create index if not exists kb_tarjetas_proy_idx on public.kb_tarjetas (proyecto_id);
create index if not exists kb_tarjetas_hoy_idx on public.kb_tarjetas (hoy_fecha) where hoy_fecha is not null;

create table if not exists public.kb_subtareas (
  id         uuid primary key default gen_random_uuid(),
  tarjeta_id uuid not null references public.kb_tarjetas on delete cascade,
  titulo     text not null check (char_length(titulo) between 1 and 200),
  hecho      boolean not null default false,
  posicion   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists kb_subtareas_tarjeta_idx on public.kb_subtareas (tarjeta_id, posicion);

create table if not exists public.kb_historial (
  id         bigint generated always as identity primary key,
  tarjeta_id uuid not null references public.kb_tarjetas on delete cascade,
  tipo       text not null,                       -- creada · estado · archivada · restaurada
  de         text,
  a          text,
  created_at timestamptz not null default now()
);
create index if not exists kb_historial_tarjeta_idx on public.kb_historial (tarjeta_id, created_at desc);

create table if not exists public.kb_ajustes (
  clave text primary key check (char_length(clave) <= 60),
  valor jsonb not null,
  updated_at timestamptz not null default now()
);

-- ─── Triggers: fechas y historial ───
drop trigger if exists kb_proyectos_touch on public.kb_proyectos;
create trigger kb_proyectos_touch before update on public.kb_proyectos
  for each row execute function public.touch_updated_at();
drop trigger if exists kb_tarjetas_touch on public.kb_tarjetas;
create trigger kb_tarjetas_touch before update on public.kb_tarjetas
  for each row execute function public.touch_updated_at();

-- BEFORE para poder fijar completada_en; el historial referencia la tarjeta, que ya existe en UPDATE.
-- En INSERT el historial necesita que la fila exista: se usa un trigger AFTER aparte.
create or replace function public.kb_tarjetas_log_insert() returns trigger
language plpgsql as $$
begin
  insert into public.kb_historial (tarjeta_id, tipo, a) values (new.id, 'creada', new.estado);
  return new;
end $$;

create or replace function public.kb_tarjetas_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.estado = 'hecho' and new.completada_en is null then new.completada_en := now(); end if;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    insert into public.kb_historial (tarjeta_id, tipo, de, a) values (new.id, 'estado', old.estado, new.estado);
    new.completada_en := case when new.estado = 'hecho' then now() else null end;
  end if;
  if new.archivada_en is distinct from old.archivada_en then
    insert into public.kb_historial (tarjeta_id, tipo) values (new.id, case when new.archivada_en is null then 'restaurada' else 'archivada' end);
  end if;
  return new;
end $$;

drop trigger if exists kb_tarjetas_before on public.kb_tarjetas;
create trigger kb_tarjetas_before before insert or update on public.kb_tarjetas
  for each row execute function public.kb_tarjetas_before();
drop trigger if exists kb_tarjetas_after_insert on public.kb_tarjetas;
create trigger kb_tarjetas_after_insert after insert on public.kb_tarjetas
  for each row execute function public.kb_tarjetas_log_insert();

-- ─── RLS: solo el miembro (mismo patrón que agenda) ───
do $$
declare t text;
begin
  foreach t in array array['kb_proyectos', 'kb_tarjetas', 'kb_subtareas', 'kb_historial', 'kb_ajustes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "%1$s: leer" on public.%1$I', t);
    execute format('create policy "%1$s: leer" on public.%1$I for select to authenticated using (public.is_member())', t);
    if t <> 'kb_historial' then   -- el historial lo escribe el trigger (security definer abajo); la web solo lo lee
      execute format('drop policy if exists "%1$s: crear" on public.%1$I', t);
      execute format('drop policy if exists "%1$s: editar" on public.%1$I', t);
      execute format('drop policy if exists "%1$s: borrar" on public.%1$I', t);
      execute format('create policy "%1$s: crear" on public.%1$I for insert to authenticated with check (public.is_member())', t);
      execute format('create policy "%1$s: editar" on public.%1$I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
      execute format('create policy "%1$s: borrar" on public.%1$I for delete to authenticated using (public.is_member())', t);
    end if;
  end loop;
end $$;

-- Los triggers escriben en kb_historial con los permisos de quien los define, no del usuario.
alter function public.kb_tarjetas_before() security definer set search_path = public;
alter function public.kb_tarjetas_log_insert() security definer set search_path = public;

-- ─── Ajustes iniciales ───
insert into public.kb_ajustes (clave, valor) values
  ('wip', '{"en_curso": 3, "revision": 3}'),
  ('capacidad', '{"hoy": 3}')
on conflict do nothing;
