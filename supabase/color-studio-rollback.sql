-- Revierte supabase/color-studio.sql. DESTRUCTIVO: borra prendas, paletas, outfits y las políticas del bucket «armario».
-- Las fotos del bucket hay que vaciarlas antes desde Storage → armario → Empty bucket (Supabase no deja borrar objetos con SQL).
-- No toca ninguna otra tabla del área privada.
drop table if exists public.cs_outfits, public.cs_palettes, public.cs_garments cascade;
drop function if exists public.cs_garments_before();
drop function if exists public.cs_touch();
drop function if exists public.cs_valid_outfit_items(jsonb);
drop function if exists public.cs_valid_palette_colors(jsonb);
drop function if exists public.cs_is_hex(text);
drop policy if exists "armario: leer"   on storage.objects;
drop policy if exists "armario: subir"  on storage.objects;
drop policy if exists "armario: borrar" on storage.objects;
delete from storage.buckets where id = 'armario';
