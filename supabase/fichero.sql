-- ═══════════════════════════════════════════════
-- supabase/fichero.sql — tabla del Fichero (pestaña «Fichero» del área privada)
-- ───────────────────────────────────────────────
-- Requiere haber ejecutado antes supabase/area-privada.sql (usa public.is_member()).
-- Se ejecuta UNA vez en Supabase → SQL Editor → New query → pegar → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- Después, para cargar los recursos iniciales: supabase/fichero-datos.sql.
--
-- Cada fila es un enlace guardado. url_key es la URL normalizada (sin protocolo,
-- www, barra final ni parámetros de seguimiento): la calcula la página y es única,
-- así que la base no admite dos veces el mismo recurso.
-- ═══════════════════════════════════════════════

create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 300),
  url         text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  url_key     text not null unique check (char_length(url_key) between 3 and 2000),
  topics      text[] not null default '{}',
  type        text check (char_length(type) <= 60),
  tags        text[] not null default '{}',
  author      text check (char_length(author) <= 120),
  note        text check (char_length(note) <= 2000),
  description text check (char_length(description) <= 600),
  rating      smallint check (rating between 1 and 5),
  lang        text check (char_length(lang) <= 5),
  saved_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users on delete set null
);
create index if not exists links_saved_idx on public.links (saved_at desc);

create or replace function public.links_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists links_touch on public.links;
create trigger links_touch before update on public.links
  for each row execute function public.links_touch();

alter table public.links enable row level security;
revoke all on public.links from anon;

drop policy if exists "links: leer"   on public.links;
drop policy if exists "links: crear"  on public.links;
drop policy if exists "links: editar" on public.links;
drop policy if exists "links: borrar" on public.links;
create policy "links: leer"   on public.links for select to authenticated using (public.is_member());
create policy "links: crear"  on public.links for insert to authenticated with check (public.is_member());
create policy "links: editar" on public.links for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "links: borrar" on public.links for delete to authenticated using (public.is_member());
