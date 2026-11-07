-- Revierte supabase/kanban-dependencias.sql. Borra solo las dependencias; las tarjetas quedan intactas.
drop table if exists public.kb_dependencias cascade;
drop function if exists public.kb_dependencias_sin_ciclos();
