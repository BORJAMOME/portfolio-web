-- ═══════════════════════════════════════════════════════════════════════════
-- SANCHO · latido para la vigilancia externa
-- Requiere sancho-acceso.sql (función is_sancho). Se ejecuta en Supabase → SQL Editor.
-- Es idempotente. Revertir con sancho-latido-rollback.sql.
--
-- Qué hace:
--   · Tabla `sancho_latido`: una sola fila que SANCHO actualiza cada 15 min.
--   · Tabla `sancho_vigilancia`: el hash SHA-256 de la clave de la vigilancia. Nunca la clave.
--   · Función `sancho_minutos_sin_latido(clave)`: minutos desde el último latido, solo con
--     la clave correcta. La usa el flujo «Vigilancia» del repo de SANCHO para avisar si cae.
--     Sin clave no se puede saber cuándo está encendido el PC (este repo es público).
--
-- Después de ejecutarlo (una vez, en tu PC; la clave no pasa por el SQL Editor):
--   1. uv run python -c "import secrets,hashlib;k=secrets.token_hex(32);print('clave:',k);print('hash:',hashlib.sha256(k.encode()).hexdigest())"
--   2. En el SQL Editor:  insert into public.sancho_vigilancia (clave_hash) values ('<hash>');
--   3. En GitHub (repo sancho → Settings → Secrets and variables → Actions):
--      secreto SANCHO_VIGILANCIA_CLAVE = <clave>; variables SANCHO_SUPABASE_URL y
--      SANCHO_SUPABASE_KEY (la clave publicable).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.sancho_latido (
  id        smallint primary key default 1 check (id = 1),
  visto_en  timestamptz not null default now(),
  version   text check (version is null or char_length(version) <= 20)
);
alter table public.sancho_latido enable row level security;

-- El agente escribe y lee su fila (el upsert necesita las tres); Borja la puede consultar.
drop policy if exists "sancho: latido leer" on public.sancho_latido;
drop policy if exists "sancho: latido crear" on public.sancho_latido;
drop policy if exists "sancho: latido editar" on public.sancho_latido;
drop policy if exists "miembros: latido leer" on public.sancho_latido;
create policy "sancho: latido leer" on public.sancho_latido
  for select to authenticated using (public.is_sancho());
create policy "sancho: latido crear" on public.sancho_latido
  for insert to authenticated with check (public.is_sancho());
create policy "sancho: latido editar" on public.sancho_latido
  for update to authenticated using (public.is_sancho()) with check (public.is_sancho());
create policy "miembros: latido leer" on public.sancho_latido
  for select to authenticated using (public.is_member());

create table if not exists public.sancho_vigilancia (
  clave_hash text primary key check (clave_hash ~ '^[0-9a-f]{64}$')
);
alter table public.sancho_vigilancia enable row level security;
-- Sin políticas: nadie la lee ni la cambia por la API. Solo la usa la función de abajo.

create or replace function public.sancho_minutos_sin_latido(clave text) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  ultimo timestamptz;
begin
  if clave is null or not exists (
    select 1 from public.sancho_vigilancia
    where clave_hash = pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(clave, 'UTF8')), 'hex')
  ) then
    raise exception 'clave no válida' using errcode = '28000';
  end if;
  select visto_en into ultimo from public.sancho_latido where id = 1;
  if ultimo is null then
    return null;  -- SANCHO aún no ha enviado ningún latido
  end if;
  return floor(extract(epoch from (now() - ultimo)) / 60)::integer;
end $$;
revoke execute on function public.sancho_minutos_sin_latido(text) from public;
grant  execute on function public.sancho_minutos_sin_latido(text) to anon, authenticated;
