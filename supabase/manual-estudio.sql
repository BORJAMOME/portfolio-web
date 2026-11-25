-- ═══════════════════════════════════════════════
-- supabase/manual-estudio.sql: contenido del «Manual de estudio» (área privada → Portfolio → Manuales privados)
-- ───────────────────────────────────────────────
-- Requiere haber ejecutado antes supabase/area-privada.sql (usa public.is_member()) y entrevistas.sql (touch_updated_at).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
--
-- Por qué en la base y no en el repositorio: el repositorio y GitHub Pages son públicos. El motor (area-privada-estudio.js)
-- no contiene contenido ni título: todo lo que se lee (título, capítulos, glosario, indicadores) vive aquí y solo lo lee
-- un miembro con sesión. El contenido de origen está en una carpeta local fuera del repositorio.
--
-- me_docs  un documento por fila: kind = meta | block | topic | chunk | gloss | fam | indic, y para el glosario completo
--          gconf | gfam | gsig | gterm | gvis (en bases ya creadas: manual-estudio-glosario.sql); data = el objeto;
--          pos = orden de aparición. id = «<kind>:<id estable>». Un capítulo largo se guarda en varias filas «chunk»
--          (un apartado de primer nivel por fila) para no pasar del límite de tamaño de cada documento.
-- Lo escribe tools/manual-estudio/publish.mjs con TU sesión (sin la clave service_role). Lo lee area-privada-estudio.js.
-- Revertir: manual-estudio-rollback.sql
-- ═══════════════════════════════════════════════

create table if not exists public.me_docs (
  id         text primary key check (id ~ '^(meta|block|topic|chunk|gloss|fam|indic|gconf|gfam|gsig|gterm|gvis):[A-Za-z0-9._:-]{1,160}$'),
  kind       text not null check (kind in ('meta', 'block', 'topic', 'chunk', 'gloss', 'fam', 'indic', 'gconf', 'gfam', 'gsig', 'gterm', 'gvis')),
  pos        integer not null default 0,
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 400000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null,
  check (split_part(id, ':', 1) = kind)
);
create index if not exists me_docs_kind_pos_idx on public.me_docs (kind, pos);

drop trigger if exists me_docs_touch on public.me_docs;
create trigger me_docs_touch before update on public.me_docs
  for each row execute function public.touch_updated_at();   -- definida en entrevistas.sql

alter table public.me_docs enable row level security;
revoke all on public.me_docs from anon;
drop policy if exists "me_docs: leer"   on public.me_docs;
drop policy if exists "me_docs: crear"  on public.me_docs;
drop policy if exists "me_docs: editar" on public.me_docs;
drop policy if exists "me_docs: borrar" on public.me_docs;
create policy "me_docs: leer"   on public.me_docs for select to authenticated using (public.is_member());
create policy "me_docs: crear"  on public.me_docs for insert to authenticated with check (public.is_member());
create policy "me_docs: editar" on public.me_docs for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "me_docs: borrar" on public.me_docs for delete to authenticated using (public.is_member());
