-- Revierte supabase/studio-ideas.sql. DESTRUCTIVO: borra todas las ideas, notas y entregables del Studio.
-- No toca proyectos ni tareas (studio.sql) ni el Centro de trabajo (kb_*).
drop function if exists public.ps_convert_idea(uuid);
drop table if exists public.ps_deliverables, public.ps_notes, public.ps_ideas cascade;
drop function if exists public.ps_ideas_log();
