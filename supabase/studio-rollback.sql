-- Revierte supabase/studio.sql. DESTRUCTIVO: borra todos los proyectos, tareas, ajustes y actividad del Studio.
-- No toca el Centro de trabajo (kb_*) ni ninguna otra tabla.
drop table if exists public.ps_activity, public.ps_tasks, public.ps_projects, public.ps_settings cascade;
drop function if exists public.ps_tasks_before();
drop function if exists public.ps_tasks_after_insert();
drop function if exists public.ps_projects_log();
