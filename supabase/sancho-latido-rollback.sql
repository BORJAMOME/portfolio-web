-- Revierte sancho-latido.sql: quita la función, las políticas y las dos tablas del latido.
-- Ejecutar ANTES que sancho-acceso-rollback.sql (las políticas usan is_sancho()).
drop function if exists public.sancho_minutos_sin_latido(text);
drop table if exists public.sancho_latido;
drop table if exists public.sancho_vigilancia;
