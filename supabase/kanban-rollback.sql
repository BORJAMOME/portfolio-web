-- Revierte supabase/kanban.sql. DESTRUCTIVO: borra todas las tarjetas, proyectos e historial.
drop table if exists public.kb_historial, public.kb_subtareas, public.kb_tarjetas, public.kb_proyectos, public.kb_ajustes cascade;
drop function if exists public.kb_tarjetas_before();
drop function if exists public.kb_tarjetas_log_insert();
