-- ═══════════════════════════════════════════════
-- supabase/color-studio-inspiracion.sql: Color Studio · Inspiración (outfits guardados de internet)
-- ───────────────────────────────────────────────
-- Requiere area-privada.sql (is_member), color-studio.sql (cs_is_hex, cs_touch, cs_palettes, bucket «armario»)
-- y opciones.sql (ap_opciones). Se ejecuta en Supabase → SQL Editor. Es idempotente y no toca datos existentes:
-- volver a ejecutarlo entero es seguro (así se aplican las versiones nuevas, como la del cuentagotas).
-- Versión 2 (cuentagotas): columna «suggestions» y paleta con colores elegidos a mano (peso opcional, id y etiqueta).
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
--   palette (jsonb)  → paleta DEFINITIVA, en orden: [{ id, hex, source, label?, weight? }]. source = 'manual'
--                     (cuentagotas o escrito a mano) | 'auto' (sugerencia aceptada). weight = % estimado de presencia
--                     en los píxeles analizados (0–100), solo en colores que vienen de la extracción.
--                     Las paletas guardadas antes ([{ hex, weight, source }]) siguen siendo válidas tal cual.
--   suggestions      → candidatos de la extracción automática SIN aceptar: [{ hex, weight }]. Nunca se mezclan con palette.
--                     RGB, Lab y familia se derivan del HEX (color-studio/engine.js): no se guardan.
--   palette_status   → none (sin imagen o sin extraer) · auto (hay colores pero ninguna decisión) · reviewed (paleta
--                     confirmada o con colores elegidos a mano) · failed (la extracción falló; la referencia se guarda igual).
--   image_hash       → huella perceptual (dHash de 64 bits) para avisar de duplicados; no identifica a nadie.
-- A diferencia del resto de Color Studio (compartido entre miembros), cada referencia es de su dueño:
-- la RLS exige owner = auth.uid(), que pone la base (default), no el navegador.
-- ═══════════════════════════════════════════════

-- Paleta de una referencia: 0 a 12 objetos con hex normalizado; peso opcional entre 0 y 100; etiqueta ≤ 60; id ≤ 40
create or replace function public.cs_valid_inspiration_palette(c jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(c) = 'array'
     and jsonb_array_length(c) <= 12
     and not exists (
       select 1 from jsonb_array_elements(c) e
       where jsonb_typeof(e) <> 'object'
          or not coalesce(public.cs_is_hex(e->>'hex'), false)
          or (e ? 'weight' and (jsonb_typeof(e->'weight') <> 'number' or (e->>'weight')::numeric < 0 or (e->>'weight')::numeric > 100))
          or (e ? 'label' and (jsonb_typeof(e->'label') <> 'string' or char_length(e->>'label') > 60))
          or (e ? 'id' and (jsonb_typeof(e->'id') <> 'string' or char_length(e->>'id') > 40))
          or (e ? 'source' and coalesce(e->>'source', '') not in ('manual', 'auto'))
     )
$$;

-- Sugerencias automáticas: 0 a 8 objetos con hex normalizado y peso entre 0 y 100
-- (coalesce: sin él, un campo que falta da null y el «not exists» lo dejaba pasar)
create or replace function public.cs_valid_inspiration_suggestions(c jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(c) = 'array'
     and jsonb_array_length(c) <= 8
     and not exists (
       select 1 from jsonb_array_elements(c) e
       where jsonb_typeof(e) <> 'object'
          or not coalesce(public.cs_is_hex(e->>'hex'), false)
          or coalesce(jsonb_typeof(e->'weight'), '') <> 'number'
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

-- v2 (cuentagotas): sugerencias aparte de la paleta. Las referencias existentes empiezan sin sugerencias; su paleta no cambia.
alter table public.cs_inspirations add column if not exists suggestions jsonb not null default '[]';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cs_inspirations_suggestions_check') then
    alter table public.cs_inspirations add constraint cs_inspirations_suggestions_check check (public.cs_valid_inspiration_suggestions(suggestions));
  end if;
end $$;

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
-- Solo si la lista está vacía: volver a ejecutar el archivo no recupera estilos que hayas borrado.
insert into public.ap_opciones (grupo, valor, posicion)
select 'inspiracion.estilo', v, ord from unnest(array['Casual', 'Smart casual', 'Formal', 'Minimalista', 'Streetwear', 'Workwear', 'Deportivo']) with ordinality as t(v, ord)
where not exists (select 1 from public.ap_opciones where grupo = 'inspiracion.estilo')
on conflict do nothing;
