-- ═══════════════════════════════════════════════
-- supabase/second-brain-notas.sql: tu información en Second Brain
-- ───────────────────────────────────────────────
-- Requiere supabase/area-privada.sql (usa public.is_member()). Se ejecuta UNA vez en
-- Supabase → SQL Editor. Es idempotente.
--
-- Cada fila es lo que TÚ añades sobre el mapa, separado de lo que calcula el motor:
--   · sobre un elemento del análisis (node_id = 'c:sql', 'k:modelado', 'p:…'): tu valoración,
--     una descripción propia, notas, enlaces de evidencia y relaciones que quieras añadir;
--   · un elemento nuevo (es_propio = true, node_id = 'u:…'): un concepto, técnica o proyecto
--     que el análisis no ha detectado.
-- El motor nunca escribe aquí y la página siempre lo muestra como «añadido por ti».
-- ═══════════════════════════════════════════════

create table if not exists public.sb_notas (
  id          uuid primary key default gen_random_uuid(),
  node_id     text not null unique check (node_id ~ '^[a-z0-9][a-z0-9:_.-]{0,79}$'),
  es_propio   boolean not null default false,
  label       text check (char_length(label) between 1 and 120),
  tipo        text check (tipo in ('tecnologia', 'concepto', 'tecnica', 'proyecto', 'competencia')),
  area        text check (char_length(area) <= 40),
  descripcion text check (char_length(descripcion) <= 1200),
  nota        text check (char_length(nota) <= 4000),
  valoracion  text check (valoracion in ('domino', 'practicando', 'aprender', 'brecha')),
  enlaces     text[] not null default '{}' check (cardinality(enlaces) <= 10),
  relacionados text[] not null default '{}' check (cardinality(relacionados) <= 10),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users on delete set null,
  -- un elemento propio necesita nombre, tipo y área
  check (not es_propio or (label is not null and tipo is not null and area is not null))
);

create or replace function public.sb_notas_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sb_notas_touch on public.sb_notas;
create trigger sb_notas_touch before update on public.sb_notas
  for each row execute function public.sb_notas_touch();

alter table public.sb_notas enable row level security;
revoke all on public.sb_notas from anon;

drop policy if exists "sb_notas: leer"   on public.sb_notas;
drop policy if exists "sb_notas: crear"  on public.sb_notas;
drop policy if exists "sb_notas: editar" on public.sb_notas;
drop policy if exists "sb_notas: borrar" on public.sb_notas;
create policy "sb_notas: leer"   on public.sb_notas for select to authenticated using (public.is_member());
create policy "sb_notas: crear"  on public.sb_notas for insert to authenticated with check (public.is_member());
create policy "sb_notas: editar" on public.sb_notas for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "sb_notas: borrar" on public.sb_notas for delete to authenticated using (public.is_member());
