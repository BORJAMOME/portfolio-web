-- ═══════════════════════════════════════════════
-- supabase/agenda.sql — elementos propios del Calendario (eventos, bloques de foco, tareas)
-- ───────────────────────────────────────────────
-- Requiere area-privada.sql (is_member), entrevistas.sql (touch_updated_at) y opciones.sql
-- (las categorías son el grupo «agenda.categoria» de public.ap_opciones y se gestionan
-- en la pestaña «Configuración»).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
--
-- Google Calendar sigue siendo de solo lectura (calendar_events). Esto es lo que se crea,
-- mueve y edita desde la propia web:
--   evento → una cita o reunión propia (inicio y fin obligatorios)
--   foco   → un bloque de tiempo reservado para trabajar en algo (inicio y fin obligatorios)
--   tarea  → algo por hacer; la fecha es opcional y se marca como hecha
-- ═══════════════════════════════════════════════

create table if not exists public.agenda (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null default 'evento' check (tipo in ('evento', 'foco', 'tarea')),
  titulo      text not null check (char_length(titulo) between 1 and 200),
  inicio      timestamptz,
  fin         timestamptz,
  todo_el_dia boolean not null default false,
  hecho       boolean not null default false,
  prioridad   smallint check (prioridad between 1 and 3),             -- 1 alta · 2 media · 3 baja
  categoria   text check (char_length(categoria) <= 60),
  lugar       text check (char_length(lugar) <= 300),
  enlace      text check (enlace ~* '^https?://' and char_length(enlace) <= 2000),
  notas       text check (char_length(notas) <= 4000),
  created_by  uuid default auth.uid() references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint agenda_horario check (
    (tipo = 'tarea' and (fin is null or (inicio is not null and fin >= inicio)))
    or (tipo <> 'tarea' and inicio is not null and fin is not null and fin > inicio)
  )
);
create index if not exists agenda_inicio_idx on public.agenda (inicio);
create index if not exists agenda_tareas_idx on public.agenda (hecho) where tipo = 'tarea';

drop trigger if exists agenda_touch on public.agenda;
create trigger agenda_touch before update on public.agenda
  for each row execute function public.touch_updated_at();

alter table public.agenda enable row level security;
revoke all on public.agenda from anon;
drop policy if exists "agenda: leer"   on public.agenda;
drop policy if exists "agenda: crear"  on public.agenda;
drop policy if exists "agenda: editar" on public.agenda;
drop policy if exists "agenda: borrar" on public.agenda;
create policy "agenda: leer"   on public.agenda for select to authenticated using (public.is_member());
create policy "agenda: crear"  on public.agenda for insert to authenticated with check (public.is_member());
create policy "agenda: editar" on public.agenda for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "agenda: borrar" on public.agenda for delete to authenticated using (public.is_member());

-- ─── Categorías iniciales (configurables en «Configuración») ───
insert into public.ap_opciones (grupo, valor, posicion)
select 'agenda.categoria', v, ord
from unnest(array['Búsqueda de empleo', 'Formación', 'Portfolio', 'Personal']) with ordinality as t(v, ord)
on conflict do nothing;
