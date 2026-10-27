-- Revierte supabase/color-studio-inspiracion.sql. DESTRUCTIVO: borra todas las referencias de Inspiración.
-- Las fotos hay que borrarlas antes desde Storage → armario → carpeta «inspiracion» (Supabase no deja borrar objetos con SQL).
-- No toca prendas, paletas ni outfits. Las ramas de opciones.sql que mencionan cs_inspirations no fallan sin la tabla
-- (solo se ejecutan con los grupos inspiracion.*), y las opciones de esos grupos se quitan aquí.
drop table if exists public.cs_inspirations cascade;
drop function if exists public.cs_valid_inspiration_palette(jsonb);
drop function if exists public.cs_valid_inspiration_suggestions(jsonb);
drop policy if exists "armario: inspiración solo de su dueño" on storage.objects;
delete from public.ap_opciones where grupo in ('inspiracion.estilo', 'inspiracion.coleccion');
