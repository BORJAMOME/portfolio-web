-- ═══════════════════════════════════════════════
-- supabase/keepalive.sql — «latido» para que Supabase no pause el proyecto
-- ───────────────────────────────────────────────
-- Los proyectos del plan gratuito se pausan tras 7 días sin actividad. La Action
-- .github/workflows/supabase-keepalive.yml llama a esta función dos veces por semana
-- desde fuera (API REST → PostgreSQL), que es actividad real del proyecto.
--
-- La función no lee ni escribe ninguna tabla: solo devuelve la hora del servidor.
-- Por eso puede llamarla la clave pública (anon) sin exponer ningún dato.
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
-- ═══════════════════════════════════════════════

create or replace function public.keepalive()
returns timestamptz
language sql stable security invoker set search_path = '' as $$
  select now()
$$;

revoke execute on function public.keepalive() from public;
grant  execute on function public.keepalive() to anon, authenticated;

comment on function public.keepalive() is
  'Latido para evitar la pausa por inactividad del plan gratuito. Lo llama .github/workflows/supabase-keepalive.yml.';
