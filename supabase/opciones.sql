-- ═══════════════════════════════════════════════
-- supabase/opciones.sql — listas configurables del área privada (pestaña «Configuración»)
-- ───────────────────────────────────────────────
-- Requiere area-privada.sql (is_member) y fichero.sql (public.links).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
--
-- Una sola tabla para todas las listas de opciones, separadas por «grupo»:
--   fichero.tema     → temas del Fichero    (links.topics, text[])
--   fichero.formato  → formatos del Fichero (links.type, text)
--   portfolio.tipo   → tipos de la pestaña Portfolio (portfolio.tipo, text; ver portfolio.sql)
--   agenda.categoria → categorías del Calendario (agenda.categoria, text; ver agenda.sql)
-- Un grupo nuevo no necesita cambiar la base: basta con insertar filas con ese grupo
-- y enseñarlo en la página.
--
-- Los enlaces guardan el texto de la opción, no un id. Por eso renombrar y eliminar
-- se hacen con las funciones de abajo, que actualizan la lista Y los enlaces en la
-- misma transacción: las dos cosas nunca quedan desincronizadas.
-- ═══════════════════════════════════════════════

create table if not exists public.ap_opciones (
  id         uuid primary key default gen_random_uuid(),
  grupo      text not null check (grupo ~ '^[a-z]+\.[a-z_]+$'),
  valor      text not null check (char_length(valor) between 1 and 60 and valor = btrim(valor)),
  posicion   integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists ap_opciones_unica on public.ap_opciones (grupo, lower(valor));

alter table public.ap_opciones enable row level security;
revoke all on public.ap_opciones from anon;
drop policy if exists "ap_opciones: leer"   on public.ap_opciones;
drop policy if exists "ap_opciones: crear"  on public.ap_opciones;
drop policy if exists "ap_opciones: editar" on public.ap_opciones;
drop policy if exists "ap_opciones: borrar" on public.ap_opciones;
create policy "ap_opciones: leer"   on public.ap_opciones for select to authenticated using (public.is_member());
create policy "ap_opciones: crear"  on public.ap_opciones for insert to authenticated with check (public.is_member());
create policy "ap_opciones: editar" on public.ap_opciones for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "ap_opciones: borrar" on public.ap_opciones for delete to authenticated using (public.is_member());

-- ─── Renombrar: la opción y todos los enlaces que la usan ───
-- security invoker (por defecto): corre con los permisos de quien llama, así que la RLS aplica.
create or replace function public.ap_opcion_renombrar(p_id uuid, p_nuevo text)
returns integer
language plpgsql set search_path = '' as $$
declare
  o public.ap_opciones;
  nuevo text := btrim(p_nuevo);
  n integer := 0;
begin
  select * into o from public.ap_opciones where id = p_id;
  if not found then raise exception 'La opción no existe'; end if;
  if nuevo = o.valor then return 0; end if;
  update public.ap_opciones set valor = nuevo where id = p_id;     -- el índice único avisa si ya existe
  if o.grupo = 'fichero.tema' then
    -- array_replace y quitar duplicados por si el enlace ya tenía el nombre nuevo
    update public.links
       set topics = (select array_agg(distinct t) from unnest(array_replace(topics, o.valor, nuevo)) t)
     where o.valor = any (topics);
    get diagnostics n = row_count;
  elsif o.grupo = 'fichero.formato' then
    update public.links set type = nuevo where type = o.valor;
    get diagnostics n = row_count;
  elsif o.grupo = 'portfolio.tipo' then
    update public.portfolio set tipo = nuevo where tipo = o.valor;
    get diagnostics n = row_count;
  elsif o.grupo = 'agenda.categoria' then
    update public.agenda set categoria = nuevo where categoria = o.valor;
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

-- ─── Eliminar: la opción y su uso en los enlaces (los enlaces no se borran) ───
create or replace function public.ap_opcion_eliminar(p_id uuid)
returns integer
language plpgsql set search_path = '' as $$
declare
  o public.ap_opciones;
  n integer := 0;
begin
  select * into o from public.ap_opciones where id = p_id;
  if not found then return 0; end if;
  if o.grupo = 'fichero.tema' then
    update public.links set topics = array_remove(topics, o.valor) where o.valor = any (topics);
    get diagnostics n = row_count;
  elsif o.grupo = 'fichero.formato' then
    update public.links set type = null where type = o.valor;
    get diagnostics n = row_count;
  elsif o.grupo = 'portfolio.tipo' then
    update public.portfolio set tipo = null where tipo = o.valor;
    get diagnostics n = row_count;
  elsif o.grupo = 'agenda.categoria' then
    update public.agenda set categoria = null where categoria = o.valor;
    get diagnostics n = row_count;
  end if;
  delete from public.ap_opciones where id = p_id;
  return n;
end $$;

revoke execute on function public.ap_opcion_renombrar(uuid, text) from public, anon;
revoke execute on function public.ap_opcion_eliminar(uuid)       from public, anon;
grant  execute on function public.ap_opcion_renombrar(uuid, text) to authenticated;
grant  execute on function public.ap_opcion_eliminar(uuid)       to authenticated;

-- ─── Carga inicial: lo que antes estaba escrito en area-privada-fichero.js ───
-- más cualquier valor que ya usen los enlaces (para no dejar nada fuera de la lista).
insert into public.ap_opciones (grupo, valor, posicion)
select 'fichero.tema', v, ord from unnest(array['Visualización', 'Ejemplos', 'Power BI', 'Datos abiertos', 'Gente']) with ordinality as t(v, ord)
on conflict do nothing;
insert into public.ap_opciones (grupo, valor, posicion)
select 'fichero.formato', v, ord from unnest(array['Artículo', 'Ejemplo', 'Guía', 'Catálogo', 'Herramienta', 'Portal de datos', 'Blog o canal', 'Portfolio', 'Perfil']) with ordinality as t(v, ord)
on conflict do nothing;
insert into public.ap_opciones (grupo, valor, posicion)
select distinct 'fichero.tema', btrim(t), 100 from public.links, unnest(topics) t where btrim(t) <> ''
on conflict do nothing;
insert into public.ap_opciones (grupo, valor, posicion)
select distinct 'fichero.formato', btrim(type), 100 from public.links where type is not null and btrim(type) <> ''
on conflict do nothing;
