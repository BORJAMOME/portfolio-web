-- Reversión de supabase/color-studio-contexto.sql (DESTRUCTIVA: borra el registro de uso y las temporadas y formalidad de las prendas).
drop table if exists public.cs_wear;
alter table public.cs_garments drop constraint if exists cs_garments_seasons_check;
alter table public.cs_garments drop constraint if exists cs_garments_formality_check;
alter table public.cs_garments drop column if exists seasons;
alter table public.cs_garments drop column if exists formality;
