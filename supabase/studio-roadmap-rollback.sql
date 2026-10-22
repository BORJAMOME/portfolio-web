-- Revierte supabase/studio-roadmap.sql. DESTRUCTIVO: borra todos los hitos y las relaciones del Studio.
-- No toca proyectos, tareas, ideas, notas ni entregables.
drop trigger if exists ps_links_cleanup on public.ps_projects;
drop trigger if exists ps_links_cleanup on public.ps_ideas;
drop table if exists public.ps_links, public.ps_milestones cascade;
drop function if exists public.ps_links_cleanup();
drop function if exists public.ps_links_before();
drop function if exists public.ps_milestones_before();
drop function if exists public.ps_entity_exists(text, uuid);
