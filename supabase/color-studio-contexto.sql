-- ═══════════════════════════════════════════════
-- supabase/color-studio-contexto.sql: Color Studio · contexto de las prendas y uso real
-- ───────────────────────────────────────────────
-- Requiere color-studio.sql (cs_garments, cs_palettes, is_member). Idempotente: se puede ejecutar entero otra vez.
-- Solo AÑADE: dos columnas opcionales en cs_garments y la tabla cs_wear. No modifica ni borra datos.
-- Reversión: supabase/color-studio-contexto-rollback.sql (borra el registro de uso y las dos columnas).
--
--   cs_garments.seasons    → temporadas en las que se lleva la prenda (vacío = todo el año)
--   cs_garments.formality  → formalidad de la prenda (null = sin indicar: vale para cualquier ocasión)
--   cs_wear                → «Lo he llevado» y «Me gusta» de un conjunto (sus prendas y la combinación de referencia):
--                            las sugerencias suben lo que te gusta y bajan lo que llevaste hace poco
-- ═══════════════════════════════════════════════

alter table public.cs_garments add column if not exists seasons text[] not null default '{}';
alter table public.cs_garments add column if not exists formality text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cs_garments_seasons_check') then
    alter table public.cs_garments add constraint cs_garments_seasons_check
      check (cardinality(seasons) <= 4 and seasons <@ array['primavera', 'verano', 'otono', 'invierno']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cs_garments_formality_check') then
    alter table public.cs_garments add constraint cs_garments_formality_check
      check (formality is null or formality in ('formal', 'smart', 'casual'));
  end if;
end $$;

create table if not exists public.cs_wear (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('worn', 'liked')),          -- worn = lo he llevado · liked = me gusta
  garment_ids uuid[] not null check (cardinality(garment_ids) between 1 and 8),
  palette_id  uuid references public.cs_palettes on delete set null,
  worn_on     date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists cs_wear_recent_idx on public.cs_wear (worn_on desc);

alter table public.cs_wear enable row level security;
revoke all on public.cs_wear from anon;
drop policy if exists "cs_wear: leer" on public.cs_wear;
drop policy if exists "cs_wear: crear" on public.cs_wear;
drop policy if exists "cs_wear: borrar" on public.cs_wear;
create policy "cs_wear: leer" on public.cs_wear for select to authenticated using (public.is_member());
create policy "cs_wear: crear" on public.cs_wear for insert to authenticated with check (public.is_member());
create policy "cs_wear: borrar" on public.cs_wear for delete to authenticated using (public.is_member());
