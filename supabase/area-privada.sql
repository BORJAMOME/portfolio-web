-- ═══════════════════════════════════════════════
-- supabase/area-privada.sql — base de datos del área privada (area-privada.html)
-- ───────────────────────────────────────────────
-- Se ejecuta UNA vez en Supabase → SQL Editor → New query → pegar → Run.
-- Es idempotente en lo posible: se puede volver a ejecutar sin romper nada.
--
-- Modelo: un único árbol de elementos, como un drive con notas.
--   folder → carpeta (puede contener cualquier cosa)
--   note   → nota en Markdown (campo body)
--   file   → archivo subido al bucket privado «recursos» (campo file_path)
--
-- Seguridad: el HTML de la página es público, los datos no. Cada fila y cada
-- archivo pasan por Row Level Security: solo un usuario autenticado que esté en
-- public.members puede leer o escribir. Sin sesión no se recibe nada.
-- ═══════════════════════════════════════════════

-- ─── MIEMBROS ───
-- Quién puede entrar. Se rellena a mano desde el SQL Editor (ver final del archivo);
-- no hay ninguna política de escritura: nadie se da permisos desde la web.
create table if not exists public.members (
  user_id    uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;

drop policy if exists "members: ver mi fila" on public.members;
create policy "members: ver mi fila" on public.members
  for select to authenticated using (user_id = (select auth.uid()));

-- security definer: consulta members sin pasar por su propia RLS (evita recursión)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where user_id = (select auth.uid()))
$$;
revoke execute on function public.is_member() from public, anon;
grant  execute on function public.is_member() to authenticated;

-- ─── ELEMENTOS ───
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.items(id) on delete cascade,
  kind       text not null check (kind in ('folder', 'note', 'file')),
  title      text not null check (char_length(title) between 1 and 200),
  body       text not null default '' check (char_length(body) <= 200000),
  file_path  text unique,
  mime       text,
  size_bytes bigint check (size_bytes >= 0),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search     tsvector generated always as (
    setweight(to_tsvector('spanish', title), 'A') ||
    setweight(to_tsvector('spanish', body), 'B')
  ) stored,
  constraint items_file_fields check ((kind = 'file') = (file_path is not null)),
  constraint items_not_own_parent check (parent_id is distinct from id)
);
create index if not exists items_parent_idx on public.items (parent_id);
create index if not exists items_search_idx on public.items using gin (search);

-- updated_at automático y el padre tiene que ser una carpeta
create or replace function public.items_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.items where id = new.parent_id and kind = 'folder'
  ) then
    raise exception 'El elemento padre tiene que ser una carpeta';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists items_before_write on public.items;
create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();

alter table public.items enable row level security;
revoke all on public.items from anon;

drop policy if exists "items: leer"    on public.items;
drop policy if exists "items: crear"   on public.items;
drop policy if exists "items: editar"  on public.items;
drop policy if exists "items: borrar"  on public.items;
create policy "items: leer"   on public.items for select to authenticated using (public.is_member());
create policy "items: crear"  on public.items for insert to authenticated with check (public.is_member());
create policy "items: editar" on public.items for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "items: borrar" on public.items for delete to authenticated using (public.is_member());

-- Migas de pan: antepasados de un elemento, de la raíz hacia abajo (respeta RLS)
create or replace function public.item_ancestors(target uuid)
returns table (id uuid, title text)
language sql stable set search_path = '' as $$
  with recursive up as (
    select i.id, i.parent_id, i.title, 0 as depth from public.items i where i.id = target
    union all
    select p.id, p.parent_id, p.title, up.depth + 1
    from public.items p join up on p.id = up.parent_id
  )
  select up.id, up.title from up order by depth desc
$$;

-- Rutas de los archivos que cuelgan de un elemento (para borrarlos del bucket al borrar una carpeta)
create or replace function public.item_subtree_files(root uuid)
returns setof text
language sql stable set search_path = '' as $$
  with recursive down as (
    select i.id, i.file_path from public.items i where i.id = root
    union all
    select c.id, c.file_path from public.items c join down on c.parent_id = down.id
  )
  select file_path from down where file_path is not null
$$;
revoke execute on function public.item_ancestors(uuid)     from public, anon;
revoke execute on function public.item_subtree_files(uuid) from public, anon;
grant  execute on function public.item_ancestors(uuid)     to authenticated;
grant  execute on function public.item_subtree_files(uuid) to authenticated;

-- ─── ARCHIVOS (Storage) ───
-- Bucket privado: no hay URL pública. La página descarga cada archivo con la sesión.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recursos', 'recursos', false, 52428800,   -- 50 MB: el máximo del plan gratuito
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'text/plain', 'text/markdown', 'text/csv',
    'application/json',
    'application/zip', 'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream'                     -- .pbix y otros sin tipo propio
  ])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recursos: leer"   on storage.objects;
drop policy if exists "recursos: subir"  on storage.objects;
drop policy if exists "recursos: borrar" on storage.objects;
create policy "recursos: leer"   on storage.objects for select to authenticated
  using (bucket_id = 'recursos' and public.is_member());
create policy "recursos: subir"  on storage.objects for insert to authenticated
  with check (bucket_id = 'recursos' and public.is_member());
create policy "recursos: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'recursos' and public.is_member());

-- ─── ALTA DEL USUARIO ───
-- 1. Authentication → Users → Add user → Create new user
--    (tu email + una contraseña larga, «Auto Confirm User» marcado).
-- 2. Ejecuta esta línea con tu email:
--
-- insert into public.members (user_id)
--   select id from auth.users where email = 'borja.mora.mendez@gmail.com'
--   on conflict do nothing;
