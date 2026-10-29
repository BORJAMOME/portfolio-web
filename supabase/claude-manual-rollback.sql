-- Revierte supabase/claude-manual.sql. Borra el contenido del Manual de Claude de la base (el motor y la semilla siguen en el repo;
-- el contenido de los cursos solo existe además en tu carpeta local .claude-academy/, si la mantienes).
drop table if exists public.cm_docs;
