-- ═══════════════════════════════════════════════
-- supabase/color-studio.sql: Color Studio (armario, paletas y outfits)
-- ───────────────────────────────────────────────
-- Requiere area-privada.sql (is_member). Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
-- Reversión: supabase/color-studio-rollback.sql (borra datos y fotos).
--
-- Modelo:
--   cs_garments → una prenda real: categoría, color principal, secundarios (HEX normalizado #RRGGBB),
--                 reparto opcional de sus colores y la ruta de su foto en el bucket privado «armario»
--   cs_palettes → una paleta ordenada: cada color guarda el valor tal y como se registró (original),
--                 el HEX normalizado, nombre, papel y nota; más la procedencia (tipo, título, URL, notas)
--   cs_outfits  → un conjunto guardado: prendas por hueco con su peso de superficie, paleta de referencia
--                 y, solo si se ajustó a mano, la distribución editada
-- No se guarda lo que se calcula de forma fiable (familia cromática, distribución estimada, recomendaciones).
-- La procedencia va en la propia paleta: para un uso personal no compensa una tabla de fuentes aparte.
-- ═══════════════════════════════════════════════

-- HEX normalizado: lo escribe la web (color-studio/engine.js) y la base lo exige
create or replace function public.cs_is_hex(v text) returns boolean
language sql immutable as $$ select v ~ '^#[0-9A-F]{6}$' $$;

-- Colores de una paleta: lista de 1 a 12 objetos, cada uno con un hex normalizado
create or replace function public.cs_valid_palette_colors(c jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(c) = 'array'
     and jsonb_array_length(c) between 1 and 12
     and not exists (
       select 1 from jsonb_array_elements(c) e
       where jsonb_typeof(e) <> 'object' or not public.cs_is_hex(e->>'hex')
     )
$$;

-- Prendas de un outfit: lista de hasta 12 objetos con hueco y peso no negativo
create or replace function public.cs_valid_outfit_items(c jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(c) = 'array'
     and jsonb_array_length(c) <= 12
     and not exists (
       select 1 from jsonb_array_elements(c) e
       where jsonb_typeof(e) <> 'object'
          or (e->>'slot') is null
          or coalesce((e->>'weight')::numeric, 0) < 0
          or ((e->>'garment_id') is null and not public.cs_is_hex(e->>'hex'))
     )
$$;

create table if not exists public.cs_garments (
  id               uuid primary key default gen_random_uuid(),
  name             text check (char_length(name) <= 120),
  category         text not null check (category in ('camisetas', 'camisas', 'jerseis', 'chaquetas', 'pantalones', 'vaqueros', 'calzado', 'calcetines', 'accesorios')),
  subcategory      text check (char_length(subcategory) <= 80),
  image_path       text unique check (char_length(image_path) <= 300),          -- ruta en el bucket «armario»
  primary_color    text not null check (public.cs_is_hex(primary_color)),
  secondary_colors text[] not null default '{}' check (cardinality(secondary_colors) <= 6),
  color_shares     numeric[] check (color_shares is null or cardinality(color_shares) <= 7), -- reparto [principal, secundarios…]; null = domina el principal
  pattern          text not null default 'liso' check (pattern in ('liso', 'rayas', 'cuadros', 'estampado', 'otro')),
  material         text check (char_length(material) <= 80),
  notes            text check (char_length(notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists cs_garments_category_idx on public.cs_garments (category);

-- Los secundarios también tienen que ser HEX normalizados (un check no admite subconsultas)
create or replace function public.cs_garments_before() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from unnest(new.secondary_colors) s where not public.cs_is_hex(s)) then
    raise exception 'Los colores secundarios tienen que ser HEX #RRGGBB';
  end if;
  if new.color_shares is not null and exists (select 1 from unnest(new.color_shares) s where s < 0) then
    raise exception 'El reparto de colores no admite valores negativos';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists cs_garments_before on public.cs_garments;
create trigger cs_garments_before before insert or update on public.cs_garments
  for each row execute function public.cs_garments_before();

create table if not exists public.cs_palettes (
  id           uuid primary key default gen_random_uuid(),
  name         text check (char_length(name) <= 120),
  colors       jsonb not null check (public.cs_valid_palette_colors(colors)),  -- [{ original, hex, name, role, note }]
  tags         text[] not null default '{}' check (cardinality(tags) <= 20),
  source_type  text not null default 'own' check (source_type in ('own', 'book', 'web', 'photo', 'other')),
  source_title text check (char_length(source_title) <= 200),
  source_url   text check (source_url is null or (char_length(source_url) <= 600 and source_url ~* '^https?://')),
  source_notes text check (char_length(source_notes) <= 2000),
  notes        text check (char_length(notes) <= 2000),
  is_favorite  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists cs_palettes_recent_idx on public.cs_palettes (updated_at desc);

create table if not exists public.cs_outfits (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(name) between 1 and 120),
  items                 jsonb not null default '[]' check (public.cs_valid_outfit_items(items)),  -- [{ slot, garment_id | hex, weight }]
  palette_id            uuid references public.cs_palettes on delete set null,
  distribution_override jsonb check (distribution_override is null or jsonb_typeof(distribution_override) = 'array'),
  occasion              text check (char_length(occasion) <= 120),
  formality             text check (formality in ('formal', 'smart', 'casual')),
  notes                 text check (char_length(notes) <= 2000),
  is_favorite           boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists cs_outfits_recent_idx on public.cs_outfits (updated_at desc);

create or replace function public.cs_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists cs_palettes_touch on public.cs_palettes;
create trigger cs_palettes_touch before update on public.cs_palettes for each row execute function public.cs_touch();
drop trigger if exists cs_outfits_touch on public.cs_outfits;
create trigger cs_outfits_touch before update on public.cs_outfits for each row execute function public.cs_touch();

-- ─── RLS: solo el miembro (mismo patrón que studio.sql) ───
do $$
declare t text;
begin
  foreach t in array array['cs_garments', 'cs_palettes', 'cs_outfits'] loop
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

-- ─── FOTOS (Storage) ───
-- Bucket privado y solo de imágenes: la web reduce cada foto (máx. 1600 px, sin EXIF ni ubicación)
-- antes de subirla; este límite es la segunda barrera.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('armario', 'armario', false, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "armario: leer"   on storage.objects;
drop policy if exists "armario: subir"  on storage.objects;
drop policy if exists "armario: borrar" on storage.objects;
create policy "armario: leer"   on storage.objects for select to authenticated
  using (bucket_id = 'armario' and public.is_member());
create policy "armario: subir"  on storage.objects for insert to authenticated
  with check (bucket_id = 'armario' and public.is_member());
create policy "armario: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'armario' and public.is_member());
