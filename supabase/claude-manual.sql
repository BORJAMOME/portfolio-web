-- ═══════════════════════════════════════════════
-- supabase/claude-manual.sql: contenido del «Manual de Claude» (área privada → Portfolio → Manual de Claude)
-- ───────────────────────────────────────────────
-- Requiere haber ejecutado antes supabase/area-privada.sql (usa public.is_member()) y entrevistas.sql (touch_updated_at).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
--
-- Por qué en la base y no en el repositorio: el repositorio y GitHub Pages son públicos. El motor del manual (claude-manual/)
-- no contiene contenido; las fichas, los cursos, el glosario y el registro viven aquí y solo los lee un miembro con sesión.
--
-- cm_docs  un documento por fila: kind = block | topic | course | gloss | log; data = el objeto tal como lo define
--          claude-manual/seed/content.js; pos = orden de aparición. id = «<kind>:<id estable>».
-- Lo escribe tools/claude-academy/publish.mjs con TU sesión (sin la clave service_role). Lo lee area-privada-claude.js.
-- Revertir: claude-manual-rollback.sql
-- ═══════════════════════════════════════════════

create table if not exists public.cm_docs (
  id         text primary key check (id ~ '^(block|topic|course|gloss|log):[A-Za-z0-9._:-]{1,120}$'),
  kind       text not null check (kind in ('block', 'topic', 'course', 'gloss', 'log')),
  pos        integer not null default 0,
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null,
  check (split_part(id, ':', 1) = kind)
);
create index if not exists cm_docs_kind_pos_idx on public.cm_docs (kind, pos);

drop trigger if exists cm_docs_touch on public.cm_docs;
create trigger cm_docs_touch before update on public.cm_docs
  for each row execute function public.touch_updated_at();   -- definida en entrevistas.sql

alter table public.cm_docs enable row level security;
revoke all on public.cm_docs from anon;
drop policy if exists "cm_docs: leer"   on public.cm_docs;
drop policy if exists "cm_docs: crear"  on public.cm_docs;
drop policy if exists "cm_docs: editar" on public.cm_docs;
drop policy if exists "cm_docs: borrar" on public.cm_docs;
create policy "cm_docs: leer"   on public.cm_docs for select to authenticated using (public.is_member());
create policy "cm_docs: crear"  on public.cm_docs for insert to authenticated with check (public.is_member());
create policy "cm_docs: editar" on public.cm_docs for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "cm_docs: borrar" on public.cm_docs for delete to authenticated using (public.is_member());
