-- ═══════════════════════════════════════════════
-- supabase/color-studio-inspiracion.sql: Color Studio · Inspiración (outfits guardados de internet)
-- ───────────────────────────────────────────────
-- Requiere area-privada.sql (is_member), color-studio.sql (cs_is_hex, cs_touch, cs_palettes, bucket «armario»)
-- y opciones.sql (ap_opciones). Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente y no toca datos existentes.
-- Después, para que renombrar/eliminar estilos y colecciones en «Configuración» actualice también las referencias,
-- vuelve a ejecutar las dos funciones ap_opcion_renombrar y ap_opcion_eliminar de opciones.sql (solo esas dos:
-- el archivo entero vuelve a crear las opciones del Fichero que hayas borrado).
-- Reversión: supabase/color-studio-inspiracion-rollback.sql (borra las referencias; las fotos, desde Storage).
--
-- Modelo:
--   cs_inspirations → una referencia: imagen (y su miniatura) en el bucket privado «armario» bajo
--                     inspiracion/<usuario>/, enlace y fuente opcionales, clasificación (estilos y colecciones
--                     = texto de las listas «inspiracion.estilo» / «inspiracion.coleccion» de ap_opciones;
--                     temporadas = lista fija), favorito, valoración, notas y la paleta extraída.
--   palette (jsonb)  → [{ hex, weight, source }] en orden: weight = % estimado de presencia en los píxeles
--                     analizados (0–100), source = 'auto' (extracción) | 'manual' (corregido a mano).
--                     RGB, Lab y familia se derivan del HEX (color-studio/engine.js): no se guardan.
--   palette_status   → none (sin imagen o sin extraer) · auto (extraída, sin revisar) · reviewed (revisada o
--                     corregida) · failed (la extracción falló; la referencia se guarda igual).
--   image_hash       → huella perceptual (dHash de 64 bits) para avisar de duplicados; no identifica a nadie.
-- A diferencia del resto de Color Studio (compartido entre miembros), cada referencia es de su dueño:
-- la RLS exige owner = auth.uid(), que pone la base (default), no el navegador.
-- ═══════════════════════════════════════════════

-- Paleta de una referencia: lista de 0 a 10 objetos con hex normalizado y peso entre 0 y 100
create or replace function public.cs_valid_inspiration_palette(c jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(c) = 'array'
     and jsonb_array_length(c) <= 10
     and not exists (
       select 1 from jsonb_array_elements(c) e
       where jsonb_typeof(e) <> 'object'
          or not public.cs_is_hex(e->>'hex')
          or jsonb_typeof(e->'weight') <> 'number'
          or (e->>'weight')::numeric < 0 or (e->>'weight')::numeric > 100
     )
$$;

create table if not exists public.cs_inspirations (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid() references auth.users on delete cascade,
  title          text check (char_length(title) <= 160),
  source_url     text check (source_url is null or (char_length(source_url) <= 1000 and source_url ~* '^https?://')),
  source_name    text check (char_length(source_name) <= 120),
  published_on   date,                                                                -- fecha de la publicación, si se conoce
  image_path     text unique check (char_length(image_path) <= 300),
  thumb_path     text unique check (char_length(thumb_path) <= 300),
  image_hash     text check (image_hash is null or image_hash ~ '^[0-9a-f]{16}$'),
  description    text check (char_length(description) <= 2000),
  notes          text check (char_length(notes) <= 4000),
  styles         text[] not null default '{}' check (cardinality(styles) <= 12),
  collections    text[] not null default '{}' check (cardinality(collections) <= 20),
  seasons        text[] not null default '{}' check (seasons <@ array['primavera', 'verano', 'otono', 'invierno', 'entretiempo']),
  rating         smallint check (rating between 1 and 5),
  is_favorite    boolean not null default false,
  palette        jsonb not null default '[]' check (public.cs_valid_inspiration_palette(palette)),
  palette_status text not null default 'none' check (palette_status in ('none', 'auto', 'reviewed', 'failed')),
  palette_id     uuid references public.cs_palettes on delete set null,              -- paleta creada en la Biblioteca desde esta referencia
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cs_inspirations_owner_idx on public.cs_inspirations (owner, created_at desc);

drop trigger if exists cs_inspirations_touch on public.cs_inspirations;
create trigger cs_inspirations_touch before update on public.cs_inspirations for each row execute function public.cs_touch();

-- ─── RLS: miembro del área privada Y dueño de la fila ───
alter table public.cs_inspirations enable row level security;
revoke all on public.cs_inspirations from anon;
drop policy if exists "cs_inspirations: leer"   on public.cs_inspirations;
drop policy if exists "cs_inspirations: crear"  on public.cs_inspirations;
drop policy if exists "cs_inspirations: editar" on public.cs_inspirations;
drop policy if exists "cs_inspirations: borrar" on public.cs_inspirations;
create policy "cs_inspirations: leer"   on public.cs_inspirations for select to authenticated
  using (public.is_member() and owner = (select auth.uid()));
create policy "cs_inspirations: crear"  on public.cs_inspirations for insert to authenticated
  with check (public.is_member() and owner = (select auth.uid()));
create policy "cs_inspirations: editar" on public.cs_inspirations for update to authenticated
  using (public.is_member() and owner = (select auth.uid())) with check (public.is_member() and owner = (select auth.uid()));
create policy "cs_inspirations: borrar" on public.cs_inspirations for delete to authenticated
  using (public.is_member() and owner = (select auth.uid()));

-- ─── FOTOS: mismo bucket privado «armario», carpeta inspiracion/<usuario>/ ───
-- Política RESTRICTIVA (se suma con AND a las de color-studio.sql): dentro de inspiracion/ solo se lee, sube
-- o borra en la carpeta propia. Fuera de esa carpeta, y en cualquier otro bucket, no cambia nada.
drop policy if exists "armario: inspiración solo de su dueño" on storage.objects;
create policy "armario: inspiración solo de su dueño" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'armario' or (storage.foldername(name))[1] is distinct from 'inspiracion'
         or (storage.foldername(name))[2] = (select auth.uid())::text)
  with check (bucket_id <> 'armario' or (storage.foldername(name))[1] is distinct from 'inspiracion'
         or (storage.foldername(name))[2] = (select auth.uid())::text);

-- ─── Clasificación inicial (editable en «Configuración») ───
-- «Inspiración de temporada» no es un estilo: la temporada va en su propio campo.
insert into public.ap_opciones (grupo, valor, posicion)
select 'inspiracion.estilo', v, ord from unnest(array['Casual', 'Smart casual', 'Formal', 'Minimalista', 'Streetwear', 'Workwear', 'Deportivo']) with ordinality as t(v, ord)
on conflict do nothing;
