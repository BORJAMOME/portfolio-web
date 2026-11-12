-- ═══════════════════════════════════════════════════════════════════════════
-- SANCHO · acceso del asistente personal al área privada
-- Requiere area-privada.sql y las tablas de cada módulo. Se ejecuta en Supabase →
-- SQL Editor. Es idempotente. Revertir con sancho-acceso-rollback.sql.
--
-- Qué hace:
--   · Tabla `agents` (usuarios que son agentes, hoy solo SANCHO) y función `is_sancho()`.
--   · En cada tabla del área privada: políticas NUEVAS para el agente.
--       - leer: todas las tablas listadas en `lectura`.
--       - crear y editar: solo las listadas en `escritura`.
--       - borrar: NINGUNA. La base de datos impide que SANCHO borre nada.
--   · Las políticas de Borja (is_member) no se tocan.
--   · El agente NO es miembro (`members`): no hereda el borrado ni nada más.
--
-- Orden:
--   1. Authentication → Users → Add user: borja.mora.mendez+sancho@gmail.com
--      (contraseña larga y única, "Auto Confirm User").
--   2. Ejecutar este archivo: crea las políticas y da de alta al agente si el usuario existe.
--
-- Al crear una tabla nueva en el área privada: añadirla a `lectura` (y a `escritura` si
-- SANCHO debe poder crear o editar) y volver a ejecutar este archivo.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.agents (
  user_id    uuid primary key references auth.users on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.agents enable row level security;
-- Sin políticas: nadie la lee ni la cambia por la API. Solo la usa is_sancho().

create or replace function public.is_sancho() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agents where user_id = (select auth.uid()))
$$;
revoke execute on function public.is_sancho() from public, anon;
grant  execute on function public.is_sancho() to authenticated;

do $$
declare
  t text;
  -- Todo lo que SANCHO puede consultar.
  lectura text[] := array[
    'items', 'agenda', 'calendar_events', 'calendar_sync', 'cm_docs',
    'cs_garments', 'cs_palettes', 'cs_outfits', 'cs_inspirations',
    'procesos', 'entrevistas', 'procesos_correo', 'links',
    'ii_interviews', 'ii_runs', 'ii_reports',
    'kb_proyectos', 'kb_tarjetas', 'kb_subtareas', 'kb_historial', 'kb_ajustes',
    'ap_opciones', 'portfolio', 'sb_notas', 'sb_snapshots', 'sb_runs',
    'ps_projects', 'ps_tasks', 'ps_settings', 'ps_activity',
    'ps_ideas', 'ps_notes', 'ps_deliverables'
  ];
  -- Lo que SANCHO puede crear y editar (siempre tras la aprobación de Borja en SANCHO).
  -- Fuera: historiales y ejecuciones que escriben triggers o funciones, sincronizaciones,
  -- y la inspiración de Color Studio (cada fila pertenece a su dueño).
  escritura text[] := array[
    'items', 'agenda', 'calendar_events', 'cm_docs',
    'cs_garments', 'cs_palettes', 'cs_outfits',
    'procesos', 'entrevistas', 'links',
    'kb_proyectos', 'kb_tarjetas', 'kb_subtareas', 'kb_ajustes',
    'portfolio', 'sb_notas',
    'ps_projects', 'ps_tasks', 'ps_ideas', 'ps_notes', 'ps_deliverables'
  ];
begin
  foreach t in array lectura loop
    if to_regclass('public.' || t) is null then
      raise notice 'sancho-acceso: la tabla % no existe, se omite', t;
      continue;
    end if;
    execute format('drop policy if exists "sancho: leer" on public.%I', t);
    execute format(
      'create policy "sancho: leer" on public.%I for select to authenticated using (public.is_sancho())', t);
  end loop;

  foreach t in array escritura loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "sancho: crear" on public.%I', t);
    execute format('drop policy if exists "sancho: editar" on public.%I', t);
    execute format(
      'create policy "sancho: crear" on public.%I for insert to authenticated with check (public.is_sancho())', t);
    execute format(
      'create policy "sancho: editar" on public.%I for update to authenticated using (public.is_sancho()) with check (public.is_sancho())', t);
  end loop;
end $$;

-- Alta del agente (no hace nada si el usuario aún no existe).
insert into public.agents (user_id, name)
select id, 'SANCHO' from auth.users where email = 'borja.mora.mendez+sancho@gmail.com'
on conflict (user_id) do nothing;

-- Comprobación: debe devolver 1 fila.
select a.name, u.email, a.created_at
from public.agents a join auth.users u on u.id = a.user_id;
