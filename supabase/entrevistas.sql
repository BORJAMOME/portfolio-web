-- ═══════════════════════════════════════════════
-- supabase/entrevistas.sql — pestaña «Entrevistas» del área privada
-- ───────────────────────────────────────────────
-- Requiere haber ejecutado antes supabase/area-privada.sql (usa public.is_member()).
-- Se ejecuta UNA vez en Supabase → SQL Editor → New query → pegar → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Modelo
--   procesos    → una candidatura (empresa + puesto). Estado del proceso completo.
--   entrevistas → cada ronda dentro de un proceso: fase, cómo fue, qué preguntaron,
--                 resultado. calendar_uid la enlaza con un evento de calendar_events.
--
-- El análisis (embudo, tasas por fase y por fuente, calibración) lo calcula la
-- página con las dos tablas, que ya descarga para pintar la lista: a este volumen
-- (decenas o cientos de filas) es más rápido que pedir vistas agregadas aparte.
-- ═══════════════════════════════════════════════

-- ─── PROCESOS ───
create table if not exists public.procesos (
  id               uuid primary key default gen_random_uuid(),
  empresa          text not null check (char_length(empresa) between 1 and 160),
  puesto           text not null check (char_length(puesto) between 1 and 200),
  ubicacion        text check (char_length(ubicacion) <= 160),
  modalidad        text check (modalidad in ('presencial', 'hibrido', 'remoto')),
  fuente           text check (char_length(fuente) <= 60),
  url              text check (url ~* '^https?://' and char_length(url) <= 2000),
  fecha_aplicacion date not null default current_date,
  salario_min      integer check (salario_min >= 0),
  salario_max      integer check (salario_max >= 0),
  estado           text not null default 'activo'
                   check (estado in ('activo', 'oferta', 'aceptada', 'rechazado', 'descartado', 'sin_respuesta')),
  fecha_cierre     date,
  motivo_cierre    text check (char_length(motivo_cierre) <= 1000),
  notas            text check (char_length(notas) <= 5000),
  created_by       uuid default auth.uid() references auth.users on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint procesos_salario check (salario_min is null or salario_max is null or salario_min <= salario_max)
);
create index if not exists procesos_fecha_idx on public.procesos (fecha_aplicacion desc);

-- ─── ENTREVISTAS ───
create table if not exists public.entrevistas (
  id              uuid primary key default gen_random_uuid(),
  proceso_id      uuid not null references public.procesos(id) on delete cascade,
  fecha           timestamptz not null,
  fase            text not null default 'rrhh'
                  check (fase in ('rrhh', 'tecnica', 'caso', 'hiring_manager', 'cultural', 'final', 'otra')),
  formato         text check (formato in ('video', 'presencial', 'telefono')),
  duracion_min    smallint check (duracion_min between 1 and 600),
  entrevistadores text check (char_length(entrevistadores) <= 500),
  preparacion     smallint check (preparacion between 1 and 5),   -- cómo de preparado llegaba
  autovaloracion  smallint check (autovaloracion between 1 and 5), -- cómo creo que fue
  resultado       text not null default 'pendiente'
                  check (resultado in ('pendiente', 'superada', 'no_superada', 'cancelada')),
  preguntas       text check (char_length(preguntas) <= 10000),    -- una por línea
  bien            text check (char_length(bien) <= 4000),
  mejorar         text check (char_length(mejorar) <= 4000),
  feedback        text check (char_length(feedback) <= 4000),       -- lo que dijo la empresa
  calendar_uid    text check (char_length(calendar_uid) <= 1100),  -- uid|inicio de calendar_events
  created_by      uuid default auth.uid() references auth.users on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists entrevistas_proceso_idx on public.entrevistas (proceso_id);
create index if not exists entrevistas_fecha_idx   on public.entrevistas (fecha);

-- updated_at automático (misma función para las dos tablas)
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists procesos_touch on public.procesos;
create trigger procesos_touch before update on public.procesos
  for each row execute function public.touch_updated_at();
drop trigger if exists entrevistas_touch on public.entrevistas;
create trigger entrevistas_touch before update on public.entrevistas
  for each row execute function public.touch_updated_at();

-- ─── SEGURIDAD: solo miembros ───
alter table public.procesos    enable row level security;
alter table public.entrevistas enable row level security;
revoke all on public.procesos    from anon;
revoke all on public.entrevistas from anon;

drop policy if exists "procesos: leer"   on public.procesos;
drop policy if exists "procesos: crear"  on public.procesos;
drop policy if exists "procesos: editar" on public.procesos;
drop policy if exists "procesos: borrar" on public.procesos;
create policy "procesos: leer"   on public.procesos for select to authenticated using (public.is_member());
create policy "procesos: crear"  on public.procesos for insert to authenticated with check (public.is_member());
create policy "procesos: editar" on public.procesos for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "procesos: borrar" on public.procesos for delete to authenticated using (public.is_member());

drop policy if exists "entrevistas: leer"   on public.entrevistas;
drop policy if exists "entrevistas: crear"  on public.entrevistas;
drop policy if exists "entrevistas: editar" on public.entrevistas;
drop policy if exists "entrevistas: borrar" on public.entrevistas;
create policy "entrevistas: leer"   on public.entrevistas for select to authenticated using (public.is_member());
create policy "entrevistas: crear"  on public.entrevistas for insert to authenticated with check (public.is_member());
create policy "entrevistas: editar" on public.entrevistas for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "entrevistas: borrar" on public.entrevistas for delete to authenticated using (public.is_member());
